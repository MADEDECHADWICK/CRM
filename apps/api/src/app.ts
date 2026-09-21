import express from "express";
import cors from "cors";
import { followupsRouter } from "./modules/followups/followups.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { organizationsRouter } from "./modules/organizations/organizations.routes";
import { opportunitiesRouter } from "./modules/opportunities/opportunities.routes";
import { reportingRouter } from "./modules/reporting/reporting.routes";
import { notesRouter } from "./modules/notes/notes.routes";

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

const port = Number(process.env.API_PORT || 4000);

app.listen(port, "0.0.0.0", () => {
  console.log(`API running on port ${port}`);
});