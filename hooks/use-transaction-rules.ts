"use client";
import { useState } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import type { Entry } from '@/lib/finance';
import { showNotice, showSaved } from '@/lib/feedback';
import type { TransactionSplit } from '@/lib/transaction-tools';
import { ruleChoice, ruleTargets, type CategoryChoice, type TransactionRule } from '@/lib/transaction-rules';

const emptyRules: { rules: TransactionRule[] } = { rules: [] };
/** What applying a rule in the sample workspace does to its own records. */
export type RuleActions = {
 categorize: (ids: string[], choice: CategoryChoice) => Promise<number>;
 assignBusiness: (ids: string[], business: string | null) => Promise<number>;
 changeTags: (ids: string[], add: string[], remove: string[]) => Promise<number>;
 tagsOf: (id: string) => readonly string[];
};
const normalize = (rule: TransactionRule): TransactionRule => ({ ...rule, kind: rule.kind ?? null, category_id: rule.category_id ?? null, business_id: rule.business_id ?? null, tag_ids: rule.tag_ids ?? [] });

/** Saved rules. Saving one can also apply it to matching past transactions; the result is how many changed.
 * The sample workspace keeps its rules in memory and applies them to its own records. */
export function useTransactionRules(owner: string | null, demo: boolean, revision: number, records: Entry[], splits: TransactionSplit[], actions: RuleActions, onSaved: () => void) {
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
  rules: (demo ? sample : remote.data.rules).map(normalize),
  loading: live && remote.initialLoading,
  error: live ? remote.error : '',
  retry: remote.retry,
  async save(rule: TransactionRule, apply: boolean) {
   let changed = 0;
   if (demo) {
    setSample(previous => [rule, ...previous.filter(item => item.id !== rule.id)]);
    if (apply) {
     const ids = ruleTargets(rule, records, splits, actions.tagsOf), touched = new Set<string>();
     const choice = ruleChoice(rule);
     // Each action reports a count only, so a transaction changed by several actions counts once at most per action.
     const counts = [choice ? await actions.categorize(ids, choice) : 0, rule.business_id ? await actions.assignBusiness(ids, rule.business_id) : 0, rule.tag_ids.length ? await actions.changeTags(ids, rule.tag_ids, []) : 0];
     for (const id of ids) touched.add(id);
     changed = Math.min(touched.size, counts.reduce((sum, count) => sum + count, 0));
    }
   } else {
    changed = await post('save_rule', { id: rule.id, pattern: rule.pattern, direction: rule.direction, kind: rule.kind, category_id: rule.category_id, business_id: rule.business_id, tag_ids: rule.tag_ids, apply });
    remote.invalidate();
    if (changed) onSaved();
   }
   showSaved();
   return changed;
  },
  async remove(id: string) {
   if (demo) setSample(previous => previous.filter(item => item.id !== id));
   else { await post('delete_rule', { id }); remote.invalidate(); }
   showNotice('Deleted');
  },
 };
}
