"use client";
import { useState } from 'react';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { defaultDashboardLayout, normalizeLayout, type DashboardLayout } from '@/lib/dashboard-layout';
import { showError } from '@/lib/feedback';

/** The saved dashboard layout. Changes show at once and are saved as a workspace preference; the sample workspace keeps them in memory. */
export function useDashboardLayout(preferences: PreferenceResource, demo: boolean) {
 const saved = preferences.data.preferences.find(item => item.key === 'dashboard');
 const [local, setLocal] = useState<DashboardLayout | null>(null);
 const layout = local ?? normalizeLayout(saved?.key === 'dashboard' ? saved.data as Partial<DashboardLayout> : defaultDashboardLayout);
 function change(next: DashboardLayout) {
  setLocal(next);
  if (demo) return;
  preferences.save({ key: 'dashboard', data: next }).catch(error => { setLocal(null); showError((error as Error).message); });
 }
 return { layout, change };
}
