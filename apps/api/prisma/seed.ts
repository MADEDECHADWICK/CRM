import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { reportPeriodRange, REPORT_PERIODS, type ReportPeriod, type LeadSource } from "@crm/core";
import { ensureProposalChecklist } from "./proposal-checklist";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Demo data must be an explicit development action, never a production seed.
if (process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Demo seed is disabled. Use the company import instead. For an isolated demo database only, set ALLOW_DEMO_SEED=true.");
  process.exit(1);
}

const DEMO_PASSWORD = "password123";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(d = new Date()): Date {
  const r = new Date(d);
  const dow = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - dow);
  r.setHours(12, 0, 0, 0);
  return r;
}

// Within the current calendar week (guaranteed, anchored to Monday and in the past).
function withinWeek(offsetDays: number): Date {
  const base = startOfWeek();
  const d = new Date(base.getTime() + offsetDays * DAY_MS);
  d.setHours(8, 0, 0, 0);
  const now = new Date();
  // Never seed a future stageEnteredAt (else the period window's `to = now`
  // would exclude the deal it's meant to demonstrate).
  return d.getTime() < now.getTime()
    ? d
    : new Date(now.getTime() - 2 * 60 * 60 * 1000);
}

// Strictly in the future, N days from now at 09:00 — used for the optional
// follow-up / revisit dates, which are always ahead of the clock.
function daysFromNow(daysAhead: number): Date {
  const d = new Date(Date.now() + daysAhead * DAY_MS);
  d.setHours(9, 0, 0, 0);
  return d;
}

// Within the current calendar month, N days back from today (>= the 2nd).
function withinMonth(daysBack: number): Date {
  const now = new Date();
  const day = Math.max(2, now.getDate() - daysBack);
  return new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0, 0);
}

// Within the current quarter but earlier than this month.
function withinQuarter(daysBeforeNow: number): Date {
  const now = new Date();
  const qm = now.getMonth() - (now.getMonth() % 3);
  const qs = new Date(now.getFullYear(), qm, 1, 12, 0, 0, 0);
  let d = new Date(now.getTime() - daysBeforeNow * DAY_MS);
  if (d.getTime() < qs.getTime()) d = new Date(qs.getTime() + 2 * DAY_MS);
  return d;
}

// Within this calendar year but before the current quarter.
function withinYear(daysBeforeNow: number): Date {
  const now = new Date();
  const ys = new Date(now.getFullYear(), 0, 1, 12, 0, 0, 0);
  const qs = new Date(now.getFullYear(), now.getMonth() - (now.getMonth() % 3), 1, 12, 0, 0, 0);
  let d = new Date(now.getTime() - daysBeforeNow * DAY_MS);
  if (d.getTime() >= qs.getTime()) d = new Date(qs.getTime() - 20 * DAY_MS);
  if (d.getTime() < ys.getTime()) d = new Date(ys.getTime() + 10 * DAY_MS);
  return d;
}

// Strictly before this calendar year (only visible under "All time").
function lastYear(daysBeforeNow: number): Date {
  const now = new Date();
  const ys = new Date(now.getFullYear(), 0, 1, 12, 0, 0, 0);
  let d = new Date(now.getTime() - daysBeforeNow * DAY_MS);
  if (d.getTime() >= ys.getTime()) d = new Date(ys.getTime() - 25 * DAY_MS);
  return d;
}

async function upsertOrganization(name: string, industry: string, country = "Kenya") {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.organization.create({ data: { name, industry, country } });
}

async function main() {
  // Idempotent users with real passwords so the demo app can actually log in.
  const john = await prisma.user.upsert({
    where: { email: "john@firm.co.ke" },
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10) },
    create: {
      name: "John Partner",
      email: "john@firm.co.ke",
      role: "PARTNER",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });
  const mary = await prisma.user.upsert({
    where: { email: "mary@firm.co.ke" },
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10) },
    create: {
      name: "Mary Manager",
      email: "mary@firm.co.ke",
      role: "MANAGER",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });
  const grace = await prisma.user.upsert({
    where: { email: "grace@firm.co.ke" },
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10), role: "MARKETING_BD", isActive: true },
    create: {
      name: "Grace BD",
      email: "grace@firm.co.ke",
      role: "MARKETING_BD",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });

  const david = await prisma.user.upsert({
    where: { email: "david@firm.co.ke" },
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10), role: "PROPOSAL_COORDINATOR", isActive: true },
    create: {
      name: "David Proposal Coordinator",
      email: "david@firm.co.ke",
      role: "PROPOSAL_COORDINATOR",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });
  const lisa = await prisma.user.upsert({
    where: { email: "lisa@firm.co.ke" },
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10), role: "TECHNICAL_REVIEWER", isActive: true },
    create: {
      name: "Lisa Technical Reviewer",
      email: "lisa@firm.co.ke",
      role: "TECHNICAL_REVIEWER",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });
  const peter = await prisma.user.upsert({
    where: { email: "peter@firm.co.ke" },
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10), role: "COUNTRY_LEAD", isActive: true },
    create: {
      name: "Peter Country Lead",
      email: "peter@firm.co.ke",
      role: "COUNTRY_LEAD",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });
  const itAdmin = await prisma.user.upsert({
    where: { email: "it@firm.co.ke" },
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10), role: "IT_ADMIN", isActive: true },
    create: {
      name: "IT Administrator",
      email: "it@firm.co.ke",
      role: "IT_ADMIN",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });

  const audit = await prisma.department.upsert({
    where: { name: "Audit" },
    update: { headId: john.id },
    create: { name: "Audit", headId: john.id },
  });
  const tax = await prisma.department.upsert({
    where: { name: "Tax" },
    update: { headId: mary.id },
    create: { name: "Tax", headId: mary.id },
  });
  const advisory = await prisma.department.upsert({
    where: { name: "Advisory" },
    update: {},
    create: { name: "Advisory" },
  });

  await prisma.user.update({ where: { id: john.id }, data: { role: "PARTNER", departmentId: audit.id, isActive: true } });
  await prisma.user.update({ where: { id: mary.id }, data: { role: "MANAGER", departmentId: tax.id, supervisorPartnerId: john.id, isActive: true } });
  await prisma.user.update({ where: { id: david.id }, data: { departmentId: null } });
  await prisma.user.update({ where: { id: lisa.id }, data: { departmentId: null } });
  await prisma.user.update({ where: { id: peter.id }, data: { departmentId: null } });

  // Firm dimensions are separate from the client's country.
  const ronaldsKenya = await prisma.contractingEntity.upsert({
    where: { name: "Ronalds Africa (Kenya)" },
    update: { isActive: true },
    create: { name: "Ronalds Africa (Kenya)", code: "RON-KE", country: "Kenya", baseCurrency: "KES" },
  });
  const selego = await prisma.contractingEntity.upsert({
    where: { name: "Selego" },
    update: { isActive: true },
    create: { name: "Selego", code: "SEL", country: "Uganda", baseCurrency: "UGX" },
  });
  const nairobiOffice = await prisma.office.upsert({
    where: { name: "Nairobi Office" },
    update: { entityId: ronaldsKenya.id, country: "Kenya" },
    create: { name: "Nairobi Office", country: "Kenya", entityId: ronaldsKenya.id },
  });
  const kampalaOffice = await prisma.office.upsert({
    where: { name: "Kampala Office" },
    update: { entityId: selego.id, country: "Uganda" },
    create: { name: "Kampala Office", country: "Uganda", entityId: selego.id },
  });
  const auditCategory = await prisma.serviceCategory.upsert({
    where: { name: "Audit & Assurance" },
    update: {},
    create: { name: "Audit & Assurance" },
  });
  const taxCategory = await prisma.serviceCategory.upsert({
    where: { name: "Tax" },
    update: {},
    create: { name: "Tax" },
  });
  const advisoryCategory = await prisma.serviceCategory.upsert({
    where: { name: "Advisory" },
    update: {},
    create: { name: "Advisory" },
  });

  // Clean previous demo runs (cascade removes proposals, stage history,
  // followers, allocations and contributor rows).
  await prisma.opportunity.deleteMany({
    where: { OR: [{ title: { startsWith: "Demo" } }, { title: "FY2027 Statutory Audit" }] },
  });
  await prisma.prequalification.deleteMany({ where: { externalReference: { startsWith: "DEMO-" } } });
  await prisma.checklistTemplate.deleteMany({ where: { name: { startsWith: "Demo " } } });
  await prisma.approvalPolicy.deleteMany({ where: { name: { startsWith: "Demo " } } });
  await prisma.credential.deleteMany({ where: { name: { startsWith: "Demo " } } });
  await prisma.userAccessScope.deleteMany({ where: { userId: peter.id } });
  await prisma.notification.deleteMany({
    where: { type: { startsWith: "DEMO_" }, userId: { in: [john.id, mary.id, grace.id, david.id, lisa.id, peter.id, itAdmin.id] } },
  });

  const orgs: Record<string, { id: string }> = {};
  const mid = async (name: string, industry: string) => {
    orgs[name] = await upsertOrganization(name, industry);
    return orgs[name];
  };

  type DemoOpp = {
    title: string;
    org: string;
    industry: string;
    department: "AUDIT" | "TAX";
    stage:
      | "PROSPECT"
      | "LEAD"
      | "PROPOSAL"
      | "AWAITING_FEEDBACK"
      | "NOT_SUBMITTED"
      | "WON"
      | "LOST"
      | "NO_REPLY"
      | "DEFERRED";
    service: string;
    amount?: number;
    owner: "john" | "mary";
    enteredAt: Date;
    lostReason?: string;
    revisitAt?: Date;
    // BR-018: attribution. Required with no default, so every seeded deal
    // states where it came from — the reporting is only as good as this.
    leadSource: LeadSource;
    leadSourceNote?: string;
    // How long the lead sat before the deal was written up. Varying this
    // gives the "lead to proposal" report something real to measure.
    leadReceivedAt: Date;
    // BR-016: the internal drafting deadline, where the deal still has one.
    proposalDueAt?: Date;
    proposalSubmittedAt?: Date;
    // BR-019: the breach state, for the one seeded NOT_SUBMITTED deal.
    proposalBreachedAt?: Date;
    breachNoteRequired?: boolean;
    breachNoteDueAt?: Date;
    // Review: how the won job was won (defaults to new business).
    businessType?: "NEW_BUSINESS" | "RENEWAL" | "CROSS_SELL" | "UPSELL";
    submittedFee?: number;
    confirmedAwardValue?: number;
    lossReasonCode?: "PRICE_FEES" | "TECHNICAL_SCORE" | "EXPERIENCE_CREDENTIALS" | "RELATIONSHIP_INCUMBENT" | "SCOPE_MISMATCH" | "PROCUREMENT_COMPLIANCE" | "OTHER" | "NOT_SUPPLIED";
    awardEvidenceReference?: string;
    awardVerificationStatus?: "UNVERIFIED" | "PENDING" | "VERIFIED" | "DISPUTED";
    engagementLetterStatus?: "NOT_STARTED" | "SENT" | "SIGNED" | "RECEIVED" | "NOT_REQUIRED";
    engagementLetterReference?: string;
    nextAction?: string;
    nextActionDueAt?: Date;
  };

  const now = new Date();
  const ownerOf = { john: john.id, mary: mary.id };

  // One deal per time bucket so every period resolves to different numbers.
  const demo: DemoOpp[] = [
    {
      // This week — prospect raised this week.
      title: "Demo — ABC Retail tax compliance review",
      org: "ABC Retail Ltd",
      industry: "Retail",
      department: "TAX",
      stage: "PROSPECT",
      service: "Tax compliance review",
      owner: "john",
      enteredAt: withinWeek(0),
      leadSource: "WEBSITE",
      leadReceivedAt: daysFromNow(-4),
      nextAction: "Confirm whether the client has a live service requirement",
      nextActionDueAt: daysFromNow(4),
    },
    {
      // This week — active proposal entered this week.
      title: "Demo — KKTel network audit proposal",
      org: "KKTel Communications",
      industry: "Telecom",
      department: "AUDIT",
      stage: "PROPOSAL",
      service: "Network infrastructure audit",
      amount: 680000,
      owner: "mary",
      enteredAt: withinWeek(1),
      leadSource: "REFERRAL",
      leadReceivedAt: daysFromNow(-19),
      // 12 days out — lands in the amber band, so the pipeline shows a
      // healthy mix of colours rather than everything green.
      proposalDueAt: daysFromNow(12),
      nextAction: "Finish draft proposal and collect outstanding inputs",
      nextActionDueAt: daysFromNow(2),
    },
    {
      // This week — proposal sent, client still reading it. Sits between the
      // KKTel proposal and the win so the "awaiting feedback" slice is
      // visible without being mistaken for a closed deal.
      title: "Demo — Kenya Tea Packers IFRS advisory proposal",
      org: "Kenya Tea Packers",
      industry: "Agriculture",
      department: "AUDIT",
      stage: "AWAITING_FEEDBACK",
      service: "IFRS 16 transition advisory",
      amount: 520000,
      owner: "john",
      enteredAt: withinWeek(2),
      revisitAt: daysFromNow(6),
      leadSource: "PARTNER_REFERRAL",
      leadReceivedAt: daysFromNow(-33),
      // Drafted to an internal deadline, then actually sent. The gap between
      // the two dates is the real "submission lag" the business wants to see
      // improve — the deadline is not the send date.
      proposalDueAt: withinWeek(1),
      proposalSubmittedAt: withinWeek(2),
      nextAction: "Chase client feedback and confirm evaluation timeline",
      nextActionDueAt: daysFromNow(6),
    },
    {
      // This week — won today.
      title: "Demo — GreenGrocer statutory audit",
      org: "GreenGrocer Ltd",
      industry: "Retail",
      department: "AUDIT",
      stage: "WON",
      service: "Statutory audit FY2026",
      amount: 450000,
      submittedFee: 450000,
      confirmedAwardValue: 470000,
      awardEvidenceReference: "DEMO-AWARD-001",
      awardVerificationStatus: "VERIFIED",
      engagementLetterStatus: "SIGNED",
      engagementLetterReference: "DEMO-EL-001",
      nextAction: "Complete Finance/service handover",
      nextActionDueAt: daysFromNow(2),
      owner: "john",
      enteredAt: withinWeek(0),
      leadSource: "EXHIBITION",
      leadReceivedAt: daysFromNow(-62),
    },
    {
      // This month (not this week) — lead qualified this month.
      title: "Demo — HF Bank internal audit",
      org: "HF Bank",
      industry: "Banking",
      department: "AUDIT",
      stage: "LEAD",
      service: "Internal audit engagement",
      amount: 150000,
      owner: "mary",
      enteredAt: withinMonth(8),
      leadSource: "TENDER",
      leadReceivedAt: daysFromNow(-11),
      nextAction: "Qualify requirement and confirm the decision-maker",
      nextActionDueAt: daysFromNow(1),
    },
    {
      // This month — won mid-month.
      title: "Demo — SunLogistics TIN issuance",
      org: "SunLogistics",
      industry: "Transport",
      department: "TAX",
      stage: "WON",
      service: "Tax registration & TIN issuance",
      amount: 320000,
      submittedFee: 320000,
      confirmedAwardValue: 310000,
      businessType: "CROSS_SELL",
      engagementLetterStatus: "SIGNED",
      engagementLetterReference: "DEMO-EL-002",
      owner: "john",
      enteredAt: withinMonth(15),
      leadSource: "WALK_IN",
      leadReceivedAt: daysFromNow(-27),
    },
    {
      // This month — lost mid-month.
      title: "Demo — PearlHospital payroll audit",
      org: "PearlHospital",
      industry: "Healthcare",
      department: "AUDIT",
      stage: "LOST",
      service: "Payroll compliance audit",
      amount: 320000,
      owner: "mary",
      enteredAt: withinMonth(18),
      lostReason: "Client chose an internal audit team",
      lossReasonCode: "NOT_SUPPLIED",
      leadSource: "COLD_OUTREACH",
      leadReceivedAt: daysFromNow(-40),
    },
    {
      // This month — deferred, revisit in 30 days.
      title: "Demo — Kitui Cooperative audit",
      org: "Kitui Cooperative Society",
      industry: "Agriculture",
      department: "TAX",
      stage: "DEFERRED",
      service: "Cooperative books audit",
      amount: 210000,
      owner: "john",
      enteredAt: withinMonth(10),
      revisitAt: new Date(now.getTime() + 30 * DAY_MS),
      leadSource: "REFERRAL",
      leadReceivedAt: daysFromNow(-21),
    },
    {
      // This month — no reply.
      title: "Demo — WananchiEnergy audit",
      org: "WananchiEnergy",
      industry: "Energy",
      department: "AUDIT",
      stage: "NO_REPLY",
      service: "Energy sector audit",
      amount: 400000,
      owner: "mary",
      enteredAt: withinMonth(11),
      leadSource: "MARKETING_CAMPAIGN",
      leadReceivedAt: daysFromNow(-15),
    },
    {
      // This quarter (not this month) — active proposal from August.
      title: "Demo — CoastalTelecom ad-hoc audit",
      org: "CoastalTelecom",
      industry: "Telecom",
      department: "AUDIT",
      stage: "PROPOSAL",
      service: "Ad-hoc regulatory audit",
      amount: 750000,
      owner: "john",
      enteredAt: withinQuarter(45),
      leadSource: "COLD_OUTREACH",
      leadReceivedAt: daysFromNow(-58),
      // 3 days out — red band, still recoverable. This is the deal the
      // pipeline is meant to make you look at.
      proposalDueAt: daysFromNow(3),
      nextAction: "Complete technical review and resolve review comments",
      nextActionDueAt: daysFromNow(1),
    },
    {
      // A missed drafting deadline, already flagged by the sweep. Seeds the
      // NOT_SUBMITTED column, the rose stage colour, and an outstanding
      // breach-note debt so the escalation path is visible without having to
      // wait for a real deadline to pass.
      title: "Demo — RiftValley proposed audit",
      org: "RiftValley Sacco",
      industry: "Cooperative banking",
      department: "AUDIT",
      stage: "NOT_SUBMITTED",
      service: "Statutory audit FY2026",
      amount: 390000,
      owner: "mary",
      enteredAt: withinMonth(20),
      leadSource: "OTHER",
      leadSourceNote: "Introduced at the Nakuru AGM trade fair",
      leadReceivedAt: daysFromNow(-24),
      proposalDueAt: daysFromNow(-2),
      proposalBreachedAt: daysFromNow(-2),
      breachNoteRequired: true,
      breachNoteDueAt: daysFromNow(1),
      nextAction: "Explain missed deadline and recover the draft",
      nextActionDueAt: daysFromNow(1),
    },
    {
      // This quarter — won in July.
      title: "Demo — Kebs Laboratories audit support",
      org: "Kebs Laboratories",
      industry: "Public sector",
      department: "AUDIT",
      stage: "WON",
      service: "Laboratory audit support",
      amount: 1200000,
      submittedFee: 1200000,
      confirmedAwardValue: 1200000,
      businessType: "UPSELL",
      awardEvidenceReference: "DEMO-AWARD-003",
      awardVerificationStatus: "VERIFIED",
      owner: "mary",
      enteredAt: withinQuarter(70),
      leadSource: "TENDER",
      leadReceivedAt: daysFromNow(-96),
    },
    {
      // This quarter — lost in July.
      title: "Demo — CityBank SOX readiness",
      org: "CityBank",
      industry: "Banking",
      department: "AUDIT",
      stage: "LOST",
      service: "SOX readiness review",
      amount: 300000,
      owner: "john",
      enteredAt: withinQuarter(55),
      lostReason: "Scope changes requested by client",
      lossReasonCode: "SCOPE_MISMATCH",
      leadSource: "SOCIAL_MEDIA",
      leadReceivedAt: daysFromNow(-71),
    },
    {
      // This year (before this quarter) — lead from May.
      title: "Demo — MombasaPort logistics audit",
      org: "MombasaPort Logistics",
      industry: "Ports & Logistics",
      department: "TAX",
      stage: "LEAD",
      service: "Logistics tax audit",
      amount: 180000,
      owner: "mary",
      enteredAt: withinYear(140),
      leadSource: "REFERRAL",
      leadReceivedAt: daysFromNow(-150),
    },
    {
      // This year — won in March.
      title: "Demo — NyeriSaccos audit",
      org: "NyeriSaccos",
      industry: "Financial services",
      department: "AUDIT",
      stage: "WON",
      service: "Cooperative audit FY2025",
      amount: 900000,
      submittedFee: 900000,
      confirmedAwardValue: 900000,
      businessType: "RENEWAL",
      owner: "john",
      enteredAt: withinYear(200),
      leadSource: "PARTNER_REFERRAL",
      leadReceivedAt: daysFromNow(-210),
    },
    {
      // This year — lost in March.
      title: "Demo — EldoretSteel audit",
      org: "EldoretSteel",
      industry: "Manufacturing",
      department: "AUDIT",
      stage: "LOST",
      service: "Statutory audit",
      amount: 400000,
      owner: "mary",
      enteredAt: withinYear(180),
      lostReason: "Pricing too high vs competing firm",
      leadSource: "COLD_OUTREACH",
      leadReceivedAt: daysFromNow(-190),
    },
    {
      // Last year — only visible under "All time".
      title: "Demo — JujaVet clinic audit",
      org: "JujaVet Clinic",
      industry: "Healthcare",
      department: "AUDIT",
      stage: "WON",
      service: "Clinic books audit",
      amount: 300000,
      owner: "john",
      enteredAt: lastYear(420),
      leadSource: "REFERRAL",
      leadReceivedAt: lastYear(430),
    },
    {
      // Last year — only visible under "All time".
      title: "Demo — BayView hotel audit",
      org: "BayView Hotel",
      industry: "Hospitality",
      department: "TAX",
      stage: "LOST",
      service: "Hospitality tax audit",
      amount: 250000,
      owner: "mary",
      enteredAt: lastYear(440),
      lostReason: "Deferred indefinitely by owner",
      // The one OTHER source in the seed set, with the note that OTHER
      // requires — an untagged "other" is the same as no attribution at all.
      leadSource: "OTHER",
      leadSourceNote: "Walked in after seeing the office signage",
      leadReceivedAt: lastYear(450),
    },
  ];

  const createdOpportunities: Record<string, { id: string; stage: string; ownerId: string | null }> = {};

  for (const opp of demo) {
    const organization = await mid(opp.org, opp.industry);
    const outcome =
      opp.stage === "WON" ? "WON" as const
      : opp.stage === "LOST" ? "LOST" as const
      : opp.stage === "NO_REPLY" ? "NO_RESPONSE" as const
      : opp.stage === "DEFERRED" ? "ON_HOLD" as const
      : "OPEN" as const;
    const created = await prisma.opportunity.create({
      data: {
        title: opp.title,
        organizationId: organization.id,
        departmentId: opp.department === "AUDIT" ? audit.id : tax.id,
        createdById: grace.id,
        ownerId: ownerOf[opp.owner],
        stage: opp.stage,
        service: opp.service,
        ...(opp.amount ? { amount: opp.amount } : {}),
        ...(opp.submittedFee != null ? { submittedFee: opp.submittedFee } : {}),
        ...(opp.confirmedAwardValue != null ? { confirmedAwardValue: opp.confirmedAwardValue } : {}),
        currency: "KES",
        outcome,
        outcomeAt: ["WON", "LOST", "NO_REPLY", "DEFERRED"].includes(opp.stage) ? opp.enteredAt : null,
        qualificationStatus: opp.stage === "PROSPECT" ? "UNQUALIFIED" : "QUALIFIED",
        qualificationDate: opp.stage === "PROSPECT" ? null : opp.leadReceivedAt,
        ...(opp.lossReasonCode ? { lossReasonCode: opp.lossReasonCode } : {}),
        ...(opp.stage === "WON" ? {
          awardDate: opp.enteredAt,
          awardCurrency: "KES",
          awardEvidenceReference: opp.awardEvidenceReference ?? `DEMO-AWARD-${opp.title.slice(-6)}`,
          awardVerificationStatus: opp.awardVerificationStatus ?? "PENDING",
          engagementLetterStatus: opp.engagementLetterStatus ?? "SENT",
          engagementLetterReference: opp.engagementLetterReference ?? null,
        } : {}),
        contractingEntityId: opp.org === "MombasaPort Logistics" ? selego.id : ronaldsKenya.id,
        officeId: opp.org === "MombasaPort Logistics" ? kampalaOffice.id : nairobiOffice.id,
        serviceCategoryId:
          opp.department === "TAX"
            ? taxCategory.id
            : opp.service.toLowerCase().includes("advisory")
              ? advisoryCategory.id
              : auditCategory.id,
        reviewerId: ["PROPOSAL", "AWAITING_FEEDBACK", "WON", "LOST"].includes(opp.stage) ? lisa.id : null,
        nextAction: opp.nextAction ?? (["PROSPECT", "LEAD", "PROPOSAL", "AWAITING_FEEDBACK", "NOT_SUBMITTED", "DEFERRED"].includes(opp.stage)
          ? "Review the opportunity and update the next step"
          : null),
        nextActionDueAt: opp.nextActionDueAt ?? (["PROSPECT", "LEAD", "PROPOSAL", "AWAITING_FEEDBACK", "NOT_SUBMITTED", "DEFERRED"].includes(opp.stage)
          ? daysFromNow(3)
          : null),
        nextActionOwnerId: ownerOf[opp.owner],
        stageEnteredAt: opp.enteredAt,
        wonAt: opp.stage === "WON" ? opp.enteredAt : undefined,
        lostAt: opp.stage === "LOST" ? opp.enteredAt : undefined,
        lostReason: opp.lostReason,
        lossReasonDetail: opp.lostReason,
        revisitAt: opp.revisitAt,
        createdAt: opp.enteredAt,

        // Attribution and the proposal drafting lifecycle. proposalDueSetBy
        // and proposalDueSetAt are backdated to just before the deadline so
        // the audit columns tell a coherent story rather than claiming a
        // deadline was issued on the day the deal was created.
        leadSource: opp.leadSource,
        leadSourceNote: opp.leadSourceNote ?? null,
        leadReceivedAt: opp.leadReceivedAt,
        ...(opp.proposalDueAt
          ? {
              proposalDueAt: opp.proposalDueAt,
              proposalDueSetById: grace.id,
              proposalDueSetAt: new Date(opp.proposalDueAt.getTime() - 7 * DAY_MS),
            }
          : {}),
        ...(opp.proposalSubmittedAt
          ? { proposalSubmittedAt: opp.proposalSubmittedAt }
          : {}),
        ...(opp.proposalBreachedAt
          ? { proposalBreachedAt: opp.proposalBreachedAt }
          : {}),
        ...(opp.breachNoteRequired !== undefined
          ? { breachNoteRequired: opp.breachNoteRequired }
          : {}),
        ...(opp.breachNoteDueAt ? { breachNoteDueAt: opp.breachNoteDueAt } : {}),
        // Review: a won job records how it was won and who signed it.
        ...(opp.stage === "WON"
          ? { businessType: opp.businessType ?? "NEW_BUSINESS", signingPartnerId: john.id }
          : {}),
      },
    });
    createdOpportunities[opp.title] = { id: created.id, stage: created.stage, ownerId: created.ownerId };

    // The NOT_SUBMITTED deal needs a real system-authored history entry and
    // an open breach debt, or it would be a deal in a stage with no record
    // of how it got there — the exact audit hole ActorType exists to close.
    if (opp.stage === "NOT_SUBMITTED" && opp.proposalBreachedAt) {
      await prisma.stageHistoryEntry.create({
        data: {
          opportunityId: created.id,
          fromStage: "PROPOSAL",
          toStage: "NOT_SUBMITTED",
          changedById: null,
          actorType: "SYSTEM",
          reason: null,
          systemReason: `BD drafting deadline of ${opp.proposalDueAt!.toISOString().slice(0, 10)} passed with nothing submitted.`,
          changedAt: opp.proposalBreachedAt,
        },
      });
    }
  }

  // Real Ronalds proposal quality checklist, imported as configuration.
  // The workflow below uses this active version for every demo proposal.
  const checklistVersion = await ensureProposalChecklist(prisma, grace.id);

  await prisma.approvalPolicy.create({
    data: {
      name: "Demo approval policy — proposals under KES 1,000,000",
      description: "Demo only. Replace with Ronalds' approved approval limits.",
      minAmount: 0,
      maxAmount: 1_000_000,
      currency: "KES",
      requiredRole: "MANAGER",
      requiredApprovals: 1,
      prohibitsSelfApproval: true,
      isActive: true,
      createdById: grace.id,
    },
  });

  const demoCredential = await prisma.credential.create({
    data: {
      name: "Demo ISO 27001 certificate",
      ownerId: lisa.id,
      reference: "DEMO-CRED-001",
      version: "2026",
      expiryAt: daysFromNow(180),
      status: "ACTIVE",
      notes: "Demo metadata only. No file is stored in the CRM.",
      createdById: grace.id,
    },
  });

  type ProposalDemoInput = {
    opportunityTitle: string;
    revisionStatus: "PENDING_INPUTS" | "IN_PREPARATION" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "SUBMITTED" | "NOT_SUBMITTED";
    checklist: "pending" | "partial" | "complete";
    feeAmount: number;
    reviewApproved?: boolean;
    partnerApproved?: boolean;
    submittedAt?: Date;
    externalReference?: string;
    withCredential?: boolean;
  };

  const addProposalDemo = async (input: ProposalDemoInput) => {
    const opp = createdOpportunities[input.opportunityTitle];
    if (!opp) return;
    const proposal = await prisma.proposal.create({
      data: {
        opportunityId: opp.id,
        title: `Proposal — ${input.opportunityTitle.replace(/^Demo — /, "")}`,
        createdById: david.id,
        technicalOwnerId: mary.id,
        bdOwnerId: david.id,
        currentRevisionNumber: 1,
      },
    });
    const itemStatuses = checklistVersion.items.map((item, index) => {
      if (input.checklist === "pending") return { item, status: "PENDING" as const };
      if (input.checklist === "partial") {
        return index < 2 ? { item, status: "COMPLETE" as const } : { item, status: "PENDING" as const };
      }
      return { item, status: item.requiresReview ? "REVIEWED" as const : "COMPLETE" as const };
    });

    const revision = await prisma.proposalRevision.create({
      data: {
        proposalId: proposal.id,
        revisionNumber: 1,
        status: input.revisionStatus,
        workflowStage: input.submittedAt
          ? "SUBMITTED"
          : input.revisionStatus === "IN_REVIEW"
            ? "BD_QUALITY_REVIEW"
            : input.revisionStatus === "NOT_SUBMITTED"
              ? "RETURNED_TO_TECHNICAL"
              : "TECHNICAL_PREPARATION",
        technicalCompletedAt: ["IN_REVIEW", "SUBMITTED", "APPROVED"].includes(input.revisionStatus) ? daysFromNow(-4) : null,
        technicalCompletedById: ["IN_REVIEW", "SUBMITTED", "APPROVED"].includes(input.revisionStatus) ? mary.id : null,
        bdReviewedAt: ["SUBMITTED", "APPROVED"].includes(input.revisionStatus) ? daysFromNow(-3) : null,
        bdReviewedById: ["SUBMITTED", "APPROVED"].includes(input.revisionStatus) ? david.id : null,
        partnerSignedAt: input.partnerApproved ? daysFromNow(-2) : null,
        partnerSignedById: input.partnerApproved ? john.id : null,
        returnedAt: input.revisionStatus === "NOT_SUBMITTED" ? daysFromNow(-2) : null,
        returnReason: input.revisionStatus === "NOT_SUBMITTED" ? "Demo: deadline missed and technical changes still required." : null,
        checklistTemplateVersionId: checklistVersion.id,
        summary: `Demo revision for ${input.opportunityTitle.replace(/^Demo — /, "")}`,
        feeAmount: input.feeAmount,
        feeCurrency: "KES",
        scopeSummary: "Demo scope: statutory audit and related reporting.",
        keyTerms: "Demo terms: fees exclusive of taxes and disbursements.",
        materialSnapshot: {
          approvedQuotedFee: input.feeAmount,
          currency: "KES",
          scope: "Demo scope: statutory audit and related reporting.",
        },
        createdById: david.id,
        ...(input.partnerApproved ? { approvedAt: input.submittedAt ?? daysFromNow(-3) } : {}),
        checklistItems: {
          create: itemStatuses.map(({ item, status }) => ({
            templateItemId: item.id,
            code: item.code,
            label: item.label,
            required: true,
            requiresReview: item.requiresReview,
            sortOrder: item.sortOrder,
            status,
            responsibleRole: item.responsibleRole,
            responsibleUserId: item.requiresReview ? lisa.id : david.id,
            ...(status === "COMPLETE" || status === "REVIEWED"
              ? { completedAt: daysFromNow(-4), completedById: david.id }
              : {}),
            ...(status === "REVIEWED"
              ? { reviewedAt: daysFromNow(-3), reviewedById: lisa.id }
              : {}),
            comment: status === "PENDING" ? "Demo: awaiting input." : "Demo: checked.",
          })),
        },
      },
    });

    if (input.reviewApproved) {
      await prisma.proposalApproval.create({
        data: {
          revisionId: revision.id,
          kind: "REVIEW",
          status: "APPROVED",
          actorId: mary.id,
          actorRole: "MANAGER",
          decidedAt: daysFromNow(-3),
          comment: "Demo: team lead confirmed the technical work is complete.",
          amountAtDecision: input.feeAmount,
          currency: "KES",
        },
      });
    }
    if (input.partnerApproved) {
      await prisma.proposalApproval.create({
        data: {
          revisionId: revision.id,
          kind: "APPROVAL",
          status: "APPROVED",
          actorId: john.id,
          actorRole: "PARTNER",
          decidedAt: daysFromNow(-2),
          comment: "Demo: signing Partner approved the proposal after BD quality review.",
          amountAtDecision: input.feeAmount,
          currency: "KES",
          selfApproval: false,
        },
      });
    }
    if (input.submittedAt) {
      await prisma.proposalSubmission.create({
        data: {
          revisionId: revision.id,
          submittedAt: input.submittedAt,
          channel: "Email",
          externalReference: input.externalReference ?? "DEMO-SUBMISSION",
          proofReference: `${input.externalReference ?? "DEMO-SUBMISSION"}-PROOF`,
          isFirstSubmission: true,
          submittedById: grace.id,
          notes: "Demo submission record. No document is stored.",
        },
      });
    }
    if (input.withCredential) {
      await prisma.proposalCredentialReference.create({
        data: {
          revisionId: revision.id,
          credentialId: demoCredential.id,
          credentialVersion: demoCredential.version,
          note: "Demo credential reference only.",
        },
      });
    }
    return { proposal, revision };
  };

  await addProposalDemo({
    opportunityTitle: "Demo — KKTel network audit proposal",
    revisionStatus: "IN_PREPARATION",
    checklist: "partial",
    feeAmount: 680000,
  });
  await addProposalDemo({
    opportunityTitle: "Demo — CoastalTelecom ad-hoc audit",
    revisionStatus: "IN_REVIEW",
    checklist: "complete",
    feeAmount: 750000,
    reviewApproved: true,
  });
  await addProposalDemo({
    opportunityTitle: "Demo — Kenya Tea Packers IFRS advisory proposal",
    revisionStatus: "SUBMITTED",
    checklist: "complete",
    feeAmount: 520000,
    reviewApproved: true,
    partnerApproved: true,
    submittedAt: daysFromNow(-2),
    externalReference: "DEMO-RFP-001",
    withCredential: true,
  });
  await addProposalDemo({
    opportunityTitle: "Demo — GreenGrocer statutory audit",
    revisionStatus: "SUBMITTED",
    checklist: "complete",
    feeAmount: 450000,
    reviewApproved: true,
    partnerApproved: true,
    submittedAt: daysFromNow(-4),
    externalReference: "DEMO-RFP-002",
    withCredential: true,
  });
  await addProposalDemo({
    opportunityTitle: "Demo — CityBank SOX readiness",
    revisionStatus: "SUBMITTED",
    checklist: "complete",
    feeAmount: 300000,
    reviewApproved: true,
    partnerApproved: true,
    submittedAt: daysFromNow(-60),
    externalReference: "DEMO-RFP-003",
  });
  await addProposalDemo({
    opportunityTitle: "Demo — RiftValley proposed audit",
    revisionStatus: "NOT_SUBMITTED",
    checklist: "partial",
    feeAmount: 390000,
  });

  // Explicit record sharing: David sees two assigned opportunities, Lisa is
  // the reviewer, and the rest of the client database stays out of scope.
  await prisma.opportunityContributor.createMany({
    data: [
      { opportunityId: createdOpportunities["Demo — KKTel network audit proposal"].id, userId: david.id, accessLevel: "EDIT", assignedById: john.id },
      { opportunityId: createdOpportunities["Demo — CoastalTelecom ad-hoc audit"].id, userId: david.id, accessLevel: "VIEW", assignedById: john.id },
      { opportunityId: createdOpportunities["Demo — Kenya Tea Packers IFRS advisory proposal"].id, userId: david.id, accessLevel: "EDIT", assignedById: john.id },
      { opportunityId: createdOpportunities["Demo — CoastalTelecom ad-hoc audit"].id, userId: lisa.id, accessLevel: "EDIT", assignedById: john.id },
      { opportunityId: createdOpportunities["Demo — Kenya Tea Packers IFRS advisory proposal"].id, userId: lisa.id, accessLevel: "VIEW", assignedById: john.id },
      { opportunityId: createdOpportunities["Demo — GreenGrocer statutory audit"].id, userId: lisa.id, accessLevel: "VIEW", assignedById: john.id },
    ],
    skipDuplicates: true,
  });

  // Multi-country delivery allocation, finalized and reconciled to 100%.
  await prisma.opportunityAllocation.createMany({
    data: [
      { opportunityId: createdOpportunities["Demo — Kenya Tea Packers IFRS advisory proposal"].id, country: "Kenya", percentage: 60, currency: "KES", basis: "PERCENT", isFinalized: true },
      { opportunityId: createdOpportunities["Demo — Kenya Tea Packers IFRS advisory proposal"].id, country: "Tanzania", percentage: 40, currency: "KES", basis: "PERCENT", isFinalized: true },
    ],
  });

  // Separate prequalification lifecycle. Acceptance is not a win.
  const hfBank = await prisma.organization.findFirstOrThrow({ where: { name: "HF Bank" } });
  const nairobiWater = await mid("Nairobi Water", "Utilities");
  await prisma.prequalification.create({
    data: {
      organizationId: hfBank.id,
      service: "Supplier panel — internal audit",
      departmentId: audit.id,
      ownerId: mary.id,
      status: "ACCEPTED",
      applicationDate: withinQuarter(80),
      submittedAt: withinQuarter(76),
      acceptedAt: withinQuarter(40),
      cost: 50000,
      currency: "KES",
      validityFrom: withinQuarter(40),
      expiryAt: daysFromNow(300),
      externalReference: "DEMO-PREQ-001",
      notes: "Demo: accepted panel application. This is not a won engagement.",
      createdById: grace.id,
    },
  });
  const submittedPrequalification = await prisma.prequalification.create({
    data: {
      organizationId: nairobiWater.id,
      service: "Supplier panel — tax advisory",
      departmentId: tax.id,
      ownerId: peter.id,
      status: "SUBMITTED",
      applicationDate: withinMonth(20),
      submittedAt: withinMonth(18),
      cost: 35000,
      currency: "KES",
      validityFrom: withinMonth(18),
      expiryAt: daysFromNow(90),
      externalReference: "DEMO-PREQ-002",
      notes: "Demo: submitted and awaiting the panel decision.",
      createdById: grace.id,
    },
  });
  await prisma.opportunity.create({
    data: {
      title: "Demo — Nairobi Water panel tender",
      organizationId: nairobiWater.id,
      departmentId: tax.id,
      service: "Tax advisory panel tender",
      createdById: grace.id,
      ownerId: peter.id,
      stage: "LEAD",
      outcome: "OPEN",
      qualificationStatus: "QUALIFIED",
      qualificationDate: withinMonth(10),
      amount: 260000,
      estimatedValue: 260000,
      currency: "KES",
      leadSource: "TENDER",
      leadReceivedAt: withinMonth(10),
      stageEnteredAt: withinMonth(10),
      contractingEntityId: ronaldsKenya.id,
      officeId: nairobiOffice.id,
      serviceCategoryId: taxCategory.id,
      sourcePrequalificationId: submittedPrequalification.id,
      nextAction: "Confirm tender eligibility from the panel approval",
      nextActionDueAt: daysFromNow(2),
      nextActionOwnerId: peter.id,
      reviewerId: lisa.id,
    },
  });

  // Follow-up examples: overdue, upcoming, breach explanation and handover.
  await prisma.followup.createMany({
    data: [
      {
        type: "CALL",
        note: "Overdue: chase the HF Bank decision-maker for the internal audit",
        dueAt: daysFromNow(-2),
        opportunityId: createdOpportunities["Demo — HF Bank internal audit"].id,
        assignedToId: mary.id,
        createdById: grace.id,
      },
      {
        type: "EMAIL",
        note: "Chase Kenya Tea Packers feedback on the submitted proposal",
        dueAt: daysFromNow(6),
        opportunityId: createdOpportunities["Demo — Kenya Tea Packers IFRS advisory proposal"].id,
        assignedToId: john.id,
        createdById: grace.id,
      },
      {
        type: "HANDOVER",
        note: "Finance and service-team handover for won engagement: GreenGrocer statutory audit",
        dueAt: new Date(),
        opportunityId: createdOpportunities["Demo — GreenGrocer statutory audit"].id,
        assignedToId: john.id,
        createdById: grace.id,
      },
      {
        type: "TASK",
        note: 'Explain why "Demo — RiftValley proposed audit" missed its BD drafting deadline',
        dueAt: daysFromNow(1),
        opportunityId: createdOpportunities["Demo — RiftValley proposed audit"].id,
        assignedToId: mary.id,
        createdById: grace.id,
      },
      {
        type: "TASK",
        note: "Obtain feedback on why PearlHospital payroll audit was lost (reason not supplied)",
        dueAt: daysFromNow(3),
        opportunityId: createdOpportunities["Demo — PearlHospital payroll audit"].id,
        assignedToId: mary.id,
        createdById: grace.id,
      },
    ],
  });

  // Country lead Peter is scoped to Uganda only. This is a portfolio scope,
  // not firm-wide access.
  await prisma.userAccessScope.create({
    data: { userId: peter.id, country: "Uganda" },
  });

  // Group-account relationship: independent legal entities under one group.
  const abcHoldings = await mid("ABC Retail Holdings", "Retail");
  await prisma.organization.updateMany({
    where: { name: { in: ["ABC Retail Ltd", "GreenGrocer Ltd"] } },
    data: { parentOrganizationId: abcHoldings.id },
  });

  // Assign every demo organization to the first opportunity's owner and
  // department. Partner/Manager scopes then see their own work, while David
  // and Lisa remain contributor-only because they have no department scope.
  const demoOrganizations = await prisma.opportunity.findMany({
    where: { title: { startsWith: "Demo " } },
    select: { organizationId: true, ownerId: true, departmentId: true },
    orderBy: { createdAt: "asc" },
  });
  const assignedOrganizationIds = new Set<string>();
  for (const row of demoOrganizations) {
    if (assignedOrganizationIds.has(row.organizationId)) continue;
    assignedOrganizationIds.add(row.organizationId);
    await prisma.organization.update({
      where: { id: row.organizationId },
      data: {
        assignedToId: row.ownerId,
        assignedDepartmentId: row.departmentId,
        assignedById: grace.id,
        assignedAt: new Date(),
      },
    });
  }
  await prisma.organization.update({
    where: { id: abcHoldings.id },
    data: { assignedToId: john.id, assignedDepartmentId: audit.id, assignedById: grace.id, assignedAt: new Date() },
  });

  // In-app notifications demonstrate the queue without external delivery.
  await prisma.notification.createMany({
    data: [
      { userId: john.id, type: "DEMO_HANDOVER", title: "Won opportunity — handover required", body: "Complete the Finance/service handover for GreenGrocer statutory audit.", entityType: "Opportunity", entityId: createdOpportunities["Demo — GreenGrocer statutory audit"].id },
      { userId: mary.id, type: "DEMO_OVERDUE", title: "Overdue follow-up", body: "HF Bank internal audit follow-up is overdue.", entityType: "Opportunity", entityId: createdOpportunities["Demo — HF Bank internal audit"].id },
      { userId: david.id, type: "DEMO_PROPOSAL", title: "Proposal revision in preparation", body: "KKTel network audit proposal needs outstanding inputs.", entityType: "Opportunity", entityId: createdOpportunities["Demo — KKTel network audit proposal"].id },
      { userId: lisa.id, type: "DEMO_REVIEW", title: "Review assigned", body: "You are the reviewer on the CoastalTelecom proposal.", entityType: "Opportunity", entityId: createdOpportunities["Demo — CoastalTelecom ad-hoc audit"].id },
      { userId: peter.id, type: "DEMO_SCOPE", title: "Uganda portfolio", body: "Your country scope includes Uganda accounts and the Nairobi Water panel tender.", entityType: "UserAccessScope", entityId: peter.id },
      { userId: itAdmin.id, type: "DEMO_CONFIG", title: "Configuration available", body: "Proposal checklists, approval policies and access scopes are configurable.", entityType: "SystemSetting", entityId: "demo" },
      { userId: mary.id, type: "DEMO_TECHNICAL_ASSIGNED", title: "You are team lead on a proposal", body: "Prepare the technical proposal for KKTel network audit, then acknowledge it is complete.", entityType: "Opportunity", entityId: createdOpportunities["Demo — KKTel network audit proposal"].id },
      { userId: david.id, type: "DEMO_BD_ASSIGNED", title: "You are BD owner on a proposal", body: "Complete the Proposal Quality Review Checklist for KKTel network audit.", entityType: "Opportunity", entityId: createdOpportunities["Demo — KKTel network audit proposal"].id },
    ],
  });

  // Demo-only weighted pipeline probabilities so the weighted pipeline report
  // has a value. Ronalds must replace these with approved probabilities.
  await prisma.systemSetting.upsert({
    where: { key: "pipeline.weightedProbabilityByStage" },
    update: { value: { PROSPECT: 0.1, LEAD: 0.25, PROPOSAL: 0.5, AWAITING_FEEDBACK: 0.7 }, description: "Demo only. Replace with approved probabilities." },
    create: { key: "pipeline.weightedProbabilityByStage", value: { PROSPECT: 0.1, LEAD: 0.25, PROPOSAL: 0.5, AWAITING_FEEDBACK: 0.7 }, category: "Reporting", description: "Demo only. Replace with approved probabilities.", updatedById: grace.id },
  });

  console.log("Demo proposal/checklist/approval/prequalification data created.");

  // Named people at each client. Distinct from the generic company email /
  // phone on Organization — this is who you actually speak to.
  type DemoContact = {
    org: string;
    industry: string;
    name: string;
    title: string;
    department: string;
    email: string;
    phone: string;
    isPrimary: boolean;
    notes?: string;
  };

  const demoContacts: DemoContact[] = [
    {
      org: "ABC Retail Ltd",
      industry: "Retail",
      name: "Jane Mwangi",
      title: "Head of Finance",
      department: "Finance",
      email: "jane.mwangi@abc.co.ke",
      phone: "+254 720 111 222",
      isPrimary: true,
      notes: "Prefers WhatsApp. Signs off on all tax filings.",
    },
    {
      org: "ABC Retail Ltd",
      industry: "Retail",
      name: "Peter Ouma",
      title: "Finance Officer",
      department: "Finance",
      email: "peter.ouma@abc.co.ke",
      phone: "+254 733 444 555",
      isPrimary: false,
    },
    {
      org: "KKTel Communications",
      industry: "Telecom",
      name: "Samuel Kiplagat",
      title: "Chief Financial Officer",
      department: "Finance",
      email: "samuel.k@kktel.co.ke",
      phone: "+254 711 000 111",
      isPrimary: true,
      notes: "Decision maker on the network audit. Introduce via Mary.",
    },
    {
      org: "Lakeview Hospital",
      industry: "Healthcare",
      name: "Dr. Amina Hassan",
      title: "Hospital Administrator",
      department: "Operations",
      email: "a.hassan@lakeview.co.ke",
      phone: "+254 722 888 999",
      isPrimary: true,
    },
    {
      org: "Harbour Logistics",
      industry: "Logistics",
      name: "Brian Otieno",
      title: "Managing Director",
      department: "Executive",
      email: "brian@harbourlog.co.ke",
      phone: "+254 700 555 666",
      isPrimary: true,
      notes: "Slow to reply. Follow up on WhatsApp, not email.",
    },
    {
      org: "Bright Future Schools",
      industry: "Education",
      name: "Grace Njeri",
      title: "Bursar",
      department: "Finance",
      email: "grace.njeri@brightfuture.ac.ke",
      phone: "+254 799 333 222",
      isPrimary: true,
    },
    {
      // Reading the sent IFRS proposal — the person who hasn't replied yet.
      org: "Kenya Tea Packers",
      industry: "Agriculture",
      name: "Daniel Mwangi",
      title: "Group Financial Controller",
      department: "Finance",
      email: "d.mwangi@kenyateapackers.co.ke",
      phone: "+254 721 444 555",
      isPrimary: true,
      notes: "Reviewing the IFRS 16 proposal internally. Chasing after the 6th.",
    },
  ];

  // Upserted by (client, person) so re-seeding refreshes the demo people
  // instead of duplicating them.
  for (const c of demoContacts) {
    const organization = await mid(c.org, c.industry);

    const details = {
      name: c.name,
      title: c.title,
      department: c.department,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
      notes: c.notes,
    };

    const existing = await prisma.contact.findFirst({
      where: { organizationId: organization.id, name: c.name },
    });

    if (existing) {
      await prisma.contact.update({ where: { id: existing.id }, data: details });
    } else {
      await prisma.contact.create({
        data: { ...details, organizationId: organization.id },
      });
    }
  }

  // Review: backfill a client number and country on every organization so the
  // client list and the country reports have data. Client numbers are
  // sequential (CL-0001…); country defaults to Kenya (the firm's main office),
  // with a few illustrative regional clients so multi-country reporting shows.
  const COUNTRY_BY_NAME: Record<string, string> = {
    CoastalTelecom: "Tanzania",
    "MombasaPort Logistics": "Uganda",
    NyeriSaccos: "Rwanda",
  };
  const allOrgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, clientNumber: true, country: true },
  });
  let maxNumber = 0;
  for (const org of allOrgs) {
    if (org.clientNumber) {
      const n = Number(org.clientNumber.replace(/\D/g, ""));
      if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
    }
  }
  for (const org of allOrgs) {
    const data: { clientNumber?: string; country?: string } = {};
    if (!org.clientNumber) {
      maxNumber += 1;
      data.clientNumber = `CL-${String(maxNumber).padStart(4, "0")}`;
    }
    if (COUNTRY_BY_NAME[org.name]) data.country = COUNTRY_BY_NAME[org.name];
    else if (!org.country) data.country = "Kenya";
    if (Object.keys(data).length) {
      await prisma.organization.update({ where: { id: org.id }, data });
    }
  }

  console.log("Users (password: " + DEMO_PASSWORD + "):");
  console.log({
    partner: john.email,
    manager: mary.email,
    "head of marketing & bd": grace.email,
    "proposal coordinator": david.email,
    "technical reviewer": lisa.email,
    "country lead (Uganda)": peter.email,
    "IT administrator": itAdmin.email,
  });
  console.log("Seeded", demo.length, "core opportunities plus prequalification and panel-tender examples.");
  console.log("Seeded", demoContacts.length, "client contacts.");
  console.log("Seeded 6 proposals/revisions using the Ronalds Proposal Quality Review Checklist, plus approval policy, credential reference and multi-country allocation.");

  // Prove the period buckets resolve to different, real numbers — running the
  // exact same reportPeriodRange the API uses (all roles see all data here).
  const diff: Record<ReportPeriod, number> = {} as never;
  for (const period of REPORT_PERIODS) {
    const range = reportPeriodRange(period);
    const where = range
      ? { stageEnteredAt: { gte: range.from, lte: range.to } }
      : {};
    const count = await prisma.opportunity.count({ where });
    diff[period] = count;
    console.log(
      `${period.padEnd(7)} count=${count}` +
        (range ? `  [${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}]` : "")
    );
  }
  console.log("Per-period counts:", diff);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
