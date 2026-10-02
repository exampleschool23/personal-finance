# Reference app research (2026-10-02)

Reference material for making Vestnu's UI/UX follow the reference app. Layout and
interaction patterns are borrowed; the reference app's logo, orange brand colour and
illustrations are not. Vestnu's accent is teal (`#0f766e`); see the
"Interface design system" section of AGENTS.md.

## Sources

| Video | Length | Status |
|---|---|---|
| [Getting Started with the reference app](https://www.youtube.com/watch?v=WGR8B6vBVqM) (The reference app, official) | 2:28 | Frames every ~7 s, done |
| [How to Create a Budget with the reference app (Full Tutorial)](https://www.youtube.com/watch?v=QC-L5T_glEs) (Marriage Kids and Money) | 11:03 | **Full narration + ~40 frames, done** |
| [How To Use the reference app (Budget App)](https://www.youtube.com/watch?v=31FINPdHH68) (Feasible Creative) | 9:45 | **Full narration + frames of every app screen, done** |

### How to study a video in the built-in browser

- YouTube may show a "not a robot" page; the user solves it (never solve it yourself).
- The transcript panel and caption downloads do not load in this browser. Instead play
  the video muted at 2× with captions on and record `.ytp-caption-segment` text with
  `video.currentTime` every 250 ms; rolling captions repeat, so keep a line only when
  the next one does not start with it. Disable autoplay or stop at `duration`.
- For frames: move the `<video>` element to `document.body`, make it `position:fixed`
  full-viewport, hide `ytd-app`, emulate a 1440×810 viewport, then seek and screenshot.
  Skip talking-head stretches; take a frame every 3–5 s wherever the app is on screen.

## Already built in Vestnu (uncommitted on 2026-10-02 unless noted)

- Light theme by default: warm grey page, white hairline cards, teal accent.
- Dashboard (`/`): "Welcome back, {name}!", two-column grid; Net worth card with the
  period switch in its header; **Spending · this month vs last month** card
  (`components/spending-pace-card.tsx`, `lib/spending-pace.ts`); Goals (top 2) and
  Transactions (most recent) cards (`components/dashboard-cards.tsx`); headline
  figures in card titles; KPI tiles removed.
- Sidebar: flat list with the reference app's order and short labels (Dashboard, Accounts,
  Transactions, Recurring, Investments, Loans & debts, Goals; Recently deleted and
  Settings below) via `label` in `components/workspace/navigation.ts`.
- Earlier (other session, also uncommitted): emoji per category, ⓘ hints instead of
  subtitles, grouped accounts and upcoming payments, ⋯ row menus.

## Findings from "How to Create a Budget" (full study)

Status: ✗ missing, ◐ partial (Vestnu has monthly spending plans in
`lib/expense-plans.ts` and custom categories).

### Setup (0:45–1:30)
1. ◐ **Category manager**: ~60 default categories with emoji and a **group**
   (Bills & Recurring, Everyday Spending, Future Spending…); drag to reorder; disable
   unused ones and move their transactions.
2. ✗ **Category settings modal**: icon & name, group, **type Fixed / Flexible /
   Non-monthly** (each with a one-line explanation), "Make this category a rollover
   fund", "Exclude this category from the budget", Disable.
3. ◐ **Review transactions** for at least the last 30 days so history is right.
4. ✗ **Inline recategorize**: click a transaction's category → searchable dropdown
   grouped by category group, "Create new category".
5. ✗ **"Create rule" toast** after a change: "Updated to Groceries · Create a rule to
   do this automatically in the future" with CREATE RULE / DISMISS.
6. ◐ **Settings**: Account (Profile, Display, Notifications, Security); Household
   (General, Businesses, Members, Preferences, Institutions, Categories, Merchants, Rules).

### Budget page, category budget (1:30–6:10)
7. ✗ Two budget styles: **Category** (amount per category) and **Flex** (three
   buckets, recommended for most families).
8. ✗ Month header: ← → arrows, Today, Month / Year / Decade views.
9. ◐ Columns **Budget** (editable) / **Actual** / **Remaining**, with a thin progress
   line under each row.
10. ✗ Remaining pills: green = money left, red = overspent.
11. ✗ Income is budgeted too (paychecks, interest) with its own totals.
12. ✗ **History popover** on a budget box: last month, monthly average, 6-month bar
    chart (hover for amounts), "Apply $X to all future months".
13. ✗ Defaults from historical averages, with the caution that averages are skewed by
    unusual months and by how much history each bank imported.
14. ✗ **"Left to budget" card**: green = unassigned money, grey = zeroed out, red =
    planning to spend more than income; tabs Summary / Income / Expenses.
15. ✗ Mid-month check: bills green, everyday spending red with 10 days left.
16. ✗ Group rows with totals, "Show N unbudgeted" / "Collapse", an Inactive group.
17. ✗ Budget **by group** (one amount for a whole group).
18. ✗ Budget settings modal: Flex (Recommended) or Category; apply changes to "This
    month only" or "All future months"; "Recalculate default budgets".

### Flex budget (6:10–10:45)
19. ✗ Three buckets: **Fixed** (bills), **Flexible** (discretionary), **Non-monthly**
    (yearly or irregular; save ahead).
20. ✗ One amount for all of Flexible; "spent $3,565, $1,400 left for 10 days".
21. ◐ Optional limits inside Flexible only where spending gets away (Groceries,
    Shopping): "$267 left".
22. ✗ "Unallocated Flexible Budget" row for the rest.
23. ✗ **Rollovers** (↻ icon), mainly for Non-monthly; advice: keep off at first.
24. ✗ Move a category between buckets from a gear on its row.
25. ✗ **Contributions** section (Goals = save up, Pay down) and a green
    "Left to Budget" bar at the bottom.

Data model needed: monthly budget amounts per category (and per group), category
type / group / rollover / excluded flags, and a budget mode preference — a new
migration (next number after `085_treasury_bills.sql`).

## Findings from the earlier samples (dashboard, accounts, rules)

- **Dashboard**: Customize (toggle widgets, drag to reorder, separate web/mobile
  layouts); Weekly Recap card; Advice card with guided plans; Recurring card
  "$510 remaining due" with "in 1 day"; Investments card with top movers.
- **Transactions**: grouped by day with a daily total; merchant logo, category emoji,
  account; Search, Date, Filters, Sort, Columns, **Edit multiple**, Receipts tab.
- **Rules**: conditions → set category, add tags, hide, review status, link to save-up
  or pay-down goal, split; shows "24 matching transactions".
- **Recurring**: Monthly / All recurring tabs; month arrows, Today, List / Calendar;
  summary bars "Income $0 received · $7,287 remaining", "Expenses $0 paid · $1,693
  remaining"; rows with frequency, due date "(12 days ago)", account, category, ⋯.
- **Budget Year view**: spreadsheet with past months' actuals and editable future months.
- **Goal detail**: cover photo, progress, Total saved / spent / available / left to
  save, Timeline, Allocate funds.
- **AI Assistant**: "Ask anything about your money" with suggested questions.
- **Advice onboarding**: "What is most important to you?" checklist.
- **Accounts**: groups with 1-month change, sparklines per account, Summary card with
  assets/liabilities bars, Refresh all, Add account.
- **Cash flow / Reports**: bars by category / group / merchant, Monthly / Quarterly /
  Yearly, Sankey (income → savings + expense groups → categories), category filter
  chip with a summary card (count, largest, average, total).
- **Loading feel**: brand-coloured stroke drawing the logo, no spinners.

## Findings from "How To Use the reference app" (full study, 2026-10-02)

Narration recorded in full (0:00–9:45); frames at every app screen.

- **Setup (1:25–2:27)**: connect accounts (Plaid), or import a CSV statement, or add
  manual accounts (car value, cash). These feed every chart and the AI insights.
- **Transactions (2:27–3:50)**: one consolidated list across cards and accounts: date,
  merchant, category, account, amount. Review it now and then; fix oddly worded rows
  (rent) by changing the category and creating a **rule** so future rows are fixed
  too. Receipt photos: AI splits a receipt into line items by category.
- **Dashboard (3:50–4:17)**: frame shows Advice, Spending (this month vs last month
  line), Recurring "$0 remaining due · This month", Transactions "Most recent" with
  an "All transactions" filter, **Your Weekly Recap** ("See how your net worth and
  spending changed last week, and what's coming up this week"), **Budget** card
  (month, Expenses dropdown), Goals "$0.00 this month", Credit score. **Customize**
  button top right: hide cards (net worth) and rearrange tiles.
- **Budget (4:17–6:51)**:
  - Budget Settings modal: *System* Flex Budget (Recommended, "Simplify your budget
    by focusing on your flexible expense number") or Category Budget ("Budget every
    category individually, the traditional way"); *By default, apply budget changes
    to* This month only / All future months (each with an explanation; either can be
    overridden per edit); *More options*: Recalculate default budgets (from
    historical averages) with a Recalculate button.
  - Header: month title left; right: ← →, Today, Month / Year / Decade, ⚙ Settings.
  - Grey section bands **Income / Expenses / Contributions** carry the column labels
    **Planned · Actual · Remaining**; each group is a white collapsible card (Income;
    Fixed, Flexible, Non-Monthly; Save up, Pay down) with **Total Income / Total
    Expenses / Total Contributions** rows. "Show 11 unbudgeted" / "Collapse 3
    unbudgeted" with an eye icon. Category rows: emoji, name, small Planned input.
  - Flex: the Flexible group carries one Planned input ($2,000) and an italic
    **Unallocated Flexible Budget** row ($1,200) under it.
  - Remaining shows as a green pill when money is left.
  - **History popover** opens on focusing a Planned input: two tiles ("Earned / Spent
    last month", "Monthly average"), six monthly bars (green for income, red for
    spending), and a checkbox "Apply $X to all future months" ⓘ.
  - **Left to budget** card (right column): large figure on a green tint, ⓘ, tabs
    Summary / Income / Expenses; the Expenses tab lists Fixed and Flexible with
    "$1,830 planned", a bar, "$0 spent", "$1,630 remaining". Empty state: "You
    haven't added any expense budgets…".
  - Narration: Planned is the target, Actual flows in, Remaining is the difference;
    start from the historical average, aim lower where you want to cut; plan next
    month and next year too (rent rise, bonus); left to budget is the buffer for
    discretionary spending or saving.
- **Cash flow (6:51–7:10)**: KPI row Income / Expenses / Total savings / Savings rate;
  Income and Expenses panels as horizontal proportional bars with amount and share,
  switch Category / Group / Merchant, Share menu (export, hide amounts); bar chart and
  Sankey.
- **Reports (7:10–7:24)**: charts with time-frame filters; pie chart deep dives.
- **Recurring (7:24–7:50)**: tabs Monthly / All recurring; Filters, Manage recurring;
  month arrows, Today, **List / Calendar**; summary "Income $0.00 received ·
  $7,287.02 remaining", "Expenses $0.00 paid · $1,693.40 remaining" with bars;
  calendar cells hold chips (red expenses, blue income) with amounts. The reference app detects
  recurring items on sync; the user confirms them.
- **Goals (7:50–8:06)**: save up (house, emergency fund, vacation) or pay down
  (student debt); allocate funds from an account.
- **Investments (8:06–8:28)**: portfolio vs S&P 500; holdings with quantity, price,
  gain/loss; Forecasting (Plus plan).
- **AI Assistant (8:28–9:12)**: chat "Ask anything about your money…"; conversation
  list on the left; answers with a list and a table (Recurring transaction, Payment
  account, Category, Amount); thumbs up/down; "can make mistakes and isn't for
  financial advice"; can be disabled in Settings.
- **Advice (9:12–9:38)**: "What is most important to you?" (buy a home, pay off
  student loans); tailored recommendations with task lists (buy or lease, credit
  score, loan options).

## Build plan (priority order)

1. **Budget page** (`/budget`): Category / Flex styles; Fixed / Flexible /
   Non-monthly types, groups, rollover, exclude; month header with ← → Today and
   Month / Year; Planned / Actual / Remaining with progress lines and pills; History
   popover with "Apply to all future months"; Left to budget card with Summary /
   Income / Expenses; Show N unbudgeted; Contributions (goals); Budget settings
   modal with the default edit scope and Recalculate. Migration 086.
2. **Transactions**: day groups with daily totals, inline category change with a
   "Create rule" toast, search, filters, edit multiple, rules page.
3. **Recurring**: received / paid summary bars, "in N days", List / Calendar.
4. **Dashboard**: Customize (hide and reorder cards), Weekly recap, Budget card.
5. **Goal detail**, then **Cash flow** reports (bars by category / merchant, savings
   rate, Sankey), then the **AI assistant**.

### Built on 2026-10-02 (worktree `inspiring-spence-94e22f`)

| Step | Where | Migration |
|---|---|---|
| Budget page (category/flex, types, groups, rollover, exclude, Month/Year, History popover, Left to budget, unbudgeted toggle, contributions, settings + recalculate) | `/budget`, `lib/budget.ts` | 086 |
| Transactions (day groups with totals, inline category, Create rule toast, search, filters, Edit multiple, Rules) | `/transactions`, `lib/transaction-rules.ts` | 087 |
| Recurring (received/paid bars, "in N days", List / Calendar) | `/upcoming`, `lib/recurring.ts` | – |
| Dashboard (Customize, Weekly recap, Budget card) | `/`, `lib/dashboard-layout.ts`, `lib/weekly-recap.ts` | 088 |
| Goal header (cover, progress, saved / left / monthly / date) | `/goals`, `components/planning/goal-detail.tsx` | – |
| Cash flow report (figures, monthly bars, category/merchant bars, Sankey) | `/income-expenses`, `lib/cash-flow-report.ts` | – |
| Assistant (Claude, needs `ANTHROPIC_API_KEY`) | `/assistant`, `lib/assistant.ts` | – |

Still open from the research: merchant logos, receipts, Reports page with pie deep dives, Advice, budget by group, Decade view, investments top movers, accounts sparklines.
