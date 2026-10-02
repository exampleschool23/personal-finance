"use client";
import { useState } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import type { Entry } from '@/lib/finance';
import { showSaved } from '@/lib/feedback';
import type { TransactionSplit } from '@/lib/transaction-tools';
import { ruleTargets, type CategoryChoice, type TransactionRule } from '@/lib/transaction-rules';

const emptyRules: { rules: TransactionRule[] } = { rules: [] };

/** Saved rules. Saving one can also apply it to matching past transactions; the result is how many changed.
 * The sample workspace keeps its rules in memory and applies them to its own records. */
export function useTransactionRules(owner: string | null, demo: boolean, revision: number, records: Entry[], splits: TransactionSplit[], categorize: (ids: string[], choice: CategoryChoice) => Promise<number>, onSaved: () => void) {
 const live = !!owner && !demo;
 const remote = useOwnerResource('/api/transaction-rules', owner, live, revision, emptyRules);
 const [sample, setSample] = useState<TransactionRule[]>([]);
 async function post(action: string, data: unknown) {
  const response = await fetch('/api/transaction-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }) });
  const result = await response.json() as { changed?: number; error?: string };
  if (!response.ok) throw Error(result.error ?? 'Could not save changes.');
  return result.changed ?? 0;
 }
 return {
  rules: demo ? sample : remote.data.rules,
  loading: live && remote.initialLoading,
  error: live ? remote.error : '',
  retry: remote.retry,
  async save(rule: TransactionRule, apply: boolean) {
   let changed = 0;
   if (demo) {
    setSample(previous => [rule, ...previous.filter(item => item.id !== rule.id)]);
    if (apply) changed = await categorize(ruleTargets(rule, records, splits), rule);
   } else {
    changed = await post('save_rule', { id: rule.id, pattern: rule.pattern, kind: rule.kind, category_id: rule.category_id, apply });
    remote.invalidate();
    if (changed) onSaved();
   }
   showSaved();
   return changed;
  },
  async remove(id: string) {
   if (demo) setSample(previous => previous.filter(item => item.id !== id));
   else { await post('delete_rule', { id }); remote.invalidate(); }
   showSaved();
  },
 };
}
