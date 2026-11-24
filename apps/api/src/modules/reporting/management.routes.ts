import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";
import { recordAudit, getSetting } from "../../lib/audit";
import { sendCsv, sendWord } from "../../lib/exporters";
import {
  CONFIG_DEFAULTS,
  CONFIG_KEYS,
  REPORT_PERIODS,
  STAGES,
  STAGE_LABELS,
  customReportRange,
  reportPeriodRange,
  convertToKes,
  periodActivityRatio,
  summariseCohortConversion,
  canExportReportsRole,
  isGroupCommercialOversight,
  type ReportPeriod,
} from "@crm/core";

export const managementReportingRouter = Router();
managementReportingRouter.use(requireAuth);

function canAccessReporting(user: AuthedRequest["user"]): boolean {
  return user !== undefined && ["MARKETING_BD", "PARTNER", "MANAGER", "COUNTRY_LEAD", "PROPOSAL_COORDINATOR"].includes(user.role);
}

type Window = { from: Date; to: Date } | null;

function resolveWindow(period: ReportPeriod, from?: string, to?: string): { ok: true; win: Window } | { ok: false; error: string } {
  const range = period === "custom" ? customReportRange(from, to) : { range: reportPeriodRange(period) };
  if ("error" in range) return { ok: false, error: range.error ?? "Invalid period." };
  return { ok: true, win: range.range ?? null };
}

const periodQuery = z.object({
  period: z.enum(REPORT_PERIODS).default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  asOf: z.string().datetime().optional(),
});

function valueCandidate(input: {
  submittedFee: unknown;
  approvedQuotedFee: unknown;
  estimatedValue: unknown;
  amount: unknown;
  currency: string;
}) {
  const value = input.submittedFee ?? input.approvedQuotedFee ?? input.estimatedValue ?? input.amount;
  return convertToKes(value != null ? Number(value) : null, input.currency);
}

managementReportingRouter.get("/cohort-conversion", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const query = periodQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const resolved = resolveWindow(query.data.period, query.data.from, query.data.to);
  if (!resolved.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: resolved.error } });

  const rows = await prisma.opportunity.findMany({
    where: {
      AND: [
        opportunityScope(req.user),
        { isArchived: false },
        { proposalSubmittedAt: resolved.win ? { gte: resolved.win.from, lte: resolved.win.to } : { not: null } },
        { OR: [{ submissionType: null }, { submissionType: { not: "PREQUALIFICATION" } }] },
        { sourcePrequalificationId: null },
      ],
    },
    select: {
      id: true, proposalSubmittedAt: true, outcome: true, outcomeAt: true,
      submittedFee: true, approvedQuotedFee: true, estimatedValue: true, amount: true,
      currency: true, confirmedAwardValue: true, awardCurrency: true,
    },
  });

  const samples = rows.map((row) => {
    const submitted = valueCandidate(row);
    const won = convertToKes(row.confirmedAwardValue != null ? Number(row.confirmedAwardValue) : null, row.awardCurrency ?? row.currency);
    return {
      opportunityId: row.id,
      firstSubmittedAt: row.proposalSubmittedAt,
      submittedValueKes: submitted.amountKes,
      outcome: row.outcome,
      outcomeAt: row.outcomeAt,
      wonValueKes: won.amountKes,
      valueUnavailable: !submitted.available || (row.outcome === "WON" && !won.available),
    };
  });
  const asOf = query.data.asOf ? new Date(query.data.asOf) : new Date();
  const data = summariseCohortConversion(samples, asOf);
  res.json({
    success: true,
    data: {
      ...data,
      period: query.data.period,
      periodFrom: resolved.win?.from.toISOString() ?? null,
      periodTo: resolved.win?.to.toISOString() ?? null,
      refreshedAt: new Date().toISOString(),
    },
  });
});

managementReportingRouter.get("/activity-ratio", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const query = periodQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const resolved = resolveWindow(query.data.period, query.data.from, query.data.to);
  if (!resolved.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: resolved.error } });

  const scope = opportunityScope(req.user);
  const [wins, submitted] = await Promise.all([
    prisma.opportunity.count({
      where: {
        AND: [
          scope,
          { isArchived: false },
          { outcome: "WON" },
          resolved.win ? { OR: [{ outcomeAt: { gte: resolved.win.from, lte: resolved.win.to } }, { wonAt: { gte: resolved.win.from, lte: resolved.win.to } }] } : {},
        ],
      },
    }),
    prisma.opportunity.count({
      where: {
        AND: [
          scope,
          { isArchived: false },
          { proposalSubmittedAt: resolved.win ? { gte: resolved.win.from, lte: resolved.win.to } : { not: null } },
          { OR: [{ submissionType: null }, { submissionType: { not: "PREQUALIFICATION" } }] },
          { sourcePrequalificationId: null },
        ],
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      period: query.data.period,
      periodFrom: resolved.win?.from.toISOString() ?? null,
      periodTo: resolved.win?.to.toISOString() ?? null,
      ...periodActivityRatio(wins, submitted),
      refreshedAt: new Date().toISOString(),
    },
  });
});

managementReportingRouter.get("/pipeline", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const [rows, probabilities] = await Promise.all([
    prisma.opportunity.findMany({
      where: { AND: [opportunityScope(req.user), { isArchived: false }, { outcome: { in: ["OPEN", "ON_HOLD"] } }] },
      select: {
        id: true, title: true, outcome: true, stage: true, currency: true,
        submittedFee: true, approvedQuotedFee: true, estimatedValue: true, amount: true,
        nextAction: true, nextActionDueAt: true,
        organization: { select: { name: true, country: true } },
      },
    }),
    prisma.$transaction((tx) => getSetting<Record<string, number>>(tx, CONFIG_KEYS.weightedPipelineProbabilities, CONFIG_DEFAULTS[CONFIG_KEYS.weightedPipelineProbabilities] as Record<string, number>)),
  ]);

  let openValue = 0;
  let onHoldValue = 0;
  let unavailableValueCount = 0;
  let weightedValue = 0;
  let weightedAvailable = true;
  for (const row of rows) {
    const value = valueCandidate(row);
    if (!value.available) {
      unavailableValueCount += 1;
      continue;
    }
    if (row.outcome === "ON_HOLD") {
      onHoldValue += value.amountKes ?? 0;
      continue;
    }
    openValue += value.amountKes ?? 0;
    const probability = probabilities[row.stage];
    if (typeof probability !== "number") weightedAvailable = false;
    else weightedValue += (value.amountKes ?? 0) * probability;
  }

  res.json({
    success: true,
    data: {
      openCount: rows.filter((r) => r.outcome === "OPEN").length,
      onHoldCount: rows.filter((r) => r.outcome === "ON_HOLD").length,
      openValueKes: openValue,
      onHoldValueKes: onHoldValue,
      weightedValueKes: weightedAvailable ? weightedValue : null,
      weightedBasis: weightedAvailable
        ? "Uses the configured stage probabilities."
        : "Weighted pipeline unavailable: configure stage probabilities in settings.",
      unavailableValueCount,
      calculationBasis:
        "Open outcome only; on-hold shown separately; closed outcomes excluded. Values converted only where a valid approved rate exists.",
      refreshedAt: new Date().toISOString(),
      rows,
    },
  });
});

managementReportingRouter.get("/competitive-outcomes", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const query = periodQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const resolved = resolveWindow(query.data.period, query.data.from, query.data.to);
  if (!resolved.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: resolved.error } });

  const rows = await prisma.opportunity.findMany({
    where: { AND: [opportunityScope(req.user), { isArchived: false }] },
    select: { outcome: true, outcomeAt: true, lossReasonCode: true, sourcePrequalificationId: true, submissionType: true },
  });

  const inWindow = (d: Date | null) => d != null && (!resolved.win || (d >= resolved.win.from && d <= resolved.win.to));
  const competitive = rows.filter((r) => (r.outcome === "WON" || r.outcome === "LOST") && inWindow(r.outcomeAt) && !r.sourcePrequalificationId && r.submissionType !== "PREQUALIFICATION");
  const won = competitive.filter((r) => r.outcome === "WON").length;
  const lost = competitive.filter((r) => r.outcome === "LOST").length;
  const exclusions = {
    open: rows.filter((r) => r.outcome === "OPEN").length,
    onHold: rows.filter((r) => r.outcome === "ON_HOLD").length,
    prequalification: rows.filter((r) => r.sourcePrequalificationId || r.submissionType === "PREQUALIFICATION").length,
    noBid: rows.filter((r) => r.outcome === "NO_BID").length,
    withdrawn: rows.filter((r) => r.outcome === "WITHDRAWN").length,
    clientCancelled: rows.filter((r) => r.outcome === "CLIENT_CANCELLED").length,
    noAward: rows.filter((r) => r.outcome === "NO_AWARD").length,
    noResponse: rows.filter((r) => r.outcome === "NO_RESPONSE").length,
  };

  res.json({
    success: true,
    data: {
      period: query.data.period,
      periodFrom: resolved.win?.from.toISOString() ?? null,
      periodTo: resolved.win?.to.toISOString() ?? null,
      won,
      lost,
      winRateByCount: won + lost ? won / (won + lost) : null,
      undecided: rows.filter((r) => r.outcome === "OPEN").length,
      exclusions,
      calculationBasis: "Won / (Won + Lost) for competitive decisions dated in the period. Open, prequalification, no-bid, cancelled, withdrawn, no-award and no-response are excluded.",
      refreshedAt: new Date().toISOString(),
    },
  });
});

managementReportingRouter.get("/target-achievement", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  // Deliberately N/A until a time-specific target source exists. Do not
  // fabricate a baseline or denominator.
  res.json({
    success: true,
    data: {
      value: "N/A",
      numerator: null,
      denominator: null,
      reason: "No approved target source is configured. Supply a time-specific target to enable this metric.",
      calculationBasis: "Actual / target. N/A when the denominator or baseline is missing or zero.",
      refreshedAt: new Date().toISOString(),
    },
  });
});

// ── Snapshots and saved views ───────────────────────────────────────────────

managementReportingRouter.get("/snapshots", async (req: AuthedRequest, res) => {
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only group oversight can list issued report snapshots." } });
  const rows = await prisma.reportSnapshot.findMany({
    include: { generatedBy: { select: { id: true, name: true } } },
    orderBy: { generatedAt: "desc" },
    take: 200,
  });
  res.json({ success: true, data: rows });
});

managementReportingRouter.post("/snapshots", async (req: AuthedRequest, res) => {
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only group oversight can issue report snapshots." } });
  const body = z.object({
    reportKey: z.string().trim().min(1),
    params: z.unknown(),
    payload: z.unknown(),
    calculationBasis: z.string().trim().min(1),
    periodFrom: z.string().datetime().optional(),
    periodTo: z.string().datetime().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.reportSnapshot.create({
      data: {
        reportKey: body.data.reportKey,
        params: body.data.params as never,
        payload: body.data.payload as never,
        calculationBasis: body.data.calculationBasis,
        periodFrom: body.data.periodFrom ? new Date(body.data.periodFrom) : null,
        periodTo: body.data.periodTo ? new Date(body.data.periodTo) : null,
        generatedById: req.user!.id,
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "CREATE",
      entityType: "ReportSnapshot",
      entityId: created.id,
      summary: `Report snapshot issued: ${created.reportKey}`,
      metadata: { params: body.data.params },
    });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

managementReportingRouter.get("/saved-views", async (req: AuthedRequest, res) => {
  const rows = await prisma.savedReportView.findMany({
    where: { OR: [{ ownerId: req.user!.id }, { isShared: true }] },
    orderBy: { name: "asc" },
  });
  res.json({ success: true, data: rows });
});

managementReportingRouter.post("/saved-views", async (req: AuthedRequest, res) => {
  const body = z.object({
    name: z.string().trim().min(1),
    reportKey: z.string().trim().min(1),
    params: z.unknown(),
    isShared: z.boolean().default(false),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });
  const row = await prisma.savedReportView.create({
    data: { ...body.data, params: body.data.params as never, ownerId: req.user!.id },
  });
  res.status(201).json({ success: true, data: row });
});

managementReportingRouter.get("/schedules", async (req: AuthedRequest, res) => {
  if (!canExportReportsRole(req.user!.role) && !req.user!.isAdmin) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot manage report schedules." } });
  const rows = await prisma.reportSchedule.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: rows });
});

managementReportingRouter.post("/schedules", async (req: AuthedRequest, res) => {
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only group oversight can create report schedules." } });
  const body = z.object({
    name: z.string().trim().min(1),
    reportKey: z.string().trim().min(1),
    params: z.unknown(),
    cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEAR", "ANNUAL"]),
    recipients: z.array(z.string().email()).default([]),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });
  if (!body.data.recipients.length) {
    return res.status(400).json({ success: false, error: { code: "RECIPIENTS_REQUIRED", message: "Scheduled delivery needs at least one authorized recipient." } });
  }
  // No external delivery mechanism is configured in this repository. The
  // schedule is stored inactive rather than pretending it will be delivered.
  const row = await prisma.reportSchedule.create({
    data: {
      name: body.data.name,
      reportKey: body.data.reportKey,
      params: body.data.params as never,
      cadence: body.data.cadence,
      recipients: body.data.recipients as never,
      deliveryMechanism: null,
      isActive: false,
      createdById: req.user!.id,
    },
  });
  res.status(201).json({
    success: true,
    data: row,
    warning: "No external delivery mechanism is configured. The schedule is stored inactive and will not send reports.",
  });
});

managementReportingRouter.get("/wins", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const query = periodQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const resolved = resolveWindow(query.data.period, query.data.from, query.data.to);
  if (!resolved.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: resolved.error } });

  const rows = await prisma.opportunity.findMany({
    where: {
      AND: [
        opportunityScope(req.user),
        { isArchived: false },
        { outcome: "WON" },
        resolved.win ? { OR: [{ outcomeAt: { gte: resolved.win.from, lte: resolved.win.to } }, { wonAt: { gte: resolved.win.from, lte: resolved.win.to } }] } : {},
        { sourcePrequalificationId: null },
        { OR: [{ submissionType: null }, { submissionType: { not: "PREQUALIFICATION" } }] },
      ],
    },
    select: {
      id: true, title: true, outcomeAt: true, wonAt: true, currency: true, awardCurrency: true,
      confirmedAwardValue: true, submittedFee: true, approvedQuotedFee: true, estimatedValue: true, amount: true,
      awardEvidenceReference: true, awardVerificationStatus: true, engagementLetterStatus: true,
      organization: { select: { name: true, country: true } }, businessType: true,
    },
    orderBy: [{ outcomeAt: "desc" }],
    take: 2000,
  });

  let wonValueKes = 0;
  let quoteValueKes = 0;
  let unavailableWinValue = 0;
  let unavailableQuoteValue = 0;
  const out = rows.map((row) => {
    const win = convertToKes(row.confirmedAwardValue != null ? Number(row.confirmedAwardValue) : null, row.awardCurrency ?? row.currency);
    const quote = convertToKes(
      row.submittedFee != null ? Number(row.submittedFee) : row.approvedQuotedFee != null ? Number(row.approvedQuotedFee) : row.estimatedValue != null ? Number(row.estimatedValue) : row.amount != null ? Number(row.amount) : null,
      row.currency
    );
    if (win.available) wonValueKes += win.amountKes ?? 0; else unavailableWinValue += 1;
    if (quote.available) quoteValueKes += quote.amountKes ?? 0; else unavailableQuoteValue += 1;
    const variance = win.available && quote.available ? (win.amountKes ?? 0) - (quote.amountKes ?? 0) : null;
    return {
      id: row.id,
      client: row.organization?.name ?? "Unknown",
      country: row.organization?.country ?? null,
      title: row.title,
      outcomeAt: row.outcomeAt ?? row.wonAt,
      category: row.businessType,
      nativeAwardValue: row.confirmedAwardValue?.toString() ?? null,
      awardCurrency: row.awardCurrency ?? row.currency,
      awardValueKes: win.amountKes,
      quoteValueKes: quote.amountKes,
      varianceKes: variance,
      awardEvidenceReference: row.awardEvidenceReference,
      awardVerificationStatus: row.awardVerificationStatus,
      engagementLetterStatus: row.engagementLetterStatus,
    };
  });

  res.json({
    success: true,
    data: {
      period: query.data.period,
      periodFrom: resolved.win?.from.toISOString() ?? null,
      periodTo: resolved.win?.to.toISOString() ?? null,
      count: rows.length,
      wonValueKes,
      quoteValueKes,
      varianceKes: wonValueKes - quoteValueKes,
      unavailableWinValue,
      unavailableQuoteValue,
      rows: out,
      calculationBasis: "Distinct opportunities with an approved win date in the period. Confirmed award values summed once. Original quote preserved; variance shown where both values have a valid rate.",
      refreshedAt: new Date().toISOString(),
    },
  });
});

managementReportingRouter.get("/losses", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const query = periodQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const resolved = resolveWindow(query.data.period, query.data.from, query.data.to);
  if (!resolved.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: resolved.error } });

  const rows = await prisma.opportunity.findMany({
    where: {
      AND: [
        opportunityScope(req.user),
        { isArchived: false },
        resolved.win ? { outcomeAt: { gte: resolved.win.from, lte: resolved.win.to } } : {},
        { outcome: { in: ["LOST", "WITHDRAWN", "CLIENT_CANCELLED", "NO_AWARD", "NO_BID", "NO_RESPONSE"] } },
      ],
    },
    select: { outcome: true, lossReasonCode: true, lossReasonDetail: true, outcomeAt: true, title: true },
    take: 2000,
  });

  const byReason: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  for (const row of rows) {
    byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
    const key = row.lossReasonCode ?? "NOT_SUPPLIED";
    byReason[key] = (byReason[key] ?? 0) + 1;
  }

  res.json({
    success: true,
    data: {
      period: query.data.period,
      periodFrom: resolved.win?.from.toISOString() ?? null,
      periodTo: resolved.win?.to.toISOString() ?? null,
      total: rows.length,
      competitiveLosses: rows.filter((r) => r.outcome === "LOST").length,
      byOutcome,
      byReason,
      rows,
      calculationBasis: "Lost is a competitive decision. Withdrawal, client cancellation, no award, no-bid and no response are reported separately and are not counted as competitive losses.",
      refreshedAt: new Date().toISOString(),
    },
  });
});

// ── Stage-level reports ─────────────────────────────────────────────────────

type StageReportOpportunity = {
  stage: string;
  currency: string;
  amount: unknown;
  submittedFee: unknown;
  approvedQuotedFee: unknown;
  estimatedValue: unknown;
  confirmedAwardValue: unknown;
  ownerId: string | null;
  departmentId: string;
  signingPartnerId: string | null;
  owner: { id: string; name: string; role: string } | null;
  department: { id: string; name: string } | null;
  signingPartner: { id: string; name: string } | null;
  proposals: { technicalOwner: { id: string; name: string } | null }[];
};

function stageReportValue(row: StageReportOpportunity) {
  const raw = row.stage === "WON"
    ? row.confirmedAwardValue ?? row.amount
    : row.submittedFee ?? row.approvedQuotedFee ?? row.estimatedValue ?? row.amount;
  return raw == null ? null : Number(raw);
}

function stageReportGroup(row: StageReportOpportunity, dimension: string) {
  if (dimension === "partner") {
    return row.signingPartner
      ? { id: row.signingPartner.id, label: row.signingPartner.name }
      : { id: null, label: "No signing partner" };
  }
  if (dimension === "manager") {
    if (row.owner?.role === "MANAGER") return { id: row.owner.id, label: row.owner.name };
    return { id: null, label: row.owner ? `${row.owner.name} (not a Manager)` : "Unassigned" };
  }
  if (dimension === "teamLead") {
    const lead = row.proposals[0]?.technicalOwner;
    return lead ? { id: lead.id, label: lead.name } : { id: null, label: "No proposal team lead" };
  }
  return row.department
    ? { id: row.department.id, label: row.department.name }
    : { id: null, label: "Unassigned department" };
}

async function loadStageReportRows(req: AuthedRequest, parsed: { period: ReportPeriod; from?: string; to?: string; stage?: string; ownerId?: string; departmentId?: string }) {
  const resolved = resolveWindow(parsed.period, parsed.from, parsed.to);
  if (!resolved.ok) return { error: resolved.error } as const;
  const rows = await prisma.opportunity.findMany({
    where: {
      AND: [
        opportunityScope(req.user),
        { isArchived: false },
        parsed.stage ? { stage: parsed.stage as never } : {},
        parsed.ownerId ? { ownerId: parsed.ownerId } : {},
        parsed.departmentId ? { departmentId: parsed.departmentId } : {},
        resolved.win ? { stageEnteredAt: { gte: resolved.win.from, lte: resolved.win.to } } : {},
      ],
    },
    select: {
      stage: true, currency: true, amount: true, submittedFee: true, approvedQuotedFee: true,
      estimatedValue: true, confirmedAwardValue: true, ownerId: true, departmentId: true, signingPartnerId: true,
      owner: { select: { id: true, name: true, role: true } },
      department: { select: { id: true, name: true } },
      signingPartner: { select: { id: true, name: true } },
      proposals: { take: 1, orderBy: { createdAt: "desc" }, select: { technicalOwner: { select: { id: true, name: true } } } },
    },
  }) as StageReportOpportunity[];
  return { rows, window: resolved.win } as const;
}

const stageReportQuery = periodQuery.extend({
  stage: z.enum(STAGES).optional(),
  ownerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  format: z.enum(["json", "csv", "word"]).default("json"),
});

managementReportingRouter.get("/stages", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const query = stageReportQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const loaded = await loadStageReportRows(req, query.data);
  if ("error" in loaded) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: loaded.error } });

  const counts: Record<string, number> = {};
  const values: Record<string, number> = {};
  let unavailableValueCount = 0;
  for (const row of loaded.rows) {
    counts[row.stage] = (counts[row.stage] ?? 0) + 1;
    const value = stageReportValue(row);
    if (value == null) continue;
    const converted = convertToKes(value, row.currency);
    if (converted.available && converted.amountKes != null) {
      values[row.stage] = (values[row.stage] ?? 0) + converted.amountKes;
    } else {
      unavailableValueCount += 1;
    }
  }
  const total = loaded.rows.length;
  const rows = STAGES.map((stage) => ({
    stage,
    stageLabel: STAGE_LABELS[stage],
    count: counts[stage] ?? 0,
    percentage: total ? (counts[stage] ?? 0) / total : 0,
    valueKes: values[stage] ?? 0,
  }));

  const data = {
    period: query.data.period,
    periodFrom: loaded.window?.from.toISOString() ?? null,
    periodTo: loaded.window?.to.toISOString() ?? null,
    stage: query.data.stage ?? null,
    total,
    rows,
    unavailableValueCount,
    calculationBasis: "Stage counts and KES values for opportunities in scope. Value uses confirmed award for Won, otherwise submitted fee/approved quote/estimate/legacy amount. Unknown rates are not included in KES totals.",
    refreshedAt: new Date().toISOString(),
  };

  if (query.data.format === "csv" || query.data.format === "word") {
    const headers = ["Stage", "Count", "Percentage", "Value (KES)"];
    const body = rows.map((row) => [row.stageLabel, row.count, `${(row.percentage * 100).toFixed(1)}%`, row.valueKes]);
    if (query.data.format === "csv") sendCsv(res, `stage-report${query.data.stage ? `-${query.data.stage}` : ""}`, headers, body);
    else sendWord(res, `stage-report${query.data.stage ? `-${query.data.stage}` : ""}`, "Stage report", headers, body);
    return;
  }
  res.json({ success: true, data });
});

const stageBreakdownQuery = stageReportQuery.extend({
  dimension: z.enum(["partner", "manager", "teamLead", "department"]).default("partner"),
});

managementReportingRouter.get("/stage-breakdown", async (req: AuthedRequest, res) => {
  if (!canAccessReporting(req.user)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot access reports." } });
  const query = stageBreakdownQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const loaded = await loadStageReportRows(req, query.data);
  if ("error" in loaded) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: loaded.error } });

  const map = new Map<string, { id: string | null; label: string; totalCount: number; totalValueKes: number; stages: Record<string, { count: number; valueKes: number }>; unavailableValueCount: number }>();
  for (const row of loaded.rows) {
    const group = stageReportGroup(row, query.data.dimension);
    const mapKey = group.id ?? group.label;
    let entry = map.get(mapKey);
    if (!entry) {
      entry = { id: group.id, label: group.label, totalCount: 0, totalValueKes: 0, stages: {}, unavailableValueCount: 0 };
      map.set(mapKey, entry);
    }
    entry.totalCount += 1;
    const stageEntry = entry.stages[row.stage] ?? { count: 0, valueKes: 0 };
    stageEntry.count += 1;
    const value = stageReportValue(row);
    if (value != null) {
      const converted = convertToKes(value, row.currency);
      if (converted.available && converted.amountKes != null) {
        stageEntry.valueKes += converted.amountKes;
        entry.totalValueKes += converted.amountKes;
      } else {
        entry.unavailableValueCount += 1;
      }
    }
    entry.stages[row.stage] = stageEntry;
  }
  const groups = [...map.values()].sort((a, b) => b.totalCount - a.totalCount || a.label.localeCompare(b.label));

  if (query.data.format === "csv" || query.data.format === "word") {
    const headers = ["Group", "Stage", "Count", "Value (KES)"];
    const body: (string | number)[][] = [];
    for (const group of groups) {
      for (const stage of STAGES) {
        const entry = group.stages[stage];
        if (!entry?.count) continue;
        body.push([group.label, STAGE_LABELS[stage], entry.count, entry.valueKes]);
      }
    }
    if (query.data.format === "csv") sendCsv(res, `stage-breakdown-by-${query.data.dimension}`, headers, body);
    else sendWord(res, `stage-breakdown-by-${query.data.dimension}`, `Stage breakdown by ${query.data.dimension}`, headers, body);
    return;
  }

  res.json({
    success: true,
    data: {
      period: query.data.period,
      periodFrom: loaded.window?.from.toISOString() ?? null,
      periodTo: loaded.window?.to.toISOString() ?? null,
      dimension: query.data.dimension,
      stage: query.data.stage ?? null,
      groups,
      calculationBasis: "Counts and KES values grouped by the selected dimension. Unknown exchange rates are excluded from KES totals and disclosed.",
      refreshedAt: new Date().toISOString(),
    },
  });
});
