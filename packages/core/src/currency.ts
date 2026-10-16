// packages/core/src/currency.ts
//
// Multi-currency support for the management reports.
//
// The firm has offices in Kenya, Uganda, Tanzania and Rwanda. Deals are
// recorded in the local currency they were won/submitted in, but the general
// management reports consolidate everything into Kenyan shillings. Conversion
// is therefore a reporting concern, kept in one place so a rate is never
// applied ad hoc in a screen.
//
// FX_TO_KES is KES per ONE unit of the currency. It is a plain, editable table
// rather than a live feed because the reports must be reproducible: a figure
// printed on Monday should not silently change because a rate moved on
// Tuesday. Update the rates deliberately (ideally once a period) and the
// historical reports recompute consistently.

export const BASE_CURRENCY = "KES";

export const REPORT_CURRENCIES = ["KES", "UGX", "TZS", "RWF", "USD"] as const;
export type ReportCurrency = (typeof REPORT_CURRENCIES)[number];

/** KES per 1 unit of the currency. Placeholder rates — update as needed. */
export const FX_TO_KES: Record<string, number> = {
  KES: 1,
  UGX: 0.035,
  TZS: 0.05,
  RWF: 0.095,
  USD: 129,
};

/** Convert an amount in `currency` to KES. Unknown currencies are treated as KES. */
export function toKes(amount: number, currency: string | null | undefined): number {
  const rate = currency ? FX_TO_KES[currency] : 1;
  return amount * (rate ?? 1);
}
