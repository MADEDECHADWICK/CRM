# Company directory cutover

The 2026 workbooks are imported as a directory, without creating opportunities,
won jobs, revenue, staff accounts, or service departments. `Firm Pool` is the
prospect source. Partner tabs supply pursuit order; other summary views are not
imported again. Each customer name/location pair is a separate branch. Country
is left empty when the source does not supply it. Planning fees are estimates.

Source files, prepared JSON, issue lists, and database backups contain private
information. Keep them in `.local-data/`, which is ignored by Git. Never add
them to the web bundle or a public static directory. The original Excel files
are read only; no macros, formulas, or embedded instructions are executed.

From the repository root, prepare and preview:

```powershell
python apps/api/scripts/prepare_company_data.py --prospects "C:\path\prospects.xlsx" --customers "C:\path\customers.xlsx" --output .local-data/company-2026.json
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api import:company --file ../../.local-data/company-2026.json
```

Normal imports only add unseen source identities. Existing CRM corrections are
preserved; repeated imports do not duplicate accounts or contacts:

```powershell
pnpm --filter api import:company --file ../../.local-data/company-2026.json --apply
```

For the explicitly requested initial clean cutover only, add
`--replace-business-data`. This deletes **all** previous organizations,
contacts, opportunities, notes, follow-ups, stage/ownership history, and
departments, then imports the workbooks in one database transaction. It also
removes the seeded Partner/Manager accounts, retaining the selected working BD
administrator (`--keep-login`, default `grace@firm.co.ke`) without changing its
password. Do not use this option for routine updates: it discards subsequent
CRM business activity and recreates account IDs.

A full database snapshot is written to `apps/api/.local-data/` before any
deletion. It includes password hashes and must remain private. Any failure
rolls back the transaction. Snapshots are JSON records for recovery; they are
not automatically restored or a substitute for managed database backups.

The prepared JSON includes `issues` with exact worksheet/row references for
uncertain email and phone values. Invalid emails remain in the original row
metadata rather than being made into valid addresses. Phone leading zeros
and multiple numbers are preserved; missing digits are not guessed.

The API and web services both need redeployment on Render for the new client
classification, directory search/pagination, and login design. The existing
Blueprint generates Prisma at build time and applies migrations at API boot.
The data import is a one-time private operation, never a startup/build step.
The demo seed is disabled unless `ALLOW_DEMO_SEED=true` is deliberately set in
an isolated development environment.

Validation:

```powershell
python -m unittest discover -s apps/api/scripts -p 'test_*.py'
pnpm typecheck
pnpm --filter api test
pnpm --filter web build
```

## Assigning existing Partner targets

This is a separate, assignment-only operation. Do not rerun the destructive
cutover to allocate prospects. Keep an explicitly reviewed allocation JSON in
`.local-data/`, with entries containing `sourcePartner`, `country`, `partner`,
`department`, and `mode` (`primary` or `country`). Names must resolve uniquely
to existing Partners, and each target department must still have that Partner
as its head. `primary` also checks current primary membership. The approved
2026 allocation uses primary departments for Kenya, country departments for
Uganda/Tanzania, and maps the workbook's Rwanda Partner to Ronald and Ronalds
Rwanda. Unmapped workbook rows are listed as excluded and never assigned.

```powershell
python apps/api/scripts/prepare_partner_targets.py --workbook "C:\path\prospects.xlsx" --allocations apps/api/.local-data/partner-target-allocations.json --output apps/api/.local-data/partner-targets-2026.json
pnpm --filter api exec tsx scripts/assign-partner-targets.ts --file .local-data/partner-targets-2026.json
pnpm --filter api exec tsx scripts/assign-partner-targets.ts --file .local-data/partner-targets-2026.json --apply
```

Preview first against the intended database. The apply command verifies the
workbook hash and source identities, rejects conflicting assignments or
accounts with deals/client classification, locks the affected prospect rows,
and updates assignments in one serializable transaction. Correct assignments
are preserved on reruns. It never inserts accounts, changes customer records,
creates opportunities, or turns planning fees into revenue. A private account
snapshot is saved before writes; an audit and `.committed.json` receipt record
the completed transaction. A fresh preview should report zero changes after
success. Verify the deployed API's directory totals and department assignments
afterwards; this data operation requires no application redeployment.
