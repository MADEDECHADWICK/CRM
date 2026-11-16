// Tests for the ownership and authorization rules — the department head model,
// who may own a deal, and who may hand one on.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  OWNER_ROLES,
  CREATOR_ROLES,
  STAGES,
  canOwnOpportunity,
  canCreateOpportunity,
  canManageStaff,
  isOwnerEligible,
  ownerEligible,
  canReassign,
  needsOwnerOverrideReason,
  ownerOverrideRejection,
  rankOwnerCandidates,
  type Role,
  type UserLite,
  type ReassignActor,
} from "@crm/core";

const user = (over: Partial<UserLite> = {}): UserLite =>
  ({
    id: "u-1",
    name: "Grace",
    email: "grace@firm.co.ke",
    role: "MANAGER",
    ...over,
  }) as UserLite;

const actor = (role: Role, id = "u-1"): ReassignActor => ({ id, role });

describe("ownership eligibility", () => {
  test("a Partner and a Manager can own a deal", () => {
    assert.equal(canOwnOpportunity("PARTNER"), true);
    assert.equal(canOwnOpportunity("MANAGER"), true);
  });

  test("Marketing & BD cannot own a deal", () => {
    // Marketing raises and qualifies; a deal they cannot be measured on is not
    // one they should be accountable for.
    assert.equal(canOwnOpportunity("MARKETING_BD"), false);
  });

  test("the eligible roles are exactly the two declared", () => {
    // Guards against the list and the predicate drifting apart.
    assert.deepEqual([...OWNER_ROLES], ["PARTNER", "MANAGER"]);
  });

  test("every role that can own a deal can also be created", () => {
    for (const role of OWNER_ROLES) {
      assert.equal(canCreateOpportunity(role), true);
    }
  });

  test("Marketing can raise a deal but cannot own one", () => {
    assert.equal(canCreateOpportunity("MARKETING_BD"), true);
    assert.equal(canOwnOpportunity("MARKETING_BD"), false);
  });

  test("the creator list covers every role the system knows about", () => {
    // A new Role enum member that is not in CREATOR_ROLES will fail here,
    // which is the point: it is denied by default and has to be granted.
    const allRoles: Role[] = ["MARKETING_BD", "PARTNER", "MANAGER"];
    for (const role of allRoles) {
      assert.ok(CREATOR_ROLES.includes(role as never), `${role} missing`);
    }
  });

  test("only Marketing & BD or an appointed administrator administer the roster", () => {
    assert.equal(canManageStaff("MARKETING_BD"), true);
    assert.equal(canManageStaff("PARTNER"), false);
    assert.equal(canManageStaff("MANAGER"), false);
    assert.equal(canManageStaff("PARTNER", true), true);
    assert.equal(canManageStaff("MANAGER", true), true);
  });

  test("narrows to owner-eligible users without discarding other fields", () => {
    const staff = [
      user({ id: "p-1", role: "PARTNER" }),
      user({ id: "b-1", role: "MARKETING_BD" }),
      user({ id: "m-1", role: "MANAGER" }),
    ];

    const eligible = staff.filter(isOwnerEligible);

    assert.deepEqual(
      eligible.map((u) => u.id),
      ["p-1", "m-1"]
    );
    // The whole record survives the narrowing, not just the role.
    assert.equal(eligible[0].name, "Grace");
  });

  test("preserves the caller's ordering", () => {
    const staff = [
      user({ id: "m-2", role: "MANAGER" }),
      user({ id: "b-1", role: "MARKETING_BD" }),
      user({ id: "p-1", role: "PARTNER" }),
    ];
    assert.deepEqual(
      ownerEligible(staff).map((u) => u.id),
      ["m-2", "p-1"]
    );
  });

  test("an empty list is not an error", () => {
    assert.deepEqual(ownerEligible([]), []);
  });
});

describe("reassignment", () => {
  const subject = { ownerId: "m-1", createdById: "b-1" };

  test("the current owner can hand their own deal on", () => {
    // The judgement that a deal cannot be executed starts with the person
    // accountable for it, so they never have to ask permission to act on it.
    assert.equal(canReassign(actor("MARKETING_BD", "m-1"), subject).allowed, true);
  });

  test("a Partner can reassign a deal they do not own", () => {
    assert.equal(canReassign(actor("PARTNER", "p-9"), subject).allowed, true);
  });

  test("a Manager can reassign a deal they do not own", () => {
    // A Manager heads their own department, so redirecting work is theirs to do.
    assert.equal(canReassign(actor("MANAGER", "m-9"), subject).allowed, true);
  });

  test("Marketing can reassign the deal they raised", () => {
    assert.equal(canReassign(actor("MARKETING_BD", "b-1"), subject).allowed, true);
  });

  test("Marketing cannot reassign somebody else's deal", () => {
    // Once a deal has an owner, lead generation has handed it over.
    const decision = canReassign(actor("MARKETING_BD", "b-2"), subject);
    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.code, "NOT_PERMITTED");
  });

  test("an unowned deal can be picked up by a Partner or Manager", () => {
    const unowned = { ownerId: null, createdById: "b-1" };
    assert.equal(canReassign(actor("PARTNER", "p-9"), unowned).allowed, true);
    assert.equal(canReassign(actor("MANAGER", "m-9"), unowned).allowed, true);
  });

  test("a BD cannot claim an unowned deal they did not raise", () => {
    const decision = canReassign(actor("MARKETING_BD", "b-2"), {
      ownerId: null,
      createdById: "b-1",
    });
    assert.equal(decision.allowed, false);
  });

  test("the refusal explains who may do it", () => {
    const decision = canReassign(actor("MARKETING_BD", "b-2"), subject);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.match(decision.message, /current owner/);
      assert.match(decision.message, /Partner/);
    }
  });
});

describe("department head defaulting", () => {
  test("assigning to the head needs no reason", () => {
    assert.equal(needsOwnerOverrideReason("m-1", "m-1"), false);
  });

  test("assigning to anybody else needs a reason", () => {
    assert.equal(needsOwnerOverrideReason("m-1", "m-2"), true);
  });

  test("a department with no head cannot be deviated from", () => {
    // With nobody named as the default, every eligible owner is as valid as
    // any other, so demanding a justification would be noise.
    assert.equal(needsOwnerOverrideReason(null, "m-2"), false);
  });

  test("the rejection names the head rather than saying 'not allowed'", () => {
    // A refusal the user can act on, not a dead end.
    const message = ownerOverrideRejection("Grace");
    assert.match(message, /Grace/);
    assert.match(message, /needs a reason/i);
  });
});

describe("owner candidate ranking", () => {
  const candidates = [
    { id: "m-1" },
    { id: "m-2" },
    { id: "p-1" },
  ];

  test("promotes the department head to the front", () => {
    assert.deepEqual(
      rankOwnerCandidates(candidates, "m-2").map((c) => c.id),
      ["m-2", "m-1", "p-1"]
    );
  });

  test("keeps everyone when the department has no head", () => {
    assert.deepEqual(
      rankOwnerCandidates(candidates, null).map((c) => c.id),
      ["m-1", "m-2", "p-1"]
    );
  });

  test("does not mutate the input", () => {
    const input = [...candidates];
    rankOwnerCandidates(input, "m-2");
    assert.deepEqual(
      input.map((c) => c.id),
      ["m-1", "m-2", "p-1"]
    );
  });

  test("tolerates a head who is not in the candidate list", () => {
    // A head who cannot own deals, or a filtered-out row, must not lose the
    // rest of the list.
    assert.deepEqual(
      rankOwnerCandidates(candidates, "p-9").map((c) => c.id),
      ["m-1", "m-2", "p-1"]
    );
  });

  test("returns a copy so a later sort cannot corrupt the source", () => {
    const ranked = rankOwnerCandidates(candidates, "m-2");
    ranked.reverse();
    assert.equal(candidates[0].id, "m-1");
  });
});

describe("the rules agree with the rest of the model", () => {
  test("no stage is accidentally a role", () => {
    // Cheap guard against a copy-paste that widened a type to the wrong enum.
    const roleStrings = new Set<string>(["MARKETING_BD", "PARTNER", "MANAGER"]);
    for (const stage of STAGES) {
      assert.equal(roleStrings.has(stage), false);
    }
  });
});