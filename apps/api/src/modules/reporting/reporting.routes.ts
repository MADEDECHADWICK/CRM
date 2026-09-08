import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";

export const reportingRouter = Router();
reportingRouter.use(requireAuth);

reportingRouter.get("/summary", async (req: AuthedRequest, res) => {
  const scope = opportunityScope(req.user);
  const [won, lost, activeProposals] = await Promise.all([
    prisma.opportunity.aggregate({ where: { ...scope, stage: "WON" }, _sum: { amount: true }, _count: true }),
    prisma.opportunity.aggregate({ where: { ...scope, stage: "LOST" }, _sum: { amount: true }, _count: true }),
    prisma.opportunity.aggregate({ where: { ...scope, stage: "PROPOSAL" }, _sum: { amount: true }, _count: true }),
  ]);
  res.json({
    success: true,
    data: {
      wonValue: won._sum.amount ?? 0,
      wonCount: won._count,
      lostValue: lost._sum.amount ?? 0,
      lostCount: lost._count,
      activeProposalValue: activeProposals._sum.amount ?? 0,
    },
  });
});