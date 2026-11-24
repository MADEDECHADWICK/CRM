import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Dry-run reconciliation report for the enterprise-CRM migration.
 *
 * This reads only. It does not modify data. Use the output to decide which
 * legacy records need a human mapping; do not auto-convert ambiguous amounts,
 * outcomes, proposals or prequalifications.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [
    ambiguousAmounts,
    legacyPrequalifications,
    legacyNotSubmitted,
    winsWithoutAwardValue,
    acceptedUnlinkedPrequalifications,
    openWithoutNextAction,
    unknownCurrencyOpportunities,
    invalidatedApprovals,
    archivedRecords,
  ] = await Promise.all([
    prisma.opportunity.findMany({
      where: { amount: { not: null }, reviewRequired: true },
      select: { id: true, title: true, amount: true, currency: true, stage: true, reviewReason: true },
      take: 500,
    }),
    prisma.opportunity.findMany({
      where: { submissionType: "PREQUALIFICATION" },
      select: { id: true, title: true, outcome: true, reviewReason: true },
      take: 500,
    }),
    prisma.opportunity.findMany({
      where: { stage: "NOT_SUBMITTED" },
      select: { id: true, title: true, stage: true, proposalBreachedAt: true, reviewReason: true },
      take: 500,
    }),
    prisma.opportunity.findMany({
      where: { outcome: "WON", confirmedAwardValue: null },
      select: { id: true, title: true, amount: true, wonAt: true },
      take: 500,
    }),
    prisma.prequalification.findMany({
      where: { status: "ACCEPTED", sourceOpportunities: { none: {} } },
      select: { id: true, service: true, organizationId: true, acceptedAt: true },
      take: 500,
    }),
    prisma.opportunity.findMany({
      where: { outcome: { in: ["OPEN", "ON_HOLD"] }, OR: [{ nextAction: null }, { nextActionDueAt: null }, { nextActionOwnerId: null }] },
      select: { id: true, title: true, outcome: true, nextAction: true, nextActionDueAt: true, nextActionOwnerId: true },
      take: 500,
    }),
    prisma.opportunity.findMany({
      where: { currency: { notIn: ["KES", "UGX", "TZS", "RWF", "USD", "EUR"] } },
      select: { id: true, title: true, currency: true, amount: true },
      take: 500,
    }),
    prisma.proposalApproval.findMany({
      where: { status: "INVALIDATED" },
      select: { id: true, revisionId: true, invalidationReason: true, invalidatedAt: true },
      take: 500,
    }),
    Promise.all([
      prisma.organization.count({ where: { isArchived: true } }),
      prisma.opportunity.count({ where: { isArchived: true } }),
    ]),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    note: "No records were changed. Resolve ambiguous records with an authorized data-correction workflow.",
    queues: {
      ambiguousAmounts: { count: ambiguousAmounts.length, sample: ambiguousAmounts },
      legacyPrequalificationSubmissionTypes: { count: legacyPrequalifications.length, sample: legacyPrequalifications },
      legacyNotSubmitted: { count: legacyNotSubmitted.length, sample: legacyNotSubmitted },
      winsWithoutConfirmedAwardValue: { count: winsWithoutAwardValue.length, sample: winsWithoutAwardValue },
      acceptedPrequalificationsWithoutLinkedOpportunity: { count: acceptedUnlinkedPrequalifications.length, sample: acceptedUnlinkedPrequalifications },
      openOrOnHoldWithoutCompleteNextAction: { count: openWithoutNextAction.length, sample: openWithoutNextAction },
      unknownCurrencyOpportunities: { count: unknownCurrencyOpportunities.length, sample: unknownCurrencyOpportunities },
      invalidatedApprovals: { count: invalidatedApprovals.length, sample: invalidatedApprovals },
      archived: { organizations: archivedRecords[0], opportunities: archivedRecords[1] },
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error("Enterprise reconciliation failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
