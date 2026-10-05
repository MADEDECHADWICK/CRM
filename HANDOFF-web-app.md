# Handoff — CRM: ownership phase + web app

Written at the end of a working session. **Nothing has been committed** — the whole
diff below is uncommitted in the working tree, so `git status` is the source of truth.

---

## 1. Run it

```bash
pnpm install                       # from the repo root, F:\crm project

pnpm --filter api dev              # API on :4000
pnpm --filter mobile dev            # phone
pnpm --filter web dev              # browser  <-- the new one
pnpm --filter web build            # static bundle -> apps/web/dist
```

`pnpm --filter web` resolves to `apps/web` (package name `web`) and runs
`expo start --web`. Ctrl+C to stop the dev server.

---

## 2. Architecture

```
apps/api        Express + Prisma, the only database writer
packages/core   types, ownership policy, HTTP client        (no React)
packages/ui     shared components                           (React Native)
packages/app    the application shell: 7 screens, nav, auth (React Native)  <-- NEW
apps/mobile     thin native shell  -> mounts @crm/app
apps/web        thin browser shell -> mounts @crm/app      <-- NEW
```

`pnpm-workspace.yaml` already globs `apps/*` and `packages/*`, so both new packages
were picked up with no edit to it.

### Why the shell is a package and not duplicated

The requirement was that an account shows *exactly* the same data on phone and
browser. Copying screens into `apps/web` would create two implementations that
have to be kept in step by hand. Instead both apps import the same `AppNavigator`,
so a field cannot appear on the phone and be missing in the browser — it is
literally the same component. Files were moved with `git mv`, so history follows.

`apps/mobile` is functionally unchanged; the screens just live elsewhere now.

---

## 3. What the web app needed

Three things were genuinely incompatible with the browser. Each is handled with
Metro's platform-extension resolution (`Foo.web.tsx`), so the shared screens stay
free of `Platform.OS` branches and the two platforms cannot drift.

| Problem | Resolution |
|---|---|
| `@react-native-community/datetimepicker` — Expo lists its platforms as `['android','ios','expo-go']`, no web | `components/DateTimeInput.web.tsx` renders a real `<input type="date">`. Both paths run through `toNoonUTC`, so the `Date` reaching the API is identical whichever device picked it |
| `victory-native` + Skia — no browser support | Bars are now plain `Animated` views (SVG cannot animate height off the JS thread); the donut uses `react-native-svg` arc paths. One implementation, both platforms |
| Token dies with the page on refresh | `auth/sessionStorage.web.ts` uses `localStorage`; the native default stays in memory deliberately |

Two subtleties worth preserving if these files are edited:

- **Never import a `.web.tsx` file's own base name.** Metro resolves `./Foo` to
  `Foo.web.tsx` on web, so that would make the module import itself. Shared types
  therefore live in `DateTimeInput.types.ts` and `sessionStorage.types.ts`.
- **`packages/app/tsconfig.json` includes the `DOM` lib.** Required because
  `DateTimeInput.web.tsx` renders a real `<input>`. Only that file needs it, and
  it is never bundled for native.

### HTTP client

Nine screens each built `createApiClient(API_URL)` at module scope against a
build-time constant. That is how two apps end up talking to different origins, so
`createApiClient` now also accepts a resolver called *per request*
(`string | (() => string)`, backwards compatible). `@crm/app/src/api.ts` owns one
client; each app calls `setApiUrl(...)` once at startup.

`@crm/core` still ships `createApiClient` with a plain string — both forms work.

---

## 4. Business rules implemented earlier this session

- Only `PARTNER` or `MANAGER` may own an opportunity. Department head is the
  default owner; a different owner needs `ownerOverrideReason`; an unheaded
  department needs an explicit eligible owner.
- Reassignment allowed for the current owner, any Partner, any Manager, or the
  creating Marketing user. Target must be Partner/Manager; `reason` is mandatory
  (the legacy `note` alias was removed).
- Initial ownership and every reassignment are recorded in `OwnerChange`. A
  pending missed-deadline reminder transfers to the new owner.
- `PATCH /departments/:id/head` — BD only; appointee must be a Partner/Manager and
  a member of that department; one person may head at most one department.
- Migration `20261005091500_add_department_head_and_owner_changes` is **applied** to
  Neon (`prisma migrate status` → up to date).

### Two of these are assumptions, not requirements

I chose them; the user never stated either. Both are enforced and visible in the
UI, and both are a few lines to flip:

1. **A department head must be a member of that department.**
2. **A pending breach reminder transfers to the new owner on reassignment.**

---

## 5. Verified

- `npx prisma validate` — schema valid.
- `npx prisma migrate status` — `Database schema is up to date!`
- `npx tsc --noEmit` clean in **all three**: `packages/app`, `apps/mobile`, `apps/web`.
- `apps/api`: **100 tests passing**, 15 suites.
- `pnpm --filter web build` exports. Bundle **1.18MB** (was 3.2MB before Skia left).
- Bundle inspected, not assumed: no Skia/CanvasKit, no victory, no reanimated, no
  gesture-handler; `react-native-svg` present; `data-crm-date-input` **present** and
  `DateTimePickerAndroid` **absent**, proving the web shim was substituted and the
  native picker excluded from the browser build.
- Ownership routes exercised over real HTTP against Neon: 21/21 assertions, then
  all test rows removed. Database confirmed back to 2 departments / 3 users.
- `apps/api/src/app.ts` mounts `cors()` with no options, so it reflects any origin
  and allows the `Authorization` header on preflight. No CORS change needed.

## 6. NOT verified — the honest gap

**The web build has never been rendered in a browser.** It compiles, bundles and
type-checks, but no runtime evaluation has happened. Type errors would be caught;
a runtime error inside a screen would not be. There is no Playwright or Puppeteer
installed in this environment.

To close it: run `pnpm --filter web dev` and look at it, or ask for Playwright to
be installed so it can be automated.

Two more things worth knowing:

- **Layout is phone-shaped on desktop.** Same screens, same data, single column,
  bottom tab bar. Desktop ergonomics (side nav, multi-column pipeline, wider
  tables) need platform-specific *layout* — the one place where diverging is a
  product decision rather than a defect.
- **The token lives in `localStorage` on web.** Readable by any script on the
  origin, so a successful XSS could lift the JWT. The stronger option is an
  httpOnly cookie, which needs the API to set it and stop returning the token in
  the login body — that changes the contract for mobile too. Noted in-code.

---

## 7. Files

New:
```
apps/web/{package.json,app.json,tsconfig.json,metro.config.js,index.ts,App.tsx,.env,.gitignore}
apps/web/src/apiUrl.ts
packages/app/{package.json,tsconfig.json}
packages/app/src/{index.ts,api.ts}
packages/app/src/auth/{sessionStorage.ts,sessionStorage.web.ts,sessionStorage.types.ts}
packages/app/src/components/{DateTimeInput.tsx,DateTimeInput.web.tsx,DateTimeInput.types.ts,dateUtils.ts}
packages/core/src/ownership.ts
apps/api/src/modules/opportunities/ownership.ts
apps/api/src/__tests__/ownership.test.ts
apps/api/prisma/migrations/20261005091500_add_department_head_and_owner_changes/
```

Moved (`git mv`, history preserved): the 18 files of `apps/mobile/src/{auth,components,navigation,screens}`
now live in `packages/app/src/`. `apps/mobile/src/lib/api.ts` stayed put — it is
the device-specific URL resolver.

Modified: `packages/core/src/{api-client.ts,crm-types.ts,index.ts}`,
`packages/ui/src/Chip.tsx` (optional `disabled`), `apps/mobile/{App.tsx,package.json}`,
`apps/api/src/{lib/prisma.ts,modules/**}`, `pnpm-lock.yaml`.

---

## 8. Pre-existing issues, untouched

- The JWT bakes the role in with a 7-day expiry, so a role change does not take
  effect until the user logs in again.
- `opportunityScope` is enforced on reassign but not on every other mutating
  opportunity route.
- `apps/mobile` still has a now-redundant `web` script.
- `apps/mobile` depends on `nativewind`/`tailwindcss` but uses neither — there is no
  `className` anywhere in the source; all styling is `StyleSheet`.
- Neither `apps/mobile` nor `apps/web` has any test infrastructure (no jest, no
  `test` script). Client UI has only ever been type-checked.
- There is **no lint script** in the repo, although `turbo.json` declares a `lint`
  task. Typecheck + tests is the full gate.

## 9. Resume prompt

> Read `HANDOFF-web-app.md` at the repo root first. Then install Playwright and
> smoke-test `pnpm --filter web dev` in a real browser, since that is the one
> unverified thing. Keep the parity rule intact: shared screens belong in
> `packages/app`, platform differences go in `.web.tsx` files, never in
> `Platform.OS` branches inside a screen.