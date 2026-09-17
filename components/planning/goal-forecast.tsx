"use client";
import { useState } from 'react';
import { CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis,ReferenceLine } from 'recharts';
import { Button } from '@/components/ui/button';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber } from '@/lib/format';
import { projectGoal } from '@/lib/goal-projection';
import type { Goal } from '@/lib/planning';
import { snapshotPoints,type PortfolioSnapshot } from '@/lib/portfolio-snapshots';

export function GoalForecast({goal,starting,surplus,currency,today,snapshots,historyError,save,onEdit}:{goal:Goal;starting:number|null;surplus:number|null;currency:string;today:string;snapshots:PortfolioSnapshot[];historyError:string;save:(action:string,data:unknown)=>Promise<void>;onEdit:()=>void}) {
 const {t,locale}=useLanguage();
 const [monthly,setMonthly]=useState<number|null>(goal.monthly_contribution??null),[rate,setRate]=useState(Number(goal.annual_return??0)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[hidden,setHidden]=useState<string[]>([]);
 const contribution=monthly??(surplus===null?null:Math.max(0,surplus));
 const result=starting!==null&&contribution!==null&&goal.target_date?projectGoal(starting,goal.target,today,goal.target_date,contribution,rate):null;
 const money=(n:number)=>formatMoney(n,currency,locale);
 const history=goal.kind==='net_worth'?snapshotPoints(snapshots,currency).filter(point=>point.date<today).map(point=>({date:point.date,actual:point.net})):[];
 const points=[...history,...(result?.points??[]).map((point,i)=>({...point,actual:i===0?starting:null}))].map(point=>({...point,time:Date.parse(point.date+'T00:00:00Z')}));
 const lines=[{key:'actual',label:goal.kind==='net_worth'?'Actual net worth':'Allocated amount',color:'var(--foreground)'},{key:'projected',label:'Your projected path',color:'var(--primary)'},{key:'required',label:'Path to your goal',color:'var(--chart-2)',dash:'6 4'},{key:'target',label:'Target amount',color:'var(--muted-foreground)',dash:'3 5'}];
 const dateLabel=(time:number)=>formatDate(new Date(time).toISOString().slice(0,10),locale);
 return <section className="panel goal-forecast">
  <div className="panel-title"><div><p className="eyebrow">{t('Goal planner')}</p><h2>{goal.name}</h2><p className="muted">{goal.target_date?formatDate(goal.target_date,locale):t('Choose a target date to see your plan.')}</p></div><Button variant="outline" onClick={onEdit}>{t('Edit goal')}</Button></div>
  <div className="comparison-controls">
   <label>{t('Monthly investment')}<FormattedNumberInput value={contribution??0} required={false} onValueChange={value=>{setMonthly(value);setSaved(false);}}/></label>
   <label>{t('Assumed annual return')}<div className="goal-rate"><FormattedNumberInput value={rate} max={100} required={false} onValueChange={value=>{setRate(value);setSaved(false);}}/><span>%</span></div></label>
   <div className="goal-surplus"><span>{t('Available monthly surplus')}</span><strong>{surplus===null?'—':money(surplus)}</strong><Button variant="outline" disabled={surplus===null} onClick={()=>{setMonthly(null);setSaved(false);}}>{t('Use my surplus')}</Button></div>
  </div>
  <p className="muted">{t('Surplus uses this month’s income estimates, expenses, budgets and mortgage payments. One-time entries are excluded.')}</p>
  {starting===null&&<p role="status" className="error">{t('Exchange rates are missing. The goal projection needs your complete net worth.')}</p>}
  {surplus===null&&<p role="status" className="muted">{t('Surplus is unavailable. Enter a monthly investment to explore a scenario.')}</p>}
  {!goal.target_date&&<p>{t('Choose a target date to see your plan.')}</p>}
  {result&&<>
   <div className="portfolio-headline goal-stats"><div><span>{t(goal.kind==='net_worth'?'Current net worth':'Allocated amount')}</span><strong>{money(starting!)}</strong></div><div><span>{t('Monthly contribution needed')}</span><strong>{result.required===null?'—':money(result.required)}</strong></div><div><span>{t('Projected at target date')}</span><strong>{money(result.projected)}</strong></div><div><span>{t('Target amount')}</span><strong>{money(goal.target)}</strong></div></div>
   {result.required===null?<p className="comparison-notice">{t(result.overdue?'The deadline has passed. Choose a future date to make a new plan.':'The deadline is before the first monthly contribution. Extend it or add funds now.')}</p>:<p className="comparison-notice" aria-live="polite">{t(result.projected>=goal.target-0.01?'This scenario reaches your goal.':'This scenario falls short by {amount}.',{amount:money(Math.max(0,goal.target-result.projected))})} {surplus!==null&&result.required>Math.max(0,surplus)&&t('You need {amount} more per month than your available surplus.',{amount:money(result.required-Math.max(0,surplus))})}</p>}
   {contribution!==null&&surplus!==null&&contribution>Math.max(0,surplus)&&<p className="negative">{t('This monthly investment exceeds your available surplus by {amount}.',{amount:money(contribution-Math.max(0,surplus))})}</p>}
   <div className="comparison-legend">{lines.map(line=><button key={line.key} type="button" aria-pressed={!hidden.includes(line.key)} onClick={()=>setHidden(previous=>previous.includes(line.key)?previous.filter(key=>key!==line.key):[...previous,line.key])}><i style={{background:line.color}}/>{t(line.label)}</button>)}</div>
   <div className="portfolio-chart"><ResponsiveContainer width="100%" height={340}><LineChart data={points} accessibilityLayer margin={{top:15,right:20,left:10,bottom:10}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="time" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={dateLabel} minTickGap={100}/><YAxis width={105} tickFormatter={money} domain={['auto','auto']}/><Tooltip labelFormatter={time=>dateLabel(Number(time))} formatter={(amount,name)=>[money(Number(amount)),t(lines.find(line=>line.key===name)?.label??String(name))]} contentStyle={{background:'var(--background)',borderColor:'var(--border)',borderRadius:12}}/><ReferenceLine x={Date.parse(today+'T00:00:00Z')} stroke="var(--border)" label={t('Today')}/>{lines.filter(line=>!hidden.includes(line.key)).map(line=><Line key={line.key} dataKey={line.key} stroke={line.color} strokeDasharray={line.dash} strokeWidth={line.key==='target'?1:3} dot={line.key==='actual'} connectNulls={false} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer></div>
   {goal.kind==='net_worth'&&historyError&&<p className="muted">{t(historyError)}</p>}
   {goal.kind==='net_worth'&&!history.length&&<p className="muted">{t('Your net-worth history starts with today’s value. Saved snapshots will extend the actual line.')}</p>}
   <details className="comparison-method"><summary>{t('Monthly milestones')}</summary><div className="table-scroll goal-milestones"><table><thead><tr><th>{t('Date')}</th><th>{t('Your projected path')}</th><th>{t('Path to your goal')}</th></tr></thead><tbody>{result.points.map(point=><tr key={point.date}><td>{formatDate(point.date,locale)}</td><td>{money(point.projected)}</td><td>{point.required===null?'—':money(point.required)}</td></tr>)}</tbody></table></div></details>
  </>}
  <p className="comparison-note">{t('Existing wealth stays constant. New investments are added on each monthly anniversary and compound at your assumed annual return. Taxes, fees, inflation and future exchange-rate changes are excluded. Returns are assumptions, not guarantees.')}</p>
  <p className="comparison-note">{t('Each goal is a separate scenario. Do not allocate the same surplus to multiple savings goals. Savings allocations already belong to your net worth.')}</p>
  <div className="goal-actions"><Button disabled={busy||goal.archived} onClick={async()=>{setBusy(true);setError('');try{await save('goal',{...goal,monthly_contribution:monthly,annual_return:rate});setSaved(true);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>{t(busy?'Saving…':'Save plan')}</Button>{result?.required!==null&&result?.required!==undefined&&<Button variant="outline" disabled={result.required>1e15} onClick={()=>{setMonthly(result.required);setSaved(false);}}>{t('Use required contribution')}</Button>}{saved&&<span role="status">{t('Plan saved')}</span>}</div>
  {error&&<p className="error" role="alert">{t(error)}</p>}
  <p className="muted">{t('Assumed return: {rate}%',{rate:formatNumber(rate,locale,2)})}</p>
 </section>;
}
