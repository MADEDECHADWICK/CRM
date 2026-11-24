import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ragFor, type RagStatus, type Stage } from "@crm/core";
import { createOpportunity } from "../modules/opportunities/createOpportunity";
import { transitionOpportunity, TransitionRejected } from "../modules/opportunities/transitionOpportunity";
import { listPipeline } from "../modules/opportunities/pipeline";
import { setProposalDeadline, recordBreachExplanation } from "../modules/opportunities/deadlines";
import { flagOverdueProposal } from "../modules/opportunities/breachSweep";
import { createFollowup, completeFollowup } from "../modules/followups/followupActions";
import { departmentPerformance } from "../modules/reporting/departmentPerformance";
import { clientDirectoryWhere, prospectDirectoryWhere } from "../lib/organizationViews";
import { OwnershipRejected, reassignOpportunity } from "../modules/opportunities/ownership";

// Every record is private to one uncommitted transaction. Never call the global
// sweep with a simulated clock: only the fixture deal can be flagged here.
test("pipeline lifecycle, reminders, deadlines, reports, scope and paging work end to end", {
  skip: process.env.RUN_DB_INTEGRATION !== "true", timeout: 240000,
}, async () => {
  const { prisma } = await import("../lib/prisma");
  const suffix = randomUUID(), rollback = new Error("pipeline verification rollback");
  const orgId = randomUUID(), partnerId = randomUUID(), managerId = randomUUID(), otherId = randomUUID(), adminId = randomUUID();
  const deptA = randomUUID(), deptB = randomUUID(), deptOther = randomUUID();
  const now = new Date(), day = 86400000, future = new Date(now.getTime() + 4 * day);
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.user.createMany({ data: [
        { id: partnerId, name: "Pipeline verification Partner", email: `partner-${suffix}@example.invalid`, role: "PARTNER" },
        { id: managerId, name: "Pipeline verification Manager", email: `manager-${suffix}@example.invalid`, role: "MANAGER" },
        { id: otherId, name: "Pipeline verification outsider", email: `other-${suffix}@example.invalid`, role: "PARTNER" },
        { id: adminId, name: "Pipeline verification admin", email: `admin-${suffix}@example.invalid`, role: "MARKETING_BD" },
      ] });
      await tx.department.createMany({ data: [
        { id: deptA, name: `Pipeline A ${suffix}`, headId: partnerId },
        { id: deptB, name: `Pipeline B ${suffix}`, headId: partnerId },
        { id: deptOther, name: `Pipeline hidden ${suffix}`, headId: otherId },
      ] });
      await tx.user.updateMany({ where: { id: { in: [partnerId, managerId] } }, data: { departmentId: deptA } });
      const partner = { id: partnerId, role: "PARTNER" as const, departmentId: deptA, headedDepartmentIds: [deptA, deptB] };
      const manager = { id: managerId, role: "MANAGER" as const, departmentId: deptA };
      const other = { id: otherId, role: "PARTNER" as const, departmentId: deptOther };
      await tx.organization.create({ data: { id: orgId, name: `Pipeline prospect ${suffix}`, country: "Kenya", assignedToId: partnerId,
        assignedDepartmentId: deptA, sourceData: { kind: "PROSPECT", planningFeeKES: "99999999" } } });
      const input = { title: `Pursuit ${suffix}`, organizationId: orgId, departmentId: deptA, service: "Audit", leadSource: "COLD_OUTREACH" as const, stage: "PROSPECT" as const };
      await assert.rejects(createOpportunity(tx, other, input), e => e instanceof OwnershipRejected && e.status === 404);
      await assert.rejects(createOpportunity(tx, partner, { ...input, departmentId: deptOther }), /Assign this account/);
      await assert.rejects(createOpportunity(tx, partner, { ...input, ownerId: managerId }), /department/);
      await assert.rejects(createOpportunity(tx, partner, { ...input, leadReceivedAt: future.toISOString() }), /future/);
      const deal = await createOpportunity(tx, partner, input);
      assert.equal(deal.ownerId, partnerId); assert.equal(deal.amount, null, "Planning fees must never become deal revenue automatically");
      assert.equal(await tx.ownerChange.count({ where: { opportunityId: deal.id } }), 1);
      assert.equal(await tx.stageHistoryEntry.count({ where: { opportunityId: deal.id, fromStage: null } }), 1);
      const move = (id: string, toStage: Stage, extra = {}) => transitionOpportunity({ opportunityId: id, changedById: partnerId, toStage, reason: "Workflow verification", ...extra }, tx);
      await move(deal.id, "LEAD");
      await assert.rejects(move(deal.id, "WON", { amount: 1000, businessType: "NEW_BUSINESS", signingPartnerId: partnerId }), /Cannot move/);
      await assert.rejects(move(deal.id, "PROPOSAL"), e => e instanceof TransitionRejected && e.missing.some(m => m.scope === "CONTACT") && e.missing.some(m => m.scope === "ORGANIZATION"));
      assert.equal((await tx.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).stage, "LEAD");
      await tx.organization.update({ where: { id: orgId }, data: { industry: "Manufacturing", email: "office@example.invalid", phone: "0700000000", address: "Verification address" } });
      await tx.contact.create({ data: { organizationId: orgId, name: "Verification decision maker", title: "Finance director", email: "finance@example.invalid", phone: "0700000001", isPrimary: true } });
      const reminder = await createFollowup({ opportunityId: deal.id, createdById: partnerId, assignedToId: partnerId, type: "CALL", note: "Confirm requirements", dueAt: future }, tx);
      await assert.rejects(completeFollowup(reminder.id, other, tx));
      assert.equal((await completeFollowup(reminder.id, partner, tx)).status, "COMPLETED");
      const dated = await setProposalDeadline({ opportunityId: deal.id, dueAt: future, setById: adminId }, tx);
      assert.equal(ragFor(dated, now).status, "RED");
      await move(deal.id, "PROPOSAL");
      const submitted = await move(deal.id, "AWAITING_FEEDBACK", { submissionType: "RFQ", revisitAt: future });
      assert.ok(submitted.proposalSubmittedAt); assert.equal(ragFor(submitted, now).status, "SUBMITTED");
      assert.equal(await tx.followup.count({ where: { opportunityId: deal.id, note: { startsWith: "Chase proposal feedback:" }, assignedToId: partnerId } }), 1);
      await move(deal.id, "PROPOSAL");
      const resent = await move(deal.id, "AWAITING_FEEDBACK");
      assert.equal(resent.proposalSubmittedAt?.toISOString(), submitted.proposalSubmittedAt.toISOString(), "A revision preserves the original submission time");
      await assert.rejects(move(deal.id, "WON", { amount: 1200000 }), /business type/);
      const won = await move(deal.id, "WON", { amount: 1200000, businessType: "NEW_BUSINESS", signingPartnerId: partnerId });
      assert.ok(won.wonAt); assert.equal(Number(won.amount), 1200000);
      assert.equal(await tx.organization.count({ where: { id: orgId, AND: [clientDirectoryWhere()] } }), 1);
      assert.equal(await tx.organization.count({ where: { id: orgId, AND: [prospectDirectoryWhere()] } }), 0);
      await assert.rejects(move(deal.id, "PROPOSAL"), /Cannot move/);
      const lost = await createOpportunity(tx, manager, { ...input, title: `Lost ${suffix}`, departmentId: deptB, stage: "LEAD", amount: 500000 });
      await move(lost.id, "PROPOSAL");
      await assert.rejects(move(lost.id, "DEFERRED"), /revisit date/i);
      await move(lost.id, "DEFERRED", { revisitAt: future });
      assert.equal(await tx.followup.count({ where: { opportunityId: lost.id, dueAt: future, assignedToId: partnerId } }), 1);
      await move(lost.id, "PROPOSAL");
      await move(lost.id, "LOST", { lostReason: "Budget withdrawn" });
      const noReply = await createOpportunity(tx, partner, { ...input, stage: "LEAD", title: `No reply ${suffix}` });
      await move(noReply.id, "PROPOSAL"); await move(noReply.id, "NO_REPLY");
      const performance = await departmentPerformance(tx, partner, partnerId);
      assert.equal(performance.combined.wonCount, 1); assert.equal(performance.combined.wonValue, 1200000);
      assert.equal(performance.combined.lostValue, 500000);
      assert.equal(performance.departments.find(d => d.id === deptA)?.counts.WON, 1);
      assert.equal(performance.departments.find(d => d.id === deptB)?.counts.LOST, 1);

      const late = await createOpportunity(tx, partner, { ...input, stage: "LEAD", title: `Deadline ${suffix}` });
      await setProposalDeadline({ opportunityId: late.id, dueAt: new Date(now.getTime() + day), setById: adminId }, tx);
      const clock = new Date(now.getTime() + 2 * day);
      assert.equal(await flagOverdueProposal(tx, late.id, clock), true);
      assert.equal(await flagOverdueProposal(tx, late.id, clock), false);
      const overdueFlag = await tx.opportunity.findUniqueOrThrow({ where: { id: late.id } });
      // An overdue internal deadline raises a flag/escalation. It must NOT
      // assert that the proposal was never submitted.
      assert.equal(overdueFlag.stage, "LEAD");
      assert.ok(overdueFlag.proposalBreachedAt);
      assert.equal(overdueFlag.breachNoteRequired, true);
      assert.equal(await tx.followup.count({ where: { opportunityId: late.id } }), 1);
      assert.ok(await tx.auditEvent.count({ where: { entityType: "Opportunity", entityId: late.id, actorType: "SYSTEM" } }));
      const revised = await setProposalDeadline({ opportunityId: late.id, dueAt: future, setById: adminId }, tx);
      assert.equal(revised.breachNoteRequired, true); assert.equal(revised.stage, "LEAD");
      await recordBreachExplanation({ opportunityId: late.id, authorId: partnerId, explanation: "Awaiting records" }, tx);
      assert.equal(await tx.followup.count({ where: { opportunityId: late.id, status: "PENDING" } }), 0);
      await move(late.id, "PROPOSAL");
      await assert.rejects(reassignOpportunity({ opportunityId: late.id, actor: partner, newOwnerId: otherId, reason: "Transfer verification" }, tx), /Assign this account/);
      const reassigned = await reassignOpportunity({ opportunityId: late.id, actor: partner, newOwnerId: managerId, reason: "Manager is pursuing this work" }, tx);
      assert.equal(reassigned.ownerId, managerId);
      const recovered = await createOpportunity(tx, partner, { ...input, stage: "LEAD", title: `Recovery ${suffix}` });
      await tx.opportunity.update({ where: { id: recovered.id }, data: { proposalDueAt: new Date(now.getTime() - day) } });
      assert.equal(await flagOverdueProposal(tx, recovered.id, now), true);
      const recovery = await move(recovered.id, "PROPOSAL");
      assert.ok(recovery.proposalDueAt, "The issued deadline and its history are preserved");
      assert.equal(recovery.breachNoteRequired, true);
      assert.equal(await flagOverdueProposal(tx, recovered.id, now), false, "The same overdue flag must not be raised twice");

      // The overdue record deliberately sorts beyond the old 500-record cap.
      const pagingTerm = `paging-${suffix}`;
      await tx.opportunity.createMany({ data: Array.from({ length: 606 }, (_, i) => ({
        title: `${pagingTerm}-${String(i).padStart(3, "0")}`, service: "Paging verification", stage: "LEAD" as const,
        organizationId: orgId, departmentId: deptA, createdById: partnerId, ownerId: partnerId, leadSource: "COLD_OUTREACH" as const,
        proposalDueAt: new Date(now.getTime() + (i === 605 ? -1 : 20) * day), stageEnteredAt: new Date(now.getTime() - i * 1000),
      })) });
      const page = await listPipeline(tx, partner, { paginated: true, q: pagingTerm, limit: 50, offset: 550 }, null, now);
      assert.equal(page.total, 606); assert.equal(page.counts?.all, 606); assert.equal(page.items.length, 50);
      const overdue = await listPipeline(tx, partner, { paginated: true, q: pagingTerm, rag: "OVERDUE" }, null, now);
      assert.equal(overdue.total, 1); assert.ok(overdue.items[0].title.endsWith("605"));
      const hidden = await listPipeline(tx, other, { paginated: true, q: pagingTerm }, null, now);
      assert.equal(hidden.total, 0); assert.equal(hidden.counts?.all, 0);
      assert.equal((await listPipeline(tx, partner, { paginated: true, q: "Audit", stage: "WON" })).total, 1, "Search includes service and outcome filters");
      assert.equal((await listPipeline(tx, partner, { paginated: true, q: `Pipeline prospect ${suffix}`, stage: "LOST" })).total, 1, "Search includes organization names");

      const ragTerm = `rag-${suffix}`;
      const rows = [-1, 0, 5, 5.999, 6, 15.999, 16, 30].map((days, i) => ({
        title: `${ragTerm}-${i}`, stage: "PROPOSAL" as Stage, proposalDueAt: new Date(now.getTime() + days * day), proposalSubmittedAt: null as Date | null,
      }));
      rows.push({ title: `${ragTerm}-sent`, stage: "WON", proposalDueAt: new Date(now.getTime() - day), proposalSubmittedAt: now });
      rows.push({ title: `${ragTerm}-irrelevant`, stage: "PROSPECT", proposalDueAt: now, proposalSubmittedAt: null });
      await tx.opportunity.createMany({ data: rows.map(row => ({ ...row, service: "RAG verification", organizationId: orgId, departmentId: deptA, createdById: partnerId, ownerId: partnerId, leadSource: "COLD_OUTREACH" })) });
      for (const status of ["RED", "AMBER", "GREEN", "OVERDUE", "SUBMITTED", "NO_DEADLINE"] as RagStatus[]) {
        const expected = rows.filter(row => ragFor(row, now).status === status).map(row => row.title).sort();
        const result = await listPipeline(tx, partner, { paginated: true, q: ragTerm, rag: status }, null, now);
        assert.deepEqual(result.items.map(row => row.title).sort(), expected, `${status} SQL filtering agrees with displayed RAG at boundaries`);
      }
      console.log("Verified prospect â†’ lead â†’ proposal â†’ awaiting â†’ won; lost/no reply/deferred; reminders, deadline recovery, scoped reporting and 606-row pagination.");
      throw rollback;
    }, { isolationLevel: "Serializable", maxWait: 30000, timeout: 180000 }), error => error === rollback);
    assert.equal(await prisma.organization.count({ where: { id: orgId } }), 0);
    assert.equal(await prisma.user.count({ where: { id: { in: [partnerId, managerId, otherId, adminId] } } }), 0);
    assert.equal(await prisma.department.count({ where: { id: { in: [deptA, deptB, deptOther] } } }), 0);
    console.log("All verification records rolled back; no test deals remain in the database.");
  } finally { await prisma.$disconnect(); }
});
