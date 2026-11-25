import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { updateUser, UserUpdateError } from "../modules/users/userActions";
import { setDepartmentHead } from "../modules/departments/departmentActions";
import { departmentPerformance } from "../modules/reporting/departmentPerformance";
import { organizationScope, type AccessUser } from "../lib/accessScope";
import { toKes } from "@crm/core";

test("profile edits, multiple headships, scoped performance and revocation", {
  skip: process.env.RUN_DB_INTEGRATION !== "true", timeout: 180_000,
}, async () => {
  const { prisma } = await import("../lib/prisma");
  const rollback = new Error("team verification rollback");
  const suffix = randomUUID();
  const a = randomUUID(), b = randomUUID(), other = randomUUID(), emptyId = randomUUID(), supervisorId = randomUUID();
  const admin: AccessUser = { id: randomUUID(), role: "MARKETING_BD" };
  const partner: AccessUser = { id: randomUUID(), role: "PARTNER", departmentId: a };
  const manager: AccessUser = { id: randomUUID(), role: "MANAGER", departmentId: a };
  const supervisor: AccessUser = { id: supervisorId, role: "PARTNER" };
  const ids = [admin.id, partner.id, manager.id, supervisorId];
  const orgA = randomUUID(), orgB = randomUUID(), orgOther = randomUUID(), hidden = randomUUID();
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.department.createMany({ data: [a, b, other].map((id, i) => ({ id, name: `Team verification ${i} ${suffix}` })) });
      const passwordHash = await bcrypt.hash("Original Password 123", 4);
      await tx.user.createMany({ data: [admin, partner, manager, supervisor].map((u, i) => ({ id: u.id, role: u.role, departmentId: u.departmentId, name: `Verification ${i}`, email: `${i}-${suffix}@example.invalid`, passwordHash })) });
      await setDepartmentHead(tx, admin, a, partner.id);
      await setDepartmentHead(tx, admin, b, partner.id);
      assert.equal(await tx.department.count({ where: { headId: partner.id } }), 2);
      await assert.rejects(setDepartmentHead(tx, manager, b, manager.id), e => e instanceof UserUpdateError && e.status === 403);
      await assert.rejects(setDepartmentHead(tx, admin, b, manager.id), e => e instanceof UserUpdateError && e.code === "HEAD_NOT_MEMBER");
      await assert.rejects(updateUser(tx, manager, partner.id, { name: "Forbidden" }), e => e instanceof UserUpdateError && e.status === 403);
      await assert.rejects(updateUser(tx, partner, partner.id, { role: "MARKETING_BD" }, true), e => e instanceof z.ZodError);
      await assert.rejects(updateUser(tx, partner, partner.id, { departmentId: other }, true), e => e instanceof z.ZodError);
      await assert.rejects(updateUser(tx, partner, manager.id, { name: "Forbidden" }, true), e => e instanceof UserUpdateError && e.status === 403);
      await assert.rejects(updateUser(tx, partner, partner.id, { name: "   " }, true), e => e instanceof z.ZodError);
      const updated = await updateUser(tx, admin, partner.id, { name: "Updated Partner", email: `EDITED-${suffix}@EXAMPLE.INVALID`, departmentId: other });
      assert.equal(updated.email, `edited-${suffix}@example.invalid`);
      assert.equal(updated.headedDepartments.length, 2);
      assert.ok(!("passwordHash" in updated));
      await assert.rejects(updateUser(tx, admin, partner.id, { role: "MANAGER" }), e => e instanceof UserUpdateError && e.code === "HEADSHIP_CONFLICT");
      await assert.rejects(updateUser(tx, partner, partner.id, { email: `new-${suffix}@example.invalid` }, true), e => e instanceof UserUpdateError && e.code === "PASSWORD_INCORRECT");
      await assert.rejects(updateUser(tx, partner, partner.id, { newPassword: "New Password 456", currentPassword: "Wrong" }, true), e => e instanceof UserUpdateError && e.code === "PASSWORD_INCORRECT");
      await assert.rejects(updateUser(tx, admin, partner.id, { email: `2-${suffix}@example.invalid` }), e => e instanceof UserUpdateError && e.code === "EMAIL_IN_USE");
      const profile = await updateUser(tx, partner, partner.id, { name: "My Updated Profile", email: `self-${suffix}@example.invalid`, currentPassword: "Original Password 123", newPassword: "New Password 456" }, true);
      assert.equal(profile.name, "My Updated Profile");
      assert.equal(profile.role, "PARTNER");
      const stored = await tx.user.findUniqueOrThrow({ where: { id: partner.id } });
      assert.ok(await bcrypt.compare("New Password 456", stored.passwordHash!));
      assert.ok(!await bcrypt.compare("Original Password 123", stored.passwordHash!));
      const actor = { ...stored, headedDepartmentIds: [a, b] };
      await tx.organization.createMany({ data: [
        { id: orgA, name: `Verification A ${suffix}`, assignedDepartmentId: a },
        { id: orgB, name: `Verification B ${suffix}`, assignedDepartmentId: b },
        { id: orgOther, name: `Verification personal ${suffix}`, assignedToId: partner.id },
        { id: hidden, name: `Verification hidden ${suffix}` },
      ] });
      const now = new Date();
      await tx.opportunity.createMany({ data: [
        { organizationId: orgA, departmentId: a, ownerId: partner.id, stage: "WON" as const, amount: 100, currency: "USD", stageEnteredAt: now },
        { organizationId: orgB, departmentId: b, ownerId: manager.id, stage: "PROPOSAL" as const, amount: 200, currency: "KES", stageEnteredAt: now },
        { organizationId: orgB, departmentId: b, ownerId: manager.id, stage: "LOST" as const, amount: 50, currency: "KES", stageEnteredAt: new Date("2020-01-01") },
        { organizationId: orgOther, departmentId: other, ownerId: partner.id, stage: "WON" as const, amount: 300, currency: "KES", stageEnteredAt: now },
        { organizationId: hidden, departmentId: b, ownerId: manager.id, stage: "WON" as const, amount: 99999, currency: "KES", stageEnteredAt: now },
      ].map(d => ({ ...d, title: `Team verification ${suffix}`, service: "Verification", createdById: admin.id, leadSource: "REFERRAL" as const, leadReceivedAt: now })) });
      assert.equal(await tx.organization.count({ where: { AND: [{ id: { in: [orgA, orgB] } }, organizationScope(actor)] } }), 2);
      const report = await departmentPerformance(tx, actor, partner.id);
      assert.equal(report.departments.length, 2);
      assert.equal(report.combined.wonCount, 2);
      const usd100Kes = toKes(100, "USD")!;
      assert.equal(report.combined.wonValue, 99999 + usd100Kes);
      assert.equal(report.combined.activeProposalValue, 200);
      assert.equal(report.combined.lostValue, 50);
      assert.equal(report.personal.wonCount, 2);
      assert.equal(report.personal.wonValue, 300 + usd100Kes);
      assert.equal(report.departments.find(d => d.id === b)!.counts.PROPOSAL, 1);
      assert.equal(await tx.organization.count({ where: { AND: [{ id: hidden }, organizationScope(actor)] } }), 0);
      assert.ok(!JSON.stringify(report).includes(hidden));
      const recent = await departmentPerformance(tx, actor, partner.id, { from: new Date("2026-01-01"), to: new Date("2027-01-01") });
      assert.equal(recent.combined.lostCount, 0);
      await assert.rejects(departmentPerformance(tx, manager, partner.id), e => e instanceof UserUpdateError && e.status === 403);
      assert.deepEqual(await departmentPerformance(tx, admin, partner.id), report);
      await setDepartmentHead(tx, admin, b, null);
      const revoked = { ...actor, headedDepartmentIds: [a] };
      assert.equal(await tx.organization.count({ where: { AND: [{ id: orgB }, organizationScope(revoked)] } }), 0);
      const after = await departmentPerformance(tx, revoked, partner.id);
      assert.equal(after.departments.length, 1);
      assert.equal(after.combined.activeProposalValue, 0);
      // Empty departments stay visible, and a Manager can lead their own.
      await setDepartmentHead(tx, admin, a, manager.id);
      const demoted = await updateUser(tx, admin, partner.id, { role: "MANAGER", supervisorPartnerId: supervisorId });
      assert.equal(demoted.role, "MANAGER");
      await setDepartmentHead(tx, admin, other, partner.id);
      const empty = await departmentPerformance(tx, manager, manager.id);
      assert.equal(empty.departments[0].id, a);
      await updateUser(tx, admin, partner.id, { role: "PARTNER" });
      await tx.department.create({ data: { id: emptyId, name: `Empty verification ${suffix}` } });
      await setDepartmentHead(tx, admin, emptyId, partner.id);
      const withEmpty = await departmentPerformance(tx, admin, partner.id);
      const emptyRow = withEmpty.departments.find(d => d.id === emptyId)!;
      assert.equal(Object.values(emptyRow.counts).reduce((sum, count) => sum + count, 0), 0);
      assert.equal(emptyRow.wonValue, 0);
      throw rollback;
    }, { timeout: 120_000, maxWait: 30_000 }), error => error === rollback);
    assert.equal(await prisma.user.count({ where: { id: { in: ids } } }), 0);
    assert.equal(await prisma.department.count({ where: { id: { in: [a, b, other, emptyId] } } }), 0);
    assert.equal(await prisma.organization.count({ where: { id: { in: [orgA, orgB, orgOther, hidden] } } }), 0);
  } finally { await prisma.$disconnect(); }
});
