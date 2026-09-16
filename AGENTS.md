# Shared formatting rules

All user-facing prices, amounts, exchange rates, quantities, percentages, and dates must use the shared helpers in `lib/format.ts`. Do not add inline `Intl` constructors, `toLocaleString`, `toFixed`, or manual separator/date formatting in UI components.

- Use `formatMoney(value, currency, locale)` for balances, totals, costs, and gain/loss. Use its `unitPrice` option for stock and crypto unit quotes, preserving up to eight decimals.
- Use `formatNumber` for exchange rates, quantities, and rates. Always pass the current language locale from `useLanguage()`.
- Use `FormattedNumberInput` from `components/formatted-number-input.tsx` for editable amounts, prices, quantities, and interest rates. It groups digits while typing, accepts locale decimal separators, and emits plain numbers. Never replace it with a raw number input for monetary fields.
- Use `formatDate` for date-only values and `formatDateTime` for timestamps. Date-only values must stay on their original calendar day, independent of timezone. Missing or invalid display dates use an em dash.
- Every date-entry field must use `DatePicker` from `components/date-picker.tsx`. Never use native `type="date"` inputs or create a separate picker. This component adapts the Zarkebab POS picker: two months on desktop, one on mobile, rounded days, presets, and Apply/Cancel actions. Use finance theme colors and translated labels. Optional dates must allow clearing; minimum dates must be enforced. Store ISO `YYYY-MM-DD` through the shared calendar helpers; use shared formatters for visible dates. Preserve keyboard navigation and focus handling from the underlying calendar/popover components.
- Store numbers and ISO dates, never formatted display strings. Formatting must not mutate amounts, purchase costs, or exchange-rate calculations.
- Add regression coverage to `tests/format.mjs` when changing shared formatting. Check EN, RU, and UZ, grouping, decimals, small crypto prices, missing dates, and date-only timezone behavior.

# Verification preference

Do not perform browser debugging without asking the user first. Prefer focused code checks and production builds.
