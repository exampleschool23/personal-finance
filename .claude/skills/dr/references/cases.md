# Design regression catalog

Severity if failed: **D0** broken/unreadable, **D1** written rule broken, **D2** polish.
Each case says how to measure it. IDs are stable; append, never renumber.
`[bug 2026-10-02]` marks a defect found in the 2 October QA pass; `[dr 2026-10-02]`
marks one found in the 2 October full design review. Audits A–K are in `SKILL.md` §3.

Run log (newest first): 2026-10-02 full review of 14 screens at 1440/1280/768/375,
light and dark, sample workspace; fixes in 9c08db8,
re-checked by audits only (pane hidden). Not yet run: legal, account-access, connect,
Arabic and German layouts.

Token reference (app/globals.css): `--type-micro` 12px, `--type-caption` 13px,
`--type-small` 14px, `--type-compact` 15px, `--type-body`/`--type-title` 16px,
`--type-heading` 20px, `--type-page`/`--type-stat` 22–26px, `--type-hero` 30–40px;
`--radius-card` 12px, `--radius-control` 10px; `--space-page` 20px; tones
`--positive`, `--negative`, `--caution`; page and rail `#f6f5f3` in light mode;
secondary text `#68655f` in light mode (the reference app's `#777573` fails AA on the page grey).

## TOK — tokens and surfaces

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| TOK-001 | D1 | Font sizes come from the scale | Audit D | Only token sizes (12, 13, 14, 15, 16, 20, 22–26, 30–40 px); no 9, 11, 11.2, 19 or 21 px `[dr 2026-10-02]` |
| TOK-002 | D1 | Card radius | `getComputedStyle(.panel).borderRadius` in light and dark | 12px in both themes (dark once used 20px); controls 10px `[dr 2026-10-02]` |
| TOK-003 | D1 | Card surface | `.panel` background, border, shadow in both themes | White (light) / card token (dark); hairline border; `--shadow-card`; no radial glow in dark `[dr 2026-10-02]` |
| TOK-004 | D1 | Page and rail colour | body / sidebar background in light | `#f6f5f3` |
| TOK-005 | D1 | No literal colours in new CSS | grep new rules (incl. `*.module.css`) for `#hex`, `rgb(` outside `:root` | None; tokens only (onboarding once hard-coded lime) `[dr 2026-10-02]` |
| TOK-006 | D1 | Page padding | `.content` padding / gap | `--space-page`; children spaced by flex gap, no outer margins |
| TOK-007 | D2 | Selectors defined once | grep `app/globals.css` for repeated selectors | One rule per selector; unused classes removed (e.g. `.budget-unallocated`) |
| TOK-008 | D1 | No literal px font sizes in CSS | `grep -c 'font-size:[0-9.]*px' app/globals.css components/*.module.css` | Zero outside `:root` token definitions (was 77) `[dr 2026-10-02]` |
| TOK-009 | D1 | One brand in both themes | Compare `--brand`, logo colour and accent fills light vs dark | Teal in both (dark `#5cc8b9`); no lime `#c4f36b`; landing closing band not a full-width accent block in dark `[dr 2026-10-02]` |

## TYPE — typography

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| TYPE-001 | D1 | Page title | `PageHeader` h1 size | `--type-page` |
| TYPE-002 | D1 | Figures | Stat values | `--type-stat`, medium weight, tabular numerals where columns align |
| TYPE-003 | D2 | Percent columns align | Columns of % | Same decimals ("2.0%" under "12.2%") `[dr 2026-10-02: allocation]` |
| TYPE-004 | D1 | UI font | `getComputedStyle(body).fontFamily` | `--font-ui` (Inter or Onest per Settings) |
| TYPE-005 | D1 | Headline figures share one size | Audit D on the hero figure of Dashboard, Accounts, Goals, Investments | Same `--type-hero` size on every page (was 26/40/48/52 px) `[dr 2026-10-02]` |
| TYPE-006 | D1 | Heading hierarchy | Compare h1 with h2/h3 sizes on each page, phone width | No section or panel heading larger than the page title (Settings h2 24px > h1 22px) `[dr 2026-10-02]` |
| TYPE-007 | D2 | No orphans in marketing copy | Landing / sign-in headings and paragraphs at 375 and 1280 | `text-wrap: balance` on headings, `pretty` on paragraphs; no single word on the last line `[dr 2026-10-02]` |

## HEAD — headings and hints

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| HEAD-001 | D1 | One-line headings | Audit B on every screen and dialog | No grey sentence under page, panel or tile headings `[bug 2026-10-02: Settings]` `[dr 2026-10-02: Spending card, goal planner, debt planner, add-expense dialog, Target allocation, Saved scenarios, goal chart]` |
| HEAD-002 | D1 | Explanations behind ⓘ | Open each ⓘ | Text present in the hint, not on the page |
| HEAD-003 | D1 | Tile second line | StatTile subtext | A live figure (estimate, change), never prose |
| HEAD-004 | D1 | Page opens with PageHeader | Inspect | Title, ⓘ, actions: main action default Button, others outline |
| HEAD-005 | D2 | Destructive warning exception | Account security delete | Warning stays visible (allowed) |
| HEAD-006 | D1 | Title position is fixed | Audit K on every workspace screen | Same h1 `top` and `left` (±1px) on every page; Settings not indented (was 92/97/98/119 px, +24 px) `[dr 2026-10-02]` |
| HEAD-007 | D2 | Browser tab title | Audit K `document.title` | "<drawer label> · Hoggish Finance" per page, never the bare app name `[dr 2026-10-02]` |
| HEAD-008 | D1 | Title matches the drawer | h1 vs drawer label (`components/workspace/navigation.ts`) | Same word ("Investments", "Goals"); Budget's title is "Budget", the month sits in the navigator `[dr 2026-10-02]` |

## FMT — numbers, money, dates

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| FMT-001 | D0 | Whole money amounts | Audit C (includes SVG chart text) | No decimals in balances, totals, forecasts, chart labels (Sankey `$12.8` was a bug) `[bug 2026-10-02]` |
| FMT-002 | D1 | Unit prices | Stock / crypto quotes | Up to 8 decimals, no trailing zeros |
| FMT-003 | D1 | True minus sign | Audit C `hyphenMinus` | Negative amounts use "−" (U+2212) everywhere (Loans showed "-$199,800"); only the PDF report keeps a hyphen `[bug 2026-10-02]` `[dr 2026-10-02]` |
| FMT-004 | D1 | Compact amounts | Chart axes, Sankey | "$2.5K" for ≥ 1,000; whole amounts below |
| FMT-005 | D1 | Dates | Any date | "2 October 2026" (localised month names); timestamps 24 h Tashkent; missing → "—" |
| FMT-006 | D1 | Amount inputs | Type 50000.75 | Grouped "50,000.75"; zero default shows empty with "0" placeholder |
| FMT-007 | D1 | Prefilled values are values | Scheduled payment dialog | Real value, not a placeholder that blocks Save `[bug 2026-10-02]` |
| FMT-008 | D1 | Source rules | grep `components/` | No inline `Intl.`, `toLocaleString`, `toFixed`, native `type="date"`, raw number inputs for money |
| FMT-009 | D2 | Plurals | "1 lending record(s)" etc. | Correct singular / plural `[bug 2026-10-02]` |
| FMT-010 | D1 | Totals in different currencies | Grouped headers, account groups | Listed side by side ("€700 · $2,938"), never added |
| FMT-011 | D1 | Numbers right-aligned | `getComputedStyle(td).textAlign` on amount / % / quantity columns | `right` (or `end`) with tabular numerals (Target allocation was left-aligned) `[dr 2026-10-02]` |
| FMT-012 | D2 | Empty numeric cells | Rows without a value (budget contributions' Actual / Remaining) | "—", never a blank cell `[dr 2026-10-02]` |
| FMT-013 | D2 | Round chart ticks | Value axes on every chart | Round steps ($10K, $20K…), not $17,000 / $25,500 `[dr 2026-10-02]` |

## COMP — shared components

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| COMP-001 | D1 | StatTiles | Key figures | `StatTiles`/`StatTile`; tone only via `signTone` |
| COMP-002 | D1 | Category identity | Rows with categories | Emoji tile in `categoryColor` hue (`CategoryIcon`), labels via `CategoryBadge`; stable colours across sorting/languages |
| COMP-003 | D1 | Panels | Surfaces | `.panel` with `PanelTitle` (title, Count pill, hint, aside) |
| COMP-004 | D1 | One single-choice control | Every view switch, filter and preset row | `Segmented` (`.segmented`, `aria-pressed`); no teal-filled chips, filled-button rows (0% / 5% / 8% / 12%) or ad-hoc tab strips `[dr 2026-10-02]` |
| COMP-005 | D1 | Row actions | Lists | Rare actions (Stop, Split, Edit, Delete, Skip) in the shared `RowMenu` ⋯; frequent ones `size="sm"` in `.row-actions`; the same actions on every row so columns do not go ragged `[dr 2026-10-02: Cash flow, Loans, Recurring]` |
| COMP-006 | D1 | Status pills | Status text | `.status-badge`; green on track/completed, caution at risk, red overdue/overspent only |
| COMP-007 | D1 | Date entry | Every date field | `DatePicker` (two months desktop, one mobile, presets, closes on pick, Escape, focus return) |
| COMP-008 | D1 | Picker presets fit the field | Past-only vs future-only fields | No "Tomorrow" on a past-only field, no "Today" when min is tomorrow `[bug 2026-10-02]` |
| COMP-009 | D1 | Account options | Every cash-account select | "Name · balance" (`formatAccountOption`) so same names are distinguishable `[bug 2026-10-02]` |
| COMP-010 | D2 | Brand | Drawer header | `Brand` component; Demo badge only in sample |
| COMP-011 | D1 | One disclosure style | Every `<details>` / collapsible (watchlists, skipped occurrences, reminders, account groups) | The app chevron; no native ▸ marker (`summary::marker` hidden) `[dr 2026-10-02]` |
| COMP-012 | D2 | Panel links | Every "View all" / panel heading link | Same text style and the same → arrow; never the external ↗ icon for an internal page; ≥ 24px target on desktop `[dr 2026-10-02]` |
| COMP-013 | D2 | ⋯ menu earns its place | Open each `RowMenu` | Two or more items, or the single action shown inline; the trigger never covers the row's figures `[dr 2026-10-02: goal row]` |
| COMP-014 | D1 | Disabled means disabled | Audit H | Controls that look enabled work, controls that look faded are `disabled`, and every disabled control says why (title / hint): add-goal Continue, Reconcile statement, Save plan `[dr 2026-10-02]` |
| COMP-015 | D1 | Picker shows usable months | Open each `DatePicker` with a max of today | The visible months contain selectable days (September + October, never a fully disabled November) `[dr 2026-10-02]` |
| COMP-016 | D2 | Outside-month days | Date picker grid | Days of neighbouring months hidden (or clearly distinct from disabled days) `[dr 2026-10-02]` |
| COMP-017 | D2 | Links look like links | "Manage categories in Settings" and every inline link | Underline or brand colour, pointer cursor; not plain body text `[dr 2026-10-02]` |
| COMP-018 | D2 | Zero carries no tone | Income $0, change 0 | Ink colour; `signTone(0)` is neutral (Transactions showed "$0" in green) `[dr 2026-10-02]` |

## LIST — lists, tables, groups

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| LIST-001 | D1 | Grouped long lists | Accounts, upcoming | Groups with group totals in the header (`.account-group`, `.table-group-row`) |
| LIST-002 | D1 | Row anatomy | Goal/account rows | Icon, name, one meta line, amount right, % or change under it, thin progress when targeted |
| LIST-003 | D1 | Income vs expense colour | Amount cells | Income green, expenses ink, red only for overdue/overspent/owed |
| LIST-004 | D1 | Tables on narrow content | Every table at container < 720px (records, upcoming, Cash flow "Income this month", target allocation) | Stacked cards or a table that fits; headers never wrap to three lines `[dr 2026-10-02: Cash flow income table]` |
| LIST-005 | D2 | Counts match rows | Panel Count pill | Equals rows shown `[bug 2026-10-02]` |
| LIST-006 | D2 | Pagination | Short or empty lists | Hidden when one page `[bug 2026-10-02]` |
| LIST-007 | D1 | Names wrap before figures shrink | Audit A `truncated` at 375 on Budget, Goals, Accounts | Names wrap to two lines; no "Living ex…" / "Emergency fu…" while amounts keep full width `[dr 2026-10-02]` |
| LIST-008 | D1 | Pills keep their size | `.status-badge` width in grid rows at 768 | Sized to content (`justify-self:start`); never stretched across the cell (Recurring "Today" was 382px) `[dr 2026-10-02]` |

## DND — reordering (UI-AGENT.md)

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| DND-001 | D1 | Person-ordered lists reorder | Goals, accounts, categories, dashboard cards, watchlists, rules, templates, import profiles, scenarios | Six-dot handle; drag works; order persists `[bug 2026-10-02: accounts, categories]` |
| DND-002 | D1 | Natural-order lists do not | Transactions, history, upcoming by date | No handles; sort controls instead |
| DND-003 | D1 | Handle visibility | Hover, keyboard focus, touch (mobile) | Appears on hover/focus; always visible on touch; only the handle drags |
| DND-004 | D1 | Keyboard drag | Space, arrows, Space, Escape | Works; announced with item name |
| DND-005 | D1 | Failure rollback | Block the save (offline) | Order rolls back with an error popup |
| DND-006 | D2 | Handle label | aria-label | "Move <visible title>" (dashboard "Upcoming payments" handle said "Recurring") `[bug 2026-10-02]` |
| DND-007 | D2 | Handle spacing | Gap between handle rect and card title rect | ≥ 8px; handle never touches the title (dashboard handles 20×24 px touched) `[dr 2026-10-02]` |

## STATE — empty, loading, error

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| STATE-001 | D1 | Empty states | New account on every screen | `EmptyState`: icon, optional title, one sentence, action |
| STATE-002 | D1 | Empty charts | No data | Empty state, never an axis like "$0–$1" `[bug 2026-10-02]` |
| STATE-003 | D1 | Loading | Throttle network | Skeletons (`ChartSkeleton`, `LoadingPlaceholder`), no layout jump |
| STATE-004 | D1 | Errors | Fail a request | `InlineError` with Retry |
| STATE-005 | D1 | Unavailable feature | Assistant without key, and in the sample workspace | Explains and disables input up front; the box looks disabled (no active field, no resize grip) `[bug 2026-10-02]` `[dr 2026-10-02]` |
| STATE-006 | D1 | Input limits are visible | Over max quantity / fee | Message under the field, never a silent drop `[bug 2026-10-02]` |
| STATE-007 | D2 | Empty-state titles | Every `EmptyState` title | No trailing full stop ("No deleted items") `[dr 2026-10-02]` |
| STATE-008 | D1 | Sample-only limits explained | Sample workspace controls that cannot work there (Reconcile statement, Refresh, Record payment on loans) | Disabled with the reason on hover/focus, not faded silently `[dr 2026-10-02]` |

## DLG — dialogs and overlays

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| DLG-001 | D1 | Forms close with FormFooter | Every form dialog | Cancel + primary action, consistent order |
| DLG-002 | D1 | Confirmations | Every delete | `ConfirmDialog` naming the item (rules too) `[bug 2026-10-02]` |
| DLG-003 | D1 | Discard guard | Escape with edits | Discard prompt |
| DLG-004 | D1 | Focus | Open / close | Focus moves in, Escape closes, focus returns to the trigger |
| DLG-005 | D2 | Width | Multi-editor dialogs | Wider dialog instead of a long column |
| DLG-006 | D2 | Irrelevant hints | Context-specific notes | Only shown when relevant (no USDT note on stock sale) `[bug 2026-10-02]` |
| DLG-007 | D1 | Toast wording | After delete | "Deleted", not "Saved" `[bug 2026-10-02]` |
| DLG-008 | D1 | Initial focus on the first field | `document.activeElement` right after opening each form dialog | The first input (Amount in Add expense), never the Close button `[dr 2026-10-02]` |
| DLG-009 | D2 | Trigger names its dialog | Button label vs dialog title | Same words (top-bar "Add expense" opens "Add expense", not "Quick expense") `[dr 2026-10-02]` |

## RESP — responsive

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| RESP-001 | D0 | No horizontal scroll at 375 | Audit A at mobile | `out` empty |
| RESP-002 | D1 | Container queries | Toggle the sidebar at desktop | Layout reflows by content width (`@container content`) |
| RESP-003 | D1 | Two columns collapse | Tablet 768 | Dashboard and goal layouts become one column cleanly |
| RESP-004 | D1 | Touch targets | Audit J at mobile | Controls ≥ 44px high on coarse pointers: top-bar buttons, drawer items, "View all", ⓘ, footer links `[dr 2026-10-02]` |
| RESP-005 | D2 | Picker on mobile | Date picker | One month, fits the screen |
| RESP-006 | D0 | No clipped controls | Audit A `clipped` at 375 and 768 | Every option of every switch / tab strip visible or wrapped (Dashboard "All history", Cash flow tabs "Transact…", Breakdown Category/Merchant) `[dr 2026-10-02]` |
| RESP-007 | D1 | Inputs don't trigger iOS zoom | Computed `font-size` of every `input, select, textarea` at 375 | ≥ 16px (sign-in fields were 14px) `[dr 2026-10-02]` |
| RESP-008 | D1 | Tablet leaves room for content | 768 with the sidebar open | Filters collapse behind a Filters button (Loans); stat tiles stay two per row; the first screen shows content, not only filters `[dr 2026-10-02]` |
| RESP-009 | D2 | Planner fields line up | Debt / goal planner at 768 and 375 | Labels wrap above inputs consistently; inputs share one baseline `[dr 2026-10-02]` |

## THEME — light and dark

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| THEME-001 | D0 | Readability | Dark mode every screen | Text and figures readable; badges keep contrast |
| THEME-002 | D1 | Tokens switch | Compare panels/badges | No hard-coded light colours left in dark |
| THEME-003 | D2 | Charts | Dark | Series colours and gridlines visible |
| THEME-004 | D1 | Chart legends readable | Legend label colour | Ink / secondary text with a coloured swatch; never text drawn in the series colour `[dr 2026-10-02]` |
| THEME-005 | D2 | Theme switch repaints | Toggle theme with the pane visible | No stale colours after the switch (rule out the hidden pane first) |

## RTL — right to left

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| RTL-001 | D0 | Direction | Arabic: `document.documentElement.dir` | `rtl`; drawer on the right |
| RTL-002 | D1 | Logical properties | Icons, handles, chevrons | Mirrored correctly; no `left`/`right` in new rules |
| RTL-003 | D1 | Digits | Amounts | Latin digits |

## I18N — copy

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| I18N-001 | D1 | No English leaks | Audit F in ru, de, ar | None |
| I18N-002 | D2 | Long labels | German | Buttons and pills do not clip or wrap badly |
| I18N-003 | D2 | Copy matches context | Prompts and examples | e.g. mortgage prompt uses a mortgage example; greeting fits a new user `[bug 2026-10-02]` |
| I18N-004 | D2 | Labels match data | Series and card names | A line that plots investments is not called "Net worth" `[bug 2026-10-02]` |
| I18N-005 | D1 | No local defaults for everyone | Sample workspace and new-account currencies | Only the country's currency (USD in the sample) is preselected; no UZS or other local default for everyone (AGENTS § Languages) `[dr 2026-10-02]` |

## A11Y — accessibility

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| A11Y-001 | D1 | Names | Audit E (buttons, links, inputs, selects) | Every control has a name (Budget Planned inputs had none) `[dr 2026-10-02]` |
| A11Y-002 | D1 | Focus visible | Tab through, including text fields | Visible ring on every focusable element; fields get the brand border and halo, not the light grey `#dcd9d6` ring `[dr 2026-10-02]` |
| A11Y-003 | D1 | Pressed / expanded state | Toggles, menus | `aria-pressed` / `aria-expanded` reflect state |
| A11Y-004 | D1 | Contrast | Audit I in light and dark | ≥ 4.5:1 for text, including secondary grey on the page grey, unselected segmented options, table group headers, Budget Remaining pills and status pills `[dr 2026-10-02]` |
| A11Y-005 | D2 | Live updates | Toasts, drag | Announced politely |

## MOT — motion and animation

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| MOT-001 | D1 | Reduced motion respected | For every `animation`/`transition` in `app/globals.css` and `components/*.module.css`, a `prefers-reduced-motion: reduce` rule turns it off | No moving element left (shimmer, reveal, chevrons, rows, onboarding steps, landing window) |
| MOT-002 | D0 | Content visible without JavaScript | Landing / sign-in served HTML (`curl -s <url>` and check `.reveal` styles) | Server-rendered sections never start at opacity 0 waiting for JS `[dr 2026-10-02]` |
| MOT-003 | D2 | Restrained motion | `document.getAnimations()` while idle on each screen | Nothing loops except loading skeletons; durations ≤ 300ms for UI transitions |
| MOT-004 | D2 | No layout shift on state change | Open/close disclosures, switch segments | Surrounding content does not jump; height animates or snaps cleanly |

## REF — Reference patterns adopted (UI-AGENT.md)

| ID | Sev | Case | Expect |
|---|---|---|---|
| REF-001 | D1 | Dashboard | Two columns of cards; Customize = handle + name + switch; cross-column drag |
| REF-002 | D1 | Goals | Ordered rows beside "Available for goals"; tools in dialogs |
| REF-003 | D1 | Add goal | Full-screen stepper (Select, Targets, Contribution, Budget) with live preview |
| REF-004 | D1 | Screens lead with content | The list or figure first; settings/logs behind a button or side panel (Investments settings form was inline) `[dr 2026-10-02]` |
| REF-005 | D2 | Transactions | Inline category change with "Create rule" toast; Edit multiple |

## SCR — screen-specific cases

Every screen named in `SKILL.md` §1 (screen map) has at least one case here
(enforced by `tests/qa-design-catalogs.mjs`). Columns: ID, severity, screen, case, expect.

| ID | Sev | Screen | Case | Expect |
|---|---|---|---|---|
| SCR-001 | D2 | dashboard | Allocation hues distinct | No two allocation categories share a near-identical hue (Property / Treasury bill / Valuables were all purple, Crypto / Business both gold); percentages one decimal `[dr 2026-10-02]` |
| SCR-002 | D1 | dashboard | Customize dialog | Each row: handle, card name (same as the card title), switch; Reset to default |
| SCR-003 | D2 | dashboard | Chart legend and tooltip | Legend swatches with ink text; tooltip dates via `formatDate`, amounts whole |
| SCR-004 | D1 | accounts | Grouped accounts | Collapsible `.account-group` per type with group total; per-currency totals listed, not added |
| SCR-005 | D1 | accounts | Hero and activity | Net-worth hero at `--type-hero`; activity dates `formatDate`; "Reconcile statement" disabled only with a reason |
| SCR-006 | D1 | transactions | Summary tiles | Income green only when > 0; spending ink; largest and net via `signTone` `[dr 2026-10-02]` |
| SCR-007 | D1 | transactions | Day groups and chips | Day header totals use "−"; category chips are `CategoryBadge`; stacked cards below 720px |
| SCR-008 | D1 | cash-flow | No repeated figures | The month's income / spending / net appear once (the second Income / Expenses / Total savings row is gone) `[dr 2026-10-02]` |
| SCR-009 | D1 | cash-flow | Switches fit | Month/Quarter/Year, Bars/Sankey and Category/Merchant `Segmented` controls fully visible at 375 `[dr 2026-10-02]` |
| SCR-010 | D1 | budget | Rollover is visible | A category whose remaining exceeds plan − actual shows "+$N rolled over"; group plan equals the sum of its rows `[dr 2026-10-02]` |
| SCR-011 | D1 | budget | Planned inputs | `FormattedNumberInput` with an accessible name per category; names wrap at 375 `[dr 2026-10-02]` |
| SCR-012 | D1 | recurring | Calendar matches the list | Every item in the list for the month (incl. debt repayments and loan instalments) appears on its calendar day `[dr 2026-10-02]` |
| SCR-013 | D2 | recurring | Row actions | Record payment inline; Skip / Stop / Edit in `RowMenu`; status pill sized to content at 768 `[dr 2026-10-02]` |
| SCR-014 | D1 | investments | Target allocation starts from holdings | Default weights equal the current mix (never 100% cash suggesting a sale of everything else); numbers right-aligned `[dr 2026-10-02]` |
| SCR-015 | D1 | investments | Filters and settings | Category filters are `Segmented`; comparison settings sit behind a button / dialog, not inline `[dr 2026-10-02]` |
| SCR-016 | D1 | loans | Rows and filters | Same action set on every row (Record payment everywhere, disabled with reason in sample); filters collapse at 768 `[dr 2026-10-02]` |
| SCR-017 | D2 | loans | Debt planner | Hint behind ⓘ (no "Only debts in USD…" line); labels and inputs aligned; both payoff methods labelled so different totals read as different methods `[dr 2026-10-02]` |
| SCR-018 | D1 | goals | Goal rows | Money goals show money; unit goals (BTC) say the unit ("1.15 of 1.5 BTC"), not a bare "77%"; names wrap at 375 `[dr 2026-10-02]` |
| SCR-019 | D2 | goals | Goal chart | Round axis ticks; "Today" label clear of the target line; hint behind ⓘ `[dr 2026-10-02]` |
| SCR-020 | D1 | goals | Add-goal stepper | Continue truly disabled (and looking it) until a goal is picked; preview updates live; whole-amount suggestions `[dr 2026-10-02]` |
| SCR-021 | D1 | assistant | Disabled states | Not configured and sample: text box disabled-looking, no resize grip, reason shown once `[dr 2026-10-02]` |
| SCR-022 | D2 | recently-deleted | Empty and list | `EmptyState` "No deleted items" (no full stop), no pagination; rows show type icon, deleted date, Restore `[dr 2026-10-02]` |
| SCR-023 | D1 | settings | Layout and headings | Aligned with every other page (no extra indent); section headings smaller than the page title; hints behind ⓘ `[dr 2026-10-02]` |
| SCR-024 | D1 | settings | Category and currency lists | Categories reorder with handles, `CategoryIcon` + colour; currency catalogue only here |
| SCR-025 | D1 | onboarding | Steps | Tokens only (no lime); progress, Back keeps values; date card copy matches picker limits; reduced motion respected `[dr 2026-10-02]` |
| SCR-026 | D1 | sign-in | Card | Single centred card; fields 16px; labels ≥ 13px; small print ≥ 12px; no language selector; Terms / Privacy links ≥ 24px targets `[dr 2026-10-02]` |
| SCR-027 | D1 | landing | Header and footer | Round theme toggle matching the pill buttons; footer logo text same colour as the header's; nav links ≥ 44px on touch `[dr 2026-10-02]` |
| SCR-028 | D1 | landing | Sample figures and claims | Figures through shared formatters; every claim matches the privacy policy and a real feature (`tests/landing-page.mjs`) |
| SCR-029 | D2 | legal | Terms and privacy pages | Readable measure (≤ 75ch), headings on the type scale, links between the two, both themes readable, no operator country named |
| SCR-030 | D1 | account-access | Sign-up, recovery and email-confirm card | Same card style as sign-in; fields 16px; errors inline under the field; Brand header |
| SCR-031 | D1 | connect | Telegram connect and Telegram sign-in pages | Each state (loading, confirm, connected, expired, cancelled, error) has a clear title and one primary action; skeleton while loading |
| SCR-032 | D2 | dashboard | Spending card second line | A short live comparison ("$29 more than last month by this day") is allowed (HEAD-003); any explanation of how it is measured sits behind ⓘ, never as a sentence `[dr 2026-10-02]` |
| SCR-033 | D1 | reports | Reports tabs, P&L table and tax sheet | One PageHeader with the business filter and range; Breakdown/Trends and chart switches are `Segmented`; P&L rows indent by level with totals shaded; amounts whole; drill chip removable; tax disclaimer visible, explanations behind ⓘ |
| SCR-034 | D1 | cash-flow | Forecast view | Horizon is `Segmented` in the panel title; three `StatTile`s (lowest balance toned by `signTone` only when negative); chart uses the shared area style with a dashed zero line only when the axis goes negative; explanation behind ⓘ |
| SCR-035 | D1 | cash-flow | Forecast warning and events | Below-zero warning uses the caution tone (never red) with ⓘ; events table stacks into cards below 720px with month totals in the group row; what-if form fields wrap at 375 |
| SCR-036 | D1 | recurring | Subscriptions panel | `PanelTitle` with Count and ⓘ, totals listed per currency (never added); price rise and possibly cancelled use the caution `.status-badge`, never red; amounts whole; actions only in the ⋯ `RowMenu`; rows stack below 720px |
