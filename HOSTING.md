# Hosting the CRM for a free pilot (Render + Neon + EAS)

Target setup:

```
  Web (static)      -> Render Static Site   (crm-web.onrender.com)
  API (Node)        -> Render Web Service   (crm-api.onrender.com)
  Database          -> Neon Postgres (free, persistent)
  Mobile (iOS/Andr) -> EAS build (APK / TestFlight), talking to the Render API
```

> Render's **free Postgres expires** (30–90 days). Use **Neon** (free, doesn't expire) for the database. Render's free web service also **sleeps after ~15 min idle** — the first request then takes ~30–60s to wake.

---

## 0. Prerequisites
- The project pushed to a **GitHub** repo (Render deploys from Git).
- A **Render** account (free).
- A **Neon** account (free).
- For mobile: an **Expo** account (free) — only needed when you build the app.

---

## 1. Database — Neon
1. neon.tech → **New Project** → copy the **pooled** connection string, e.g.
   `postgresql://USER:PASS@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
2. Apply the schema and seed demo data from your machine (from `F:\crm project`):
   ```powershell
   $env:DATABASE_URL="<paste the Neon connection string>"
   pnpm --filter api exec prisma migrate deploy
   pnpm --filter api seed
   ```
   You now have the schema + the demo accounts on Neon.

---

## 2. API — Render Web Service

**Fast path (Blueprint):** the repo has `render.yaml`. In Render: **New → Blueprint → pick the repo → Apply**. Then fill the `sync:false` values (DATABASE_URL, JWT_SECRET, CORS_ORIGINS).

**Manual path:** Render → **New → Web Service** → connect the repo →
- **Runtime:** Node
- **Build Command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter api exec prisma generate`
- **Start Command:** `pnpm --filter api exec prisma migrate deploy && pnpm --filter api start`
- **Instance type:** Free
- **Environment variables:**
  | Key | Value |
  |---|---|
  | `DATABASE_URL` | your Neon connection string |
  | `JWT_SECRET` | a long random string |
  | `CORS_ORIGINS` | `https://crm-web.onrender.com` (add after step 3) |
  | `NODE_VERSION` | `24.20.0` |

Deploy. When it's live, open `https://crm-api.onrender.com/` → should show `{"success":true,...}`.

---

## 3. Web — Render Static Site

**Manual path:** Render → **New → Static Site** → connect the repo →
- **Build Command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build`
- **Publish Directory:** `apps/web/dist`
- **Environment variable:** `EXPO_PUBLIC_API_URL = https://crm-api.onrender.com`
- **Redirect/Rewrite rule:** Source `/*` → Destination `/index.html` (SPA fallback)

Deploy → open `https://crm-web.onrender.com`.

Then go back to the **API** service and set `CORS_ORIGINS = https://crm-web.onrender.com` (comma-separate more origins if needed) and redeploy. Log in with `grace@firm.co.ke` / `password123`.

---

## 4. Mobile — EAS build for testers

The mobile app is a native app; "hosting" it means producing an installable build that points at the Render API.

1. In `apps/mobile/eas.json` the `EXPO_PUBLIC_API_URL` is already set to `https://crm-api.onrender.com` — **change it if your API URL differs**.
2. Install EAS and log in (from `apps/mobile`):
   ```powershell
   npm i -g eas-cli
   eas login
   eas build -p android --profile preview
   ```
   This produces an **APK** and a download link/QR you can send to Android testers. (No Play Store needed.)
3. iOS testers: `eas build -p ios --profile preview` then submit to **TestFlight** (requires an Apple Developer account, $99/yr).
4. Testers install the build, and it talks straight to the Render API over HTTPS — no LAN, no IP.

---

## 5. Verify the pilot
| Check | Where | Expect |
|---|---|---|
| API up | `https://crm-api.onrender.com/` | `{"success":true,...}` |
| Web up | `https://crm-web.onrender.com` | login screen → dashboard |
| Cross-origin | log in on web | no CORS error (means `CORS_ORIGINS` is right) |
| Mobile | installed app | login works |
| Data | Pipeline | seeded deals visible |

---

## 6. Free-tier caveats (tell your testers)
- **API cold start:** after ~15 min idle the first request takes 30–60s. Optional: a free uptime pinger (e.g. cron-job.org hitting `/` every 10 min) keeps it warm.
- **Single instance:** the breach sweep and login throttle keep state in-process — fine for a pilot, but don't scale the API to multiple instances yet.
- **HTTPS everywhere** on Render (good — the earlier LAN/HTTP issues disappear).
- **Passwords:** staff creation now requires a password; seeded logins use `password123` — change them before sharing widely.

---

## 7. Alternatives (if you prefer)
- **Web:** Netlify / Vercel / Cloudflare Pages — free, no cold start, better than Render static. Build command and publish dir are the same (`apps/web/dist`); just set `EXPO_PUBLIC_API_URL` as a build env var.
- **API:** Fly.io / Railway / Koyeb — free-ish, no sleep. Same build/start commands; set the same env vars.
- **DB:** Neon (recommended) or Supabase free.
- **Mobile:** Expo Go (dev only, needs your machine running) vs **EAS build** (real testers — recommended).
