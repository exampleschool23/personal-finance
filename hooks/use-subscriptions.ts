"use client";
import { useState } from 'react';
import { saveOwnerResource, useOwnerResource } from '@/hooks/use-owner-resource';
import { showSaved } from '@/lib/feedback';
import type { Entry } from '@/lib/finance';
import { emptyPlanning } from '@/lib/planning';
import type { SubscriptionDecision } from '@/lib/recurring-insights';

const emptyDecisions: { decisions: SubscriptionDecision[] } = { decisions: [] };

/**
 * The full transaction history that subscriptions are found in, and the owner's decisions about them.
 * The sample workspace reads its records in memory and keeps decisions for the visit.
 */
export function useSubscriptions(owner: string | null, demo: boolean, revision: number, sampleRecords: Entry[]) {
 const live = !!owner && !demo;
 const history = useOwnerResource('/api/planning?scope=insights', owner, live, revision, emptyPlanning);
 const remote = useOwnerResource('/api/subscriptions', owner, live, revision, emptyDecisions);
 const [sample, setSample] = useState<SubscriptionDecision[]>([]);
 const same = (a: Pick<SubscriptionDecision, 'merchant' | 'currency'>, b: Pick<SubscriptionDecision, 'merchant' | 'currency'>) => a.merchant === b.merchant && a.currency === b.currency;
 return {
  records: demo ? sampleRecords : history.data.records,
  decisions: demo ? sample : remote.data.decisions,
  loading: live && (history.initialLoading || remote.initialLoading),
  error: live ? history.error || remote.error : '',
  retry: () => { history.retry(); remote.retry(); },
  async decide(decision: SubscriptionDecision) {
   if (demo) { setSample(list => [...list.filter(item => !same(item, decision)), decision]); showSaved(); return; }
   await saveOwnerResource('/api/subscriptions', 'decide', decision);
   remote.update(data => ({ decisions: [...data.decisions.filter(item => !same(item, decision)), decision] }));
  },
  async restore(key: Pick<SubscriptionDecision, 'merchant' | 'currency'>) {
   if (demo) { setSample(list => list.filter(item => !same(item, key))); showSaved(); return; }
   await saveOwnerResource('/api/subscriptions', 'restore', { merchant: key.merchant, currency: key.currency });
   remote.update(data => ({ decisions: data.decisions.filter(item => !same(item, key)) }));
  },
 };
}
