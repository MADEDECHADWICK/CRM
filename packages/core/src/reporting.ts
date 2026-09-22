// packages/core/src/reporting.ts
//
// Reporting period model shared by the API (which aggregates on it) and the
// client (which renders the selector and range captions). A period is
// period-to-date: it starts at the beginning of the current calendar
// week/month/quarter/year (local time) and ends now.

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