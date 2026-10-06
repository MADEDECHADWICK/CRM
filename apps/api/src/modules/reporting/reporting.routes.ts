import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import {
  requireAuth,
  AuthedRequest,
  opportunityScope,
} from "../../middleware/authorize";
import {
  REPORT_PERIODS,
  reportPeriodRange,
  customReportRange,
  ACTIVE_PROPOSAL_STAGES,
  PROPOSAL_STAGES,
  STAGES,
  ragFor,
  isPaidSource,
  sourceLabel,
  summariseTurnaround,
  type Stage,
  type StageCounts,
  type BreakdownRow,
  type ReportingBreakdown,
  type SourceAttributionRow,
  type SourceAttributionReport,
  type LeadSource,
} from "@crm/core";

export const reportingRouter = Router();
reportingRouter.use(requireAuth);

// Which roles may open reports at all, enforced as a gate before any
// aggregation runs. The data inside each report is narrowed further by
// opportunityScope() below, so a MANAGER only ever receives figures for
// their own owned opportunities even though the endpoint accepts the same
// query for every role.
function canAccessReporting(user: AuthedRequest["user"]): boolean {
  return (
    user !== undefined &&
    (user.role === "MARKETING_BD" ||
      user.role === "PARTNER" ||
      user.role === "MANAGER")
  );
}

const summaryQuerySchema = z.object({
  period: z.enum(REPORT_PERIODS).default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Every number here comes from a live aggregation over Opportunity records
// (BR-014) — never a hand-typed figure. The count fields are what make
// "CLIENTS = opportunities in WON stage" real: client status is derived,
// not stored (BR-002).
//
// The optional ?period= window filters on stageEnteredAt, i.e. deals that
// entered their current stage inside the window: "prospects raised this
// quarter", "deals won this year", etc.
reportingRouter.get("/summary", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Your role is not allowed to access reports.",
        },
      });
    }

    const query = summaryQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: query.error.message },
      });
    }

    const scope = opportunityScope(req.user);
    const range =
      query.data.period === "custom"
        ? customReportRange(query.data.from, query.data.to)
        : { range: reportPeriodRange(query.data.period) };

    if ("error" in range) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: range.error },
      });
    }

    const periodWhere = range.range
      ? { stageEnteredAt: { gte: range.range.from, lte: range.range.to } }
      : {};

    const where = <S extends string>(stage: S) => ({
      ...scope,
      ...periodWhere,
      stage,
    });

    const [prospects, leads, proposals, awaitingFeedback, clients, won, lost, activeProposals] =
      await Promise.all([
        prisma.opportunity.aggregate({
          where: where("PROSPECT"),
          _count: true,
        }),
        prisma.opportunity.aggregate({ where: where("LEAD"), _count: true }),
        prisma.opportunity.aggregate({
          where: where("PROPOSAL"),
          _count: true,
        }),
        prisma.opportunity.aggregate({
          where: where("AWAITING_FEEDBACK"),
          _count: true,
        }),
        prisma.opportunity.aggregate({ where: where("WON"), _count: true }),
        prisma.opportunity.aggregate({
          where: where("WON"),
          _sum: { amount: true },
          _count: true,
        }),
        prisma.opportunity.aggregate({
          where: where("LOST"),
          _sum: { amount: true },
          _count: true,
        }),
        // Money still in play: a proposal that has gone out and is awaiting
        // feedback is undecided, so it belongs in the active forecast just as
        // much as one still being drafted.
        prisma.opportunity.aggregate({
          where: { ...scope, ...periodWhere, stage: { in: [...ACTIVE_PROPOSAL_STAGES] } },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

    res.json({
      success: true,
      data: {
        period: query.data.period,
        periodFrom: range.range?.from.toISOString() ?? null,
        periodTo: range.range?.to.toISOString() ?? null,
        totalProspects: prospects._count,
        totalLeads: leads._count,
        totalProposals: proposals._count,
        totalAwaitingFeedback: awaitingFeedback._count,
        totalClients: clients._count,
        // Amounts are Decimal in the schema and Prisma serialises them as JSON
        // strings; breakdown and sources already convert with Number(), so
        // summary must too or the same figure is a string here and a number
        // there. Matches the `number` type on ReportingSummary.
        wonValue: Number(won._sum?.amount ?? 0),
        wonCount: won._count,
        lostValue: Number(lost._sum?.amount ?? 0),
        lostCount: lost._count,
        activeProposalValue: Number(activeProposals._sum?.amount ?? 0),
        activeProposalCount: activeProposals._count,
      },
    });
  } catch (error) {
    console.error("Reporting error:", error);
    res.status(500).json({
      success: false,
      error: { code: "REPORTING_FAILED", message: "Unable to build report." },
    });
  }
});

const STAGE_KEYS: Stage[] = [...STAGES];

const breakdownQuerySchema = z.object({
  dimension: z.enum(["owner", "department"]).default("owner"),
  period: z.enum(REPORT_PERIODS).default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Built from STAGES so a new stage is never missing a key. A missing key here
// would make `counts[stage] += n` evaluate to NaN and quietly corrupt totals.
function emptyCounts(): StageCounts {
  return Object.fromEntries(STAGE_KEYS.map((stage) => [stage, 0])) as StageCounts;
}

type GroupedDatum = {
  ownerId: string | null;
  departmentId: string | null;
  stage: Stage;
  _count: { _all: number };
  _sum: { amount: number | null };
};

// Team-level performance — the per-member (dimension=owner) and
// per-department (dimension=department) view behind the BD-only Team tab.
// Same period window as /summary, scoped exactly the same way (a MANAGER
// opening this still sees only their own deals), then grouped by the chosen
// dimension + stage and pivoted so every staff member/department appears
// even with zero activity in the window.
reportingRouter.get("/breakdown", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Your role is not allowed to access reports.",
        },
      });
    }

    const query = breakdownQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: query.error.message },
      });
    }

    const scope = opportunityScope(req.user);
    const range =
      query.data.period === "custom"
        ? customReportRange(query.data.from, query.data.to)
        : { range: reportPeriodRange(query.data.period) };

    if ("error" in range) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: range.error },
      });
    }

    const periodWhere = range.range
      ? { stageEnteredAt: { gte: range.range.from, lte: range.range.to } }
      : {};
    const where = { ...scope, ...periodWhere };

    const byOwner = query.data.dimension === "owner";

    // Every entity that can appear as a dimension — staff (Partner/Manager)
    // or all departments — so rows with zero activity in the window still
    // render as zeroes instead of vanishing.
    const [staff, departments, grouped] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ["PARTNER", "MANAGER"] } },
        select: {
          id: true,
          name: true,
          department: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      byOwner
        ? ((await prisma.opportunity.groupBy({
            by: ["ownerId", "stage"],
            _count: { _all: true },
            _sum: { amount: true },
            where,
          })) as unknown as GroupedDatum[])
        : ((await prisma.opportunity.groupBy({
            by: ["departmentId", "stage"],
            _count: { _all: true },
            _sum: { amount: true },
            where,
          })) as unknown as GroupedDatum[]),
    ]);

    const rowsMap = new Map<string, BreakdownRow>();
    if (byOwner) {
      for (const user of staff) {
        rowsMap.set(user.id, {
          id: user.id,
          name: user.name,
          subtitle: user.department?.name ?? null,
          counts: emptyCounts(),
          wonValue: 0,
          wonCount: 0,
          lostValue: 0,
          lostCount: 0,
          activeProposalValue: 0,
        });
      }
    } else {
      for (const department of departments) {
        rowsMap.set(department.id, {
          id: department.id,
          name: department.name,
          subtitle: null,
          counts: emptyCounts(),
          wonValue: 0,
          wonCount: 0,
          lostValue: 0,
          lostCount: 0,
          activeProposalValue: 0,
        });
      }
    }

    for (const group of grouped) {
      const key = byOwner ? group.ownerId : group.departmentId;
      if (!key) continue;
      const row = rowsMap.get(key);
      if (!row) continue;

      const value = group._sum.amount != null ? Number(group._sum.amount) : 0;
      const count = group._count._all;

      row.counts[group.stage] += count;
      if (group.stage === "WON") {
        row.wonValue += value;
        row.wonCount += count;
      } else if (group.stage === "LOST") {
        row.lostValue += value;
        row.lostCount += count;
      } else if (ACTIVE_PROPOSAL_STAGES.includes(group.stage)) {
        // Awaiting-feedback money is still live pipeline, so it rolls into
        // the same active total rather than disappearing from the forecast.
        row.activeProposalValue += value;
      }
    }

    const rows = Array.from(rowsMap.values());
    const totals = rows.reduce<Omit<BreakdownRow, "id" | "name" | "subtitle">>(
      (acc, row) => {
        for (const stage of STAGE_KEYS) acc.counts[stage] += row.counts[stage];
        acc.wonValue += row.wonValue;
        acc.wonCount += row.wonCount;
        acc.lostValue += row.lostValue;
        acc.lostCount += row.lostCount;
        acc.activeProposalValue += row.activeProposalValue;
        return acc;
      },
      {
        counts: emptyCounts(),
        wonValue: 0,
        wonCount: 0,
        lostValue: 0,
        lostCount: 0,
        activeProposalValue: 0,
      }
    );

    const data: ReportingBreakdown = {
      dimension: query.data.dimension,
      period: query.data.period,
      periodFrom: range.range?.from.toISOString() ?? null,
      periodTo: range.range?.to.toISOString() ?? null,
      rows,
      totals,
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error("Breakdown error:", error);
    res.status(500).json({
      success: false,
      error: { code: "REPORTING_FAILED", message: "Unable to build report." },
    });
  }
});

// ── Lead-source attribution (BR-018) ──

/**
 * Where leads come from, and which channels actually convert.
 *
 * The period window filters on leadReceivedAt, not stageEnteredAt. Channel
 * performance is a question about when the lead ARRIVED, so a deal raised in
 * March and still sitting in PROPOSAL belongs to March's cohort. Using the
 * current-stage date instead would quietly move every slow deal into
 * whichever period happens to contain today, and a channel that looks
 * productive would be one that merely happens to convert quickly.
 */
reportingRouter.get("/sources", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Your role is not allowed to access reports.",
        },
      });
    }

    const query = summaryQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: query.error.message },
      });
    }

    const scope = opportunityScope(req.user);
    const range =
      query.data.period === "custom"
        ? customReportRange(query.data.from, query.data.to)
        : { range: reportPeriodRange(query.data.period) };

    if ("error" in range) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: range.error },
      });
    }

    const where = {
      ...scope,
      ...(range.range
        ? { leadReceivedAt: { gte: range.range.from, lte: range.range.to } }
        : {}),
    };

    const grouped = await prisma.opportunity.groupBy({
      by: ["leadSource", "leadSourceNote", "stage"],
      _count: { _all: true },
      _sum: { amount: true },
      where,
    });

    type Bucket = {
      leads: number;
      reachedProposal: number;
      won: number;
      wonValue: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const g of grouped) {
      // Grouped by note as well as source so the OTHER escape hatch stays
      // legible: "OTHER: Nakuru AGM trade fair" is a real answer that can be
      // promoted into its own channel, whereas one merged OTHER bucket would
      // stay useless forever.
      const key = `${g.leadSource}::${g.leadSourceNote ?? ""}`;
      const bucket = buckets.get(key) ?? {
        leads: 0,
        reachedProposal: 0,
        won: 0,
        wonValue: 0,
      };

      const count = g._count._all;
      bucket.leads += count;
      // PROSPECT means entered but not yet qualified. Excluding it from the
      // denominator stops a channel's rate being depressed by how long the
      // firm takes to qualify, which is a number about the firm's process
      // rather than about the channel.
      if (g.stage !== "PROSPECT") bucket.reachedProposal += count;
      if (g.stage === "WON") {
        bucket.won += count;
        bucket.wonValue += g._sum.amount != null ? Number(g._sum.amount) : 0;
      }
      buckets.set(key, bucket);
    }

    const rows: SourceAttributionRow[] = [...buckets.entries()].map(([key, b]) => {
      const [source, ...noteParts] = key.split("::");
      const note = noteParts.join("::") || null;
      const typed = source as LeadSource;
      return {
        source: typed,
        label: sourceLabel(typed),
        note,
        leads: b.leads,
        reachedProposal: b.reachedProposal,
        won: b.won,
        proposalToWinRate: b.reachedProposal ? b.won / b.reachedProposal : null,
        overallConversionRate: b.leads ? b.won / b.leads : null,
        wonValue: b.wonValue,
        paid: isPaidSource(typed),
      };
    });

    // Strongest conversion first — a reader scanning the table wants the
    // answer at the top, not alphabetised by enum value.
    rows.sort((a, b) => {
      const ar = a.proposalToWinRate ?? -1;
      const br = b.proposalToWinRate ?? -1;
      if (ar !== br) return br - ar;
      return b.leads - a.leads;
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.leads += r.leads;
        acc.reachedProposal += r.reachedProposal;
        acc.won += r.won;
        acc.wonValue += r.wonValue;
        return acc;
      },
      { leads: 0, reachedProposal: 0, won: 0, wonValue: 0 }
    );

    const data: SourceAttributionReport = {
      period: query.data.period,
      periodFrom: range.range?.from.toISOString() ?? null,
      periodTo: range.range?.to.toISOString() ?? null,
      rows,
      totals: {
        ...totals,
        proposalToWinRate: totals.reachedProposal
          ? totals.won / totals.reachedProposal
          : null,
        overallConversionRate: totals.leads ? totals.won / totals.leads : null,
      },
      unattributedCount: await prisma.opportunity.count({
        where: { ...where, leadSource: "OTHER" },
      }),
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error("Source attribution error:", error);
    res.status(500).json({
      success: false,
      error: { code: "REPORTING_FAILED", message: "Unable to build source report." },
    });
  }
});

// ── Proposal turnaround and deadline discipline (BR-016 … BR-019) ──
reportingRouter.get("/proposals", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Your role is not allowed to access reports.",
        },
      });
    }

    const query = summaryQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: query.error.message },
      });
    }

    const scope = opportunityScope(req.user);
    const range =
      query.data.period === "custom"
        ? customReportRange(query.data.from, query.data.to)
        : { range: reportPeriodRange(query.data.period) };

    if ("error" in range) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: range.error },
      });
    }

    const periodWhere = range.range
      ? { stageEnteredAt: { gte: range.range.from, lte: range.range.to } }
      : {};

    // Proposals in play, so the breach counts share a population with the RAG
    // distribution below. LEAD is included because deadlines are issued from
    // qualification onward, and a lead can breach before it is a proposal.
    const stageWhere = { stage: { in: [...PROPOSAL_STAGES, "LEAD"] as Stage[] } };
    const breachWhere = { ...scope, ...periodWhere, ...stageWhere };

    const [samples, breachedCount, openNoteCount, escalatedNoteCount, ragRows] =
      await Promise.all([
        prisma.opportunity.findMany({
          where: { ...scope, ...periodWhere, proposalSubmittedAt: { not: null } },
          select: {
            leadReceivedAt: true,
            proposalSubmittedAt: true,
            proposalDueAt: true,
          },
        }),
        prisma.opportunity.count({
          where: { ...breachWhere, proposalBreachedAt: { not: null } },
        }),
        prisma.opportunity.count({
          where: { ...breachWhere, breachNoteRequired: true, breachNoteClearedAt: null },
        }),
        prisma.opportunity.count({
          where: {
            ...breachWhere,
            breachNoteRequired: true,
            breachNoteClearedAt: null,
            breachNoteDueAt: { lte: new Date() },
          },
        }),
        prisma.opportunity.findMany({
          where: { ...scope, ...periodWhere, ...stageWhere },
          select: {
            stage: true,
            proposalDueAt: true,
            proposalSubmittedAt: true,
            amount: true,
          },
        }),
      ]);

    // Tallied in JS from the same helper the list endpoint uses, rather than
    // in SQL: the classification depends on the current clock, and a SQL
    // date_trunc would reintroduce the timezone ambiguity the RAG design
    // exists to avoid.
    const distribution: Record<string, { count: number; value: number }> = {};
    for (const row of ragRows) {
      const status = ragFor(row).status;
      const entry = distribution[status] ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += row.amount != null ? Number(row.amount) : 0;
      distribution[status] = entry;
    }

    res.json({
      success: true,
      data: {
        period: query.data.period,
        periodFrom: range.range?.from.toISOString() ?? null,
        periodTo: range.range?.to.toISOString() ?? null,
        turnaround: summariseTurnaround(samples, {
          breachedCount,
          openNoteCount,
          escalatedNoteCount,
        }),
        ragDistribution: distribution,
        inFlightCount: ragRows.length,
      },
    });
  } catch (error) {
    console.error("Proposal reporting error:", error);
    res.status(500).json({
      success: false,
      error: { code: "REPORTING_FAILED", message: "Unable to build proposal report." },
    });
  }
});