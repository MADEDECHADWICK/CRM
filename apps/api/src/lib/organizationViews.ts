import type { Prisma } from "../../generated/prisma/client";

// Classification is independent of visibility; callers AND it with access.
export function clientDirectoryWhere(): Prisma.OrganizationWhereInput {
  return { OR: [{ isExistingClient: true }, { opportunities: { some: { stage: "WON" } } }] };
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
    { assignedTo: { is: { name: contains } } },
    { assignedDepartment: { is: { name: contains } } },
    { contacts: { some: { OR: [{ name: contains }, { email: contains }, { phone: contains }, { title: contains }] } } },
    ...["partnerLead", "region", "recommendedOffer", "customerStatus"].map((field) =>
      ({ sourceData: { path: [field], string_contains: q, mode: "insensitive" as const } })),
  ] };
}
