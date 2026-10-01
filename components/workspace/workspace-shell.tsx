"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/presentation-foundation/brand';
import { DatabaseStatus } from '@/components/database-status';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder, PageSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { SignInScreen } from '@/components/sign-in-screen';
import { TelegramPanel } from '@/components/telegram-panel';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppDrawer } from '@/components/workspace/app-drawer';
import { pendingDestination, sectionFor, type PendingNavigation } from '@/components/workspace/navigation';
import { DisplayPreferences, TopBar } from '@/components/workspace/top-bar';
import { WorkspaceDialogs } from '@/components/workspace/workspace-dialogs';
import { useWorkspace, WorkspaceProvider } from '@/components/workspace/workspace-provider';
import { awaitingSettings } from '@/lib/onboarding';

/** Frames the current screen with the drawer and top bar once the session is known. */
function WorkspaceShell({ children }: { children: ReactNode }) {
 const { t } = useLanguage();
 const { ready, user, demo, pathname, busy, configured, error, login, logout, startDemo, overdueCount, onboardingNeeded, settingsLoading, preferencesData, savePreferences, applyPreferences, planning, saveTrackingStart } = useWorkspace();
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
 // Until the account's settings are known, neither the dashboard nor the welcome setup can be chosen.
 if (!ready || (!user && !demo && pathname !== '/') || awaitingSettings({ user, demo, loading: settingsLoading }))
  return <main className="session-loading" aria-busy="true"><Brand/><LoadingPlaceholder label={t("Loading your workspace…")} rows={3}/></main>;
 if (!user && !demo)
  return <SignInScreen brand={<Brand/>} preferences={<DisplayPreferences/>} busy={busy} configured={configured} error={error} onLogin={login} onDemo={startDemo}/>;
 // A first sign-in answers a few setup questions before the drawer and screens appear.
 if (onboardingNeeded)
  return <OnboardingScreen brand={<Brand/>} initial={preferencesData} telegram={<TelegramPanel demo={false}/>} savePreferences={savePreferences} applyPreferences={applyPreferences} saveGoal={goal => planning.save('goal', goal)} saveTrackingStart={saveTrackingStart}/>;
 const account = demo
  ? { initial: 'D', title: t("Demo workspace"), detail: t("Sample data") }
  : { initial: (preferencesData.display_name?.trim() || user!).replace(/^\+/, '').slice(0, 1).toUpperCase(), title: t("Personal account"), detail: user! };
 return <SidebarProvider>
  <AppDrawer account={account} overdueCount={overdueCount} signOutLabel={demo ? t("Exit demo") : t("Sign out")} onSignOut={logout} pendingPath={destination} onNavigate={navigate}/>
  <main className="workspace">
   <DatabaseStatus owner={user} demo={demo}/>
   <TopBar pendingSection={destination && sectionFor(destination)}/>
   {destination ? <PageSkeleton label={t("Loading your workspace…")} section={sectionFor(destination)}/> : children}
   <footer className="content workspace-privacy-footer"><p className="bottom-note"><ShieldCheck size={14}/>{demo ? t("Sample data for exploring the app.") : t("Private records · Only visible to your account.")}</p></footer>
  </main>
  <WorkspaceDialogs/>
 </SidebarProvider>;
}

/** The signed-in workspace: shared state, the drawer and top bar, and the routed screen inside them. */
export function Workspace({ children }: { children: ReactNode }) {
 return <LanguageProvider><WorkspaceProvider><WorkspaceShell>{children}</WorkspaceShell></WorkspaceProvider></LanguageProvider>;
}
