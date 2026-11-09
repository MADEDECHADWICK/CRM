import type { Prisma } from "../../generated/prisma/client";

// The imported directory has the same shared access as /organizations.
// Won opportunities embedded in a client record still use the caller's scope.
export function clientDirectoryWhere(scope: Prisma.OpportunityWhereInput): Prisma.OrganizationWhereInput {
  return { OR: [{ isExistingClient: true }, { opportunities: { some: { ...scope, stage: "WON" } } }] };
}

export function prospectDirectoryWhere(): Prisma.OrganizationWhereInput {
  return { isExistingClient: false, opportunities: { none: { stage: "WON" } } };
}

export function directorySearch(q?: string): Prisma.OrganizationWhereInput {
  if (!q) return {};
  const contains = { contains: q, mode: "insensitive" as const };
  return { OR: [
    { name: contains }, { clientNumber: contains }, { industry: contains },
    { country: contains }, { address: contains }, { email: contains }, { phone: contains },
    { contacts: { some: { OR: [{ name: contains }, { email: contains }, { phone: contains }, { title: contains }] } } },
    ...["partnerLead", "region", "recommendedOffer", "customerStatus"].map((field) =>
      ({ sourceData: { path: [field], string_contains: q, mode: "insensitive" as const } })),
  ] };
}
