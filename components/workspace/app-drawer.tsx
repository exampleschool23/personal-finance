"use client";
import type { MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Brand } from '@/components/presentation-foundation/brand';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { formatNumber } from '@/lib/format';
import { directionOf } from '@/lib/i18n';
import { navigationGroups, sectionFor, sections } from '@/components/workspace/navigation';

type Props = {
 /** Who is signed in, shown at the foot of the drawer. */
 account: { initial: string; title: string; detail: string };
 /** Overdue payments, shown beside Upcoming payments. */
 overdueCount: number;
 signOutLabel: string;
 onSignOut: () => void;
 /** The destination tapped but not open yet; it is highlighted straight away. */
 pendingPath?: string | null;
 /** Called when a tap will navigate this tab, before the route loads. */
 onNavigate?: (path: string) => void;
 /** A short label beside the logo, such as Demo for the sample workspace. */
 badge?: string;
};

/** The navigation drawer. It knows the routes and the signed-in account, and nothing about any screen. */
export function AppDrawer({ account, overdueCount, signOutLabel, onSignOut, pendingPath, onNavigate, badge }: Props) {
 const { t, locale, language } = useLanguage();
 const pathname = usePathname();
 const { setOpenMobile } = useSidebar();
 const active = sectionFor(pendingPath ?? pathname);
 // A plain tap closes the phone drawer and shows the destination at once; modified clicks leave it alone.
 const follow = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.defaultPrevented || event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  // On phones the drawer covers the page: close it so the destination shows at once.
  setOpenMobile(false);
  if (path !== pathname) onNavigate?.(path);
 };
 // Right-to-left languages open the drawer from the right edge.
 return <Sidebar className="border-sidebar-border" side={language && directionOf(language) === 'rtl' ? 'right' : 'left'}>
  <SidebarHeader className="sidebar-brand"><Brand onClick={follow('/')} badge={badge}/></SidebarHeader>
  <SidebarContent className="sidebar-navigation">{navigationGroups.map(group => <nav className="nav-group" key={group} aria-label={t(group)}>
   <p className="nav-label">{t(group)}</p>
   <SidebarMenu>{sections.filter(section => section.group === group).map(({ name, label, icon: Icon, path }) => <SidebarMenuItem key={name}>
    <SidebarMenuButton asChild className="nav-item" isActive={active === name}>
     <DrawerLink href={path} aria-current={active === name ? 'page' : undefined} onClick={follow(path)}><Icon/><span>{t(label)}</span>{name === 'Upcoming payments' && overdueCount > 0 && <span className="count">{formatNumber(overdueCount, locale, 0)}</span>}</DrawerLink>
    </SidebarMenuButton>
   </SidebarMenuItem>)}</SidebarMenu>
  </nav>)}</SidebarContent>
  <SidebarFooter className="sidebar-account"><div className="user-line">
   <span className="avatar">{account.initial}</span>
   <div><strong>{account.title}</strong><p>{account.detail}</p></div>
   <Button variant="ghost" size="icon" onClick={onSignOut} aria-label={signOutLabel} title={signOutLabel}><LogOut size={17} aria-hidden="true"/></Button>
  </div></SidebarFooter>
 </Sidebar>;
}
