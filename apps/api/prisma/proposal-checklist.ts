import type { PrismaClient } from "../generated/prisma/client";

/**
 * The Proposal Quality Review Checklist supplied by Ronalds, split by the
 * person responsible for each section:
 *
 *   TEAM_LEAD — technical proposal review
 *   BD        — proposal consolidation, quality and compliance
 *   PARTNER   — final review and approval
 *
 * This remains configuration data: a new version can be published without a
 * code change. No document file is uploaded or stored.
 */
export const PROPOSAL_CHECKLIST_NAME = "Proposal Quality Review Checklist";

export type ChecklistResponsibility = "TEAM_LEAD" | "BD" | "PARTNER";

export type ProposalChecklistSeedItem = {
  code: string;
  label: string;
  responsibility: ChecklistResponsibility;
  section: string;
  scoring: string;
};

export const CHECKLIST_RESPONSIBILITY_LABELS: Record<ChecklistResponsibility, string> = {
  TEAM_LEAD: "Team Lead — Technical Proposal Review",
  BD: "Business Development — Proposal Review and Submission",
  PARTNER: "Partner — Final Review and Approval",
};

export const PROPOSAL_CHECKLIST_ITEMS: ProposalChecklistSeedItem[] = [
  // ── Team Lead ─────────────────────────────────────────────────────────────
  { code: "TL-B1", responsibility: "TEAM_LEAD", section: "Technical approach", scoring: "1-5", label: "B1. Clear understanding of the client's scope of work and expected deliverables" },
  { code: "TL-B2", responsibility: "TEAM_LEAD", section: "Technical approach", scoring: "1-5", label: "B2. Proposed methodology is technically sound and tailored to the client's requirements" },
  { code: "TL-B3", responsibility: "TEAM_LEAD", section: "Technical approach", scoring: "1-5", label: "B3. Relevant past engagements cited to demonstrate technical competence" },
  { code: "TL-B4", responsibility: "TEAM_LEAD", section: "Technical approach", scoring: "1-5", label: "B4. Proposed team members identified with relevant qualifications and experience" },
  { code: "TL-B5", responsibility: "TEAM_LEAD", section: "Technical approach", scoring: "1-5", label: "B5. Applicable industry regulations, standards and technical requirements addressed" },
  { code: "TL-B6", responsibility: "TEAM_LEAD", section: "Technical approach", scoring: "1-5", label: "B6. Proposed work plan, timelines and milestones are realistic and achievable" },
  { code: "TL-B7", responsibility: "TEAM_LEAD", section: "Technical approach", scoring: "1-5", label: "B7. All technical requirements in the client's TOR/RFP addressed with no material omissions" },
  { code: "TL-C4", responsibility: "TEAM_LEAD", section: "Technical exclusions", scoring: "1-5", label: "C4. Technical exclusions, assumptions, dependencies and out-of-scope activities identified" },
  { code: "TL-E7", responsibility: "TEAM_LEAD", section: "Team structure", scoring: "1-5", label: "E7. Engagement team structure clearly defined with responsibilities assigned" },
  { code: "TL-F1", responsibility: "TEAM_LEAD", section: "Technical sign-off", scoring: "Yes=5 / No=0", label: "F1. Technical approach reviewed and confirmed accurate, complete and feasible" },

  // ── Business Development ──────────────────────────────────────────────────
  { code: "BD-A1", responsibility: "BD", section: "Executive summary and positioning", scoring: "1-5", label: "A1. Executive summary clearly states why Ronalds LLP is best suited for the engagement" },
  { code: "BD-A2", responsibility: "BD", section: "Executive summary and positioning", scoring: "1-5", label: "A2. Client's specific challenge acknowledged from the first paragraph" },
  { code: "BD-A3", responsibility: "BD", section: "Executive summary and positioning", scoring: "1-5", label: "A3. Executive summary does not exceed one page" },
  { code: "BD-A4", responsibility: "BD", section: "Executive summary and positioning", scoring: "1-5", label: "A4. Tone is professional, confident and client-focused" },
  { code: "BD-C1", responsibility: "BD", section: "Fees and commercial terms", scoring: "1-5", label: "C1. Fee clearly stated with a breakdown of what is included" },
  { code: "BD-C2", responsibility: "BD", section: "Fees and commercial terms", scoring: "1-5", label: "C2. Fee competitive relative to the client's known or estimated budget" },
  { code: "BD-C3", responsibility: "BD", section: "Fees and commercial terms", scoring: "1-5", label: "C3. Payment terms clearly stated" },
  { code: "BD-C4", responsibility: "BD", section: "Fees and commercial terms", scoring: "1-5", label: "C4. Technical exclusions supplied by the Team Lead accurately reflected in commercial terms" },
  { code: "BD-D1", responsibility: "BD", section: "Firm credentials and experience", scoring: "1-5", label: "D1. Ronalds LLP company profile current and accurate" },
  { code: "BD-D2", responsibility: "BD", section: "Firm credentials and experience", scoring: "1-5", label: "D2. At least three relevant client references or case studies included, where applicable" },
  { code: "BD-D3", responsibility: "BD", section: "Firm credentials and experience", scoring: "1-5", label: "D3. Allinial Global membership appropriately explained" },
  { code: "BD-D4", responsibility: "BD", section: "Firm credentials and experience", scoring: "1-5", label: "D4. Clear differentiator explaining why Ronalds LLP is the best choice" },
  { code: "BD-E1", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "1-5", label: "E1. Proposal formatted with correct Ronalds LLP branding" },
  { code: "BD-E2", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "1-5", label: "E2. Document proofread with no grammatical errors or inconsistencies" },
  { code: "BD-E3", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "1-5", label: "E3. Proposal complies with all client requirements including page limits and formatting" },
  { code: "BD-E4", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "1-5", label: "E4. All required attachments included, such as CR12, PIN certificate and CVs" },
  { code: "BD-E5", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "1-5", label: "E5. Correct client name, contact details and proposal references throughout" },
  { code: "BD-E6", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "1-5", label: "E6. Submission method and deadline confirmed" },
  { code: "BD-E7", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "1-5", label: "E7. Team structure and roles presented consistently with the approved technical proposal" },
  { code: "BD-E8", responsibility: "BD", section: "Presentation, compliance and submission", scoring: "Yes=5 / No=0", label: "E8. All mandatory administrative and eligibility requirements verified against the client's TOR/RFP" },

  // ── Partner ───────────────────────────────────────────────────────────────
  { code: "P-F1", responsibility: "PARTNER", section: "Partner final review", scoring: "Yes=5 / No=0", label: "F1. Technical approach reviewed and accepted based on the Team Lead's confirmation" },
  { code: "P-F2", responsibility: "PARTNER", section: "Partner final review", scoring: "Yes=5 / No=0", label: "F2. Proposed fees and commercial terms reviewed and approved" },
  { code: "P-F3", responsibility: "PARTNER", section: "Partner final review", scoring: "Yes=5 / No=0", label: "F3. Final proposal confirmed consistent with the reviewed and approved version" },
  { code: "P-F4", responsibility: "PARTNER", section: "Partner final review", scoring: "Yes=5 / No=0", label: "F4. Partner formally approves the proposal for submission" },
];

/**
 * Ensures the role-split checklist version exists. Existing proposals keep the
 * checklist version they were created with; new revisions use the new version.
 */
export async function ensureProposalChecklist(
  prisma: PrismaClient,
  createdById: string
) {
  const template = await prisma.checklistTemplate.upsert({
    where: { name: PROPOSAL_CHECKLIST_NAME },
    update: {
      description:
        "Role-split proposal quality review: Team Lead technical review, BD quality and compliance, Partner final approval.",
      isActive: true,
    },
    create: {
      name: PROPOSAL_CHECKLIST_NAME,
      description:
        "Role-split proposal quality review: Team Lead technical review, BD quality and compliance, Partner final approval.",
      createdById,
    },
  });

  const existing = await prisma.checklistTemplateVersion.findFirst({
    where: {
      templateId: template.id,
      configuration: { path: ["schema"], equals: "role-split-v2" },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) return existing;

  const latest = await prisma.checklistTemplateVersion.findFirst({
    where: { templateId: template.id },
    orderBy: { version: "desc" },
  });
  const versionNumber = (latest?.version ?? 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    await tx.checklistTemplateVersion.updateMany({
      where: { templateId: template.id, status: "ACTIVE" },
      data: { status: "RETIRED" },
    });
    return tx.checklistTemplateVersion.create({
      data: {
        templateId: template.id,
        version: versionNumber,
        status: "ACTIVE",
        publishedAt: new Date(),
        publishedById: createdById,
        createdById,
        configuration: {
          schema: "role-split-v2",
          source: "Proposal Quality Review Checklist (1).xlsx",
          responsibilities: ["TEAM_LEAD", "BD", "PARTNER"],
          note: "Team Lead completes technical items. BD completes commercial/compliance items. Partner signs off final approval.",
        },
        items: {
          create: PROPOSAL_CHECKLIST_ITEMS.map((item, index) => ({
            code: item.code,
            label: item.label,
            description: `${item.section} · Scoring: ${item.scoring}`,
            required: true,
            requiresReview: false,
            responsibleRole: item.responsibility,
            sortOrder: index + 1,
            metadata: {
              section: item.section,
              scoring: item.scoring,
              responsibility: item.responsibility,
            },
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
  });
  return version;
}
