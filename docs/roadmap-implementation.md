> Current follow-up: [record reliability and verified restoration](reliability-and-restore.md) adds migrations 058–059, conflict protection, edit history, and a verified backup restore flow. The historical notes below describe the earlier release.

# Web roadmap implementation status

Updated 18 September 2026. This tracks implementation against the [competitive research](competitive-feature-research.md). **Working-tree implementation is not deployment. The full roadmap is not finished, and unrestricted public launch is not yet recommended.**

## Implemented in this batch

| Workflow | What is available | Important limits |
| --- | --- | --- |
| Shared goal funding | One monthly surplus, explicit monetary budgets, priorities, combined shortfall, remaining funds, pause-through date, one-time/refill policies | Opt-in commitments only; overlapping wealth goals must not be funded twice. Missing FX/budgets block a complete plan. No automatic bank movements. |
| Goal activity | Contributions, withdrawals, same-account reservation transfers, optional income links, immutable dated events, idempotent requests, opening/adjustment events, savings completion marker | Reservations do not move cash. History begins with migration/opening events; earlier dates are unknown. Source links describe funding provenance, not a live recalculation when a source record changes. Event balances are balances at write time, not reconstructed historical daily balances. |
| Goal scenarios | Saved alternatives with monthly contribution, return, target date, inflation and one missed contribution month | Cash/net-worth goals only. Existing wealth stays constant; only new contributions compound. Assumptions are not forecasts or promised returns. |
| Debt payoff | Avalanche/snowball, explicit minimums, extra payments, repayment period, interest and comparison with no extra payments | One original currency per saved plan. Monthly fixed rates, fixed payment budget, no fees/new borrowing/rate changes. Non-amortizing plans show no payoff within the 50-year horizon. |
| Portfolio performance | Money-weighted annualized estimate, daily time-weighted estimate and maximum drawdown estimate alongside the original benchmark | Non-conventional XIRR signs fail closed. Daily valuations and end-of-period flow assumptions cannot produce exact intraday TWR. Opening observations remain disclosed. Reinvestment/internal transfer classification is not a complete dividend/corporate-action engine. |
| Allocation | Saved asset-class target weights, actual weights, drift and contribution-only allocation | Whole portfolio assets, including manual values; fallback recorded prices are disclosed. Missing FX blocks results. No trades, tax-lot selection, sector/region or ETF look-through. |
| Spending review | Saved merchant/category/currency targets, actual split-aware month spending, remaining limit and pace projection | Overlapping lists are independent. In-app views only, not email/push alerts. |
| Recurring review | Repeated monthly/yearly transaction suggestions, amount-change notices, duplicate-suspicion groups | At least three regularly spaced actual transactions; no automatic schedules/payments. Existing plans and protected operation rows are excluded. Identical legitimate purchases remain possible. |
| Import workflow | Saved column/date/decimal/delimiter mappings, optional stable source IDs, import batches, replay protection and atomic undo | Edited or goal-linked rows block whole-batch undo. Removing imported income can also fail if it would overdraw cash; the entire undo rolls back. Identical purchases in overlapping files without source IDs remain ambiguous. No transfer/refund matching, OFX/QFX or pending-to-posted matching yet. |
| Account lifecycle | Optional signup, explicit email-link confirmation, recovery/reset, current-password verification for password changes and deletion | Signup defaults disabled. Requires canonical origin, correct Supabase email templates/redirects, real delivery and configured provider admission. Deletion requires server-only admin credentials and migration 039. Google-only users can first set a password through recovery. |
| Installable web shell | Manifest/icons and a network-only financial workspace with an offline explanation | Financial pages/API responses are never cached by the service worker. No offline balances or writes. Installation/device behavior still needs browser verification. |
| Reliability | Server-fetched snapshot prices, request timeouts, response hardening headers, owner-scoped saved preferences and backups | CSP is report-only and no reporting destination is configured. This is not an enforced CSP or operational monitoring. |

Existing shared numeric/date controls, category/currency helpers, owner reads, goal calculations and transaction operations are reused. New financial calculations live outside components. `AGENTS.md` contains the requested DRY and regression-coverage policy.

## Bugs fixed during this batch

- Password changes and account deletion now clear the persistent workspace state before navigation. Logout also discards goal/preferences and portfolio-history caches, including a later login with the same email identifier. Unsaved financial dialogs are cleared as well.
- Snapshot POST no longer accepts browser-supplied market prices as authoritative. It derives instruments from owner-scoped database holdings and fetches server quotes before computing the snapshot.
- Deleting an auth user previously could fail as cashflow triggers tried to update already-deleted accounts, or immutable payment guards blocked cascading child deletion. Migration 039 allows cleanup **only when the referenced auth owner no longer exists**. Ordinary edits/deletes retain their guards. Tests delete owners with linked imports, goals, transfers, mortgage operations and investment activity.
- The remaining production dependency advisory was fixed by updating `baseline-browser-mapping` from 2.10.30 to 2.11.25. The production audit returned zero vulnerabilities after the update; that is not a security certification.
- Auth email redirects use validated `APP_ORIGIN`, not a request Host header. Email-link verification requires an explicit POST, reducing accidental consumption by link scanners.

## Incremental migrations

Apply only migrations missing from the target database, in this order after 034:

1. `035_transaction_tools.sql` — categorization, splits, forecast assignments and backup integration (previous batch).
2. `036_goal_funding_and_activity.sql` — funding policies, goal events, operation replay protection and backup integration.
3. `037_workspace_preferences.sql` — owner-scoped allocation, watchlist, import, debt and scenario settings.
4. `038_import_review.sql` — statement provenance, changed-source conflict detection, atomic undo and backup integration.
5. `039_account_deletion.sql` — auth-user cascade support while keeping ordinary financial guards.
6. `040_goal_display_order.sql` — saved goal-card order using the existing owner-scoped preferences table. Display order does not change funding priority.

Fresh setup contains the same SQL blocks in the same order. Migration 039 modifies only the named, existing security-definer trigger functions and refuses an unexpected definition. It does not delete any accounts itself. These migrations are transactional but not intended to be rerun. Back up first and record successful applications in the deployment ledger. Never run fresh setup over an existing database; migration 033 remains an installation-specific repair.

**Live application is blocked:** local configuration identifies project `hnwxybhsvnutcsqwscul`, but the signed-in Supabase dashboard account cannot access it. No live SQL, auth configuration, domain change or deployment occurred. Switch the dashboard to the account with access or provide an approved administrative connection before applying these migrations.

## Authentication setup

Set server-side values:

- `APP_ORIGIN=https://your-canonical-domain.example` with no path/query/credentials. Recovery and signup refuse to send links until it is configured.
- `PUBLIC_SIGNUP_ENABLED=false` initially; change to `true` only after the admission policy and provider configuration are verified.
- Existing `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` only on the server if account deletion/background capture is enabled.

Configure Supabase Site URL to the canonical origin and redirect allowlists for `/auth/callback` and `/auth/confirm`. This app uses a server-readable token hash, not an access token in a URL fragment. Configure the confirm-signup email link as:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm email</a>
```

Configure the password-recovery email link as:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

The confirmation page performs verification only after the user presses its button. Recovery stores a short-lived HttpOnly cookie scoped to the password-reset API and does not sign the user into the finance workspace. Check expired/replayed links, real email delivery, current-password checks and deletion in staging. Keep Supabase email confirmation enabled. Hiding application signup does **not** enforce invitation-only admission at the provider: verify Supabase public signup and Google new-user settings separately.

Official references: [Supabase SSR email confirmation](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [password changes](https://supabase.com/docs/reference/javascript/auth-updateuser).

## Remaining roadmap — not implemented

| Work | Required next step |
| --- | --- |
| Dated statement reconciliation and cleared/pending/reconciled states | Build an account ledger covering cashflow, transfer, investment, mortgage and correction legs; invalidate reconciliations when relevant history changes. The existing balance correction is not statement reconciliation. |
| Available-to-spend | Integrate reconciled balances, account-specific obligations, budgets and goal reserves without subtracting the same commitment twice. Current forecasts are not a verified spending allowance. |
| Complete backup restore | Versioned preview, owner-bound relationship validation, explicit restore semantics, atomic application and a disaster-recovery exercise. JSON export alone is not recovery. |
| Import matching and bulk review | Transfer/refund matching, pending-to-posted replacement, bulk categories and additional statement formats. |
| Dividends, reinvestment and corporate actions | Gross/net/withholding/payment dates, reinvestment links, splits, cost-preserving security transfers and lot history. Existing income and average-cost operations are not a tax-lot engine. |
| Broader instruments and portfolio risk | Exchange/currency-qualified identity, provider coverage, investment watchlists, concentration/sector/region/ETF exposure and adequate history. |
| Recurring goal cadence and notifications | Weekly/yearly/custom reset targets; opt-in timezone-aware reminders, durable delivery/retry deduplication, summaries and threshold notifications. |
| Credit cards | Statement balances, due dates, minimums and purchase/payment liability accounting. Confirm target countries and workflows. |
| Bank/broker synchronization | Intended countries/institutions, production provider access, consent, reconnect/sync status and provider transaction identities. No bank credentials or new paid providers have been configured. |
| Household workspaces | Decide whether all data or only explicitly selected accounts are shared; add roles, invitations/revocation, ownership migration and cross-workspace isolation tests. Current data remains private per owner. |
| Operational launch | Durable abuse limits, error monitoring/alerts, backup recovery, canonical domain, legal/support information, real provider tests and accessible phone/browser verification. |
| Native apps / richer offline use | Follow stable public-web workflows. The PWA shell is not a native app or offline finance editor. |

Signup policy, launch countries/banks/brokers and household visibility were requested from the user and remain unanswered. These choices and production access are still open. No external messages were sent, accounts registered, trades executed or paid services purchased.

## Verification

The completed regression run has **234 passing tests, zero failures and zero skips**. The production build, TypeScript and ESLint pass. The separate local OAuth HTTP integration has **1 passing test**. The production dependency audit reports **zero vulnerabilities** after the patch. Automated coverage includes reference financial calculations, missing FX/history, malformed requests, account recovery, owner isolation, operation replay, SQL incremental upgrades, import undo rollback, account deletion and service-worker cache boundaries. Run:

```sh
npm test
npm run build:production
npm run typecheck
npm run lint
npm run test:integration
```

The HTTP integration uses a local Supabase stub; it cannot prove production email/OAuth behavior. No browser debugging or visual mobile audit was performed in this batch, respecting the project preference.
