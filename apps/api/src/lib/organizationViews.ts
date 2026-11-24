import type { Prisma } from "../../generated/prisma/client";

// Classification is independent of visibility; callers AND it with access.
export function clientDirectoryWhere(): Prisma.OrganizationWhereInput {
  return { isArchived: false, OR: [{ isExistingClient: true }, { opportunities: { some: { stage: "WON" } } }] };
}

export function prospectDirectoryWhere(): Prisma.OrganizationWhereInput {
  // A true prospect is an untouched account: no won work and no opportunity
  // that has moved beyond the initial PROSPECT stage. Once a lead, proposal or
  // tender exists, the account belongs in the pipeline stages and "All", not
  // in Prospects. Organisations with no opportunity at all are still prospects
  // (they have not been worked yet).
  return {
    isArchived: false,
    isExistingClient: false,
    opportunities: { every: { stage: "PROSPECT" } },
  };
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
