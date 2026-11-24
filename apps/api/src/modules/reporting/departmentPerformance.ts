import { ACTIVE_PROPOSAL_STAGES, STAGES, toKes, canManageStaff, type BreakdownRow, type Stage, type StageCounts } from "@crm/core";
import type { Prisma } from "../../../generated/prisma/client";
import { opportunityScope, type AccessUser } from "../../lib/accessScope";
import { UserUpdateError } from "../users/userActions";

function emptyRow(id: string, name: string): BreakdownRow {
  return { id, name, counts: Object.fromEntries(STAGES.map(s => [s, 0])) as StageCounts, wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0, activeProposalValue: 0, unavailableValueCount: 0 };
}
function add(row: BreakdownRow, deal: {
  stage: Stage;
  amount: unknown;
  confirmedAwardValue?: unknown;
  submittedFee?: unknown;
  approvedQuotedFee?: unknown;
  estimatedValue?: unknown;
  currency: string;
}) {
  row.counts[deal.stage]++;
  const raw = deal.stage === "WON"
    ? deal.confirmedAwardValue ?? deal.amount
    : deal.submittedFee ?? deal.approvedQuotedFee ?? deal.estimatedValue ?? deal.amount;
  const value = raw == null ? null : toKes(Number(raw), deal.currency);
  if (value == null && raw != null) row.unavailableValueCount = (row.unavailableValueCount ?? 0) + 1;
  if (deal.stage === "WON") { row.wonCount++; if (value != null) row.wonValue += value; }
  if (deal.stage === "LOST") { row.lostCount++; if (value != null) row.lostValue += value; }
  if (ACTIVE_PROPOSAL_STAGES.includes(deal.stage) && value != null) row.activeProposalValue += value;
}

export async function departmentPerformance(tx: Prisma.TransactionClient, actor: AccessUser, memberId: string, range?: { from: Date; to: Date } | null) {
  if (!canManageStaff(actor.role, actor.isAdmin) && actor.id !== memberId) throw new UserUpdateError(403, "FORBIDDEN", "You can view only your own department performance.");
  const member = await tx.user.findUnique({ where: { id: memberId }, select: { id: true, name: true, role: true, departmentId: true, headedDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } } } });
  if (!member) throw new UserUpdateError(404, "NOT_FOUND", "Member not found.");
  const departmentIds = member.headedDepartments.map(d => d.id);
  const scope = opportunityScope({ ...member, headedDepartmentIds: departmentIds });
  // Personal and department rows can overlap. The combined row counts each
  // deal in a headed department once, independently of its current owner.
  const periodWhere = range ? { stageEnteredAt: { gte: range.from, lte: range.to } } : {};
  const personalDeals = await tx.opportunity.findMany({
    where: { AND: [scope, { ownerId: member.id }, periodWhere] },
    select: { stage: true, amount: true, confirmedAwardValue: true, submittedFee: true, approvedQuotedFee: true, estimatedValue: true, currency: true },
  });
  // Leadership authorizes department aggregates, not private account details.
  // Otherwise a member-only account assignment silently understates the head's
  // department totals. No account identities leave this service.
  const departmentDeals = await tx.opportunity.findMany({
    where: { departmentId: { in: departmentIds }, ...periodWhere },
    select: { departmentId: true, stage: true, amount: true, confirmedAwardValue: true, submittedFee: true, approvedQuotedFee: true, estimatedValue: true, currency: true },
  });
  const personal = emptyRow(member.id, "Personally owned deals");
  const combined = emptyRow("combined", "All departments headed");
  const departments = member.headedDepartments.map(d => emptyRow(d.id, d.name));
  const byId = new Map(departments.map(d => [d.id, d]));
  for (const deal of personalDeals) add(personal, deal);
  for (const deal of departmentDeals) {
    const row = byId.get(deal.departmentId);
    if (row) { add(row, deal); add(combined, deal); }
  }
  return { member: { id: member.id, name: member.name }, personal, combined, departments };
}
