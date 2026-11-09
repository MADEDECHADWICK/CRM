import { canManageStaff, canCreateProspect, canReassignProspect, canReceiveProspect, isOwnerEligible, type Role } from "@crm/core";
import type { Prisma } from "../../../generated/prisma/client";

type Actor = { id: string; role: Role };

export class ProspectError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const assignmentInclude = {
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  assignedBy: { select: { id: true, name: true } },
  assignedDepartment: { select: { id: true, name: true } },
} as const;

async function assignmentData(tx: Prisma.TransactionClient, actor: Actor, assignedToId?: string | null, assignedDepartmentId?: string | null, client = false) {
  if (actor.role === "PARTNER" && assignedToId === null) throw new ProspectError(400, "ASSIGNEE_REQUIRED", "Choose the team member responsible for this prospect.");
  if (assignedToId) {
    const member = await tx.user.findUnique({ where: { id: assignedToId }, select: { id: true, role: true } });
    if (!member || !(client ? isOwnerEligible(member) : canReceiveProspect(member.role))) {
      throw new ProspectError(400, "INVALID_ASSIGNEE", client ? "Choose an existing Partner or Manager from the team." : "Choose an existing team member.");
    }
  }
  if (assignedDepartmentId && !await tx.department.findUnique({ where: { id: assignedDepartmentId }, select: { id: true } })) {
    throw new ProspectError(400, "INVALID_DEPARTMENT", "Choose an existing department.");
  }
  return {
    ...(assignedToId !== undefined ? { assignedToId } : {}),
    ...(assignedDepartmentId !== undefined ? { assignedDepartmentId } : {}),
    assignedById: actor.id, assignedAt: new Date(),
  };
}

export async function assignAccount(tx: Prisma.TransactionClient, actor: Actor, organizationId: string, assignedToId?: string | null, assignedDepartmentId?: string | null, kind?: "prospect" | "client") {
  const admin = canManageStaff(actor.role);
  if (!admin && actor.role !== "PARTNER") throw new ProspectError(403, "FORBIDDEN", "Only administrators and Partners can assign prospects.");
  const where = { id: organizationId, ...(!admin ? { assignedToId: actor.id } : {}) };
  const org = await tx.organization.findUnique({ where,
    select: { assignedToId: true, isExistingClient: true, opportunities: { where: { stage: "WON" }, select: { id: true }, take: 1 } } });
  if (!org) throw new ProspectError(404, "NOT_FOUND", "Account not found.");
  const client = org.isExistingClient || org.opportunities.length > 0;
  if (!admin && (client || !canReassignProspect(actor, org.assignedToId))) throw new ProspectError(403, "FORBIDDEN", "Partners can reassign only prospects assigned to them. Client assignments are managed by administrators.");
  if (kind === "prospect" && client) throw new ProspectError(409, "NOT_A_PROSPECT", "This account is already a client.");
  if (kind === "client" && !client) throw new ProspectError(409, "NOT_A_CLIENT", "This account is a prospect.");
  const data = await assignmentData(tx, actor, assignedToId, assignedDepartmentId, client);
  return tx.organization.update({ where, data, include: assignmentInclude });
}

export function assignProspect(tx: Prisma.TransactionClient, actor: Actor, organizationId: string, assignedToId: string | null, assignedDepartmentId?: string | null) {
  return assignAccount(tx, actor, organizationId, assignedToId, assignedDepartmentId, "prospect");
}

type ProspectInput = {
  name: string; industry?: string | null; country?: string | null;
  address?: string | null; email?: string | null; phone?: string | null;
  website?: string | null; assignedToId?: string | null;
  assignedDepartmentId?: string | null;
};

export async function createProspect(tx: Prisma.TransactionClient, actor: Actor, input: ProspectInput) {
  if (!canCreateProspect(actor.role)) throw new ProspectError(403, "FORBIDDEN", "Only administrators and Partners can add prospects.");
  const { assignedToId, assignedDepartmentId, ...fields } = input;
  // Share a lock across organization creates to protect duplicate checks and
  // sequential client numbers when two admins submit at the same time.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261110)`;
  const assignment = await assignmentData(tx, actor, assignedToId === undefined ? actor.id : assignedToId, assignedDepartmentId);
  const existing = await tx.organization.findFirst({ where: {
    name: { equals: fields.name, mode: "insensitive" },
    country: fields.country ? { equals: fields.country, mode: "insensitive" } : null,
    address: fields.address ? { equals: fields.address, mode: "insensitive" } : null,
  }, select: { id: true } });
  if (existing) throw new ProspectError(409, "DUPLICATE_ORGANIZATION", "This organization and location are already on file. Search for its existing record.");
  const numbers = await tx.organization.findMany({ where: { clientNumber: { startsWith: "CL-" } }, select: { clientNumber: true } });
  const max = numbers.reduce((value, row) => {
    const number = Number(row.clientNumber?.slice(3));
    return Number.isFinite(number) ? Math.max(value, number) : value;
  }, 0);
  return tx.organization.create({ data: { ...fields, ...assignment,
    clientNumber: `CL-${String(max + 1).padStart(4, "0")}` }, include: assignmentInclude });
}
