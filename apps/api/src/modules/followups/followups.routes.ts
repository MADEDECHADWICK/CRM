import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { createFollowup, deleteFollowup, completeFollowup } from "./followupActions";

export const followupsRouter = Router();
followupsRouter.use(requireAuth);

const createSchema = z.object({
  note: z.string().min(1),
  type: z.enum(["CALL", "EMAIL", "MEETING"]).optional(),
  dueAt: z.string().datetime(),
  opportunityId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

// Personal scope — a user only ever sees their own reminders (BR-011):
// either explicitly assigned to them, or created by them. Firm-wide
// visibility applies to pipeline/reporting data, never to someone's
// private to-do list.
followupsRouter.get("/", async (req: AuthedRequest, res) => {
  try {
    const followups = await prisma.followup.findMany({
      where: {
        OR: [{ assignedToId: req.user!.id }, { createdById: req.user!.id }],
      },
      include: {
        opportunity: { include: { organization: true } },
        organization: true,
      },
      orderBy: { dueAt: "asc" },
    });

    res.json({ success: true, data: followups });
  } catch (error) {
    console.error("Failed to load followups:", error);
    res.status(500).json({ success: false, message: "Failed to load followups" });
  }
});

followupsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  try {
    const followup = await createFollowup({
      note: parsed.data.note,
      type: parsed.data.type,
      dueAt: new Date(parsed.data.dueAt),
      opportunityId: parsed.data.opportunityId,
      organizationId: parsed.data.organizationId,
      assignedToId: parsed.data.assignedToId,
      createdById: req.user!.id,
    });
    res.status(201).json({ success: true, data: followup });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: "FOLLOWUP_REJECTED", message: err.message } });
  }
});

followupsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: params.error.message },
    });
  }

  try {
    const followup = await completeFollowup(params.data.id, req.user!.id);
    res.json({ success: true, data: followup });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: "FOLLOWUP_REJECTED", message: err.message } });
  }
});

followupsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: params.error.message },
    });
  }

  try {
    await deleteFollowup(params.data.id, req.user!.id);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: "FOLLOWUP_REJECTED", message: err.message } });
  }
});