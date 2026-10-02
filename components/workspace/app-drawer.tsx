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
import { sectionFor, sections } from '@/components/workspace/navigation';

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
 // One drawer row; the main list and the foot share it.
 const item = ({ name, label, icon: Icon, path }: (typeof sections)[number]) => <SidebarMenuItem key={name}>
  <SidebarMenuButton asChild className="nav-item" isActive={active === name}>
   <DrawerLink href={path} aria-current={active === name ? 'page' : undefined} onClick={follow(path)}><Icon/><span>{t(label)}</span>{name === 'Upcoming payments' && overdueCount > 0 && <span className="count">{formatNumber(overdueCount, locale, 0)}</span>}</DrawerLink>
  </SidebarMenuButton>
 </SidebarMenuItem>;
 const settings = sections.find(section => section.group === 'Account')!;
 // Right-to-left languages open the drawer from the right edge.
 return <Sidebar className="border-sidebar-border" side={language && directionOf(language) === 'rtl' ? 'right' : 'left'}>
  <SidebarHeader className="sidebar-brand"><Brand onClick={follow('/')} badge={badge}/></SidebarHeader>
  <SidebarContent className="sidebar-navigation"><nav aria-label={t('WORKSPACE')}>
   <SidebarMenu>{sections.filter(section => section.group === 'WORKSPACE').map(item)}</SidebarMenu>
  </nav></SidebarContent>
  <SidebarFooter className="sidebar-account">
   <nav aria-label={t('Manage')}><SidebarMenu>{sections.filter(section => section.group === 'Manage').map(item)}</SidebarMenu></nav>
   {/* The account opens Settings; sign out stays beside it. */}
   <div className="user-line">
    <DrawerLink href={settings.path} className="user-link" data-active={active === settings.name} aria-current={active === settings.name ? 'page' : undefined} aria-label={`${account.title}, ${t(settings.label)}`} title={t(settings.label)} onClick={follow(settings.path)}>
     <span className="avatar">{account.initial}</span>
     <div><strong>{account.title}</strong><p>{account.detail}</p></div>
    </DrawerLink>
    <Button variant="ghost" size="icon" onClick={onSignOut} aria-label={signOutLabel} title={signOutLabel}><LogOut size={17} aria-hidden="true"/></Button>
   </div>
  </SidebarFooter>
 </Sidebar>;
}
