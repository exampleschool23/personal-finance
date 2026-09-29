# Design review and presentation foundation (September 2026)

A full pass over `components/`, `app/globals.css` and the tests, asking two questions:
where is the same UI written by hand more than once, and where does a page style
itself instead of extending the shared language in `AGENTS.md`. The first outcome is
the `components/presentation-foundation/` module; the rest is listed below as done or
as follow-up.

## The presentation-foundation module

`components/presentation-foundation/` holds the pure UI vocabulary of the workspace.
A member takes props and renders markup. It may read `useLanguage()` and the
`lib/format` helpers, but never workspace state, data hooks, screens or the network.
`index.ts` is the table of contents; callers import by file so a test can substitute
one piece at a time. `tests/presentation-foundation.mjs` enforces the boundary and
renders every new piece.

Moved in unchanged (paths only): `page-header`, `stat-tile`, `asset-card`, `brand`,
`category-badge`, `asset-icon`, `record-icon`, `loading-placeholder`, `drawer-link`,
`error-popup`, `partial-total`, `currency-value`, `currency-select`,
`formatted-number-input`, `date-picker`, `amount-currency-fields`, `schedule-fields`,
`exchange-rate-preview` (now typed structurally instead of importing the hook's type).

New, extracted from repeated inline markup:

| Piece | Replaces | Call sites converted |
| --- | --- | --- |
| `EmptyState` | `.empty`, `.asset-empty`, `.import-history-empty` blocks | 9 |
| `InlineError` | `<p role="alert" class="error">… <Button>Retry</Button>` | ~24 |
| `ResourceState` | loading → error → content chains in tools panels | 12 |
| `Segmented` | `.segmented`, `.overview-segments`, `.goal-view-switch` button groups | 6 |
| `PanelTitle` + `Count` | `.panel-title` heading rows and `.count` pills | 11 + 8 |
| `ConfirmDialog` | AlertDialog confirm shells | 8 |
| `FormFooter` | `.record-form-footer` Cancel rows | 15 |
| `signTone` | inline `x >= 0 ? 'positive' : 'negative'` tone logic | 7 |
| `formatPercent` (in `lib/format.ts`) | `formatNumber(v, locale, n) + '%'` | 12 |

Stylesheet: the one-off copies of `.segmented` (`.overview-segments`,
`.goal-view-switch`), of `.empty` (`.asset-empty`, `.import-history-empty`) and the
unused `.portfolio-ranges` rules are gone, as are three dead blocks
(`.money-location*`/`.money-category*`, `.setup-checklist*`/`.setup-step*`, and the
`.daily-*` rules except `.daily-ledger`). `globals.css` is 89 lines shorter.

Behaviour kept: every translation key, aria attribute, busy state and business
calculation is unchanged. Two deliberate visual unifications: Retry buttons now all use
the default `Button` (a few were `outline`), and the Overview history ranges are plain
`.segmented` buttons instead of ghost `Button`s. The top bar no longer special-cases
`USD` as `$ USD`, which `AGENTS.md` forbids.

Verification: `npm run typecheck`, `npm run lint`, `npm run build:production` clean;
`npm test` 582/583, the one failure being the pre-existing compact-money assertion in
`tests/format.mjs` that depends on the Node ICU build (`$4.0M` vs `$4M`). Demo
workspace pages were rendered in Chromium with no console errors.

## Findings not yet applied

Ordered by value. Line numbers refer to `app/globals.css` after this change.

### Components

1. **Panels with a bare `<h2>` instead of `PanelTitle`** (about 18): the tools panels
   in `debt-payoff-panel`, `goal-scenarios`, `portfolio-allocation-plan`, `data-tools`,
   `transaction-tools-panel`, `financial-review`, `transaction-insights`,
   `spending-watchlists`, `import-history`, `account-access-panel`,
   `investment-comparison-settings`, plus `loans-debts-screen` and `accounts-page`.
   `settings-panel` has three copies of a `preferences-card` header worth a local
   `PreferencesCard`.
2. **Fact rows written as `<div><span/><strong/></div>`** in `goal-forecast`,
   `investment-tracker`, `income-history-chart`, `asset-dashboard`, `goals-page` and
   `sign-in-screen`, next to real `<dl>` lists in `accounts-page`, `goals-page`,
   `investment-goal-plan`, `asset-accounts` and `transaction-details-dialog` (which uses
   Tailwind utilities). A `FactList({items:[{label,value,tone}]})` would cover all of
   them; `CurrencyValue` is a single-use version of it.
3. **The allocation list** in `overview-page` and `asset-dashboard` is the same
   `<li><i/><span/><strong/><small/></li>` row twice; extract `AllocationList`.
4. **Toggleable chart legends** in `income-history-chart`, `goal-forecast` and
   `investment-comparison` share the same hide/show logic; extract `LegendToggle`.
5. **Repeated form fields**: the "Notes (optional)" textarea (9 copies, two of them
   `<Input>` instead of a textarea), "End date (optional)" (6), "Cash account" select
   written inline in 6 places although `CashAccountField` exists, "Category" select (9).
   Help text under fields uses five different classes (`muted tracker-help`, `goal-help`,
   `goal-funding-help`, `expense-plan-hint`, `instrument-help`).
6. **Text-only empty messages** (about 16, e.g. "No accounts yet.", "No history yet.")
   that should be `EmptyState` with an icon, and two duplicated empty-state sentences
   between `expense-plans`/`cashflow-preview` and `cashflow-preview`/
   `estimated-income-sources`.
7. **Signed amounts** (`+`/`−` prefix with a tone class) are built by hand in
   `records-table`, `transaction-details-dialog`, `overview-page` and
   `portfolio-overview`; a `SignedAmount` piece would remove four copies.
8. **Date arithmetic in components**: "add N days" in `upcoming-page` and
   `reminder-panel`, ISO slicing in `goal-forecast` and `investment-goal-plan`, month
   keys (`today.slice(0,7)`) in six files. These belong in the calendar helpers next to
   `parseCalendarDate`/`calendarIso`.
9. **`goals-page` dialog footer** keeps its hand-written footer because its Delete
   button precedes Cancel; give `.goal-delete` a `margin-right:auto` and convert it.
10. **`delete-category-dialog`** stays on raw `AlertDialog` because its confirm button is
    disabled by validity, not only by busy; `ConfirmDialog` would need a `disabled` prop.
11. **Account cards** in `accounts-page` (balances card and investment card) are two
    near-identical `<article className="panel account-card">` blocks.
12. **Loading text** still appears inline in about 8 places (`<p>{t('Loading records…')}</p>`
    without `role="status"`) where `ResourceState` did not fit because error and loading
    are rendered independently.

### Stylesheet

1. **Selectors defined more than once** (the rules forbid later overrides). The largest
   groups: the date picker block (~317–340, the first flex layout is dead), the
   investment goal plan (~1180–1200 redone at ~1245–1265), settings navigation
   (~1370–1405 redone at ~1690–1730, and its breakpoint written three times at
   `@media 800`, `@media 760` and `@container 900`), `.record-dialog`,
   `.goal-chart-canvas`, `.import-preview`, `.portfolio-editor-dialog` (conflicting
   `scrollbar-gutter`), `.income-source-results button:hover` (conflicting backgrounds).
2. **Dark theme tokens**: the dark `:root` never sets `--sidebar-primary`,
   `--sidebar-primary-foreground`, `--sidebar-ring` or `--chart-1..5`, so dark mode
   inherits the neutral shadcn values (`--sidebar-ring:#a1a1a1`) used by
   `ui/sidebar.tsx` and `goal-forecast`.
3. **Literal values where a token exists**: `.mark` hard-codes the primary colour;
   `.goal-insight-attention` and `.preferences-status-dot.is-dirty` hard-code amber
   instead of `--caution`; `--hairline` is spelled out three times; `--destructive` is
   used where `--negative` is the tone; ~20 `10px` radii should be
   `--radius-control`; card surfaces use 14/16/18/24px radii instead of `--radius-card`;
   ~25 pixel font sizes equal a `--type-*` token.
4. **Viewport `@media` for in-page layout** in ~30 places that should be
   `@container content`, and record-like tables that do not stack below 720px:
   `expense-plans`, `cashflow-preview`, `account-activity`,
   `monthly-mortgage-payments`, `portfolio-allocation-plan`, `import-preview`,
   `comparison-table`, `goal-milestones`, `daily-ledger`.
5. **Outer margins on page sections** (`.market-bar`, `.portfolio-trend`,
   `.comparison-settings`, `.income-history-chart`, `.planning-cards`, `.goal-cards`,
   `.investment-goal-fields`, `.diversified-settings`) and settings panels spaced by
   margins rather than the `.content` gap.
6. **Remaining one-off copies** of shared pieces: `.asset-layout-switch` (icon-only
   segmented), `.tracker-value-choice`, `.goal-rate-presets`, `.currency-switch`; pill
   badges re-implemented as `.goal-card-archived`, `.goal-outcome-badge`,
   `.scheduled-payment-auto`, `.income-source-payment.is-paid`,
   `.preferences-primary`; hero gradients and large values duplicated across Overview,
   Assets, Goals and Cash flow.
