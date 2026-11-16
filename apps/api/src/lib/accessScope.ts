import type { Role } from "@crm/core";
import type { Prisma } from "../../generated/prisma/client";

export type AccessUser = { id: string; role: Role; isAdmin?: boolean; departmentId?: string | null; headedDepartmentIds?: string[] };

export function accessibleDepartmentIds(user: AccessUser): string[] {
  return [...new Set([...(user.departmentId ? [user.departmentId] : []), ...(user.headedDepartmentIds ?? [])])];
}

// Assignment is the authority for ALL account data. In particular, Partner
// status, a historical deal, or a null department never grants global access.
export function organizationScope(user: AccessUser | undefined): Prisma.OrganizationWhereInput {
  if (!user) return { id: "never-matches" };
  if (user.role === "MARKETING_BD") return {};
  return { OR: [
    { assignedToId: user.id },
    { assignedDepartmentId: { in: accessibleDepartmentIds(user) } },
  ] };
}

export function opportunityScope(user: AccessUser | undefined): Prisma.OpportunityWhereInput {
  if (!user) return { id: "never-matches" };
  return user.role === "MARKETING_BD" ? {} : { organization: { is: organizationScope(user) } };
}

export function contactScope(user: AccessUser | undefined): Prisma.ContactWhereInput {
  return { organization: { is: organizationScope(user) } };
}

// Both optional links must be in scope. An authored note or assigned reminder
// must not preserve access to a client after its assignment is revoked.
function contextScope(user: AccessUser) {
  return { AND: [
    { OR: [{ organizationId: null }, { organization: { is: organizationScope(user) } }] },
    { OR: [{ opportunityId: null }, { opportunity: { is: opportunityScope(user) } }] },
  ] };
}

export function noteScope(user: AccessUser | undefined): Prisma.NoteWhereInput {
  if (!user) return { id: "never-matches" };
  return { AND: [contextScope(user), { OR: [
    { organizationId: { not: null } }, { opportunityId: { not: null } }, { authorId: user.id },
  ] }] };
}

export function followupScope(user: AccessUser | undefined): Prisma.FollowupWhereInput {
  if (!user) return { id: "never-matches" };
  return { AND: [contextScope(user), { OR: [{ assignedToId: user.id }, { createdById: user.id }] }] };
}
