import { Router } from "express";

import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { paginationSchema, pageOf } from "../../lib/pagination";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

/**
 * The client database.
 *
 * Deliberately separate from /organizations (the prospect list): a "client" is
 * an organization with at least one won job, and this endpoint returns only
 * those, together with their contacts and the jobs won from them. It is a
 * read-only view of the book of business, not a workflow stage.
 *
 * Data scope follows the pipeline: a Manager sees clients they have won work
 * for; BD/Partner see the whole book.
 */
clientsRouter.get("/", async (req: AuthedRequest, res) => {
  const page = paginationSchema.safeParse(req.query);
  if (!page.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: page.error.message },
    });
  }

  // Admin (Marketing & BD) sees the whole book; Partners and Managers see only
  // the clients they are assigned (i.e. won work they own).
  const scope = req.user!.role === "MARKETING_BD" ? {} : { ownerId: req.user!.id };

  const clients = await prisma.organization.findMany({
    where: { opportunities: { some: { ...scope, stage: "WON" } } },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      opportunities: {
        where: { ...scope, stage: "WON" },
        select: {
          id: true,
          title: true,
          service: true,
          amount: true,
          currency: true,
          wonAt: true,
          businessType: true,
          department: { select: { name: true } },
          signingPartner: { select: { name: true } },
        },
        orderBy: { wonAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
    ...pageOf(page.data),
  });

  res.json({ success: true, data: clients });
});
