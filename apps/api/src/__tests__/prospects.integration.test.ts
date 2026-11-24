import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assignProspect, assignAccount, createProspect, ProspectError } from "../modules/organizations/prospectActions";
import { organizationScope } from "../lib/accessScope";

// Explicitly opt in against a migrated database. All verification records live
// in one transaction which MUST roll back; CI unit tests need no database.
test("prospects can be created, assigned, reassigned and cleared while only prospect-stage pipeline records are created", {
  skip: process.env.RUN_DB_INTEGRATION !== "true", timeout: 180_000,
}, async () => {
  const { prisma } = await import("../lib/prisma");
  const rollback = new Error("verification rollback");
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const rejects = (status: number, code: string) => (error: unknown) =>
    error instanceof ProspectError && error.status === status && error.code === code;
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const suffix = randomUUID();
      const admin = await tx.user.create({ data: { name: "Verification admin", email: `verify-admin-${suffix}@example.invalid`, role: "MARKETING_BD" } });
      const partner = await tx.user.create({ data: { name: "Verification partner", email: `verify-partner-${suffix}@example.invalid`, role: "PARTNER" } });
      const manager = await tx.user.create({ data: { name: "Verification manager", email: `verify-manager-${suffix}@example.invalid`, role: "MANAGER" } });
      userIds.push(admin.id, partner.id, manager.id);
      const input = { name: `Verification prospect ${suffix}`, country: "Kenya", address: "Verification branch" };
      const prospect = await createProspect(tx, admin, { ...input, assignedToId: partner.id });
      organizationIds.push(prospect.id);
      assert.equal(prospect.assignedTo?.id, partner.id);
      assert.equal(prospect.assignedById, admin.id);
      assert.ok(prospect.assignedAt);
      assert.equal(prospect.isExistingClient, false);
      assert.ok(prospect.clientNumber?.startsWith("CL-"));
      await assert.rejects(createProspect(tx, admin, { ...input, name: input.name.toUpperCase() }), rejects(409, "DUPLICATE_ORGANIZATION"));
      await assert.rejects(createProspect(tx, manager, { name: `Unauthorized ${suffix}`, assignedToId: partner.id }), rejects(403, "FORBIDDEN"));
      await assert.rejects(assignProspect(tx, manager, prospect.id, partner.id), rejects(403, "FORBIDDEN"));
      await assert.rejects(assignProspect(tx, admin, prospect.id, randomUUID()), rejects(400, "INVALID_ASSIGNEE"));
      await assert.rejects(assignProspect(tx, partner, prospect.id, null), rejects(400, "ASSIGNEE_REQUIRED"));
      const handoff = await assignProspect(tx, partner, prospect.id, manager.id);
      assert.equal(handoff.assignedToId, manager.id);
      assert.equal(handoff.assignedById, partner.id);
      assert.ok(handoff.assignedAt);
      assert.equal(await tx.organization.count({ where: { AND: [{ id: prospect.id }, organizationScope(partner)] } }), 0);
      assert.equal(await tx.organization.count({ where: { AND: [{ id: prospect.id }, organizationScope(manager)] } }), 1);
      await assert.rejects(assignProspect(tx, partner, prospect.id, partner.id), rejects(404, "NOT_FOUND"));
      const adminOwned = await assignProspect(tx, admin, prospect.id, admin.id);
      assert.equal(adminOwned.assignedToId, admin.id);
      const moved = await assignProspect(tx, admin, prospect.id, manager.id);
      assert.equal(moved.assignedTo?.id, manager.id);
      assert.equal(await tx.organization.count({ where: { id: prospect.id, assignedToId: manager.id } }), 1);
      const cleared = await assignProspect(tx, admin, prospect.id, null);
      assert.equal(cleared.assignedTo, null);
      assert.equal(await tx.organization.count({ where: { id: prospect.id, assignedToId: null } }), 1);
      const branch = await createProspect(tx, admin, { ...input, address: "Another branch" });
      organizationIds.push(branch.id);
      assert.notEqual(branch.clientNumber, prospect.clientNumber);
      assert.equal(branch.assignedToId, admin.id);
      const own = await createProspect(tx, partner, { name: `Partner own ${suffix}` });
      organizationIds.push(own.id);
      assert.equal(own.assignedToId, partner.id);
      const partnerToAdmin = await assignProspect(tx, partner, own.id, admin.id);
      assert.equal(partnerToAdmin.assignedToId, admin.id);
      const delegated = await createProspect(tx, partner, { name: `Partner delegated ${suffix}`, assignedToId: manager.id });
      organizationIds.push(delegated.id);
      assert.equal(delegated.assignedToId, manager.id);
      assert.equal(delegated.assignedById, partner.id);
      const createdForAdmin = await createProspect(tx, partner, { name: `Partner to admin ${suffix}`, assignedToId: admin.id });
      organizationIds.push(createdForAdmin.id);
      assert.equal(createdForAdmin.assignedToId, admin.id);
      await assert.rejects(createProspect(tx, manager, { name: `Manager cannot create ${suffix}` }), rejects(403, "FORBIDDEN"));
      await assert.rejects(createProspect(tx, partner, { name: `Invalid target ${suffix}`, assignedToId: randomUUID() }), rejects(400, "INVALID_ASSIGNEE"));
      const department = await tx.department.create({ data: { name: `Prospect verification ${suffix}` } });
      const shared = await tx.organization.create({ data: { name: `Department prospect ${suffix}`, assignedDepartmentId: department.id } });
      organizationIds.push(shared.id);
      await tx.user.update({ where: { id: partner.id }, data: { departmentId: department.id } });
      await assert.rejects(assignProspect(tx, partner, shared.id, partner.id), rejects(404, "NOT_FOUND"));
      const client = await tx.organization.create({ data: { name: `Verification customer ${suffix}`, isExistingClient: true, assignedToId: partner.id } });
      organizationIds.push(client.id);
      await assert.rejects(assignProspect(tx, admin, client.id, partner.id), rejects(409, "NOT_A_PROSPECT"));
      await assert.rejects(assignAccount(tx, partner, client.id, manager.id), rejects(403, "FORBIDDEN"));
      await assert.rejects(assignAccount(tx, admin, client.id, admin.id), rejects(400, "INVALID_ASSIGNEE"));
      await assert.rejects(assignProspect(tx, admin, randomUUID(), partner.id), rejects(404, "NOT_FOUND"));
      // Assignment may auto-create an initial Prospect-stage opportunity, but
      // it must never invent a lead, proposal, win or revenue.
      const autoOpportunities = await tx.opportunity.findMany({
        where: { organizationId: { in: organizationIds } },
        select: { stage: true, amount: true, confirmedAwardValue: true },
      });
      assert.ok(autoOpportunities.every((opp) => opp.stage === "PROSPECT" && opp.amount == null && opp.confirmedAwardValue == null));
      throw rollback;
    }, { timeout: 120_000, maxWait: 30_000 }), error => error === rollback);
    assert.equal(await prisma.organization.count({ where: { id: { in: organizationIds } } }), 0);
    assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0);
  } finally { await prisma.$disconnect(); }
});
