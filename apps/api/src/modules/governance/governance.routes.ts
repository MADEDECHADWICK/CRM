import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { recordAudit, getSetting, queueNotification } from "../../lib/audit";
import {
  CONFIG_DEFAULTS,
  canConfigureSystem,
  isGroupCommercialOversight,
  type ConfigValue,
} from "@crm/core";

export const governanceRouter = Router();
governanceRouter.use(requireAuth);

/** Settings are readable by signed-in users; only configurators may change them. */
governanceRouter.get("/settings", async (req: AuthedRequest, res) => {
  const rows = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const keys = new Set([...Object.keys(CONFIG_DEFAULTS), ...rows.map((r) => r.key)]);
  res.json({
    success: true,
    data: [...keys].sort().map((key) => ({
      key,
      value: stored.has(key) ? stored.get(key) : CONFIG_DEFAULTS[key],
      category: rows.find((r) => r.key === key)?.category ?? null,
      description: rows.find((r) => r.key === key)?.description ?? null,
      source: stored.has(key) ? "database" : "fallback",
    })),
  });
});

const settingBody = z.object({
  value: z.unknown(),
  category: z.string().optional(),
  description: z.string().optional(),
});

governanceRouter.put("/settings/:key", async (req: AuthedRequest, res) => {
  if (!canConfigureSystem(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only an authorized administrator can change configuration." } });
  }
  const parsed = settingBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
  }

  const before = await prisma.systemSetting.findUnique({ where: { key: String(req.params.key) } });
  const setting = await prisma.$transaction(async (tx) => {
    const updated = await tx.systemSetting.upsert({
      where: { key: String(req.params.key) },
      update: {
        value: parsed.data.value as ConfigValue as never,
        category: parsed.data.category ?? before?.category ?? null,
        description: parsed.data.description ?? before?.description ?? null,
        updatedById: req.user!.id,
      },
      create: {
        key: String(req.params.key),
        value: parsed.data.value as ConfigValue as never,
        category: parsed.data.category ?? null,
        description: parsed.data.description ?? null,
        updatedById: req.user!.id,
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "SystemSetting",
      entityId: String(req.params.key),
      summary: `Configuration changed: ${String(req.params.key)}`,
      before: before ? { value: before.value } : null,
      after: { value: updated.value },
    });
    return updated;
  });
  res.json({ success: true, data: setting });
});

governanceRouter.get("/audit", async (req: AuthedRequest, res) => {
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin) && !canConfigureSystem(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Audit access is restricted." } });
  }
  const query = z.object({
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    action: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });

  const rows = await prisma.auditEvent.findMany({
    where: {
      ...(query.data.entityType ? { entityType: query.data.entityType } : {}),
      ...(query.data.entityId ? { entityId: query.data.entityId } : {}),
      ...(query.data.action ? { action: query.data.action as never } : {}),
    },
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: query.data.limit,
  });
  res.json({ success: true, data: rows });
});

governanceRouter.get("/notifications", async (req: AuthedRequest, res) => {
  const rows = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ success: true, data: rows });
});

governanceRouter.patch("/notifications/:id/read", async (req: AuthedRequest, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: String(req.params.id), userId: req.user!.id },
    data: { readAt: new Date(), status: "DELIVERED", deliveredAt: new Date() },
  });
  if (!result.count) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Notification not found." } });
  res.json({ success: true, data: { id: String(req.params.id) } });
});

/**
 * In-app queue only. External delivery is deliberately not attempted here;
 * if no mechanism is configured the notification stays visible in the app.
 */
governanceRouter.post("/notifications/test", async (req: AuthedRequest, res) => {
  if (!canConfigureSystem(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only an authorized administrator can test notifications." } });
  }
  await prisma.$transaction((tx) => queueNotification(tx, {
    userId: req.user!.id,
    type: "TEST",
    title: "In-app notification test",
    body: "This notification was queued in the CRM. No external delivery mechanism is configured.",
  }));
  res.status(201).json({ success: true, data: { queued: true } });
});

governanceRouter.get("/settings/:key", async (req: AuthedRequest, res) => {
  const value = await prisma.$transaction((tx) => getSetting(tx, String(req.params.key), CONFIG_DEFAULTS[String(req.params.key)] ?? null));
  res.json({ success: true, data: { key: String(req.params.key), value } });
});


// ── Portfolio and record scopes ─────────────────────────────────────────────

const accessScopeSchema = z.object({
  userId: z.string().uuid(),
  country: z.string().trim().nullable().optional(),
  contractingEntityId: z.string().uuid().nullable().optional(),
  officeId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  opportunityId: z.string().uuid().nullable().optional(),
});

governanceRouter.get("/access-scopes", async (req: AuthedRequest, res) => {
  if (!canConfigureSystem(req.user!.role, req.user!.isAdmin) && !isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Access scopes are restricted." } });
  }
  const query = z.object({ userId: z.string().uuid().optional() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });
  const rows = await prisma.userAccessScope.findMany({
    where: query.data.userId ? { userId: query.data.userId } : {},
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ success: true, data: rows });
});

governanceRouter.post("/access-scopes", async (req: AuthedRequest, res) => {
  // Support access to business data is granted by commercial oversight, not by
  // IT administering its own access. Every grant is audited below.
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only Marketing & BD oversight can grant business-data access." } });
  }
  const body = accessScopeSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });
  const target = await prisma.user.findUnique({ where: { id: body.data.userId }, select: { id: true, name: true, isActive: true } });
  if (!target || !target.isActive) return res.status(400).json({ success: false, error: { code: "INVALID_USER", message: "Choose an active user." } });
  if (!body.data.country && !body.data.contractingEntityId && !body.data.officeId && !body.data.departmentId && !body.data.organizationId && !body.data.opportunityId) {
    return res.status(400).json({ success: false, error: { code: "SCOPE_REQUIRED", message: "Choose at least one scope dimension." } });
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.userAccessScope.create({ data: body.data });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "UserAccessScope",
      entityId: created.id,
      summary: `Access scope granted to ${target.name}`,
      after: created,
    });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

governanceRouter.delete("/access-scopes/:id", async (req: AuthedRequest, res) => {
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only Marketing & BD oversight can revoke business-data access." } });
  }
  const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  const existing = await prisma.userAccessScope.findUnique({ where: { id: params.data.id } });
  if (!existing) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Access scope not found." } });
  await prisma.$transaction(async (tx) => {
    await tx.userAccessScope.delete({ where: { id: existing.id } });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "UserAccessScope",
      entityId: existing.id,
      summary: "Access scope revoked",
      before: existing,
    });
  });
  res.json({ success: true, data: { id: existing.id } });
});
