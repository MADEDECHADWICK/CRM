import { Router } from "express";

import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, organizationScope, opportunityScope } from "../../middleware/authorize";
import { assignmentInclude } from "../organizations/prospectActions";
import { paginationSchema, pageOf } from "../../lib/pagination";
import { clientDirectoryWhere, directorySearch } from "../../lib/organizationViews";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

/**
 * The client database.
 *
 * Existing imported customers and organizations with won work. Importing a
 * customer never fabricates a won job. Account assignment controls access to
 * both imported customers and clients converted through the pipeline.
 */
clientsRouter.get("/", async (req: AuthedRequest, res) => {
  const page = paginationSchema.safeParse(req.query);
  if (!page.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: page.error.message },
    });
  }

  const scope = opportunityScope(req.user);

  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const where = { AND: [organizationScope(req.user), { isArchived: false }, clientDirectoryWhere(), directorySearch(q)] };
  const clients = await prisma.organization.findMany({
    where,
    include: {
      ...assignmentInclude,
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
