import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ensureProspectOpportunity } from "../src/modules/organizations/prospectPipeline";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const apply = process.argv.includes("--apply");

async function actorFor(organization: {
  assignedToId: string | null;
  assignedDepartmentId: string | null;
}) {
  if (organization.assignedToId) {
    const user = await prisma.user.findUnique({
      where: { id: organization.assignedToId },
      select: { id: true, role: true, isActive: true },
    });
    if (user?.isActive) return { id: user.id, role: user.role };
  }
  if (organization.assignedDepartmentId) {
    const department = await prisma.department.findUnique({
      where: { id: organization.assignedDepartmentId },
      select: { head: { select: { id: true, role: true, isActive: true } } },
    });
    if (department?.head?.isActive) return { id: department.head.id, role: department.head.role };
  }
  const fallback = await prisma.user.findFirst({
    where: { OR: [{ role: "MARKETING_BD" }, { isAdmin: true }], isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true },
  });
  return fallback ?? null;
}

async function main() {
  const organizations = await prisma.organization.findMany({
    where: {
      isExistingClient: false,
      isArchived: false,
      opportunities: { none: {} },
    },
    select: {
      id: true, name: true, assignedToId: true, assignedDepartmentId: true,
    },
    orderBy: { name: "asc" },
  });

  console.log(`Prospects with no pipeline opportunity: ${organizations.length}`);
  for (const org of organizations) {
    console.log(` - ${org.name}`);
  }
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to create the missing Prospect-stage opportunities.");
    return;
  }

  // Prospects imported without an owner or department still need a pipeline
  // record. Park them in an explicit intake department rather than inventing a
  // client team.
  const intakeDepartment = await prisma.department.upsert({
    where: { name: "Prospect Intake" },
    update: {},
    create: {
      name: "Prospect Intake",
      description: "Holds prospect-stage opportunities until an owner and department are assigned.",
    },
  });

  let created = 0;
  let skipped = 0;
  for (const org of organizations) {
    const actor = await actorFor(org);
    if (!actor) {
      skipped += 1;
      console.warn(`Skipped ${org.name}: no active owner, department head or administrator available.`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const row = await ensureProspectOpportunity(
        tx,
        actor,
        org.id,
        org.assignedToId,
        org.assignedDepartmentId ?? intakeDepartment.id
      );
      if (row && typeof row === "object" && "id" in row) created += 1;
    });
  }
  console.log(`Created ${created} Prospect-stage opportunity/opportunities. Skipped ${skipped}.`);
}

main()
  .catch((error) => {
    console.error("Prospect opportunity backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
