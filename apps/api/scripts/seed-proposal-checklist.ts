import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ensureProposalChecklist, PROPOSAL_CHECKLIST_NAME } from "../prisma/proposal-checklist";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const author = await prisma.user.findFirst({
    where: { OR: [{ role: "MARKETING_BD" }, { isAdmin: true }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!author) {
    throw new Error("Create a Marketing & BD or administrator user before importing the checklist.");
  }

  const version = await ensureProposalChecklist(prisma, author.id);
  console.log(
    `${PROPOSAL_CHECKLIST_NAME}: template version ${version.version} with ${version.items.length} items is ready (created by ${author.name}).`
  );
}

main()
  .catch((error) => {
    console.error("Proposal checklist import failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
