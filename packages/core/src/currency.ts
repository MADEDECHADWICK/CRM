// packages/core/src/currency.ts
//
// Multi-currency handling for reporting.
//
// The firm records values in their native currency. Conversion to KES is a
// reporting operation and must never silently guess. An unknown currency or a
// currency with no approved rate is reported as "not available", not treated
// as KES and not converted with a placeholder.
//
// Rates are deliberately data, not a live feed, so issued reports remain
// reproducible. Each rate carries a date and source. The values below remain
// the existing placeholder set until Ronalds supplies approved rates; callers
// can pass an approved rate table from configuration.

export const BASE_CURRENCY = "KES";

export const REPORT_CURRENCIES = ["KES", "UGX", "TZS", "RWF", "USD", "EUR"] as const;
export type ReportCurrency = (typeof REPORT_CURRENCIES)[number];

export type ExchangeRate = {
  /** KES per one unit of the currency. */
  rate: number;
  /** ISO date the rate applies to. Null means the source has not dated it. */
  rateDate: string | null;
  source: string;
  /** True when this is a working placeholder, not an approved finance rate. */
  provisional: boolean;
};

/**
 * Indicative market rates as at 23 November 2026.
 *
 * They remain marked provisional because Ronalds Finance has not yet issued an
 * approved rate source. The date and source travel with every conversion so an
 * issued report can be reproduced and reviewed.
 */
export const FX_RATES: Record<string, ExchangeRate> = {
  KES: { rate: 1, rateDate: null, source: "identity", provisional: false },
  UGX: { rate: 0.0308, rateDate: "2026-11-23", source: "indicative market mid-rate", provisional: true },
  TZS: { rate: 0.0491, rateDate: "2026-11-23", source: "indicative market mid-rate", provisional: true },
  RWF: { rate: 0.0883, rateDate: "2026-11-23", source: "indicative market mid-rate", provisional: true },
  USD: { rate: 130, rateDate: "2026-11-23", source: "indicative market mid-rate", provisional: true },
  // NGO/donor reporting currency.
  EUR: { rate: 142.83, rateDate: "2026-11-23", source: "indicative market mid-rate", provisional: true },
};

/** Backwards-compatible numeric table for UI labels. */
export const FX_TO_KES: Record<string, number> = Object.fromEntries(
  Object.entries(FX_RATES).map(([currency, rate]) => [currency, rate.rate])
);

export type KesConversion = {
  available: boolean;
  amountKes: number | null;
  rate: number | null;
  rateDate: string | null;
  source: string | null;
  provisional: boolean;
  reason: string | null;
};

export function isKnownCurrency(currency: string | null | undefined): boolean {
  return typeof currency === "string" && currency in FX_RATES;
}

/**
 * Converts a native amount to KES without inventing a rate.
 *
 * `amount === null/undefined` and an unknown currency both return
 * `available: false`. KES is never converted a second time: its rate is
 * exactly 1 and the returned amount is the same number.
 */
export function convertToKes(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
  rates: Record<string, ExchangeRate> = FX_RATES
): KesConversion {
  if (amount == null || amount === "") {
    return {
      available: false,
      amountKes: null,
      rate: null,
      rateDate: null,
      source: null,
      provisional: false,
      reason: "No amount supplied.",
    };
  }

  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) {
    return {
      available: false,
      amountKes: null,
      rate: null,
      rateDate: null,
      source: null,
      provisional: false,
      reason: "Amount is not a finite number.",
    };
  }

  if (!currency) {
    return {
      available: false,
      amountKes: null,
      rate: null,
      rateDate: null,
      source: null,
      provisional: false,
      reason: "Currency is missing; the amount is not assumed to be KES.",
    };
  }

  const code = currency.toUpperCase();
  const entry = rates[code];
  if (!entry || !Number.isFinite(entry.rate) || entry.rate <= 0) {
    return {
      available: false,
      amountKes: null,
      rate: null,
      rateDate: null,
      source: entry?.source ?? null,
      provisional: false,
      reason: `No approved exchange rate is available for ${code}.`,
    };
  }

  return {
    available: true,
    amountKes: numeric * entry.rate,
    rate: entry.rate,
    rateDate: entry.rateDate,
    source: entry.source,
    provisional: entry.provisional,
    reason: entry.provisional
      ? "Converted with a provisional working rate; confirm before issuing a management report."
      : null,
  };
}

/**
 * Legacy helper retained for call sites that only need a number, but it now
 * returns null rather than silently treating an unknown currency as KES.
 */
export function toKes(
  amount: number | null | undefined,
  currency: string | null | undefined
): number | null {
  return convertToKes(amount, currency).amountKes;
}
