/** Dashboard cards and where they start: Monarch's two columns. Any card can be dragged to either column or hidden. */
export const dashboardCards = {
 left: ['net_worth', 'spending', 'budget', 'commitments', 'allocation'],
 right: ['goals', 'transactions', 'upcoming', 'income'],
} as const;
export type DashboardCard = (typeof dashboardCards)[keyof typeof dashboardCards][number];
export type DashboardColumn = 'left' | 'right';
export const dashboardColumnIds: readonly DashboardColumn[] = ['left', 'right'];
export const dashboardCardIds: readonly DashboardCard[] = [...dashboardCards.left, ...dashboardCards.right];
/** Cards that were removed. Saved layouts may still name them; they load and are dropped. */
export const retiredDashboardCards = ['recap'] as const;
export const dashboardCardLabels: Record<DashboardCard, string> = {
 net_worth: 'Net worth', spending: 'Spending', budget: 'Budget', commitments: 'Monthly commitments', allocation: 'Asset allocation',
 goals: 'Goals', transactions: 'Transactions', upcoming: 'Recurring', income: 'Income over time',
};
export type DashboardLayout = { columns: Record<DashboardColumn, DashboardCard[]>; hidden: DashboardCard[] };
export const defaultDashboardLayout: DashboardLayout = { columns: { left: [...dashboardCards.left], right: [...dashboardCards.right] }, hidden: [] };

const defaultColumn = (card: DashboardCard): DashboardColumn => (dashboardCards.left as readonly string[]).includes(card) ? 'left' : 'right';
const isCard = (id: unknown): id is DashboardCard => (dashboardCardIds as readonly unknown[]).includes(id);

/** A saved layout made whole: unknown or repeated ids dropped, new cards appended to their default column.
 * Older saves kept one `order` list with fixed columns; they are read into the same columns. */
export function normalizeLayout(saved: unknown): DashboardLayout {
 const value = (saved ?? {}) as { columns?: Partial<Record<DashboardColumn, unknown[]>>; order?: unknown[]; hidden?: unknown[] };
 const seen = new Set<DashboardCard>();
 const take = (ids: unknown[] | undefined) => (ids ?? []).filter((id): id is DashboardCard => isCard(id) && !seen.has(id) && !!seen.add(id));
 const columns: Record<DashboardColumn, DashboardCard[]> = value.columns
  ? { left: take(value.columns.left), right: take(value.columns.right) }
  : (() => { const order = take(value.order); return { left: order.filter(card => defaultColumn(card) === 'left'), right: order.filter(card => defaultColumn(card) === 'right') }; })();
 for (const card of dashboardCardIds) if (!seen.has(card)) columns[defaultColumn(card)].push(card);
 return { columns, hidden: [...new Set((value.hidden ?? []).filter(isCard))] };
}

/** The visible cards of each column, in the saved order. */
export function dashboardColumns(layout: DashboardLayout): Record<DashboardColumn, DashboardCard[]> {
 const shown = (column: DashboardColumn) => layout.columns[column].filter(card => !layout.hidden.includes(card));
 return { left: shown('left'), right: shown('right') };
}

export const columnOf = (layout: DashboardLayout, card: DashboardCard): DashboardColumn => layout.columns.left.includes(card) ? 'left' : 'right';

/** Takes a card out of its column and puts it at `index` of `column` (clamped), as a drag and drop does. */
export function placeCard(layout: DashboardLayout, card: DashboardCard, column: DashboardColumn, index: number): DashboardLayout {
 const columns = { left: layout.columns.left.filter(item => item !== card), right: layout.columns.right.filter(item => item !== card) };
 columns[column].splice(Math.max(0, Math.min(index, columns[column].length)), 0, card);
 return { ...layout, columns };
}

/** Where a dragged card lands when it is dropped on `over`: a card, or a column (its end). */
export function dropCard(layout: DashboardLayout, card: DashboardCard, over: DashboardCard | DashboardColumn): DashboardLayout {
 if (over === card) return layout;
 if (over === 'left' || over === 'right') return placeCard(layout, card, over, Infinity);
 const column = columnOf(layout, over);
 return placeCard(layout, card, column, layout.columns[column].indexOf(over));
}

export const toggleCard = (layout: DashboardLayout, card: DashboardCard): DashboardLayout =>
 ({ ...layout, hidden: layout.hidden.includes(card) ? layout.hidden.filter(item => item !== card) : [...layout.hidden, card] });
