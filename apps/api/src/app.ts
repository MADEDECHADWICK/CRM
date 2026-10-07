import express from "express";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
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

/**
 * Terminal error handler.
 *
 * Without this, anything a route did not catch itself fell through to
 * Express's default handler, which replies with an HTML error page and a
 * stack trace — so a bad foreign-key id produced `500 text/html` instead of a
 * structured rejection, and the client's JSON parser had nothing to work
 * with. Known Prisma errors become the envelope the rest of the API uses;
 * everything else is logged and returned as an opaque 500 so internals never
 * leak to the caller.
 */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err && typeof err === "object" && (err as { name?: string }).name === "PrismaClientKnownRequestError") {
    const code = (err as { code?: string }).code;
    if (code === "P2003") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_REFERENCE", message: "A referenced record does not exist." },
      });
    }
    if (code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "The requested record was not found." },
      });
    }
    // Serializable transactions (transitions, primary-contact promotion) abort
    // a concurrent loser with this code. It is a retryable conflict, not a
    // server fault, so it gets a 409 rather than a 500.
    if (code === "P2034") {
      return res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "The record changed during your request. Reload and try again." },
      });
    }
  }

  // Errors raised by express.json() itself (malformed JSON, or a bare `null`
  // body that strict mode rejects) carry their own 4xx status. Honour it as a
  // structured request error instead of letting a bad body look like a server
  // fault.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return res.status(status).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Malformed request." },
    });
  }

  console.error("Unhandled API error:", err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  });
});

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