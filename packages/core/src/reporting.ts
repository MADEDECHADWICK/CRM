// packages/core/src/reporting.ts
//
// Reporting period model shared by the API (which aggregates on it) and the
// client (which renders the selector and range captions). A period is
// period-to-date: it starts at the beginning of the current calendar
// week/month/quarter/year (local time) and ends now.

import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  isInboundSource,
  type LeadSource,
} from "./lead-source";

export const REPORT_PERIODS = [
  "all",
  "week",
  "month",
  "quarter",
  "year",
  "custom",
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  all: "All time",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
  custom: "Custom range",
};

export type ReportPeriodRange = {
  from: Date;
  to: Date;
};

/**
 * Lead-source attribution and proposal-turnaround figures (BR-018).
 *
 * These live in core alongside the period model because the arithmetic is
 * the kind that has to be identical wherever it is computed: a conversion
 * rate that reads 12% on the dashboard and 13% in a board pack is worse than
 * having no figure at all.
 *
 * Conversion is measured on the SOURCE-QUALIFIED denominator, not on every
 * row that happens to carry a source. Prospect-stage rows have been entered
 * but not yet qualified, so counting them would depress every channel's rate
 * in proportion to how long the firm takes to qualify leads — a number that
 * moves for reasons unrelated to the channel being judged.
 */
export type SourceAttributionRow = {
  source: LeadSource;
  label: string;
  /** The raw attribution value, as typed at capture. */
  note: string | null;
  /** Leads recorded against this source. */
  leads: number;
  /** Of those, how many reached at least PROPOSAL. */
  reachedProposal: number;
  /** Of those, how many were won. */
  won: number;
  /** won / reachedProposal, or null when no lead got far enough to divide by. */
  proposalToWinRate: number | null;
  /** won / leads, or null with no denominator. */
  overallConversionRate: number | null;
  /** Value of deals won from this source. */
  wonValue: number;
  /** True for channels the firm pays for, so spend can be read against these. */
  paid: boolean;
};

export type SourceAttributionReport = {
  period: ReportPeriod;
  periodFrom: string | null;
  periodTo: string | null;
  rows: SourceAttributionRow[];
  totals: {
    leads: number;
    reachedProposal: number;
    won: number;
    wonValue: number;
    proposalToWinRate: number | null;
    overallConversionRate: number | null;
  };
  /**
   * Deal the OTHER bucket and an explicit note cannot fully replace: rows
   * that predate channel tracking. Surfaced rather than silently averaged in.
   */
  unattributedCount: number;
};

export type ProposalTurnaround = {
  /** Deals that reached AWAITING_FEEDBACK in the window. */
  submittedCount: number;
  /** Mean days from leadReceivedAt to proposalSubmittedAt. */
  meanLeadToSubmissionDays: number | null;
  /** Median of the same measure — resists the one 200-day outlier. */
  medianLeadToSubmissionDays: number | null;
  /** Mean days between the internal deadline and the actual submission. */
  meanDeadlineToSubmissionDays: number | null;
  /** Submissions made on or before their internal deadline. */
  onTimeCount: number;
  /** Fraction of submissions that met their internal deadline, 0–1. */
  onTimeRate: number | null;
  /** Deadlines that passed with nothing sent, flagged by the sweep. */
  breachedCount: number;
  /** Breach explanations still outstanding, owed by the assignee. */
  openBreachNoteCount: number;
  /** Explanations never given and now past their own due date. */
  escalatedBreachNoteCount: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two dates, or null if either is missing. */
export function daysBetween(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined
): number | null {
  // Nullish checked explicitly: `new Date(null)` is the epoch and
  // `new Date(undefined)` is Invalid Date, so neither throws and a missing
  // input would otherwise be silently reported as a ~20,000-day duration
  // instead of "no duration available".
  if (from == null || to == null) return null;

  const start = from instanceof Date ? from : new Date(from);
  const end = to instanceof Date ? to : new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return (end.getTime() - start.getTime()) / MS_PER_DAY;
}

/** Arithmetic mean, or null for an empty set. */
function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Median, or null for an empty set.
 *
 * Reported alongside the mean deliberately. Lead-to-submission time has a
 * long right tail — one abandoned deal that sat for eight months will drag
 * an average far enough to make normal performance look bad, and a Manager
 * given only that number will distrust the whole report.
 */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** One row of the raw input the turnaround figures are computed from. */
export const PAID_SOURCE_ROWS = LEAD_SOURCES.filter(
  (s) => !isInboundSource(s)
);

export function isPaidSource(source: LeadSource): boolean {
  return PAID_SOURCE_ROWS.includes(source);
}

export function sourceLabel(source: LeadSource): string {
  return LEAD_SOURCE_LABELS[source];
}

export type TurnaroundSample = {
  leadReceivedAt: Date | string | null;
  proposalSubmittedAt: Date | string | null;
  proposalDueAt?: Date | string | null;
};

/**
 * Derives the turnaround figures from raw samples.
 *
 * Split out from the route so the arithmetic is testable without a database,
 * and so there is exactly one definition of "on time" in the codebase.
 */
export function summariseTurnaround(
  samples: TurnaroundSample[],
  breach: { breachedCount: number; openNoteCount: number; escalatedNoteCount: number }
): ProposalTurnaround {
  const leadToSubmission: number[] = [];
  const deadlineToSubmission: number[] = [];
  let submittedCount = 0;
  let onTimeCount = 0;

  for (const sample of samples) {
    if (!sample.proposalSubmittedAt) continue;
    submittedCount += 1;

    const leadDays = sample.leadReceivedAt
      ? daysBetween(sample.leadReceivedAt, sample.proposalSubmittedAt)
      : null;
    if (leadDays !== null) leadToSubmission.push(leadDays);

    // Signed so that POSITIVE means late: slack = submitted - due, measured
    // from the internal deadline rather than the lead date, because the
    // deadline is the target the BD set themselves.
    //
    // Only compare against a deadline that actually existed. A deal sent
    // without one cannot be late against it, and counting it as on-time
    // would flatter the rate.
    if (sample.proposalDueAt) {
      const slack = daysBetween(sample.proposalDueAt, sample.proposalSubmittedAt);
      if (slack !== null) {
        deadlineToSubmission.push(slack);
        // Zero or negative is on time: the deadline is the last acceptable
        // moment, so landing exactly on it is a pass, not a miss.
        if (slack <= 0) onTimeCount += 1;
      }
    }
  }

  const deadlineComparable = deadlineToSubmission.length;

  return {
    submittedCount,
    meanLeadToSubmissionDays: mean(leadToSubmission),
    medianLeadToSubmissionDays: median(leadToSubmission),
    meanDeadlineToSubmissionDays: mean(deadlineToSubmission),
    onTimeCount,
    onTimeRate: deadlineComparable ? onTimeCount / deadlineComparable : null,
    breachedCount: breach.breachedCount,
    openBreachNoteCount: breach.openNoteCount,
    escalatedBreachNoteCount: breach.escalatedNoteCount,
  };
}

function startOfWeek(reference: Date): Date {
  const date = new Date(reference);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfQuarter(reference: Date): Date {
  const quarter = Math.floor(reference.getMonth() / 3);
  return new Date(reference.getFullYear(), quarter * 3, 1);
}

/**
 * Returns the inclusive period window for a given period, or null for
 * "all". The same helper drives both the server-side aggregation filter
 * and the client-side range caption, so they can never drift apart.
 *
 * For "custom", pass the chosen from/to window explicitly.
 */
export function reportPeriodRange(
  period: ReportPeriod,
  now: Date = new Date(),
  custom?: ReportPeriodRange
): ReportPeriodRange | null {
  if (period === "all") return null;
  if (period === "custom") {
    if (!custom) return null;
    return { from: new Date(custom.from), to: new Date(custom.to) };
  }

  const from =
    period === "week"
      ? startOfWeek(now)
      : period === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : period === "quarter"
          ? startOfQuarter(now)
          : new Date(now.getFullYear(), 0, 1);

  return { from, to: now };
}

/**
 * Validates and builds an explicit from/to window from wire values
 * (ISO-8601 strings). Returns either a valid range or a human-readable
 * reason it is not — used by the API for the custom period.
 */
export function customReportRange(
  from?: string | null,
  to?: string | null
):
  | { range: ReportPeriodRange; error?: never }
  | { range?: never; error: string } {
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  if (
    !fromDate ||
    !toDate ||
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime())
  ) {
    return { error: "A custom range requires both from and to dates." };
  }

  if (fromDate.getTime() >= toDate.getTime()) {
    return { error: "The 'from' date must be before the 'to' date." };
  }

  return { range: { from: fromDate, to: toDate } };
}