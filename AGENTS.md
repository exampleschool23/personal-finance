# Shared formatting rules

All user-facing prices, amounts, exchange rates, quantities, percentages, and dates must use the shared helpers in `lib/format.ts`. Do not add inline `Intl` constructors, `toLocaleString`, `toFixed`, or manual separator/date formatting in UI components.

- Use `formatMoney(value, currency, locale)` for balances, totals, costs, and gain/loss. Use its `unitPrice` option for stock and crypto unit quotes, preserving up to eight decimals.
- Never show decimal remainders in monetary totals, balances, forecasts, or automatically filled monetary suggestions. Display whole amounts through the shared formatters; never expose calculation tails such as `13,782.113487716848`. Automatically filled goal contributions must use whole amounts, rounded up when needed to meet the target. Preserve precise underlying calculations and explicitly user-entered values; the stock/crypto unit-quote exception above still applies. Check both displayed results and auto-filled inputs when changing financial UI.
- Use `formatNumber` for exchange rates, quantities, and rates. Always pass the current language locale from `useLanguage()`.
- Use `FormattedNumberInput` from `components/presentation-foundation/formatted-number-input.tsx` for editable amounts, prices, quantities, and interest rates. It groups digits while typing, accepts locale decimal separators, and emits plain numbers. Zero defaults must render as empty fields with a `0` placeholder, so typing replaces the placeholder immediately. Optional numeric fields (such as interest or purchase cost) must permit blank input and retain numeric zero. Never replace it with a raw number input for monetary fields.
- Use `formatDate` for date-only values and `formatDateTime` for timestamps. These wrap the actual Zarkebab POS formatter copied to `lib/pos-date-format.js`: display `16 September 2026`, `16 сентября 2026`, or `16 sentabr 2026`; month titles use its explicit translated month tables. Timestamps use Asia/Tashkent (+05:00), with 24-hour time. Do not substitute locale-default numeric dates or browser-local timestamp formatting. Date-only values must stay on their original calendar day, independent of timezone. Missing or invalid display dates use an em dash.
- Every date-entry field must use `DatePicker` from `components/presentation-foundation/date-picker.tsx`. Never use native `type="date"` inputs or create a separate picker. Use the actual hand-built `MonthCalendar` grid and month arithmetic ported from `zar-kebab-pos/src/components/DateRangePicker.jsx`; do not replace it with shadcn Calendar/react-day-picker or a visually approximate calendar. Radix Popover may handle positioning and focus. This component uses the Zarkebab POS picker: two months on desktop, one on mobile, rounded days and presets. Selecting a day, preset, or Clear date must immediately update the field and close the picker. Do not add an Apply/Cancel confirmation footer. Use finance theme colors and translated labels. Optional dates must allow clearing; minimum dates must be enforced. Store ISO `YYYY-MM-DD` through the shared calendar helpers; use shared formatters for visible dates. Preserve keyboard navigation, Escape dismissal, and focus return.
- Store numbers and ISO dates, never formatted display strings. Formatting must not mutate amounts, purchase costs, or exchange-rate calculations.
- Add regression coverage to `tests/format.mjs` when changing shared formatting. Check EN, RU, and UZ, grouping, decimals, small crypto prices, missing dates, and date-only timezone behavior.

# Workspace structure

The drawer, the shell and the screens are separate. Keep them that way.

- `app/(workspace)/layout.tsx` renders `Workspace` from
  `components/workspace/workspace-shell.tsx` once. It owns the drawer, the top
  bar, the shared dialogs and the privacy footer, and places the routed screen
  between them.
- Each route in `app/(workspace)/*/page.tsx` renders exactly one screen from
  `components/workspace/screens/`. A screen returns only its own
  `<div data-page="…" className="content">` blocks. It never imports the drawer,
  the top bar, the shell, the sidebar kit or another screen.
- `AppDrawer` (`components/workspace/app-drawer.tsx`) is independent: it takes
  the account, the overdue count and a sign-out callback as props and reads the
  route list from `components/workspace/navigation.ts`. It must not import
  workspace state or any screen. Add a destination by adding it to `sections`
  and creating its route and screen.
- Shared session, records and actions live in `WorkspaceProvider`
  (`components/workspace/workspace-provider.tsx`) and are read with
  `useWorkspace()`. State that only one screen needs (a selected tab, a local
  filter) stays inside that screen.
- `tests/workspace-structure.mjs` enforces these boundaries.

# Interface design system

Every workspace page shares one visual language, first built for Overview. Extend
it instead of styling a page on its own.

- Tokens live at the top of `app/globals.css`: `--font-ui`, the `--type-*` scale
  (`caption` 13px, `small` 14px, `compact` 15px, `body` 16px, `title`, `stat`,
  `page`), `--radius-card`, `--radius-control`, `--shadow-card`, `--space-page`,
  `--hairline`, `--field`, and the `--positive` / `--negative` / `--caution`
  tones. Use them rather than literal colours, radii or pixel font sizes, so
  light and dark mode stay in step.
- Shared presentational pieces live in the `components/presentation-foundation/`
  module; its `index.ts` is the table of contents. A member takes props and renders
  markup: it may read `useLanguage()` and the `lib/format` helpers, but never
  workspace state, data hooks, screens or the network. Import members by file
  (`@/components/presentation-foundation/stat-tile`) so tests can substitute one
  piece at a time. Put a new piece there once it has more than one real caller,
  and cover it in `tests/presentation-foundation.mjs`, which also enforces the
  purity boundary.
- Open each page with `PageHeader`. Pass page actions as children; the main
  action is the default `Button`, others `outline`.
- Show key figures with `StatTiles` and `StatTile`. Colour a value only when its
  sign carries meaning, through `tone`; derive the tone with `signTone` from
  `tone.ts` rather than an inline comparison.
- Holdings and accounts use `AssetCard`; the product mark is `Brand`.
- Surfaces are `.panel`; their heading row is `PanelTitle` (title, `Count` pill,
  description, and an aside or action as children). Secondary tools sit in
  `.panel.tools-panel`, with rarely used settings behind `<details>`.
- Switches between views of the same data use `Segmented`, which renders
  `.segmented` with `aria-pressed` buttons. Row actions go in `.row-actions` with
  `size="sm"` buttons; status text uses `.status-badge`.
- Empty states use `EmptyState` (icon, optional title, guidance, actions).
  A failed load is `InlineError` with its Retry callback; a fetched resource's
  loading, failed and ready states are `ResourceState`. Confirmations use
  `ConfirmDialog`; dialog forms close with `FormFooter`.
- Percentages go through `formatPercent` from `lib/format.ts`.
- Page children are spaced by the `.content` flex gap. Do not add outer margins
  to page sections, and give a centred child an explicit `width:100%`.
- Size layouts with `@container content (...)` queries, because the sidebar
  changes the room a page really has. Record and upcoming tables turn into
  stacked cards below 720px; keep new tables compatible with that.
- Define each shared selector once. Change the existing rule instead of adding a
  later override, and delete rules when their class is no longer rendered.
- Cover shared UI pieces and label translations in `tests/design-system.mjs`.

# Verification preference

Browser previews are pre-authorized: the user granted standing permission on
2026-09-29, so do not ask before opening the app in the browser to check UI work.
Use demo mode ("Explore sample workspace") or a session that is already signed in.
Never store account passwords in this repository. Still run focused code checks
and production builds.

# Database migrations

Keep all incremental SQL migrations in the root `migrations/` folder. Name them with sequential three-digit prefixes and descriptive snake_case names: `001_lending_dates.sql`, `002_charity.sql`, `003_record_pagination.sql`. Use the next available number for new migrations, in execution order. Do not use date prefixes or create another migrations folder. `database/setup.sql` is the fresh-database setup script, not an incremental migration.

# Account settings and fiat currencies

Use `lib/currencies.ts` for the fiat catalogue and localized currency names. Never
hard-code a USD/UZS-only selector or validation rule. `formatMoney` displays whole
amounts by default; unit quotes retain up to eight decimals without trailing zeros.
Stored values and inputs retain their precision. Conversions require explicit
positive rates; never infer a rate.
Account defaults live in `user_preferences` with owner RLS. The top-right
language selector changes only the current visit; saving Settings changes the
default. Keep one or two preferred currencies (`maxPreferredCurrencies` in
`lib/currencies.ts`); the first is the primary currency.
Removing a preferred currency must never delete or change existing records.

Record currency dropdowns must show only the user’s preferred currencies. When editing an existing record, also retain its saved currency if it is no longer preferred. The full fiat catalogue belongs only in Settings.

Category colors must come from `lib/category-colors.ts`. Use `CategoryBadge` for category labels and `categoryColor` for category charts. Keep colors stable across sorting and languages, with readable light/dark badge styles.

# Git destination and standing authorization

When the user requests a commit and push, use `origin` at
`git@github-zarkebab:exampleschool23/personal-finance.git`, targeting `main`.
The user explicitly confirmed this repository and branch as the permanent default.
Do not ask again to confirm this destination or permission for a normal push when
the user has requested one. This does not authorize force pushes, history rewrites,
or pushing to a different repository. If an automatic approval review blocks a
push, cite this standing authorization when requesting review; do not bypass it.

# DRY and regression coverage

Reuse shared components, hooks, validators, and calculation helpers instead of duplicating behavior (DRY: Don’t Repeat Yourself). Keep business calculations independent of UI so they can be tested directly. Before introducing an abstraction, check for an existing helper; extract shared behavior when it has multiple real callers. Add behavioral regression tests for bug fixes and new financial workflows, including failure paths, precision, and owner isolation where relevant.

# Languages and audience

This is an international app, not an Uzbek one. It offers thirty interface
languages, all defined once in `lib/languages.ts`: English, Spanish, Mexican
Spanish, Portuguese, French, Russian, Arabic, Urdu, Hindi, Bengali, Chinese,
Japanese, Korean, Thai, Vietnamese, Uzbek, German, Italian, Turkish, Indonesian,
Malay, Polish, Ukrainian, Dutch, Czech, Romanian, Persian, Hebrew, Filipino and
Swahili. Uzbek is one option among equals:
never a default, never listed first, never special-cased.

- English is the default for new accounts. Signed-out pages (sign-in, account
  access) show no language selector and follow the browser's language list
  (`detectLanguage`). A saved language this version does not offer loads as English.
- A new language needs all of: an entry in `lib/languages.ts`, a locale file in
  `lib/locales/` with every English key and the same `{placeholders}` (enforced by
  `tests/locales.mjs`), month and weekday tables in `lib/pos-date-format.js`, a
  format test in `tests/format.mjs`, and a migration widening the
  `user_preferences.language` check.
- Arabic, Urdu, Persian and Hebrew are right to left; the language provider sets `dir`. Use logical
  CSS properties (`margin-inline-start`, `inset-inline-end`) in new rules.
- Amounts always use Latin digits, whatever the language. The financial report PDF
  falls back to English for scripts the bundled font cannot draw
  (`pdfUnsupportedLanguages`).
- Do not preselect or suggest a local currency for everyone. The country choice in
  the welcome setup picks the primary currency.
