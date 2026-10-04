"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { useTopBarSlot } from '@/components/presentation-foundation/top-bar-slot';
import { Button } from '@/components/ui/button';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { sectionLabel } from '@/components/workspace/navigation';

/** Two staggered bars, the long one over the short: the drawer's menu mark. */
function DrawerIcon() {
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M4 8h16"/><path d="M4 16h10"/></svg>;
}

/** A page's tabs and actions join the bar only on wide windows, and only while everything fits on its one line. */
const roomyBar = '(min-width: 768px)';
function useRoomyBar() {
 return useSyncExternalStore(change => { const query = window.matchMedia(roomyBar); query.addEventListener('change', change); return () => query.removeEventListener('change', change); }, () => window.matchMedia(roomyBar).matches, () => false);
}

/** Widths of `elements` laid side by side with `gap` between them. */
function rowWidth(elements: readonly Element[], gap: number) {
 return elements.reduce((total, element) => total + element.getBoundingClientRect().width, 0) + gap * Math.max(0, elements.length - 1);
}

/** The width the bar's one line needs for the page's title, tabs and actions beside its own controls, measured from
 * wherever the tabs and actions are now: in the bar, or opening the page. */
function barWidthNeeded(node: HTMLElement) {
 const page = document.querySelector('.workspace .page-heading-actions');
 const tabs = node.querySelector('.page-tabs') ?? page?.querySelector('.page-tabs');
 const actions = node.querySelector('.topbar-page-actions .entry-actions') ?? page?.querySelector('.entry-actions');
 const location = node.querySelector('.topbar-location'), own = node.querySelector('.topbar-actions');
 const extras = [...location?.children ?? []].filter(child => !child.matches('.topbar-page-title, .topbar-title'));
 const title = node.querySelector('.topbar-page-title h1')?.scrollWidth ?? 0;
 return rowWidth(extras, 12) + (extras.length ? 12 : 0) + title
  + (tabs ? 22 + rowWidth([...tabs.children], 16) : 0)
  + 12 + (actions ? rowWidth([...actions.children], 8) + 21 : 0)
  + rowWidth([...own?.children ?? []].filter(child => !child.matches('.topbar-page-actions')), 8);
}

/** Theme choice for the top bar. The language is chosen once, in onboarding or Settings. */
export function DisplayPreferences() {
 return <div className="preferences"><ThemeToggle/></div>;
}

/** The sticky bar above every screen: where you are, the display currency switch and the quick expense shortcut. */
/** `pendingSection` names a destination tapped in the drawer whose route is still loading. */
export function TopBar({ pendingSection }: { pendingSection?: string | null }) {
 const { t } = useLanguage();
 const { section: current, currency, setCurrency, preferencesData, quickExpense, readOnly } = useWorkspace();
 // The drawer carries its own collapse button; the bar offers one only when the drawer is out of sight.
 const { state, isMobile } = useSidebar();
 const drawerHidden = isMobile || state === 'collapsed';
 // The open page puts its title and actions here; the section name stands in while it loads.
 const slot = useTopBarSlot();
 const roomy = useRoomyBar();
 // Whether the page's tabs and actions would overflow the bar's one line. It is worked out from the widths everything
 // needs, wherever it sits now, so the answer does not depend on where it was; a little slack stops it flickering.
 const bar = useRef<HTMLElement>(null), [crowded, setCrowded] = useState(false);
 useEffect(() => {
  const node = bar.current;
  if (!roomy || !node) return;
  const check = () => {
   const needed = barWidthNeeded(node), style = getComputedStyle(node);
   const room = node.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
   setCrowded(previous => previous ? needed + 8 > room : needed > room);
  };
  const resized = new ResizeObserver(check), changed = new MutationObserver(check);
  resized.observe(node); changed.observe(node, { childList: true, subtree: true });
  check();
  return () => { resized.disconnect(); changed.disconnect(); };
 }, [roomy]);
 const section = pendingSection ?? current;
 const currentLabel = t(sectionLabel(current));
 // Each screen names its browser tab, so history and tab switchers tell the pages apart.
 useEffect(() => { document.title = `${currentLabel} · Hoggish Finance`; }, [currentLabel]);
 return <header ref={bar} className="topbar">
  <div className="topbar-location">{drawerHidden && <SidebarTrigger variant="outline" className="drawer-toggle" aria-label={t('Toggle Sidebar')}><DrawerIcon/></SidebarTrigger>}<div className="topbar-page-title" ref={slot?.titleRef}/><span className="topbar-title">{t(sectionLabel(section))}</span></div>
  <div className="topbar-actions">
   {roomy && !crowded && <div className="topbar-page-actions" ref={slot?.actionsRef}/>}
   {/* With two preferred currencies, one tap switches the display currency; with one there is nothing to choose. */}
   {preferencesData.currencies.length > 1 && <Segmented className="header-currency-switch" label={t('Display currency')} options={preferencesData.currencies.map(code => ({ value: code, label: code }))} value={currency} onChange={setCurrency}/>}
   {/* Adding an expense belongs to Cash flow; other pages carry their own main action. */}
   {!readOnly && section === 'Income & expenses' && <Button size="sm" className="quick-expense" aria-label={t('Add expense')} onClick={quickExpense}><Plus size={16} aria-hidden="true"/><span>{t('Add expense')}</span></Button>}
   <DisplayPreferences/>
  </div>
 </header>;
}
