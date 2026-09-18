# Public web launch audit

Reviewed 18 September 2026. Scope: repository, SQL executed in isolated PGlite databases, regression tests, production build, and production dependency audit. This is a code audit, not a penetration test or a visual browser audit. Live Supabase configuration, deployed response headers, OAuth provider settings, email delivery, DNS, and operational backups have not been verified.

**Follow-up:** [the implementation ledger](roadmap-implementation.md) records the new features, migrations 036–039, account-deletion and snapshot fixes, auth configuration requirements, and remaining launch work. None of these migrations has been applied live.

**Recommendation:** finish the release gates below before unrestricted registration. Use a controlled beta to validate real workflows. The product already has enough functionality for a useful first web release; reliable money records and recovery matter more than adding many unrelated features.

## Fixed during this audit

- **Existing transactions could be silently categorized on edit.** PostgreSQL runs `BEFORE INSERT` triggers during `INSERT ... ON CONFLICT` saves. Migration 035's classifier originally treated those edits as new transactions. It now checks for an existing owner/record pair before applying rules. A regression test creates an uncategorized transaction, adds a matching rule, edits the old transaction through an upsert, and verifies its category stays unchanged. New transactions still receive matching categories.
- **An exported expense could be imported as income.** A raw records CSV stores positive expense amounts and includes assets, schedules, and multiple currencies. The bank importer interprets positive amounts as income in one selected account. Reproduced with a 42 USD expense. The importer now rejects the app's records-export format, using the same column definition as the exporter. The link says “Export records as CSV,” and EN/RU/UZ explain that restore is not available. This prevents the unsafe path; it does not implement backup restoration.
- **New tables lacked indexes beginning with the owner key.** Migration 035 now indexes owner/rule priority, owner/record splits, and owner/record forecast assignments. This supports their owner-filtered reads; no production performance improvement has been measured.
- **Installation instructions treated a personal repair as a universal migration.** README now identifies migration 033 as a one-off data correction for the original installation. It must be skipped elsewhere; it is not a schema prerequisite.
- **CI did not run lint.** Added the lint gate and corrected a test harness naming issue exposed by it.

DRY guidance is recorded in `AGENTS.md`. The CSV format definition is shared between export and import validation; financial behavior remains in shared helpers and database operations.

## Migration 035 status and deployment

The migration is implemented and tested locally, including upgrading the schema immediately preceding it. `database/setup.sql` contains the exact same SQL before subsequent migrations. **It has not been applied to the live Supabase project during this audit.** The local configuration supplies a publishable key, not administrative SQL access. After the user authorized proceeding, the target was verified against `.env` and `VERCEL.md`. The signed-in Supabase account redirected away from this project, and neither available organization listed it. Application is now waiting for the user to switch to the account with access; no live database was changed.

Apply `migrations/035_transaction_tools.sql` once after verifying schema migration 034 is installed. Do not run fresh setup over an existing database, and do not replay every numbered migration blindly. Migration 035 contains a transaction, creates three owner-protected tables, installs categorization/split/forecast functions, and extends backup and deleted-item restoration. It does not intentionally rewrite historical transaction categories or move money.

Before applying, use the existing database backup process and confirm the target project. This read-only query helps identify whether 035 is already present:

```sql
SELECT
  to_regclass('public.category_rules') AS rules,
  to_regclass('public.transaction_splits') AS splits,
  to_regclass('public.forecast_assignments') AS forecasts,
  to_regprocedure('public.export_finance_backup_before_transaction_tools()') AS backup_wrapper,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_records'
      AND column_name='account_exchange_rate'
  ) AS migration_034_column_present;
```

For an expected pre-035 database, the first four values are null and the last is true. This is a diagnostic, not a complete schema checksum. A mixed result needs inspection; the migration is not rerunnable/idempotent. After application, verify the three tables, RLS policies, owner indexes, `deleted_items.splits`, function permissions, and schema cache reload. Use a dedicated test account to check rule creation, new versus existing transaction classification, balanced splits, deletion/restoration, forecast assignment, and backup inclusion. Record the successful migration in a deployment ledger.

## Release gates

| Priority | Finding and evidence | Required outcome |
| --- | --- | --- |
| P1 | Account lifecycle code is now implemented with signup disabled by default. Canonical origin, token-hash email templates, email delivery, admission policy and real provider configuration remain unverified. | Choose public registration or invitation beta. Implement and test the chosen lifecycle, including expired/replayed links, error recovery, and account cleanup. |
| P1 | Invitation-only text is not an application access control. The Google callback accepts a valid Supabase session; it does not check an invitation. Actual Google signup behavior depends on unverified Supabase settings. | Verify server/provider enforcement of the chosen admission policy before exposing the site. Test with a previously unknown Google account in staging. |
| P1 | Complete JSON export exists, but there is no restore workflow or documented successful disaster-recovery exercise. The CSV safety guard above does not restore accounts, relationships, or history. | Add a versioned, validated restore preview with owner isolation, explicit merge/replace semantics, atomic writes, and a tested recovery runbook. Retain provider-level backups independently of downloads. |
| P1 | No application-level per-user/IP quotas are present on market/benchmark routes. `app/api/market/route.ts` caps symbols per request; crypto/FX reads are public, and stock quotes are authenticated. Many requests or many new ticker keys can still consume resources/provider quotas. | Add shared distributed throttling, provider-budget limits, bounded date ranges, predictable 429 responses, and monitoring. Test across multiple app instances; an in-memory counter alone is insufficient. |
| P1 | Snapshot POST now fetches quotes on the server using owner holdings. Browser-supplied prices, totals and dates are ignored. Effective quote timestamp persistence and stale-provider-observation handling still need deeper verification. | Source persisted valuations on the server and record effective quote timestamps. Test that a stale tab cannot replace a fresher daily observation. This is an owner-data integrity risk, not a demonstrated cross-user breach. |
| P1 | Operational readiness is unverified: production credentials, cron success alerts, backup retention/restore, email delivery, provider limits, and domain/OAuth configuration. No application error-monitoring integration is present. | Establish staging and production separation, structured error reporting without financial payloads/tokens, uptime checks, cron alerts, and an actionable recovery process. |
| P1 | Browser and accessibility release checks are outstanding. Component tests cannot prove phone layout, focus behavior, touch interactions, or real OAuth. | With browser permission, test desktop and phone flows in EN/RU/UZ, keyboard-only operation, zoom, long amounts, loading/error states, and real account recovery before general release. |

Supabase's production checklist also calls out RLS, security review, email configuration, authentication controls, backups, and load testing. These must be checked against the deployed project, not inferred from local SQL. [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## Reliability, security hardening, and scale

| Priority | Finding | Recommended change and verification |
| --- | --- | --- |
| P2 | Planning GET reads nine complete owner tables using `readOwnerRows`, which accumulates all 500-row pages. Workspace refreshes repeat these reads. History endpoints also return full history. | Use date-bounded queries, server aggregates, and lazy section loading. Preserve complete totals and explicit missing-data states. Benchmark large realistic accounts and concurrent users before selecting limits. |
| P2 | Daily cron loads every owner's entire `finance_records` history, groups it in memory, and writes snapshots sequentially within a 60-second function. | Filter to valuation-relevant holdings, process bounded owner batches with a durable cursor, and make retries/resumption observable. Test provider failures, partial batches, and execution deadlines. |
| P2 | `lib/supabase.ts` has no explicit upstream deadline. Auth refresh can also be attempted concurrently by independent requests. | Add a shared timeout and safe error mapping. Test refresh concurrency and expiry before choosing a coordination mechanism; a logout race has not been reproduced. Avoid blanket retries for non-idempotent writes. |
| P2 | `next.config.ts` now sets framing, content-type, referrer and permissions headers plus a report-only CSP. No CSP reporting destination is configured; actual deployed responses and an enforced policy remain unverified. | Verify actual responses, then introduce tested framing protection, content-type protection, referrer/permissions policies, and a CSP compatible with the app. Stage CSP in report-only mode first. |
| P2 | Generic mutation origin checks accept a missing Origin; Google initiation additionally checks Fetch Metadata. | Centralize the intended same-origin/content-type/Fetch Metadata policy and test it against legitimate clients. This is hardening; this audit did not demonstrate a CSRF exploit. |
| P2 | No app-level error boundary/recovery page was found. Fetch errors often have UI handling, but render failures can still leave generic framework errors. | Add localized route/global recovery, safe retry behavior, and privacy-conscious error identifiers connected to monitoring. |
| P2 | Import deduplication hashes account/date/name/amount plus an occurrence index; it does not use the bank's transaction identifier. | Support stable source IDs and a duplicate review queue. Test overlapping exports with distinct identical-value purchases. “Same file is skipped” does not prove every overlapping statement is safe. |
| P2 | The migration workflow has no deployment ledger/checksum gate, and installation-specific repair 033 lives beside schema migrations. README is clarified, but automation still needs explicit handling. | Track applied schema migrations and classify optional data repairs. Test fresh setup and incremental upgrades against a staged copy before deployment. |
| P2 | Production dependency audit found one moderate advisory in transitive `baseline-browser-mapping@2.10.30`; no high/critical advisories were reported by that audit. | Update to a compatible fixed version and rerun checks. This library participates in browser-target/build tooling; no request-to-exploit path was established here. |

The advisory identifies a process-termination issue on invalid inputs and lists version 2.11.0 as fixed. [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv). Dependency results are a point-in-time check of the production dependency graph, not proof that every dependency is safe.

## UI and UX priorities

The workspace changes already add scoped filters, mobile filter disclosure, partial-total labels, goal-chart sizing, retry states, unsaved-change prompts, and separate actual results from plans. Their presence and selected interactions are covered by code/component tests; visual layout has not been inspected in a browser.

1. **Finish the first-use journey.** Choose language and currencies, create the first account with a dated opening balance, add/import one transaction, then reconcile the resulting balance. Explain opening-balance timing before import. Keep optional investments and forecasts out of the required onboarding path.
2. **Make account admission honest.** Align invitation copy and Google behavior with the selected policy. Add recovery links and reachable support. Replace the login page's literal “USD & UZS” capability label with translated multi-currency wording.
3. **Validate the phone header.** It combines breadcrumbs, currency controls, quick expense, language, and theme controls. Test narrow screens and long translations for wrapping and touch targets; this is a layout risk to inspect, not a confirmed overflow.
4. **Review dense screens.** On a phone, put actual balance/spending and the next action before forecasts and detailed tables. Keep all precise information available in expandable sections and accessible tables.
5. **Make data freshness visible.** Distinguish saved transactions, current provider quotes, stale quotes, and historical valuations. Missing exchange rates must stay visibly excluded from totals.
6. **Complete accessibility checks.** Focus return after every dialog, Escape behavior, error announcements, chart table alternatives, reduced motion, high zoom, and light/dark contrast need end-to-end checks. Avoid relying on color alone for status.

## Features worth adding after release gates

| Order | Feature | Why it belongs next |
| --- | --- | --- |
| 1 | Extend the existing balance correction into dated statement reconciliation | Add cleared/reconciled transaction states and discrepancy review. A balance correction already exists; statement matching is the gap. |
| 2 | Saved bank-import mappings, stable source IDs, transfer/refund matching | Reduces repetitive work and prevents transfers from inflating income/expenses. Show proposed matches before applying. |
| 3 | In-app budget and upcoming-payment alerts | Builds on existing budgets and schedules. Email/push delivery should be opt-in, deduplicated, and timezone-aware. |
| 4 | Transaction search across history and saved filters | Helps users explain balances quickly. Back it with paginated, indexed server queries. |
| 5 | Restore preview and scheduled backup status | Makes the existing backup promise actionable. Test schema versions and owner-bound relationships. |
| 6 | Receipt attachments with storage quotas and owner policies | Useful for records, but needs explicit deletion behavior, size/type validation, and safe downloads. |
| 7 | Installable PWA with a clearly labeled read-only offline view | Gives phone users convenient access after web flows stabilize. Defer offline financial writes until idempotency and conflict handling are designed. |
| Later | Household sharing, bank connections, native apps | Each adds significant permissions, synchronization, or external-service complexity. Start these after the single-user web product is reliable. |

## Custom domain and web-first rollout

1. Choose the domain and add it to the existing Vercel project. Use the exact DNS records Vercel provides and choose one canonical apex/www address. Verify HTTPS and redirects. Vercel provisions SSL after successful DNS verification. [Vercel custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain).
2. Set Supabase Site URL to the canonical domain and allow the exact `/auth/callback` URL. Update Google origins as applicable; the provider callback remains the configured Supabase auth callback. Update recovery/verification redirect allowlists when those flows are implemented. Verify real email delivery and Google sign-in on the final domain.
3. Prepare public help, a support contact, privacy/data-retention information, export/deletion behavior, and terms that accurately describe the shipped service. Do not promise bank sync, verified returns, or working restore before they exist.
4. Apply verified schema migrations, deploy the compatible app, and run a dedicated-account smoke test. Confirm cron and provider configuration on the production deployment without exposing service credentials to client code.
5. Invite a small beta, observe recovery failures, balance discrepancies and latency, then open registration after the release gates pass. Add PWA installation next; native apps can reuse the stable account and finance contracts later.

## Verification record and limits

- Follow-up regression suite: 234 tests pass, including SQL upgrades, owner isolation, account lifecycle, goal funding/activity, import undo, financial calculations and cache boundaries.
- Production build: passes.
- TypeScript and ESLint: pass after the final code changes.
- OAuth HTTP integration: one test passes against an isolated localhost Supabase stub and the production build. This does not verify the live Google provider.
- Initial local schema inspection: all 21 public application tables present at the first audit had RLS enabled. Subsequent migrations add owner-protected tables with separate SQL coverage. This does not verify the deployed database or prove every possible policy path.
- Follow-up production dependency audit: zero reported vulnerabilities after patching `baseline-browser-mapping` to 2.11.25.
- Real browser/mobile testing, live migration application, production OAuth, production RLS/security advisor, email, DNS, monitoring and backup restore remain unverified.

No cross-user data leak was demonstrated in the reviewed/tested paths. That is a limited observation, not a security certification.
