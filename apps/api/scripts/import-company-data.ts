import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../generated/prisma/client";

const { values } = parseArgs({ options: {
  file: { type: "string" }, apply: { type: "boolean", default: false },
  "replace-business-data": { type: "boolean", default: false },
  "keep-login": { type: "string", default: "grace@firm.co.ke" },
  "backup-dir": { type: "string", default: ".local-data" },
} });

const contactSchema = z.object({ name: z.string().min(1), email: z.email().nullable(), phone: z.string().nullable() });
const accountSchema = z.object({
  sourceKey: z.string().startsWith("company-2026:"), name: z.string().min(1),
  country: z.string().nullable(), industry: z.string().nullable().optional(),
  address: z.string().nullable().optional(), email: z.email().nullable().optional(),
  phone: z.string().nullable().optional(), isExistingClient: z.boolean(),
  sourceData: z.object({ kind: z.enum(["CUSTOMER", "PROSPECT"]),
    sources: z.array(z.object({ file: z.string(), sheet: z.string(), row: z.number().int().positive(), values: z.record(z.string(), z.string()) })).min(1),
  }).catchall(z.unknown()), contacts: z.array(contactSchema),
});
const inputSchema = z.object({ version: z.literal(1), accounts: z.array(accountSchema).min(1), summary: z.record(z.string(), z.unknown()) });

const DEMO_EMAILS = ["john@firm.co.ke", "mary@firm.co.ke", "grace@firm.co.ke"];

async function main() {
  if (!values.file) throw new Error("Pass --file with the prepared JSON path. Without --apply this command only previews changes.");
  const input = inputSchema.parse(JSON.parse(await readFile(resolve(values.file), "utf8")));
  if (new Set(input.accounts.map(a => a.sourceKey)).size !== input.accounts.length) throw new Error("Duplicate import identities; prepare the source again.");
  if (input.accounts.some(a => a.isExistingClient !== (a.sourceData.kind === "CUSTOMER"))) throw new Error("Inconsistent customer classification.");
  const actualCounts = {
    prospectAccounts: input.accounts.filter(a => !a.isExistingClient).length,
    customerBranches: input.accounts.filter(a => a.isExistingClient).length,
    namedContacts: input.accounts.reduce((sum, a) => sum + a.contacts.length, 0),
  };
  for (const [field, count] of Object.entries(actualCounts)) {
    if (input.summary[field] !== count) throw new Error(`Source control total ${field} does not match its records.`);
  }
  const existing = await prisma.organization.findMany({ select: { sourceKey: true } });
  const seen = new Set(existing.map(o => o.sourceKey));
  const newAccounts = values["replace-business-data"] ? input.accounts : input.accounts.filter(a => !seen.has(a.sourceKey));
  console.log(JSON.stringify({ mode: values.apply ? "apply" : "preview", source: input.summary,
    newAccounts: newAccounts.length, alreadyImported: input.accounts.length - newAccounts.length,
    replaceAllBusinessData: values["replace-business-data"], retainedLogin: values["keep-login"] }, null, 2));
  if (!values.apply) return;

  const keep = await prisma.user.findUnique({ where: { email: values["keep-login"] } });
  if (!keep?.passwordHash || keep.role !== "MARKETING_BD") throw new Error("A working administrator login must be retained before replacing demo data.");
  const backupDir = resolve(values["backup-dir"]!);
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(backupDir, `before-company-import-${stamp}.json`);

  await prisma.$transaction(async (tx) => {
    // Serialize this importer with itself. Existing edits still cause the
    // serializable transaction to abort rather than overwrite a concurrent edit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261109)`;
    const [users, departments, organizations, contacts, opportunities, stageHistory, ownerChanges, notes, followups] = await Promise.all([
      tx.user.findMany(), tx.department.findMany(), tx.organization.findMany(), tx.contact.findMany(),
      tx.opportunity.findMany(), tx.stageHistoryEntry.findMany(), tx.ownerChange.findMany(), tx.note.findMany(), tx.followup.findMany(),
    ]);
    // This full snapshot includes password hashes. Keep it private and ignored.
    await writeFile(backupPath, JSON.stringify({ version: 1, createdAt: new Date().toISOString(),
      users, departments, organizations, contacts, opportunities, stageHistory, ownerChanges, notes, followups }, null, 2), { flag: "wx" });

    if (values["replace-business-data"]) {
      // Explicit cutover mode: the user requested that ONLY the two supplied
      // workbooks remain. Remove standalone activities too, not just seeded
      // rows with a recognizable title. The private backup is written first.
      await tx.followup.deleteMany();
      await tx.note.deleteMany();
      await tx.ownerChange.deleteMany();
      await tx.stageHistoryEntry.deleteMany();
      await tx.opportunity.deleteMany();
      await tx.contact.deleteMany();
      await tx.organization.deleteMany();
      await tx.user.updateMany({ data: { departmentId: null } });
      await tx.department.deleteMany();
      await tx.user.deleteMany({ where: { email: { in: DEMO_EMAILS.filter(email => email !== keep.email) } } });
      console.log(`Removed ${organizations.length} previous organizations, ${opportunities.length} opportunities and all previous contacts, activities and departments.`);
    }

    const retained = values["replace-business-data"] ? [] : organizations;
    const existingKeys = new Set(retained.map(o => o.sourceKey));
    let nextNumber = Math.max(0, ...retained.map(o => /^CL-\d+$/.test(o.clientNumber ?? "") ? Number(o.clientNumber!.slice(3)) : 0));
    const rows: Prisma.OrganizationCreateManyInput[] = [];
    const people: Prisma.ContactCreateManyInput[] = [];
    for (const account of input.accounts) {
      // Re-running preserves corrections made inside the CRM, including contacts.
      if (existingKeys.has(account.sourceKey)) continue;
      const { contacts: sourceContacts, ...fields } = account;
      const id = randomUUID();
      rows.push({ ...fields, id, clientNumber: `CL-${String(++nextNumber).padStart(4, "0")}`,
        sourceData: account.sourceData as Prisma.InputJsonValue });
      people.push(...sourceContacts.map(c => ({ ...c, id: randomUUID(), organizationId: id,
        isPrimary: false, notes: "Imported named contact from the 2026 customer database." })));
    }
    for (let i = 0; i < rows.length; i += 200) await tx.organization.createMany({ data: rows.slice(i, i + 200) });
    for (let i = 0; i < people.length; i += 200) await tx.contact.createMany({ data: people.slice(i, i + 200) });
    const imported = await tx.organization.count({ where: { sourceKey: { in: input.accounts.map(a => a.sourceKey) } } });
    if (imported !== input.accounts.length) throw new Error("Imported account control total failed. Rolling back.");
    if (values["replace-business-data"] && await tx.organization.count() !== input.accounts.length) throw new Error("Unexpected organizations remain. Rolling back.");
    console.log(`Imported ${rows.length} accounts and ${people.length} contacts. Verified ${imported} source accounts.`);
  }, { timeout: 180_000, maxWait: 30_000, isolationLevel: "Serializable" });
  console.log(`Backup saved privately to ${backupPath}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Import failed"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
