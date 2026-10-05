# Design regression catalog

Severity if failed: **D0** broken/unreadable, **D1** written rule broken, **D2** polish.
Each case says how to measure it. IDs are stable; append, never renumber.
`[bug 2026-10-02]` marks a defect found in the 2 October QA pass; `[dr 2026-10-02]`
marks one found in the 2 October full design review. Audits A–K are in `SKILL.md` §3.

Run log (newest first): 2026-10-02 full review of 14 screens at 1440/1280/768/375,
light and dark, sample workspace; fixes in 9c08db8,
re-checked by audits only (pane hidden). Not yet run: legal, account-access, connect,
Arabic and German layouts.

Coverage audit 2026-10-03: 172 cases were added from the source (rules in AGENTS.md / UI-AGENT.md, shared pieces, every screen), not yet measured live.

Token reference (app/styles/foundation.css): `--type-micro` 12px, `--type-caption` 13px,
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
| TOK-007 | D2 | Selectors defined once | grep `app/styles/*.css` for repeated selectors | One rule per selector; unused classes removed (e.g. `.budget-unallocated`) |
| TOK-008 | D1 | No literal px font sizes in CSS | `grep -c 'font-size:[0-9.]*px' app/styles/*.css components/*.module.css` | Zero outside `:root` token definitions (was 77) `[dr 2026-10-02]` |
| TOK-009 | D1 | One brand in both themes | Compare `--brand`, logo colour and accent fills light vs dark | Teal in both (dark `#5cc8b9`); no lime `#c4f36b`; landing closing band not a full-width accent block in dark `[dr 2026-10-02]` |
| TOK-010 | D1 | Literal px font sizes left | `grep -no 'font-size:[0-9.]*px' app/styles/*.css components/*.module.css` and `grep -n 'clamp([0-9]*px' components/*.module.css` | Only emoji tile rules remain (category-icon, goal covers); `.account-list-title>.business-mark` 10px (globals.css ~2271), sign-in `.cardHeading h1` 28px and landing `.pillarList strong` clamp(17px…) use `--type-*` tokens |
| TOK-011 | D1 | No literal colours in business rules | `grep -n '#fff' app/styles/*.css` and `grep -n '#000' app/styles/*.css` within `.business-mark`, `.business-color-field` | Initial colour and swatch inset ring come from tokens (`--primary-foreground`, `--hairline`), not `#fff` / `#000` |
| TOK-012 | D1 | Business and tag palette has a dark variant | `getComputedStyle(.business-mark).backgroundColor` and `.tag-chip-dot` background in light and dark | `paletteColor()` adapts per theme (it returns the same hsl 46% lightness in both); dot ≥ 3:1 against the card in dark |
| TOK-013 | D2 | Radii from tokens on new pieces | Audit D radii on Settings, Reports, Transactions (Edit multiple on) | Cards `--radius-card`, controls `--radius-control`, pills 999px; no 14px settings tab list, 12px segmented, 9px segment, 7px/5px business marks or 12px `.error` literals |
| TOK-014 | D1 | No outer margins inside `.content` | `getComputedStyle(el).margin` for `.content > *`, `.settings-layout .panel`, `.content > .error` | 0 on every side; spacing only from the flex gap (Settings panels carry `margin:0 0 16px`, `.error` `12px 0`) |
| TOK-015 | D2 | No inline layout styles | `grep -rn 'style={{ margin' components app` | None (sign-in "Continue with phone" has `marginTop: 10`); only custom-property or width styles remain |
| TOK-016 | D1 | One red token | `grep -rn 'var(--destructive)' components/*.module.css app/styles/*.css` outside button variants | Form errors use `--negative` everywhere (onboarding `.error` uses `--destructive`) |

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
| TYPE-008 | D1 | Public card titles share one size | Computed `font-size` of the h1/h2 title on /sign-in, /auth/access?mode=signup, /auth/access?mode=recover, /connect/telegram, /auth/telegram | One token size on all five (sign-in h1 is a literal 28px, others are panel h2) |
| TYPE-009 | D2 | Tabular numerals in new figure columns | `getComputedStyle(x).fontVariantNumeric` on `.pnl-table td`, `.report-transaction-list li strong`, `.tax-category>strong`, `.tax-line-heading>strong`, `.business-card-net strong`, `.budget-left-summary dd` | `tabular-nums` on every one |
| TYPE-010 | D1 | Sankey labels do not collide | Reports › Cash flow › Sankey, sample workspace, 1280 and 768: compare `getBBox()` of every `.sankey-label` pair | No two label boxes intersect; label size ≥ 12px (`--type-micro`) |
| TYPE-011 | D2 | Uppercase copy is not double-cased | Landing eyebrow keys ("YOUR MONEY. THE WHOLE PICTURE.") and onboarding `.stepLabel` in tr and de | Upper case comes from CSS on a translated string with the page `lang` set, so Turkish shows "İ"; no locale string is stored in capitals |

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
| HEAD-009 | D1 | Setup steps lead with the question | Audit B inside the business setup flow (Start, Businesses, Accounts, Done) | No `.goal-setup-note` prose under the h1 ("Business tracking suits income…", "No business bank account?…"); explanation behind ⓘ or one short line at most |
| HEAD-010 | D1 | Dialogs carry no grey explanation | Audit B with Edit businesses, Rule, Edit multiple and Preview export open | No visible description sentence ("Transactions follow the business of their account.", "New bank statement imports follow the rule too…", "Select only income or only expenses…"); hints behind ⓘ |
| HEAD-011 | D1 | Panels open with PanelTitle | Reports transactions panel: `.report-transactions h2` vs `.panel-title h2`, presence of `.count` | Uses `PanelTitle` with a `Count` pill, not a bare h2 plus muted "N transactions" text |
| HEAD-012 | D1 | One h1 per public page | `document.querySelectorAll('h1').length` on /connect/telegram, /auth/telegram, /auth/access, /auth/confirm, /terms, /privacy, /sign-in, onboarding | Exactly 1 (connect, Telegram sign-in and account access render only an h2) |
| HEAD-013 | D2 | Card controls sit in the heading row | Dashboard Business tracking card: position of the Period select vs `.panel-title` | Period select inside the `PanelTitle` aside beside Net income / Net assets, not a separate row under it |
| HEAD-014 | D2 | Status lines are status, not prose | Reports: "{count} transactions in other currencies are left out…" and "Reports cover up to 24 months." | Rendered as a status element (`role=status`, `PartialTotal`-style), not a muted `<p>` paragraph under the tiles |

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
| FMT-014 | D1 | Zero net carries no tone | Reports P&L "Net cash flow" row, tax `.tax-net strong`, Preview export total with a period that has no transactions; `grep -rn "< 0 ? 'negative' : 'positive'" components` | Ink colour for 0; tone from `signTone`; grep returns nothing (P&L, tax sheet and tax export dialog colour 0 green) |
| FMT-015 | D1 | Report period label | Breakdown / Trends heading `.panel-figure` for This year, Last month and a custom range ending in the future | "<formatDate from> – <formatDate end>" with the end clipped to today; localised month names in ru and uz; never a numeric date |
| FMT-016 | D1 | Summary with nothing in it | Reports Summary for an empty custom range | Total transactions 0, Largest and Average "—", First and Last transaction "—"; no "$NaN" or "Invalid date" |
| FMT-017 | D1 | Signed report rows | Audit C on `.report-transaction-list` | Income "+$X" green, spending "−$X" (U+2212) ink, whole amounts |
| FMT-018 | D1 | Tax sheet money | Audit C on Reports › Business tax prep and inside Preview export | Whole amounts on every line and tile; manual lines read "Work out by hand", never "$0" |
| FMT-019 | D1 | Rule amount range inputs | Rule dialog › More conditions › Amount From/To: type 1500.5; clear the field; type 0 | "1,500.5" while typing; blank stays blank (no criterion); 0 is kept as 0 on reopen; error "The upper amount must not be below 1,500.5" uses `formatNumber` |
| FMT-020 | D2 | Counts in new rows read singular | One business with 1 account (Settings › Businesses), a tag on 1 transaction, a tax category with 1 transaction, Edit multiple with 1 selected | "1 account", "1 transaction", "Edit 1 transaction"; never "1 accounts" or "1 transactions" |
| FMT-021 | D1 | Business card figures | Dashboard Business tracking, Net income and Net assets modes | Whole amounts; a loss shows "−$X" with "Net loss" under the name; net assets with a debt-only business show "−$X" |
| FMT-022 | D1 | Value axes fit long amounts | Reports Trends with a month above $1,000,000 (sample: Yearly interval) | Y-axis labels compact ("$1.2M"), not clipped at the left edge (label `getBBox().x ≥ 0`) |

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
| COMP-019 | D0 | BusinessMark initial is readable | Audit I on `.business-mark` for each of the 10 palette colours (setup flow colour swatches, light and dark) | Initial ≥ 4.5:1 on every colour (white on amber, orange, green, teal at 46% lightness fails); logo `object-fit: cover`; sizes 24 / 38 / 56px |
| COMP-020 | D1 | BusinessFilter trigger and popover | Reports, Transactions and Accounts with 2 businesses: open the filter, pick none, one, two | Label "All businesses" / the name / "2 selected"; Household 🏠 first; check mark on chosen rows; long names ellipsised inside the 260px trigger with the full name exposed |
| COMP-021 | D1 | TagChip with a long name | Create "QA" + 56 characters tag, apply to a transaction, view at 375 | Chip ellipsises inside the row (Audit A `out` empty); the dot keeps its colour; name still readable in Settings › Tags |
| COMP-022 | D1 | Unselected tags readable | Audit I on `.tag-selector` buttons in Rule dialog and Edit multiple | Unselected chip text ≥ 4.5:1 (opacity .62 fails); selected shown by the check icon as well as the ring |
| COMP-023 | D1 | Colour swatches as a radio group | Tag dialog and setup flow Colour: Tab into the group, press arrows | One tab stop, arrow keys move the choice, selected ring ≥ 3:1 in both themes, each swatch named ("Teal") |
| COMP-024 | D1 | InfoHint popover | Open the ⓘ on Reports, Settings › Businesses, Tags, Rules at 375 | Opens on click and Enter; content ≤ 340px and inside the viewport; Escape closes and returns focus to the ⓘ |
| COMP-025 | D2 | Count pill beside its title | Accounts with a business filter: "Other assets and debts" panel | `Count` passed as `count` sits next to the title, not pushed to the far end as an aside |
| COMP-026 | D1 | ResourceState and InlineError | Block one fetched resource (Tags) then retry | Skeleton first, then `.error` with Retry inside the panel; after Retry the list renders; no full-page error |
| COMP-027 | D2 | PartialTotal | A total with an excluded currency (sample with a currency missing a rate) | "Partial total · Excluded currencies: EUR" as `role=status`, wraps at 375, caution style not red |
| COMP-028 | D1 | ExchangeRatePreview | Record dialog with a second currency: loading, failed (block rates), loaded | "Loading exchange rate…" status, then `InlineError` with Retry, then "1 USD = 0.92 EUR · ECB · effective 2 October 2026" (≤ 8 decimals, no trailing zeros, `formatDate`) |
| COMP-029 | D1 | CurrencySelect options | Add expense with two preferred currencies; edit a record saved in a third currency | 2 options for a new record; 3 when editing (the saved one kept); labels via `currencyLabel` in the current language |
| COMP-030 | D1 | RowMenu destructive item | Open ⋯ on a business, a tag, an account | Delete last and in the destructive colour; menu aligned to the row's inline end (start in RTL); menu has ≥ 2 items |
| COMP-031 | D1 | ConfirmDialog behaviour | Delete a tag and a rule; press Escape while "Deleting…" | Title names the item ("Delete QA trip?"); destructive button red; both buttons disabled while busy; Escape ignored while busy |
| COMP-032 | D0 | DrawerLink keeps the sample workspace | In the sample, click the business card name, its bars, its net, "Explore business tax tools" | Reports opens with sample data and the right tab/view; no full reload to the landing page; Shift+click opens a new tab |
| COMP-033 | D1 | Rules use the shared row actions | Settings › Rules and Transactions › Rules list | Delete sits in `RowMenu` (or the same pattern as Businesses and Tags); no lone inline trash icon |
| COMP-034 | D1 | Empty states are EmptyState | `document.querySelectorAll('.budget-left-empty').length` on Reports (empty range) and Settings › Rules with no rules | 0; Sankey, donut and rule list use `EmptyState` with icon and one short line ("No rules yet…" is two sentences) |
| COMP-035 | D1 | Dialog footers use FormFooter | `grep -rn 'className="record-form-footer"' components` outside form-footer.tsx | No hits (Preview export, Edit businesses and Rules dialogs build the row by hand) |
| COMP-036 | D2 | Business net bars | Business card at 1280 and 375 | 56×28px sparkline, profit up in `--positive`, loss down in `--negative`, a baseline; link named "Cash flow trend for <name>" |
| COMP-037 | D1 | New disabled controls say why | Audit H on Reports (empty range), Preview export with no lines, tax transaction rows in the sample, Edit multiple with 0 selected | "Download CSV", "Download prep sheet", "Edit 0" and disabled rows carry a title or hint |
| COMP-038 | D2 | Segmented radius and height | `getComputedStyle(.segmented)` and its buttons | Track `--radius-control`, buttons inset radius consistent; 36px desktop, ≥ 44px on coarse pointer |

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
| LIST-009 | D1 | Report transaction row anatomy | Reports transactions at 1280 and at a container < 600px | Icon, name with "date · category", business mark + name, signed amount at the end; below 600px the business moves under the name and the amount spans both lines |
| LIST-010 | D1 | P&L table structure | Reports › Cash flow › Profit & loss, Both rows: `th` padding-inline-start per level, `[data-kind=total]` background, `td` text-align | Indent 12 + 20px per level (0–3); totals shaded; subtotals weight 500; amounts `end` aligned, nowrap |
| LIST-011 | D1 | P&L at phone width | Same table at 375 with long category names | Two columns fit without horizontal scroll; names wrap; amounts on one line |
| LIST-012 | D1 | Tax lines | Business tax prep, Schedule C and general templates | Line number badges only for Schedule C; empty lines muted and indented; category cards three columns, two below a 640px container with the Move select full width |
| LIST-013 | D2 | Settings rows line up | Settings › Businesses and Tags with 3 rows each | Handle, mark or chip, name + meta, link, ⋯ align in columns across rows; tag rows' empty name spacer does not shift the count link |
| LIST-014 | D1 | Setup accounts grouped | Business setup › Accounts with cash, deposit and a loan | Group headings by type, each row icon + name + "kind · balance" + Business select; under a 520px container the select drops under the name |
| LIST-015 | D1 | Selection mode rows | Transactions › Edit multiple: select 3, scroll | Checkbox at the row start, selected rows tinted (`data-selected`), row click toggles instead of opening; bulk bar stays visible below the top bar at 1280 and 375 |
| LIST-016 | D1 | Tags and business in transaction rows | Row with 3 tags and a business at 375 | Tags wrap under the name; business pill only once a business exists; amount stays on one line and right-aligned |
| LIST-017 | D2 | Report list paging | Range with > 25 transactions | 25 rows, "Show more" adds 50; heading count is the full total |

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
| DND-008 | D1 | Rules are reorderable | Settings › Rules and Transactions › Rules with 3 rules | Six-dot handle per row, drag with pointer and keyboard, order persists after reload (UI-AGENT lists rules; today the list has no handles) |
| DND-009 | D1 | Businesses and tags reorder and persist | Drag a business and a tag in Settings, reload, reopen the BusinessFilter and the tag selector | New order kept (`business_order`, `tag_order`); selected item stays selected; keyboard drag announced "Move <name>" |
| DND-010 | D2 | Dragged settings row keeps its surface | Drag a `.settings-list` row in dark mode | Lifted row has card background and `--shadow-card`; rows behind are not visible through it |
| DND-011 | D1 | Business card in Customize | Dashboard › Customize | "Business tracking" row with handle, name and switch; handle label "Move Business tracking"; card drags between columns |
| DND-012 | D1 | Disabled reordering looks disabled | Settings lists while the order cannot save (sample, or block `workspace_preferences`) | Handles hidden or disabled with a reason; a failed save rolls back with the error popup |

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
| STATE-009 | D1 | Reports loading | Live test account, throttle network, switch range | `PanelSkeleton` with 6 rows; header, tab strip and tiles positions do not jump (compare `getBoundingClientRect().top`) |
| STATE-010 | D1 | Reports failure | Block `/api/planning` on Reports and on the tax tab | `InlineError` with Retry in place of the content; header and tabs stay; Retry recovers |
| STATE-011 | D1 | Reports empty | Test account with no transactions, every tab | Tiles "$0" in ink, Savings rate "—", Sankey / donut / transactions show `EmptyState`, no "$0–$1" axis, Download CSV disabled with a reason |
| STATE-012 | D1 | Tax tab without a business | No businesses; open /reports?tab=tax | Tab hidden; Cash flow shown and pressed; no empty tax sheet |
| STATE-013 | D1 | Tax sheet empty | A business with no transactions | `EmptyState` "No business transactions" in a panel; "Include all categories" reveals every line at "$0" |
| STATE-014 | D1 | Business card states | No business; loading (throttle); a business with no transactions | Empty state with "Set up business tracking"; 2-row placeholder; "$0" in ink with "Net profit" |
| STATE-015 | D1 | Settings business lists empty and failing | No businesses, no tags; block `/api/tags` | "No businesses yet." and "No tags yet." as `EmptyState`; Tags shows `InlineError` with Retry |
| STATE-016 | D1 | Busy states in new forms | Slow network: setup Next, Save tag, Apply changes, Save rule, Download prep sheet | Button text "Saving…" / "Preparing…", fields disabled, Back and Close disabled, dialog cannot be dismissed mid-save |
| STATE-017 | D1 | Logo errors are inline | Setup flow › Upload logo with a GIF (upload needs the user's OK) | "Choose a PNG, JPEG or WebP image." under the logo field with `role=alert`; the mark keeps its initial |
| STATE-018 | D1 | Tag limit is visible | Rule dialog: select 10 tags, click an 11th | A visible message or disabled chips explaining the 10-tag limit; never a silent ignore |
| STATE-019 | D1 | Connect Telegram states | /connect/telegram: loading, error (block the API), sign in, confirm, expired, cancelled | Skeleton; alert + Retry + Cancel; each state one primary action; "Open Telegram" only when the bot is known |
| STATE-020 | D1 | Phone code step | Sign-in › Continue with phone › Send code | Code field numeric with one-time-code; "Send a new code in 60 s" counts down disabled, then "Send a new code"; errors under the fields with `role=alert` |
| STATE-021 | D2 | Unsaved setup is not lost on error | Setup flow › Businesses, block the save, press Next | Error popup, step stays, typed names and colours kept; retry does not create a duplicate |

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
| DLG-010 | D1 | Discard guard on new forms | Type in Rule, Tag, Edit multiple sheet and business setup, then press Escape or Close | Discard prompt before losing input (each closes silently today) |
| DLG-011 | D1 | Business setup is a full-screen stepper | Open Set up business tracking at 1280 and 375 | Header Back · steps (aria-current) · Close, progress bar, footer Skip on Accounts and Next / Finish; focus moves to the step h1 |
| DLG-012 | D1 | Edit multiple sheet | Select 5, Edit 5, at 375×812 with 20 tags | Width min(420px, 100%); title "Edit 5 transactions"; Cancel / Apply changes always reachable (footer sticky or sheet scrolls to it); no horizontal scroll |
| DLG-013 | D2 | Rule dialog title names the action | Click "Add rule", then edit a rule | Titles "Add rule" and "Edit rule", not "Rule" |
| DLG-014 | D1 | Preview export dialog | Open Preview export in en and de at 375 | Summary table amounts end-aligned; File format and Detail `Segmented` fully visible or wrapped ("With transactions" not clipped); Cancel + Download in FormFooter order |
| DLG-015 | D1 | Pickers inside dialogs | Rule dialog category / business pickers and Edit multiple pickers | Popover above the dialog, scrolls internally, closes on pick; Escape closes only the popover, then the dialog |
| DLG-016 | D2 | Edit businesses dialog | Accounts › Edit businesses, change one account | Toast "<name> moved to <business> with N transactions"; selects disabled while saving; single Done in FormFooter style; rows two-line under 520px |
| DLG-017 | D1 | Initial focus in new dialogs | `document.activeElement` after opening Tag, Rule, Edit multiple, Preview export | First field (Name, the name pattern, Category picker, File format); never the close button |

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
| RESP-010 | D0 | Reports at 375 | Audit A on every Reports tab | `out` empty; tab strip (Cash flow, Spending, Income, Business tax prep) fully visible or wrapped; Breakdown/Trends, chart type, interval, series and Rows switches wrap; header filter and range select fit |
| RESP-011 | D1 | Sankey on narrow screens | Reports Sankey at 375 and 768 | A deliberate scroll area (min 480 / 720px) whose labels are not cut by the 150 / 220px margins, or a stacked alternative; page itself never scrolls sideways |
| RESP-012 | D1 | Donut breakdown reflows | Spending › Donut at 1280, 768, 375 | Donut and legend side by side ≥ 640px container, stacked below; legend bars not clipped |
| RESP-013 | D1 | Tax prep tools at 375 and 768 | Audit A on the tax tab | Business, year, period (5 options), Lines, Include all categories and Preview export wrap; no clipped segment; category rows two columns |
| RESP-014 | D0 | Settings tab strip with eight tabs | Settings at 375 and 768: Audit A `scrollers` and `clipped` | Every tab reachable and visible or wrapped; the active tab never half hidden (Businesses, Tags, Rules added) |
| RESP-015 | D1 | Transactions filters with businesses and tags | 375 and 768 with 2 businesses and 3 tags | Search, period, category, business, tag and Type wrap; first screen still shows rows (RESP-008); bulk bar wraps cleanly |
| RESP-016 | D1 | Business setup at 375 | Each step | Step labels fit or collapse; choice tiles one column; account select under the name; footer buttons ≥ 44px |
| RESP-017 | D1 | Business card in a narrow column | Dashboard at 1280 with sidebar, 768 and 375 | Mark, name, bars, net never overflow; names wrap; net never truncated |
| RESP-018 | D1 | Touch targets on new controls | Audit J at 375 on Reports, tax prep, Settings Businesses/Tags/Rules, Rule dialog | `.pnl-toggle` (22px), `.pnl-drill` (24px), `.report-drill` X (20px), colour swatches (26px), business filter trigger (36px), tag chips, `.rule-more` summary all ≥ 44px |
| RESP-019 | D1 | New inputs at 16px | RESP-007 measure on Rule name, New tag, business Name, setup Notes textarea, Transactions search, tax selects at 375 | ≥ 16px computed font size |
| RESP-020 | D2 | Landing at 320 | Audit A on / at 320×640 | Hero heading, both CTAs and the product window fit; footer two columns without overflow |

## THEME — light and dark

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| THEME-001 | D0 | Readability | Dark mode every screen | Text and figures readable; badges keep contrast |
| THEME-002 | D1 | Tokens switch | Compare panels/badges | No hard-coded light colours left in dark |
| THEME-003 | D2 | Charts | Dark | Series colours and gridlines visible |
| THEME-004 | D1 | Chart legends readable | Legend label colour | Ink / secondary text with a coloured swatch; never text drawn in the series colour `[dr 2026-10-02]` |
| THEME-005 | D2 | Theme switch repaints | Toggle theme with the pane visible | No stale colours after the switch (rule out the hidden pane first) |
| THEME-006 | D1 | Reports in dark | Audit I and screenshots in dark on every Reports tab | Sankey links visible, P&L total shading visible, drill chip and tax line badges readable, no white tooltip boxes |
| THEME-007 | D2 | Chart tooltips follow the theme | Hover a Trend bar, donut slice and Sankey link in dark | `.recharts-default-tooltip` background is the card token and text the ink token |
| THEME-008 | D1 | Public pages in dark | Landing, sign-in, /terms, /auth/access, /connect/telegram, /auth/telegram, onboarding in dark: Audit I | All text ≥ 4.5:1; cards on the dark page token; Google mark keeps its colours |
| THEME-009 | D2 | Theme on the phone landing | Landing at 375 (theme toggle hidden) with the OS in dark | Page follows `prefers-color-scheme`; nothing light-only |
| THEME-010 | D1 | Business logos in dark | A transparent PNG logo on a business mark in dark | Palette colour shows behind it; logo stays visible |

## RTL — right to left

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| RTL-001 | D0 | Direction | Arabic: `document.documentElement.dir` | `rtl`; drawer on the right |
| RTL-002 | D1 | Logical properties | Icons, handles, chevrons | Mirrored correctly; no `left`/`right` in new rules |
| RTL-003 | D1 | Digits | Amounts | Latin digits |
| RTL-004 | D1 | Physical properties left in CSS | grep for margin-left, margin-right, padding-left, padding-right, text-align:left, text-align:right, left:, right:, border-left in app/styles/*.css and components/*.module.css | Zero in rules touched since 9c08db8; known offenders mirrored: `.count` margin, `.error` Retry margin, `table` text-align, `.records td.amount`, `.date-picker-presets` border, settings tabs, sign-in password, onboarding `.option` and `.optionMark`, landing `.nav` padding |
| RTL-005 | D0 | Password field in Arabic | /sign-in and /auth/access in ar (Accept-Language) | Show-password button at the inline end (left); typed text never runs under it |
| RTL-006 | D1 | Directional icons mirror | Arabic: landing and sign-in arrows, phone Send code, onboarding Continue / Back, setup Back, date picker month arrows, Budget month navigator | Arrows point with the reading direction (mirrored or swapped); chevrons for months move the right way |
| RTL-007 | D1 | Reports in RTL | Arabic, Reports P&L and transactions | Indent on the right (`padding-inline-start`); folded chevrons point left; drill chip X at its end; amounts Latin digits with "−" kept before the symbol |
| RTL-008 | D1 | Charts in RTL | Arabic: Trends, donut, Sankey | Axis and label text readable (not reversed); Sankey labels on the correct sides of their nodes; legend aligned to the start |
| RTL-009 | D1 | Sheets and drawers in RTL | Arabic: Edit multiple sheet, mobile drawer | Slide in from the left; close button and footer mirrored |
| RTL-010 | D0 | Server-rendered RTL | `curl -s -H 'Accept-Language: ar' <host>/` and `/sign-in` | Root of the page has `dir="rtl"` and `lang="ar"` in the served HTML before JavaScript |
| RTL-011 | D2 | Legal page language marks | /terms in ar | English body keeps `dir=ltr lang=en`; the translated h1 and the "This document is available in English." note carry the page language |

## I18N — copy

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| I18N-001 | D1 | No English leaks | Audit F in ru, de, ar | None |
| I18N-002 | D2 | Long labels | German | Buttons and pills do not clip or wrap badly |
| I18N-003 | D2 | Copy matches context | Prompts and examples | e.g. mortgage prompt uses a mortgage example; greeting fits a new user `[bug 2026-10-02]` |
| I18N-004 | D2 | Labels match data | Series and card names | A line that plots investments is not called "Net worth" `[bug 2026-10-02]` |
| I18N-005 | D1 | No local defaults for everyone | Sample workspace and new-account currencies | Only the country's currency (USD in the sample) is preselected; no UZS or other local default for everyone (AGENTS § Languages) `[dr 2026-10-02]` |
| I18N-006 | D1 | New features translated | Audit F in de and ar on Reports (every tab), tax prep, Preview export, Settings Businesses/Tags/Rules, Rule dialog, Edit multiple, business setup | No English left except CSV / PDF and the IRS form name |
| I18N-007 | D2 | German long labels in new switches | de: Reports series "Income and expenses / Net by business", tax Detail options, Settings tab labels, Business filter trigger | No clipping or three-line wraps (Audit A) |
| I18N-008 | D1 | Tax copy fits the template | Switch Lines between Schedule C and the general template | IRS link and "Part I / Part II" only for Schedule C; disclaimer visible in every language |
| I18N-009 | D1 | No language selector when signed out | Landing, /sign-in, /auth/access, /terms, /connect/telegram: count language selects or language menus | 0; language follows Accept-Language (AGENTS § Languages) |
| I18N-010 | D1 | Language chips on the landing | Landing language sample | 30 chips; first is English; Uzbek not first; each chip has its `lang`, RTL ones `dir=rtl` |
| I18N-011 | D2 | Count placeholders in new strings | en with 1 item: "{count} selected", "Edit {count}", "Edit {count} transactions", "{count} accounts and assets" | Singular wording for 1 in every new count string |

## A11Y — accessibility

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| A11Y-001 | D1 | Names | Audit E (buttons, links, inputs, selects) | Every control has a name (Budget Planned inputs had none) `[dr 2026-10-02]` |
| A11Y-002 | D1 | Focus visible | Tab through, including text fields | Visible ring on every focusable element; fields get the brand border and halo, not the light grey `#dcd9d6` ring `[dr 2026-10-02]` |
| A11Y-003 | D1 | Pressed / expanded state | Toggles, menus | `aria-pressed` / `aria-expanded` reflect state |
| A11Y-004 | D1 | Contrast | Audit I in light and dark | ≥ 4.5:1 for text, including secondary grey on the page grey, unselected segmented options, table group headers, Budget Remaining pills and status pills `[dr 2026-10-02]` |
| A11Y-005 | D2 | Live updates | Toasts, drag | Announced politely |
| A11Y-006 | D1 | Chart drill-downs work by keyboard | Tab through Reports Sankey, donut and Trend legend | Each drill or series toggle is reachable and shows a focus ring (`.donut-slice{outline:none}` hides it), or the same drill is offered by the bars / P&L rows |
| A11Y-007 | D1 | Listbox semantics | Inspect BusinessFilter and the business picker | No buttons nested in `role=option`; checkable items (`menuitemcheckbox` or `aria-pressed` buttons) and arrow keys work |
| A11Y-008 | D1 | Transaction rows have a full name | Screen-reader name of a `.transaction-row` | Name includes amount and category, not only "View details for <name>"; Enter and Space open it |
| A11Y-009 | D1 | Fold controls state | P&L section toggles, tax line details, `.rule-more` | `aria-expanded` follows state; labels "Hide <name>" / "Show <name>"; the Count in More conditions is announced |
| A11Y-010 | D1 | Stepper semantics | Business setup and onboarding | Current step `aria-current=step`; "Step x of y" exposed; focus on the step h1 after Next and Back |
| A11Y-011 | D1 | Tag toggles | Tag selector buttons | `aria-pressed` matches state; the list is labelled "Tags"; state not shown by opacity alone |
| A11Y-012 | D2 | Decorative icons hidden | `document.querySelectorAll('button svg:not([aria-hidden]), a svg:not([aria-hidden])').length` on Settings, sign-in, onboarding, landing | 0 (settings tab icons and several ArrowRight icons lack aria-hidden) |
| A11Y-013 | D2 | Unique landmark names | Landing: labels of every `nav` | Header and footer navs not both "Product"; one `main` |
| A11Y-014 | D1 | No stray focus rings on click | Click drawer links, Segmented options and rows with the mouse | No outline after a mouse click; ring appears on keyboard focus (fix e1890bc) |
| A11Y-015 | D2 | Field errors tied to fields | Rule amount error, Tag name error, account-access password mismatch | `aria-describedby` or `aria-invalid` links the message to its field |

## MOT — motion and animation

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| MOT-001 | D1 | Reduced motion respected | For every `animation`/`transition` in `app/styles/*.css` and `components/*.module.css`, a `prefers-reduced-motion: reduce` rule turns it off | No moving element left (shimmer, reveal, chevrons, rows, onboarding steps, landing window) |
| MOT-002 | D0 | Content visible without JavaScript | Landing / sign-in served HTML (`curl -s <url>` and check `.reveal` styles) | Server-rendered sections never start at opacity 0 waiting for JS `[dr 2026-10-02]` |
| MOT-003 | D2 | Restrained motion | `document.getAnimations()` while idle on each screen | Nothing loops except loading skeletons; durations ≤ 300ms for UI transitions |
| MOT-004 | D2 | No layout shift on state change | Open/close disclosures, switch segments | Surrounding content does not jump; height animates or snaps cleanly |
| MOT-005 | D1 | New transitions respect reduced motion | `grep -n 'transition' app/styles/*.css components/*.module.css` vs the reduce rules | `.sankey-link`, `.info-hint`, landing `.pillarList button` and every other transition switched off under `prefers-reduced-motion: reduce` |
| MOT-006 | D2 | UI durations | Computed `transition-duration` / `animation-duration` on onboarding progress (.45s), steps (.42s), done mark (.5s) | ≤ 300ms for UI state changes; longer only for landing marketing reveal |
| MOT-007 | D2 | Report switches do not jump | Switch Breakdown ↔ Trends and Sankey ↔ P&L; measure the transactions panel `top` | Panel height change snaps once; no bounce or repeated reflow |

## REF — Reference patterns adopted (UI-AGENT.md)

| ID | Sev | Case | Expect |
|---|---|---|---|
| REF-001 | D1 | Dashboard | Two columns of cards; Customize = handle + name + switch; cross-column drag |
| REF-002 | D1 | Goals | Ordered rows beside "Available for goals"; tools in dialogs |
| REF-003 | D1 | Add goal | Full-screen stepper (Select, Targets, Contribution, Budget) with live preview |
| REF-004 | D1 | Screens lead with content | The list or figure first; settings/logs behind a button or side panel (Investments settings form was inline) `[dr 2026-10-02]` |
| REF-005 | D2 | Transactions | Inline category change with "Create rule" toast; Edit multiple |
| REF-006 | D1 | Reports | Like the reference reports chapter (32:15): tabs Cash flow / Spending / Income at the top, filters and range in the header, chart first, transactions list with a summary beside it, click to drill |
| REF-007 | D1 | Business setup follows the add-goal stepper | Full-screen steps with Back, progress and one primary action, as UI-AGENT requires for multi-step creation flows |
| REF-008 | D2 | Edit multiple | A side drawer from the selection bar, as in the reference transactions chapter (13:29), fields left as "Leave unchanged" |

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
| SCR-034 | D1 | reports | Cash flow tiles | Income green only when > 0; Expenses ink; Net income and Savings rate via `signTone`; Savings rate "—" with no income |
| SCR-035 | D1 | reports | Spending and Income tabs | Total + Transactions tiles; Group by shows Business only with businesses; bars capped at 15, donut at 10 with "Other" grey |
| SCR-036 | D1 | reports | Drill chip | Clicking a bar, slice, Sankey node or P&L row shows "<label>" chip with X; count updates; chip cleared on tab, range or business change |
| SCR-037 | D1 | reports | P&L folding and drill icons | Household income, each business and household expenses fold with a rotating chevron; drill icon on hover and focus, always visible on touch |
| SCR-038 | D1 | reports | Custom range | Two `DatePicker`s (from ≤ to ≤ today); "Reports cover up to 24 months." shown only beyond 24 months |
| SCR-039 | D1 | reports | Tax prep page | Disclaimer at caption size under the tools; three tiles; Net profit or loss panel at the bottom with the business mark; "Not on the sheet" section only when categories are unmapped |
| SCR-040 | D1 | reports | Tax category rows | Name with "N transactions", amount, a Move select with a screen-reader label, a Transactions disclosure; moving a category updates line totals at once |
| SCR-041 | D1 | reports | Dashboard business card | Net income / Net assets `Segmented`; rows link to Reports (P&L, trends) and Accounts with the business filter; "Explore business tax tools" link styled like other panel links |
| SCR-042 | D1 | reports | Business setup steps | Start tiles `aria-pressed`; mark preview updates live with name, colour and logo; Remove only on unsaved drafts; Accounts grouped; Done guidance cards each with one outline link |
| SCR-043 | D1 | settings | Businesses panel | Count pill; "Setup guide" outline and "Add business" default; rows show structure · accounts, "View P&L" link and ⋯ Edit / Delete; empty state |
| SCR-044 | D1 | settings | Tags panel and Tag dialog | Coloured chips; "N transactions" link opens Transactions filtered by the tag; dialog Name + Colour + Save tag; delete confirm "Delete <tag>?" |
| SCR-045 | D1 | settings | Rules panel | Rows "criteria → category icon, business mark, tag chips" wrap at 375; "Add rule" default button; delete confirm names the rule |
| SCR-046 | D1 | transactions | Rule dialog layout | Name match select + pattern on one row (stack at 375); Applies to `Segmented`; More conditions with Count; "Apply to N matching transactions" figure |
| SCR-047 | D1 | transactions | Edit multiple mode | "Edit multiple" button `aria-pressed`; checkboxes appear; bulk bar sticky; Select all ↔ Clear selection; Edit N disabled at 0 with reason |
| SCR-048 | D1 | transactions | Edit multiple sheet fields | Category replaced by a note when income and expenses are mixed; Remove tags lists only shared tags; Apply changes disabled until something changes |
| SCR-049 | D1 | transactions | Business pill, tags and links | Business pill per row only with businesses; "Moved to <business>" toast with Create rule; /transactions?tag= opens with the Tag filter and "Last 24 months" |
| SCR-050 | D1 | accounts | Business filter and marks | Filter above the list; 18px business mark beside account titles readable; "Other assets and debts" panel with a business filter; Edit businesses dialog grouped by type |
| SCR-051 | D1 | dashboard | Business tracking card | Listed in Customize, default left column; empty card's "Set up business tracking" opens the full-screen setup |
| SCR-052 | D1 | landing | Sample cards | "Sample data" pill on every card; an investment loss is not red unless owed (crypto "−1.4%" uses `.down` red); a category at its limit uses caution |
| SCR-053 | D1 | landing | Pillar switch | `aria-pressed` on the four pillars; only the active text shows; on phones the sample sits under its own tab |
| SCR-054 | D1 | landing | Phone header | Nav links hidden, brand ≥ 44px, Sign in and Get started visible and ≥ 44px; theme follows the system |
| SCR-055 | D1 | sign-in | Phone sign-in | "Continue with phone" matches the Google button size; divider text switches; "Use email instead" / "Use a different number" ghost buttons ≥ 44px |
| SCR-056 | D1 | sign-in | Not configured | Notice `role=status` visible; Google and Sign in disabled with that notice as the reason; sample workspace still enabled |
| SCR-057 | D1 | account-access | Sign-up and check-email | Legal consent caption with Terms / Privacy links; after submit the form is replaced by "Check your email" with the icon; password mismatch says why the button is disabled |
| SCR-058 | D1 | account-access | Delete account zone in Settings › Security | Warning visible; "Type DELETE to confirm"; destructive button disabled until DELETE with a reason; backup link looks like a link |
| SCR-059 | D2 | legal | Language note and links | "This document is available in English." only when the language is not English; Last updated via `formatDate`; "Back to Hoggish" and the other document link ≥ 24px |
| SCR-060 | D1 | connect | Confirm state | Telegram and Account facts as a two-column list ("—" when missing); one warning line; a single Connect button |
| SCR-061 | D1 | connect | Telegram sign-in page | "Signing you in…" skeleton, then an alert and a "Back to sign in" link styled as a link |
| SCR-062 | D1 | onboarding | Currency cards | Pressed ring and check at the inline end; "Primary" badge; search chips; "Make X primary" link button; cards mirrored in Arabic |
| SCR-063 | D2 | onboarding | Done screen | Check mark, greeting with the display name, "Open my workspace"; focus on the h1; motion off under reduced motion |
| SCR-064 | D1 | assistant | Conversation layout | Question bubbles on the inline end, answers on the inline start (mirrored in Arabic); "Thinking…" bubble while waiting; the list scrolls to the newest turn; the footnote "The assistant can make mistakes and is not financial advice." sits once under the box at `--type-caption` |
| SCR-065 | D1 | assistant | Empty state and suggestions | Signed in and configured: four suggestion buttons wrap at 375px with no horizontal scroll and each meets the 44px touch floor; the header explanation sits behind ⓘ, not as a grey line under the title |
| SCR-066 | D1 | recently-deleted | Rows and restore | Each row shows the type icon, name, amount via `formatMoney`, "Deleted on" date via `formatDateTime` and Restore; rarely used actions sit in a ⋯ menu; rows stack at 375px with Restore still reachable |
| SCR-067 | D1 | recently-deleted | States | Loading uses `PanelSkeleton`; a failed load is `InlineError` with Retry; a failed restore shows its message once without losing the row |
| SCR-068 | D1 | cash-flow | Tabs and tiles | Overview / Income / Spending / Transactions is one `Segmented` nav; compact Monthly review tiles show "—" (not $0) while loading or on error; Net cash flow coloured by `signTone` only |
| SCR-069 | D1 | cash-flow | Sankey on a phone | At 375px the Sankey scrolls inside its card (`overflow-x:auto`) and the page itself never scrolls sideways; labels do not overlap at 768px |
| SCR-070 | D1 | budget | Month table | Planned / Actual / Remaining columns right-aligned with tabular figures; remaining pills grey near zero, green or red for expenses only, never red for income; the current month cannot move past "Today" |
| SCR-071 | D1 | budget | Year view | 12 month columns plus Total scroll inside the card at 768px and 375px; the current month column is highlighted; past months read actual "of {plan}", later months the plan |
| SCR-072 | D1 | recurring | List and badges | Rows grouped by date heading; status badge sized to its text; "Today", "Tomorrow", "in N days" and red "N days ago" via the shared formatter; income amounts green, expenses ink |
| SCR-073 | D1 | recurring | Calendar on a phone | Monday-first grid; at 375px day cells keep their numbers readable and chips truncate with a tooltip rather than overflow; today highlighted in both themes |
| SCR-074 | D1 | investments | Asset cards | Card / Compact view toggle is `Segmented`; share % one decimal; Gain/loss toned by sign; "Saved currency · Conversion unavailable" note never shows a converted figure; 12 per page with "Show more assets" |
| SCR-075 | D1 | investments | Tracker dialog | Tracker fits the viewport at 375px with the save bar visible; chart legend readable in dark mode; cash preview lines use `formatMoney`; the delete note sits behind ⓘ |
| SCR-076 | D1 | loans | Summary tiles and table | "Money owed to you", "Money you owe", "Net lending position" use `StatTile`; owed amounts red only above zero; the records table turns into stacked cards below 720px |
| SCR-077 | D1 | loans | Mortgage payment dialog | Live summary lines ("Total payment", "Remaining balance", cash after) align as a list; the over-balance warning is red text, not a toast; dialog closes with `FormFooter` |
| SCR-078 | D2 | legal | Phone and right to left | At 375px no horizontal scroll and headings wrap; in Arabic the page is right to left with lists and the back link mirrored |
| SCR-079 | D1 | cash-flow | Forecast view | Horizon is `Segmented` in the panel title; three `StatTile`s (lowest balance toned by `signTone` only when negative); chart uses the shared area style with a dashed zero line only when the axis goes negative; explanation behind ⓘ |
| SCR-080 | D1 | cash-flow | Forecast warning and events | Below-zero warning uses the caution tone (never red) with ⓘ; events table stacks into cards below 720px with month totals in the group row; what-if form fields wrap at 375 |
| SCR-081 | D1 | recurring | Subscriptions panel | `PanelTitle` with Count and ⓘ, totals listed per currency (never added); price rise and possibly cancelled use the caution `.status-badge`, never red; amounts whole; actions only in the ⋯ `RowMenu`; rows stack below 720px |
