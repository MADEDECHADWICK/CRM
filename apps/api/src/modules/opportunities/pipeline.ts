import { DEADLINE_APPLICABLE_STAGES, RAG_AMBER_THRESHOLD_DAYS, RAG_RED_THRESHOLD_DAYS, STAGES, ragFor, RAG_LABELS, type RagStatus, type Stage } from "@crm/core";
import type { Prisma } from "../../../generated/prisma/client";
import { opportunityScope, type AccessUser } from "../../lib/accessScope";
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
  limit?: number; offset?: number; paginated?: boolean;
}, range: { from: Date; to: Date } | null = null, now = new Date()) {
  const term = query.q?.trim();
  const contains = { contains: term, mode: "insensitive" as const };
  const base: Prisma.OpportunityWhereInput = { AND: [opportunityScope(user), {
    ...(range ? { stageEnteredAt: { gte: range.from, lte: range.to } } : {}),
    ...(query.ownerId && user.role !== "MANAGER" ? { ownerId: query.ownerId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
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
  const [groups, total, overdue] = await Promise.all([
    tx.opportunity.groupBy({ by: ["stage"], where: base, _count: true }),
    tx.opportunity.count({ where }),
    tx.opportunity.count({ where: { AND: [base, ragWhere("OVERDUE", now)] } }),
  ]);
  const counts = Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<Stage | "all" | "overdue", number>;
  for (const group of groups) counts[group.stage] = group._count;
  counts.all = groups.reduce((sum, group) => sum + group._count, 0);
  counts.overdue = overdue;
  return { items, total, counts };
}
