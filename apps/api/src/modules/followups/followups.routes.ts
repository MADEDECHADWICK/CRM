import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { createFollowup, deleteFollowup, completeFollowup } from "./followupActions";

export const followupsRouter = Router();
followupsRouter.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime(),
  opportunityId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
});

followupsRouter.post("/", async (req: AuthedRequest, res) => {
  const body = createBodySchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });
  }

  try {
    const followup = await createFollowup({
      title: body.data.title,
      description: body.data.description,
      dueDate: new Date(body.data.dueDate),
      opportunityId: body.data.opportunityId,
      assignedToId: body.data.assignedToId,
      createdById: req.user!.id,
    });
    res.status(201).json({ success: true, data: followup });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: "FOLLOWUP_REJECTED", message: err.message } });
  }
});

followupsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  }

  try {
    await deleteFollowup(params.data.id, req.user!.id);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(403).json({ success: false, error: { code: "NOT_ALLOWED", message: err.message } });
  }
});

followupsRouter.post("/:id/complete", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  }

  try {
    const followup = await completeFollowup(params.data.id, req.user!.id);
    res.json({ success: true, data: followup });
  } catch (err: any) {
    res.status(403).json({ success: false, error: { code: "NOT_ALLOWED", message: err.message } });
  }
});