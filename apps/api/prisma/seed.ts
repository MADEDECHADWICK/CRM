import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { reportPeriodRange, REPORT_PERIODS, type ReportPeriod } from "@crm/core";

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
    },
  ];

  for (const opp of demo) {
    const organization = await mid(opp.org, opp.industry);
    await prisma.opportunity.create({
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
      },
    });
  }

  console.log("Users (password: " + DEMO_PASSWORD + "):");
  console.log({
    partner: john.email,
    manager: mary.email,
    bd: grace.email,
  });
  console.log("Seeded", demo.length, "opportunities across periods.");

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