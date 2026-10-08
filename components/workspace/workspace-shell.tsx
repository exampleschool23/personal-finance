"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { Brand } from '@/components/presentation-foundation/brand';
import { DatabaseStatus } from '@/components/database-status';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder, NavigationShimmer } from '@/components/presentation-foundation/loading-placeholder';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { LandingPage } from '@/components/landing-page';
import { SignInScreen } from '@/components/sign-in-screen';
import { TelegramPanel } from '@/components/telegram-panel';
import { useVisitor } from '@/components/visitor-context';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TopBarSlotProvider } from '@/components/presentation-foundation/top-bar-slot';
import { AppDrawer } from '@/components/workspace/app-drawer';
import { pendingDestination, sectionFor, type PendingNavigation } from '@/components/workspace/navigation';
import { DisplayPreferences, TopBar } from '@/components/workspace/top-bar';
import { WorkspaceDialogs } from '@/components/workspace/workspace-dialogs';
import { useWorkspace, WorkspaceProvider } from '@/components/workspace/workspace-provider';
import { awaitingSettings } from '@/lib/onboarding';
import { signInPath } from '@/lib/sign-in-path';
import { showError } from '@/lib/feedback';

/** Frames the current screen with the drawer and top bar once the session is known. */
function WorkspaceShell({ children }: { children: ReactNode }) {
 const { t } = useLanguage();
 const { ready, user, demo, preview, pathname, busy, configured, error, login, startDemo, overdueCount, onboardingNeeded, settingsLoading, preferencesData, savePreferences, applyPreferences, planning, saveTrackingStart, household } = useWorkspace();
 // A drawer tap shows its destination immediately; the routed screen replaces it once it arrives.
 const [pending, setPending] = useState<PendingNavigation | null>(null);
 const destination = pendingDestination(pending, pathname);
 useEffect(() => {
  if (!destination) return;
  // The router falls back to a full page load on failure; never leave a skeleton standing regardless.
  const timer = setTimeout(() => setPending(null), 10000);
  return () => clearTimeout(timer);
 }, [destination]);
 function navigate(path: string) { setPending({ from: pathname, to: path }); window.scrollTo({ top: 0 }); }
 const visitor = useVisitor();
 const signedIn = !!user || demo;
 // The server already knows a visitor without session cookies is signed out, so the tour and the sign-in card render there without waiting for the session check.
 const signedOut = ready ? !signedIn : visitor.signedOut;
 if (signedOut && pathname === '/')
  return <LandingPage brand={<Brand/>} preferences={<DisplayPreferences/>} busy={busy} error={error} onDemo={startDemo}/>;
 if (signedOut && pathname === signInPath)
  return <SignInScreen brand={<Brand/>} preferences={<DisplayPreferences/>} busy={busy} configured={configured} error={error} onLogin={login} onDemo={startDemo}/>;
 // An app preview only ever shows the sample workspace, never a signed-in account's records.
 if (preview && user) return null;
 // Everything else waits: for the session, for the redirect off a page this visitor cannot use, or for the account's settings.
 if (!ready || !signedIn || pathname === signInPath || awaitingSettings({ user, demo, loading: settingsLoading }))
  return <main className="session-loading" aria-busy="true"><Brand/><LoadingPlaceholder label={t("Loading your workspace…")} rows={3}/></main>;
 // A first sign-in answers a few setup questions before the drawer and screens appear.
 if (onboardingNeeded)
  return <OnboardingScreen brand={<Brand/>} initial={preferencesData} telegram={<TelegramPanel demo={false}/>} savePreferences={savePreferences} applyPreferences={applyPreferences} saveGoal={goal => planning.save('goal', goal)} saveTrackingStart={saveTrackingStart}/>;
 const account = demo
  ? { initial: 'D', title: t("Demo workspace"), detail: t("Sample data") }
  : { initial: (preferencesData.display_name?.trim() || user!).replace(/^\+/, '').slice(0, 1).toUpperCase(), title: t("Personal account"), detail: user! };
 // Your own finances first, then each household you belong to.
 const homes = household.state;
 const workspaces = homes ? [{ id: homes.me, label: t('My finances') }, ...homes.memberships.map(item => ({ id: item.owner_id, label: t('Household of {name}', { name: item.name ?? t('Partner') }) }))] : [];
 return <SidebarProvider>
  <AppDrawer account={account} overdueCount={overdueCount} pendingPath={destination} onNavigate={navigate} badge={demo ? t("Demo") : undefined} workspaces={workspaces} workspace={homes?.active} onWorkspace={id => household.open(id === homes?.me ? null : id).catch(reason => showError((reason as Error).message))}/>
  <TopBarSlotProvider><main className="workspace">
   <DatabaseStatus owner={user} demo={demo}/>
   <TopBar pendingSection={destination && sectionFor(destination)}/>
   {destination ? <NavigationShimmer label={t("Loading records…")}/> : children}
  </main></TopBarSlotProvider>
  <WorkspaceDialogs/>
 </SidebarProvider>;
}

/** The signed-in workspace: shared state, the drawer and top bar, and the routed screen inside them. */
export function Workspace({ children }: { children: ReactNode }) {
 const visitor = useVisitor();
 return <LanguageProvider initial={visitor.language}><WorkspaceProvider><WorkspaceShell>{children}</WorkspaceShell></WorkspaceProvider></LanguageProvider>;
}
