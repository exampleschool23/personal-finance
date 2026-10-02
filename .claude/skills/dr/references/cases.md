# Design regression catalog

Severity if failed: **D0** broken/unreadable, **D1** written rule broken, **D2** polish.
Each case says how to measure it. IDs are stable; append, never renumber.
`[bug 2026-10-02]` marks a defect found in the 2 October pass.

Token reference (app/globals.css): `--type-micro` 12px, `--type-caption` 13px,
`--type-small` 14px, `--type-compact` 15px, `--type-body`/`--type-title` 16px,
`--type-heading` 20px, `--type-page`/`--type-stat` 22–26px, `--type-hero` 30–40px;
`--radius-card` 12px, `--radius-control` 10px; `--space-page` 20px; tones
`--positive`, `--negative`, `--caution`; page and rail `#f6f5f3` in light mode.

## TOK — tokens and surfaces

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| TOK-001 | D1 | Font sizes come from the scale | Audit D | Only token sizes (12, 13, 14, 15, 16, 20, 22–26, 30–40 px) |
| TOK-002 | D1 | Card radius | `getComputedStyle(.panel).borderRadius` | 12px; controls 10px |
| TOK-003 | D1 | Card surface | `.panel` background, border | White (light) / card token (dark); hairline border; `--shadow-card` |
| TOK-004 | D1 | Page and rail colour | body / sidebar background in light | `#f6f5f3` |
| TOK-005 | D1 | No literal colours in new CSS | grep new rules for `#hex`, `rgb(` outside `:root` | None; tokens only |
| TOK-006 | D1 | Page padding | `.content` padding / gap | `--space-page`; children spaced by flex gap, no outer margins |
| TOK-007 | D2 | Selectors defined once | grep `app/globals.css` for repeated selectors | One rule per selector; unused classes removed (e.g. `.budget-unallocated`) |

## TYPE — typography

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| TYPE-001 | D1 | Page title | `PageHeader` h1 size | `--type-page` |
| TYPE-002 | D1 | Figures | Stat values | `--type-stat`, medium weight, tabular numerals where columns align |
| TYPE-003 | D2 | Percent columns align | Columns of % | Same decimals ("2.0%" under "12.2%") |
| TYPE-004 | D1 | UI font | `getComputedStyle(body).fontFamily` | `--font-ui` (Inter or Onest per Settings) |

## HEAD — headings and hints

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| HEAD-001 | D1 | One-line headings | Audit B on every screen and dialog | No grey sentence under page, panel or tile headings `[bug 2026-10-02: Settings]` |
| HEAD-002 | D1 | Explanations behind ⓘ | Open each ⓘ | Text present in the hint, not on the page |
| HEAD-003 | D1 | Tile second line | StatTile subtext | A live figure (estimate, change), never prose |
| HEAD-004 | D1 | Page opens with PageHeader | Inspect | Title, ⓘ, actions: main action default Button, others outline |
| HEAD-005 | D2 | Destructive warning exception | Account security delete | Warning stays visible (allowed) |

## FMT — numbers, money, dates

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| FMT-001 | D0 | Whole money amounts | Audit C | No decimals in balances, totals, forecasts, chart labels (Sankey `$12.8` was a bug) `[bug 2026-10-02]` |
| FMT-002 | D1 | Unit prices | Stock / crypto quotes | Up to 8 decimals, no trailing zeros |
| FMT-003 | D1 | True minus sign | Audit C `hyphenMinus` | Negative amounts use "−" (U+2212) everywhere `[bug 2026-10-02]` |
| FMT-004 | D1 | Compact amounts | Chart axes, Sankey | "$2.5K" for ≥ 1,000; whole amounts below |
| FMT-005 | D1 | Dates | Any date | "2 October 2026" (localised month names); timestamps 24 h Tashkent; missing → "—" |
| FMT-006 | D1 | Amount inputs | Type 50000.75 | Grouped "50,000.75"; zero default shows empty with "0" placeholder |
| FMT-007 | D1 | Prefilled values are values | Scheduled payment dialog | Real value, not a placeholder that blocks Save `[bug 2026-10-02]` |
| FMT-008 | D1 | Source rules | grep `components/` | No inline `Intl.`, `toLocaleString`, `toFixed`, native `type="date"`, raw number inputs for money |
| FMT-009 | D2 | Plurals | "1 lending record(s)" etc. | Correct singular / plural `[bug 2026-10-02]` |
| FMT-010 | D1 | Totals in different currencies | Grouped headers, account groups | Listed side by side ("€700 · $2,938"), never added |

## COMP — shared components

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| COMP-001 | D1 | StatTiles | Key figures | `StatTiles`/`StatTile`; tone only via `signTone` |
| COMP-002 | D1 | Category identity | Rows with categories | Emoji tile in `categoryColor` hue (`CategoryIcon`), labels via `CategoryBadge`; stable colours across sorting/languages |
| COMP-003 | D1 | Panels | Surfaces | `.panel` with `PanelTitle` (title, Count pill, hint, aside) |
| COMP-004 | D1 | Segmented switches | View switches | `.segmented` with `aria-pressed` |
| COMP-005 | D1 | Row actions | Lists | Rare actions in ⋯ menu; frequent ones `size="sm"` in `.row-actions` |
| COMP-006 | D1 | Status pills | Status text | `.status-badge`; green on track/completed, caution at risk, red overdue/overspent only |
| COMP-007 | D1 | Date entry | Every date field | `DatePicker` (two months desktop, one mobile, presets, closes on pick, Escape, focus return) |
| COMP-008 | D1 | Picker presets fit the field | Past-only vs future-only fields | No "Tomorrow" on a past-only field, no "Today" when min is tomorrow `[bug 2026-10-02]` |
| COMP-009 | D1 | Account options | Every cash-account select | "Name · balance" (`formatAccountOption`) so same names are distinguishable `[bug 2026-10-02]` |
| COMP-010 | D2 | Brand | Drawer header | `Brand` component; Demo badge only in sample |

## LIST — lists, tables, groups

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| LIST-001 | D1 | Grouped long lists | Accounts, upcoming | Groups with group totals in the header (`.account-group`, `.table-group-row`) |
| LIST-002 | D1 | Row anatomy | Goal/account rows | Icon, name, one meta line, amount right, % or change under it, thin progress when targeted |
| LIST-003 | D1 | Income vs expense colour | Amount cells | Income green, expenses ink, red only for overdue/overspent/owed |
| LIST-004 | D1 | Tables on narrow content | Container < 720px | Record and upcoming tables become stacked cards |
| LIST-005 | D2 | Counts match rows | Panel Count pill | Equals rows shown `[bug 2026-10-02]` |
| LIST-006 | D2 | Pagination | Short or empty lists | Hidden when one page `[bug 2026-10-02]` |

## DND — reordering (UI-AGENT.md)

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| DND-001 | D1 | Person-ordered lists reorder | Goals, accounts, categories, dashboard cards, watchlists, rules, templates, import profiles, scenarios | Six-dot handle; drag works; order persists `[bug 2026-10-02: accounts, categories]` |
| DND-002 | D1 | Natural-order lists do not | Transactions, history, upcoming by date | No handles; sort controls instead |
| DND-003 | D1 | Handle visibility | Hover, keyboard focus, touch (mobile) | Appears on hover/focus; always visible on touch; only the handle drags |
| DND-004 | D1 | Keyboard drag | Space, arrows, Space, Escape | Works; announced with item name |
| DND-005 | D1 | Failure rollback | Block the save (offline) | Order rolls back with an error popup |
| DND-006 | D2 | Handle label | aria-label | "Move <visible title>" (dashboard "Upcoming payments" handle said "Recurring") `[bug 2026-10-02]` |

## STATE — empty, loading, error

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| STATE-001 | D1 | Empty states | New account on every screen | `EmptyState`: icon, optional title, one sentence, action |
| STATE-002 | D1 | Empty charts | No data | Empty state, never an axis like "$0–$1" `[bug 2026-10-02]` |
| STATE-003 | D1 | Loading | Throttle network | Skeletons (`ChartSkeleton`, `LoadingPlaceholder`), no layout jump |
| STATE-004 | D1 | Errors | Fail a request | `InlineError` with Retry |
| STATE-005 | D1 | Unavailable feature | Assistant without key | Explains and disables input up front `[bug 2026-10-02]` |
| STATE-006 | D1 | Input limits are visible | Over max quantity / fee | Message under the field, never a silent drop `[bug 2026-10-02]` |

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

## RESP — responsive

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| RESP-001 | D0 | No horizontal scroll at 375 | Audit A at mobile | Empty |
| RESP-002 | D1 | Container queries | Toggle the sidebar at desktop | Layout reflows by content width (`@container content`) |
| RESP-003 | D1 | Two columns collapse | Tablet 768 | Dashboard and goal layouts become one column cleanly |
| RESP-004 | D1 | Touch targets | Mobile | Controls ≥ 44px high |
| RESP-005 | D2 | Picker on mobile | Date picker | One month, fits the screen |

## THEME — light and dark

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| THEME-001 | D0 | Readability | Dark mode every screen | Text and figures readable; badges keep contrast |
| THEME-002 | D1 | Tokens switch | Compare panels/badges | No hard-coded light colours left in dark |
| THEME-003 | D2 | Charts | Dark | Series colours and gridlines visible |

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

## A11Y — accessibility

| ID | Sev | Case | Measure | Expect |
|---|---|---|---|---|
| A11Y-001 | D1 | Names | Audit E | Every control has a name |
| A11Y-002 | D1 | Focus visible | Tab through | Visible ring on every focusable element |
| A11Y-003 | D1 | Pressed / expanded state | Toggles, menus | `aria-pressed` / `aria-expanded` reflect state |
| A11Y-004 | D1 | Contrast | Muted text, badges | ≥ 4.5:1 for body text |
| A11Y-005 | D2 | Live updates | Toasts, drag | Announced politely |

## MON — Monarch patterns adopted (UI-AGENT.md)

| ID | Sev | Case | Expect |
|---|---|---|---|
| MON-001 | D1 | Dashboard | Two columns of cards; Customize = handle + name + switch; cross-column drag |
| MON-002 | D1 | Goals | Ordered rows beside "Available for goals"; tools in dialogs |
| MON-003 | D1 | Add goal | Full-screen stepper (Select, Targets, Contribution, Budget) with live preview |
| MON-004 | D1 | Screens lead with content | The list or figure first; settings/logs behind a button or side panel |
| MON-005 | D2 | Transactions | Inline category change with "Create rule" toast; Edit multiple |
