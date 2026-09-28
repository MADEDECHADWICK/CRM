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
  STAGES,
  type Stage,
  type StageCounts,
  type BreakdownRow,
  type ReportingBreakdown,
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
        wonValue: won._sum?.amount ?? 0,
        wonCount: won._count,
        lostValue: lost._sum?.amount ?? 0,
        lostCount: lost._count,
        activeProposalValue: activeProposals._sum?.amount ?? 0,
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