// packages/core/src/theme.ts
//
// Pure data — no React, no DOM, no React Native imports. Both apps/mobile
// and apps/web import straight from here, so a color or a business rule
// only ever lives in one place.

export type Stage =
  | "PROSPECT"
  | "LEAD"
  | "PROPOSAL"
  | "WON"
  | "LOST"
  | "NO_REPLY"
  | "DEFERRED";

// Hex values, not Tailwind/NativeWind class strings — packages/ui maps
// these to whichever styling approach each platform needs, so this file
// stays platform-agnostic.
export const STAGE_COLORS: Record<Stage, { text: string; bg: string; dot: string }> = {
  PROSPECT:  { text: "#7c3aed", bg: "#f5f3ff", dot: "#8b5cf6" },
  LEAD:      { text: "#1d4ed8", bg: "#eff6ff", dot: "#3b82f6" },
  PROPOSAL:  { text: "#b45309", bg: "#fffbeb", dot: "#f59e0b" },
  WON:       { text: "#047857", bg: "#ecfdf5", dot: "#10b981" },
  LOST:      { text: "#b91c1c", bg: "#fef2f2", dot: "#ef4444" },
  NO_REPLY:  { text: "#475569", bg: "#f1f5f9", dot: "#94a3b8" },
  DEFERRED:  { text: "#c2410c", bg: "#fff7ed", dot: "#f97316" },
};

// A human-readable label per stage — since your enum values are
// SCREAMING_SNAKE_CASE (matching Prisma convention) but a UI shouldn't
// display "NO_REPLY" literally.
export const STAGE_LABELS: Record<Stage, string> = {
  PROSPECT: "Prospect",
  LEAD: "Lead",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
  NO_REPLY: "No Reply",
  DEFERRED: "Deferred",
};

export function fmtKES(amount: number | string): string {
  return `KES ${Number(amount).toLocaleString()}`;
}

// This MUST stay identical to the ALLOWED_TRANSITIONS in
// apps/api/src/modules/opportunities/transitionOpportunity.ts. Right now
// that file has its own copy — once apps/api depends on this package
// (`pnpm add @crm/core@workspace:*` from inside apps/api), replace that
// local copy with an import from here, so the backend's actual
// enforcement and the frontend's "which buttons should be enabled" logic
// can never drift out of sync with each other.
export const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  PROSPECT: ["LEAD"],
  LEAD: ["PROPOSAL"],
  PROPOSAL: ["WON", "LOST", "NO_REPLY", "DEFERRED"],
  DEFERRED: ["PROPOSAL", "WON", "LOST", "NO_REPLY"],
  WON: [],
  LOST: [],
  NO_REPLY: [],
};

export function canTransition(from: Stage, to: Stage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}