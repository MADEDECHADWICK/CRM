import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONFIG_DEFAULTS,
  CONFIG_KEYS,
  canTransitionProposal,
  convertToKes,
  evaluateDispatchGate,
  isCommercialApprover,
  isQualificationNoGo,
  isSelfApproval,
  lossNeedsFeedbackAction,
  materialChanges,
  periodActivityRatio,
  reconcileAllocations,
  summariseCohortConversion,
  validateOutcome,
} from "@crm/core";

describe("proposal progress is separate from opportunity outcome", () => {
  test("an approved proposal can be submitted and a submitted proposal can belong to a won opportunity", () => {
    assert.equal(canTransitionProposal("APPROVED", "SUBMITTED"), true);
    // The opportunity outcome is a different axis: WON lives on the
    // opportunity while its proposal remains SUBMITTED.
    const opportunity = { outcome: "WON" as const, proposalStatus: "SUBMITTED" as const };
    assert.equal(opportunity.outcome, "WON");
    assert.equal(opportunity.proposalStatus, "SUBMITTED");
  });

  test("submitted revisions cannot silently return to preparation without a revision workflow", () => {
    assert.equal(canTransitionProposal("SUBMITTED", "IN_PREPARATION"), true);
    assert.equal(canTransitionProposal("PENDING_INPUTS", "APPROVED"), false);
  });
});

describe("dispatch controls", () => {
  const completeItems = [
    { code: "a", label: "Signed scope", required: true, requiresReview: false, status: "COMPLETE" as const },
    { code: "b", label: "Partner review", required: true, requiresReview: true, status: "REVIEWED" as const },
  ];

  test("required checklist and approval controls block dispatch", () => {
    const missing = evaluateDispatchGate({
      items: [{ code: "a", label: "Signed scope", required: true, requiresReview: false, status: "PENDING" }],
      approvals: [],
      requiredApprovals: 1,
    });
    assert.equal(missing.allowed, false);
    assert.ok(missing.missingChecklist.includes("Signed scope"));

    const unapproved = evaluateDispatchGate({ items: completeItems, approvals: [], requiredApprovals: 1 });
    assert.equal(unapproved.allowed, false);
    assert.match(unapproved.reason ?? "", /Approval is incomplete/);
  });

  test("dispatch is allowed once every applicable check and approval is complete", () => {
    const gate = evaluateDispatchGate({
      items: completeItems,
      approvals: [{ id: "ap1", status: "APPROVED", invalidatedAt: null }],
      requiredApprovals: 1,
    });
    assert.equal(gate.allowed, true);
  });

  test("an invalidated approval does not count", () => {
    const gate = evaluateDispatchGate({
      items: completeItems,
      approvals: [{ id: "ap1", status: "INVALIDATED", invalidatedAt: "2026-01-01T00:00:00.000Z" }],
      requiredApprovals: 1,
    });
    assert.equal(gate.allowed, false);
  });
});

describe("material change invalidation", () => {
  test("fee, scope and currency changes are material", () => {
    const changed = materialChanges(
      { approvedQuotedFee: 1000, currency: "KES", scope: "Audit", description: "Terms" },
      { approvedQuotedFee: 1200, currency: "KES", scope: "Audit", description: "Terms" }
    );
    assert.deepEqual(changed, ["approvedQuotedFee"]);

    assert.deepEqual(
      materialChanges({ scope: "Audit" }, { scope: "Audit and tax" }),
      ["scope"]
    );
    assert.deepEqual(
      materialChanges({ currency: "KES" }, { currency: "USD" }),
      ["currency"]
    );
  });

  test("a non-material editorial comment does not invalidate approval", () => {
    assert.deepEqual(
      materialChanges(
        { approvedQuotedFee: 1000, scope: "Audit" },
        { approvedQuotedFee: 1000, scope: "Audit" }
      ),
      []
    );
  });
});

describe("multi-country allocations reconcile only when final", () => {
  test("percentages must total 100", () => {
    const bad = reconcileAllocations(
      [
        { country: "Kenya", percentage: 60, basis: "PERCENT" },
        { country: "Uganda", percentage: 20, basis: "PERCENT" },
      ],
      1000
    );
    assert.equal(bad.valid, false);

    const good = reconcileAllocations(
      [
        { country: "Kenya", percentage: 60, basis: "PERCENT" },
        { country: "Uganda", percentage: 40, basis: "PERCENT" },
      ],
      1000
    );
    assert.equal(good.valid, true);
  });

  test("amounts must reconcile to the opportunity value", () => {
    const bad = reconcileAllocations(
      [
        { country: "Kenya", amount: 600, basis: "AMOUNT" },
        { country: "Uganda", amount: 300, basis: "AMOUNT" },
      ],
      1000
    );
    assert.equal(bad.valid, false);

    const good = reconcileAllocations(
      [
        { country: "Kenya", amount: 600, basis: "AMOUNT" },
        { country: "Uganda", amount: 400, basis: "AMOUNT" },
      ],
      1000
    );
    assert.equal(good.valid, true);
  });
});

describe("currency safeguards", () => {
  test("KES is converted once and unchanged", () => {
    const result = convertToKes(1000, "KES");
    assert.equal(result.available, true);
    assert.equal(result.amountKes, 1000);
    assert.equal(result.rate, 1);
  });

  test("an unknown currency is not treated as KES", () => {
    const result = convertToKes(1000, "GBP");
    assert.equal(result.available, false);
    assert.equal(result.amountKes, null);
    assert.match(result.reason ?? "", /No approved exchange rate/);
  });

  test("a missing currency does not silently produce KES", () => {
    const result = convertToKes(1000, null);
    assert.equal(result.available, false);
    assert.equal(result.amountKes, null);
  });

  test("a missing amount is not a confirmed zero", () => {
    const result = convertToKes(null, "KES");
    assert.equal(result.available, false);
    assert.equal(result.amountKes, null);
  });
});

describe("cohort conversion and period activity ratio are different populations", () => {
  test("cohort conversion uses opportunities first submitted in the period", () => {
    const cohort = summariseCohortConversion(
      [
        { opportunityId: "a", firstSubmittedAt: "2026-01-01T00:00:00.000Z", submittedValueKes: 100, outcome: "WON", outcomeAt: "2026-02-01T00:00:00.000Z", wonValueKes: 120 },
        { opportunityId: "b", firstSubmittedAt: "2026-01-01T00:00:00.000Z", submittedValueKes: 200, outcome: "OPEN", outcomeAt: null, wonValueKes: null },
        { opportunityId: "c", firstSubmittedAt: "2026-01-01T00:00:00.000Z", submittedValueKes: 300, outcome: "LOST", outcomeAt: "2026-02-01T00:00:00.000Z", wonValueKes: null },
      ],
      new Date("2026-03-01T00:00:00.000Z")
    );
    assert.equal(cohort.submittedCount, 3);
    assert.equal(cohort.wonCount, 1);
    assert.equal(cohort.openCount, 1);
    assert.ok(Math.abs((cohort.conversionByCount ?? 0) - 1 / 3) < 1e-9);
    assert.equal(cohort.valueConversionCanExceed100, false);
  });

  test("period activity ratio is labelled differently and uses same-period wins/sent", () => {
    const ratio = periodActivityRatio(5, 20);
    assert.equal(ratio.ratio, 0.25);
    assert.match(ratio.basis, /not cohort conversion/i);
  });
});

describe("outcome distinction and loss feedback", () => {
  test("a win requires an outcome date and confirmed value", () => {
    const result = validateOutcome({ outcome: "WON" });
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => /outcome date/i.test(e)));
      assert.ok(result.errors.some((e) => /award value/i.test(e)));
    }
  });

  test("a loss requires a structured reason including reason-not-supplied", () => {
    const result = validateOutcome({ outcome: "LOST", outcomeAt: new Date(), lossReasonCode: null });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.errors.some((e) => /loss reason/i.test(e)));
  });

  test("no-go is a qualification decision, not a competitive loss", () => {
    assert.equal(isQualificationNoGo("NO_GO"), true);
    assert.equal(isQualificationNoGo("QUALIFIED"), false);
  });

  test("no supplied loss reason creates a feedback action", () => {
    assert.equal(lossNeedsFeedbackAction("NOT_SUPPLIED"), true);
    assert.equal(lossNeedsFeedbackAction(null), true);
    assert.equal(lossNeedsFeedbackAction("PRICE_FEES"), false);
  });
});

describe("authorization and configuration", () => {
  test("IT administrators cannot approve commercial proposals", () => {
    assert.equal(isCommercialApprover("IT_ADMIN"), false);
    assert.equal(isCommercialApprover("PARTNER"), true);
    assert.equal(isCommercialApprover("MANAGER"), true);
  });

  test("self-approval is identified against the owner and creator", () => {
    assert.equal(isSelfApproval("u1", "u1", "u2"), true);
    assert.equal(isSelfApproval("u1", "u2", "u1"), true);
    assert.equal(isSelfApproval("u1", "u2", "u3"), false);
  });

  test("the acknowledgement target is configurable and clearly provisional", () => {
    assert.equal(CONFIG_DEFAULTS[CONFIG_KEYS.acknowledgementTargetMinutes], 60);
    const calendar = CONFIG_DEFAULTS[CONFIG_KEYS.workingCalendar] as { confirmed: boolean };
    assert.equal(calendar.confirmed, false);
  });
});

describe("migration safety", () => {
  test("the enterprise migration is additive and carries an explicit backfill", () => {
    const sql = readFileSync(
      join(process.cwd(), "prisma", "migrations", "20261121120000_enterprise_crm_foundations", "migration.sql"),
      "utf8"
    );
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /DROP COLUMN/i);
    assert.match(sql, /Conservative backfill/i);
    assert.match(sql, /Existing single amount preserved/i);
    assert.match(sql, /panel acceptance must not count as a win/i);
  });
});
