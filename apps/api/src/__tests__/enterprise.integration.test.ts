import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { opportunityScope, organizationScope } from "../lib/accessScope";

test("enterprise invariants: independent opportunities, record sharing, quote preservation, revisions and prequalifications", {
  skip: process.env.RUN_DB_INTEGRATION !== "true", timeout: 180_000,
}, async () => {
  const { prisma } = await import("../lib/prisma");
  const rollback = new Error("enterprise verification rollback");
  const suffix = randomUUID();
  const orgId = randomUUID(), deptId = randomUUID(), ownerId = randomUUID(), outsiderId = randomUUID(), contributorId = randomUUID();
  const oppA = randomUUID(), oppB = randomUUID();

  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.user.createMany({ data: [
        { id: ownerId, name: `Enterprise owner ${suffix}`, email: `owner-${suffix}@example.invalid`, role: "PARTNER" },
        { id: outsiderId, name: `Enterprise outsider ${suffix}`, email: `outsider-${suffix}@example.invalid`, role: "PARTNER" },
        { id: contributorId, name: `Enterprise contributor ${suffix}`, email: `contributor-${suffix}@example.invalid`, role: "TECHNICAL_REVIEWER" },
      ] });
      await tx.department.create({ data: { id: deptId, name: `Enterprise dept ${suffix}`, headId: ownerId } });
      await tx.organization.create({ data: { id: orgId, name: `Enterprise org ${suffix}`, country: "Kenya", assignedToId: ownerId } });
      await tx.opportunity.createMany({ data: [
        { id: oppA, organizationId: orgId, departmentId: deptId, title: `Independent audit ${suffix}`, service: "Audit", createdById: ownerId, ownerId, leadSource: "REFERRAL", stage: "PROPOSAL", submittedFee: 900000, amount: 900000, currency: "KES" },
        { id: oppB, organizationId: orgId, departmentId: deptId, title: `Independent tax ${suffix}`, service: "Tax", createdById: ownerId, ownerId, leadSource: "WEBSITE", stage: "LEAD" },
      ] });
      assert.equal(await tx.opportunity.count({ where: { organizationId: orgId } }), 2, "one organization has multiple independent opportunities");

      // A contributor sees exactly the shared opportunity, not the whole client.
      await tx.opportunityContributor.create({ data: { opportunityId: oppA, userId: contributorId, assignedById: ownerId } });
      const contributorScope = { id: contributorId, role: "TECHNICAL_REVIEWER" as const };
      const visible = await tx.opportunity.findMany({ where: { id: { in: [oppA, oppB] }, ...opportunityScope(contributorScope) }, select: { id: true } });
      assert.deepEqual(visible.map((o) => o.id), [oppA]);
      assert.equal(await tx.organization.count({ where: { id: orgId, ...organizationScope(contributorScope) } }), 0, "record share does not grant the whole organization");

      // An award changes the confirmed value without rewriting the submitted quote.
      const before = await tx.opportunity.findUniqueOrThrow({ where: { id: oppA } });
      await tx.opportunity.update({ where: { id: oppA }, data: { outcome: "WON", outcomeAt: new Date(), wonAt: new Date(), confirmedAwardValue: 1100000, awardCurrency: "KES" } });
      const after = await tx.opportunity.findUniqueOrThrow({ where: { id: oppA } });
      assert.equal(Number(after.submittedFee), Number(before.submittedFee));
      assert.equal(Number(after.amount), Number(before.amount));
      assert.equal(Number(after.confirmedAwardValue), 1100000);

      // A submitted proposal can belong to a won opportunity, and revisions
      // preserve the first submission history.
      const proposal = await tx.proposal.create({ data: { opportunityId: oppA, title: `Proposal ${suffix}`, createdById: ownerId } });
      const revision1 = await tx.proposalRevision.create({ data: { proposalId: proposal.id, revisionNumber: 1, status: "SUBMITTED", createdById: ownerId } });
      await tx.proposalSubmission.create({ data: { revisionId: revision1.id, channel: "Email", isFirstSubmission: true, submittedById: ownerId } });
      const revision2 = await tx.proposalRevision.create({ data: { proposalId: proposal.id, revisionNumber: 2, status: "IN_PREPARATION", createdById: ownerId } });
      await tx.proposalSubmission.create({ data: { revisionId: revision2.id, channel: "Portal", isFirstSubmission: false, submittedById: ownerId } });
      assert.equal(await tx.proposalSubmission.count({ where: { revision: { proposalId: proposal.id } } }), 2);
      assert.equal(await tx.proposalSubmission.count({ where: { revision: { proposalId: proposal.id }, isFirstSubmission: true } }), 1);

      // Prequalification acceptance is separate from a win or revenue.
      const prequal = await tx.prequalification.create({ data: {
        organizationId: orgId, service: "Supplier panel", status: "ACCEPTED", acceptedAt: new Date(), createdById: ownerId, currency: "KES",
      } });
      assert.equal(prequal.status, "ACCEPTED");
      assert.equal(await tx.opportunity.count({ where: { organizationId: orgId, outcome: "WON", confirmedAwardValue: { not: null } } }), 1, "acceptance created no extra win");

      // Disabling a leaver keeps their records.
      await tx.user.update({ where: { id: outsiderId }, data: { isActive: false, deactivatedAt: new Date() } });
      assert.equal(await tx.opportunity.count({ where: { createdById: ownerId } }), 2);

      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 120_000 }), (error) => error === rollback);

    assert.equal(await prisma.organization.count({ where: { id: orgId } }), 0);
    assert.equal(await prisma.user.count({ where: { id: { in: [ownerId, outsiderId, contributorId] } } }), 0);
  } finally {
    await prisma.$disconnect();
  }
});
