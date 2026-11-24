import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, organizationScope, scopedOrganization } from "../../middleware/authorize";
import { recordAudit } from "../../lib/audit";
import { canArchiveRole, canMergeAccountsRole, isGroupCommercialOversight } from "@crm/core";

export const accountGovernanceRouter = Router();
accountGovernanceRouter.use(requireAuth);

const idParam = z.object({ id: z.string().uuid() });

function normalizedName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(limited|ltd|plc|llp|inc|incorporated|company|co|group|holdings)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function emailDomain(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).toLowerCase().replace(/^www\./, "") : null;
}

// ── Duplicate review ────────────────────────────────────────────────────────

accountGovernanceRouter.get("/duplicates", async (req: AuthedRequest, res) => {
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Duplicate review is restricted to group commercial oversight." } });
  }
  const status = typeof req.query.status === "string" ? req.query.status : "OPEN";
  const rows = await prisma.duplicateCandidate.findMany({
    where: { status },
    include: {
      primaryOrganization: { select: { id: true, name: true, clientNumber: true, country: true, email: true } },
      candidateOrganization: { select: { id: true, name: true, clientNumber: true, country: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  res.json({ success: true, data: rows });
});

accountGovernanceRouter.post("/duplicates/scan", async (req: AuthedRequest, res) => {
  if (!canMergeAccountsRole(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only group oversight can scan for duplicates." } });
  }
  const orgs = await prisma.organization.findMany({
    where: { AND: [organizationScope(req.user), { isArchived: false }] },
    select: { id: true, name: true, email: true, phone: true, clientNumber: true, website: true },
  });

  const candidateRows: {
    primaryOrganizationId: string;
    candidateOrganizationId: string;
    matchScore: number;
    matchReasons: string[];
  }[] = [];

  for (let i = 0; i < orgs.length; i += 1) {
    for (let j = i + 1; j < orgs.length; j += 1) {
      const a = orgs[i];
      const b = orgs[j];
      const reasons: string[] = [];
      let score = 0;
      if (a.clientNumber && a.clientNumber === b.clientNumber) { score = Math.max(score, 100); reasons.push("same client number"); }
      if (normalizedName(a.name) && normalizedName(a.name) === normalizedName(b.name)) { score = Math.max(score, 100); reasons.push("same normalized name"); }
      else if (normalizedName(a.name).includes(normalizedName(b.name)) || normalizedName(b.name).includes(normalizedName(a.name))) { score = Math.max(score, 85); reasons.push("one name contains the other"); }
      if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) { score = Math.max(score, 80); reasons.push("same email"); }
      if (a.phone && b.phone && a.phone.replace(/\D/g, "") === b.phone.replace(/\D/g, "")) { score = Math.max(score, 70); reasons.push("same phone"); }
      if (emailDomain(a.email) && emailDomain(a.email) === emailDomain(b.email)) { score = Math.max(score, 65); reasons.push("same email domain"); }
      if (score >= 70) {
        candidateRows.push({ primaryOrganizationId: a.id, candidateOrganizationId: b.id, matchScore: score, matchReasons: reasons });
      }
    }
  }

  if (candidateRows.length) {
    await prisma.$transaction(async (tx) => {
      await tx.duplicateCandidate.createMany({
        data: candidateRows.map((r) => ({ ...r, matchReasons: r.matchReasons })),
        skipDuplicates: true,
      });
      await tx.organization.updateMany({
        where: { id: { in: [...new Set(candidateRows.flatMap((r) => [r.primaryOrganizationId, r.candidateOrganizationId]))] } },
        data: { duplicateReviewRequired: true },
      });
      await recordAudit(tx, {
        actorId: req.user!.id,
        action: "UPDATE",
        entityType: "Organization",
        entityId: "duplicate-scan",
        summary: `Duplicate scan completed: ${candidateRows.length} candidate pair(s)`,
        metadata: { candidates: candidateRows.length },
      });
    });
  }

  res.json({ success: true, data: { scanned: orgs.length, candidates: candidateRows.length } });
});

accountGovernanceRouter.post("/duplicates/:id/resolve", async (req: AuthedRequest, res) => {
  if (!canMergeAccountsRole(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only group oversight can resolve duplicates." } });
  }
  const params = idParam.safeParse(req.params);
  const body = z.object({
    decision: z.enum(["MERGE", "KEEP_SEPARATE", "CORRECT"]),
    primaryOrganizationId: z.string().uuid().optional(),
    notes: z.string().trim().optional(),
  }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });

  const candidate = await prisma.duplicateCandidate.findUnique({ where: { id: params.data.id } });
  if (!candidate) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Duplicate candidate not found." } });

  const primaryId = body.data.primaryOrganizationId
    ?? candidate.primaryOrganizationId;
  const duplicateId = primaryId === candidate.primaryOrganizationId
    ? candidate.candidateOrganizationId
    : candidate.primaryOrganizationId;

  if (primaryId === duplicateId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Choose two different organizations." } });
  if (!await scopedOrganization(req.user, primaryId) || !await scopedOrganization(req.user, duplicateId)) {
    return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "One of the organizations is outside your scope." } });
  }

  const result = await prisma.$transaction(async (tx) => {
    let merged = false;
    if (body.data.decision === "MERGE") {
      const before = await tx.organization.findUnique({ where: { id: duplicateId } });
      // Explicit, audited move of related records. No permanent deletion and
      // no silent hard merge.
      await tx.contact.updateMany({ where: { organizationId: duplicateId }, data: { isPrimary: false } });
      await tx.opportunity.updateMany({ where: { organizationId: duplicateId }, data: { organizationId: primaryId } });
      await tx.contact.updateMany({ where: { organizationId: duplicateId }, data: { organizationId: primaryId } });
      await tx.note.updateMany({ where: { organizationId: duplicateId }, data: { organizationId: primaryId } });
      await tx.followup.updateMany({ where: { organizationId: duplicateId }, data: { organizationId: primaryId } });
      await tx.prequalification.updateMany({ where: { organizationId: duplicateId }, data: { organizationId: primaryId } });
      await tx.organization.updateMany({ where: { parentOrganizationId: duplicateId }, data: { parentOrganizationId: primaryId } });
      await tx.userAccessScope.updateMany({ where: { organizationId: duplicateId }, data: { organizationId: primaryId } });
      await tx.organization.update({
        where: { id: duplicateId },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          archivedById: req.user!.id,
          mergedIntoId: primaryId,
          duplicateReviewRequired: false,
        },
      });
      await recordAudit(tx, {
        actorId: req.user!.id,
        action: "MERGE",
        entityType: "Organization",
        entityId: duplicateId,
        summary: `Organization merged into ${primaryId}`,
        before,
        after: { mergedIntoId: primaryId, archived: true },
        metadata: { notes: body.data.notes ?? null, candidateId: candidate.id },
      });
      merged = true;
    }

    await tx.organization.updateMany({
      where: { id: { in: [primaryId, duplicateId] }, ...(body.data.decision === "MERGE" ? { id: primaryId } : {}) },
      data: { duplicateReviewRequired: false },
    });

    const resolved = await tx.duplicateCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "RESOLVED",
        decision: body.data.decision,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
        notes: body.data.notes ?? null,
        mergedOrganizationId: merged ? primaryId : null,
      },
    });

    if (!merged) {
      await recordAudit(tx, {
        actorId: req.user!.id,
        action: "UPDATE",
        entityType: "DuplicateCandidate",
        entityId: candidate.id,
        summary: `Duplicate review resolved: ${body.data.decision}`,
        before: candidate,
        after: resolved,
      });
    }
    return resolved;
  });

  res.json({ success: true, data: result });
});

// ── Group account, entity and office metadata ───────────────────────────────

accountGovernanceRouter.patch("/:id/group", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = z.object({
    parentOrganizationId: z.string().uuid().nullable().optional(),
    contractingEntityId: z.string().uuid().nullable().optional(),
    officeId: z.string().uuid().nullable().optional(),
  }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const org = await scopedOrganization(req.user, params.data.id);
  if (!org) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found." } });
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin) && org.assignedToId !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the account owner or group oversight may change group metadata." } });
  }
  if (body.data.parentOrganizationId === org.id) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "An organization cannot be its own group parent." } });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organization.update({
      where: { id: org.id },
      data: {
        ...(body.data.parentOrganizationId !== undefined ? { parentOrganizationId: body.data.parentOrganizationId } : {}),
        ...(body.data.contractingEntityId !== undefined ? { contractingEntityId: body.data.contractingEntityId } : {}),
        ...(body.data.officeId !== undefined ? { officeId: body.data.officeId } : {}),
      },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: "UPDATE", entityType: "Organization", entityId: org.id, summary: "Group/entity/office metadata updated", before: org, after: row });
    return row;
  });
  res.json({ success: true, data: updated });
});

accountGovernanceRouter.post("/:id/archive", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  if (!canArchiveRole(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot archive accounts." } });
  const org = await scopedOrganization(req.user, params.data.id);
  if (!org) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found." } });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organization.update({ where: { id: org.id }, data: { isArchived: true, archivedAt: new Date(), archivedById: req.user!.id } });
    await recordAudit(tx, { actorId: req.user!.id, action: "ARCHIVE", entityType: "Organization", entityId: org.id, summary: `Organization archived: ${org.name}`, before: org, after: row });
    return row;
  });
  res.json({ success: true, data: updated });
});

accountGovernanceRouter.post("/:id/restore", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  if (!canArchiveRole(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot restore accounts." } });
  const org = await scopedOrganization(req.user, params.data.id);
  if (!org) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found." } });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organization.update({ where: { id: org.id }, data: { isArchived: false, archivedAt: null, archivedById: null } });
    await recordAudit(tx, { actorId: req.user!.id, action: "RESTORE", entityType: "Organization", entityId: org.id, summary: `Organization restored: ${org.name}`, before: org, after: row });
    return row;
  });
  res.json({ success: true, data: updated });
});
