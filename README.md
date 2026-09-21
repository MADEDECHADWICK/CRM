## **CUSTOM MONOREPO CRM BUILD(CONVERGING BOTH REACT & REACT NATIVE INTO A MODULAR MONOLITH)**

This is the full path from a working backend, web app, and native mobile app, sharing one codebase.

### **TECHNOLOGIES ADOPTED**

- **Node.js LTS** (check with `node -v` — 24.x )
- **pnpm**: `npm install -g pnpm`
- **Git**: `git --version` to confirm it's already there
- **VS Code** itself
- **Expo Go** app on your phone (App Store / Play Store) — this is how
  you'll preview the mobile app without a simulator
- A **Neon** account (neon.tech) — free Postgres, no card required

Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`) and install:

- **Prisma** (by Prisma) — syntax highlighting and formatting for `.prisma` files
- **ESLint**
- **Prettier — Code formatter**
- **Tailwind CSS IntelliSense**
- **Thunder Client** — for testing your API endpoints without leaving VS Code
- **GitLens**

### **PROJECT STRUCTURE**

CRM
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                    (root — "crm-monorepo")
│
├── apps/
│   ├── api/                        ✅ built this session
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── generated/prisma/       (Prisma 7's custom client output)
│   │   └── src/
│   │       ├── app.ts
│   │       ├── lib/prisma.ts
│   │       ├── middleware/authorize.ts
│   │       └── modules/
│   │           ├── auth/auth.routes.ts
│   │           ├── organizations/organizations.routes.ts
│   │           ├── opportunities/
│   │           │   ├── opportunities.routes.ts
│   │           │   └── transitionOpportunity.ts
│   │           ├── followups/
│   │           │   ├── followups.routes.ts
│   │           │   └── followupActions.ts
│   │           └── reporting/reporting.routes.ts
│   │
│   ├── web/
│   └── mobile/
│
├── packages/
│   ├── core/
│   └── ui/
│
└── CRM-Docs/                       (PRD, roles matrix, journeys, business rules, ERD)
