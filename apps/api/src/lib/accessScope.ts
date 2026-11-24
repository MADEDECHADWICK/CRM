import type { Role } from "@crm/core";
import type { Prisma } from "../../generated/prisma/client";

export type AccessScopeRow = {
  country?: string | null;
  contractingEntityId?: string | null;
  officeId?: string | null;
  departmentId?: string | null;
  organizationId?: string | null;
  opportunityId?: string | null;
};

export type AccessUser = {
  id: string;
  role: Role;
  isAdmin?: boolean;
  departmentId?: string | null;
  headedDepartmentIds?: string[];
  accessScopes?: AccessScopeRow[];
};

export function accessibleDepartmentIds(user: AccessUser): string[] {
  return [
    ...new Set([
      ...(user.departmentId ? [user.departmentId] : []),
      ...(user.headedDepartmentIds ?? []),
      ...((user.accessScopes ?? []).map((s) => s.departmentId).filter(Boolean) as string[]),
    ]),
  ];
}

/** Portfolio scopes that legitimately widen an organization view. */
function portfolioOrganizationScope(user: AccessUser): Prisma.OrganizationWhereInput[] {
  const scopes = user.accessScopes ?? [];
  const parts: Prisma.OrganizationWhereInput[] = [];
  for (const scope of scopes) {
    if (scope.country) parts.push({ country: scope.country });
    if (scope.contractingEntityId) parts.push({ contractingEntityId: scope.contractingEntityId });
    if (scope.officeId) parts.push({ officeId: scope.officeId });
    if (scope.organizationId) parts.push({ id: scope.organizationId });
  }
  return parts;
}

// Assignment is the authority for account data. Partner status, a historical
// deal, or a null department never grants global access. Portfolio scopes are
// explicit additions, not inferred from role.
export function organizationScope(user: AccessUser | undefined): Prisma.OrganizationWhereInput {
  if (!user) return { id: "never-matches" };
  if (user.role === "MARKETING_BD") return {};
  return {
    OR: [
      { assignedToId: user.id },
      { assignedDepartmentId: { in: accessibleDepartmentIds(user) } },
      ...portfolioOrganizationScope(user),
    ],
  };
}

/**
 * Opportunity access is organization scope OR an explicit record share.
 * A contributor row grants exactly one opportunity and never the whole
 * organization/country database.
 */
export function opportunityScope(user: AccessUser | undefined): Prisma.OpportunityWhereInput {
  if (!user) return { id: "never-matches" };
  if (user.role === "MARKETING_BD") return {};
  return {
    OR: [
      { organization: { is: organizationScope(user) } },
      { contributors: { some: { userId: user.id } } },
      // Only an explicit opportunity scope widens opportunity access here.
      // Country/entity/office/department scopes flow through organizationScope
      // so a portfolio row cannot accidentally reveal every opportunity.
      { accessScopes: { some: { userId: user.id, opportunityId: { not: null } } } },
    ],
  };
}

export function contactScope(user: AccessUser | undefined): Prisma.ContactWhereInput {
  return { organization: { is: organizationScope(user) } };
}

// Both optional links must be in scope. An authored note or assigned reminder
// must not preserve access to a client after its assignment is revoked.
function contextScope(user: AccessUser) {
  return {
    AND: [
      { OR: [{ organizationId: null }, { organization: { is: organizationScope(user) } }] },
      { OR: [{ opportunityId: null }, { opportunity: { is: opportunityScope(user) } }] },
    ],
  };
}

export function noteScope(user: AccessUser | undefined): Prisma.NoteWhereInput {
  if (!user) return { id: "never-matches" };
  return {
    AND: [
      contextScope(user),
      {
        OR: [
          { organizationId: { not: null } },
          { opportunityId: { not: null } },
          { authorId: user.id },
        ],
      },
    ],
  };
}

export function followupScope(user: AccessUser | undefined): Prisma.FollowupWhereInput {
  if (!user) return { id: "never-matches" };
  return {
    AND: [
      contextScope(user),
      { OR: [{ assignedToId: user.id }, { createdById: user.id }] },
    ],
  };
}

export function prequalificationScope(user: AccessUser | undefined): Prisma.PrequalificationWhereInput {
  if (!user) return { id: "never-matches" };
  if (user.role === "MARKETING_BD") return {};
  return { organization: { is: organizationScope(user) } };
}
