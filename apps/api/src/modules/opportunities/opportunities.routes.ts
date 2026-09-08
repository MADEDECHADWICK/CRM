import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";
import { transitionOpportunity } from "./transitionOpportunity";

export const opportunitiesRouter = Router();
opportunitiesRouter.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

const transitionBodySchema = z.object({
  toStage: z.enum(["PROSPECT", "LEAD", "PROPOSAL", "WON", "LOST", "NO_REPLY", "DEFERRED"]),
  reason: z.string().min(1),
  amount: z.number().positive().optional(),
  revisitAt: z.string().datetime().optional(),
});

const reassignBodySchema = z.object({
  newOwnerId: z.string().uuid(),
  note: z.string().min(1),
});

opportunitiesRouter.get("/", async (req: AuthedRequest, res) => {
  const opps = await prisma.opportunity.findMany({
    where: opportunityScope(req.user),
    include: { organization: true, department: true },
  });
  res.json({ success: true, data: opps });
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
        content: body.data.note.trim(),
        authorId: req.user!.id,
        opportunityId: opp.id,
      },
    });
    return opp;
  });
  res.json({ success: true, data: updated });
});