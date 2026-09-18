# Shared formatting rules

All user-facing prices, amounts, exchange rates, quantities, percentages, and dates must use the shared helpers in `lib/format.ts`. Do not add inline `Intl` constructors, `toLocaleString`, `toFixed`, or manual separator/date formatting in UI components.

- Use `formatMoney(value, currency, locale)` for balances, totals, costs, and gain/loss. Use its `unitPrice` option for stock and crypto unit quotes, preserving up to eight decimals.
- Never show decimal remainders in monetary totals, balances, forecasts, or automatically filled monetary suggestions. Display whole amounts through the shared formatters; never expose calculation tails such as `13,782.113487716848`. Automatically filled goal contributions must use whole amounts, rounded up when needed to meet the target. Preserve precise underlying calculations and explicitly user-entered values; the stock/crypto unit-quote exception above still applies. Check both displayed results and auto-filled inputs when changing financial UI.
- Use `formatNumber` for exchange rates, quantities, and rates. Always pass the current language locale from `useLanguage()`.
- Use `FormattedNumberInput` from `components/formatted-number-input.tsx` for editable amounts, prices, quantities, and interest rates. It groups digits while typing, accepts locale decimal separators, and emits plain numbers. Zero defaults must render as empty fields with a `0` placeholder, so typing replaces the placeholder immediately. Optional numeric fields (such as interest or purchase cost) must permit blank input and retain numeric zero. Never replace it with a raw number input for monetary fields.
- Use `formatDate` for date-only values and `formatDateTime` for timestamps. These wrap the actual Zarkebab POS formatter copied to `lib/pos-date-format.js`: display `16 September 2026`, `16 сентября 2026`, or `16 sentabr 2026`; month titles use its explicit translated month tables. Timestamps use Asia/Tashkent (+05:00), with 24-hour time. Do not substitute locale-default numeric dates or browser-local timestamp formatting. Date-only values must stay on their original calendar day, independent of timezone. Missing or invalid display dates use an em dash.
- Every date-entry field must use `DatePicker` from `components/date-picker.tsx`. Never use native `type="date"` inputs or create a separate picker. Use the actual hand-built `MonthCalendar` grid and month arithmetic ported from `zar-kebab-pos/src/components/DateRangePicker.jsx`; do not replace it with shadcn Calendar/react-day-picker or a visually approximate calendar. Radix Popover may handle positioning and focus. This component uses the Zarkebab POS picker: two months on desktop, one on mobile, rounded days and presets. Selecting a day, preset, or Clear date must immediately update the field and close the picker. Do not add an Apply/Cancel confirmation footer. Use finance theme colors and translated labels. Optional dates must allow clearing; minimum dates must be enforced. Store ISO `YYYY-MM-DD` through the shared calendar helpers; use shared formatters for visible dates. Preserve keyboard navigation, Escape dismissal, and focus return.
- Store numbers and ISO dates, never formatted display strings. Formatting must not mutate amounts, purchase costs, or exchange-rate calculations.
- Add regression coverage to `tests/format.mjs` when changing shared formatting. Check EN, RU, and UZ, grouping, decimals, small crypto prices, missing dates, and date-only timezone behavior.

# Verification preference

Do not perform browser debugging without asking the user first. Prefer focused code checks and production builds.

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
default. Keep at least one preferred currency; the first is the primary currency.
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
