import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { buildTargetPlan, targetInputSchema } from "./partner-target-plan";

const { values } = parseArgs({ options: {
  file: { type: "string" }, apply: { type: "boolean", default: false },
  "actor-email": { type: "string", default: "grace@firm.co.ke" },
  "backup-dir": { type: "string", default: ".local-data" },
} });
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function main() {
  if (!values.file) throw new Error("Pass --file with prepared Partner target JSON; preview is the default.");
  const inputBytes = await readFile(resolve(values.file));
  const input = targetInputSchema.parse(JSON.parse(inputBytes.toString("utf8")));
  if (hash(await readFile(input.workbook)) !== input.workbookSha256) throw new Error("Workbook changed after preparation; prepare it again.");
  const directory = resolve(values["backup-dir"]!);
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const auditPath = resolve(directory, `partner-targets-${values.apply ? "applied" : "preview"}-${stamp}.json`);
  await prisma.$transaction(async tx => {
    if (values.apply) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261111)`;
      // Lock only source prospects, leaving unrelated client work available.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Organization" WHERE "sourceKey" IN (${Prisma.join(input.records.map(r => r.sourceKey))}) ORDER BY "id" FOR UPDATE`);
    }
    const [users, departments, accounts, counts] = await Promise.all([
      tx.user.findMany({ select: { id: true, name: true, email: true, role: true, departmentId: true } }),
      tx.department.findMany(),
      tx.organization.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { opportunities: true } } } }),
      Promise.all([tx.contact.count(), tx.opportunity.count(), tx.note.count(), tx.followup.count()]),
    ]);
    const actor = users.find(u => u.email === values["actor-email"]);
    if (!actor || actor.role !== "MARKETING_BD") throw new Error("Assignment actor must be an existing administrator.");
    const plan = buildTargetPlan(input, users, departments, accounts);
    const controls = { organizations: accounts.length, customers: accounts.filter(o => o.isExistingClient).length,
      contacts: counts[0], opportunities: counts[1], notes: counts[2], followups: counts[3] };
    const report = { version: 1, createdAt: new Date().toISOString(), mode: values.apply ? "apply" : "preview",
      workbook: input.workbook, workbookSha256: input.workbookSha256, inputSha256: hash(inputBytes),
      actorId: actor.id, controls, ...plan, excludedRecords: input.excluded };
    console.log(JSON.stringify({ mode: report.mode, sourceRows: input.sourceRows, eligible: plan.records.length,
      changes: plan.changes, alreadyCorrect: plan.alreadyCorrect, excluded: plan.excluded, controls, allocations: plan.totals }, null, 2));
    if (!values.apply || !plan.changes) {
      await writeFile(auditPath, JSON.stringify(report, null, 2), { flag: "wx" });
      return;
    }
    const backupPath = resolve(directory, `before-partner-targets-${stamp}.json`);
    // Full account scalar records, public staff metadata, departments, and audit;
    // no password hashes. Only assignment fields are changed by this command.
    await writeFile(backupPath, JSON.stringify({ ...report, users, departments, accounts }, null, 2), { flag: "wx" });
    const assignedAt = new Date();
    let updated = 0;
    for (const allocation of plan.totals) {
      const rows = plan.records.filter(r => r.change && r.partner === allocation.partner && r.department === allocation.department);
      if (!rows.length) continue;
      const result = await tx.organization.updateMany({
        where: { id: { in: rows.map(r => r.id) }, isExistingClient: false, assignedToId: null, assignedDepartmentId: null },
        data: { assignedToId: rows[0].assignedToId, assignedDepartmentId: rows[0].assignedDepartmentId, assignedById: actor.id, assignedAt },
      });
      if (result.count !== rows.length) throw new Error("Assignment preconditions changed; rolling back the entire batch.");
      updated += result.count;
    }
    const after = await tx.organization.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { opportunities: true } } } });
    const nextPlan = buildTargetPlan(input, users, departments, after);
    if (nextPlan.changes || updated !== plan.changes) throw new Error("Final assignment totals differ; rolling back.");
    const changed = new Set(plan.records.filter(r => r.change).map(r => r.id));
    const unchangedFields = (rows: typeof accounts) => rows.map(row => {
      if (!changed.has(row.id)) return row;
      const { assignedToId, assignedDepartmentId, assignedById, assignedAt, updatedAt, ...preserved } = row;
      return preserved;
    });
    if (hash(JSON.stringify(unchangedFields(accounts))) !== hash(JSON.stringify(unchangedFields(after)))) throw new Error("Unrelated account fields changed; rolling back.");
    const afterCounts = await Promise.all([tx.contact.count(), tx.opportunity.count(), tx.note.count(), tx.followup.count()]);
    if (JSON.stringify(counts) !== JSON.stringify(afterCounts)) throw new Error("Related business data counts changed; rolling back.");
    await writeFile(auditPath, JSON.stringify({ ...report, backupPath, assignedAt, verified: true, updated }, null, 2), { flag: "wx" });
  }, { isolationLevel: "Serializable", maxWait: 30000, timeout: 120000 });
  if (values.apply) await writeFile(auditPath + ".committed.json", JSON.stringify({ committedAt: new Date().toISOString(), auditPath, inputSha256: hash(inputBytes) }, null, 2), { flag: "wx" });
  console.log(`Transaction completed. Private audit: ${auditPath}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Partner assignment failed"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
