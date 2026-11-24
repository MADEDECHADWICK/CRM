import { DEADLINE_APPLICABLE_STAGES, RAG_AMBER_THRESHOLD_DAYS, RAG_RED_THRESHOLD_DAYS, STAGES, ragFor, RAG_LABELS, convertToKes, type RagStatus, type Stage } from "@crm/core";
import type { Prisma } from "../../../generated/prisma/client";
import { organizationScope, opportunityScope, type AccessUser } from "../../lib/accessScope";
import { prospectDirectoryWhere } from "../../lib/organizationViews";
import { pageOf } from "../../lib/pagination";

/** SQL equivalent of ragFor: filter before pagination, including after row 500. */
export function ragWhere(status: RagStatus, now: Date): Prisma.OpportunityWhereInput {
  if (status === "SUBMITTED") return { proposalSubmittedAt: { not: null } };
  if (status === "NO_DEADLINE") return { proposalSubmittedAt: null, OR: [
    { proposalDueAt: null }, { stage: { notIn: [...DEADLINE_APPLICABLE_STAGES] } },
  ] };
  const day = 86400000;
  const redEnd = new Date(now.getTime() + (RAG_RED_THRESHOLD_DAYS + 1) * day);
  const amberEnd = new Date(now.getTime() + (RAG_AMBER_THRESHOLD_DAYS + 1) * day);
  return { proposalSubmittedAt: null, stage: { in: [...DEADLINE_APPLICABLE_STAGES] }, proposalDueAt:
    status === "OVERDUE" ? { lt: now } : status === "RED" ? { gte: now, lt: redEnd }
      : status === "AMBER" ? { gte: redEnd, lt: amberEnd } : { gte: amberEnd } };
}

export async function listPipeline(tx: Prisma.TransactionClient, user: AccessUser, query: {
  stage?: Stage; rag?: RagStatus; q?: string; ownerId?: string; departmentId?: string;
  outcome?: string; view?: "prospects"; limit?: number; offset?: number; paginated?: boolean; includeArchived?: boolean;
}, range: { from: Date; to: Date } | null = null, now = new Date()) {
  if (query.view === "prospects") return listProspectAccounts(tx, user, query, now);
  const term = query.q?.trim();
  const contains = { contains: term, mode: "insensitive" as const };
  const base: Prisma.OpportunityWhereInput = { AND: [opportunityScope(user), {
    ...(query.includeArchived ? {} : { isArchived: false }),
    ...(range ? { stageEnteredAt: { gte: range.from, lte: range.to } } : {}),
    ...(query.ownerId && user.role !== "MANAGER" ? { ownerId: query.ownerId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.outcome ? { outcome: query.outcome as never } : {}),
    ...(term ? { OR: [{ title: contains }, { service: contains }, { organization: { is: { name: contains } } }] } : {}),
  }] };
  const where: Prisma.OpportunityWhereInput = { AND: [base,
    query.stage ? { stage: query.stage } : {}, query.rag ? ragWhere(query.rag, now) : {},
  ] };
  const rows = await tx.opportunity.findMany({ where,
    include: { organization: { select: { id: true, name: true } }, department: { include: { head: { select: { id: true, name: true, role: true } } } }, owner: { select: { id: true, name: true } } },
    orderBy: [{ stageEnteredAt: "desc" }, { id: "asc" }], ...pageOf(query),
  });
  const items = rows.map(row => { const rag = ragFor(row, now); return { ...row, rag, ragLabel: RAG_LABELS[rag.status] }; });
  if (!query.paginated) return { items };
  const [groups, total, overdue, valueGroups, prospectAccounts] = await Promise.all([
    tx.opportunity.groupBy({ by: ["stage"], where: base, _count: true }),
    tx.opportunity.count({ where }),
    tx.opportunity.count({ where: { AND: [base, ragWhere("OVERDUE", now)] } }),
    tx.opportunity.groupBy({
      by: ["stage", "currency"],
      where: base,
      _count: true,
      _sum: {
        amount: true,
        confirmedAwardValue: true,
        submittedFee: true,
        approvedQuotedFee: true,
        estimatedValue: true,
      },
    }),
    tx.organization.count({ where: { AND: [organizationScope(user), prospectDirectoryWhere(), { isArchived: false }] } }),
  ]);
  const counts = Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<Stage | "all" | "overdue" | "prospects", number>;
  for (const group of groups) counts[group.stage] = group._count;
  counts.all = groups.reduce((sum, group) => sum + group._count, 0);
  counts.overdue = overdue;
  counts.prospects = prospectAccounts;

  const values = Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<Stage, number>;
  let valueUnavailableCount = 0;
  for (const group of valueGroups) {
    const raw = group.stage === "WON"
      ? group._sum.confirmedAwardValue ?? group._sum.amount
      : group._sum.submittedFee ?? group._sum.approvedQuotedFee ?? group._sum.estimatedValue ?? group._sum.amount;
    if (raw == null) continue;
    const converted = convertToKes(Number(raw), group.currency);
    if (converted.available && converted.amountKes != null) {
      values[group.stage] += converted.amountKes;
    } else {
      valueUnavailableCount += group._count;
    }
  }

  return { items, total, counts, values, valueUnavailableCount };
}

export async function listProspectAccounts(
  tx: Prisma.TransactionClient,
  user: AccessUser,
  query: { q?: string; limit?: number; offset?: number; paginated?: boolean },
  now = new Date()
) {
  const term = query.q?.trim();
  const contains = { contains: term, mode: "insensitive" as const };
  const where: Prisma.OrganizationWhereInput = {
    AND: [
      organizationScope(user),
      prospectDirectoryWhere(),
      { isArchived: false },
      ...(term ? [{ OR: [
        { name: contains }, { clientNumber: contains }, { industry: contains },
        { country: contains }, { contacts: { some: { OR: [{ name: contains }, { email: contains }] } } },
        { opportunities: { some: { AND: [
          opportunityScope(user),
          { OR: [{ title: contains }, { service: contains }] },
        ] } } },
      ] }] : []),
    ],
  };

  const include = {
    organization: { select: { id: true, name: true } },
    department: { include: { head: { select: { id: true, name: true, role: true } } } },
    owner: { select: { id: true, name: true } },
  } as const;

  const total = await tx.organization.count({ where });
  const orgs = await tx.organization.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageOf(query),
    include: {
      opportunities: {
        where: opportunityScope(user),
        orderBy: [{ stageEnteredAt: "desc" }, { id: "asc" }],
        take: 1,
        include,
      },
    },
  });
  const items = orgs.flatMap((org) => org.opportunities.map((opp) => {
    const rag = ragFor(opp, now);
    return { ...opp, rag, ragLabel: RAG_LABELS[rag.status] };
  }));

  const latestRows = await tx.organization.findMany({
    where,
    select: {
      opportunities: {
        where: opportunityScope(user),
        orderBy: [{ stageEnteredAt: "desc" }, { id: "asc" }],
        take: 1,
        select: { stage: true, proposalDueAt: true, proposalSubmittedAt: true },
      },
    },
  });
  const counts = Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<Stage | "all" | "overdue" | "prospects", number>;
  counts.all = total;
  counts.prospects = total;
  counts.overdue = 0;
  for (const row of latestRows) {
    const latest = row.opportunities[0];
    if (!latest) continue;
    counts[latest.stage] += 1;
    if (ragFor(latest, now).status === "OVERDUE") counts.overdue += 1;
  }

  return query.paginated
    ? { items, total, counts }
    : { items };
}
