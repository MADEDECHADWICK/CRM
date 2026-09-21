// packages/core/src/format.ts
//
// The API contract, enforced in one place:
//  - Amounts cross the wire as JSON STRINGS (Prisma Decimal serialises to
//    string). Components must never call Number() on them ad hoc.
//  - Datetimes are UTC ISO-8601 (ends in "Z"); the API rejects offset
//    forms. Convert local dates with toIsoUtc before sending.

export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export function formatAmount(
  value: string | number | null | undefined,
  currency = "KES"
): string {
  return `${currency} ${toAmount(value).toLocaleString()}`;
}

export function toIsoUtc(date: Date): string {
  return date.toISOString();
}