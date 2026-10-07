import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope, scopedOpportunity } from "../../middleware/authorize";
import { transitionOpportunity, TransitionRejected } from "./transitionOpportunity";
import {
  setProposalDeadline,
  clearProposalDeadline,
  recordBreachExplanation,
  DeadlineRejected,
} from "./deadlines";
import {
  REPORT_PERIODS,
  reportPeriodRange,
  customReportRange,
  STAGES,
  LEAD_SOURCES,
  RAG_LABELS,
  ragFor,
  canCreateOpportunity,
  type Stage,
} from "@crm/core";
import {
  resolveOwnerForCreation,
  recordInitialOwnership,
  reassignOpportunity,
  OwnershipRejected,
} from "./ownership";
import { paginationSchema, pageOf } from "../../lib/pagination";

export const opportunitiesRouter = Router();
opportunitiesRouter.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Attaches the computed RAG to an opportunity on its way out.
 *
 * This is the only place a RAG value is ever produced. It is derived per
 * response from the current clock and never written to the database, so two
 * clients reading the same deal at the same moment always agree, and nothing
 * has to be recalculated by a background job or repaired after a failure.
 */
function withRag<T extends {
  stage: Stage;
  proposalDueAt?: Date | string | null;
  proposalSubmittedAt?: Date | string | null;
}>(opp: T) {
  const rag = ragFor({
    stage: opp.stage,
    proposalDueAt: opp.proposalDueAt,
    proposalSubmittedAt: opp.proposalSubmittedAt,
  });
  return { ...opp, rag, ragLabel: RAG_LABELS[rag.status] };
}

// Derived from STAGES rather than hand-listed, so a newly added pipeline
// stage is immediately valid here instead of being rejected with a 400.
const listQuerySchema = z
  .object({
    stage: z.enum(STAGES).optional(),
    rag: z.enum(["NO_DEADLINE", "GREEN", "AMBER", "RED", "OVERDUE", "SUBMITTED"]).optional(),
    q: z.string().optional(),
    period: z.enum(REPORT_PERIODS).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
  })
  .extend(paginationSchema.shape);

const transitionBodySchema = z.object({
  toStage: z.enum(STAGES),
  reason: z.string().min(1),
  amount: z.number().positive().optional(),
  revisitAt: z.string().datetime().optional(),
  lostReason: z.string().optional(),
});

// Deliberately narrower than the full stage list: a new opportunity can only
// start life as a PROSPECT or a LEAD (BR-003/BR-004).
const createBodySchema = z.object({
  title: z.string().min(1),
  organizationId: z.string().uuid(),
  departmentId: z.string().uuid(),
  service: z.string().min(1),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  // Optional on the wire but never optional in the database: omitted means
  // "the department head", resolved server-side. The head being the default is
  // the reason one is appointed, so requiring every client to restate it would
  // be busywork that exists only to be gotten wrong.
  ownerId: z.string().uuid().optional(),
  // Required only when ownerId is not the department's head. Optional here so
  // the server can decide whether it is actually needed — making it
  // unconditionally required would ask for a justification on the common case
  // where there is no deviation to explain.
  ownerOverrideReason: z.string().optional(),
  stage: z.enum(["PROSPECT", "LEAD"] satisfies readonly Stage[]).optional(),
  // BR-018: the source of a lead is mandatory, with no server-side default.
  // Defaulting it would defeat the reason the field exists — an unattributed
  // lead is exactly what the reporting is meant to eliminate, and a silent
  // "OTHER" would be indistinguishable from a real one.
  leadSource: z.enum(LEAD_SOURCES),
  // Required only for OTHER, where the enum value carries no information on
  // its own. Enforced below so the error names the actual field.
  leadSourceNote: z.string().optional(),
  // When the lead actually arrived. Defaults to now when omitted, but is
  // accepted on input because leads are often written up days after the
  // first conversation and backdating matters for the velocity reports.
  leadReceivedAt: z.string().datetime().optional(),
});

// `reason` is mandatory and unconditional. It was briefly optional with `note`
// accepted as a legacy alias, on the assumption that older app builds were
// still in circulation; keeping two names for one field is how the next person
// reads the route and concludes the reason is optional.
const reassignBodySchema = z.object({
  newOwnerId: z.string().uuid(),
  reason: z.string().min(1),
});

// List with optional ?stage= and ?q= filters, always inside the caller's
// data scope (BR-012). Moving the stage filter to the API lets the web app
// and mobile app stop filtering the full list client-side.
opportunitiesRouter.get("/", async (req: AuthedRequest, res) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: query.error.message },
    });
  }

  const { stage, rag, q, period, from, to, ownerId, departmentId } = query.data;
  let range: { from: Date; to: Date } | null = null;
  if (period === "custom") {
    const resolved = customReportRange(from, to);
    if ("error" in resolved) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: resolved.error },
      });
    }
    range = resolved.range;
  } else if (period) {
    range = reportPeriodRange(period);
  }

  // A Manager's scope is "their own deals" — an explicit ownerId filter is
  // honored only for roles that can see everything, so a Manager can't lift
  // their blindfold; departmentId narrows within whatever scope applies.
  const canFilterOwner = req.user!.role !== "MANAGER";

  const opps = await prisma.opportunity.findMany({
    where: {
      ...opportunityScope(req.user),
      ...(stage ? { stage } : {}),
      ...(range
        ? { stageEnteredAt: { gte: range.from, lte: range.to } }
        : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      ...(ownerId && canFilterOwner ? { ownerId } : {}),
      ...(departmentId ? { departmentId } : {}),
    },
    include: {
      // Only the fields the pipeline list renders — the full organization row
      // (address/website/description) was being shipped per deal for nothing.
      organization: { select: { id: true, name: true } },
      department: { include: { head: { select: { id: true, name: true, role: true } } } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { stageEnteredAt: "desc" },
    ...pageOf(query.data),
  });

  // Filtered and decorated here rather than in the query. RAG depends on
  // "now" in a way SQL cannot express identically across time zones and
  // timezone-agnostic columns, so the database returns the candidate set and
  // one shared function decides the colour.
  const decorated = opps.map(withRag);
  const result = rag ? decorated.filter((o) => o.rag.status === rag) : decorated;
  res.json({ success: true, data: result });
});

// Opportunity detail — the screen behind every transition/reassignment/
// note action. Includes the full related context the UI needs in one call.
opportunitiesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: params.error.message },
    });
  }

  const opp = await prisma.opportunity.findFirst({
    where: {
      id: params.data.id,
      ...opportunityScope(req.user),
    },
    include: {
      organization: true,
      // The head travels with the department because "who should own this"
      // is the first question the reassignment screen asks, and making the
      // client join it up from a second request would leave the two out of step.
      department: { include: { head: { select: { id: true, name: true, role: true } } } },
      owner: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      notes: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      stageHistory: { orderBy: { changedAt: "desc" } },
      // Kept apart from stageHistory: a deal can change hands while sitting in
      // one stage, so interleaving the two would answer neither question.
      ownerChanges: {
        include: {
          fromOwner: { select: { id: true, name: true } },
          toOwner: { select: { id: true, name: true } },
          changedBy: { select: { id: true, name: true } },
        },
        orderBy: { changedAt: "desc" },
      },
      followups: { orderBy: { dueAt: "asc" } },
    },
  });

  if (!opp) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." },
    });
  }

  res.json({ success: true, data: withRag(opp) });
});

// Create a Lead against an existing organization + department — BR-003
// makes the service being offered mandatory at creation. BD can also raise
// a deal straight into PROSPECT (an identified, not-yet-qualified org).
//
// Ownership is resolved rather than restated by the client: omit ownerId and
// the department head owns it, name somebody else and you owe a reason why.
opportunitiesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  // OTHER is the honest escape hatch in the source list, but only if the
  // user then says what it actually was. "OTHER" with no note would quietly
  // defeat the reporting just as badly as a blank field would.
  if (
    parsed.data.leadSource === "OTHER" &&
    !parsed.data.leadSourceNote?.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Describe the lead source when selecting OTHER.",
        field: "leadSourceNote",
      },
    });
  }

  // Role is checked against the shared policy rather than inferred from the
  // fact that the request is authenticated. Every current role may raise a
  // deal, so this never rejects anybody today — which is the point. The old
  // code had no check at all, and the rule it was missing existed only as a
  // hidden button in the mobile UI, where a POST from anywhere else was
  // accepted. When a fourth role is added it will be denied here by default
  // instead of inheriting a permission nobody granted.
  if (!canCreateOpportunity(req.user!.role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "CREATOR_NOT_PERMITTED",
        message: "Your role cannot raise new opportunities.",
      },
    });
  }

  // Resolves the owner, defaults to the department head, and refuses a
  // deviation that comes without a reason. This replaces the previous
  // `ownerId ?? req.user!.id` fallback, which let a Marketing & BD user become
  // the owner of their own deal by omitting the field — the exact thing the
  // Partner/Manager owner rule exists to prevent, reachable through a
  // one-character omission.
  let owner: { ownerId: string; departmentHeadId: string | null };
  try {
    owner = await resolveOwnerForCreation({
      departmentId: parsed.data.departmentId,
      requestedOwnerId: parsed.data.ownerId,
      overrideReason: parsed.data.ownerOverrideReason,
    });
  } catch (err: any) {
    if (err instanceof OwnershipRejected) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code, message: err.message, field: err.field },
      });
    }
    throw err;
  }

  // The deal and the first entry of its ownership history are committed
  // together. A deal whose history starts somewhere other than its creation is
  // exactly the gap the OwnerChange table was added to close.
  const opp = await prisma.$transaction(async (tx) => {
    const created = await tx.opportunity.create({
      data: {
        title: parsed.data.title,
        organizationId: parsed.data.organizationId,
        departmentId: parsed.data.departmentId,
        service: parsed.data.service,
        stage: parsed.data.stage ?? "LEAD",
        amount: parsed.data.amount ?? null,
        currency: parsed.data.currency ?? "KES",
        createdById: req.user!.id,
        ownerId: owner.ownerId,
        stageEnteredAt: new Date(),
        leadSource: parsed.data.leadSource,
        leadSourceNote: parsed.data.leadSourceNote?.trim() || null,
        leadReceivedAt: parsed.data.leadReceivedAt
          ? new Date(parsed.data.leadReceivedAt)
          : new Date(),
      },
      include: { organization: true, department: true },
    });

    await recordInitialOwnership(tx, {
      opportunityId: created.id,
      ownerId: owner.ownerId,
      changedById: req.user!.id,
      departmentHeadId: owner.departmentHeadId,
      overrideReason: parsed.data.ownerOverrideReason,
    });

    return created;
  });

  res.status(201).json({ success: true, data: withRag(opp) });
});

opportunitiesRouter.post("/:id/transition", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = transitionBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  // NOT_SUBMITTED is reachable from PROPOSAL in the state machine only
  // because that is how the automated sweep gets there. It is not a decision
  // a person can make by hand, so the route refuses it explicitly rather
  // than relying on a user never trying it. A manual "I'll mark this not
  // submitted" would produce exactly the record the automation exists to
  // produce, but with no systemReason, no breach timestamp and no note debt
  // — an unauditable copy of a process failure.
  if (body.data.toStage === "NOT_SUBMITTED") {
    return res.status(400).json({
      success: false,
      error: {
        code: "STAGE_NOT_SETTABLE",
        message:
          "NOT_SUBMITTED is set automatically when a proposal deadline passes. Use PROPOSAL to resume work on a flagged deal.",
      },
    });
  }

  // Authorization, not just authentication: the deal must be inside the
  // caller's scope. Reads enforce this; a write that skips it is how a
  // Manager ends up transitioning somebody else's deal.
  const scoped = await scopedOpportunity(req.user, params.data.id);
  if (!scoped) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." },
    });
  }

  try {
    const result = await transitionOpportunity({
      opportunityId: params.data.id,
      toStage: body.data.toStage,
      changedById: req.user!.id,
      reason: body.data.reason,
      amount: body.data.amount,
      revisitAt: body.data.revisitAt ? new Date(body.data.revisitAt) : undefined,
      lostReason: body.data.lostReason,
    });
    res.json({ success: true, data: withRag(result) });
  } catch (err: any) {
    // The completeness gate returns the specific outstanding fields so the
    // client can render a checklist. A bare 400 message would leave the user
    // guessing which of eight fields the server meant.
    if (err instanceof TransitionRejected) {
      return res.status(400).json({
        success: false,
        error: {
          code: err.missing.length ? "INCOMPLETE_CLIENT_RECORD" : "TRANSITION_REJECTED",
          message: err.message,
          missingFields: err.missing,
        },
      });
    }
    // The transition ran at Serializable isolation; a concurrent edit to the
    // same deal aborts one of them with a serialization failure. That is a
    // retryable conflict, not a bad request.
    if (err?.code === "P2034") {
      return res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "The deal changed while you were editing it. Reload and try again." },
      });
    }
    res.status(400).json({ success: false, error: { code: "TRANSITION_REJECTED", message: err.message } });
  }
});

// ── BD-issued proposal drafting deadline (BR-016) ──
//
// Separate from /transition because the stage does not change here. Putting
// it on the transition endpoint would imply a stage change and pollute the
// decision history, and the deadline is re-issued repeatedly over a
// proposal's life.
const deadlineBodySchema = z.object({
  dueAt: z.string().datetime(),
});

// Issuing a deadline is a BD-side judgment about drafting capacity, so it is
// limited to the roles that actually run the pipeline. A Partner can still
// set one on a deal they own, but a user outside those roles cannot impose a
// date on someone else's work.
const DEADLINE_ROLES = new Set(["MARKETING_BD", "PARTNER", "MANAGER"]);

opportunitiesRouter.post("/:id/deadline", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = deadlineBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  if (!DEADLINE_ROLES.has(req.user!.role)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Only BD, Partner or Manager roles can issue a proposal deadline." },
    });
  }

  const scoped = await scopedOpportunity(req.user, params.data.id);
  if (!scoped) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." },
    });
  }

  try {
    const updated = await setProposalDeadline({
      opportunityId: params.data.id,
      dueAt: new Date(body.data.dueAt),
      setById: req.user!.id,
    });
    res.json({ success: true, data: withRag(updated) });
  } catch (err: any) {
    const code = err instanceof DeadlineRejected ? "DEADLINE_REJECTED" : "INTERNAL_ERROR";
    res.status(400).json({ success: false, error: { code, message: err.message } });
  }
});

opportunitiesRouter.delete("/:id/deadline", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: params.error.message },
    });
  }

  if (!DEADLINE_ROLES.has(req.user!.role)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Only BD, Partner or Manager roles can clear a proposal deadline." },
    });
  }

  const scoped = await scopedOpportunity(req.user, params.data.id);
  if (!scoped) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." },
    });
  }

  try {
    const updated = await clearProposalDeadline(params.data.id);
    res.json({ success: true, data: withRag(updated) });
  } catch (err: any) {
    const code = err instanceof DeadlineRejected ? "DEADLINE_REJECTED" : "INTERNAL_ERROR";
    res.status(400).json({ success: false, error: { code, message: err.message } });
  }
});

// ── The post-breach explanation (BR-019) ──
//
// Separate from the general note endpoint on purpose. A breach
// explanation is a standing obligation created by the system with a due
// date, not something a user volunteers; it needs its own endpoint so it
// can clear the debt rather than just adding to the chatter.
const breachNoteBodySchema = z.object({
  explanation: z.string().min(1),
});

opportunitiesRouter.post("/:id/breach-note", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = breachNoteBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  // The obligation belongs to the person who owed the deadline, but a Manager
  // or BD may record it on their behalf when someone is on leave — the debt
  // still has to be closable, or an absent assignee would block it forever.
  // Scoped: a Manager may stand in only for a deal she can actually see.
  const opp = await scopedOpportunity(req.user, params.data.id, {
    ownerId: true,
    breachNoteRequired: true,
  });
  if (!opp) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." },
    });
  }

  const isOwner = opp.ownerId === req.user!.id;
  const canStandIn = req.user!.role === "MANAGER" || req.user!.role === "MARKETING_BD";
  if (!isOwner && !canStandIn) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Only the deal owner or a BD/Manager can record the missed-deadline explanation.",
      },
    });
  }

  try {
    const result = await recordBreachExplanation({
      opportunityId: params.data.id,
      authorId: req.user!.id,
      explanation: body.data.explanation,
    });
    res.json({ success: true, data: withRag(result.opportunity) });
  } catch (err: any) {
    const code = err instanceof DeadlineRejected ? "BREACH_NOTE_REJECTED" : "INTERNAL_ERROR";
    res.status(400).json({ success: false, error: { code, message: err.message } });
  }
});

// Reassignment — its own kind of decision, so its own record rather than a
// Note or a StageHistoryEntry. Neither of those can hold it: the stage is not
// changing, and a Note carries no type, so a handover was previously
// indistinguishable from any other comment.
//
// Permission is decided by @crm/core against the deal as it stands inside the
// transaction. This route used to have no authorization at all beyond being
// signed in — any user could hand any deal to anybody, including a Marketing
// & BD user, and the only thing recorded was a line of free text.
opportunitiesRouter.post("/:id/reassign", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = reassignBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  try {
    const updated = await reassignOpportunity({
      opportunityId: params.data.id,
      newOwnerId: body.data.newOwnerId,
      reason: body.data.reason,
      actor: { id: req.user!.id, role: req.user!.role },
    });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err instanceof OwnershipRejected) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code, message: err.message, field: err.field },
      });
    }
    res.status(400).json({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
});