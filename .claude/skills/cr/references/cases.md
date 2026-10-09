# Code regression catalog

Severity if failed: **R0** exploitable or data-corrupting, **R1** written rule broken or
real risk, **R2** maintainability. Each case says how to check it. IDs are stable; append,
never renumber. `[cr YYYY-MM-DD]` marks a case added from a finding in that run.

Run log (newest first): 2026-10-09 `/cr fix` follow-up: ERR-004 bin purge closed with migration 130 (`orphan_attachment_paths`, `forget_attachments`; files first, rows after); guarded by `tests/record-attachments-sql.mjs` and `tests/api-route-hardening.mjs`. Overview business-card budget read reclassified as not a duplicate (it follows its own period picker and loads only with a business). 2026-10-09 `/cr fix all of them` of the full run: every R1 and R2 fixed in seven groups (six in isolated worktrees, merged by hand around other sessions' work; the DRY group in place). Migrations 128 (goal allocation, bounded record summary, `set_budget_amounts`) and 129 (`telegram_deliveries`); schema version 129. Fixed: CONC-003/005/006, ERR-004 (bin purge report-only), API-002 ×3 and the R2 API items, MONEY-008, DB-009 income cards by id, DRY-001 ×4 (`cashFlowItems`, `marketRates` + parity test, report valuation, bot `chooseSchedule`), SOLID-001 (`lib/report-figures.ts`, suppressions pruned), PERF-001/002/003/005, DEP-001/002/003 (npm audit 0), RES-002, TEST-003 (125 untested). 2026-10-09 `/cr fix` of DB-014 at 66d554c: migration 127 moves a deleted category's budget amounts, settings and rollover fund to its replacement (summed month by month, same currency only) or removes them; requiredSchemaVersion 127. Left: DB-015 ×2 and DB-009 (product decisions), sample-workspace budget on category delete, existing orphaned rows. npm test 1560/1568 (8 failures in Reports, Cash flow and Recent activity, which another session is editing; 126 and readiness tests updated for version 127); typecheck clean. 2026-10-09 `/cr` question "do items across Recurring, Budget, Transactions, Accounts, Investments and Loans share one id" at 66d554c: R0 0, R1 3 (DB-014 budget keys orphaned by category delete, DB-015 ×2 income source/schedule double id and spending-plan categories; DB-009 income cards by name re-confirmed, already logged). Not run: lint, typecheck, npm test (read-only question; tree has another session's uncommitted changes). 2026-10-09 `/cr full` at 66d554c (six parallel reviewers, every R1 re-read in source): R0 0, R1 21 (CONC-005 goal allocated, CONC-006 bot onboarding, CONC-003 digest/recap resend, ERR-004 receipts left after deletion, API-002 ×3 market/Telegram sign-in/import, DB-009 + DRY-001 income cards by name, DRY-001 ×3 spending definition/conversion helpers/PDF net worth + bot chooseSchedule, SOLID-001 financial-report.ts, MONEY-008 ×2 Budget/forecast+watchlists, PERF-005 ×3 crons/bot, PERF-002 ×2 record summary/full-history screens, PERF-001 ×2 budget recalculate/FX per payment), R2 about 20. npm test 1562/1562, workspace-structure and presentation-foundation 40/40, npm audit 2 high (sharp override, source-map-js). Not run: e2e, coverage job, fresh bundle build. 2026-10-09 `/cr fix` of the database run: migration 124 (AUTHZ-008, DB-011, DB-012, DB-013, MIG-007), 118/110 re-run guards (MIG-006), 033 retired (MIG-008), 091 comment (MIG-001); new `tests/database-integrity-sql.mjs` (fails without 124). Left: 099 re-run nesting, 100/102/109 abort on re-run (they roll back cleanly), 095 history, MIG-004 lock DDL. npm test 1557/1557, typecheck clean; lint has 2 complexity errors in files other sessions changed (asset-icon.tsx, assistant-screen.tsx). 2026-10-09 `/cr database structure` at 9680869 (setup.sql loaded into PGlite; migrations 094→123 replayed on pre-099 setup and 099→123 re-applied): R0 0, R1 6 (AUTHZ-008, DB-011, DB-012, DB-013, MIG-006 on 118, MIG-007), R2 7 (DB-007 user_id indexes, MIG-006 on 110/099, MIG-002 on 100/102/109, MIG-008, MIG-001 gaps 090/096, 095 rewritten after release, MIG-004 lock DDL). No drift between setup.sql and 094–123; RLS on all 50 tables; all 108 security definer functions set search_path. npm test 1550/1550. Not run: production schema state, lint, typecheck. 2026-10-09 catalog created from `AGENTS.md` and the source layout; no run yet.

## SEC — authentication, secrets, request safety

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| SEC-001 | R0 | Every mutating route checks the origin | `grep -L "sameOrigin" app/api/**/route.ts` for files exporting POST/PUT/PATCH/DELETE | Each mutating handler starts with `if(!sameOrigin(req))return crossSite()`, except webhooks and cron, which authenticate by secret instead |
| SEC-002 | R0 | Every user route resolves a session before touching data | Read each handler: `session()` before any `supa(` call with a token | No data path runs with an undefined token; missing session returns `signInAgain()` |
| SEC-003 | R0 | Cron routes require the cron secret | `app/api/cron/**/route.ts` call `cronAuthorized(req)` first | Unauthorized requests get 401 before any read; secret compared in constant time (`lib/cron-auth.ts`) |
| SEC-004 | R0 | Telegram webhook verifies its secret token | `app/api/telegram/webhook` checks `X-Telegram-Bot-Api-Secret-Token` | Requests without the configured token are refused before parsing the update |
| SEC-005 | R0 | Signed payloads are verified, not trusted | `lib/standard-webhook.ts`, `lib/backup-signature.ts`, `lib/supabase-jwt.ts` | Signature checked with a timing-safe compare, timestamp tolerance enforced, algorithm pinned |
| SEC-006 | R0 | No secrets in the repository or its history | `git grep -nE "sb_secret_|service_role|BEGIN (RSA|OPENSSH) PRIVATE|bot[0-9]{8,}:" ` and `git log -S` for the same | No key material committed; `.env*` ignored except examples with blanks. Report location only, never the value |
| SEC-007 | R0 | Server-only keys never reach the client | `grep -rn "SUPABASE_SERVICE_ROLE_KEY\|TELEGRAM_BOT_TOKEN\|ANTHROPIC_API_KEY" components hooks app --include=*.tsx` and any `NEXT_PUBLIC_` name holding a secret | Secrets read only in server modules; no `NEXT_PUBLIC_` secret |
| SEC-008 | R1 | Session cookies are hardened | `lib/supabase.ts` `saveSession` and `hf_workspace` cookie | `httpOnly`, `secure`, `sameSite=lax` or stricter, `path=/`, bounded `maxAge` |
| SEC-009 | R1 | No raw HTML from data | `grep -rn "dangerouslySetInnerHTML\|innerHTML" components app` | Only static, app-authored strings (the font boot script); never record names, notes, bot text or assistant output |
| SEC-010 | R1 | Redirect targets are allow-listed | Routes reading `next`, `redirect`, `returnTo` from the query | Only same-origin relative paths; no open redirect |
| SEC-011 | R1 | Uploads are bounded and typed | `app/api/import`, `app/api/record-attachments` | Size cap before reading the body, MIME and extension checked, parser (zip, xlsx, ofx, qif) bounded against zip bombs and huge rows |
| SEC-012 | R1 | Security headers set | `next.config.*` / middleware headers | CSP (or a documented reason for its absence), `X-Content-Type-Options`, `Referrer-Policy`, frame protection |

## LEAK — data and secret leaks

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| LEAK-001 | R0 | Error replies never echo internals | `postgrestFailure` callers and every `catch` returning `error.message` | Clients get fixed, translated messages; PostgREST `details`/`hint`, SQL and stack traces stay server-side |
| LEAK-002 | R0 | Logs carry no personal or financial data | `grep -rnE "console\.(log|error|warn)" app lib` and `lib/monitoring.ts` | No tokens, emails, phone numbers, amounts, account names or request bodies logged; ids at most |
| LEAK-003 | R0 | Client error reports are scrubbed | `lib/client-errors.ts`, `app/api/client-errors` | URLs stripped of query strings, messages truncated, no form values; rate-limited |
| LEAK-004 | R1 | Assistant prompt holds only the signed-in owner's workspace | `lib/assistant.ts`, `app/api/assistant` | Snapshot built from the caller's RLS-scoped reads; no other member's personal tables; no secrets or internal ids beyond need |
| LEAK-005 | R1 | Telegram messages go only to the linked user | `lib/telegram-owner.ts`, digest/recap senders | Chat id comes from the subscription row of the owner; a household member's data is not sent to another member's chat unless shared |
| LEAK-006 | R1 | Responses select only needed columns | `grep -rn "select=\*" app lib` | API responses don't forward whole rows with internal columns (tokens, hashes, other members' ids) to the browser |
| LEAK-007 | R1 | Sensitive pages are not cached | Auth, backup and account routes | `Cache-Control: no-store` (or `reply` with `noReferrer`) on responses with personal data |
| LEAK-008 | R2 | No personal data in URLs | Client `requestJson` calls and links | Emails, phones, amounts never in query strings; POST bodies instead |

## AUTHZ — ownership and households

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| AUTHZ-001 | R0 | Routes use `workspaceOwner(auth)`, never `auth.user.id`, for owner ids | Lead grep in SKILL.md §2 | Every owner id in a shared-table write or filter comes from `workspaceOwner`; personal calls use `personalRequest()` |
| AUTHZ-002 | R0 | Service-role paths scope to a verified owner | `grep -rn "serviceDatabase(" app lib`; read each caller | Every query carries `user_id=eq.<owner>` derived from a verified source (cron row, linked Telegram user), never from request input |
| AUTHZ-003 | R0 | `hf_workspace` cannot open a stranger's workspace | `public.active_owner()` in `database/setup.sql` and migration 100 | The header is honoured only for an accepted household member; any other value falls back to `auth.uid()` |
| AUTHZ-004 | R0 | Viewers cannot write | Shared-table triggers and restrictive policies | Every table in `shared_workspace_tables()` has the viewer write guard; `tests/households-sql.mjs` covers it |
| AUTHZ-005 | R1 | Record owners read through helpers | `grep -rn "\.member_id\|\.shared\b" components lib` | Read with `ownerOf` / `holdingOwner`; no direct column logic |
| AUTHZ-006 | R1 | Telegram acts only for the linked user in a private chat | `lib/telegram-bot*`, webhook handler | Group chats ignored; the Telegram user id must match the subscription; bot writes to the person's own workspace |
| AUTHZ-007 | R1 | Ids from the client are re-checked by RLS | Routes passing ids to RPCs | The RPC or PostgREST call runs with the user's token so RLS rejects foreign ids; a service-role call with a client id is R0 |
| AUTHZ-008 | R1 | Privileged wrappers re-check the owner of every id | `security definer` functions that call `security invoker` ones (e.g. `telegram_save_finance_record` → `save_finance_record`) | The inner function refuses an id owned by someone else even with RLS bypassed; upserts use `ON CONFLICT(id) DO UPDATE ... WHERE user_id = excluded.user_id`. Found 2026-10-09: a foreign `id` overwrote and returned another owner's record in PGlite (ids are server-made today) `[cr 2026-10-09]` Fixed 2026-10-09 in migration 124 (foreign id raises "Record not found.", upsert limited to the same owner); guarded by `tests/database-integrity-sql.mjs`. |

## DB — schema, policies, functions

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| DB-001 | R0 | Every table has RLS on and owner policies | Every `create table` in setup and migrations vs `enable row level security` | No table with user data lacks RLS; policies use `active_owner()` (shared) or `auth.uid()` (personal) |
| DB-002 | R0 | New `user_id` tables are classified | `public.shared_workspace_tables()` and the personal list | Each is shared or personal; `tests/households-sql.mjs` fails otherwise |
| DB-003 | R0 | `security definer` functions are locked down | `grep -niE "security definer" database/setup.sql migrations/*.sql` | Each sets `search_path` (e.g. `set search_path = public, pg_temp`), checks the caller's owner itself, and `revoke ... from public` / `anon` where not meant for them |
| DB-004 | R0 | Functions on shared tables use `active_owner()` | Functions touching shared tables | No `auth.uid()` in a shared-table function (households would break or leak) |
| DB-005 | R1 | Money columns are exact | Column types for amounts, prices, rates | `numeric` (with scale where fixed), never `float`/`real`/`double precision` |
| DB-006 | R1 | Invalid states are impossible | `check`, `not null`, foreign keys on new columns | Currencies checked, amounts finite, enums constrained, references with explicit `on delete` behaviour |
| DB-007 | R1 | Foreign keys and filters are indexed | Columns used in `where`, joins, `order by` on large tables (`records`, `payment_occurrences`) | An index for `(user_id, …)` access paths; no sequential scan on per-owner hot reads |
| DB-008 | R1 | Unique rules live in the database | Idempotency and one-per-key rules (occurrences, links, rates per day) | A unique constraint or index, not only an app-side check |
| DB-009 | R1 | Scheduled payments link by id | Queries joining payments to schedules | Only `occurrence_record_id` / `occurrence_due_on` (migration 119); no name, amount or date matching |
| DB-010 | R2 | `database/setup.sql` matches the migrations | Diff the objects a new migration creates against setup | A fresh database equals an upgraded one; the e2e stand-in runs setup.sql, so drift hides bugs |
| DB-011 | R1 | Numeric checks reject NaN and Infinity | `check (x>=0)` without an upper bound on directly writable tables | Every money/quantity/rate check has an upper bound (`<=1e15`), since `'NaN'::numeric >= 0` is true. Found 2026-10-09: `finance_records` amount, quantity, cost, rate (setup.sql:8-11) are writable by PostgREST and a NaN expense poisons the cash balance through `apply_account_cashflow` `[cr 2026-10-09]` Fixed 2026-10-09: `finance_records_figures_bounded` (migration 124); guarded by `tests/database-integrity-sql.mjs`. |
| DB-012 | R1 | Unique keys account for Recently deleted | Unique indexes on soft-deletable rows (`finance_import_key`) vs `restore_deleted_item` | Re-import treats deleted keys as imported, or restore handles the conflict with a translated message. Found 2026-10-09: re-import resurrects a deleted import row and the restore then fails on `finance_import_key` `[cr 2026-10-09]` Fixed 2026-10-09: the restored copy drops its `import_key` when a newer copy holds it (migration 124). Re-import still re-adds a deleted row on purpose, because Undo import also goes through Recently deleted; guarded by `tests/database-integrity-sql.mjs`. |
| DB-013 | R1 | Foreign keys are indexed on the child side | Every `references public.finance_records(id)` (and other parents) vs indexes whose first column is the FK | An index per FK column, partial `where col is not null` when optional. Found 2026-10-09: `finance_records.account_id`, `custom_category_id`, `payment_occurrences.record_id`/`transaction_id`, `account_activity`, `asset_movements`, `savings_goals`, `investment_account_links`, `goal_events` — every record delete scans those tables across all owners `[cr 2026-10-09]` Fixed 2026-10-09: indexes in migration 124, plus the user_id-first ones for account_reconciliations, corporate_events, expense_plans and telegram_login_tokens. |
| DB-014 | R1 | Every reference to a category is a checked key | Tables storing a category as text (`budget_amounts.category_key`, `budget_categories.category_key`, `workspace_preferences` watchlists) vs `delete_transaction_category` (051) and `delete_built_in_category` (122) | Deleting or merging a category moves or removes every row that names it, in the same transaction; no budget amount, rollover fund or setting is left under a key no category has. Found: both delete functions move transactions and splits but never touch the budget tables, so a merged category's budget silently disappears and the replacement gets none [cr 2026-10-09]. Fixed 2026-10-09 by migration 127 (`merge_budget_category`), guarded by `tests/category-delete-budget-sql.mjs` |
| DB-015 | R1 | One item, one id | Concepts stored twice: `income_sources` row plus its `schedule_id` copy in `finance_records`; `expense_plans` (fixed `category` list) beside budget categories | Each real-world item has one id that every screen and link uses. Found: payments name an income either by `earning_source_id` (the source) or `occurrence_record_id`/`income_source_id` (its schedule copy); spending plans use their own four-value category list unrelated to transaction and budget categories, and Budget never shows them [cr 2026-10-09]. Spending plans fixed 2026-10-09: migration 131 turns each plan into a Budget category with its amounts and moves its spending there (`tests/spending-plans-to-budget-sql.mjs`); the income source/schedule double id is still open |

## MIG — migrations

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| MIG-001 | R1 | Naming and order | `ls migrations` | `NNN_snake_case.sql`, next free number, no gaps or duplicates, no date prefixes, no other migrations folder |
| MIG-002 | R1 | Re-runnable | Each new migration | `if not exists`, `create or replace`, `drop ... if exists`; safe if applied twice |
| MIG-003 | R1 | Non-destructive by default | `drop column`, `drop table`, `update` without `where`, type narrowing | Data kept or migrated first; destructive steps called out to the user |
| MIG-004 | R1 | Locks on big tables | `alter table records ...`, new indexes | Long locks avoided (`create index concurrently` where possible, defaults without rewrite) |
| MIG-005 | R2 | A SQL test per migration | `tests/*-sql.mjs` | Each migration's functions and policies covered, including owner isolation |
| MIG-006 | R1 | Text-patching migrations are idempotent | `pg_temp.patch_*` / `replace(definition, old, new)` where `old` is a substring of `new` | The patch returns early when `new` is already present. Found 2026-10-09: re-running 118 makes `recategorize_transactions` fail (`multiple assignments to same column "name"`); 110 and 099 drift on re-run `[cr 2026-10-09]` Fixed 2026-10-09 for 118 and 110 (new text counted first); 099 left (its re-run is harmless); guarded by `tests/database-integrity-sql.mjs`. Production already ran 118 twice; migration 125 (DR session) repairs it. |
| MIG-007 | R1 | The app detects a missing migration it depends on | `requiredSchemaVersion` in `lib/database-capabilities.ts` vs `schema_capabilities()` | Each migration the code needs bumps the version, so a missing one shows `databaseUpdateMessage`. Found 2026-10-09: the gate stops at 67, so missing 102–123 surface as "Check the record fields." `[cr 2026-10-09]` Fixed 2026-10-09: capabilities report 124 and the app requires it; `tests/database-integrity-sql.mjs` fails when the newest migration number and `requiredSchemaVersion` differ. |
| MIG-008 | R2 | No one-off data fixes or personal data in migrations | Migrations naming specific rows by name | Migrations replay on any database; one-off fixes stay out of the repo. Found 2026-10-09: 033 hard-codes four named plans (incl. a family member's name) and aborts elsewhere `[cr 2026-10-09]` Fixed 2026-10-09: 033 is a commented no-op (the names remain in git history). |

## API — route conventions

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| API-001 | R1 | Bodies parsed with zod | Every `req.json()` | `readJson` + a schema (`parseAction` for action unions); validators from `lib/api-validation.ts` (`uuid`, `isoDate`, `fiatCurrency`, `nonnegativeAmount`) |
| API-002 | R1 | Abuse limits on sensitive routes | Sign-in, code sending, phone, account access, assistant, import, market lookups | `rateLimited` from `lib/rate-limit.ts` with per-IP and per-key limits |
| API-003 | R1 | Paged reads are complete | Reads of lists that can exceed one page | `readAllPages` / `readOwnerRows`; no silent truncation at 1000 rows |
| API-004 | R1 | Every outbound fetch has a timeout | `grep -rn "fetch(" lib app` | `AbortSignal.timeout(...)` or a wrapper that sets one (`supa`, `serviceDatabase` do) |
| API-005 | R1 | Status codes mean what they say | Handlers | 400 invalid input, 401 no session, 403 forbidden/cross-site, 409 conflict, 429 limit, 503 upstream; not 200 with an error body |
| API-006 | R2 | Client requests share one helper | `grep -rn "fetch('/api" components hooks` | `requestJson` from `lib/api-client.ts`; owner resources via `useOwnerResource` |

## MONEY — financial correctness

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| MONEY-001 | R0 | Never add amounts of different currencies | Every `reduce`/sum over amounts | Converted first with `convertMoney` / `amountIn`; a missing rate makes the amount missing, never summed raw |
| MONEY-002 | R0 | Rates are explicit and positive | Conversion call sites | No inferred, defaulted (`?? 1`) or inverted-by-guess rates |
| MONEY-003 | R0 | Stored values keep their precision | Save paths (`lib/record-save.ts`, RPC payloads) | Rounding only at display; no `Math.round`, `toFixed` or formatted strings stored |
| MONEY-004 | R1 | Float accumulation controlled | Long sums, interest, forecasts | `lib/decimal-amounts.ts` or minor-unit math where tails matter; displayed results whole (AGENTS.md formatting) |
| MONEY-005 | R1 | "Today" and month maths use the calendar helpers | `grep -rn "new Date().toISOString()"` and manual month arithmetic | `depositToday()`, `shiftDay`, `shiftMonth`, `monthEnd` from `lib/calendar-days.ts`; date-only values never shift by timezone |
| MONEY-006 | R1 | Display formatting through `lib/format.ts` | `tests/formatting-rules.mjs` plus a grep for `Intl.`, `toLocaleString` | No inline formatters on any surface |
| MONEY-007 | R1 | Auto-filled amounts round up to meet targets | Goal contribution suggestions | Whole amounts, rounded up when needed (AGENTS.md) |
| MONEY-008 | R1 | Every screen shows amounts in the display currency | Components formatting with a record's own `currency` (`formatMoney(x, row.currency)`) or filtering `record.currency === other.currency` | `useDisplayMoney` / `amountIn`, "—" plus "Exchange rate unavailable" without a rate, and `missing` counts surfaced. Found 2026-10-09: cash forecast rows and series, spending watchlists, Budget (`?? 0` on unconvertible goals and budgets) `[cr 2026-10-09]` Fixed 2026-10-09 for Budget, cash forecast, watchlists and income cards; guarded by `tests/budget.mjs`, `tests/cash-forecast.mjs`, `tests/planning-roadmap.mjs`, `tests/monthly-income-cards.mjs`. |

## DRY — duplicated rules

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| DRY-001 | R1 | One implementation per financial rule | Search for a second copy of totals, balances, spending, schedule matching (`laterPayments`, `paymentSchedules`, `chooseSchedule`) | Callers reuse the `lib/` function; a second rule is a finding even if it agrees today |
| DRY-002 | R1 | Schemas defined once | Zod schemas for the same payload in route and client | Shared from `lib/*-schemas.ts` |
| DRY-003 | R2 | No copy-pasted components | Similar JSX blocks across screens | A `presentation-foundation` member once it has two real callers |
| DRY-004 | R2 | SQL logic not duplicated in TS | The same rule computed in a SQL function and in TS | One source of truth, or a parity test (`tests/planning-read-parity.mjs` style) |
| DRY-005 | R2 | Constants and catalogues defined once | Currencies, languages, categories, limits | `lib/currencies.ts`, `lib/languages.ts`, `lib/category-*.ts`; no hard-coded lists |

## SOLID — module design

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| SOLID-001 | R1 | Single responsibility | Files near 24 KB, functions near 150 lines, entries in `eslint-suppressions.json` | Business rules in `lib/`, I/O in routes/hooks, rendering in components; a file doing two of these is a finding |
| SOLID-002 | R1 | Calculations are pure and testable | `lib/` modules importing `fetch`, cookies, React or `process.env` alongside calculations | Pure functions take data and return data; I/O is injected (as `serviceDatabase(env, fetcher)` does) |
| SOLID-003 | R2 | Open for extension | `switch`/`if` chains on record kind, asset kind, language repeated across files | A table or map in one module (`lib/record-kind.ts` style) so a new kind is one edit |
| SOLID-004 | R2 | Narrow interfaces | Components taking whole workspace objects to read one field | Props carry what is used; presentation members never take workspace state |
| SOLID-005 | R2 | Depend on abstractions at I/O edges | Modules that call `supa` directly deep in logic | Dependencies passed in (`Deps` objects as in `lib/notify-action.ts`) so tests substitute them |

## ARCH — boundaries

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| ARCH-001 | R1 | Workspace structure holds | `node --test tests/workspace-structure.mjs` and imports of screens | Screens never import the drawer, shell, sidebar kit or another screen; drawer reads no workspace state |
| ARCH-002 | R1 | Presentation foundation is pure | `tests/presentation-foundation.mjs` | Members read only `useLanguage()` and `lib/format`; no data hooks or network |
| ARCH-003 | R1 | Server and client code separated | `"use client"` files importing server modules (`lib/supabase.ts`, `lib/service-role.ts`, `next/headers`) | No server-only module in a client bundle; mark server modules `server-only` where possible |
| ARCH-004 | R1 | Access decided in the database | App-side permission checks standing in for RLS | The app may hide UI, but every rule is enforced by policies/functions |
| ARCH-005 | R2 | Screen-local state stays local | State in `WorkspaceProvider` used by one screen | Lives in that screen |

## RES — resource leaks

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| RES-001 | R1 | Effects clean up | `useEffect` with `setInterval`, `setTimeout`, `addEventListener`, observers, subscriptions | A cleanup that clears/removes/disconnects each one |
| RES-002 | R1 | Stale requests cancelled | Effects that fetch on changing inputs | `AbortController` aborted in cleanup, or a guard so an old response cannot overwrite a newer one |
| RES-003 | R1 | No unbounded in-memory caches on the server | Module-level `Map`/arrays in `lib/` used by routes | Bounded size or TTL; no per-user data cached across requests in a shared worker |
| RES-004 | R2 | Object URLs and readers released | `URL.createObjectURL`, `FileReader`, streams in import/export | `revokeObjectURL` after use; streams closed on error |

## CONC — concurrency and idempotency

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| CONC-001 | R0 | Balance changes are atomic | Read balance → compute → write sequences in TS | One SQL function or statement; no lost update when two saves race |
| CONC-002 | R1 | Retries and double clicks are idempotent | Save buttons, Telegram callbacks, imports, webhook redelivery | Disabled while pending, plus a database uniqueness rule or idempotency key; Telegram `update_id` handled once |
| CONC-003 | R1 | Cron jobs are safe to overlap | `app/api/cron/**` | A run marker or unique row per period so a retried cron does not send twice |
| CONC-004 | R2 | Optimistic UI reconciles | `components/workspace/state/` saving hooks | Rolls back or refetches on failure; no stale totals after an error |
| CONC-005 | R1 | Whole-row saves cannot undo concurrent changes | Upserts that write every column from a form (`planning_action` goal branch, settings-like rows) | A revision check like `save_finance_record`, or the row keeps fields the form did not edit. Found 2026-10-09: saving a goal's plan writes back a stale `allocated` and logs a −50 adjustment over another tab's contribution `[cr 2026-10-09]` Fixed 2026-10-09 in migration 128 (`expected_allocated`); guarded by `tests/review-integrity-sql.mjs`. |
| CONC-006 | R1 | Bot writes survive Telegram redelivery | Bot steps that save before a later step can throw (webhook answers 503, Telegram resends) | The id of anything saved comes from the stored draft, or the draft advances before the write. Found 2026-10-09: onboarding's balance step saves a fresh-id cash account, then a failed PATCH makes the resend save a second one (`lib/telegram-bot/onboard.ts`) `[cr 2026-10-09]` Fixed 2026-10-09: the account id is chosen once and kept in the draft; contact redelivery resumes setup; guarded by `tests/telegram-registration.mjs`. |

## ERR — error handling

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| ERR-001 | R1 | Errors are not swallowed on write paths | `.catch(() => null)` and empty `catch {}` around writes | Writes surface failure to the caller; swallowing is allowed only for best-effort side effects, with a comment |
| ERR-002 | R1 | Partial failures are visible | Multi-step saves and imports | Either all-or-nothing in one transaction or a reported partial result |
| ERR-003 | R2 | Failed loads show `InlineError` / `ResourceState` | Data hooks | No silent empty lists on a failed read |
| ERR-004 | R1 | Stored files go with their rows | Storage `remove` paired with row deletes (attachments, account deletion, bin purge) | File removed first or failure aborts; never `.catch(() => null)` on removal. Found 2026-10-09: account deletion, purge and attachment delete leave receipt files in the bucket (privacy policy promises deletion) `[cr 2026-10-09]` Fixed 2026-10-09 for account deletion and attachment delete (file first, 503 on failure); bin purge removes files before forgetting their rows (migration 130), so a failed removal is retried by the next purge; guarded by `tests/api-route-hardening.mjs`. |

## PERF — performance

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PERF-001 | R1 | No N+1 requests | Loops calling `supa`/`fetch` per row | One query with `in.(...)`, an embed, or an RPC |
| PERF-002 | R1 | Reads are bounded | Endpoints reading all history on every load | Date-bounded or paged reads; summaries computed in SQL |
| PERF-003 | R2 | Heavy client code is split | Recharts, pdf-lib, xlsx/zip parsers in initial bundles | Dynamic import where used on demand |
| PERF-004 | R2 | Renders are not quadratic | `find`/`filter` inside `map` over records | Index by id in a `Map` first |
| PERF-005 | R1 | Cron and webhook work is bounded | Cron routes and bot turns that read every row of every owner, loop owners serially, or rebuild arrays per row | Narrow filters and columns, id-keyset paging, batched writes, bounded concurrency, finishing well inside `maxDuration`. Found 2026-10-09: portfolio-snapshots, digest, recap and every bot turn read full histories `[cr 2026-10-09]` Fixed 2026-10-09: bounded reads, id paging and 8-at-a-time owners in the snapshot, digest and recap crons and the bot (`lib/bounded-concurrency.ts`); guarded by `tests/telegram-digest.mjs`, `tests/telegram-engagement.mjs`, `tests/telegram-bot.mjs`. |

## DEP — dependencies and supply chain

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| DEP-001 | R1 | Known vulnerabilities | `npm audit --omit=dev` (read-only) | No high/critical in runtime dependencies, or a note why not exploitable |
| DEP-002 | R1 | CI does not leak secrets | `.github/workflows/*.yml` | No secrets on `pull_request_target`, actions pinned, least `permissions:` |
| DEP-003 | R2 | No unused or duplicate dependencies | `package.json` vs imports | Unused packages removed (memory `remove-unused-code`) |

## BOT — Telegram bot

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| BOT-001 | R1 | Typed amounts parsed once | Amount parsing in flows | `parseTypedAmount`; no `parseFloat` on user text |
| BOT-002 | R1 | Messages built with the kit and formatters | `lib/telegram-kit.ts` usage | `messageKit`, `keyboardRows`, `backButton`; amounts and dates via `lib/format.ts`; text escaped for the parse mode |
| BOT-003 | R1 | Callback data is not trusted | Callback handlers reading ids from `callback_data` | Ids re-checked against the linked owner before any write |

## TEST — regression coverage

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TEST-001 | R1 | Bug fixes carry a regression test | `git log` of fix commits vs `tests/` changes | Each fix adds a behavioural test, including the failure path |
| TEST-002 | R1 | Owner isolation tested for new tables and functions | `tests/*-sql.mjs` | A second owner cannot read or write; a viewer cannot write |
| TEST-003 | R2 | Coverage floor holds | `npm run test:coverage` | ≥ 95% lines; `scripts/coverage-floor.json` untested list only shrinks |
| TEST-004 | R2 | Tests assert behaviour, not source text | Tests that `readFileSync` a source file and regex it | Prefer calling the function; source-text tests only for structural rules |
