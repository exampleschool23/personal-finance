"use client";
import { useEffect,useRef,useState,type ReactNode } from 'react';
import { investmentPeriodTotals,type PeriodRow } from '@/lib/investment-period';
import type { InvestmentPortfolioInput } from '@/lib/investment-portfolio';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney } from '@/lib/format';
import { Popover,PopoverTrigger,PopoverContent } from '@/components/ui/popover';
function AmountDetails({label,amount,rows,currency,open,onOpenChange}:{label:string;amount:number|null;rows:PeriodRow[];currency:string;open:boolean;onOpenChange:(open:boolean)=>void}){
 const {t,locale}=useLanguage();
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const enter=()=>{clearTimeout(timer.current);onOpenChange(true);};
 const leave=()=>{timer.current=setTimeout(()=>onOpenChange(false),200);};
 const money=(value:number|null)=>value===null?'—':formatMoney(value,currency,locale);
 const groups=new Map<string,PeriodRow[]>();for(const row of rows)groups.set(row.category,[...(groups.get(row.category)??[]),row]);
 return <div><span>{t(label)}</span><Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger asChild><button type="button" className="period-amount" onMouseEnter={enter} onMouseLeave={leave} aria-label={t(label)}><strong>{money(amount)}</strong></button></PopoverTrigger><PopoverContent align="start" className="period-details portfolio-tooltip" onOpenAutoFocus={event=>event.preventDefault()} onMouseEnter={enter} onMouseLeave={leave}><header><small>{t(label)}</small><strong>{money(amount)}</strong></header><div className="portfolio-tooltip-body" tabIndex={0}>{rows.length?[...groups].map(([category,items])=><section key={category}><h4>{t(category)} · {money(items.some(row=>row.amount===null)?null:items.reduce((sum,row)=>sum+(row.amount??0),0))}</h4>{items.map((row,index)=><div className="portfolio-tooltip-row" key={index}><div><strong>{row.name}</strong><span>{formatDate(row.date,locale)}</span></div><b>{money(row.amount)}</b></div>)}</section>):<p>{t('No recorded activity in this interval.')}</p>}</div></PopoverContent></Popover></div>;
}
export function InvestmentPeriodSummary({input,start,children}:{input:InvestmentPortfolioInput;start:string;children?:ReactNode}){
 const {t}=useLanguage();
 const [active,setActive]=useState<string|null>(null);
 const details:Record<'invested'|'expenses'|'income',PeriodRow[]>={invested:[],expenses:[],income:[]};
 const totals=investmentPeriodTotals(input,start,details);
 return <div><div className="portfolio-headline">{children}{([['invested','Money invested'],['expenses','Expenses paid'],['income','Overall income received']] as const).map(([key,label])=><AmountDetails key={key} open={active===key} onOpenChange={open=>setActive(current=>open?key:current===key?null:current)} label={label} amount={totals.missing.length?null:totals[key]} rows={details[key]} currency={input.currency}/>)}</div>{!!totals.missing.length&&<p className="muted">{t('Some investment balances or exchange rates are missing.')}</p>}</div>;
}
