import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error(
      "Usage: pnpm exec tsx src/scripts/set-password.ts <email> <password>"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: {
      email: email.toLowerCase().trim(),
    },
    data: {
      passwordHash,
    },
  });

  console.log(`Password updated for ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });