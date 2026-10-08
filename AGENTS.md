# Shared formatting rules

All user-facing prices, amounts, exchange rates, quantities, percentages, and dates must use the shared helpers in `lib/format.ts`. Do not add inline `Intl` constructors, `toLocaleString`, `toFixed`, or manual separator/date formatting in UI components.

**Strict rule, no exceptions:** a person never reads a date as `2026-09-30`, `30.09.2026` or `09/30/2026`. Every
date they see is written by the date formatter: `30 September 2026` (`formatDate`, `formatDateTime`,
`formatMonthYear`, `formatMonthShort`, `formatYear`). Every price, amount, balance or cost they see goes through
`formatMoney` (or `formatSignedMoney`, `formatCompactMoney`, `formatAccountOption`); quantities and rates through
`formatNumber` / `formatPercent`. This covers every surface, not just the web UI: Telegram bot messages and prompts,
the AI assistant's snapshot and instructions, PDF reports, emails, toasts, aria-labels and chart tooltips. Example
dates in hints are a `{date}` placeholder filled by `formatDate`, never a literal; text that asks someone to type a
date must also accept the formatted form back. Exempt: stored values, API payloads, URLs and CSV/data files, which
keep ISO dates and plain numbers. `tests/formatting-rules.mjs` scans the whole codebase and every locale for this.

- Use `formatMoney(value, currency, locale)` for balances, totals, costs, and gain/loss. Use its `unitPrice` option for stock and crypto unit quotes, preserving up to eight decimals.
- Never show decimal remainders in monetary totals, balances, forecasts, or automatically filled monetary suggestions. Display whole amounts through the shared formatters; never expose calculation tails such as `13,782.113487716848`. Automatically filled goal contributions must use whole amounts, rounded up when needed to meet the target. Preserve precise underlying calculations and explicitly user-entered values; the stock/crypto unit-quote exception above still applies. Check both displayed results and auto-filled inputs when changing financial UI.
- Use `formatNumber` for exchange rates, quantities, and rates. Always pass the current language locale from `useLanguage()`.
- Use `FormattedNumberInput` from `components/presentation-foundation/formatted-number-input.tsx` for editable amounts, prices, quantities, and interest rates. It groups digits while typing, accepts locale decimal separators, and emits plain numbers. Zero defaults must render as empty fields with a `0` placeholder, so typing replaces the placeholder immediately. Optional numeric fields (such as interest or purchase cost) must permit blank input and retain numeric zero. Never replace it with a raw number input for monetary fields.
- Use `formatDate` for date-only values and `formatDateTime` for timestamps. These wrap the actual Zarkebab POS formatter copied to `lib/pos-date-format.js`: display `16 September 2026`, `16 сентября 2026`, or `16 sentabr 2026`; month titles use its explicit translated month tables. Timestamps use Asia/Tashkent (+05:00), with 24-hour time. Do not substitute locale-default numeric dates or browser-local timestamp formatting. Date-only values must stay on their original calendar day, independent of timezone. Missing or invalid display dates use an em dash.
- Every date-entry field must use `DatePicker` from `components/presentation-foundation/date-picker.tsx`. Never use native `type="date"` inputs or create a separate picker. Use the actual hand-built `MonthCalendar` grid and month arithmetic ported from `zar-kebab-pos/src/components/DateRangePicker.jsx`; do not replace it with shadcn Calendar/react-day-picker or a visually approximate calendar. Radix Popover may handle positioning and focus. This component uses the Zarkebab POS picker: one month at a time on every screen, opening on the chosen day's month (or today's), with arrows to step to the months around it, rounded days and presets. Selecting a day, preset, or Clear date must immediately update the field and close the picker. Do not add an Apply/Cancel confirmation footer. Use finance theme colors and translated labels. Optional dates must allow clearing; minimum dates must be enforced. Store ISO `YYYY-MM-DD` through the shared calendar helpers; use shared formatters for visible dates. Preserve keyboard navigation, Escape dismissal, and focus return.
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
  the account and the overdue count as props (signing out lives in Settings) and reads the
  route list from `components/workspace/navigation.ts`. It must not import
  workspace state or any screen. Add a destination by adding it to `sections`
  and creating its route and screen.
- Shared session, records and actions live in `WorkspaceProvider`
  (`components/workspace/workspace-provider.tsx`) and are read with
  `useWorkspace()`. The provider composes hooks from `components/workspace/state/`
  (sign-in, settings, record reads and table, saving, actions, dialogs); its pure
  rules live in `lib/` (`record-save`, `record-table`, `workspace-totals`). State that only one screen needs (a selected tab, a local
  filter) stays inside that screen.
- `tests/workspace-structure.mjs` enforces these boundaries.
- Signed-out visitors see `LandingPage` (`components/landing-page.tsx`) at `/`: the
  public product tour (floating nav, hero over a
  product window, feature rows, closing band). Sign-in is its own page at
  `signInPath` (`lib/sign-in-path.ts`), a single centred card. The shell picks
  between them; link to `signInPath`, never to `/`, when someone needs to sign in.
  Landing figures are sample data through the shared formatters, and every claim
  on it must match the privacy policy and a feature that exists.
  Both are rendered on the server for visitors without session cookies
  (`VisitorHint` in the workspace layout), in the language of the request's
  `Accept-Language`; keep them free of browser-only code during render.
  `tests/landing-page.mjs` covers all of this.

# Interface design system

Every workspace page shares one visual language, first built for Overview. Extend
it instead of styling a page on its own.

- Styles live in `app/styles/*.css`, imported in cascade order by `app/globals.css`
  (tests read them combined through `tests/helpers/stylesheet.mjs`). Tokens live at
  the top of `app/styles/foundation.css`: `--font-ui`, the `--type-*` scale
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
- The look: warm grey page and rail (`#f6f5f3`), white
  cards with a hairline border and 12px radius, medium-weight figures.
- Headings are one line. Never put a grey sentence under a page, panel or tile
  heading. Explanations go behind the ⓘ: pass them as `hint` to `PageHeader` or
  `PanelTitle`, or wrap them in `InfoHint`. A tile's second line is a live
  figure (an estimate, a change), never prose.
- Open each page with `PageHeader`. Pass page actions as children; the main
  action is the default `Button`, others `outline`. Inside the workspace the
  title moves into the top bar at `--type-compact` (15px), like a desktop app's
  title bar, with the page's view tabs (`Segmented` with `page-tabs`) and actions
  beside it where the bar has room; otherwise tabs and actions open the page.
  This title is deliberately smaller than panel and card headings, which carry
  the hierarchy on the page. `--type-page` is for titles that open the page
  itself: the `PageHeader` fallback outside the top bar, full-screen setup steps
  and onboarding. On phones the view tabs wrap rather than scroll.
- Show key figures with `StatTiles` and `StatTile`. Colour a value only when its
  sign carries meaning, through `tone`; derive the tone with `signTone` from
  `tone.ts` rather than an inline comparison.
- Holdings and accounts use `AssetCard`; the product mark is `Brand`.
- Every category is recognisable at a glance: an emoji from `lib/category-icons.ts`
  on a tile in its `categoryColor` hue. Use `CategoryIcon` beside a row's name and
  `CategoryBadge` for labels; `RecordIcon` keeps drawn symbols for holdings. Goal
  covers come from `goalEmoji`.
- Long lists are grouped, with the group total in the group header: accounts by
  type (collapsible `.account-group`), upcoming payments by month
  (`.table-group-row`). Totals in different currencies are listed, never added.
- Income amounts are green; expenses stay in the ink colour. Red marks overdue,
  overspent or owed amounts only.
- Rare row actions go in a ⋯ menu rather than a row of buttons.
- Delete is always a bin. A delete button is `DeleteButton`
  (`presentation-foundation/delete-button.tsx`): icon only, its label naming what
  it deletes; in a form footer it sits apart at the start. A ⋯ menu's delete is a
  `RowMenu` item with `deletes: true`, and a confirmation that deletes passes
  `deletes` to `ConfirmDialog`; both show the bin beside the label.
- Every list whose order the person chooses (goals, accounts, categories, cards,
  templates and the like) is reorderable by drag and drop with `SortableList` /
  `SortableItem` from `presentation-foundation/sortable.tsx`; chronological or
  sorted lists are not. `UI-AGENT.md` has the full rules and the reference
  reference workflow; read it before UI work.
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
  changes the room a page really has. Record tables keep their columns and
  scroll sideways when they do not fit, with the name column frozen
  (`position: sticky`) and at least 13rem wide; on a phone (560px and below)
  each record is a card with name and value on the first line. Names are never
  ellipsised, squeezed under another column or broken between letters, and no
  script measures a table to choose its layout (that flickered). Never hide a
  figure for lack of room: move it under the name with a label instead (Budget
  shows "Actual $1,231" under the category on a phone). Upcoming tables turn
  into stacked cards below 720px.
- Never stack a row while it still has room. A breakpoint guessed for the widest
  possible row (long UZS amounts, a progress line) stacks every ordinary row too
  early and leaves a gap with the date on a second line. Row lists that line up
  trailing columns (status, amount, actions) beside a name decide with
  `useColumnsFit` (`hooks/use-columns-fit.ts`): it measures what is on screen and
  sets `data-layout="columns"` or `"stacked"`, which the stylesheet lays out.
  Prefer `flex-wrap` / `auto-fit` grids that wrap by themselves; keep fixed
  `@container` widths for page-level layout (columns of panels), not for rows.
  `/dr` Audit L finds rows that wrapped while their first line had room.
- Define each shared selector once. Change the existing rule instead of adding a
  later override, and delete rules when their class is no longer rendered.
- Cover shared UI pieces and label translations in `tests/design-system.mjs`.

# Verification preference

Browser previews are pre-authorized: the user granted standing permission on
2026-09-29, so do not ask before opening the app in the browser to check UI work.
Use demo mode ("Explore sample workspace") or a session that is already signed in.
Never store account passwords in this repository. Still run focused code checks
and production builds.

# Browser tests

`npm run test:e2e` runs the P0 flows in Chromium (`e2e/p0.spec.mjs`, Playwright) against a production build
(`npm run build:production` first, or `npm run test:e2e:full`). The app talks to `e2e/fake-supabase.mjs`: the real
`database/setup.sql` in PGlite behind the PostgREST and Auth endpoints the app calls, seeded through the app's own API
with the fixed workspace in `e2e/fixture.mjs` and restored from a snapshot before each test. Keys from local env files
are blanked for the test server, so a run never reaches a real service. CI runs it on every push (`e2e` job). When a
new query uses a PostgREST feature the stand-in lacks, extend it there rather than working around it in the app.

# Database migrations

Keep all incremental SQL migrations in the root `migrations/` folder. Name them with sequential three-digit prefixes and descriptive snake_case names: `001_lending_dates.sql`, `002_charity.sql`, `003_record_pagination.sql`. Use the next available number for new migrations, in execution order. Do not use date prefixes or create another migrations folder. `database/setup.sql` is the fresh-database setup script, not an incremental migration.

# Account settings and fiat currencies

Use `lib/currencies.ts` for the fiat catalogue and localized currency names. Never
hard-code a USD/UZS-only selector or validation rule. `formatMoney` displays whole
amounts by default; unit quotes retain up to eight decimals without trailing zeros.
Stored values and inputs retain their precision. Conversions require explicit
positive rates; never infer a rate.
**Show every amount in the selected display currency, always.** Every amount on every surface (balances, income, spending plans, progress totals, tiles, charts, lists, reports, Telegram and the assistant) is converted into the display currency chosen in the top bar. Never show a mix of currencies on one screen, for example "$5,700" beside "UZS 9,000,000". Convert with `convertMoney` / `amountIn` and explicit rates; where no positive rate exists, show the amount as missing (—) with an "Exchange rate unavailable" note, never under the wrong currency label. Stored values keep their own currency.
Account defaults live in `user_preferences` with owner RLS. The top-right
language selector changes only the current visit; saving Settings changes the
default. Keep one or two preferred currencies (`maxPreferredCurrencies` in
`lib/currencies.ts`); the first is the primary currency.
Removing a preferred currency must never delete or change existing records.

Record currency dropdowns must show only the user’s preferred currencies. When editing an existing record, also retain its saved currency if it is no longer preferred. The full fiat catalogue belongs only in Settings.

An amount whose currency can differ from where it is shown or added travels as
`Money` (`{ amount, currency }`, `lib/money.ts`) and changes currency only through
`convertMoney` / `amountIn`, which return null without a usable rate. Never add or
show an amount under another currency's label; count it as missing instead.
(`convertAmount` in `lib/market.ts` keeps its own copy of the arithmetic because
that file has no runtime imports.)

Category colors must come from `lib/category-colors.ts`. Use `CategoryBadge` for category labels and `categoryColor` for category charts. Keep colors stable across sorting and languages, with readable light/dark badge styles.

# Git destination and standing authorization

When the user requests a commit and push, use `origin` at
`git@github-dangerhoggish:exampleschool23/personal-finance.git`, targeting `main`.
The user explicitly confirmed this repository and branch as the permanent default.
Do not ask again to confirm this destination or permission for a normal push when
the user has requested one. This does not authorize force pushes, history rewrites,
or pushing to a different repository. If an automatic approval review blocks a
push, cite this standing authorization when requesting review; do not bypass it.

# Households and shared workspaces

An owner can share their workspace with up to five people (migration 100,
`lib/household.ts`, Settings › Household sharing). Access is decided in the
database, never by the app.

- The open workspace travels as the `hf_workspace` cookie; `supa()` sends it as
  the `x-workspace-owner` header and `public.active_owner()` honours it only for
  a household member. Routes use `workspaceOwner(auth)` for owner ids, never
  `auth.user.id`, and mark personal calls (backups, account deletion) with
  `personalRequest()`.
- Shared tables are listed in `public.shared_workspace_tables()`. Their
  policies, `user_id` defaults and functions use `public.active_owner()`, and a
  row trigger plus restrictive policies refuse writes from viewers. A new table
  with `user_id` must be classified there (or as personal) and a new function on
  shared tables must use `active_owner()`, not `auth.uid()`;
  `tests/households-sql.mjs` fails otherwise.
- Personal tables (preferences, Telegram, backups, app activity) keep
  `auth.uid()`. The Telegram bot always writes to the person's own workspace.
- Every account and transaction has an owner (migration 102): the whole
  household (`shared`) or one person (`member_id`); a shared record's `member_id`
  is who added it. Read it with `ownerOf` / `holdingOwner` from
  `lib/household.ts`, never from the columns directly. A new record takes its
  account's owner in the database; `set_account_owner` moves an account and the
  records that followed it, `set_record_owner` sets transactions. Everything
  from before owners, and anything of someone who left, is shared.
- Owners are filtered with `OwnerFilter` and shown with `OwnerAvatar`
  (Accounts, Transactions, Reports). Budget, goals, recurring and investments
  always show the whole household.
- Show sharing UI only when `sharedWorkspace()` is true. The sample workspace
  has a sample household of two (`demoHousehold`) so owners can be tried; it has
  no invites, and its owner changes run through the local copies
  (`assignOwner`, `moveAccountToOwner`).

# Scheduled payments link by id

A payment belongs to a recurring income or bill only through ids, never through a
name, amount or date that happens to match (migration 119).

- A payment of a schedule carries the schedule's id (`occurrence_record_id`) and the
  due date it pays (`occurrence_due_on`). Entry points name the schedule: Record
  payment, later payments, the bot's "Which scheduled payment is this?" question and
  the record forms' "Scheduled payment" field (`ScheduledPaymentField`). Both offer
  `paymentSchedules` from `lib/planning.ts` and apply a choice with `chooseSchedule`.
  A business or rent income that names none takes the id of the one active schedule
  of its business or property; with none or several it stays unlinked.
- A payment may be in another currency than its schedule (migration 120). It keeps
  its own amount and currency; the planning read counts it in the schedule's
  currency at the official rate of the payment's day (`inScheduleCurrency`,
  `lib/schedule-currency.ts`). Recurring counts a payment only in its schedule's
  currency; one it cannot convert shows "Exchange rate unavailable." and is
  missing from the month's totals, never the raw figure in the wrong currency.
- The database alone picks and checks the due date (`name_scheduled_payment`): the
  open payment of the payment's own month, else last month's, else it adds to this
  month's recorded one. The first payment settles the due date
  (`payment_occurrences.transaction_id`); a schedule id never changes afterwards.
- Every screen totals a due date the same way: its first payment plus the other
  payments naming it, through `laterPayments` in `lib/planning.ts` (Recurring and
  the planning read). Cash flow joins a payment to its schedule's card by the same
  id. Do not add another matching rule; extend this one.

# DRY and regression coverage

Reuse shared components, hooks, validators, and calculation helpers instead of duplicating behavior (DRY: Don’t Repeat Yourself). Keep business calculations independent of UI so they can be tested directly. Before introducing an abstraction, check for an existing helper; extract shared behavior when it has multiple real callers. Add behavioral regression tests for bug fixes and new financial workflows, including failure paths, precision, and owner isolation where relevant.

Size limits (`eslint.config.mjs`, the SwiftLint equivalent here): a file stays under 24 KB, a
function under 150 lines, 40 statements, complexity 20, nesting depth 4, 5 parameters and 4 nested
callbacks. Older breaches are listed in `eslint-suppressions.json`, which only shrinks: never add to
it by hand; after fixing a listed spot run `npm run lint:prune`. Split a large screen into a folder of
parts (`components/transactions/`, `components/budget/`) and styles into `app/styles/`.

Shared modules to reach for first:

- API routes: `lib/api-route.ts` (`sameOrigin`, `reply`, `readJson`, `parseAction`,
  `postgrestFailure`, the standard 401/403/429 replies) and the validators in
  `lib/api-validation.ts` (`uuid`, `isoDate`, `fiatCurrency`). Paged PostgREST reads
  go through `readAllPages` (`lib/owner-rows.ts`) or `readOwnerRows`
  (`lib/server-records.ts`).
- Abuse limits: `rateLimited` from `lib/rate-limit.ts` (Postgres-backed, migration
  106). Every new sign-in, code-sending or paid-API route needs one.
- Day and month arithmetic: `lib/calendar-days.ts` (`shiftDay`, `daysBetween`,
  `shiftMonth`, `monthEnd`); "today" is `depositToday()`, never
  `new Date().toISOString()`.
- Client requests: `requestJson` from `lib/api-client.ts`; owner resources load
  through `useOwnerResource`.
- Telegram messages: `lib/telegram-kit.ts` (`messageKit`, `keyboardRows`,
  `backButton`); typed amounts through `parseTypedAmount`. The bot answers private
  chats only, and only the Telegram user linked to the subscription.

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
