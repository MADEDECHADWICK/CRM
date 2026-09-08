import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const john = await prisma.user.create({
    data: { name: "John Partner", email: "john@firm.co.ke", role: "PARTNER" },
  });
  const mary = await prisma.user.create({
    data: { name: "Mary Manager", email: "mary@firm.co.ke", role: "MANAGER" },
  });
  const grace = await prisma.user.create({
    data: { name: "Grace BD", email: "grace@firm.co.ke", role: "MARKETING_BD" },
  });

  const audit = await prisma.department.create({ data: { name: "Audit" } });

  const org = await prisma.organization.create({
    data: {
      name: "ABC Manufacturing Ltd",
      industry: "Manufacturing",
      phone: "+254 700 111 222",
      email: "info@abcmfg.co.ke",
    },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      title: "FY2027 Statutory Audit",
      organizationId: org.id,
      departmentId: audit.id,
      createdById: grace.id, // required — who originated this opportunity
      ownerId: john.id,       // who currently owns/manages it
      stage: "PROPOSAL",
      amount: 450000,
    },
  });

  console.log("Seeded:", { john, mary, grace, org, opportunity });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());