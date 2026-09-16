# Fiat currency catalogue and conversions

`lib/currencies.json` comes from SIX's current ISO 4217 List One:
https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml

Retrieved 2026-09-16. Contains 156 current fiat codes; excludes precious metals,
test/no-currency codes, funds and accounting units. Use ISO minor units for
money formatting (e.g. JPY 0, USD 2, KWD 3), with up to eight decimals for unit
prices. Currency labels use the active language.

Daily USD-based conversion rates: https://www.exchangerate-api.com/docs/free
Cache for 24 hours and retain provider attribution in the UI. CBU remains the
source for the USD/UZS pair. Never invent a rate for an unsupported currency;
keep original amounts visible and disclose exclusions from converted totals.

Run migrations in numeric order. 004 adds account preferences with owner RLS,
widens record currency validation, and updates the paginated RPC. The saved
language is applied on account load. The top-right switcher changes the current
visit without replacing that default. The first preferred currency is primary;
at least one is required. Removing a preference never deletes existing records.
