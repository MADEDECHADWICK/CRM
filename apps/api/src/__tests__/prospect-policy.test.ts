import { test } from "node:test";
import assert from "node:assert/strict";
import { canCreateProspect, canReassignProspect, canReceiveProspect } from "@crm/core";

test("admins and Partners can create prospects; all current team roles can receive them", () => {
  assert.equal(canCreateProspect("MARKETING_BD"), true);
  assert.equal(canCreateProspect("PARTNER"), true);
  assert.equal(canCreateProspect("MANAGER"), false);
  for (const role of ["MARKETING_BD", "PARTNER", "MANAGER"] as const) assert.equal(canReceiveProspect(role), true);
});
test("a Partner can hand off only a directly assigned prospect", () => {
  const partner = { id: "partner", role: "PARTNER" as const };
  assert.equal(canReassignProspect(partner, "partner"), true);
  assert.equal(canReassignProspect(partner, "other"), false);
  assert.equal(canReassignProspect(partner, null), false);
  assert.equal(canReassignProspect(partner), false);
  assert.equal(canReassignProspect({ id: "manager", role: "MANAGER" }, "manager"), false);
  assert.equal(canReassignProspect({ id: "admin", role: "MARKETING_BD" }, "other"), true);
  assert.equal(canReassignProspect({ id: "admin", role: "MARKETING_BD" }, null), true);
});
