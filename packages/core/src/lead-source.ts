// packages/core/src/lead-source.ts
//
// Where leads come from (BR-018). Kept in its own file rather than inside
// crm-types.ts because it is the one domain concept that exists purely for
// measurement — the pipeline rules do not depend on it at all, but every
// channel-spend decision the firm ever makes does.
//
// OTHER exists on purpose. A hard-coded list with no escape hatch makes
// users leave the field blank or abandon the form, and a blank field is
// worse than an honest "other". A real answer recorded beats a tidy-looking
// empty one.

export const LEAD_SOURCES = [
  "REFERRAL",
  "PARTNER_REFERRAL",
  "WALK_IN",
  "WEBSITE",
  "SOCIAL_MEDIA",
  "MARKETING_CAMPAIGN",
  "EXHIBITION",
  "TENDER",
  "COLD_OUTREACH",
  "OTHER",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  REFERRAL: "Referral",
  PARTNER_REFERRAL: "Partner referral",
  WALK_IN: "Walk-in",
  WEBSITE: "Website",
  SOCIAL_MEDIA: "Social media",
  MARKETING_CAMPAIGN: "Marketing campaign",
  EXHIBITION: "Exhibition / event",
  TENDER: "Tender",
  COLD_OUTREACH: "Cold outreach",
  OTHER: "Other",
};

/** Sources the firm actively pays for, as opposed to ones that arrive free. */
export const PAID_LEAD_SOURCES: readonly LeadSource[] = [
  "MARKETING_CAMPAIGN",
  "EXHIBITION",
  "COLD_OUTREACH",
];

/** True when the source is free — an inbound or introduced lead. */
export function isInboundSource(source: LeadSource): boolean {
  return !PAID_LEAD_SOURCES.includes(source);
}
