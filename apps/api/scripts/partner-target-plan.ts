import { z } from "zod";

const targetRecord = z.object({
  row: z.number().int().positive(), name: z.string().min(1), country: z.string().min(1),
  sourcePartner: z.string(), sourceKey: z.string().startsWith("company-2026:prospect:"),
});
export const targetInputSchema = z.object({
  version: z.literal(1), workbook: z.string(), workbookSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sheet: z.literal("Firm Pool"), sourceRows: z.number().int().positive(),
  allocations: z.array(z.object({ sourcePartner: z.string().min(1), country: z.string().min(1),
    partner: z.string().min(1), department: z.string().min(1), mode: z.enum(["primary", "country"]) })).min(1),
  records: z.array(targetRecord).min(1), excluded: z.array(targetRecord),
});
type User = { id: string; name: string; role: string; departmentId: string | null };
type Department = { id: string; name: string; headId: string | null };
type Account = { id: string; name: string; country: string | null; sourceKey: string | null;
  sourceData: unknown; isExistingClient: boolean; assignedToId: string | null; assignedDepartmentId: string | null;
  _count: { opportunities: number } };
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const identity = (partner: string, country: string) => JSON.stringify([partner, country]);

/** Fail closed on ambiguous identities, stale mappings, clients, or conflicting assignments. */
export function buildTargetPlan(input: z.infer<typeof targetInputSchema>, users: User[], departments: Department[], accounts: Account[]) {
  const allRecords = [...input.records, ...input.excluded];
  if (allRecords.length !== input.sourceRows || new Set(allRecords.map(r => r.sourceKey)).size !== allRecords.length) throw new Error("Source control total or unique identities do not match");
  const mappings = new Map<string, { user: User; department: Department }>();
  for (const allocation of input.allocations) {
    const candidates = users.filter(u => normalize(u.name) === normalize(allocation.partner));
    const departmentCandidates = departments.filter(d => normalize(d.name) === normalize(allocation.department));
    if (candidates.length !== 1 || candidates[0].role !== "PARTNER" || departmentCandidates.length !== 1) throw new Error(`Unresolved Partner/department: ${allocation.partner} / ${allocation.department}`);
    const user = candidates[0], department = departmentCandidates[0];
    if (department.headId !== user.id) throw new Error(`${user.name} no longer heads ${department.name}`);
    if (allocation.mode === "primary" && user.departmentId !== department.id) throw new Error(`${user.name}'s primary department changed; reconcile allocation first`);
    const key = identity(allocation.sourcePartner, allocation.country);
    if (mappings.has(key)) throw new Error("Ambiguous source Partner mapping");
    mappings.set(key, { user, department });
  }
  if (input.excluded.some(r => mappings.has(identity(r.sourcePartner, r.country)))) throw new Error("Eligible source row incorrectly excluded");
  const bySource = new Map(accounts.filter(o => o.sourceKey).map(o => [o.sourceKey!, o]));
  const records = input.records.map(record => {
    const mapping = mappings.get(identity(record.sourcePartner, record.country));
    if (!mapping) throw new Error(`Row ${record.row} has no approved Partner mapping`);
    const existing = bySource.get(record.sourceKey);
    if (!existing || normalize(existing.name) !== normalize(record.name) || normalize(existing.country ?? "") !== normalize(record.country)) throw new Error(`Row ${record.row}: existing prospect identity not found; no records will be inserted`);
    if (existing.isExistingClient || existing._count.opportunities !== 0) throw new Error(`Row ${record.row}: account has client/deal activity; reconcile manually`);
    const source = existing.sourceData as { kind?: string; partnerLead?: string } | null;
    if (source?.kind !== "PROSPECT" || source.partnerLead !== record.sourcePartner) throw new Error(`Row ${record.row}: source Partner differs from workbook`);
    const correct = existing.assignedToId === mapping.user.id && existing.assignedDepartmentId === mapping.department.id;
    if (!correct && (existing.assignedToId || existing.assignedDepartmentId)) throw new Error(`Row ${record.row}: existing assignment conflicts; reconcile manually`);
    return { ...record, id: existing.id, assignedToId: mapping.user.id, assignedDepartmentId: mapping.department.id,
      partner: mapping.user.name, department: mapping.department.name, change: !correct };
  });
  const totals = input.allocations.map(allocation => {
    const rows = records.filter(r => r.sourcePartner === allocation.sourcePartner && r.country === allocation.country);
    return { partner: allocation.partner, department: allocation.department, country: allocation.country,
      total: rows.length, changes: rows.filter(r => r.change).length };
  });
  return { records, totals, changes: records.filter(r => r.change).length,
    alreadyCorrect: records.filter(r => !r.change).length, excluded: input.excluded.length };
}
