# The reference app for Business Owners — reference and gap list

Source: "Getting Started with the reference app for Business Owners", the reference app Guides & Updates,
YouTube `AMxDR8kknek`, published 22 April 2026, 15:41. Watched in full on 2026-10-02
(auto captions plus frames). Sample data in the video: Coastal Candle Co (LLC side
hustle at a loss) and Sunset Property LLC (short-term rental at a profit).

Hoggish is international: The reference app's Schedule C sheet is US-only, so our tax prep must
keep a general template beside it and never imply that one country's form applies to everyone.

## Feature walkthrough

### Scope (0:00)
- Separates business from personal money while showing how each business feeds the household.
- Built for pass-through income on the owner's personal return: single-member LLCs, sole
  proprietorships, rental properties ("owners don't take a W2 salary"). Not for S or C corps.

### Setup wizard (0:28), full screen with Back, Exit and a progress bar
1. "Are you already tracking a business in the reference app?" Yes, my own way (category groups or tags)
   or No, starting fresh. The answer tailors the closing guidance.
2. Add your businesses: list on the left, form on the right. Name, legal structure, logo upload
   or one of about 8 pastel colours, notes. "+ Add a business".
3. Assign businesses to accounts: accounts grouped by type, a Business dropdown per row
   (None or a business), "Add account" in place. Skippable; rules can assign later.
4. Setup guide: three cards: "Businesses and categories work together" (Review transactions),
   "Set up transaction rules" (Set up rules), "Explore your Schedule C prep sheet"
   (Go to Business Tax Prep). Reopen later from Settings → Businesses.

### Dashboard widget (2:46)
- "Business tracking" card with tabs Net income / Net assets, a time range (1 month), and a ⋯ menu.
- Net income: one row per business with a mini cash-flow chart, its net profit or loss
  (red loss, green profit) and "View P&L". The row opens Reports → Cash flow filtered by the business,
  the chart opens the cash-flow bars, and the figure opens the P&L.
- Net assets: the row opens Accounts filtered by the business.
- "Explore business tax tools →" link. Hide the card through Customize.

### Accounts, transactions, rules (4:11)
- Top-level Business filter on Accounts and Transactions, multi-select; "Household" = no business.
- A transaction takes its account's business. Unassigned (personal) accounts stay out of
  business reports, charts and tax prep unless a transaction is assigned.
- Accounts: "Edit businesses" button; the business shows under each account name.
- Transactions: a business column you can edit on the row. "Edit multiple" opens a drawer with Merchant,
  Category, Date, Recurring, Business, Notes, Tags, Hide.
- Categories and businesses are independent; no business-specific categories are needed.
- Rules: create from a transaction (merchant "CandleScience" exactly matches → set business).
  Criteria include Businesses; actions include Set business; "Preview changes" found 4 past
  matches. Settings → Rules for the full list, which matters for side hustles without a business account.

### Migrating (6:41)
- A "Business" category group keeps working; the business assignment, not the category, decides.
- Tags: Settings → Tags → click a tag's transaction count → bulk-select → assign the business.
- Update rules that set a business tag so they also set the business.

### Reports: Breakdown and Trends (8:02)
- Every tab (Cash flow, Spending, Income, Business Tax Prep) filters by business.
- Breakdown shows composition as Sankey or Profit & Loss. Trends shows changes over time as grouped or stacked bars,
  with an adjustable interval.
- Sankey: each business is income → expenses. Profit flows back into household income
  (Sunset: $25,327.88 in, net profit $12,540.56). A loss is drawn as an outflow from the household
  like any expense (Candle: $7,520 in, $12,124 out, net loss $4,604). Clicking a flow
  or label filters the transactions table below.
- Spending/Income: breakdown by business, category, group or merchant; Pie or Bars;
  summary card (count, largest, average, total, first and last date, Download CSV).
- Header tiles: total income, total expenses, net, savings rate (25.7%).

### Profit & Loss table (11:55), under Cash flow
- Total income = household income + each business's net income (each expands into gross
  business income and business expenses), then Household expenses, then Net cash flow.
- Laid out this way because pass-through profit or loss changes personal income (Schedule C).
- Breakdown by category, group or both; hovering a row shows a transactions icon that filters the table below.

### Business Tax Prep (13:30), marked "Plus"
- Selectors: business, form (Schedule C), year, full year or quarter. Disclaimer that the reference app is not
  a tax advisor, with a link to IRS Form 1040 Schedule C.
- Categories with business transactions are mapped automatically to lines. Part I Income, Part II Expenses,
  net profit or loss at the bottom. Each line expands to categories, and each category to a transaction preview.
- "Move to…" puts a category on another line; the transaction drawer fixes categories; lines the reference app
  cannot compute are greyed out as "Not tracked" (COGS, depletion, depreciation, employee benefits).
- The "Include categories without business transactions" toggle adds an Unmapped categories section;
  unmapped categories are left out of the export.
- Preview export → Export summary: CSV or PDF, with transaction details, totals and the reference app
  categories → Download prep sheet.

## Gap list against the build in progress (checked 2026-10-02 22:50, uncommitted)

| # | Video feature | State | Notes |
|---|---|---|---|
| 1 | Setup wizard and setup guide | Missing | Only the "Edit businesses" dialog on Accounts |
| 2 | Business profile (structure, colour, logo, notes) | Done | `business-profile-fields.tsx`, migration 092 |
| 3 | Dashboard Business tracking widget | Missing | `businessNetAssets` in `lib/business-report.ts` is unused |
| 4 | Business filter on Accounts | Done | `BusinessFilter`, `?business=` |
| 5 | Business filter on Transactions | Done | also `?tag=` |
| 6 | Transactions follow the account's business | Done | `set_account_business`, import trigger |
| 7 | Business on rows and details | Done | `BusinessPicker`, details dialog |
| 8 | Bulk edit with business | Done | `BulkEditSheet` |
| 9 | Rules: set business, from a transaction, preview count | Partial | Rule criteria by business are missing |
| 10 | Tags: settings, clickable counts | Partial | No Tags section in Settings; `tagCounts` unused |
| 11–15 | Reports: filter, Breakdown/Trends, Sankey, P&L, pie/bars, drill | Built, not mounted | `business-reports.tsx` is imported nowhere |
| 16 | Tax prep sheet | Built, not mounted | `tax-prep-sheet.tsx`; check move-to-line and greyed lines |
| 17 | Translations and tests | Missing | No locale keys; only one skipped SQL test |
| 18 | Demo data | Done | Coastal Candle Co, Lakeside Rentals LLC |

## Full transcript (auto captions, lightly joined)

[0:00] Hi, I'm Jenny from the reference app and I'm going to walk you through our business tracking feature. This tool will help you separate your business finances from your personal finances and access richer reporting for your businesses and how they fit into your overall household financial picture. In this video, we'll go through the initial setup of business tracking and also explore all the new functionality for it across accounts, transactions, business reports, and our new schedule C tax prep tool. Let's get started.

[0:30] You can set up business tracking right from your dashboard. Business tracking is designed specifically for business income that flows into your household totals and through your personal taxes like single member LLCs, sole proprietorships, and rental properties. It's not currently made for S corp or C corp businesses at this time. The reference app will display business activity and calculations as a part of your overall household financial picture. Business tracking also comes with several tools from a dashboard widget, filtering, and tax ready reporting, and enhanced charts. Let's get started.

[1:04] If you are already tracking a business manually in the reference app, maybe through a makeshift setup of category groups and tags, you can answer yes here. This will help customize the setup guidance at the end and later in the video, I'll also walk you through how to migrate your existing system to this feature. If you haven't been tracking a business in the reference app yet, select no, I'm starting fresh.

[1:26] Next, you will create and add your businesses to the reference app. Fill out the name, legal structure, and color you'd like to represent your business. I'm adding a company called Coastal Candle Company and it's an LLC. And you can also upload a logo or a brand image as well as any notes just for you. I'm adding a second business, my Sunset Property LLC, which is a rental property for short-term vacation rentals. And I like this teal color.

[1:56] Next, we'll assign businesses to your accounts. If you have a business account, you can find it here and assign it. Or you can add it to the reference app using this button. If you don't have any dedicated bank accounts, skip this step. You can use transaction rules later to assign individual transactions to your businesses. I'm going to go ahead and assign all of my accounts to businesses. And once you hit next, we'll finalize your setup. Great, now we've unlocked business tracking across our the reference app experience. Based on whether or not you've tracked a business in the reference app before, we'll give you some custom guidance at the end of setup to make sure you're getting the most out of business tracking.

[2:47] The business tracking dashboard widget is the central place for you to see the high-level overview of your business finances. There are two modes for this widget, net income and net assets. Net income is your business's cash flow. You'll see a snapshot of your cash flow trends in the thumbnail chart and your net profit or loss will be based on the time range you select here. This row will generally give you shortcuts to the reports page focusing on your business's net income. Clicking on the row generally will take you to the reports cash flow tab filtered by that business. This thumbnail chart will take you to the cash flow bar chart in reports. You'll also see this filtered by the business that you select. Your net income number or view P&L will take you to the business's profit and loss table, also in reports.

[3:38] Now, net assets refers to the accounts and assets your businesses hold in the reference app. Clicking anywhere on this row will take you to the accounts page filtered by that business. You'll be able to see all of your accounts and the worth of them. Lastly, this explore business tax tools link is a shortcut to the business tax prep tab, also under your reports page. I'll give a more detailed walk-through on this later in the video. Finally, you can always hide your widget by going to customize and toggling off the visibility of business tracking.

[4:13] To achieve the cleanest reporting, let's take a look at your business accounts and transactions and make sure they're organized accurately. Now that you have business tracking setup, you'll see this top-level filter on your accounts and transactions pages. This will let you filter all of your accounts and transactions by your businesses, even letting you select multiple at a time. This option, household, simply refers to any account or transaction that does not have a business assigned to it.

[4:38] In the reference app, transactions automatically inherit the business of the account they belong to. If transactions are flowing through your business bank account, for example, and your bank account is assigned to a business in the reference app, those transactions will also automatically be assigned to that business in the reference app. If an account isn't assigned to a business because, say, it's a personal bank account or card, its transactions won't have a business by default and will be left out of your business reports, charts, and tax prep tools unless you assign them. You can assign or reassign businesses to your accounts at any time through this edit businesses button.

[5:14] On the transactions page, you can also assign and change the business of a transaction at any time right on the row. You can also edit transactions in bulk by clicking edit multiple and selecting the transactions you want to change the business of. It will pop open a drawer and show all the fields that you can change in bulk, including businesses. Also, remember that categories and businesses are independent attributes. This means a transaction can belong to any category and also to any business or not. You don't need any business-specific categories. They can be shared among any businesses and your overall household.

[5:49] Finally, you can always set up transaction rules. One way to do this is from within the transaction itself. For example, if I know that anything from Candle Science should be related to my Coastal Candle Company, even if it's coming from my personal checking account, I can create a rule from this transaction and set it so that anything from this merchant, Candle Science, will follow a rule of being set as a business transaction for my candle company. This is what it looks like to make a rule that sets Candle Science to the Coastal Candle Company. And the reference app can detect that there are four other transactions for which this change can apply. You can also go to settings and the page rules to create as many rules as you'd like. This may be especially useful if your side hustle doesn't have any business bank accounts and you're keeping tabs on your income and expenses through your personal accounts.

[6:42] Before this business tracking feature existed, it's possible you've been managing business finances in the reference app your own way. Here's how business tracking maps to what you might have already been doing. First, if you've used the business category group, you can keep your existing categories exactly as they are. In fact, any category works, the reference app's defaults or custom ones you've created. There are no restrictions on categories. As long as your accounts or transactions are assigned to a business, it will recognize those as business transactions regardless of the category group or category that they're in. No recategorization is required.

[7:18] If you've been using tags to track your businesses, our new feature will give you the same filtering power as tags plus more. From the settings page, you can click on the number of transactions associated with a tag and begin bulk moving your history over. Check that you're filtering by that business tag, then you can bulk edit all those transactions and assign them to your new business. So here I'm assigning everything tagged with the Sunset Property LLC tag with the new Sunset Property LLC business. You can also go update your rules. If you have rules that set a business tag automatically, make sure you update them to also set the business field.

[8:05] With business tracking, your reports page gets some superpowers. First, just like the accounts and transactions pages, you'll be able to filter any of your cash flow, spending, [captions skip here] We've also made some updates to the charts themselves. Every chart now has two views, breakdown and trends. Breakdown shows the composition of cash flow with the two display modes being the Sankey and the profit and loss table. I'll go through the P&L in more depth later in this video. Trends shows the behavior of cash flow over time with the two display modes being variations on the bar chart, grouped and stacked. You can also modify the time intervals.

[8:42] Now, the Sankey is our flagship visualization for the makeup of how your cash is behaving. When you're looking at your overall household, including business and personal finances, your Sankey might look something like this. Let's dive in. You'll be able to see your general household income. It might have the inflow of a paycheck's income from the left and how it's distributed into household expenses to the right. With business tracking, we also show Sankey structures for each of your business lines. Each business also has an income as an inflow and expenses as an outflow, but the way they interact with your household can be a little unique.

[9:19] Let's look at Sunset Property LLC, for example. The income inflow of this business is just over $25,000. However, the expenses only consume about $12,000. This means that Sunset Property LLC has a net profit of about $12,540. In this Sankey, this profit is visualized as feeding back into your overall household income, contributing to how you pay your household expenses. This visual represents how most income that flows through one's personal taxes operates. For single member LLCs and sole proprietors, profit from the business uplifts the overall household income.

[9:53] Now, let's look at Coastal Candle Company, my side hustle that hasn't been doing too great. I've made some money, just short of 8K, but my expenses are over $12,000. This means my business has a net loss. In this Sankey, this loss is visualized as taking from my overall household income represented by this outflow to the right. It's flowing out of my household just like all my other household expenses because covering for my candle company has been a household loss. That's how the overall household Sankey operates.

[10:26] With the business filter, I can isolate the Sankey of certain businesses or examine the relationship between a business and my overall household. This is what the Sankey of just my candle company and my household context looks like. We can see more clearly how the inflows and outflows break down and the proportion of the net loss compared to my other household expenses. Clicking on any of the flows or labels in the Sankey will drill down and filter this transactions table by that information. I can click on a category for Coastal Candle Company and see the specific transactions that make up that flow. I can also filter this page by a single business or see just my household alone. You can also filter by a date range as well as any of the other attributes in the reference app.

[11:11] Now, let's quickly look at how the breakdown in trend sections look in some of the other tabs like spending and income. You can see a breakdown of your spending by business. You can also see them by other attributes like categories, groups, and merchants. You can also switch the visual mode to a bar chart to better see comparisons. When we switch it back to by business, we can see that my household spending is more than my business spending combined. The trends charts in spending similarly show breakdowns of attributes, but over time intervals. You can switch between grouped and stacked and of course toggle the visibility of any of your businesses. Finally, the income charts operate the same way, but focusing on income.

[11:56] The profit and loss table is new to the reference app and lives on the reports pages cash flow tab. It can be affected by any of the top level filters available to all reports in the reference app. When we're looking at the P&L for your overall household, these are the top level headlines. Total income, household expenses, and net cash flow. The way this works is that within the total income section, we will see the net income of each business roll up into your overall total income. We lay it out this way because this is technically how businesses that flow through your personal taxes operate. Their net profit or losses affect your overall income alongside your personal non-business income as reflected by schedule C. Your business net income is made up of gross business income and business expenses. These net income rows of your businesses will sit alongside your non-business household income within this total income section. Meanwhile, your household expenses will just contain overall household expenses separate from your businesses. Your total income minus household expenses is your overall household net cash flow.

[13:00] You can also toggle the breakdown to view the income and expenses by transaction categories, groups, or both. Also, when you hover over any of these rows, you'll see this transaction icon appear. This will let you filter down your transactions table below by that line item, so you can see the specific transactions that make up that income or expense line. Of course, just like any report, you can also filter your P&L by a business or a date range to help you get more specific.

[13:31] The business tax prep section is new to the reference app and lives under reports currently. It's designed to align your the reference app transaction categories into the appropriate line on your tax form and help you export a CSV or PDF so you can use it for tax prep or to hand off to your accountant. This tool helps you populate a schedule C for any of your businesses for this tax year. You can also set this to quarterly showing only business transactions for that period. You should note that the reference app is not a tax advisor and you should consult a licensed tax professional for any advice or support in filing your taxes.

[14:02] This sheet automatically maps any category in the reference app with a business transaction to the most appropriate schedule C lines. This page is broken out by part one, income, part two, expenses, and we show your net profit or loss at the bottom. Each part contains all the lines in the tax form for that tax year. And each line contains transaction categories. If you feel that a category was inaccurately mapped and belongs in a different line, you can click on these move arrows to reorganize it to a different line. Within each category is a preview of the transactions that make it up. If you think a transaction belongs to a different category, you can also open the transaction drawer to make your category edits. Some sections will be grayed out because they're not available in the reference app and need to be calculated manually.

[14:51] If you anticipate having business transactions in other categories that don't yet appear here, you can include and organize all your the reference app categories. Often, if you opt into seeing all your categories, you'll find that some aren't automatically mapped to lines in the tax form. You'll need to manually organize them into the line that's most appropriate. Any unmapped categories won't appear in your export summary. Once you feel good about your mapping, click preview export to see a summary of each line in your schedule C prep sheet. Once it's looking good, you can choose your file format and the level of detail you want to include in your export. And when you're ready, you can download your prep sheet.
