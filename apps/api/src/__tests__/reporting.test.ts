// Tests for the reporting arithmetic — the lead-source conversion maths and
// the proposal-turnaround figures.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  daysBetween,
  median,
  summariseTurnaround,
  customReportRange,
  reportPeriodRange,
  type TurnaroundSample,
} from "@crm/core";

const day = 24 * 60 * 60 * 1000;
const at = (d: number) => new Date(Date.UTC(2026, 0, 1) + d * day);
const iso = (d: number) => at(d).toISOString();

describe("daysBetween", () => {
  test("measures whole and fractional days", () => {
    assert.equal(daysBetween(at(0), at(10)), 10);
    assert.equal(daysBetween(at(0), at(0)), 0);
    assert.equal(daysBetween(at(10), at(0)), -10);
  });

  test("returns null rather than NaN for missing or bad input", () => {
    // A NaN would propagate into an average and silently blank a report.
    assert.equal(daysBetween(at(0), null as unknown as Date), null);
    assert.equal(daysBetween("nope", at(1)), null);
  });
});

describe("median", () => {
  test("is null for an empty set", () => {
    assert.equal(median([]), null);
  });

  test("averages the middle pair for an even count", () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  test("takes the true middle for an odd count", () => {
    assert.equal(median([5, 1, 3]), 3);
  });

  test("resists an outlier that would distort the mean", () => {
    const withOutlier = [10, 12, 11, 13, 400];
    assert.equal(median(withOutlier), 12);
    assert.ok((meanOf(withOutlier)) > 80, "the mean is dragged far higher");
  });
});

function meanOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe("summariseTurnaround", () => {
  const noBreach = { breachedCount: 0, openNoteCount: 0, escalatedNoteCount: 0 };

  test("counts only deals that were actually submitted", () => {
    const samples: TurnaroundSample[] = [
      { leadReceivedAt: at(0), proposalSubmittedAt: at(10) },
      { leadReceivedAt: at(0), proposalSubmittedAt: null, proposalDueAt: at(5) },
    ];
    assert.equal(summariseTurnaround(samples, noBreach).submittedCount, 1);
  });

  test("measures lead-to-submission in days", () => {
    const samples: TurnaroundSample[] = [
      { leadReceivedAt: at(0), proposalSubmittedAt: at(10) },
      { leadReceivedAt: at(0), proposalSubmittedAt: at(20) },
    ];
    const result = summariseTurnaround(samples, noBreach);
    assert.equal(result.meanLeadToSubmissionDays, 15);
    assert.equal(result.medianLeadToSubmissionDays, 15);
  });

  test("a submission with no leadReceivedAt still counts, just not the lead duration", () => {
    const samples: TurnaroundSample[] = [
      { leadReceivedAt: null, proposalSubmittedAt: at(10) },
    ];
    const result = summariseTurnaround(samples, noBreach);
    assert.equal(result.submittedCount, 1);
    assert.equal(result.meanLeadToSubmissionDays, null);
  });

  test("on-time compares against the deadline, not the lead date", () => {
    // Signed so positive means late: slack = submitted - due.
    const samples: TurnaroundSample[] = [
      // Sent one day before the internal deadline: on time, slack -1.
      { leadReceivedAt: at(0), proposalSubmittedAt: at(9), proposalDueAt: at(10) },
      // Sent five days after it: late, slack +5.
      { leadReceivedAt: at(0), proposalSubmittedAt: at(15), proposalDueAt: at(10) },
      // Sent exactly on it: on time, slack 0.
      { leadReceivedAt: at(0), proposalSubmittedAt: at(10), proposalDueAt: at(10) },
    ];
    const result = summariseTurnaround(samples, noBreach);
    assert.equal(result.onTimeCount, 2);
    assert.ok(Math.abs((result.onTimeRate ?? 0) - 2 / 3) < 1e-9);
    assert.equal(result.meanDeadlineToSubmissionDays, (-1 + 5 + 0) / 3);
  });

  test("a positive mean deadline figure means the team is running late", () => {
    // Sign convention asserted directly, since a reader of the report cannot
    // see the derivation and a flipped sign would invert the message.
    const late = summariseTurnaround(
      [{ leadReceivedAt: at(0), proposalSubmittedAt: at(20), proposalDueAt: at(10) }],
      noBreach
    );
    assert.equal(late.meanDeadlineToSubmissionDays, 10);
    assert.equal(late.onTimeRate, 0);

    const early = summariseTurnaround(
      [{ leadReceivedAt: at(0), proposalSubmittedAt: at(2), proposalDueAt: at(10) }],
      noBreach
    );
    assert.equal(early.meanDeadlineToSubmissionDays, -8);
    assert.equal(early.onTimeRate, 1);
  });

  test("a deal sent without a deadline is excluded from the on-time rate", () => {
    // Otherwise every un-deadlined proposal would count as a free pass and
    // the rate would flatter the team. Only the deal that had a comparable
    // deadline is judged, and it is on time (sent day 9 against day 10).
    const samples: TurnaroundSample[] = [
      { leadReceivedAt: at(0), proposalSubmittedAt: at(5) },
      { leadReceivedAt: at(0), proposalSubmittedAt: at(9), proposalDueAt: at(10) },
    ];
    const result = summariseTurnaround(samples, noBreach);
    assert.equal(result.submittedCount, 2);
    assert.equal(result.onTimeCount, 1);
    assert.equal(result.onTimeRate, 1, "only the comparable deal counts");
  });

  test("onTimeRate is null when nothing had a deadline", () => {
    const result = summariseTurnaround(
      [{ leadReceivedAt: at(0), proposalSubmittedAt: at(5) }],
      noBreach
    );
    assert.equal(result.onTimeRate, null);
  });

  test("all figures are null on an empty set, not zero", () => {
    // Zero would read as "we submitted nothing on time", which is a finding
    // about performance. Null reads as "no data", which is true.
    const result = summariseTurnaround([], noBreach);
    assert.equal(result.submittedCount, 0);
    assert.equal(result.meanLeadToSubmissionDays, null);
    assert.equal(result.onTimeRate, null);
  });

  test("carries the breach counts through unchanged", () => {
    const result = summariseTurnaround([], {
      breachedCount: 3,
      openNoteCount: 2,
      escalatedNoteCount: 1,
    });
    assert.equal(result.breachedCount, 3);
    assert.equal(result.openBreachNoteCount, 2);
    assert.equal(result.escalatedBreachNoteCount, 1);
  });

  test("accepts ISO strings as readily as Dates", () => {
    const result = summariseTurnaround(
      [{ leadReceivedAt: iso(0), proposalSubmittedAt: iso(7), proposalDueAt: iso(8) }],
      noBreach
    );
    assert.equal(result.meanLeadToSubmissionDays, 7);
    assert.equal(result.onTimeRate, 1);
  });
});

describe("period ranges", () => {
  test("all time has no window", () => {
    assert.equal(reportPeriodRange("all"), null);
  });

  test("period-to-date windows end now, not at the end of the period", () => {
    const now = new Date(2026, 5, 15);
    const range = reportPeriodRange("month", now)!;
    assert.equal(range.from.getMonth(), 5);
    assert.equal(range.from.getDate(), 1);
    assert.equal(range.to.getTime(), now.getTime());
  });

  test("quarters start on the right boundary", () => {
    assert.equal(reportPeriodRange("quarter", new Date(2026, 4, 15))!.from.getMonth(), 3);
    assert.equal(reportPeriodRange("quarter", new Date(2026, 7, 15))!.from.getMonth(), 6);
  });

  test("a custom range needs both ends", () => {
    assert.ok("error" in customReportRange(undefined, iso(1)));
    assert.ok("error" in customReportRange(iso(1), undefined));
  });

  test("from must precede to", () => {
    assert.ok("error" in customReportRange(iso(5), iso(1)));
  });

  test("a valid custom range is returned as dates", () => {
    const result = customReportRange(iso(1), iso(5));
    assert.ok(!("error" in result));
    assert.equal(result.range.from.getTime(), at(1).getTime());
  });
});
