// Tests for the proposal-readiness gate and the state machine it sits in.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  missingForProposal,
  isProposalReady,
  canTransition,
  allowedTargets,
  ALLOWED_TRANSITIONS,
  STAGES,
  TERMINAL_STAGES,
  DEADLINE_APPLICABLE_STAGES,
  BREACHABLE_STAGES,
  isInboundSource,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  type Contact,
  type Organization,
  type Stage,
} from "@crm/core";

const org = (over: Partial<Organization> = {}): Organization =>
  ({
    id: "org-1",
    name: "Acme",
    industry: "Banking",
    email: "info@acme.co.ke",
    phone: "+254700000000",
    address: "Nairobi",
    ...over,
  }) as Organization;

const contact = (over: Partial<Contact> = {}): Contact =>
  ({
    id: "c-1",
    organizationId: "org-1",
    name: "Jane",
    title: "Finance Lead",
    email: "jane@acme.co.ke",
    phone: "+254711111111",
    isPrimary: true,
    ...over,
  }) as Contact;

describe("missingForProposal", () => {
  test("a complete record reports nothing missing", () => {
    assert.deepEqual(
      missingForProposal({ organization: org(), contacts: [contact()] }),
      []
    );
    assert.equal(isProposalReady({ organization: org(), contacts: [contact()] }), true);
  });

  test("each required organization field is reported by name", () => {
    for (const field of ["industry", "email", "phone", "address"] as const) {
      const missing = missingForProposal({
        organization: org({ [field]: "" }),
        contacts: [contact()],
      });
      assert.ok(
        missing.some((m) => m.field === `organization.${field}`),
        `expected organization.${field} to be reported`
      );
    }
  });

  test("whitespace does not count as a value", () => {
    const missing = missingForProposal({
      organization: org({ industry: "   " }),
      contacts: [contact()],
    });
    assert.ok(missing.some((m) => m.field === "organization.industry"));
  });

  test("requires both a contact email AND a phone, not either", () => {
    // The "email OR phone" rule is the reason proposals stall; requiring
    // both is the fix, so both single-sided cases must fail.
    const emailOnly = missingForProposal({
      organization: org(),
      contacts: [contact({ phone: "" })],
    });
    assert.ok(emailOnly.some((m) => m.field === "contact.phone"));

    const phoneOnly = missingForProposal({
      organization: org(),
      contacts: [contact({ email: "" })],
    });
    assert.ok(phoneOnly.some((m) => m.field === "contact.email"));
  });

  test("a missing contact is reported as one gap, not four", () => {
    const missing = missingForProposal({ organization: org(), contacts: [] });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].field, "contact");
  });

  test("an absent organization does not throw", () => {
    const missing = missingForProposal({ organization: null, contacts: [contact()] });
    assert.ok(missing.some((m) => m.field === "organization"));
  });

  test("judges the primary contact when one is flagged", () => {
    const missing = missingForProposal({
      organization: org(),
      contacts: [
        contact({ id: "c-1", name: "Incomplete", isPrimary: false, title: "" }),
        contact({ id: "c-2", name: "Complete", isPrimary: true }),
      ],
    });
    // The flag is the firm's own statement about who matters, so the
    // incomplete secondary contact is not held against the deal.
    assert.deepEqual(missing, []);
  });

  test("falls back to the first contact when none is flagged primary", () => {
    // A record captured before the primary flag existed must not be
    // permanently blocked from progressing.
    const missing = missingForProposal({
      organization: org(),
      contacts: [contact({ id: "c-1", isPrimary: false, title: "" })],
    });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].field, "contact.title");
  });

  test("reports everything missing at once, so a form can show a checklist", () => {
    const missing = missingForProposal({
      organization: org({ industry: "", email: "" }),
      contacts: [contact({ title: "", email: "" })],
    });
    // organization.industry, organization.email, contact.title, contact.email.
    // A partial list would make the user resubmit and fail again.
    assert.equal(missing.length, 4);
    assert.deepEqual(
      missing.map((m) => m.field).sort(),
      ["contact.email", "contact.title", "organization.email", "organization.industry"]
    );
  });

  test("every message is a non-empty human sentence", () => {
    const missing = missingForProposal({ organization: org({ industry: "" }), contacts: [] });
    assert.ok(missing.length > 0);
    for (const m of missing) {
      assert.ok(m.message.length > 5, `message too terse: ${m.message}`);
      assert.ok(["ORGANIZATION", "CONTACT"].includes(m.scope));
    }
  });
});

describe("state machine integrity", () => {
  test("every stage has an entry and is reachable from PROSPECT", () => {
    for (const stage of STAGES) {
      assert.ok(ALLOWED_TRANSITIONS[stage], `${stage} missing from the transition table`);
    }
    const seen = new Set<string>(["PROSPECT"]);
    const queue: Stage[] = ["PROSPECT"];
    while (queue.length) {
      for (const next of allowedTargets(queue.shift()!)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    // An unreachable stage is a stage no user can ever get a deal into.
    assert.deepEqual([...seen].sort(), [...STAGES].sort());
  });

  test("terminal stages are dead ends", () => {
    for (const stage of TERMINAL_STAGES) {
      assert.deepEqual(allowedTargets(stage), [], `${stage} must have no exits`);
    }
  });

  test("NOT_SUBMITTED is recoverable, not terminal", () => {
    // The whole point: a missed deadline must not end the deal.
    assert.ok(!TERMINAL_STAGES.includes("NOT_SUBMITTED"));
    const targets = allowedTargets("NOT_SUBMITTED");
    assert.ok(targets.includes("PROPOSAL"), "must be able to resume the draft");
    assert.ok(targets.includes("LEAD"), "must be able to step back to qualification");
    assert.ok(targets.includes("LOST"), "must be able to drop the deal");
    assert.ok(targets.includes("DEFERRED"), "must be able to park the deal");
    assert.ok(!targets.includes("WON"), "cannot win a proposal that was never sent");
  });

  test("a won deal can never be reopened", () => {
    assert.equal(canTransition("WON", "PROPOSAL"), false);
    assert.equal(canTransition("LOST", "PROPOSAL"), false);
  });

  test("a deal can be won from any live stage that has sent a proposal", () => {
    // Winning does not have to route through AWAITING_FEEDBACK: a client can
    // accept verbally, and a DEFERRED deal can close weeks later.
    for (const from of ["PROPOSAL", "AWAITING_FEEDBACK", "DEFERRED"] as const) {
      assert.equal(canTransition(from, "WON"), true, `${from} → WON should be legal`);
    }
  });

  test("NOT_SUBMITTED cannot jump straight to WON", () => {
    // Nothing was ever sent, so there is nothing for the client to have
    // accepted. A revived deal has to go back through PROPOSAL and actually
    // be submitted before it can win.
    assert.equal(canTransition("NOT_SUBMITTED", "WON"), false);
  });

  test("a deal cannot be WON before a proposal could exist", () => {
    // A won deal is money in the bank, so a path to it has to imply a
    // proposal was at least drafted.
    for (const from of ["PROSPECT", "LEAD", "NOT_SUBMITTED"] as const) {
      assert.equal(canTransition(from, "WON"), false, `${from} → WON must be illegal`);
    }
  });

  test("losing is legal from any stage that reached a proposal", () => {
    for (const from of ["PROPOSAL", "AWAITING_FEEDBACK", "DEFERRED", "NOT_SUBMITTED"] as const) {
      assert.equal(canTransition(from, "LOST"), true, `${from} → LOST should be legal`);
    }
  });

  test("a prospect or lead cannot be marked LOST directly", () => {
    // Deliberate and pre-existing, asserted so the behaviour is a recorded
    // decision rather than an accident: a deal that never reached a proposal
    // has no proposal to lose, and closing it as LOST would put a
    // zero-value loss into the win/loss reporting.
    //
    // The practical consequence, unchanged by this work: an unqualified
    // opportunity that goes nowhere is closed by DEFERRED, or simply left.
    for (const from of ["PROSPECT", "LEAD"] as const) {
      assert.equal(canTransition(from, "LOST"), false, `${from} → LOST is currently illegal`);
    }
  });

  test("nothing leads out of a terminal stage, in any direction", () => {
    for (const from of TERMINAL_STAGES) {
      for (const to of STAGES) {
        assert.equal(canTransition(from, to), false, `${from} → ${to} must be illegal`);
      }
    }
  });

  test("the sweep can flag every stage it is allowed to act in", () => {
    for (const stage of BREACHABLE_STAGES) {
      assert.ok(
        canTransition(stage, "NOT_SUBMITTED"),
        `sweep must be able to flag ${stage} as not submitted`
      );
    }
  });

  test("nothing else can reach NOT_SUBMITTED", () => {
    // The sweep is the only thing that should ever put a deal there, plus
    // a breach from a live proposal stage. A closed or parked deal must not
    // be sweepable.
    for (const stage of STAGES) {
      const expected = BREACHABLE_STAGES.includes(stage);
      assert.equal(canTransition(stage, "NOT_SUBMITTED"), expected, `${stage} → NOT_SUBMITTED`);
    }
  });

  test("only in-scope, unsubmitted stages are breachable", () => {
    for (const stage of STAGES) {
      // NOT_SUBMITTED is deadline-scope but not breachable: the sweep must
      // not re-flag a deal it has already flagged. Everything outside
      // DEADLINE_APPLICABLE_STAGES has no countdown to miss.
      const expected = (DEADLINE_APPLICABLE_STAGES.includes(stage) && stage !== "NOT_SUBMITTED")
        ? true
        : false;
      assert.equal(BREACHABLE_STAGES.includes(stage), expected, `${stage} breachability`);
    }
  });

  test("BREACHABLE_STAGES is exactly the proposal-drafting stages", () => {
    // Spelled out rather than derived, so that changing the sweep's reach is
    // a deliberate edit to a test a reader can evaluate, not a consequence
    // of a formula.
    assert.deepEqual([...BREACHABLE_STAGES].sort(), ["LEAD", "PROPOSAL"]);
  });

  test("NOT_SUBMITTED is in scope for deadlines but is not itself swept", () => {
    // Re-arming a revived deal's deadline is legitimate, but the sweep must
    // not act again on a deal it has already flagged.
    assert.ok(DEADLINE_APPLICABLE_STAGES.includes("NOT_SUBMITTED"));
    assert.ok(!BREACHABLE_STAGES.includes("NOT_SUBMITTED"));
  });

  test("a submitted proposal stage is never breachable", () => {
    assert.ok(!BREACHABLE_STAGES.includes("AWAITING_FEEDBACK"));
  });
});

describe("lead sources", () => {
  test("every source has a label", () => {
    for (const source of LEAD_SOURCES) {
      assert.ok(LEAD_SOURCE_LABELS[source], `${source} missing a label`);
    }
  });

  test("paid sources are the ones the firm spends money on", () => {
    assert.equal(isInboundSource("WEBSITE"), true);
    assert.equal(isInboundSource("REFERRAL"), true);
    assert.equal(isInboundSource("MARKETING_CAMPAIGN"), false);
    assert.equal(isInboundSource("EXHIBITION"), false);
  });
});
