// packages/core/src/theme.ts
//
// Pure data — no React, no DOM, no React Native imports. Both apps/mobile
// and apps/web import straight from here, so a color or a label only ever
// lives in one place.
//
// The design token set below is our own system: a calm navy-ink + indigo
// identity for a professional services firm. All platform styling (RN
// StyleSheet in packages/ui, Tailwind in the web app) maps onto these.

import type { Stage, FollowupType } from "./crm-types";

export type { Stage, FollowupType };

export const tokens = {
  color: {
    brand: "#4F46E5",
    brandStrong: "#4338CA",
    brandSoft: "#EEF2FF",
    brandFaint: "#F8F9FF",
    onBrand: "#FFFFFF",

    ink: "#111827",
    inkMuted: "#5B6472",
    inkFaint: "#9AA3B2",

    canvas: "#F6F7FA",
    surface: "#FFFFFF",
    surfaceMuted: "#EEF0F5",
    surfacePressed: "#F1F3F8",
    border: "#E5E8EF",
    borderStrong: "#CFD5E1",

    success: "#059669",
    successSoft: "#ECFDF5",
    danger: "#DC2626",
    dangerSoft: "#FEF2F2",
    warning: "#D97706",
    warningSoft: "#FFFBEB",
    info: "#2563EB",
    infoSoft: "#EFF6FF",

    white: "#FFFFFF",
    overlay: "#0F1420",
  },

  type: {
    display: { fontSize: 32, fontWeight: "800", letterSpacing: -0.6 },
    h1: { fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
    h2: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    h3: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
    body: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
    bodyStrong: { fontSize: 15, fontWeight: "600" },
    caption: { fontSize: 13, fontWeight: "500" },
    micro: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  },

  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    "2xl": 24,
    "3xl": 32,
    "4xl": 40,
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    pill: 999,
  },

  shadow: {
    card: {
      shadowColor: "#0F172A",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    floated: {
      shadowColor: "#0F172A",
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    hairline: {
      shadowColor: "#0F172A",
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
  },
} as const;

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

// Human-readable labels for follow-up types (CALL | EMAIL | MEETING).
export const FOLLOWUP_TYPE_LABELS: Record<FollowupType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
};

// Amount strings arrive as JSON strings (Prisma Decimal) — route all money
// through formatAmount from ./format so the contract lives in one place.
export function fmtKES(amount: number | string): string {
  return `KES ${Number(amount).toLocaleString()}`;
}