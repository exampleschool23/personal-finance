"use client";
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { matchingNames } from '@/lib/record-names';
import { formatNumber } from '@/lib/format';
import type { Entry } from '@/lib/finance';
export function RecordNameInput({ entry, rows, onChange, placeholder, label, original }: { entry: Entry; rows: Entry[]; onChange: (name: string) => void; placeholder: string; label?: string; original?: Entry }) {
  const { t, locale } = useLanguage();
  const id = useId();
  const [selection, setSelection] = useState<{ id: string; kind: string; name: string } | null>(null);
  const dismissed = selection?.id === entry.id && selection.kind === entry.kind && selection.name === entry.name;
  const matches = matchingNames(rows, entry, original);
  const exact = matches.find(match => match.exact);
  return <div className="record-name-field"><label htmlFor={id}>{label || t('Name')}</label><Input id={id} value={entry.name} onChange={e => { setSelection(null); onChange(e.target.value); }} maxLength={120} placeholder={placeholder} required autoComplete="off" aria-describedby={!dismissed && matches.length ? id + '-matches' : undefined}/>
    {!dismissed && matches.length > 0 && <div id={id + '-matches'} className="name-matches"><p role="status">{t(exact ? 'This name already exists. You can add another record.' : 'Matching existing names')}</p><ul>{matches.slice(0, 8).map(match => <li key={match.name}><button type="button" onClick={() => { setSelection({ id: entry.id, kind: entry.kind, name: match.name }); onChange(match.name); }}><strong>{match.name}</strong><span>{t('Existing records: {count}', { count: formatNumber(match.count, locale, 0) })}</span></button></li>)}</ul></div>}
  </div>;
}
