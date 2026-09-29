// Tests for the RAG classifier.
//
// These live in apps/api because that is the only package with a test runner
// wired up, but they exercise @crm/core logic. The boundary cases matter
// more than the happy path: the bands are where an off-by-one turns "due
// tomorrow" into "overdue" and triggers the breach sweep on a live deal.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ragFor, isProposalOverdue, ragStatusFor } from "@crm/core";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);

describe("ragFor", () => {
  test("no deadline is NO_DEADLINE, never green", () => {
    const result = ragFor({ stage: "PROPOSAL", proposalDueAt: null }, NOW);
    assert.equal(result.status, "NO_DEADLINE");
    assert.equal(result.daysRemaining, null);
  });

  test("a missing deadline does not hide the gap behind a safe colour", () => {
    // The whole reason NO_DEADLINE exists separately from GREEN: an
    // un-deadlined deal is not "on track", it is untracked.
    assert.notEqual(ragFor({ stage: "PROPOSAL" }, NOW).status, "GREEN");
  });

  test("band boundaries are inclusive at the top of each band", () => {
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(16) }, NOW).status, "GREEN");
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(15) }, NOW).status, "AMBER");
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(6) }, NOW).status, "AMBER");
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(5) }, NOW).status, "RED");
  });

  test("today's deadline is RED, and only tomorrow is OVERDUE", () => {
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(0) }, NOW).status, "RED");
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(-1) }, NOW).status, "OVERDUE");
  });

  test("a deadline later today is RED, not AMBER", () => {
    // Guards the floor: 17:00 today from 12:00 is 5 hours, not 0 days, and
    // 0 days must not fall through the <=5 check into amber.
    const laterToday = new Date(NOW.getTime() + 5 * 60 * 60 * 1000);
    const result = ragFor({ stage: "PROPOSAL", proposalDueAt: laterToday }, NOW);
    assert.equal(result.status, "RED");
    assert.equal(result.daysRemaining, 0);
  });

  test("daysRemaining goes negative once overdue", () => {
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(-3) }, NOW).daysRemaining, -3);
  });

  test("submission wins over an expired deadline", () => {
    // A proposal sent late is still sent. Ordering this after the deadline
    // check would drag completed proposals into the breach sweep.
    const result = ragFor(
      { stage: "AWAITING_FEEDBACK", proposalDueAt: inDays(-9), proposalSubmittedAt: inDays(-10) },
      NOW
    );
    assert.equal(result.status, "SUBMITTED");
    assert.equal(result.daysRemaining, null);
  });

  test("submission wins even when no deadline was ever issued", () => {
    assert.equal(
      ragFor({ stage: "AWAITING_FEEDBACK", proposalDueAt: null, proposalSubmittedAt: inDays(-1) }, NOW)
        .status,
      "SUBMITTED"
    );
  });

  test("a deadline in a stage where drafting is not in progress is ignored", () => {
    // LEAD is deliberately NOT in this list: a drafting deadline is issued
    // from qualification onward, so LEAD counts. AWAITING_FEEDBACK is
    // excluded because the draft is finished and the client has it.
    for (const stage of ["PROSPECT", "WON", "LOST", "NO_REPLY", "DEFERRED", "AWAITING_FEEDBACK"] as const) {
      const result = ragFor({ stage, proposalDueAt: inDays(3) }, NOW);
      assert.equal(result.status, "NO_DEADLINE", `${stage} should not count a deadline`);
    }
  });

  test("a deadline counts from LEAD onward", () => {
    // Deadlines are issued before the deal is even a proposal, so the
    // countdown has to be visible while it is still a lead.
    assert.equal(ragFor({ stage: "LEAD", proposalDueAt: inDays(3) }, NOW).status, "RED");
  });

  test("NOT_SUBMITTED still counts down", () => {
    // A recovered deal's deadline matters again the moment it is re-armed.
    assert.equal(ragFor({ stage: "NOT_SUBMITTED", proposalDueAt: inDays(4) }, NOW).status, "RED");
  });

  test("accepts both Date and ISO strings", () => {
    const iso = inDays(3).toISOString();
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: iso }, NOW).status, "RED");
  });

  test("an unparseable date degrades to NO_DEADLINE instead of throwing", () => {
    // A malformed value must not take down a whole list response.
    const result = ragFor({ stage: "PROPOSAL", proposalDueAt: "not-a-date" }, NOW);
    assert.equal(result.status, "NO_DEADLINE");
  });

  test("uses the current clock when no now is supplied", () => {
    const farFuture = new Date(Date.now() + 400 * DAY);
    assert.equal(ragFor({ stage: "PROPOSAL", proposalDueAt: farFuture }).status, "GREEN");
  });
});

describe("isProposalOverdue", () => {
  test("true only for an expired, unsubmitted, in-scope deadline", () => {
    assert.equal(
      isProposalOverdue({ stage: "PROPOSAL", proposalDueAt: inDays(-1) }, NOW),
      true
    );
  });

  test("false while the deadline is still in the future", () => {
    assert.equal(
      isProposalOverdue({ stage: "PROPOSAL", proposalDueAt: inDays(1) }, NOW),
      false
    );
  });

  test("false once submitted, even when the deadline passed first", () => {
    assert.equal(
      isProposalOverdue(
        { stage: "AWAITING_FEEDBACK", proposalDueAt: inDays(-5), proposalSubmittedAt: inDays(-6) },
        NOW
      ),
      false
    );
  });

  test("false without a deadline at all", () => {
    assert.equal(isProposalOverdue({ stage: "PROPOSAL", proposalDueAt: null }, NOW), false);
  });

  test("false in out-of-scope stages", () => {
    assert.equal(
      isProposalOverdue({ stage: "DEFERRED", proposalDueAt: inDays(-30) }, NOW),
      false
    );
  });

  test("true from LEAD, since deadlines start at qualification", () => {
    assert.equal(
      isProposalOverdue({ stage: "LEAD", proposalDueAt: inDays(-1) }, NOW),
      true
    );
  });

  test("red is not overdue", () => {
    // The distinction the sweep depends on: RED must not trigger an
    // automatic stage change.
    assert.equal(
      ragFor({ stage: "PROPOSAL", proposalDueAt: inDays(1) }, NOW).status,
      "RED"
    );
    assert.equal(
      isProposalOverdue({ stage: "PROPOSAL", proposalDueAt: inDays(1) }, NOW),
      false
    );
  });
});

describe("ragStatusFor", () => {
  test("is the label-only shorthand and agrees with ragFor", () => {
    const input = { stage: "PROPOSAL" as const, proposalDueAt: inDays(7) };
    assert.equal(ragStatusFor(input, NOW), ragFor(input, NOW).status);
    assert.equal(ragStatusFor(input, NOW), "AMBER");
  });
});
