# Building the CRM in VS Code — Complete Step-by-Step Guide

This is the full path from an empty folder to a working backend, web app,
and native mobile app, sharing one codebase. Follow it in order — each
part assumes the previous one is done and working, not just written.

---

## PART 0 — Before You Open VS Code

### 0.1 Install these on your machine

- **Node.js LTS** (check with `node -v` — should be 20.x or newer)
- **pnpm**: `npm install -g pnpm`
- **Git**: `git --version` to confirm it's already there
- **VS Code** itself
- **Expo Go** app on your phone (App Store / Play Store) — this is how
  you'll preview the mobile app without a simulator
- A **Neon** account (neon.tech) — free Postgres, no card required

### 0.2 VS Code extensions to install

Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`) and install:

- **Prisma** (by Prisma) — syntax highlighting and formatting for `.prisma` files
- **ESLint**
- **Prettier — Code formatter**
- **Tailwind CSS IntelliSense**
- **Thunder Client** — for testing your API endpoints without leaving VS Code
- **GitLens** — optional but useful once you have real history to look back on

### 0.3 Create the project folder

```bash
mkdir crm-monorepo && cd crm-monorepo
code .
```

The last command opens the folder directly in VS Code. Do everything from
here on inside VS Code's integrated terminal (``Ctrl+` ``), not a separate
terminal window — keeps everything in one place.

---

## PART 1 — Repository & Monorepo Scaffold

### 1.1 Initialize Git and pnpm

```bash
git init
pnpm init
```

### 1.2 Create the workspace config

Create `pnpm-workspace.yaml` at the root:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 1.3 Install and configure Turborepo

```bash
pnpm add turbo --save-dev -w
```

Create `turbo.json` at the root:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", ".expo/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^lint"] },
    "typecheck": { "dependsOn": ["^typecheck"] }
  }
}
```

### 1.4 Root TypeScript config

Create `tsconfig.base.json` at the root:

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

### 1.5 Git hygiene

Create `.gitignore` at the root:

```
node_modules
dist
.next
.expo
.env
.env.local
*.log
.turbo
```

Create `.env.example` at the root (real values go in `.env`, which is
gitignored):

```
DATABASE_URL=
JWT_SECRET=
API_PORT=4000
```

### 1.6 Create the folder skeleton

```bash
mkdir -p apps/api apps/web apps/mobile
mkdir -p packages/core packages/ui packages/config
```

**Checkpoint:** `git status` should show your new folders and config files,
nothing accidentally tracked from `node_modules`. Commit:

```bash
git add .
git commit -m "chore: scaffold monorepo structure"
```

---

## PART 2 — Database

### 2.1 Create your Neon database

Go to neon.tech, sign up free, create a project. Copy the connection
string it gives you (starts with `postgresql://`).

### 2.2 Set up Prisma inside apps/api

```bash
cd apps/api
pnpm init
pnpm add -D prisma typescript tsx @types/node
pnpm add @prisma/client
npx prisma init
```

This creates `apps/api/prisma/schema.prisma` and an `.env` file.

### 2.3 Replace the generated schema

Open `apps/api/prisma/schema.prisma` and replace its contents with the
`schema.prisma` file already built for this project — it has every model
(User, Organization, Department, Opportunity, StageHistoryEntry, Note,
Followup) with the Stage enum, the department-per-opportunity design, and
all the field comments explaining why each decision was made.

Update the `role` field on `User` to match the three confirmed roles:

```prisma
enum Role {
  MARKETING_BD
  PARTNER
  MANAGER
}
```

### 2.4 Set your real connection string

In `apps/api/.env`:

```
DATABASE_URL="<paste your Neon connection string here>"
```

### 2.5 Run your first migration

```bash
npx prisma migrate dev --name init
```

This creates the actual tables in your Neon database. If it succeeds, you
now have a real, running Postgres database matching the ERD.

### 2.6 Seed some data

Create `apps/api/prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const john = await prisma.user.create({
    data: { name: "John Partner", role: "PARTNER" },
  });
  const mary = await prisma.user.create({
    data: { name: "Mary Manager", role: "MANAGER" },
  });
  const bd = await prisma.user.create({
    data: { name: "Grace BD", role: "MARKETING_BD" },
  });

  const tax = await prisma.department.create({ data: { name: "Tax" } });
  const audit = await prisma.department.create({ data: { name: "Audit" } });

  const org = await prisma.organization.create({
    data: {
      name: "ABC Manufacturing Ltd",
      industry: "Manufacturing",
      phone: "+254 700 111 222",
      email: "info@abcmfg.co.ke",
    },
  });

  await prisma.opportunity.create({
    data: {
      organizationId: org.id,
      departmentId: audit.id,
      ownerId: john.id,
      stage: "PROPOSAL",
      amount: 450000,
      service: "Statutory audit FY2027",
    },
  });

  console.log("Seeded:", { john, mary, bd, org });
}

main().finally(() => prisma.$disconnect());
```

Add a script to `apps/api/package.json`:

```json
"scripts": { "seed": "tsx prisma/seed.ts" }
```

Run it:

```bash
pnpm seed
```

### 2.7 Verify visually

```bash
npx prisma studio
```

This opens a browser GUI showing your actual data. Confirm the seeded
rows are there before moving on.

**Checkpoint:** you have a live Postgres database with real tables and
real seeded rows. Commit your `schema.prisma` and `seed.ts` (never commit
`.env`).

---

## PART 3 — Backend API (Modular Monolith)

### 3.1 Install the server framework and essentials

```bash
cd apps/api
pnpm add express cors zod jsonwebtoken bcryptjs
pnpm add -D @types/express @types/cors @types/jsonwebtoken @types/bcryptjs nodemon
```

### 3.2 Folder structure

Create this structure inside `apps/api/src/`:

```
src/
├── modules/
│   ├── auth/
│   ├── organizations/
│   ├── opportunities/
│   ├── notes/
│   ├── followups/
│   └── reporting/
├── middleware/
│   └── authorize.ts
├── lib/
│   └── prisma.ts
└── app.ts
```

### 3.3 The Prisma client singleton

`src/lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
```

### 3.4 The data-scope authorization middleware

This is the single most important file for enforcing the Roles &
Permission Matrix — every module below calls this instead of writing its
own role check.

`src/middleware/authorize.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthedRequest extends Request {
  user?: { id: string; role: "MARKETING_BD" | "PARTNER" | "MANAGER" };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED" } });
  try {
    const payload = jwt.verify(header.replace("Bearer ", ""), process.env.JWT_SECRET!) as any;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: "INVALID_TOKEN" } });
  }
}

// The single place the Marketing&BD/Partner-see-all vs Manager-sees-own
// rule lives — every query in every module imports this instead of
// re-implementing the check.
export function opportunityScope(user: AuthedRequest["user"]) {
  if (!user) return { id: "never-matches" };
  if (user.role === "MARKETING_BD" || user.role === "PARTNER") return {};
  return { ownerId: user.id };
}
```

### 3.5 Auth module

`src/modules/auth/auth.routes.ts`:

```typescript
import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";

export const authRouter = Router();

// Simplified for an internal tool — a real login would check a hashed
// password. For now this proves the token/role flow end to end.
authRouter.post("/login", async (req, res) => {
  const { userId } = req.body;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND" } });

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: "7d" });
  res.json({ success: true, data: { token, user } });
});
```

### 3.6 Organizations module

`src/modules/organizations/organizations.routes.ts`:

```typescript
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

organizationsRouter.get("/", async (req, res) => {
  const orgs = await prisma.organization.findMany({
    include: { opportunities: true },
    orderBy: { name: "asc" },
  });
  res.json({ success: true, data: orgs });
});

organizationsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
  }
  const org = await prisma.organization.create({ data: parsed.data });
  res.status(201).json({ success: true, data: org });
});
```

### 3.7 Opportunities module — including the transition endpoint

This is where `transitionOpportunity.ts` (already built) plugs in
directly — copy that file into `src/modules/opportunities/transitionOpportunity.ts`
and wire it to a route:

`src/modules/opportunities/opportunities.routes.ts`:

```typescript
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";
import { transitionOpportunity } from "./transitionOpportunity";

export const opportunitiesRouter = Router();
opportunitiesRouter.use(requireAuth);

// GET respects data scope — this is the enforcement point for
// "managers see their own, partners/BD see everyone"
opportunitiesRouter.get("/", async (req: AuthedRequest, res) => {
  const opps = await prisma.opportunity.findMany({
    where: opportunityScope(req.user),
    include: { organization: true, department: true },
  });
  res.json({ success: true, data: opps });
});

opportunitiesRouter.post("/:id/transition", async (req: AuthedRequest, res) => {
  try {
    const result = await transitionOpportunity({
      opportunityId: req.params.id,
      toStage: req.body.toStage,
      changedById: req.user!.id,
      decisionNote: req.body.decisionNote,
      amount: req.body.amount,
      lostReason: req.body.lostReason,
      revisitAt: req.body.revisitAt ? new Date(req.body.revisitAt) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: "TRANSITION_REJECTED", message: err.message } });
  }
});

// Reassignment — same decision-note requirement as any other pipeline change
opportunitiesRouter.post("/:id/reassign", async (req: AuthedRequest, res) => {
  const { newOwnerId, note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ success: false, error: { code: "NOTE_REQUIRED" } });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const opp = await tx.opportunity.update({
      where: { id: req.params.id },
      data: { ownerId: newOwnerId },
    });
    await tx.note.create({
      data: { body: note.trim(), authorId: req.user!.id, opportunityId: opp.id },
    });
    return opp;
  });
  res.json({ success: true, data: updated });
});
```

### 3.8 Notes and Followups modules

Copy the logic from `followupActions.ts` (already built) into
`src/modules/followups/followups.routes.ts`, wrapping `createFollowup` and
`deleteFollowup` as `POST /followups` and `DELETE /followups/:id`. Notes
follow the same simple pattern as Organizations above — a `POST /notes`
that accepts `body`, optional `organizationId`, optional `opportunityId`.

### 3.9 Reporting module

`src/modules/reporting/reporting.routes.ts`:

```typescript
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";

export const reportingRouter = Router();
reportingRouter.use(requireAuth);

reportingRouter.get("/summary", async (req: AuthedRequest, res) => {
  const scope = opportunityScope(req.user);
  const [won, lost, activeProposals] = await Promise.all([
    prisma.opportunity.aggregate({ where: { ...scope, stage: "WON" }, _sum: { amount: true }, _count: true }),
    prisma.opportunity.aggregate({ where: { ...scope, stage: "LOST" }, _sum: { amount: true }, _count: true }),
    prisma.opportunity.aggregate({ where: { ...scope, stage: "PROPOSAL" }, _sum: { amount: true }, _count: true }),
  ]);
  res.json({
    success: true,
    data: {
      wonValue: won._sum.amount ?? 0,
      wonCount: won._count,
      lostValue: lost._sum.amount ?? 0,
      lostCount: lost._count,
      activeProposalValue: activeProposals._sum.amount ?? 0,
    },
  });
});
```

This is BR-014 in practice — the number comes from a live aggregation
query, never a hand-typed figure.

### 3.10 Wire it all together

`src/app.ts`:

```typescript
import express from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes";
import { organizationsRouter } from "./modules/organizations/organizations.routes";
import { opportunitiesRouter } from "./modules/opportunities/opportunities.routes";
import { reportingRouter } from "./modules/reporting/reporting.routes";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/organizations", organizationsRouter);
app.use("/opportunities", opportunitiesRouter);
app.use("/reporting", reportingRouter);

const port = process.env.API_PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
```

Add to `apps/api/package.json`:

```json
"scripts": {
  "dev": "nodemon --exec tsx src/app.ts",
  "seed": "tsx prisma/seed.ts"
}
```

### 3.11 Run it

```bash
pnpm dev
```

### 3.12 Test with Thunder Client

In VS Code, open Thunder Client and:

1. `POST http://localhost:4000/auth/login` with `{ "userId": "<an id from Prisma Studio>" }` — copy the returned token.
2. `GET http://localhost:4000/organizations` with header `Authorization: Bearer <token>` — you should see your seeded org.
3. `GET http://localhost:4000/opportunities` — confirm a Manager token only sees their own, and a Partner/BD token sees everything.

**Checkpoint:** you have a real running API, enforcing the role/data-scope
rule, that your seeded data proves works. Commit everything in `apps/api`.

---

## PART 4 — Shared Packages

### 4.1 packages/core

```bash
cd packages/core
pnpm init
mkdir src
```

Copy the already-built `theme.ts` into `packages/core/src/theme.ts`.
Create `packages/core/src/index.ts`:

```typescript
export * from "./theme";
```

Add an `api-client.ts` alongside it:

```typescript
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

export async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  });
  return res.json();
}
```

Export it from `index.ts` too.

### 4.2 packages/ui

```bash
cd ../ui
pnpm init
mkdir src
```

Copy the already-built `Badge.tsx` into `packages/ui/src/Badge.tsx`, and
create `packages/ui/src/index.ts` exporting it. You'll add DeptTag,
IndustryIcon, and form inputs here the same way as you build them.

**Checkpoint:** two packages exist, each with real exports, ready to be
imported by name (`@crm/core`, `@crm/ui`) once the apps are set up to
resolve workspace packages — pnpm handles this automatically since they're
listed in `pnpm-workspace.yaml`.

---

## PART 5 — Mobile App (Expo)

### 5.1 Scaffold

```bash
cd apps
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install react-native-web react-dom
pnpm add nativewind tailwindcss
pnpm add @crm/core@workspace:* @crm/ui@workspace:*
```

### 5.2 Prove the architecture with Badge

Replace the contents of `apps/mobile/App.tsx`:

```typescript
import { View } from "react-native";
import { Badge } from "@crm/ui";

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Badge stage="Proposals" />
    </View>
  );
}
```

Run it:

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone. **If the Badge renders with
the correct amber color and pill shape, the monorepo architecture is
proven working end to end.** Do not proceed to building real screens until
this works — debugging one component is far cheaper than debugging six
screens with the same underlying wiring problem.

### 5.3 Build screens, in this order

1. **Login** — a simple form posting to `/auth/login` via `apiFetch`, storing the token (React state is fine to start; persistent storage is a later refinement).
2. **Home** — fetch `/reporting/summary` and `/opportunities`, render the stat cards.
3. **Prospects** — fetch `/organizations`, render the card grid.
4. **Leads / Proposals** — fetch `/opportunities` filtered client-side by stage (or add a `?stage=` query param to the API for efficiency once you notice you need it).
5. **Follow-ups** — the CRUD screen, calling `/followups`.
6. **Reports** — this is the one screen needing a genuine rewrite, not a port: install `victory-native` and rebuild the bar/pie/line charts using it instead of `recharts`.

Each screen follows the same pattern: fetch from `packages/core`'s
`apiFetch`, render with components from `packages/ui`, adding new shared
components to `packages/ui` as you discover you need them (DeptTag next,
almost certainly).

**Checkpoint:** you can log in on your phone via Expo Go, see real
prospects and opportunities pulled from your Neon database, and record a
stage transition that actually persists.

---

## PART 6 — Web App (Next.js)

### 6.1 Scaffold

```bash
cd apps
npx create-next-app@latest web --typescript --tailwind --app
cd web
pnpm add react-native-web
pnpm add @crm/core@workspace:* @crm/ui@workspace:*
```

### 6.2 Configure Next.js to transpile the shared packages

In `apps/web/next.config.js`:

```javascript
const { withExpo } = require('@expo/next-adapter');

module.exports = withExpo({
  transpilePackages: ["@crm/core", "@crm/ui", "react-native", "react-native-web"],
});
```

(`@expo/next-adapter` needs `pnpm add @expo/next-adapter` — it handles the
React Native → web compilation config so you don't hand-write Babel/Webpack
rules for this.)

### 6.3 Build the same six screens

Same order as mobile, reusing the same `packages/ui` components — this is
where you see the payoff of Part 4: most of the UI code is not rewritten,
just re-imported into a different app shell (Next.js pages/layout instead
of Expo's navigation).

**Checkpoint:** the same Badge, same data, same business rules, running in
a browser tab and on your phone simultaneously, both talking to the same
API and the same database.

---

## PART 7 — Testing

### 7.1 Install

```bash
cd apps/api
pnpm add -D vitest
```

### 7.2 Unit test the highest-risk logic first

`src/modules/opportunities/transitionOpportunity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
// Test that Lead -> Won is rejected (BR-004), that Won requires an
// amount, that Deferred requires a revisit date, and that every
// transition without a decisionNote is rejected (BR-010).
```

Write one test per business rule in the Business Rules document — this
gives you a checklist as much as a test suite.

### 7.3 Integration test the full journey

Test the whole Prospect → Lead → Proposal → Won path against a real (test)
database, confirming a Note and a StageHistoryEntry exist afterward.

---

## PART 8 — Deployment

| Piece    | Where                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database | Already on Neon (Part 2)                                                                                                                                                      |
| API      | Render or Railway — connect your GitHub repo, point it at`apps/api`, set `DATABASE_URL` and `JWT_SECRET` env vars                                                      |
| Web      | Vercel — connect the repo, set root directory to`apps/web`                                                                                                                 |
| Mobile   | `eas build` (Expo Application Services) for an internal distribution build (TestFlight/Play internal track), since this is an internal tool, not a public app store release |

---

## PART 9 — Pilot

Give this to 2–3 partners/managers first, not the whole firm. Watch what
confuses them, not just whether they say they like it. Fix, then expand.

---

## What "exhaustive" doesn't mean here

This guide gets you a real, working system end to end — it deliberately
does not include things you don't need yet at this scale: no
microservices, no message queue, no Kubernetes, no separate staging
environment beyond local + production to start. Add those only when you
hit an actual limit that requires them, not before.
