"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Count } from '@/components/presentation-foundation/count';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { Entry } from '@/lib/finance';
import { formatNumber } from '@/lib/format';
import type { Category } from '@/lib/planning';
import { amountRangeValid, canSaveRule, extraCriteria, finishedRule, ruleChoice, ruleCriterion, ruleTargets, type TransactionRule } from '@/lib/transaction-rules';
import type { Tag } from '@/lib/tags';
import { BusinessChoiceButton, CategoryChoiceButton } from './pickers';
import { TagSelector } from './tags';

type RuleChange = (fields: Partial<TransactionRule> | ((rule: TransactionRule) => Partial<TransactionRule>)) => void;

/** What a transaction must match: its name and, behind "More conditions", an account, a category, a business and an
 * amount range. `draft` is the form as typed; `next` the rule it saves. */
function RuleCriteria({ draft, next, open, categories, businesses, accounts, change }: { draft: TransactionRule; next: TransactionRule; open: boolean; categories: readonly Category[]; businesses: readonly BusinessOption[]; accounts: ReadonlyArray<{ id: string; name: string }>; change: RuleChange }) {
 const { t, locale } = useLanguage();
 const extra = extraCriteria(next);
 const amount = (value: number | null, field: 'amount_min' | 'amount_max', label: string) => <label>{t(label)}<FormattedNumberInput value={value ?? 0} required={false} ariaLabel={t(label)} placeholder="" onValueChange={(typed, blank) => change({ [field]: blank ? null : typed })}/></label>;
 return <div className="rule-column">
  <div className="budget-dialog-label">{t('When the name')}
   <div className="rule-name-criterion">
    <NativeSelect aria-label={t('Name match')} value={draft.match} onChange={event => change({ match: event.currentTarget.value as TransactionRule['match'] })}><option value="contains">{t('Contains')}</option><option value="exact">{t('Is exactly')}</option></NativeSelect>
    <Input aria-label={t('Name')} required={!extra} maxLength={120} value={draft.pattern} onChange={event => change({ pattern: event.currentTarget.value })}/>
   </div>
  </div>
  <div className="budget-dialog-label">{t('Applies to')}<Segmented label={t('Applies to')} options={[{ value: 'expense', label: t('Expenses') }, { value: 'income', label: t('Income') }, { value: 'any', label: t('Both') }] as const} value={draft.direction} onChange={direction => change({ direction })}/></div>
  <details className="rule-more" open={open || undefined}>
   <summary>{t('More conditions')}{extra > 0 && <Count value={extra}/>}</summary>
   {accounts.length > 0 && <label className="budget-dialog-label">{t('Account')}<NativeSelect value={next.account_id ?? ''} onChange={event => change({ account_id: event.currentTarget.value || null })}><option value="">{t('Any account')}</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>}
   {next.direction !== 'any' && <div className="budget-dialog-label">{t('Category')}<CategoryChoiceButton categories={categories} direction={next.direction} value={ruleCriterion(next)} placeholder={t('Any category')} clearLabel={t('Any category')} onChange={value => change({ match_kind: value?.kind ?? null, match_category_id: value?.category_id ?? null })}/></div>}
   {businesses.length > 0 && <label className="budget-dialog-label">{t('Business')}<NativeSelect value={next.match_business_id ?? ''} onChange={event => change({ match_business_id: event.currentTarget.value || null })}><option value="">{t('Any business')}</option>{businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>}
   <div className="budget-dialog-label">{t('Amount')}<div className="rule-amount-range">{amount(next.amount_min, 'amount_min', 'From')}{amount(next.amount_max, 'amount_max', 'To')}</div>{!amountRangeValid(next) && <span className="form-error" role="alert">{t('The upper amount must not be below {amount}.', { amount: formatNumber(next.amount_min ?? 0, locale) })}</span>}</div>
  </details>
 </div>;
}

/** What the rule then sets: a category, a business and tags (at most ten). */
function RuleActions({ next, categories, businesses, tags, onCreateTag, change }: { next: TransactionRule; categories: readonly Category[]; businesses: readonly BusinessOption[]; tags: readonly Tag[]; onCreateTag?: (name: string) => Promise<string>; change: RuleChange }) {
 const { t } = useLanguage();
 const business = businesses.find(item => item.id === next.business_id);
 const toggleTag = (id: string) => change(rule => ({ tag_ids: rule.tag_ids.includes(id) ? rule.tag_ids.filter(item => item !== id) : rule.tag_ids.length >= 10 ? rule.tag_ids : [...rule.tag_ids, id] }));
 return <div className="rule-column">
  {next.direction !== 'any' && <div className="budget-dialog-label">{t('Set the category to')}<CategoryChoiceButton categories={categories} direction={next.direction} value={ruleChoice(next)} placeholder={t('Leave unchanged')} clearLabel={t('Leave unchanged')} onChange={value => change({ kind: value?.kind ?? null, category_id: value?.category_id ?? null })}/></div>}
  {businesses.length > 0 && <div className="budget-dialog-label">{t('Set the business to')}<BusinessChoiceButton businesses={businesses} household={false} value={next.business_id} label={business ? <><BusinessMark name={business.name} color={business.business_color} logo={business.business_logo} size="sm"/>{business.name}</> : t('Leave unchanged')} clearLabel={t('Leave unchanged')} onChange={value => change({ business_id: value })}/></div>}
  <div className="budget-dialog-label">{t('Add tags')}<TagSelector tags={tags} selected={next.tag_ids} onToggle={toggleTag} onCreate={onCreateTag}/></div>
 </div>;
}

/** Create or edit a rule: what a transaction must match and what the rule then sets (category, business, tags),
 * optionally applied to past transactions. */
export function RuleDialog({ rule, records, categories, businesses, accounts = [], tags, splits, tagsOf, onCreateTag, onSave, onClose }: { rule: TransactionRule; records?: Entry[]; categories: readonly Category[]; businesses: readonly BusinessOption[]; accounts?: ReadonlyArray<{ id: string; name: string }>; tags: readonly Tag[]; splits: Parameters<typeof ruleTargets>[2]; tagsOf: (id: string) => readonly string[]; onCreateTag?: (name: string) => Promise<string>; onSave: (rule: TransactionRule, apply: boolean) => Promise<number>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [draft, setDraft] = useState(rule);
 const [apply, setApply] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const change: RuleChange = fields => setDraft(current => ({ ...current, ...(typeof fields === 'function' ? fields(current) : fields) }));
 const next = finishedRule(draft), valid = canSaveRule(next);
 // Without the transactions at hand (Settings), the count is left to the database.
 const matches = records && valid ? ruleTargets(next, records, splits, tagsOf).length : null;
 async function save() {
  if (!valid) return;
  setBusy(true); setError('');
  try { await onSave(next, apply); onClose(); } catch (reason) { setError(t((reason as Error).message)); } finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
  <DialogContent className="budget-dialog rule-dialog">
   <DialogTitle>{t('Rule')}</DialogTitle>
   <form onSubmit={event => { event.preventDefault(); return save(); }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     <div className="rule-columns">
      <RuleCriteria draft={draft} next={next} open={extraCriteria(rule) > 0} categories={categories} businesses={businesses} accounts={accounts} change={change}/>
      <RuleActions next={next} categories={categories} businesses={businesses} tags={tags} onCreateTag={onCreateTag} change={change}/>
     </div>
     <label className="budget-check"><input type="checkbox" checked={apply} onChange={event => setApply(event.currentTarget.checked)}/><span><strong>{matches === null ? t('Apply to matching past transactions') : t('Apply to {count} matching transactions', { count: formatNumber(matches, locale, 0) })}</strong><small>{t('New bank statement imports follow the rule too. Categories you choose by hand are kept.')}</small></span></label>
     {error && <p className="form-error" role="alert">{error}</p>}
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy || !valid}>{t(busy ? 'Saving…' : 'Save rule')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}
