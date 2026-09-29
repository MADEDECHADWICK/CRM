import express from "express";
import cors from "cors";
import { followupsRouter } from "./modules/followups/followups.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { organizationsRouter } from "./modules/organizations/organizations.routes";
import { opportunitiesRouter } from "./modules/opportunities/opportunities.routes";
import { reportingRouter } from "./modules/reporting/reporting.routes";
import { notesRouter } from "./modules/notes/notes.routes";
import { usersRouter } from "./modules/users/users.routes";
import { departmentsRouter } from "./modules/departments/departments.routes";
import { contactsRouter } from "./modules/contacts/contacts.routes";
import {
  runSweepAtStartup,
  sweepOverdueProposals,
} from "./modules/opportunities/breachSweep";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CRM API is running",
  });
});

app.use("/auth", authRouter);
app.use("/organizations", organizationsRouter);
app.use("/opportunities", opportunitiesRouter);
app.use("/reporting", reportingRouter);
app.use("/followups", followupsRouter);
app.use("/notes", notesRouter);
app.use("/users", usersRouter);
app.use("/departments", departmentsRouter);
app.use("/contacts", contactsRouter);

const port = Number(process.env.API_PORT || 4000);

/**
 * Hourly breach sweep (BR-019).
 *
 * setInterval rather than a cron dependency: the schedule is a fixed hourly
 * tick, so a library would buy nothing and would add a runtime dependency to
 * the API. The one-time run at boot matters more than the interval — a
 * service restarted after being down over a weekend should catch up
 * immediately rather than waiting up to an hour, which is exactly the
 * situation where deals have already breached.
 *
 * Overlapping runs are impossible to cause in a single-threaded process
 * because sweepOverdueProposals() re-reads inside its transaction, and a
 * second run finds nothing left to breach.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

void runSweepAtStartup();

const sweepTimer = setInterval(() => {
  void sweepOverdueProposals()
    .then((result) => {
      if (!result.noop) {
        console.log(`[breach-sweep] flagged ${result.breached} overdue proposal(s)`);
      }
      if (result.escalated.length) {
        console.log(`[breach-sweep] ${result.escalated.length} breach explanation(s) overdue`);
      }
    })
    .catch((err) => {
      // Logged, never rethrown: a failed sweep must not become an unhandled
      // rejection that takes the API process down.
      console.error("[breach-sweep] sweep failed:", err);
    });
}, SWEEP_INTERVAL_MS);

// Do not hold the event loop open on this timer alone during shutdown.
sweepTimer.unref();

app.listen(port, "0.0.0.0", () => {
  console.log(`API running on port ${port}`);
});