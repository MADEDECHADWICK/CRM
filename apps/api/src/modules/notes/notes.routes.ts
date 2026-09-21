import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";

export const notesRouter = Router();
notesRouter.use(requireAuth);

const createSchema = z.object({
  body: z.string().min(1),
  opportunityId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});

// Notes are visible through the same data scope as the entity they're
// attached to (BR-012), plus the author's own personal notes. A manager
// never sees notes on another manager's opportunities, no matter which
// client they use.
notesRouter.get("/", async (req: AuthedRequest, res) => {
  const scope = opportunityScope(req.user);
  const unrestricted = Object.keys(scope).length === 0;

  const where = {
    OR: [
      { authorId: req.user!.id },
      ...(unrestricted
        ? [{ opportunity: { isNot: null } }, { organization: { isNot: null } }]
        : [
            // note attached to an opportunity the manager owns
            { opportunity: { ownerId: req.user!.id } },
            // note attached to an organization that has an opportunity they own
            { organization: { opportunities: { some: { ownerId: req.user!.id } } } },
          ]),
    ],
  };

  const notes = await prisma.note.findMany({
    where,
    include: {
      author: { select: { id: true, name: true } },
      opportunity: { include: { organization: true } },
      organization: true,
    },
    orderBy: { createdAt: "desc" },
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