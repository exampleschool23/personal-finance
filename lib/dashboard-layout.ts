/** Dashboard cards and where they sit: Monarch's two columns, each in its own order, any card hideable. */
export const dashboardCards = {
 left: ['net_worth', 'spending', 'budget', 'recap', 'commitments', 'allocation'],
 right: ['goals', 'transactions', 'upcoming'],
} as const;
export type DashboardCard = (typeof dashboardCards)[keyof typeof dashboardCards][number];
export const dashboardCardIds: readonly DashboardCard[] = [...dashboardCards.left, ...dashboardCards.right];
export const dashboardCardLabels: Record<DashboardCard, string> = {
 net_worth: 'Net worth', spending: 'Spending', budget: 'Budget', recap: 'Your weekly recap', commitments: 'Monthly commitments', allocation: 'Asset allocation',
 goals: 'Goals', transactions: 'Transactions', upcoming: 'Recurring',
};
export type DashboardLayout = { order: DashboardCard[]; hidden: DashboardCard[] };
export const defaultDashboardLayout: DashboardLayout = { order: [...dashboardCardIds], hidden: [] };

const columnOf = (card: DashboardCard) => (dashboardCards.left as readonly string[]).includes(card) ? 'left' : 'right';

/** A saved layout made whole: unknown ids dropped, new cards appended in their default place. */
export function normalizeLayout(saved: Partial<DashboardLayout> | null | undefined): DashboardLayout {
 const known = (ids: readonly string[] | undefined) => [...new Set((ids ?? []).filter((id): id is DashboardCard => (dashboardCardIds as readonly string[]).includes(id)))];
 const order = known(saved?.order);
 for (const card of dashboardCardIds) if (!order.includes(card)) order.push(card);
 return { order, hidden: known(saved?.hidden) };
}

/** The visible cards of each column, in the saved order. */
export function dashboardColumns(layout: DashboardLayout) {
 const visible = layout.order.filter(card => !layout.hidden.includes(card));
 return { left: visible.filter(card => columnOf(card) === 'left'), right: visible.filter(card => columnOf(card) === 'right') };
}

/** Net worth heads the left column; it can be hidden but not moved. */
export const pinnedCard: DashboardCard = 'net_worth';
/** Moves a card one place up or down within its own column. */
export function moveCard(layout: DashboardLayout, card: DashboardCard, direction: -1 | 1): DashboardLayout {
 const column = layout.order.filter(item => columnOf(item) === columnOf(card));
 const index = column.indexOf(card), target = index + direction;
 if (index < 0 || target < 0 || target >= column.length || card === pinnedCard || column[target] === pinnedCard) return layout;
 [column[index], column[target]] = [column[target], column[index]];
 let position = 0;
 return { ...layout, order: layout.order.map(item => columnOf(item) === columnOf(card) ? column[position++] : item) };
}

export const toggleCard = (layout: DashboardLayout, card: DashboardCard): DashboardLayout =>
 ({ ...layout, hidden: layout.hidden.includes(card) ? layout.hidden.filter(item => item !== card) : [...layout.hidden, card] });
