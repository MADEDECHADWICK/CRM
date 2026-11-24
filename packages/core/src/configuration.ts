// Versioned configuration keys.
//
// Values live in SystemSetting in the database and are edited by an authorized
// administrator. The defaults below are FALLBACKS, not firm policy. In
// particular the one-business-hour acknowledgement target is a proposed
// starting point that Ronalds must confirm, and pipeline probabilities and
// approval limits are intentionally empty until configured.

export const CONFIG_KEYS = {
  acknowledgementTargetMinutes: "service.acknowledgementTargetMinutes",
  workingCalendar: "service.workingCalendar",
  reviewReminderHours: "proposal.reviewReminderHours",
  followupDefaultIntervalDays: "followup.defaultIntervalDays",
  escalationRecipients: "escalation.recipients",
  groupAccountNewClientBasis: "account.groupAccountNewClientBasis",
  weightedPipelineProbabilities: "pipeline.weightedProbabilityByStage",
  approvalSelfApprovalProhibited: "approval.prohibitSelfApproval",
  approvalRequiredCount: "approval.requiredCount",
  approvalAmountLimits: "approval.amountLimits",
  conflictCheckRequired: "qualification.conflictCheckRequired",
  conflictCheckStatuses: "qualification.conflictCheckStatuses",
  materialChangeFields: "proposal.materialChangeFields",
  dispatchRequiresChecklist: "proposal.dispatchRequiresChecklist",
  lossFeedbackActionEnabled: "outcome.lossFeedbackActionEnabled",
  reportDefaultCurrency: "reporting.defaultCurrency",
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

export type ConfigValue = string | number | boolean | string[] | Record<string, unknown> | null;

/**
 * Deliberately conservative fallbacks. Null means "not configured, do not
 * invent a number".
 */
export const CONFIG_DEFAULTS: Record<string, ConfigValue> = {
  [CONFIG_KEYS.acknowledgementTargetMinutes]: 60,
  [CONFIG_KEYS.workingCalendar]: {
    // Provided as an editable structure, not an asserted holiday calendar.
    timezone: null,
    workingDays: [1, 2, 3, 4, 5],
    startTime: "08:00",
    endTime: "17:00",
    holidays: [],
    confirmed: false,
  },
  [CONFIG_KEYS.reviewReminderHours]: null,
  [CONFIG_KEYS.followupDefaultIntervalDays]: null,
  [CONFIG_KEYS.escalationRecipients]: [],
  [CONFIG_KEYS.groupAccountNewClientBasis]: null,
  [CONFIG_KEYS.weightedPipelineProbabilities]: {},
  [CONFIG_KEYS.approvalSelfApprovalProhibited]: true,
  [CONFIG_KEYS.approvalRequiredCount]: null,
  [CONFIG_KEYS.approvalAmountLimits]: [],
  [CONFIG_KEYS.conflictCheckRequired]: false,
  [CONFIG_KEYS.conflictCheckStatuses]: ["NOT_REQUIRED", "PENDING", "CLEARED", "CONFLICT"],
  [CONFIG_KEYS.materialChangeFields]: null,
  [CONFIG_KEYS.dispatchRequiresChecklist]: true,
  [CONFIG_KEYS.lossFeedbackActionEnabled]: true,
  [CONFIG_KEYS.reportDefaultCurrency]: "KES",
};

export const CONFIG_CATEGORIES: Record<string, string> = {
  [CONFIG_KEYS.acknowledgementTargetMinutes]: "Service levels",
  [CONFIG_KEYS.workingCalendar]: "Service levels",
  [CONFIG_KEYS.reviewReminderHours]: "Proposal",
  [CONFIG_KEYS.followupDefaultIntervalDays]: "Follow-ups",
  [CONFIG_KEYS.escalationRecipients]: "Follow-ups",
  [CONFIG_KEYS.groupAccountNewClientBasis]: "Accounts",
  [CONFIG_KEYS.weightedPipelineProbabilities]: "Reporting",
  [CONFIG_KEYS.approvalSelfApprovalProhibited]: "Approvals",
  [CONFIG_KEYS.approvalRequiredCount]: "Approvals",
  [CONFIG_KEYS.approvalAmountLimits]: "Approvals",
  [CONFIG_KEYS.conflictCheckRequired]: "Qualification",
  [CONFIG_KEYS.conflictCheckStatuses]: "Qualification",
  [CONFIG_KEYS.materialChangeFields]: "Proposal",
  [CONFIG_KEYS.dispatchRequiresChecklist]: "Proposal",
  [CONFIG_KEYS.lossFeedbackActionEnabled]: "Outcomes",
  [CONFIG_KEYS.reportDefaultCurrency]: "Reporting",
};

export function configDefault(key: string): ConfigValue {
  return CONFIG_DEFAULTS[key] ?? null;
}
