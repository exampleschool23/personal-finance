import { ArrowLeftRight, CalendarClock, ChartColumn, ChartPie, ChartNoAxesCombined, HandCoins, LayoutDashboard, Settings, Sparkles, Target, Trash2, Wallet } from 'lucide-react';

/** Every workspace destination, in drawer order (Monarch's: dashboard first, then money in, out and owned).
 * `name` identifies the section; `label` is the short drawer word. `group` names the drawer section for screen readers. */
export const sections = [
 { name: 'Overview', label: 'Dashboard', icon: LayoutDashboard, path: '/', group: 'WORKSPACE' },
 { name: 'Accounts', label: 'Accounts', icon: Wallet, path: '/accounts', group: 'WORKSPACE' },
 { name: 'Transactions', label: 'Transactions', icon: ArrowLeftRight, path: '/transactions', group: 'WORKSPACE' },
 { name: 'Income & expenses', label: 'Cash flow', icon: ChartColumn, path: '/income-expenses', group: 'WORKSPACE' },
 { name: 'Budget', label: 'Budget', icon: ChartPie, path: '/budget', group: 'WORKSPACE' },
 { name: 'Upcoming payments', label: 'Recurring', icon: CalendarClock, path: '/upcoming', group: 'WORKSPACE' },
 { name: 'Assets & investments', label: 'Investments', icon: ChartNoAxesCombined, path: '/assets', group: 'WORKSPACE' },
 { name: 'Loans & debts', label: 'Loans & debts', icon: HandCoins, path: '/loans-debts', group: 'WORKSPACE' },
 { name: 'Savings goals', label: 'Goals', icon: Target, path: '/goals', group: 'WORKSPACE' },
 { name: 'Assistant', label: 'Assistant', icon: Sparkles, path: '/assistant', group: 'WORKSPACE' },
 { name: 'Recently deleted', label: 'Recently deleted', icon: Trash2, path: '/recently-deleted', group: 'Manage' },
 { name: 'Settings', label: 'Settings', icon: Settings, path: '/settings', group: 'Manage' },
] as const;

export type SectionName = (typeof sections)[number]['name'];
/** The drawer word for a section, which the top bar repeats. */
export const sectionLabel = (name: string) => sections.find(section => section.name === name)?.label ?? name;
export const navigationGroups = [...new Set(sections.map(section => section.group))];

/** A drawer tap that has not reached its route yet: from the path it was tapped on, to its destination. */
export type PendingNavigation = { from: string; to: string };

/** The destination still loading, or null once the route changed (arrived, or the user went elsewhere). */
export function pendingDestination(pending: PendingNavigation | null, pathname: string) {
 return pending && pending.from === pathname && pending.to !== pathname ? pending.to : null;
}

/** The section a path belongs to. Unknown paths fall back to Overview. */
export function sectionFor(pathname: string): SectionName {
 return sections.find(section => section.path === pathname)?.name ?? 'Overview';
}
