import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";

export const reportingRouter = Router();
reportingRouter.use(requireAuth);

// Every number here comes from a live aggregation over Opportunity records
// (BR-014) — never a hand-typed figure. The count fields are what make
// "CLIENTS = opportunities in WON stage" real: client status is derived,
// not stored (BR-002).
reportingRouter.get("/summary", async (req: AuthedRequest, res) => {
  const scope = opportunityScope(req.user);
  const [prospects, leads, proposals, clients, won, lost, activeProposals] =
    await Promise.all([
      prisma.opportunity.aggregate({ where: { ...scope, stage: "PROSPECT" }, _count: true }),
      prisma.opportunity.aggregate({ where: { ...scope, stage: "LEAD" }, _count: true }),
      prisma.opportunity.aggregate({ where: { ...scope, stage: "PROPOSAL" }, _count: true }),
      prisma.opportunity.aggregate({ where: { ...scope, stage: "WON" }, _count: true }),
      prisma.opportunity.aggregate({ where: { ...scope, stage: "WON" }, _sum: { amount: true }, _count: true }),
      prisma.opportunity.aggregate({ where: { ...scope, stage: "LOST" }, _sum: { amount: true }, _count: true }),
      prisma.opportunity.aggregate({ where: { ...scope, stage: "PROPOSAL" }, _sum: { amount: true }, _count: true }),
    ]);

  res.json({
    success: true,
    data: {
      totalProspects: prospects._count,
      totalLeads: leads._count,
      totalProposals: proposals._count,
      totalClients: clients._count,
      wonValue: won._sum.amount ?? 0,
      wonCount: won._count,
      lostValue: lost._sum.amount ?? 0,
      lostCount: lost._count,
      activeProposalValue: activeProposals._sum.amount ?? 0,
    },
  });
});