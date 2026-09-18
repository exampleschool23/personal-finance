"use client";
import { useMemo,useState } from 'react';
import Link from 'next/link';
import { Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { formatMoney,formatMonthYear,formatNumber } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { incomeHistory,type IncomeGroup } from '@/lib/income-history';
import type { Entry } from '@/lib/finance';
import type { HistoryEvent } from '@/lib/investment-history';

type Props={records:Entry[];events:HistoryEvent[];incomeRecords:Entry[];currency:string;rates:number|Record<string,number>|undefined;today:string};
export function IncomeHistoryChart({records,events,incomeRecords,currency,rates,today}:Props){
 const {t,locale}=useLanguage();
 const [months,setMonths]=useState(6),[hidden,setHidden]=useState<string[]>([]);
 const result=useMemo(()=>incomeHistory(records,events,incomeRecords,currency,rates,today,months),[records,events,incomeRecords,currency,rates,today,months]);
 const money=(value:number)=>formatMoney(value,currency,locale);
 const definitions:Array<{key:IncomeGroup;label:string;kind:string}>=[{key:'salary',label:t('Salary'),kind:'Salary'},{key:'dividends',label:t('Dividends'),kind:'Stock'},{key:'rent',label:t('Rent income'),kind:'Property'},{key:'business',label:t('Business income'),kind:'Business'},{key:'interest',label:t('Interest income'),kind:'Deposit'},{key:'other',label:t('Other income'),kind:'Other income'}];
 const names=Object.fromEntries([...definitions.map(item=>[item.key,item.label]),['estimate',t('Estimated monthly income')]]);
 const active=definitions.filter(item=>result.received[item.key]>0||result.expected[item.key]>0);
 return <section className="panel income-history-chart">
  <div className="panel-title"><div><h2>{t('Income over time')}</h2><p className="muted">{t('Salary, dividends, rent, business income, interest and other income.')}</p></div><div className="portfolio-ranges">{[3,6,12].map(value=><Button key={value} variant={months===value?'default':'outline'} aria-pressed={months===value} onClick={()=>setMonths(value)}>{t('{count} months',{count:formatNumber(value,locale,0)})}</Button>)}</div></div>
  <div className="portfolio-headline"><div><span>{t('Recorded income in this period')}</span><strong>{result.missing?'—':money(result.totalReceived)}</strong></div><div><span>{t('Monthly estimate · {month}',{month:formatMonthYear(today.slice(0,7),locale)})}</span><strong>{result.estimateMissing?'—':money(result.estimatedTotal)}</strong></div><div><span>{t('Dividends received')}</span><strong>{result.missing?'—':money(result.received.dividends)}</strong></div></div>
  <div className="comparison-legend">{active.map(item=><button key={item.key} type="button" aria-pressed={!hidden.includes(item.key)} onClick={()=>setHidden(previous=>previous.includes(item.key)?previous.filter(key=>key!==item.key):[...previous,item.key])}><i style={{background:categoryColor(item.kind)}}/>{item.label}</button>)}<button type="button" aria-pressed={!hidden.includes('estimate')} onClick={()=>setHidden(previous=>previous.includes('estimate')?previous.filter(key=>key!=='estimate'):[...previous,'estimate'])}><i className="income-estimate-key"/>{t('Estimated monthly income')}</button></div>
  <div className="portfolio-chart"><ResponsiveContainer width="100%" height={300}><BarChart data={result.points} accessibilityLayer margin={{top:20,right:15,left:5,bottom:10}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="month" tickFormatter={month=>formatMonthYear(String(month),locale)} minTickGap={50}/><YAxis width={120} tickFormatter={money}/><Tooltip labelFormatter={month=>formatMonthYear(String(month),locale)} formatter={(amount,name)=>[money(Number(amount)),names[String(name)]??name]} contentStyle={{background:'var(--background)',borderColor:'var(--border)',borderRadius:12}}/>{active.filter(item=>!hidden.includes(item.key)).map(item=><Bar key={item.key} dataKey={item.key} name={item.key} stackId="received" fill={categoryColor(item.kind)} maxBarSize={44} isAnimationActive={false}/>)}{!hidden.includes('estimate')&&<Bar dataKey="estimate" name="estimate" fill="var(--primary)" fillOpacity={.12} stroke="var(--primary)" strokeDasharray="4 3" radius={[5,5,0,0]} maxBarSize={44} isAnimationActive={false}/>}</BarChart></ResponsiveContainer></div>
  {(result.missing>0||result.estimateMissing>0||result.forecastMissing>0)&&<p role="status" className="comparison-note">{t('Some income cannot be converted. Displayed chart amounts are incomplete.')}</p>}
  <div className="table-scroll"><table className="comparison-table"><thead><tr><th>{t('Income source')}</th><th>{t('Recorded income in this period')}</th><th>{t('Estimated monthly income')}</th></tr></thead><tbody>{definitions.map(item=><tr key={item.key}><td><i style={{background:categoryColor(item.kind)}}/>{item.label}</td><td>{result.missing?'—':money(result.received[item.key])}</td><td>{result.estimateMissing?'—':money(result.expected[item.key])}</td></tr>)}</tbody></table></div>
  <p className="footnote">{t('Solid bars show recorded income. Outlined bars show current and future monthly estimates, not received income. Empty months before the first receipt are replaced with future months.')}</p>
  <p className="footnote">{t('Record stock dividends as Income received in the stock’s Tracker. Salary and other recurring plans are managed in Income & expenses. Current exchange rates are used for this chart.')} <Link href="/income-expenses">{t('Income & expenses')}</Link> · <Link href="/assets">{t('Assets & investments')}</Link></p>
 </section>;
}
