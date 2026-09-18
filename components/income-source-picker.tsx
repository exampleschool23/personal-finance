"use client";
import { useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategoryBadge } from '@/components/category-badge';
import { useLanguage } from '@/components/language-provider';
import { formatNumber, formatMoney, formatDate } from '@/lib/format';
import { income } from '@/lib/finance';
export type IncomeSourceOption={id:string;name:string;kind:string;categoryLabel?:string;disabled?:boolean;estimate?:number|null;currency?:string;frequency?:string|null;payment?:{due:string;paid:boolean}|null};
export function IncomeSourcePicker({options,value,disabled,onChange}:{options:IncomeSourceOption[];value:string;disabled?:boolean;onChange:(id:string)=>void}){
 const {t,locale}=useLanguage();
 const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[category,setCategory]=useState('all');
 const labelId=useId(),resultsId=useId();
 const results=useRef<HTMLDivElement>(null);
 const query=search.trim().toLocaleLowerCase(locale);
 const categoryLabel=(kind:string)=>options.find(item=>item.kind===kind)?.categoryLabel??t(kind);
 const matching=options.filter(item=>`${item.name} ${categoryLabel(item.kind)}`.toLocaleLowerCase(locale).includes(query));
 const categories=[...income.filter(kind=>matching.some(item=>item.kind===kind)),...new Set(matching.filter(item=>!income.includes(item.kind)).map(item=>item.kind))];
 const active=category==='all'||categories.includes(category)?category:'all';
 const visible=matching.filter(item=>active==='all'||item.kind===active);
 const selected=options.find(item=>item.id===value);
 const choose=(id:string)=>{onChange(id);setOpen(false);};
 return <div className="income-source-field"><span id={labelId}>{t('Income source')}</span><Popover modal open={open} onOpenChange={next=>{setOpen(next);if(next){setSearch('');setCategory('all');}}}>
  <PopoverTrigger asChild><Button type="button" variant="outline" className="income-source-trigger" disabled={disabled} aria-labelledby={labelId}>
   <span>{selected?.name??t('Choose an income source')}</span><ChevronDown size={16}/>
  </Button></PopoverTrigger>
  <PopoverContent align="start" className="income-source-popover" aria-labelledby={labelId}>
   <div className="income-source-search"><Search size={17}/><Input aria-label={t('Income source or category')} placeholder={t('Income source or category')} value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();results.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}}}/></div>
   <div className="income-source-columns"><div className="income-source-categories" aria-label={t('Category')}>
    {['all',...categories].map(kind=><button type="button" key={kind} aria-pressed={active===kind} aria-controls={resultsId} onMouseEnter={()=>setCategory(kind)} onFocus={()=>setCategory(kind)} onClick={()=>setCategory(kind)} onKeyDown={event=>{if(event.key==='ArrowRight'){event.preventDefault();results.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}}}>
     <span>{kind==='all'?t('All income sources'):categoryLabel(kind)}</span><small>{formatNumber(matching.filter(item=>kind==='all'||item.kind===kind).length,locale,0)}</small>
    </button>)}
   </div><div id={resultsId} ref={results} className="income-source-results" onKeyDown={event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const buttons=Array.from(results.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;
    event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
   }}>
    <p className="muted">{active==='all'?t('All income sources'):categoryLabel(active)}</p>
    {visible.map(item=><button type="button" key={item.id} disabled={item.disabled} aria-pressed={value===item.id} onClick={()=>choose(item.id)}><span><span className="income-source-title-row"><strong>{item.name}</strong><CategoryBadge kind={item.kind} label={categoryLabel(item.kind)}/></span>
     {item.currency&&<small className="income-source-estimate">{item.estimate!=null?t('Estimated: {amount} · {frequency}',{amount:formatMoney(item.estimate,item.currency,locale),frequency:t(item.frequency==='Yearly'?'Every year':'Every month')}):t('Variable income')}</small>}
     {item.payment&&<small className={item.payment.paid?'income-source-payment is-paid':'income-source-payment'}>{t(item.payment.paid?'Paid · {date}':'Scheduled · {date}',{date:formatDate(item.payment.due,locale)})}</small>}</span></button>)}
    {!visible.length&&<p role="status" className="muted">{t('No income sources found.')}</p>}
   </div></div>
  </PopoverContent>
 </Popover></div>;
}
