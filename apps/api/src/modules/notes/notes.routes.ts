import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, noteScope, scopedOrganization, scopedOpportunity } from "../../middleware/authorize";
import { paginationSchema, pageOf } from "../../lib/pagination";

export const notesRouter = Router();
notesRouter.use(requireAuth);

const createSchema = z.object({
  body: z.string().trim().min(1),
  opportunityId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});

// Notes are visible through the same data scope as the entity they're
// attached to (BR-012), plus the author's own personal notes. A manager
// never sees notes on another manager's opportunities, no matter which
// client they use.
notesRouter.get("/", async (req: AuthedRequest, res) => {
  const page = paginationSchema.safeParse(req.query);
  if (!page.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: page.error.message },
    });
  }

  const notes = await prisma.note.findMany({
    where: noteScope(req.user),
    include: {
      author: { select: { id: true, name: true } },
      opportunity: { include: { organization: true } },
      organization: true,
    },
    orderBy: { createdAt: "desc" },
    ...pageOf(page.data),
  });

  res.json({ success: true, data: notes });
});

// Create a general/personal note. Both links are optional and independent
// (BR-011 / PRD 6.5) — the note may stand alone, attach to an organization,
// or attach to an opportunity as a decision note.
notesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  // A note attached to an opportunity must be a note on a deal the author is
  // allowed to see; otherwise a Manager can write into another owner's deal
  // trail. Standalone and organization-only notes stay unrestricted (BR-011).
  if (parsed.data.opportunityId) {
    const scoped = await scopedOpportunity(req.user, parsed.data.opportunityId);
    if (!scoped) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." },
      });
    }
  }

  if (parsed.data.organizationId && !await scopedOrganization(req.user, parsed.data.organizationId)) {
    return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found." } });
  }

  const note = await prisma.note.create({
    data: {
      body: parsed.data.body.trim(),
      authorId: req.user!.id,
      opportunityId: parsed.data.opportunityId ?? null,
      organizationId: parsed.data.organizationId ?? null,
    },
    include: {
      author: { select: { id: true, name: true } },
      opportunity: { include: { organization: true } },
      organization: true,
    },
  });

  res.status(201).json({ success: true, data: note });
});
