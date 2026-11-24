import type { Prisma } from "../../generated/prisma/client";

export type AuditInput = {
  actorId?: string | null;
  actorType?: "USER" | "SYSTEM";
  action:
    | "CREATE"
    | "UPDATE"
    | "APPROVE"
    | "REJECT"
    | "REASSIGN"
    | "ARCHIVE"
    | "RESTORE"
    | "DISABLE"
    | "MERGE"
    | "EXPORT"
    | "SUBMIT"
    | "INVALIDATE"
    | "QUALIFY"
    | "OUTCOME"
    | "HANDOVER";
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Append-only audit trail. Never stores secrets or document contents. */
export async function recordAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? "USER",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      before: json(input.before),
      after: json(input.after),
      metadata: json(input.metadata),
    },
  });
}

/** In-app notification queue. Delivery stays in-app unless configured. */
export async function queueNotification(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  }
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      status: "QUEUED",
    },
  });
}

export async function getSetting<T = unknown>(
  tx: Prisma.TransactionClient,
  key: string,
  fallback: T
): Promise<T> {
  const row = await tx.systemSetting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}
