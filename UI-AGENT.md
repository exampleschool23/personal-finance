# UI agent

How to design and change screens in this app. `AGENTS.md` holds the design
system (tokens, shared pieces, formatting); this file is the working method and
the interaction rules that sit on top of it. Read both before UI work.

## Reference first: Monarch Money

The product follows Monarch Money. Before redesigning a screen, look at how
Monarch does that screen, and copy the structure, not the colours:

- Reference video: "The ONLY Monarch Money Tutorial You Need 2026"
  (youtube.com/watch?v=LAm5bJ9_gco). Chapters: categories 4:20, transactions
  13:29, budget 15:52, rollovers 22:45, goals 24:25, cash flow 30:14, reports
  32:15, recurring 35:12, investments 37:43, advice 38:40, AI assistant 40:03,
  dashboard setup 43:35.
- Watch the chapter, take frames of each state (list, empty, dialog, mid-drag),
  and write down what the screen leads with, where actions sit and what is hidden.
- Then compare with our screen side by side in the sample workspace and list the
  differences before changing code.

Patterns already taken from Monarch:

- Dashboard: two columns of cards; Customize is a two-column list of handle,
  name and switch; cards drag between columns (`components/dashboard-board.tsx`).
- Savings goals: one ordered list of goal rows (cover, name, status pill, date,
  amount, "% of target", progress bar) beside an "Available for goals" panel;
  setup and rarely used tools open in dialogs (`components/planning/goals-page.tsx`).

## Reordering: always, wherever order is the person's choice

Any list whose order the person decides must be reorderable by drag and drop.
This is not optional and not left for later.

- Reorder: goals, accounts and account groups, categories and category groups,
  budget groups, dashboard cards, watchlists, saved templates, rules, import
  profiles, scenarios, and any new list of things the person creates.
- Do not reorder lists with a natural order: transactions, history, activity
  logs, upcoming payments by date, search results, or sorted tables. Offer sort
  controls there instead.
- Build it with `SortableList` and `SortableItem` from
  `components/presentation-foundation/sortable.tsx` (dnd-kit). Lists that span
  several columns use `sortableAccessibility`, `useSortableSensors` and
  `SortableItem` inside their own `DndContext`, as the dashboard board does.
- The handle is the six-dot `GripVertical` at the row's leading edge. It appears
  on hover and on keyboard focus, and it is always visible on touch screens. Only
  the handle starts a drag; the rest of the row keeps its click.
- Keyboard: Space picks up, arrow keys move, Space drops, Escape cancels. The
  screen reader announces pick-up, drop and cancel with the item's name.
- Persist the order in `workspace_preferences` (one key per list, ids only),
  keep items the person cannot see (archived, filtered) in their slots, and
  roll back with an error popup if saving fails. Keep the selected item
  selected through a reorder.
- The order is display order only. It never changes priorities, amounts or
  dates; funding priority, for example, stays a separate field.
- Cover reorder logic with a test (`tests/dashboard-extras.mjs`,
  `lib/goal-order.ts` are the models) and the rendered handle with
  `tests/presentation-foundation.mjs`.

## Screen layout rules

- Lead with the list or the figure the person came for. Settings, plans and
  logs go behind a button that opens a dialog, or into a side panel.
- No explanatory paragraphs on the page. One-line headings; explanations go in
  the ⓘ `hint`. Empty states get one short sentence and the action.
- A row shows: icon or cover, name, one meta line (status pill, date, account),
  the amount on the right with "% of target" or a change under it, and a thin
  progress bar when there is a target. Rare actions go in the ⋯ menu.
- Status uses `.status-badge` pills with meaning-bearing tone only: green for
  on track or completed, caution for at risk, red only for overdue or overspent.
- Two-column layouts collapse to one column with `@container content` queries;
  a card that can sit in either column adapts to its own width with its own
  container.
- Dialogs for setup flows; wide content (several editors) gets a wider dialog
  rather than a long single column.

## Working method

1. Visible UI first: change the screen the person looks at right away; do not
   start with plumbing.
2. Reuse the presentation foundation; add a piece there once it has a second
   caller. Delete classes, components, tests and translation keys that the
   change leaves unused.
3. Every new label goes into all locale files with the same placeholders
   (`tests/locales.mjs`).
4. Verify in the browser using the sample workspace ("Explore sample
   workspace"; navigate with the sidebar, because a full reload leaves it):
   light and dark theme, desktop and mobile width, a real drag with the pointer
   and one with the keyboard.
5. Run `npx tsc --noEmit`, eslint on the touched files, `npm test` and
   `npm run build` before calling it done.
