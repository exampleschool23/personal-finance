"use client";
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { showSaved } from '@/lib/feedback';
import type { HouseholdAction, HouseholdState } from '@/lib/household';

const empty: HouseholdState | null = null;
// A full page load, so nothing from the previous workspace stays in memory.
const reloadHome = () => window.location.replace(new URL('/', window.location.href).href);

async function post<T>(action: HouseholdAction, data: unknown) {
 const response = await fetch('/api/household', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }) });
 const result = await response.json().catch(() => ({})) as T & { error?: string };
 if (!response.ok) throw Error(result.error ?? 'Could not load your household. Check that database update 100 is installed.');
 return result;
}

/**
 * The household of the signed-in person: who shares the open workspace, their role in it,
 * the people and invites of their own household and the households they belong to.
 * Switching workspace reloads the app, so no data from the previous workspace stays in memory.
 * The sample workspace has no household.
 */
export function useHousehold(owner: string | null, demo: boolean) {
 const live = !!owner && !demo;
 const remote = useOwnerResource('/api/household', owner, live, 0, empty);
 async function change(action: Exclude<HouseholdAction, 'preview' | 'accept' | 'switch' | 'invite' | 'attribute'>, data: unknown) {
  await post(action, data);
  showSaved();
  remote.invalidate();
 }
 async function open(workspace: string | null) {
  await post('switch', { owner: workspace });
  reloadHome();
 }
 return {
  state: live ? remote.data : null,
  loading: live && remote.initialLoading,
  error: live ? remote.error : '',
  retry: remote.retry,
  /** A new single-use link; the token is shown once and never stored in the app. */
  async invite(role: 'member' | 'viewer') {
   const result = await post<{ link: string; invite: { expires_at: string } }>('invite', { role });
   remote.invalidate();
   return result;
  },
  revoke: (id: string) => change('revoke', { id }),
  setRole: (member: string, role: 'member' | 'viewer') => change('role', { member, role }),
  remove: (member: string) => change('remove', { member }),
  async leave(workspace: string) {
   await post('leave', { owner: workspace });
   if (remote.data?.active === workspace) reloadHome(); else { showSaved(); remote.invalidate(); }
  },
  preview: (token: string) => post<{ owner_id: string; name: string | null; role: 'member' | 'viewer'; own: boolean; joined: boolean }>('preview', { token }),
  /** Records who paid for transactions; resolves to how many changed. */
  async attribute(ids: string[], member: string) { const result = await post<{ changed: number }>('attribute', { ids, member }); showSaved(); return result.changed; },
  /** Joins and opens the household. */
  async accept(token: string) { await post('accept', { token }); reloadHome(); },
  open,
 };
}
export type Household = ReturnType<typeof useHousehold>;
