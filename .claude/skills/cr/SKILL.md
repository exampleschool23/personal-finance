---
name: cr
description: Precise code and architecture review of Hoggish against AGENTS.md and the code regression catalog - leaks (secrets, personal data, resources), misuse of shared helpers, DRY, SOLID, module boundaries, database architecture (RLS, households, migrations, indexes, constraints), money precision, concurrency and operational risks. Use for "/cr", "code review", "architecture review", "find risks", "audit the code", or before shipping a large change. Arguments - empty or "full" (whole codebase), "diff" (uncommitted changes plus the last commit), a path or glob (one file or folder), or an area code (SEC, LEAK, AUTHZ, DB, MIG, API, MONEY, DRY, SOLID, ARCH, RES, CONC, ERR, PERF, DEP, BOT, TEST).
---

# /cr — precise code review

You are the reviewer. Every finding names the rule it breaks (a catalog case, an
`AGENTS.md` section, or a named principle), the exact place (`file:line`), the
concrete failure (inputs or state → wrong result, leak or crash), and the fix with
the shared helper or file to use. No taste-only remarks: anything a rule does not
cover is a **Suggestion** and is listed separately. A finding you cannot tie to a
real failure scenario is not a finding.

Sources of truth, read before every review:
1. `AGENTS.md` → every section; it is the architecture contract.
2. `references/cases.md` → the code regression catalog (the checklist).
3. `database/setup.sql` and the newest files in `migrations/` for the current schema.
4. `eslint.config.mjs` (size limits) and `eslint-suppressions.json` (known breaches).

Default mode is **review only**: do not edit code unless the user asks ("/cr fix").

## 0. Ground rules (never break these)

- **Read-only by default.** No commits, no pushes, no migrations applied, no calls
  to production, Supabase, Telegram or any paid API. Reviewing a cron or webhook
  route means reading it, never invoking it.
- **Secrets stay secret.** If you find a key, token or password in the tree or in
  history, report the file and line and the kind of secret, never its value, and
  tell the user to rotate it. Do not paste env files into the report.
- **Other sessions share the tree** (memory `concurrent-sessions`). On "/cr fix",
  stage only your own files by path; never `git add -A`, never `git stash`.
- **Verify before reporting.** Each candidate is checked against the code it calls
  (follow the helper, the SQL function, the policy). Drop it if a guard elsewhere
  already prevents the failure, and say so in "Checked, not a finding" when it was
  a plausible risk.

## 1. Scope

| Argument | What to read |
|---|---|
| empty / `full` | Every area below. Fan out one subagent per area group (see §3) and merge. |
| `diff` | `git diff HEAD` plus `git show HEAD`; review the changed lines and everything they call or that calls them. Map files to areas with the table below. |
| path or glob | Those files plus their direct imports and callers. |
| area code | That area's cases across the whole codebase. |

| Area | Where it lives |
|---|---|
| SEC | `app/api/**/route.ts`, `lib/api-route.ts`, `lib/supabase.ts`, `lib/supabase-jwt.ts`, `lib/cron-auth.ts`, `lib/standard-webhook.ts`, `lib/backup-signature.ts`, `app/layout.tsx`, `next.config.*` |
| LEAK | `lib/monitoring.ts`, `lib/client-errors.ts`, `app/api/client-errors`, `lib/assistant.ts`, `app/api/assistant`, email and Telegram messages, every `console.*` |
| AUTHZ | `lib/household.ts`, `lib/service-role.ts`, `lib/owner-rows.ts`, `lib/server-records.ts`, `lib/telegram-owner.ts`, cron and webhook routes |
| DB | `database/setup.sql`, `migrations/*.sql`, `lib/*-schemas.ts`, `lib/record-schema.ts` |
| MIG | `migrations/` naming, order and idempotency; `tests/*-sql.mjs` |
| API | `app/api/**`, `lib/api-route.ts`, `lib/api-validation.ts`, `lib/api-client.ts`, `lib/rate-limit.ts` |
| MONEY | `lib/money.ts`, `lib/market.ts`, `lib/dated-exchange-rate.ts`, `lib/decimal-amounts.ts`, `lib/schedule-currency.ts`, `lib/workspace-totals.ts`, `lib/format.ts`, anything that sums amounts |
| DRY | `lib/`, `components/`, `hooks/` — duplicated rules, calculations, fetch wrappers, schemas |
| SOLID | `lib/`, `components/workspace/state/`, large components |
| ARCH | `components/workspace/**`, `components/presentation-foundation/**`, `app/(workspace)/**`, `tests/workspace-structure.mjs` |
| RES | client components with effects, timers, listeners, observers, `fetch` without timeouts, streams |
| CONC | save paths (`lib/record-save.ts`, `components/workspace/state/`), SQL functions that read-then-write, Telegram flows, imports |
| ERR | every `catch`, every `.catch(() => null)`, `postgrestFailure` use |
| PERF | PostgREST reads, `readAllPages`, N+1 loops, SQL without indexes, heavy client bundles |
| DEP | `package.json`, lockfile, `scripts/`, `.github/workflows/` |
| BOT | `lib/telegram*`, `lib/telegram-bot/`, `lib/telegram-flow/`, `app/api/telegram/**` |
| TEST | `tests/`, `e2e/`, `scripts/coverage-floor.json` |

## 2. Method

1. **Map.** For the scope, list the entry points (routes, SQL functions, screens,
   cron jobs, bot handlers) and the data each one touches. Note which run as the
   user (`supa(..., token)`, RLS applies) and which run as the service role
   (`serviceDatabase()`, RLS bypassed).
2. **Trace trust boundaries.** For every entry point: who can call it, how the
   caller is authenticated, how the owner is chosen (`workspaceOwner(auth)`,
   `active_owner()`), what input is validated (zod schema from `lib/api-validation.ts`),
   and what leaves the server (response body, logs, Telegram, email, the assistant
   prompt). Every service-role path must scope to an owner it verified itself.
3. **Run the catalog.** For each case in scope, run its Check (most are a grep or a
   read of a named file) and record pass / fail / not applicable. Grep first, then
   read the hits; a grep hit is a lead, not a finding.
4. **Read for design.** Beyond the catalog, read the scope for: duplicated rules
   (DRY), modules with more than one reason to change or that reach across layers
   (SOLID, ARCH), schema shapes that allow invalid states (DB), and read-modify-write
   sequences without a lock or a single SQL statement (CONC).
5. **Run the guards** that already encode rules, and report failures as findings:
   ```bash
   npm run lint
   ```
   ```bash
   npm run typecheck
   ```
   ```bash
   npm test
   ```
   For `diff` runs, `npm test` is enough when the change is small; say which ran.
6. **Verify each candidate** (ground rule above) and assign a severity.

Useful leads (run from the repo root; each is a starting point, not a verdict):

```bash
grep -rnE "auth\.user\.id|\.user\.id\b" app/api lib --include=*.ts | grep -v workspaceOwner
grep -rnE "serviceDatabase\(" app lib --include=*.ts
grep -rnE "console\.(log|info|debug)" app lib components --include=*.ts --include=*.tsx
grep -rnE "\.catch\(\(\) ?=> ?(null|undefined|\{\})\)" app lib --include=*.ts
grep -rnE "new Date\(\)\.toISOString\(\)|toFixed\(|parseFloat\(" app lib components --include=*.ts --include=*.tsx
grep -rnE "setInterval|addEventListener|new (Resize|Intersection|Mutation)Observer" components hooks --include=*.tsx --include=*.ts
grep -niE "security definer" database/setup.sql migrations/*.sql
git log -p --all -S "sb_secret_" --oneline | head
```

## 3. Full runs: fan out

For `full`, launch subagents in one message (background), each with this file, the
catalog section(s) and `AGENTS.md`, asking for verified findings in the report
format of §4:

1. SEC + API + AUTHZ (trust boundaries)
2. LEAK + ERR + BOT (what leaves the server, and failure paths)
3. DB + MIG + PERF (schema, policies, functions, indexes, queries)
4. MONEY + CONC (financial correctness and races)
5. DRY + SOLID + ARCH (design and boundaries)
6. RES + DEP + TEST (resources, supply chain, coverage)

Then deduplicate, re-verify every R0 and R1 yourself, and write one report.

## 4. Report

Order by severity, then area. Each finding:

```
[R0|R1|R2] AREA-NNN (or AGENTS.md § / principle) — one-line defect
  where:    path/to/file.ts:123 (and the other places it repeats)
  failure:  concrete inputs/state → leak / wrong amount / crash / cross-owner read
  fix:      the change, naming the shared helper or file to use
  verified: what you followed to confirm it (helper, policy, test)
```

Severity: **R0** exploitable or data-corrupting (cross-owner read or write, secret
or personal data leaked, money wrong in storage, data loss); **R1** a written rule
broken or a real risk under plausible conditions (missing rate limit, unvalidated
input, race, unbounded read, DRY breach of a financial rule, boundary violation);
**R2** maintainability (smaller DRY, naming, size-limit pressure, dead code).

After the findings: **Suggestions** (not rule-backed), **Checked, not a finding**
(plausible risks you ruled out, one line each), **Not run** (what you skipped and
why), and the guard results (lint / typecheck / test counts).

For a `full` run with many findings, offer to publish the report as a page.

## 5. Keep the catalog alive

- Every confirmed finding becomes a case in `references/cases.md` if no case covers
  it: next free number in its area, `[cr YYYY-MM-DD]` at the end of the Expect cell.
  When it is fixed, append `Fixed YYYY-MM-DD` and the test that guards it.
- Prefer turning a case into an automated guard (a test in `tests/`, an ESLint rule)
  and name it in the case; a rule a test enforces never regresses silently.
- Add a run-log line at the top of the catalog: date, commit (`git rev-parse --short HEAD`),
  scope, findings by severity, and what was not run.
- IDs are stable: append, never renumber. `tests/qa-design-catalogs.mjs` checks the
  table format and that every area named in this file's arguments has cases.
