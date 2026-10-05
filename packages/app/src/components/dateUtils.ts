export function toNoonUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
  );
}

/**
 * Formats a Date for an `<input type="date">` value.
 *
 * Uses the local calendar day rather than toISOString(), which would convert to
 * UTC first and shift the day backwards for anyone east of Greenwich — the same
 * class of bug `toNoonUTC` exists to prevent, just arriving from the other
 * direction.
 */
export function toInputDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Parses an `<input type="date">` value back into the same shape the native picker produces. */
export function fromInputDateValue(raw: string): Date | null {
  if (!raw) return null;

  const [year, month, day] = raw.split("-").map(Number);

  if (!year || !month || !day) return null;

  return toNoonUTC(new Date(year, month - 1, day));
}