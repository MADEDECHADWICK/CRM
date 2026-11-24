# Enterprise CRM foundations — implementation notes

This document records what was added on top of the existing CRM, what was
deliberately not invented, and what Ronalds must confirm. It is not a PRD
replacement.

## Scope decisions

- No document uploads, file storage or document repository were added.
  Award evidence, proof of submission, credentials and engagement letters are
  structured metadata/external references only.
- No final Ronalds proposal checklist was invented. Checklists are configured
  as versioned templates through the API/admin UI.
- No Finance role or Finance actuals module was added. A won opportunity
  creates a structured Finance/service handover task; it does not create an
  invoice, cash receipt or Finance figure.
- The final proposal checklist, current Excel tracker and half-year report were
  not present in this repository. The model is ready for them, but their
  contents must be mapped when supplied.

## Migration

Migration: `apps/api/prisma/migrations/20261121120000_enterprise_crm_foundations`.

It is additive:

- No tables or columns are dropped.
- Existing IDs, stages, amounts, ownership and stage history are preserved.
- Existing `amount` is **not** copied into estimate, quote or award fields.
  Records with an amount are flagged `reviewRequired` so the meaning can be
  confirmed rather than guessed.
- Legacy `NO_REPLY` maps to outcome `NO_RESPONSE`; `DEFERRED` maps to
  `ON_HOLD`; `WON`/`LOST` map to the equivalent outcome with their existing
  dates.
- Legacy `PREQUALIFICATION` submission types are flagged for deliberate
  mapping into the new `Prequalification` model. If a legacy record was WON,
  its outcome is changed to `NO_AWARD` so panel acceptance is not counted as
  engagement revenue.
- Legacy `NOT_SUBMITTED` rows are preserved and flagged. The old sweep's
  automatic assertion is not treated as a confirmed new outcome.
- Configurable default settings are inserted with `ON CONFLICT DO NOTHING`.

The migration could not be applied during this work because the configured
Neon database was unreachable (`P1001`). Prisma validation and client
generation succeeded, the SQL diff was generated from the previous schema, and
the repository test checks that the migration contains no destructive
`DROP TABLE`/`DROP COLUMN` statements and includes the conservative backfill.

Dry-run reconciliation report (read-only):

```bash
pnpm --filter api reconcile:enterprise
```

It lists ambiguous amounts, legacy prequalification submission types, legacy
NOT_SUBMITTED records, wins without confirmed award values, accepted
prequalifications without a linked opportunity, open work without a complete
next action, unknown currencies, invalidated approvals and archived records.
It does not change any data. Running it requires database access.

## Core rules added

- Opportunity outcome is separate from proposal status and from the legacy
  `Stage` pipeline.
- Proposal revisions have their own state machine:
  `PENDING_INPUTS → IN_PREPARATION → IN_REVIEW → APPROVED → SUBMITTED`,
  with `CHANGES_REQUESTED` and `NOT_SUBMITTED` recoverable.
- Dispatch is blocked until required checklist items, required reviews and the
  configured number of valid approvals are complete.
- Material changes invalidate approvals. Default material fields are in
  `packages/core/src/proposal-workflow.ts`:
  service, scope, description, currency, estimated value, approved quote,
  submitted fee, tax basis, billing frequency, term, delivery allocations,
  credential references and required checklist items.
- Multi-country allocations reconcile to 100% or to the opportunity value only
  when finalized.
- Unknown currencies and missing exchange rates return "not available"; they
  are never treated as KES or as zero.
- Qualification no-go/disqualified is distinct from a competitive loss.
- Loss reasons are structured; `NOT_SUPPLIED` creates a feedback action instead
  of inferring a reason from silence.
- Overdue internal deadlines raise a flag/escalation and an audit event; they
  no longer move a deal to `NOT_SUBMITTED`.
- Prequalification acceptance never creates a win or revenue.

## API areas added

- `PATCH /opportunities/:id/qualification`
- `patch/post /opportunities/:id/values`, `outcome`, `allocations`,
  `contributors`, `archive`, `restore`
- `GET/POST /opportunities/:id/proposals` and proposal revision/checklist/
  approval/submission/credential endpoints
- `GET/POST /checklist-templates`, version and publish endpoints
- `GET/POST /approval-policies`
- `GET/POST /credentials`
- `GET/POST/PATCH /prequalifications`, renewal and opportunity-link endpoints
- `GET /governance/settings`, `PUT /governance/settings/:key`,
  `GET /governance/audit`, notification queue endpoints
- `GET /organizations/duplicates`, duplicate scan/resolve, group metadata,
  archive/restore
- `GET /exports/opportunities` and `/exports/prequalifications` (CSV/Word)
- `GET /reporting/cohort-conversion`, `activity-ratio`, `pipeline`,
  `competitive-outcomes`, `target-achievement`, snapshots, saved views and
  schedule scaffolding

## Authorization

Roles are additive: Marketing & BD, Partner, Manager, Proposal coordinator,
Technical reviewer, Country lead, IT administrator.

- Existing account/department assignment scope is preserved.
- Portfolio scopes (country, entity, office, department, organization) are
  explicit rows in `UserAccessScope`.
- An `OpportunityContributor` row grants exactly one opportunity, not the
  client's whole database.
- IT administrators can configure the system but cannot approve commercial
  proposals.
- Disabled users are blocked at login/request time and retain all history.
- Audit events record create, update, approve, reject, reassign, archive,
  restore, disable, merge, export, submit, invalidate, qualify, outcome and
  handover actions.

## Reporting definitions implemented

- Cohort conversion uses distinct opportunities first submitted in the period,
  measured as of a stated date; pending/unmatched records are shown separately.
- Period activity ratio is wins booked in the period divided by proposals
  submitted in the period, and is labelled as not cohort conversion.
- Competitive win rate uses Won / (Won + Lost) and discloses exclusions.
- Open pipeline excludes closed outcomes; on-hold is separate; weighted value is
  unavailable until stage probabilities are configured.
- Report snapshots preserve a generated payload and calculation basis.
- Every new metric includes a calculation basis and refresh timestamp.

## Configuration keys

See `packages/core/src/configuration.ts`. Highlights:

- `service.acknowledgementTargetMinutes` (proposed 60 minutes; **confirm**)
- `service.workingCalendar` (`confirmed: false` until Ronalds supplies it)
- `approval.prohibitSelfApproval` (default true)
- `approval.requiredCount` / approval policies (limits not invented)
- `qualification.conflictCheckRequired` (default false; **confirm**)
- `pipeline.weightedProbabilityByStage` (empty until configured)
- `account.groupAccountNewClientBasis` (null until confirmed)
- `reporting.defaultCurrency` (KES)

## Remaining work / Ronalds decisions

1. **Proposal checklist**: supply the final checklist and approval matrix;
   create template versions through the API/admin UI. No final checklist is
   encoded.
2. **Approval limits and approvers**: confirm role/amount bands and whether
   self-approval is prohibited for each band.
3. **Group-account basis for "new client"**: confirm whether the group parent
   or the legal entity determines new-client classification.
4. **Working calendar, acknowledgement target, escalation recipients**: confirm
   the proposed defaults and holiday calendar.
5. **Conflict and independence policy**: confirm whether a check is mandatory
   and what statuses/evidence are required.
6. **FX rates**: placeholders remain provisional and dated/sourced as
   unapproved. Supply approved rates before issuing KES management reports.
7. **Excel tracker / half-year report**: supply them for field mapping; no
   contents were invented.
8. **Exports**: CSV and Word are implemented. True XLSX, PDF and PowerPoint
   management packs are not implemented in this architecture.
9. **Scheduled delivery**: schedules are stored inactive unless a delivery
   mechanism and recipient authorization are configured. No test reports were
   sent to real recipients.
10. **Migration execution**: apply the migration in a disposable database
    first, run the DB integration tests with `RUN_DB_INTEGRATION=true`, then
    deploy. The configured database was unreachable during this work.
