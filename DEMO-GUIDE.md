# Demo walkthrough

The demo seed is gated behind `ALLOW_DEMO_SEED=true` and only targets demo
records. Do not run it on production data.

```powershell
$env:DATABASE_URL="postgresql://crm:crm@127.0.0.1:5433/crm_preview?schema=public"
$env:ALLOW_DEMO_SEED="true"
pnpm --filter api seed
```

All demo users use password `password123`.

| Login | Role | What this login demonstrates |
|---|---|---|
| `grace@firm.co.ke` | Marketing & BD / Head of BD | Firm-wide commercial view, assignment, prospects, pipeline, reports and proposal governance. Cannot own an opportunity. |
| `john@firm.co.ke` | Partner | Own portfolio only. Assigns the proposal team, signs off proposals, owns/signs wins. Cannot see unassigned accounts. |
| `mary@firm.co.ke` | Manager | Own + Tax department portfolio and team lead on proposals. Prepares technical work and confirms technical completion. Sees overdue follow-ups. |
| `david@firm.co.ke` | Proposal coordinator | Only the 3 opportunities explicitly shared with him. BD owner: completes the quality checklist and sends to the Partner or returns to the team lead. Cannot own or sign off. |
| `lisa@firm.co.ke` | Technical reviewer | Only the 3 opportunities explicitly shared with her. Reviews technical checklist items and proposal reviews. No commercial approval authority. |
| `peter@firm.co.ke` | Country lead | Uganda country scope plus the Nairobi Water assignment. No firm-wide access and no commercial win approval. |
| `it@firm.co.ke` | IT administrator | Configuration/support scope. No commercial pipeline data and no approval authority. |

## What each demo record demonstrates

| Record | Stage / status | What to look at |
|---|---|---|
| Demo — ABC Retail tax compliance review | Prospect, OPEN | Earliest sales stage. Organization exists, no confirmed service requirement. |
| Demo — HF Bank internal audit | Lead, OPEN | Qualification stage with an overdue follow-up. |
| Demo — KKTel network audit proposal | Proposal, OPEN | Proposal revision `IN_PREPARATION`, partial checklist, no approval yet. |
| Demo — CoastalTelecom ad-hoc audit | Proposal, OPEN | Checklist complete, technical review approved, revision `IN_REVIEW`. |
| Demo — Kenya Tea Packers IFRS advisory proposal | Awaiting Feedback, OPEN | Submitted proposal, first submission history, approval by Mary, credential reference, 60/40 Kenya/Tanzania allocation. |
| Demo — GreenGrocer statutory audit | Won, WON | Proposal is `SUBMITTED` while the opportunity is `WON`. Confirmed award differs from submitted fee. Award evidence and engagement-letter metadata present. Handover follow-up created. |
| Demo — SunLogistics TIN issuance | Won, WON | Cross-sell win with award value different from the original quote. |
| Demo — Kebs Laboratories audit support | Won, WON | Upsell win. |
| Demo — NyeriSaccos audit | Won, WON | Renewal win. |
| Demo — CityBank SOX readiness | Lost, LOST | Competitive loss with scope-mismatch reason and a submitted proposal. |
| Demo — PearlHospital payroll audit | Lost, LOST | Competitive loss with `NOT_SUPPLIED` reason and a feedback follow-up. |
| Demo — RiftValley proposed audit | Not Submitted (legacy), OPEN | Shows the old stage plus overdue explanation task. The new sweep raises an overdue flag, not this stage. |
| Demo — Nairobi Water panel tender | Lead, OPEN | Tender linked back to a submitted prequalification application. |
| HF Bank prequalification | Accepted | Panel acceptance only. It is not a win or revenue. |
| Nairobi Water prequalification | Submitted | Pending panel application. |

## Prospect → pipeline behaviour

Assigning or reassigning a prospect now creates the initial `PROSPECT`
opportunity automatically. The pipeline shows it immediately, owned by the
assigned person or their department head. There is no **Start opportunity**
button on Prospects and no **Add opportunity** button on Pipeline.

Prospects shows only untouched accounts. Once an account has a Lead, Proposal,
Awaiting Feedback, Won, Lost, Deferred or other advanced opportunity, it leaves
Prospects and appears under its pipeline stage and under **All**. Pipeline's
**Prospects** tab uses the same definition, so the count and records match the
Prospects screen.

## Proposal workflow

1. Partner opens **Proposals**, assigns the **team lead (Manager)**, **BD owner**
   and **signing Partner**.
2. The team lead gets an in-app notification, prepares the technical proposal
   and clicks **Confirm technical work complete**.
3. The BD owner gets a notification, completes every required item in the
   **Proposal Quality Review Checklist** (29 criteria, sections A-E) and either:
   - sends it to the Partner, or
   - returns it to the team lead with comments.
4. The signing Partner reviews and either:
   - approves for submission (Section F is completed by the sign-off), or
   - returns it to the BD owner or team lead.
5. Only after Partner sign-off can the BD owner record dispatch. That records
   the actual submission time, channel and external reference, and moves the
   opportunity to Awaiting Feedback.

A material change after approval invalidates the approval and returns the
revision to the team lead.

## Where to look in the app

1. **Pipeline**: stage tabs, RAG badges, overdue flags and outcomes.
2. **Proposals** tab:
   - Proposals workspace: select an opportunity, inspect revisions, checklist items, approvals and submissions.
   - Prequalifications: accepted and submitted applications.
   - Configuration: configured settings. The Ronalds Proposal Quality Review Checklist is seeded as version 2: 34 items split into Team Lead (10), BD (20) and Partner (4).
3. **Follow-ups**: log in as Mary for the overdue HF Bank task and feedback task; as John for the handover and Kenya Tea chase.
4. **Reports > Pipeline and activity**: cohort conversion, period activity ratio, stage performance with count, percentage and KES value per stage, per-stage exports, breakdown by partner/manager/team lead/department, prequalifications, source and turnaround reports.
5. **Reports > Overview**: scorecard, bookings, wins and pipeline.
6. **Clients**: organizations with won work.
7. **Team** (Marketing & BD/admin only): users, departments, role assignments.
8. **Currency selector**: KES, UGX, TZS, RWF, USD and EUR are available. EUR is provisionally rated pending Ronalds-approved FX rates.

## Important interpretation

- A won opportunity is booked business, not an invoice or cash receipt.
- A prequalification acceptance is not a win.
- An overdue deadline is a flag/escalation, not a confirmed not-submitted proposal.
- A no-go/disqualified opportunity is not a competitive loss.
- The submitted quote is preserved when the confirmed award value changes.
- The demo checklist and approval policy are explicitly labelled as demo-only.
