import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { organizationScope, opportunityScope, contactScope, noteScope, followupScope, type AccessUser } from "../lib/accessScope";
import { clientDirectoryWhere, prospectDirectoryWhere, directorySearch } from "../lib/organizationViews";
import { assignAccount, ProspectError } from "../modules/organizations/prospectActions";

test("account assignments isolate members, departments, related data, totals and writes", {
  skip: process.env.RUN_DB_INTEGRATION !== "true", timeout: 180_000,
}, async () => {
  const { prisma } = await import("../lib/prisma");
  const rollback = new Error("access verification rollback");
  const suffix = randomUUID();
  const deptA = randomUUID(), deptB = randomUUID();
  const actors = {
    admin: { id: randomUUID(), role: "MARKETING_BD", departmentId: null },
    partner: { id: randomUUID(), role: "PARTNER", departmentId: deptA },
    manager: { id: randomUUID(), role: "MANAGER", departmentId: deptA },
    other: { id: randomUUID(), role: "MANAGER", departmentId: deptB },
    noDepartment: { id: randomUUID(), role: "PARTNER", departmentId: null },
  } satisfies Record<string, AccessUser>;
  const accounts = {
    privatePartner: { id: randomUUID(), assignedToId: actors.partner.id },
    privateManager: { id: randomUUID(), assignedToId: actors.manager.id },
    departmentA: { id: randomUUID(), assignedDepartmentId: deptA },
    departmentB: { id: randomUUID(), assignedDepartmentId: deptB },
    unassigned: { id: randomUUID() },
    clientPartner: { id: randomUUID(), isExistingClient: true, assignedToId: actors.partner.id },
    clientDepartmentA: { id: randomUUID(), isExistingClient: true, assignedDepartmentId: deptA },
    clientDepartmentB: { id: randomUUID(), isExistingClient: true, assignedDepartmentId: deptB },
    clientUnassigned: { id: randomUUID(), isExistingClient: true },
    wonOther: { id: randomUUID(), assignedToId: actors.other.id },
  };
  const accountIds = Object.values(accounts).map(a => a.id);
  const userIds = Object.values(actors).map(a => a.id);
  const contacts = Object.values(accounts).map(a => ({ id: randomUUID(), organizationId: a.id, name: "Verification contact", email: "verification@example.invalid" }));
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.department.createMany({ data: [{ id: deptA, name: `Verification A ${suffix}` }, { id: deptB, name: `Verification B ${suffix}` }] });
      await tx.user.createMany({ data: Object.entries(actors).map(([key, actor]) => ({ ...actor, name: `Verification ${key}`, email: `${key}-${suffix}@example.invalid` })) });
      await tx.organization.createMany({ data: Object.entries(accounts).map(([key, account]) => ({ ...account, name: `Verification scope ${key} ${suffix}` })) });
      await tx.contact.createMany({ data: contacts });
      await tx.opportunity.createMany({ data: Object.entries(accounts).map(([key, account]) => ({ id: randomUUID(), organizationId: account.id,
        title: `Verification ${key}`, service: "Verification", departmentId: deptB, createdById: actors.admin.id, ownerId: actors.other.id,
        leadSource: "REFERRAL", leadReceivedAt: new Date(), stage: key === "wonOther" ? "WON" as const : "LEAD" as const,
      })) });
      await tx.note.createMany({ data: Object.values(accounts).map(a => ({ organizationId: a.id, authorId: actors.partner.id, body: "Verification attached note" })) });
      const related = await tx.opportunity.findMany({ where: { organizationId: { in: accountIds } }, select: { id: true, organizationId: true } });
      const visibleOpportunity = related.find(o => o.organizationId === accounts.privatePartner.id)!;
      const hiddenOpportunity = related.find(o => o.organizationId === accounts.departmentB.id)!;
      const contextNotes = [randomUUID(), randomUUID(), randomUUID()];
      await tx.note.createMany({ data: [
        { id: contextNotes[0], opportunityId: hiddenOpportunity.id, authorId: actors.partner.id, body: "Hidden opportunity note" },
        { id: contextNotes[1], opportunityId: visibleOpportunity.id, organizationId: accounts.departmentB.id, authorId: actors.partner.id, body: "Mixed context must remain hidden" },
        { id: contextNotes[2], opportunityId: visibleOpportunity.id, authorId: actors.partner.id, body: "Visible opportunity note" },
      ] });
      const personal = await tx.note.create({ data: { authorId: actors.partner.id, body: "Verification personal note" } });
      await tx.followup.createMany({ data: Object.values(accounts).map(a => ({ organizationId: a.id, createdById: actors.partner.id, assignedToId: actors.partner.id, note: "Verification reminder", dueAt: new Date(Date.now() + 86400000) })) });
      const contextFollowups = [randomUUID(), randomUUID(), randomUUID()];
      await tx.followup.createMany({ data: [
        { id: contextFollowups[0], opportunityId: hiddenOpportunity.id },
        { id: contextFollowups[1], opportunityId: visibleOpportunity.id, organizationId: accounts.departmentB.id },
        { id: contextFollowups[2], opportunityId: visibleOpportunity.id },
      ].map(fields => ({ ...fields, createdById: actors.partner.id, assignedToId: actors.partner.id, note: "Context verification", dueAt: new Date(Date.now() + 86400000) })) });

      const visibleIds = async (actor: AccessUser | undefined) => (await tx.organization.findMany({
        where: { AND: [{ id: { in: accountIds } }, organizationScope(actor)] }, select: { id: true },
      })).map(a => a.id).sort();
      const expectedPartner = [accounts.privatePartner.id, accounts.departmentA.id, accounts.clientPartner.id, accounts.clientDepartmentA.id].sort();
      assert.deepEqual(await visibleIds(actors.partner), expectedPartner);
      assert.deepEqual(await visibleIds(actors.manager), [accounts.privateManager.id, accounts.departmentA.id, accounts.clientDepartmentA.id].sort());
      assert.deepEqual(await visibleIds(actors.other), [accounts.departmentB.id, accounts.clientDepartmentB.id, accounts.wonOther.id].sort());
      assert.deepEqual(await visibleIds(actors.noDepartment), []);
      assert.deepEqual(await visibleIds(undefined), []);
      assert.deepEqual(await visibleIds(actors.admin), [...accountIds].sort());

      // All fixture accounts already have a LEAD/WON opportunity, so none is
      // still an untouched prospect. Prospects only contains accounts whose
      // opportunities are all at the initial PROSPECT stage (or none at all).
      assert.equal(await tx.organization.count({ where: { AND: [{ id: { in: accountIds } }, organizationScope(actors.partner), prospectDirectoryWhere()] } }), 0);
      assert.equal(await tx.organization.count({ where: { AND: [{ id: { in: accountIds } }, organizationScope(actors.partner), clientDirectoryWhere()] } }), 2);
      assert.equal(await tx.organization.count({ where: { AND: [{ id: { in: accountIds } }, organizationScope(actors.admin), clientDirectoryWhere()] } }), 5);
      assert.equal(await tx.organization.count({ where: { AND: [{ id: { in: accountIds } }, organizationScope(actors.partner), directorySearch("Verification scope")] } }), 4);
      assert.equal(await tx.organization.findFirst({ where: { AND: [{ id: accounts.departmentB.id }, organizationScope(actors.partner)] } }), null);
      assert.equal(await tx.contact.count({ where: { AND: [{ organizationId: { in: accountIds } }, contactScope(actors.partner)] } }), 4);
      assert.equal(await tx.opportunity.count({ where: { AND: [{ organizationId: { in: accountIds } }, opportunityScope(actors.partner)] } }), 4);
      assert.equal(await tx.note.count({ where: { AND: [{ organizationId: { in: accountIds } }, noteScope(actors.partner)] } }), 4);
      assert.equal(await tx.followup.count({ where: { AND: [{ organizationId: { in: accountIds } }, followupScope(actors.partner)] } }), 4);
      assert.equal(await tx.note.count({ where: { AND: [{ id: personal.id }, noteScope(actors.other)] } }), 0);
      assert.equal(await tx.note.count({ where: { AND: [{ id: personal.id }, noteScope(actors.partner)] } }), 1);
      assert.deepEqual((await tx.note.findMany({ where: { AND: [{ id: { in: contextNotes } }, noteScope(actors.partner)] }, select: { id: true } })).map(n => n.id), [contextNotes[2]]);
      assert.deepEqual((await tx.followup.findMany({ where: { AND: [{ id: { in: contextFollowups } }, followupScope(actors.partner)] }, select: { id: true } })).map(f => f.id), [contextFollowups[2]]);

      await assert.rejects(tx.organization.update({ where: { id: accounts.departmentB.id, AND: [organizationScope(actors.partner)] }, data: { name: "Must not be written" } }), (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "P2025");
      const hiddenContact = contacts.find(c => c.organizationId === accounts.departmentB.id)!;
      await assert.rejects(tx.contact.update({ where: { id: hiddenContact.id, AND: [contactScope(actors.partner)] }, data: { name: "Must not be written" } }), (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "P2025");

      await assert.rejects(assignAccount(tx, actors.partner, accounts.clientDepartmentB.id, actors.partner.id), (e: unknown) => e instanceof ProspectError && e.status === 404);
      await assert.rejects(assignAccount(tx, actors.admin, accounts.clientPartner.id, null, randomUUID()), (e: unknown) => e instanceof ProspectError && e.code === "INVALID_DEPARTMENT");
      const sharedClient = await assignAccount(tx, actors.admin, accounts.clientPartner.id, actors.manager.id, deptB, "client");
      assert.equal(sharedClient.assignedDepartment?.id, deptB);
      assert.equal(sharedClient.assignedToId, actors.manager.id);
      await assignAccount(tx, actors.admin, accounts.privatePartner.id, actors.other.id, null);
      assert.ok(!(await visibleIds(actors.partner)).includes(accounts.privatePartner.id));
      assert.equal(await tx.contact.count({ where: { AND: [{ organizationId: accounts.privatePartner.id }, contactScope(actors.partner)] } }), 0);
      assert.equal(await tx.note.count({ where: { AND: [{ organizationId: accounts.privatePartner.id }, noteScope(actors.partner)] } }), 0);
      assert.equal(await tx.followup.count({ where: { AND: [{ organizationId: accounts.privatePartner.id }, followupScope(actors.partner)] } }), 0);

      await tx.user.update({ where: { id: actors.partner.id }, data: { departmentId: deptB } });
      const moved = await tx.user.findUniqueOrThrow({ where: { id: actors.partner.id }, select: { id: true, role: true, departmentId: true } });
      const movedIds = await visibleIds(moved);
      assert.ok(movedIds.includes(accounts.departmentB.id));
      assert.ok(movedIds.includes(accounts.clientPartner.id));
      assert.ok(!movedIds.includes(accounts.departmentA.id));
      await assignAccount(tx, actors.admin, accounts.clientPartner.id, null, null);
      assert.ok(!(await visibleIds(moved)).includes(accounts.clientPartner.id));
      // A WON deal makes an account a client even without the import flag.
      await tx.organization.update({ where: { id: accounts.wonOther.id }, data: { assignedToId: actors.partner.id } });
      await assert.rejects(assignAccount(tx, actors.partner, accounts.wonOther.id, actors.manager.id), e => e instanceof ProspectError && e.status === 403);
      throw rollback;
    }, { timeout: 120_000, maxWait: 30_000 }), error => error === rollback);
    assert.equal(await prisma.organization.count({ where: { id: { in: accountIds } } }), 0);
    assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0);
    assert.equal(await prisma.department.count({ where: { id: { in: [deptA, deptB] } } }), 0);
  } finally { await prisma.$disconnect(); }
});
