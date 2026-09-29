import { ArrowLeftRight, CalendarClock, ChartNoAxesCombined, HandCoins, LayoutDashboard, Settings, Target, Trash2, Wallet } from 'lucide-react';

/** Every workspace destination, in drawer order. `group` is the drawer heading it appears under. */
export const sections = [
 { name: 'Overview', icon: LayoutDashboard, path: '/', group: 'WORKSPACE' },
 { name: 'Assets & investments', icon: ChartNoAxesCombined, path: '/assets', group: 'Money' },
 { name: 'Income & expenses', icon: ArrowLeftRight, path: '/income-expenses', group: 'Money' },
 { name: 'Loans & debts', icon: HandCoins, path: '/loans-debts', group: 'Money' },
 { name: 'Accounts', icon: Wallet, path: '/accounts', group: 'Money' },
 { name: 'Upcoming payments', icon: CalendarClock, path: '/upcoming', group: 'Planning' },
 { name: 'Savings goals', icon: Target, path: '/goals', group: 'Planning' },
 { name: 'Recently deleted', icon: Trash2, path: '/recently-deleted', group: 'Manage' },
 { name: 'Settings', icon: Settings, path: '/settings', group: 'Manage' },
] as const;

export type SectionName = (typeof sections)[number]['name'];
export const navigationGroups = [...new Set(sections.map(section => section.group))];

/** The section a path belongs to. Unknown paths fall back to Overview. */
export function sectionFor(pathname: string): SectionName {
 return sections.find(section => section.path === pathname)?.name ?? 'Overview';
}
