import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";
import { transitionOpportunity } from "./transitionOpportunity";

export const opportunitiesRouter = Router();
opportunitiesRouter.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  stage: z
    .enum(["PROSPECT", "LEAD", "PROPOSAL", "WON", "LOST", "NO_REPLY", "DEFERRED"])
    .optional(),
  q: z.string().optional(),
});

const transitionBodySchema = z.object({
  toStage: z.enum(["PROSPECT", "LEAD", "PROPOSAL", "WON", "LOST", "NO_REPLY", "DEFERRED"]),
  reason: z.string().min(1),
  amount: z.number().positive().optional(),
  revisitAt: z.string().datetime().optional(),
  lostReason: z.string().optional(),
});

const createBodySchema = z.object({
  title: z.string().min(1),
  organizationId: z.string().uuid(),
  departmentId: z.string().uuid(),
  service: z.string().min(1),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  ownerId: z.string().uuid().optional(),
});

const reassignBodySchema = z.object({
  newOwnerId: z.string().uuid(),
  note: z.string().min(1),
});

// List with optional ?stage= and ?q= filters, always inside the caller's
// data scope (BR-012). Moving the stage filter to the API lets the web app
// and mobile app stop filtering the full list client-side.
opportunitiesRouter.get("/", async (req: AuthedRequest, res) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: query.error.message },
    });
  }

  const { stage, q } = query.data;
  const opps = await prisma.opportunity.findMany({
    where: {
      ...opportunityScope(req.user),
      ...(stage ? { stage } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { organization: true, department: true, owner: { select: { id: true, name: true } } },
    orderBy: { stageEnteredAt: "desc" },
  });
  res.json({ success: true, data: opps });
});

// Opportunity detail — the screen behind every transition/reassignment/
// note action. Includes the full related context the UI needs in one call.
opportunitiesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: params.error.message },
    });
  }

  const opp = await prisma.opportunity.findFirst({
    where: {
      id: params.data.id,
      ...opportunityScope(req.user),
    },
    include: {
      organization: true,
      department: true,
      owner: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      notes: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      stageHistory: { orderBy: { changedAt: "desc" } },
      followups: { orderBy: { dueAt: "asc" } },
    },
  });

  if (!opp) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." },
    });
  }

  res.json({ success: true, data: opp });
});

// Create a Lead against an existing organization + department — BR-003
// makes the service being offered mandatory at creation.
opportunitiesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  const opp = await prisma.opportunity.create({
    data: {
      title: parsed.data.title,
      organizationId: parsed.data.organizationId,
      departmentId: parsed.data.departmentId,
      service: parsed.data.service,
      stage: "LEAD",
      amount: parsed.data.amount ?? null,
      currency: parsed.data.currency ?? "KES",
      createdById: req.user!.id,
      ownerId: parsed.data.ownerId ?? req.user!.id,
      stageEnteredAt: new Date(),
    },
    include: { organization: true, department: true },
  });

  res.status(201).json({ success: true, data: opp });
});

opportunitiesRouter.post("/:id/transition", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = transitionBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  try {
    const result = await transitionOpportunity({
      opportunityId: params.data.id,
      toStage: body.data.toStage,
      changedById: req.user!.id,
      reason: body.data.reason,
      amount: body.data.amount,
      revisitAt: body.data.revisitAt ? new Date(body.data.revisitAt) : undefined,
      lostReason: body.data.lostReason,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: "TRANSITION_REJECTED", message: err.message } });
  }
});

// Reassignment — its own kind of decision, tracked as a Note (not a
// StageHistoryEntry, since the stage itself isn't changing here, only
// ownership).
opportunitiesRouter.post("/:id/reassign", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = reassignBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const opp = await tx.opportunity.update({
      where: { id: params.data.id },
      data: { ownerId: body.data.newOwnerId },
    });
    await tx.note.create({
      data: {
        body: body.data.note.trim(),
        authorId: req.user!.id,
        opportunityId: opp.id,
      },
    });
    return opp;
  });
  res.json({ success: true, data: updated });
});