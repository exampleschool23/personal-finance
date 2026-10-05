"use client";
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { TagChip } from '@/components/presentation-foundation/tag-chip';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatNumber } from '@/lib/format';
import type { Category } from '@/lib/planning';
import { extraCriteria, ruleChoice, type TransactionRule } from '@/lib/transaction-rules';
import type { Tag } from '@/lib/tags';
import { useChoiceName } from './pickers';

/** What a rule does, in words: its category, business and tags. */
function RuleActionsSummary({ rule, categories, businesses = [], tags = [] }: { rule: TransactionRule; categories: readonly Category[]; businesses?: readonly BusinessOption[]; tags?: readonly Tag[] }) {
 const { t } = useLanguage();
 const choiceName = useChoiceName(categories);
 const choice = ruleChoice(rule), business = businesses.find(item => item.id === rule.business_id);
 return <span className="rule-actions">
  {choice && <span className="transaction-category"><CategoryIcon kind={choice.category_id ? choiceName(choice) : choice.kind} size="sm"/><span>{choiceName(choice)}</span></span>}
  {business && <span className="transaction-business"><BusinessMark name={business.name} color={business.business_color} logo={business.business_logo} size="sm"/><span>{business.name}</span></span>}
  {(rule.tag_ids ?? []).map(id => tags.find(tag => tag.id === id)).filter((tag): tag is Tag => !!tag).map(tag => <TagChip key={tag.id} name={tag.name} color={tag.color}/>)}
  {!choice && !business && !rule.tag_ids?.length && <span className="muted">{t('No changes')}</span>}
 </span>;
}

/** What a rule matches, in words: its name test and how many other conditions it sets. */
function useRuleCriteriaText() {
 const { t, locale } = useLanguage();
 return (rule: TransactionRule) => {
  const name = rule.pattern.trim() ? t(rule.match === 'exact' ? 'Name is “{pattern}”' : 'Name contains “{pattern}”', { pattern: rule.pattern }) : t('Any name');
  const extra = extraCriteria(rule);
  return extra ? `${name} · ${t('+{count} conditions', { count: formatNumber(extra, locale, 0) })}` : name;
 };
}

/** Saved rules as rows: what each matches and what it sets. Clicking a row edits it. */
function ruleList({ rules, categories, businesses, tags, onEdit }: RulesProps, t: ReturnType<typeof useLanguage>['t'], criteria: (rule: TransactionRule) => string, onDelete: (rule: TransactionRule) => void) {
 return rules.length ? <ul className="rule-list">{rules.map(rule => <li key={rule.id}>
  <button type="button" onClick={() => onEdit(rule)}><span>{criteria(rule)}</span><span className="rule-arrow" aria-hidden="true">→</span><RuleActionsSummary rule={rule} categories={categories} businesses={businesses} tags={tags}/></button>
  <Button size="icon" variant="ghost" aria-label={t('Delete {name}', { name: criteria(rule) })} onClick={() => onDelete(rule)}><Trash2 size={15}/></Button>
 </li>)}</ul> : <p className="budget-left-empty">{t('No rules yet. Change a transaction’s category or business and choose Create rule, or add one here.')}</p>;
}

/** Deleting a rule asks first; the transactions it changed keep their changes. */
function useRuleRemoval(onRemove: (rule: TransactionRule) => Promise<void>) {
 const { t } = useLanguage();
 const criteria = useRuleCriteriaText();
 const [deleting, setDeleting] = useState<TransactionRule | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function remove() {
  if (!deleting || busy) return;
  setBusy(true); setError('');
  try { await onRemove(deleting); setDeleting(null); }
  catch (reason) { setError((reason as Error).message); }
  finally { setBusy(false); }
 }
 const ask = (rule: TransactionRule) => { setError(''); setDeleting(rule); };
 const dialog = <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} busy={busy} destructive error={error} title={t('Delete {name}?', { name: deleting ? criteria(deleting) : '' })} description={t('New transactions will no longer follow this rule. Transactions it already changed keep their changes.')} confirmLabel={t(busy ? 'Deleting…' : 'Delete rule')} onConfirm={remove}/>;
 return { ask, dialog, criteria };
}

type RulesProps = { rules: TransactionRule[]; categories: readonly Category[]; businesses?: readonly BusinessOption[]; tags?: readonly Tag[]; onEdit: (rule: TransactionRule) => void; onAdd: () => void; onRemove: (rule: TransactionRule) => Promise<void> };
/** Every saved rule, with a way to add, edit or remove one. */
export function RulesDialog({ onClose, ...props }: RulesProps & { onClose: () => void }) {
 const { t } = useLanguage();
 const removal = useRuleRemoval(props.onRemove);
 return <><Dialog open onOpenChange={value => { if (!value) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle>{t('Rules')}</DialogTitle>
   {ruleList(props, t, removal.criteria, removal.ask)}
   <div className="record-form-footer"><Button onClick={props.onAdd}><Plus size={16} aria-hidden="true"/>{t('Add rule')}</Button></div>
  </DialogContent>
 </Dialog>
 {removal.dialog}</>;
}

/** Settings › Rules: the same list as a panel. */
export function RulesPanel(props: RulesProps) {
 const { t } = useLanguage();
 const removal = useRuleRemoval(props.onRemove);
 return <section className="panel tools-panel">
  <PanelTitle title={t('Rules')} count={<Count value={props.rules.length}/>} hint={t('A rule sets the category, business or tags of transactions whose name contains its words. New bank statement imports follow your rules too.')}><Button onClick={props.onAdd}><Plus size={16} aria-hidden="true"/>{t('Add rule')}</Button></PanelTitle>
  {ruleList(props, t, removal.criteria, removal.ask)}
  {removal.dialog}
 </section>;
}
