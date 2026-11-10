import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTargetPlan, targetInputSchema } from "../../scripts/partner-target-plan";

const input = () => targetInputSchema.parse({ version: 1, workbook: "pool.xlsx", workbookSha256: "a".repeat(64), sheet: "Firm Pool", sourceRows: 2,
  allocations: [
    { sourcePartner: "Ronald", country: "Kenya", partner: "Ronald", department: "Consulting", mode: "primary" },
    { sourcePartner: "Rwanda Partner", country: "Rwanda", partner: "Ronald", department: "Rwanda", mode: "country" },
  ], records: [
    { row: 4, name: "Kenya Company", country: "Kenya", sourcePartner: "Ronald", sourceKey: "company-2026:prospect:ke" },
    { row: 5, name: "Rwanda Company", country: "Rwanda", sourcePartner: "Rwanda Partner", sourceKey: "company-2026:prospect:rw" },
  ], excluded: [] });
const users = [{ id: "ronald", name: "Ronald", role: "PARTNER", departmentId: "consulting" }];
const departments = [{ id: "consulting", name: "Consulting", headId: "ronald" }, { id: "rw", name: "Rwanda", headId: "ronald" }];
const accounts = () => input().records.map((r, i) => ({ ...r, id: String(i), sourceData: { kind: "PROSPECT", partnerLead: r.sourcePartner },
  isExistingClient: false, assignedToId: null as string | null, assignedDepartmentId: null as string | null, _count: { opportunities: 0 } }));

test("maps Rwanda to existing Ronald and country department; primary for Kenya", () => {
  const plan = buildTargetPlan(input(), users, departments, accounts());
  assert.equal(plan.changes, 2);
  assert.deepEqual(plan.records.map(r => [r.assignedToId, r.assignedDepartmentId]), [["ronald", "consulting"], ["ronald", "rw"]]);
});
test("repeat plan preserves correct existing assignments", () => {
  const rows = accounts();
  rows[0].assignedToId = "ronald"; rows[0].assignedDepartmentId = "consulting";
  const plan = buildTargetPlan(input(), users, departments, rows);
  assert.equal(plan.changes, 1); assert.equal(plan.alreadyCorrect, 1);
});
test("rejects conflicts, missing accounts, clients, and active deals before mutation", () => {
  const conflict = accounts(); conflict[0].assignedToId = "someone-else";
  assert.throws(() => buildTargetPlan(input(), users, departments, conflict), /conflicts/);
  assert.throws(() => buildTargetPlan(input(), users, departments, []), /identity not found/);
  const clients = accounts(); clients[0].isExistingClient = true;
  assert.throws(() => buildTargetPlan(input(), users, departments, clients), /client\/deal/);
  const deals = accounts(); deals[0]._count.opportunities = 1;
  assert.throws(() => buildTargetPlan(input(), users, departments, deals), /client\/deal/);
});
test("rejects stale primary/head or ambiguous Partner identity", () => {
  assert.throws(() => buildTargetPlan(input(), [{ ...users[0], departmentId: "other" }], departments, accounts()), /primary department changed/);
  assert.throws(() => buildTargetPlan(input(), users, [{ ...departments[0], headId: null }, departments[1]], accounts()), /no longer heads/);
  assert.throws(() => buildTargetPlan(input(), [...users, { ...users[0], id: "duplicate" }], departments, accounts()), /Unresolved/);
});
test("requires source Partner agreement and unique workbook identities", () => {
  const rows = accounts(); rows[0].sourceData.partnerLead = "Other";
  assert.throws(() => buildTargetPlan(input(), users, departments, rows), /source Partner differs/);
  const duplicate = input(); duplicate.records[1] = duplicate.records[0];
  assert.throws(() => buildTargetPlan(duplicate, users, departments, accounts()), /unique identities/);
});
test("unmapped excluded rows stay excluded and do not create accounts", () => {
  const data = input(); data.sourceRows++;
  data.excluded.push({ row: 6, name: "Unowned", country: "Kenya", sourcePartner: "", sourceKey: "company-2026:prospect:unowned" });
  const plan = buildTargetPlan(data, users, departments, accounts());
  assert.equal(plan.excluded, 1); assert.equal(plan.records.length, 2);
});
