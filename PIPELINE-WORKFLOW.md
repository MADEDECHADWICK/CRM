# Working a prospect through the CRM

The prospect directory holds target organizations and their assignments.
The pipeline holds specific service opportunities being pursued. Importing
an organization or assigning it to a Partner does not create a deal, a win,
or revenue. One organization can have several genuine service opportunities.

## Starting work

1. Open **Prospects**, expand an assigned organization, and select
   **Start opportunity**. Its organization and assigned department carry into
   the form. Alternatively, select **Add opportunity** in Pipeline and search
   the full accessible directory.
2. Enter the title and service, select Prospect or Lead, and record the real
   lead source. Enter an estimated deal value only if known; workbook planning
   fees are never automatically copied into opportunities.
3. Confirm the department and owner. Its head is the default. A different
   owner requires a reason and must already have access to the account through
   its assignment or department. Reassign the prospect first when handing it
   to a different team.
4. Select **Create opportunity**. The deal opens with its ownership and initial
   stage recorded. Administrators, Partners and Managers may raise opportunities
   for accounts within their authorized access.

## Progress and follow-ups

- **Prospect → Lead:** record why the pursuit is now qualified.
- **Lead → Proposal:** complete the organization details and decision-maker
  contact information. A missing-fields checklist provides buttons to edit the
  organization or add a contact directly from the opportunity.
- **Proposal → Awaiting feedback:** record submission type if known and an
  optional date to chase the response. The CRM records the first submission
  date and creates the promised reminder; a later revision preserves that date.
- **Schedule follow-up:** add a call, email or meeting with a due date directly
  on the opportunity. The owner receives it in Follow-ups; completion is
  controlled by the reminder's creator/assignee and current account access.
- **Deferred:** requires a future revisit date and creates a reminder.
- **Won:** requires the actual value, business type and signing Partner. The
  organization appears in Clients, and its real won value enters reporting.
- **Lost / No reply:** close the opportunity with a reason. They remain
  available in the pipeline's outcome filters.

Every manual stage change requires a reason. The API enforces the permitted
transitions; the automatic Not submitted stage is not a manual option.

## Deadlines and measurement

Set an internal drafting deadline while work is being prepared. Its RAG badge
shows whether drafting is on track, due soon, due now or overdue. The scheduled
API sweep flags overdue, unsubmitted work as Not submitted and creates an
explanation reminder. It runs at API startup and hourly while the API is running.

A revised deadline does not erase an explanation owed or bypass the proposal
completeness check. Recovering an expired draft clears its old deadline so the
same missed date does not immediately flag it again; issue a new deadline as
needed. Record the explanation separately to complete its reminder.

Pipeline tabs and the Overview chart use scoped server totals across all
pages. Search covers opportunity titles, services and organization names.
Department performance groups real opportunities by department, including
separate and combined results for a Partner heading multiple departments.

## Verification and release

Run typechecks, unit tests and the web export. The database integration test in
`apps/api/src/__tests__/pipeline.integration.test.ts` verifies the lifecycle,
client conversion, reminders, deadline recovery, assignment access, department
performance, RAG boundaries and pagination beyond 500 deals. It rolls back all
verification records. CI runs the database checks against disposable Postgres.

Deploy the API and web changes together on Render. No schema migration or
reimport of company data is needed for these pipeline changes.
