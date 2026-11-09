import { Router } from "express";

import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { paginationSchema, pageOf } from "../../lib/pagination";
import { clientDirectoryWhere, directorySearch } from "../../lib/organizationViews";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

/**
 * The client database.
 *
 * Existing imported customers and organizations with won work. Importing a
 * customer never fabricates a won job. Imported directory entries are shared
 * just like /organizations; embedded won jobs retain their existing scope.
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

  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const where = { AND: [clientDirectoryWhere(scope), directorySearch(q)] };
  const clients = await prisma.organization.findMany({
    where,
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
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageOf(page.data),
  });

  res.json({ success: true, data: req.query.paginated === "true"
    ? { items: clients, total: await prisma.organization.count({ where }) }
    : clients });
});
