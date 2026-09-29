"use client";
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/brand';
import { DatabaseStatus } from '@/components/database-status';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { SignInScreen } from '@/components/sign-in-screen';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppDrawer } from '@/components/workspace/app-drawer';
import { DisplayPreferences, TopBar } from '@/components/workspace/top-bar';
import { WorkspaceDialogs } from '@/components/workspace/workspace-dialogs';
import { useWorkspace, WorkspaceProvider } from '@/components/workspace/workspace-provider';

/** Frames the current screen with the drawer and top bar once the session is known. */
function WorkspaceShell({ children }: { children: ReactNode }) {
 const { t } = useLanguage();
 const { ready, user, demo, pathname, busy, configured, error, login, logout, startDemo, overdueCount } = useWorkspace();
 if (!ready || (!user && !demo && pathname !== '/'))
  return <main className="session-loading" aria-busy="true"><Brand/><LoadingPlaceholder label={t("Loading your workspace…")} rows={3}/></main>;
 if (!user && !demo)
  return <SignInScreen brand={<Brand/>} preferences={<DisplayPreferences/>} busy={busy} configured={configured} error={error} onLogin={login} onDemo={startDemo}/>;
 const account = demo
  ? { initial: 'D', title: t("Demo workspace"), detail: t("Sample data") }
  : { initial: user!.slice(0, 1).toUpperCase(), title: t("Personal account"), detail: user! };
 return <SidebarProvider>
  <AppDrawer account={account} overdueCount={overdueCount} signOutLabel={demo ? t("Exit demo") : t("Sign out")} onSignOut={logout}/>
  <main className="workspace">
   <DatabaseStatus owner={user} demo={demo}/>
   <TopBar/>
   {children}
   <footer className="content workspace-privacy-footer"><p className="bottom-note"><ShieldCheck size={14}/>{demo ? t("Sample data for exploring the app.") : t("Private records · Only visible to your account.")}</p></footer>
  </main>
  <WorkspaceDialogs/>
 </SidebarProvider>;
}

/** The signed-in workspace: shared state, the drawer and top bar, and the routed screen inside them. */
export function Workspace({ children }: { children: ReactNode }) {
 return <LanguageProvider><WorkspaceProvider><WorkspaceShell>{children}</WorkspaceShell></WorkspaceProvider></LanguageProvider>;
}
