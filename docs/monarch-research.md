# Monarch Money research (2026-10-02)

Reference material for making Vestnu's UI/UX follow Monarch Money. Layout and
interaction patterns are borrowed; Monarch's logo, orange brand colour and
illustrations are not. Vestnu's accent is teal (`#0f766e`); see the
"Interface design system" section of AGENTS.md.

## Sources

| Video | Length | Status |
|---|---|---|
| [Getting Started with Monarch](https://www.youtube.com/watch?v=WGR8B6vBVqM) (Monarch, official) | 2:28 | Frames every ~7 s, done |
| [How to Create a Budget with Monarch Money (Full Tutorial)](https://www.youtube.com/watch?v=QC-L5T_glEs) (Marriage Kids and Money) | 11:03 | **Full narration + ~40 frames, done** |
| [How To Use Monarch Money (Budget App)](https://www.youtube.com/watch?v=31FINPdHH68) (Feasible Creative) | 9:45 | Only sampled (15 frames). **Redo fully.** |

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
- Sidebar: flat list with Monarch's order and short labels (Dashboard, Accounts,
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

## Findings from the other two videos (sampled; confirm when redone)

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
