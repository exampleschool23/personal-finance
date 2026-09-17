"use client";
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/date-picker';
import { useLanguage } from '@/components/language-provider';
import type { Category } from '@/lib/planning';
export type RecordFiltersValue={query:string;category:string;from:string;to:string;order:'newest'|'oldest'|'name'};
export const emptyRecordFilters:RecordFiltersValue={query:'',category:'all',from:'',to:'',order:'newest'};
export function RecordFilters({value,onChange,categories,kinds}:{value:RecordFiltersValue;onChange:(v:RecordFiltersValue)=>void;categories:Category[];kinds:readonly string[]}){
 const {t}=useLanguage();return <div className="record-filters"><Input aria-label={t('Search records')} placeholder={t('Search records')} value={value.query} onChange={e=>onChange({...value,query:e.target.value})}/><label>{t('Category')}<NativeSelect value={value.category} onChange={e=>onChange({...value,category:e.target.value})}><option value="all">{t('All categories')}</option>{kinds.map(k=><option key={k} value={k}>{t(k)}</option>)}{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label><label>{t('From')}<DatePicker value={value.from} required={false} onChange={from=>onChange({...value,from})}/></label><label>{t('To')}<DatePicker value={value.to} required={false} min={value.from||undefined} onChange={to=>onChange({...value,to})}/></label><label>{t('Sort by')}<NativeSelect value={value.order} onChange={e=>onChange({...value,order:e.target.value as RecordFiltersValue['order']})}><option value="newest">{t('Newest first')}</option><option value="oldest">{t('Oldest first')}</option><option value="name">{t('Name')}</option></NativeSelect></label><Button variant="ghost" onClick={()=>onChange(emptyRecordFilters)}>{t('Clear filters')}</Button></div>;
}
