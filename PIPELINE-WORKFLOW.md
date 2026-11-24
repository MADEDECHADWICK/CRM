# Working a prospect through the CRM

The prospect directory holds target organizations and their assignments.
The pipeline holds specific service opportunities being pursued. Importing
an organization or assigning it to a Partner does not create a deal, a win,
or revenue. One organization can have several genuine service opportunities.

## Starting work

1. Open **Prospects**, expand an organization and assign it to a person and/or
   department. The CRM automatically creates the initial Prospect-stage
   opportunity in Pipeline, owned by the assigned person or their department
   head. There is no separate **Start opportunity** or **Add opportunity**
   action.
2. The automatic opportunity starts with service "Service to be confirmed",
   source `OTHER` with an explicit note, and a next action. Update the service
   and qualification details as the real requirement becomes known.
3. Reassigning the prospect moves the existing Prospect-stage opportunity to
   the new owner/department and records an ownership change with a reason.
4. Administrators, Partners and Managers see the new prospect in Pipeline
   immediately; it is not counted as a win, proposal or revenue.

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
transitions; the legacy Not submitted stage is not offered as a manual action
and is no longer set automatically by the deadline sweep.

## Deadlines and measurement

Set an internal drafting deadline while work is being prepared. Its RAG badge
shows whether drafting is on track, due soon, due now or overdue. The scheduled
API sweep now raises an overdue flag, an audit event, an escalation and an
explanation reminder. It does **not** automatically assert that the proposal was
not submitted. The sweep runs at API startup and hourly while the API is running.

A revised deadline does not erase an explanation owed or bypass the proposal
completeness check. Overdue history is preserved in the audit trail. Record the
explanation separately to complete its reminder.

Proposal progress (Pending inputs, In preparation, In review, Changes
requested, Approved, Submitted, Not submitted) is now tracked on proposal
revisions, separately from the opportunity outcome (Open, On hold, Won, Lost,
Withdrawn, Client cancelled, No award, No-bid, No response). A proposal may be
Submitted while its opportunity is Won.

Proposal workflow:

1. A Partner assigns the team lead (Manager), BD owner and signing Partner.
2. The team lead prepares the technical proposal and confirms technical
   completion.
3. The BD owner completes the versioned Proposal Quality Review Checklist
   (sections A-E) and sends it to the Partner, or returns it to the team lead.
4. The signing Partner signs off (section F), returns it to the BD owner, or
   returns it to the team lead.
5. Only after Partner sign-off can dispatch be recorded. A material change after
   approval invalidates the approval and returns the revision to the team lead.

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
