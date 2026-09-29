import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { reportPeriodRange, REPORT_PERIODS, type ReportPeriod, type LeadSource } from "@crm/core";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

async function upsertOrganization(name: string, industry: string) {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.organization.create({ data: { name, industry } });
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
    update: { passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10) },
    create: {
      name: "Grace BD",
      email: "grace@firm.co.ke",
      role: "MARKETING_BD",
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
    },
  });

  const audit = await prisma.department.upsert({
    where: { name: "Audit" },
    update: {},
    create: { name: "Audit" },
  });
  const tax = await prisma.department.upsert({
    where: { name: "Tax" },
    update: {},
    create: { name: "Tax" },
  });

  // Clean previous demo runs (cascade removes stage history/follow-ups).
  await prisma.opportunity.deleteMany({
    where: { OR: [{ title: { startsWith: "Demo —" } }, { title: "FY2027 Statutory Audit" }] },
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

  for (const opp of demo) {
    const organization = await mid(opp.org, opp.industry);
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
        stageEnteredAt: opp.enteredAt,
        wonAt: opp.stage === "WON" ? opp.enteredAt : undefined,
        lostAt: opp.stage === "LOST" ? opp.enteredAt : undefined,
        lostReason: opp.lostReason,
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
      },
    });

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

  console.log("Users (password: " + DEMO_PASSWORD + "):");
  console.log({
    partner: john.email,
    manager: mary.email,
    bd: grace.email,
  });
  console.log("Seeded", demo.length, "opportunities across periods.");
  console.log("Seeded", demoContacts.length, "client contacts.");

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
        (range ? `  [${range.from.toLocaleDateString()} – ${range.to.toLocaleDateString()}]` : "")
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