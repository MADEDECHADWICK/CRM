import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope, organizationScope } from "../../middleware/authorize";
import { recordAudit } from "../../lib/audit";
import { canExportReportsRole, convertToKes } from "@crm/core";
import { sendCsv, sendWord } from "../../lib/exporters";

export const exportsRouter = Router();
exportsRouter.use(requireAuth);

const querySchema = z.object({
  format: z.enum(["csv", "word"]).default("csv"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  includeArchived: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});

/**
 * Permission-aware structured extraction. Formats not implemented in this
 * codebase (true XLSX, PDF, PPTX) are reported as remaining work rather than
 * silently returning a mislabelled file.
 */
exportsRouter.get("/opportunities", async (req: AuthedRequest, res) => {
  if (!canExportReportsRole(req.user!.role) && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot export data." } });
  }
  const query = querySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const { from, to } = query.data;
  const range = from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;

  const rows = await prisma.opportunity.findMany({
    where: {
      AND: [
        opportunityScope(req.user),
        query.data.includeArchived === "true" ? {} : { isArchived: false },
        range ? { OR: [{ leadReceivedAt: range }, { outcomeAt: range }, { wonAt: range }] } : {},
      ],
    },
    include: {
      organization: { select: { name: true, clientNumber: true, country: true } },
      department: { select: { name: true } },
      owner: { select: { name: true } },
      signingPartner: { select: { name: true } },
      reviewer: { select: { name: true } },
      contractingEntity: { select: { name: true } },
      office: { select: { name: true } },
      serviceCategory: { select: { name: true } },
      allocations: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: query.data.limit,
  });

  const valueOf = (r: (typeof rows)[number]) =>
    r.confirmedAwardValue ?? r.submittedFee ?? r.approvedQuotedFee ?? r.estimatedValue ?? r.amount;
  const currencyOf = (r: (typeof rows)[number]) =>
    r.awardCurrency ?? r.currency;

  const headers = [
    "Opportunity ID", "Client", "Client number", "Client country", "Contracting entity", "Office",
    "Department", "Service category", "Service", "Title", "Legacy stage", "Outcome", "Qualification",
    "Commercial category", "Owner", "Signing partner", "Reviewer", "Lead source", "Named referrer",
    "Campaign/event", "Received", "First submitted", "Outcome date", "Award date",
    "Estimated value", "Approved quote", "Submitted fee", "Confirmed award", "Bid cost", "Currency",
    "Reporting value (native)", "Reporting value (KES)", "KES rate", "KES rate date", "KES source",
    "Tax basis", "Billing frequency", "Term (months)", "Next action", "Next action due",
    "Review required", "Review reason", "Delivery countries",
  ];

  const dataRows = rows.map((r) => {
    const value = valueOf(r);
    const conversion = convertToKes(
      value != null ? Number(value) : null,
      currencyOf(r)
    );
    return [
      r.id, r.organization?.name, r.organization?.clientNumber, r.organization?.country,
      r.contractingEntity?.name, r.office?.name, r.department?.name, r.serviceCategory?.name,
      r.service, r.title, r.legacyStage ?? r.stage, r.outcome, r.qualificationStatus,
      r.businessType, r.owner?.name, r.signingPartner?.name, r.reviewer?.name,
      r.leadSource, r.sourceReferrerName, r.sourceCampaign ?? r.sourceEvent,
      r.leadReceivedAt?.toISOString(), r.proposalSubmittedAt?.toISOString(), r.outcomeAt?.toISOString(), r.awardDate?.toISOString(),
      r.estimatedValue?.toString(), r.approvedQuotedFee?.toString(), r.submittedFee?.toString(),
      r.confirmedAwardValue?.toString(), r.bidPurchaseCost?.toString(), r.currency,
      value?.toString() ?? "",
      conversion.available ? conversion.amountKes : "",
      conversion.rate ?? "",
      conversion.rateDate ?? "",
      conversion.source ?? (conversion.reason ?? ""),
      r.taxBasis, r.billingFrequency, r.termMonths,
      r.nextAction, r.nextActionDueAt?.toISOString(),
      r.reviewRequired ? "YES" : "NO", r.reviewReason,
      r.allocations.map((a) => a.country).join("; "),
    ];
  });

  await prisma.$transaction((tx) => recordAudit(tx, {
    actorId: req.user!.id,
    action: "EXPORT",
    entityType: "Opportunity",
    entityId: "export-opportunities",
    summary: `Opportunity data exported as ${query.data.format} (${rows.length} rows)`,
    metadata: { format: query.data.format, rows: rows.length, from: from ?? null, to: to ?? null },
  }));

  if (query.data.format === "word") {
    sendWord(res, "opportunities", "Opportunities export", headers, dataRows);
  } else {
    sendCsv(res, "opportunities", headers, dataRows);
  }
});

exportsRouter.get("/prequalifications", async (req: AuthedRequest, res) => {
  if (!canExportReportsRole(req.user!.role) && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot export data." } });
  }
  const query = querySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });

  const rows = await prisma.prequalification.findMany({
    where: { organization: { is: organizationScope(req.user) } },
    include: { organization: { select: { name: true, country: true } }, department: { select: { name: true } }, owner: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: query.data.limit,
  });
  const headers = ["ID", "Client", "Country", "Service", "Department", "Owner", "Status", "Submitted", "Accepted", "Rejected", "Cost", "Currency", "Validity from", "Expiry", "Renewal of", "External reference"];
  const dataRows = rows.map((r) => [
    r.id, r.organization?.name, r.organization?.country, r.service, r.department?.name, r.owner?.name,
    r.status, r.submittedAt?.toISOString(), r.acceptedAt?.toISOString(), r.rejectedAt?.toISOString(),
    r.cost?.toString(), r.currency, r.validityFrom?.toISOString(), r.expiryAt?.toISOString(), r.renewalOfId, r.externalReference,
  ]);

  await prisma.$transaction((tx) => recordAudit(tx, {
    actorId: req.user!.id,
    action: "EXPORT",
    entityType: "Prequalification",
    entityId: "export-prequalifications",
    summary: `Prequalification data exported as ${query.data.format} (${rows.length} rows)`,
    metadata: { format: query.data.format, rows: rows.length },
  }));

  if (query.data.format === "word") sendWord(res, "prequalifications", "Prequalifications export", headers, dataRows);
  else sendCsv(res, "prequalifications", headers, dataRows);
});
