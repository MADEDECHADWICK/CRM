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
  SCORECARD_DIMENSIONS,
  toKes,
  daysBetween,
  median,
  type ReportPeriod,
  type Stage,
  type StageCounts,
  type BreakdownRow,
  type ReportingBreakdown,
  type SourceAttributionRow,
  type SourceAttributionReport,
  type LeadSource,
  type ScorecardReport,
  type ScorecardRow,
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

// ── Performance scorecard (Leads / Quotes / Sent / Wins / Booked) ───────────
//
// The core table behind the "X performance" slides. Grouped by department,
// country, signing role or industry. Money is converted to KES via the shared
// FX table so every slide consolidates to the same base currency.

const scorecardQuerySchema = z.object({
  groupBy: z.enum(SCORECARD_DIMENSIONS).default("department"),
  period: z.enum(REPORT_PERIODS).default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(["json", "csv", "word"]).default("json"),
});

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sends a report as JSON, CSV (opens in Excel) or a Word .doc, or nothing. */
function sendTabularReport(
  res: import("express").Response,
  format: "csv" | "word",
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  if (format === "csv") {
    const body = [headers, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    res.send(body);
    return;
  }

  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c == null ? "" : String(c)}</td>`).join("")}</tr>`)
    .join("");
  const html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
    `<head><meta charset='utf-8'><title>${title}</title></head><body>` +
    `<h2>${title}</h2>` +
    `<table border='1' cellspacing='0' cellpadding='6'><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `</body></html>`;
  res.setHeader("Content-Type", "application/msword");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.doc"`);
  res.send(html);
}

reportingRouter.get("/scorecard", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }

    const query = scorecardQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    }

    const scope = opportunityScope(req.user);
    const range =
      query.data.period === "custom"
        ? customReportRange(query.data.from, query.data.to)
        : { range: reportPeriodRange(query.data.period) };
    if ("error" in range) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: range.error } });
    }
    const win = range.range;
    const inWindow = (d: Date | null): boolean =>
      d != null && (!win || (d.getTime() >= win.from.getTime() && d.getTime() <= win.to.getTime()));

    const [opps, departments, users] = await Promise.all([
      prisma.opportunity.findMany({
        where: { ...scope },
        select: {
          amount: true, currency: true, leadReceivedAt: true, proposalSubmittedAt: true,
          wonAt: true, departmentId: true, signingPartnerId: true,
          organization: { select: { country: true, industry: true } },
        },
      }),
      prisma.department.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const userName = new Map(users.map((u) => [u.id, u.name]));

    const groupBy = query.data.groupBy;
    const keyOf = (o: (typeof opps)[number]): string | null =>
      groupBy === "department" ? o.departmentId
        : groupBy === "country" ? o.organization?.country ?? null
        : groupBy === "industry" ? o.organization?.industry ?? null
        : o.signingPartnerId ?? null;
    const labelOf = (k: string | null): string =>
      groupBy === "department" ? (k ? deptName.get(k) ?? "Unknown" : "Unassigned")
        : groupBy === "signingPartner" ? (k ? userName.get(k) ?? "Unknown" : "Unassigned")
        : k ?? "Unspecified";

    const map = new Map<string, ScorecardRow>();
    for (const o of opps) {
      const k = keyOf(o);
      const mapKey = k ?? "__none__";
      let row = map.get(mapKey);
      if (!row) {
        row = { key: k, label: labelOf(k), leads: 0, quotes: 0, sent: 0, wins: 0, booked: 0, winsPerSent: null };
        map.set(mapKey, row);
      }
      const kes = o.amount != null ? toKes(Number(o.amount), o.currency) : 0;
      if (inWindow(o.leadReceivedAt)) { row.leads += 1; row.quotes += kes; }
      if (inWindow(o.proposalSubmittedAt)) row.sent += 1;
      if (inWindow(o.wonAt)) { row.wins += 1; row.booked += kes; }
    }

    const rows = [...map.values()]
      .map((r) => ({ ...r, winsPerSent: r.sent ? r.wins / r.sent : null }))
      .sort((a, b) => b.booked - a.booked || b.leads - a.leads);

    const totals = rows.reduce(
      (acc, r) => ({ leads: acc.leads + r.leads, quotes: acc.quotes + r.quotes, sent: acc.sent + r.sent, wins: acc.wins + r.wins, booked: acc.booked + r.booked }),
      { leads: 0, quotes: 0, sent: 0, wins: 0, booked: 0 }
    );

    const data: ScorecardReport = {
      period: query.data.period,
      groupBy,
      periodFrom: win?.from.toISOString() ?? null,
      periodTo: win?.to.toISOString() ?? null,
      rows,
      totals: { ...totals, winsPerSent: totals.sent ? totals.wins / totals.sent : null },
    };

    if (query.data.format === "csv" || query.data.format === "word") {
      const pct = (v: number | null) => (v == null ? "N/A" : `${(v * 100).toFixed(1)}%`);
      sendTabularReport(
        res, query.data.format, `scorecard-by-${groupBy}`,
        `Performance scorecard — by ${groupBy} (${query.data.period})`,
        ["Group", "Leads", "Quotes (KES)", "Sent", "Wins", "Booked (KES)", "Wins/sent"],
        [...rows.map((r) => [r.label, r.leads, r.quotes, r.sent, r.wins, r.booked, pct(r.winsPerSent)]),
         ["Total", totals.leads, totals.quotes, totals.sent, totals.wins, totals.booked, pct(totals.sent ? totals.wins / totals.sent : null)]]
      );
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Scorecard reporting error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build scorecard." } });
  }
});

// ── Shared period parsing for the management report endpoints ───────────────

const reportQuerySchema = z.object({
  period: z.enum(REPORT_PERIODS).default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(["json", "csv", "word"]).default("json"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

type PeriodWindow = { from: Date; to: Date } | null;

function periodWindow(
  period: ReportPeriod,
  from?: string,
  to?: string
): { ok: true; win: PeriodWindow } | { ok: false; error: string } {
  const range =
    period === "custom" ? customReportRange(from, to) : { range: reportPeriodRange(period) };
  if ("error" in range) return { ok: false, error: range.error ?? "Invalid period." };
  return { ok: true, win: range.range ?? null };
}

function inWindow(d: Date | null | undefined, win: PeriodWindow): boolean {
  // A missing date never counts. With no window (period=all) we count every
  // record that HAS the date at all; with a window, only those inside it.
  return d != null && (!win || (d.getTime() >= win.from.getTime() && d.getTime() <= win.to.getTime()));
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Book of business (new / existing / cross-sell / upsell) ─────────────────
//
// New clients = the client's first-ever won job; existing = a later won job
// that is not classified as cross-sell/upsell. Cross-sell and upsell come from
// the businessType captured at Won.

const bookQuerySchema = reportQuerySchema.extend({
  groupBy: z.enum(["overall", "department"]).default("overall"),
});

reportingRouter.get("/book-of-business", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }
    const query = bookQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    const pw = periodWindow(query.data.period, query.data.from, query.data.to);
    if (!pw.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: pw.error } });

    const scope = opportunityScope(req.user);
    const [won, departments] = await Promise.all([
      prisma.opportunity.findMany({
        where: { ...scope, wonAt: { not: null } },
        select: { amount: true, currency: true, wonAt: true, businessType: true, departmentId: true, organizationId: true },
      }),
      prisma.department.findMany({ select: { id: true, name: true } }),
    ]);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));

    const firstWin = new Map<string, number>();
    for (const o of won) {
      const t = o.wonAt!.getTime();
      const current = firstWin.get(o.organizationId);
      if (current === undefined || t < current) firstWin.set(o.organizationId, t);
    }

    type Row = { key: string | null; label: string; new: number; existing: number; crossSell: number; upsell: number; total: number };
    const rowsMap = new Map<string, Row>();
    for (const o of won) {
      if (!inWindow(o.wonAt, pw.win)) continue;
      const kes = o.amount != null ? toKes(Number(o.amount), o.currency) : 0;
      const key = query.data.groupBy === "department" ? o.departmentId : null;
      const label = query.data.groupBy === "department" ? deptName.get(o.departmentId) ?? "Unknown" : "All departments";
      const mapKey = key ?? "__all__";
      let row = rowsMap.get(mapKey);
      if (!row) {
        row = { key, label, new: 0, existing: 0, crossSell: 0, upsell: 0, total: 0 };
        rowsMap.set(mapKey, row);
      }
      const isFirst = firstWin.get(o.organizationId) === o.wonAt!.getTime();
      if (o.businessType === "CROSS_SELL") row.crossSell += kes;
      else if (o.businessType === "UPSELL") row.upsell += kes;
      else if (isFirst) row.new += kes;
      else row.existing += kes;
      row.total += kes;
    }

    const rows = [...rowsMap.values()].sort((a, b) => b.total - a.total);
    const totals = rows.reduce(
      (a, r) => ({ new: a.new + r.new, existing: a.existing + r.existing, crossSell: a.crossSell + r.crossSell, upsell: a.upsell + r.upsell, total: a.total + r.total }),
      { new: 0, existing: 0, crossSell: 0, upsell: 0, total: 0 }
    );

    if (query.data.format !== "json") {
      sendTabularReport(res, query.data.format, "book-of-business", `Book of business (${query.data.period})`,
        ["Group", "New clients", "Existing clients", "Cross-sell", "Upsell", "Total (KES)"],
        [...rows.map((r) => [r.label, r.new, r.existing, r.crossSell, r.upsell, r.total]),
         ["Total", totals.new, totals.existing, totals.crossSell, totals.upsell, totals.total]]);
      return;
    }
    res.json({ success: true, data: { period: query.data.period, groupBy: query.data.groupBy, periodFrom: pw.win?.from.toISOString() ?? null, periodTo: pw.win?.to.toISOString() ?? null, rows, totals } });
  } catch (error) {
    console.error("Book of business error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build book of business." } });
  }
});

// ── Customer acquisition (first-recorded wins per month) ────────────────────

reportingRouter.get("/acquisition", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }
    const query = reportQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    const pw = periodWindow(query.data.period, query.data.from, query.data.to);
    if (!pw.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: pw.error } });

    const scope = opportunityScope(req.user);
    const won = await prisma.opportunity.findMany({ where: { ...scope, wonAt: { not: null } }, select: { wonAt: true, organizationId: true } });
    const firstWin = new Map<string, number>();
    for (const o of won) {
      const t = o.wonAt!.getTime();
      const current = firstWin.get(o.organizationId);
      if (current === undefined || t < current) firstWin.set(o.organizationId, t);
    }

    const buckets = new Map<string, number>();
    for (const firstT of firstWin.values()) {
      const d = new Date(firstT);
      if (!inWindow(d, pw.win)) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const rows = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, label: `${MONTH_LABELS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`, count }));
    const total = rows.reduce((a, r) => a + r.count, 0);

    if (query.data.format !== "json") {
      sendTabularReport(res, query.data.format, "customer-acquisition", `Customer acquisition (${query.data.period})`,
        ["Month", "First-recorded acquisitions"], [...rows.map((r) => [r.label, r.count]), ["Total", total]]);
      return;
    }
    res.json({ success: true, data: { period: query.data.period, periodFrom: pw.win?.from.toISOString() ?? null, periodTo: pw.win?.to.toISOString() ?? null, rows, total } });
  } catch (error) {
    console.error("Acquisition error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build acquisition report." } });
  }
});

// ── Industry performance (quoted demand + booked fees) ──────────────────────

reportingRouter.get("/industry", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }
    const query = reportQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    const pw = periodWindow(query.data.period, query.data.from, query.data.to);
    if (!pw.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: pw.error } });

    const scope = opportunityScope(req.user);
    const opps = await prisma.opportunity.findMany({
      where: { ...scope },
      select: { amount: true, currency: true, leadReceivedAt: true, wonAt: true, organization: { select: { industry: true } } },
    });
    const map = new Map<string, { key: string | null; label: string; quoted: number; booked: number }>();
    for (const o of opps) {
      const industry = o.organization?.industry ?? null;
      const mapKey = industry ?? "__none__";
      let row = map.get(mapKey);
      if (!row) { row = { key: industry, label: industry ?? "Unspecified", quoted: 0, booked: 0 }; map.set(mapKey, row); }
      const kes = o.amount != null ? toKes(Number(o.amount), o.currency) : 0;
      if (inWindow(o.leadReceivedAt, pw.win)) row.quoted += kes;
      if (inWindow(o.wonAt, pw.win)) row.booked += kes;
    }
    const rows = [...map.values()].filter((r) => r.quoted !== 0 || r.booked !== 0).sort((a, b) => b.booked - a.booked || b.quoted - a.quoted);

    if (query.data.format !== "json") {
      sendTabularReport(res, query.data.format, "industry-performance", `Industry performance (${query.data.period})`,
        ["Industry", "Quoted (KES)", "Booked (KES)"], rows.map((r) => [r.label, r.quoted, r.booked]));
      return;
    }
    res.json({ success: true, data: { period: query.data.period, periodFrom: pw.win?.from.toISOString() ?? null, periodTo: pw.win?.to.toISOString() ?? null, rows } });
  } catch (error) {
    console.error("Industry error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build industry report." } });
  }
});

// ── Client priorities (largest booked accounts) ─────────────────────────────

reportingRouter.get("/client-priorities", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }
    const query = reportQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    const pw = periodWindow(query.data.period, query.data.from, query.data.to);
    if (!pw.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: pw.error } });
    const limit = query.data.limit ?? 10;

    const scope = opportunityScope(req.user);
    const won = await prisma.opportunity.findMany({
      where: { ...scope, wonAt: { not: null } },
      select: { amount: true, currency: true, wonAt: true, organization: { select: { id: true, name: true, country: true } } },
    });
    const map = new Map<string, { clientId: string; name: string; country: string | null; booked: number }>();
    for (const o of won) {
      if (!inWindow(o.wonAt, pw.win)) continue;
      const org = o.organization;
      const kes = o.amount != null ? toKes(Number(o.amount), o.currency) : 0;
      let row = map.get(org.id);
      if (!row) { row = { clientId: org.id, name: org.name, country: org.country ?? null, booked: 0 }; map.set(org.id, row); }
      row.booked += kes;
    }
    const rows = [...map.values()].sort((a, b) => b.booked - a.booked).slice(0, limit);

    if (query.data.format !== "json") {
      sendTabularReport(res, query.data.format, "client-priorities", `Client priorities (${query.data.period})`,
        ["Client", "Country", "Booked (KES)"], rows.map((r) => [r.name, r.country ?? "Unspecified", r.booked]));
      return;
    }
    res.json({ success: true, data: { period: query.data.period, periodFrom: pw.win?.from.toISOString() ?? null, periodTo: pw.win?.to.toISOString() ?? null, rows } });
  } catch (error) {
    console.error("Client priorities error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build client priorities." } });
  }
});

// ── Proposal turnaround by country ──────────────────────────────────────────

reportingRouter.get("/turnaround", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }
    const query = reportQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    const pw = periodWindow(query.data.period, query.data.from, query.data.to);
    if (!pw.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: pw.error } });

    const scope = opportunityScope(req.user);
    const opps = await prisma.opportunity.findMany({
      where: { ...scope, proposalSubmittedAt: { not: null } },
      select: { leadReceivedAt: true, proposalSubmittedAt: true, organization: { select: { country: true } } },
    });
    const map = new Map<string, { key: string | null; label: string; samples: number[] }>();
    for (const o of opps) {
      if (!inWindow(o.proposalSubmittedAt, pw.win)) continue;
      const days = daysBetween(o.leadReceivedAt, o.proposalSubmittedAt);
      if (days === null) continue;
      const country = o.organization?.country ?? null;
      const mapKey = country ?? "__none__";
      let row = map.get(mapKey);
      if (!row) { row = { key: country, label: country ?? "Unspecified", samples: [] }; map.set(mapKey, row); }
      row.samples.push(days);
    }
    const rows = [...map.values()]
      .map((r) => ({
        key: r.key,
        label: r.label,
        validPairs: r.samples.length,
        meanDays: r.samples.length ? r.samples.reduce((a, b) => a + b, 0) / r.samples.length : null,
        medianDays: median(r.samples),
      }))
      .sort((a, b) => b.validPairs - a.validPairs);

    if (query.data.format !== "json") {
      const num = (v: number | null) => (v == null ? "N/A" : v.toFixed(1));
      sendTabularReport(res, query.data.format, "turnaround-by-country", `Proposal turnaround by country (${query.data.period})`,
        ["Country", "Valid date pairs", "Mean days", "Median days"],
        rows.map((r) => [r.label, r.validPairs, num(r.meanDays), num(r.medianDays)]));
      return;
    }
    res.json({ success: true, data: { period: query.data.period, periodFrom: pw.win?.from.toISOString() ?? null, periodTo: pw.win?.to.toISOString() ?? null, rows } });
  } catch (error) {
    console.error("Turnaround error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build turnaround report." } });
  }
});

// ── Priority follow-ups (largest submitted bids) ────────────────────────────

reportingRouter.get("/priority-follow-ups", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }
    const query = reportQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    const pw = periodWindow(query.data.period, query.data.from, query.data.to);
    if (!pw.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: pw.error } });
    const limit = query.data.limit ?? 10;

    const scope = opportunityScope(req.user);
    const submitted = await prisma.opportunity.findMany({
      where: { ...scope, stage: "AWAITING_FEEDBACK" },
      select: {
        id: true, title: true, amount: true, currency: true, proposalSubmittedAt: true,
        organization: { select: { name: true } },
        signingPartner: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });
    const rows = submitted
      .filter((o) => inWindow(o.proposalSubmittedAt, pw.win))
      .map((o) => ({
        client: o.organization?.name ?? "Unknown",
        partner: o.signingPartner?.name ?? o.owner?.name ?? "Unassigned",
        quoted: o.amount != null ? toKes(Number(o.amount), o.currency) : 0,
      }))
      .sort((a, b) => b.quoted - a.quoted)
      .slice(0, limit);

    if (query.data.format !== "json") {
      sendTabularReport(res, query.data.format, "priority-follow-ups", `Priority follow-ups (${query.data.period})`,
        ["Client", "Partner", "Quoted (KES)"], rows.map((r) => [r.client, r.partner, r.quoted]));
      return;
    }
    res.json({ success: true, data: { period: query.data.period, periodFrom: pw.win?.from.toISOString() ?? null, periodTo: pw.win?.to.toISOString() ?? null, rows } });
  } catch (error) {
    console.error("Priority follow-ups error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build priority follow-ups." } });
  }
});

// ── Leads report (every lead with its data) ─────────────────────────────────
//
// The "see all leads with their data" view: BD/Partner get the whole book,
// a Manager gets their own. Windows on leadReceivedAt so it reads as "leads
// received in this period".

reportingRouter.get("/leads", async (req: AuthedRequest, res) => {
  try {
    if (!canAccessReporting(req.user)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role is not allowed to access reports." } });
    }
    const query = reportQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
    const pw = periodWindow(query.data.period, query.data.from, query.data.to);
    if (!pw.ok) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: pw.error } });

    const scope = opportunityScope(req.user);
    const opps = await prisma.opportunity.findMany({
      where: { ...scope, ...(pw.win ? { leadReceivedAt: { gte: pw.win.from, lte: pw.win.to } } : {}) },
      select: {
        title: true, service: true, stage: true, amount: true, currency: true,
        leadSource: true, leadSourceNote: true, leadReceivedAt: true, proposalSubmittedAt: true,
        submissionType: true, businessType: true, wonAt: true,
        organization: { select: { name: true, clientNumber: true, country: true, industry: true } },
        department: { select: { name: true } },
        owner: { select: { name: true } },
        signingPartner: { select: { name: true } },
      },
      orderBy: { leadReceivedAt: "desc" },
      take: 500,
    });

    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
    const rows = opps.map((o) => ({
      client: o.organization?.name ?? "Unknown",
      clientNumber: o.organization?.clientNumber ?? "",
      country: o.organization?.country ?? "",
      industry: o.organization?.industry ?? "",
      service: o.service,
      department: o.department?.name ?? "",
      source: o.leadSource === "OTHER" && o.leadSourceNote ? `OTHER: ${o.leadSourceNote}` : o.leadSource,
      received: day(o.leadReceivedAt),
      submitted: day(o.proposalSubmittedAt),
      stage: o.stage,
      amount: o.amount != null ? toKes(Number(o.amount), o.currency) : 0,
      owner: o.owner?.name ?? "Unassigned",
      signingPartner: o.signingPartner?.name ?? "",
      submissionType: o.submissionType ?? "",
      businessType: o.businessType ?? "",
    }));

    if (query.data.format !== "json") {
      sendTabularReport(res, query.data.format, "leads", `Leads (${query.data.period})`,
        ["Client", "Client no.", "Country", "Industry", "Service", "Department", "Source", "Received", "Submitted", "Stage", "Amount (KES)", "Owner", "Signing partner", "Submission type", "Business type"],
        rows.map((r) => [r.client, r.clientNumber, r.country, r.industry, r.service, r.department, r.source, r.received, r.submitted, r.stage, r.amount, r.owner, r.signingPartner, r.submissionType, r.businessType]));
      return;
    }
    res.json({ success: true, data: { period: query.data.period, periodFrom: pw.win?.from.toISOString() ?? null, periodTo: pw.win?.to.toISOString() ?? null, rows } });
  } catch (error) {
    console.error("Leads report error:", error);
    res.status(500).json({ success: false, error: { code: "REPORTING_FAILED", message: "Unable to build leads report." } });
  }
});