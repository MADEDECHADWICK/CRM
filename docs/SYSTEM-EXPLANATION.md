# Ronalds Africa CRM - Full System Explanation

This document explains what the CRM is, what it does, how it is structured, who uses it, and how each person works with it. It is written for management review and can be shared with team leads, Partners, Marketing & BD and IT support.

---

## 1. Executive summary

The Ronalds Africa CRM is a business development and pursuit management system for an Audit, Advisory and Tax firm. It supports the full commercial lifecycle:

1. Maintain client and prospect organisations, with a single contacts directory across all of them.
2. Assign prospects to accountable people.
3. Convert a prospect into a lead or opportunity when a real requirement, call, RFP, tender or referral arrives.
4. Qualify the opportunity and decide whether to pursue it.
5. Prepare, review, approve and submit proposals.
6. Follow up with clients.
7. Record the commercial outcome: won, lost, withdrawn, client cancelled, no award, no-bid or no response.
8. Convert wins into client records and create Finance/service handover tasks.
9. Report on pipeline, proposals, wins, losses, sources, turnaround, team performance and prequalifications.
10. Control access, audit actions, configure checklists and approval controls, and export structured data.

The system is a single shared application used by web and mobile. It is backed by one PostgreSQL database. The API enforces business rules and access rights; the screens are a convenience layer, not the security boundary.

The CRM does **not** store documents. Awards, credentials, engagement letters and submission proof are captured as metadata and external references only.

---

## 2. Purpose of the system

The firm needs one reliable place to answer:

- Which organisations are prospects, clients or neither?
- Who owns each relationship and each pursuit?
- What is in the pipeline, at what stage and at what value?
- Which proposals are being prepared, reviewed, approved or submitted?
- Which proposals were submitted on time, late or not at all?
- What was won, lost, cancelled, withdrawn or not bid?
- Why was a pursuit lost, if a reason is known?
- Which sources, partners, managers, team leads and departments are producing results?
- Are proposals being checked and approved before they are sent?
- Can management trust the numbers in reports?
- Can sensitive data be restricted by role, portfolio and individual record?

The CRM is designed to answer these questions from structured records, not from manually typed report figures.

---

## 3. Scope and deliberate exclusions

### In scope

- Accounts and contacts.
- Prospect assignment and pipeline entry.
- Opportunity lifecycle and outcomes.
- Qualification and go/no-go.
- Proposal revisions, role-based checklists, approvals, submission records and credential metadata.
- Follow-ups and overdue escalation.
- Prequalifications and supplier-panel applications.
- Reporting, exports and report snapshots.
- User administration, access scopes, configuration and audit.

### Not in scope

- Document uploads, file storage or a document repository.
- Invoices, cash receipts, collections or Finance actuals.
- A Finance user role or Finance module.
- Fabricated targets, baselines, exchange rates or historical outcomes.
- Automatic conversion of imported clients into wins or revenue.
- Final approval limits or Ronalds policy values invented by the system.

---

## 4. System architecture

| Component | Purpose |
|---|---|
| `apps/api` | Express API, authentication, authorization, business rules, reporting, exports and scheduled sweeps. |
| `apps/web` | Browser application. |
| `apps/mobile` | Expo mobile application. |
| `packages/app` | Shared screens and navigation used by both web and mobile. |
| `packages/core` | Shared types, state machines, currency rules, reporting maths and authorization capabilities. |
| `packages/ui` | Shared presentational components. |
| PostgreSQL | Single source of truth for records, history, audit and reports. |

The system is a modular monolith. It is not a set of independent microservices. This keeps deployment and data consistency simple while still separating concerns by module.

Key principle: **the API enforces the rule, even if the user calls the endpoint directly.** Hiding a button is only a user-experience convenience.

---

## 5. Core concepts and data model

### Organization / Account

One record per legal organization. This is the account, not the deal.

An organization can have:

- multiple contacts;
- multiple independent opportunities;
- an optional group parent (group account), without merging legal entities;
- a client country;
- a Ronalds contracting entity, including Selego where applicable;
- a Ronalds office;
- an assignment to a person and/or department;
- an archive state;
- a client number.

There is no separate "Client" table. A client is an organization that is an existing client or has at least one won opportunity.

### Contact

A named person at an organization: name, title, department, email, phone, primary flag and notes. This is separate from the organization's generic switchboard email and phone.

### Prospect

A target organization that has not yet produced a confirmed service requirement. In the current model, a true prospect is an organization:

- that is not an existing client;
- with no won opportunity;
- with no opportunity that has advanced beyond the initial `PROSPECT` stage.

When a prospect is assigned, the CRM creates or moves a Prospect-stage pipeline record. This is a placeholder for the account, not a confirmed sales opportunity.

Once an RFP, call, tender or referral creates a Lead, the account leaves Prospects and appears under Lead, Proposal and the other pipeline stages and under All.

### Opportunity

The actual pursuit of a service. It records:

- organization, department and service;
- accountable owner, signing Partner, reviewer and contributors;
- lead source, received date, named referrer, referring organization, campaign or event;
- qualification requirement, decision-maker, client deadline, known budget and eligibility;
- internal proposal deadline and RAG status;
- estimate, approved quote, submitted fee, confirmed award value and bid purchase cost;
- outcome, proposal history, delivery allocations and archive state.

One organization can have several opportunities at the same time.

### Three separate axes

The system deliberately separates three things that are often incorrectly combined:

1. **Legacy pipeline stage** - Prospect, Lead, Proposal, Awaiting Feedback, Not Submitted, Won, Lost, Withdrawn, Client Cancelled, No Award, No-bid, No Reply, Deferred.
2. **Commercial outcome** - Open, On Hold, Won, Lost, Withdrawn, Client Cancelled, No Award, No-bid, No Response.
3. **Proposal progress** - Pending Inputs, In Preparation, In Review, Changes Requested, Approved, Submitted, Not Submitted.

A proposal can be Submitted while the opportunity is Won.

### Proposal and revisions

A Proposal belongs to an opportunity. It has revisions. Each revision records:

- its own proposal status and workflow stage;
- the checklist template version that applied to it;
- checklist items, responsibility, completion, review, comments and timestamps;
- review and approval decisions;
- submission history;
- credential metadata references.

Existing revisions keep the checklist version they were created with. New revisions use the active version.

### Follow-ups and history

- **Note** - dated history: comments, meeting outcomes, decision explanations.
- **Follow-up** - actionable task: call, email, meeting, task or handover.
- **Stage history** - every stage transition with actor, reason and timestamp.
- **Owner change** - every reassignment with previous owner, new owner, actor and reason.
- **Audit event** - create, edit, approve, reject, reassign, archive, restore, merge, export, submit, invalidate, qualify, outcome and handover actions.

### Prequalification

A separate supplier-panel or prequalification application with its own status, submission, acceptance, rejection, cost, validity and expiry. Acceptance is **not** a win, proposal revenue or Finance booking.

### Reporting objects

- Report snapshots preserve issued management-report payloads and calculation bases.
- Saved views store report filters.
- Report schedules are stored but remain inactive unless a delivery mechanism and recipient authorization exist.

---

## 6. Modules

### 6.1 Authentication and access

- Email and password login.
- JWT session.
- The API resolves the current user and role from the database on every request, so a demotion or disabled account takes effect immediately.
- Disabled users are blocked but retain their history.
- Access is role plus data scope, not role alone.

### 6.2 Home / Overview

The Home screen shows:

- prospect, lead, proposal and client totals;
- pipeline stage counts, percentages and KES values;
- won value and active proposal value;
- quick actions;
- searchable client contacts.

Values use the same conversion and scope rules as reports.

### 6.3 Prospects and accounts

The Prospects screen shows untouched prospect accounts. It includes:

- search and assignment filters;
- assignment to a person and/or department;
- contacts and organization source details;
- client number, industry, country, entity/office metadata;
- duplicate review flag and archive state.

Assigning a prospect:

- creates or moves its Prospect-stage record;
- sets the owner or department head;
- records ownership history;
- creates a next action;
- does not create revenue, a win or a proposal.

The Pipeline "Prospects" tab uses the same prospect definition, so the account count and records match the Prospects screen.

### 6.4 Pipeline / Opportunities

The Pipeline is the working view of every opportunity.

It supports:

- All, Prospects, Lead, Proposal, Awaiting, Not sent, Deferred, Overdue, Won, Lost and No reply filters;
- search by deal, client or service;
- RAG status for drafting deadlines;
- opportunity detail with service line, lead source, received date, department, owner, created by, follow-ups, notes and history;
- stage transitions with mandatory reasons;
- reassignment with mandatory reasons;
- archive and restore.

Prospect reassignment can also assign an unassigned prospect account from the Pipeline detail.

The Governance Proposals workspace is deliberately narrower: it lists only opportunities that have reached the Proposal stage or beyond. Prospects and raw leads remain in Pipeline but do not clutter the proposal workspace.

### 6.5 Clients

The Clients screen shows organizations that are existing clients or have won work.

Winning an opportunity does not create a second organization. The organization itself becomes a client. It can have multiple won and open opportunities, multiple departments and multiple contacts.

A client relationship that ends is archived, not deleted. History remains.

### 6.6 Contacts directory

The Contacts screen gives one searchable directory of every person the user can access, regardless of whether the organization is currently a prospect, lead or client.

It shows:

- contact name, title, organization, email and phone;
- a clear marker showing **Prospect**, **Lead** or **Client**;
- the primary-contact indicator;
- a direct route into the contact editor.

The marker is derived from the organization's current position:

- **Client** - existing client or has won work.
- **Lead** - has an opportunity beyond the initial Prospect stage.
- **Prospect** - untouched prospect account.

Access follows the same account and portfolio scope as the organization. A user cannot use the directory to see contacts on accounts outside their scope.
### 6.7 Follow-ups and notifications

- Calls, emails, meetings and notes are dated history.
- Follow-ups have an owner, due date and status.
- Overdue views and weekly partner follow-up lists surface exceptions.
- Breach explanations, feedback requests and win handovers create follow-up tasks.
- Notifications are in-app queued. External email/SMS delivery is not configured, so the in-app queue is the current delivery mechanism.

### 6.8 Proposals

This is the controlled proposal-preparation module. The Governance Proposals tab lists only opportunities that have reached the Proposal stage or beyond, so prospects and raw leads do not clutter the proposal workspace.

#### Entry

Moving an opportunity from Lead to Proposal is gated by client completeness:

- industry;
- organization email;
- organization phone;
- address;
- at least one contact;
- contact title;
- contact email;
- contact phone.

The transition requires a reason and is recorded in stage history.

#### Proposal record

A proposal is created against the opportunity. Revisions are added under it.

#### Role-split checklist

The active checklist is the Ronalds Proposal Quality Review Checklist, version 2. It has 34 items split by responsibility:

| Section | Responsible | Items |
|---|---|---:|
| Team Lead - Technical Proposal Review | Team lead (Manager) | 10 |
| Business Development - Proposal Review and Submission | BD owner | 20 |
| Partner - Final Review and Approval | Signing Partner | 4 |

The checklist covers:

- technical scope, methodology, experience, team, regulations, work plan and exclusions;
- executive summary and positioning;
- fees and commercial terms;
- firm credentials and references;
- presentation, compliance and attachments;
- partner technical, fee and final approval.

Only the responsible person can tick their section. Other sections are visible but read-only.

#### Workflow

1. Partner assigns the Team Lead, BD owner and signing Partner.
2. Team Lead prepares the technical proposal and completes the 10 technical items.
3. Team Lead confirms technical completion. The API blocks this if any technical item is outstanding.
4. BD owner reviews the 20 BD items, verifies the technical content has not been materially altered, then either:
   - sends to the Partner; or
   - returns to the Team Lead with comments.
5. Partner reviews and either:
   - approves for submission;
   - returns to BD; or
   - returns to the Team Lead.
6. Only after Partner approval can dispatch be recorded.
7. Dispatch records submission time, channel, external reference and proof reference.
8. The first submission time is preserved permanently.
9. The opportunity moves to Awaiting Feedback when the proposal is dispatched, if still live.

#### Material changes

A material change after approval - fee, currency, scope, terms, team structure, delivery allocation or credential references - invalidates the approval and returns the revision to the Team Lead.

#### Credentials

Credentials are metadata only:

- name;
- owner;
- version/reference;
- expiry;
- status.

No file is uploaded or stored.

### 6.9 Prequalifications

Prequalifications are separate from commercial proposals. Applications are started by searching and selecting an accessible prospect in the organization picker; users do not type or copy organization IDs. They track:

- application status;
- submission;
- acceptance or rejection;
- cost;
- validity and expiry;
- renewal;
- external reference.

Panel acceptance does **not** create a win. Resulting tenders can link back to the application.

### 6.10 Reports and analytics

Reports are generated from real records and use the same access scope as the underlying data.

Available report areas:

- **Executive summary and scorecard** - leads, quotes, sent proposals, wins, booked value and activity ratio.
- **Source attribution** - leads by channel, conversion to proposal and wins, with unattributed records disclosed.
- **Proposal turnaround** - lead-to-submission mean and median, deadline performance and breach counts.
- **Pipeline** - open pipeline, on-hold separately, weighted pipeline when stage probabilities are configured.
- **Wins and losses** - confirmed award values, original quotes, variance and structured loss reasons.
- **Cohort conversion** - distinct opportunities first submitted in the period, measured as of a stated date.
- **Period activity ratio** - wins booked in a period divided by proposals submitted in the same period, clearly labelled as not cohort conversion.
- **Stage performance** - every stage with count, percentage and KES value.
- **Stage breakdown** - by Partner, Manager, Team lead or Department.
- **Team and department performance** - owner and department rollups.
- **Prequalifications** - submitted, accepted, rejected, expired and costs.
- **Client mix and concentration** - new, renewal, cross-sell and upsell using consistent counts and values.
- **Target achievement** - returns N/A until an approved target source exists.

### 6.11 Exports and structured extraction

- CSV and Word exports are implemented.
- Exports are permission-aware and audited.
- True XLSX, PDF and PowerPoint management packs remain to be implemented.
- Exports do not expose records outside the user's scope.

### 6.12 Governance, configuration and audit

Configuration is visible only to the Marketing & BD Head and IT administrators. Partners, Managers, BD team members and other users do not see the Configuration tab, and the settings API rejects them. Governance covers:

- system settings;
- checklist templates and versions;
- approval policies;
- user access scopes;
- audit events;
- duplicate detection and controlled merge;
- archive and restore;
- report snapshots and saved views;
- notification queue.

Configuration examples:

- acknowledgement target minutes (proposed 60, not final);
- working calendar (unconfirmed);
- review reminder hours;
- default follow-up interval;
- escalation recipients;
- group-account new-client basis;
- weighted pipeline probabilities;
- self-approval prohibition;
- approval required count and amount limits;
- conflict-check requirement;
- material-change fields;
- dispatch checklist requirement;
- loss feedback action;
- reporting default currency.

### 6.13 Team, users and departments

The Team module supports:

- adding users;
- assigning roles;
- departments;
- team-lead supervisor Partner;
- administrator access;
- active/disabled status;
- department heads;
- scoped performance.

A team lead reports to a Partner and executes work assigned by that Partner.

---

## 7. Users, roles and access rights

The system separates **action permission** from **data scope**.

### Roles

| Role | Main purpose |
|---|---|
| Marketing & BD Head | Firm-wide commercial oversight, assignment, user administration, configuration, reporting. |
| BD & Marketing team member | Proposal coordination, BD checklist, assigned commercial work. |
| Partner | Portfolio ownership, engagement signing, proposal final approval, win approval. |
| Team lead (Manager) | Owns deals, prepares technical proposal, completes technical checklist, reports to a Partner. |
| Technical reviewer | Reviews explicitly assigned technical checklist or proposal items. |
| Country lead | Country or portfolio oversight and allocated work. |
| IT administrator | CRM administration, users, configuration, integrations and support. |

### Data scope

- **Marketing & BD Head** - all commercial data.
- **Partner / Manager / Team lead** - accounts and opportunities assigned to them, their department or their explicit portfolio scope.
- **BD team member / Technical reviewer** - assigned accounts and explicit record shares. A contributor share grants only one opportunity, not the whole organization or country.
- **Country lead** - explicit country/entity/office portfolio.
- **IT administrator** - no commercial data by default. Business-data access must be explicitly granted by Marketing & BD oversight and is audited.

### Important restrictions

- A BD team member cannot own an opportunity.
- A BD team member cannot commercially approve a proposal.
- A team lead cannot approve a proposal as the signing Partner.
- IT administrators cannot approve deals or edit signed-off commercial values.
- Configuration is limited to the Marketing & BD Head and IT administrators; other roles cannot view or change settings.
- Personal follow-ups are visible only to the assignee/creator.
- Partners and Managers do not automatically receive firm-wide data; scope is assignment and portfolio based.

### Sign-off authority

- Proposal final sign-off is performed by the signing Partner through the Partner checklist.
- Win approval requires an authorized commercial approver.
- IT never inherits commercial approval, even with administrator rights.

---

## 8. How each user uses the system

### Marketing & BD Head

1. Create or import organizations.
2. Search for duplicates before creating accounts.
3. Assign prospects to BD team members, Partners, team leads or departments.
4. Assign a Partner and team to proposal work.
5. Add users and give them the correct role.
6. Maintain departments and department heads.
7. Configure checklists, approval controls and access scopes.
8. Review pipeline, stage performance and reports.
9. Export management data.
10. Archive records instead of deleting them.

### BD & Marketing team member

1. Work the opportunities and prospects shared with them.
2. Prepare proposal revisions.
3. Complete the 20 BD checklist items.
4. Verify the technical content has not been materially altered.
5. Send the proposal to the Partner or return it to the Team Lead with comments.
6. Record dispatch only after Partner approval.
7. Follow up with clients and record notes.
8. Use the Contacts directory to search prospects, leads and clients and update the right person's details.

### Partner

1. Review assigned portfolio.
2. Own deals or assign team leads.
3. Assign the Team Lead, BD owner and signing Partner on proposals.
4. Review and sign off the 4 Partner checklist items.
5. Approve, or return the proposal to BD or the Team Lead.
6. Approve wins with confirmed award value and commercial category.
7. Sign the engagement.

### Team lead (Manager)

1. Own assigned deals.
2. Prepare technical methodology, work plan, deliverables, staffing and assumptions.
3. Complete the 10 Team Lead checklist items.
4. Confirm technical completion.
5. Respond to BD or Partner returns with corrections.
6. Maintain client and pursuit history.

### Technical reviewer

1. Access only explicitly assigned records.
2. Review technical checklist items or proposal content.
3. Record comments and decisions.
4. Do not approve commercial terms.

### Country lead

1. Work within an explicit country/entity/office portfolio.
2. Create and progress opportunities in scope.
3. Record outcomes where authorized.
4. Do not get firm-wide access by default.

### IT administrator

1. Create and manage users.
2. Assign roles and supervisors.
3. Manage configuration and support settings.
4. Manage access scopes only through explicit, audited grants.
5. Do not approve deals or change commercial values.
6. Do not see commercial pipeline data unless explicitly granted.

---

## 9. End-to-end customer journey

1. **Organization enters the CRM** - manual creation or import.
2. **Prospect** - organization has no confirmed requirement and no advanced opportunity.
3. **Assignment** - account assigned to a person/department; Prospect-stage record appears in Pipeline.
4. **Lead** - an RFP, call, tender or referral creates a lead opportunity.
5. **Qualification** - requirement, source, decision-maker, deadline, budget, conflict/independence, go/no-go.
6. **Proposal preparation** - proposal and revision created; Partner assigns Team Lead, BD owner and signing Partner.
7. **Technical review** - Team Lead completes technical checklist and confirms completion.
8. **BD quality review** - BD completes commercial/compliance checklist and sends to Partner or returns to Team Lead.
9. **Partner sign-off** - Partner approves or returns.
10. **Submission** - BD records dispatch and external proof reference.
11. **Follow-up** - calls, emails and meetings recorded; next actions maintained.
12. **Outcome** - Won, Lost, Withdrawn, Client Cancelled, No Award, No-bid, No Response or On Hold.
13. **Win handling** - confirmed award value, category, signing Partner, award evidence reference and engagement-letter status; Finance/service handover task created.
14. **Client** - organization remains as a client with multiple opportunities.
15. **Reporting** - all figures derive from the real records.
16. **Archive** - when the relationship ends, archive with history retained.

---

## 10. Reporting definitions and safeguards

### Submitted proposals

Count distinct commercial opportunities first submitted in the selected period. Sum the approved submitted value once per opportunity. Show revisions separately. Exclude prequalification-only applications.

### Jobs won

Count distinct opportunities with an approved win date in the period. Sum confirmed award values. Preserve the original quote and show variance.

### Win rate by count

Won / (Won + Lost) for competitive decisions dated in the period. Exclude open, prequalification, no-bid, cancelled and withdrawn cases. Disclose exclusions and undecided volumes.

### Cohort conversion

For opportunities first submitted in the selected period, show won count / submitted count and linked won value / submitted proposal value as of a stated date. Show pending and unmatched records. Award changes can make value conversion exceed 100%.

### Period activity ratio

Wins booked in a period / proposals submitted in that period. This is not cohort conversion and is labelled separately.

### Open pipeline

Sum the latest valid values of open qualified opportunities. Show on-hold work separately and exclude closed outcomes. Weighted pipeline uses configured stage probabilities; if none are configured, weighted value is N/A.

### Turnaround

Actual submission time minus received time. Show mean, median, date coverage and whether calendar or business time was used.

### Target achievement

Actual / target using a time-specific target and clearly defined metric. N/A when the denominator or baseline is missing or zero.

### Client mix and concentration

Use consistent count and value totals for new client, renewal, cross-sell and upsell. A KES 500K threshold is a value tier, not automatically the top 20% of clients.

### Financial safeguards

- Store native currency and, where available, KES equivalent with rate, rate date and source.
- Never convert KES a second time.
- Do not treat unknown currency as KES.
- Do not use placeholder rates as approved rates.
- Show converted amount as unavailable when no valid rate exists.
- Do not turn an unknown value into a confirmed zero.
- Mark ambiguous legacy values for review.
- Preserve approved report snapshots.

Current currency support: KES, UGX, TZS, RWF, USD and EUR. The non-KES rates are indicative market rates dated 23 November 2026 and remain provisional until Ronalds Finance approves an official source.

---

## 11. Configuration and policy decisions

The following are configurable and are not intended to be hard-coded policy:

- acknowledgement target;
- working calendar and holidays;
- review reminders;
- default follow-up interval;
- escalation recipients;
- group-account new-client basis;
- weighted pipeline probabilities;
- self-approval prohibition;
- approval required count;
- approval amount limits;
- conflict and independence requirement;
- material-change fields;
- dispatch checklist requirement;
- loss feedback action;
- reporting default currency.

Items still requiring Ronalds confirmation:

- final working calendar and response targets;
- approval limits and approvers;
- group-account basis for "new client";
- conflict/independence policy;
- approved FX rate source;
- Finance reporting source;
- whether any additional report targets should be configured.

---

## 12. Data quality, migration and audit

- Migrations are additive.
- Existing IDs, stages, ownership and stage history are preserved.
- The legacy single amount is not copied into quote/award fields without confirmation.
- Ambiguous records are flagged for review.
- Legacy prequalifications and `NOT_SUBMITTED` records are flagged rather than silently converted.
- Duplicate accounts are detected and reviewed; merge is controlled and audited, never silent.
- Archive and restore replace permanent deletion for ordinary users.
- Disabled users retain history.
- IT support access to business data is explicitly granted and audited.
- Report snapshots preserve previously issued management reports.
- Exports are audited.

---

## 13. Current limitations

1. No document upload, file storage or document repository.
2. No Finance actuals, invoices, receipts or collections.
3. No Finance user role.
4. True XLSX, PDF and PowerPoint exports are not implemented. CSV and Word are.
5. Scheduled report delivery is stored inactive until a delivery mechanism and recipient authorization exist.
6. FX rates other than KES are provisional.
7. Target achievement is N/A until a target source is configured.
8. Mobile app deployment is separate from the web/VPS deployment.
9. Some legacy records are flagged for data review.
10. External notifications are not configured; the in-app queue is the current mechanism.

---

## 14. Operating model

The production deployment uses:

- a Contabo VPS;
- PostgreSQL on the same VPS;
- the API running as a service on port 4000;
- nginx serving the web export and proxying the API;
- additive Prisma migrations;
- backup and restore scripts;
- no demo seed on production.

Deployment and backup procedures are documented separately in `DEPLOYMENT.md` and `deploy/`.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| Account / Organization | The legal organization the firm deals with. |
| Prospect | Untouched organization before a real lead/opportunity exists. |
| Lead | An enquiry, referral, tender or expressed need under pursuit. |
| Opportunity | The pursuit of a service for an organization. |
| Client | An organization that is an existing client or has won work. |
| Stage | Legacy pipeline position. |
| Outcome | Commercial result independent of proposal progress. |
| Proposal | The formal offer, with revisions. |
| Revision | A version of the proposal with its own checklist, approvals and submission history. |
| Team Lead | Manager responsible for the technical proposal. |
| BD owner | Person responsible for commercial quality, compliance and submission. |
| Signing Partner | Partner who gives final approval and signs the engagement. |
| Prequalification | Supplier-panel or prequalification application, not a commercial proposal. |
| RAG | Red/Amber/Green drafting deadline status. |
| Cohort conversion | Conversion of opportunities first submitted in a period. |
| Period activity ratio | Wins booked in a period divided by proposals submitted in that period. |
| Snapshot | Frozen issued report payload. |
| Access scope | Explicit permission to see accounts, portfolios or individual records. |
| Audit event | Permanent record of a sensitive action. |

---

## 16. Manager's one-page summary

The CRM gives Ronalds Africa one controlled commercial workflow:

- Prospects are clean, assigned and visible in the pipeline.
- A real requirement becomes a Lead and then an Opportunity.
- Qualification and no-go are recorded.
- Proposals move through Team Lead technical review, BD quality review and Partner sign-off.
- Dispatch is blocked until the controls are complete.
- Outcomes are recorded separately from proposal progress.
- Wins create client records and handover tasks, not invoices.
- Losses carry structured reasons; silence is not treated as a loss.
- Prequalifications stay separate from wins.
- Reporting is permission-aware, value-aware and snapshot-capable.
- One Contacts directory covers prospects, leads and clients, with type markers and permission-aware editing.
- Configuration is visible only to the Marketing & BD Head and IT administrators.
- Access is role plus scope, and IT support access is explicit and audited.
- No documents are stored; only structured data and external references.

The system is ready to support daily BD work, management review, audit and eventual Finance handover without pretending to be a Finance system or a document repository.
