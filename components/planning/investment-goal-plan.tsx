"use client";
import { useId, useState } from 'react';
import Link from 'next/link';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMonthYear, formatNumber, formatMoney } from '@/lib/format';
import { investmentGoalItems, investmentGoalPlan, investmentGoalTargets, investmentGoalStatus } from '@/lib/investment-goals';
import { holdingAccountValue } from '@/lib/holding-accounts';
import type { MarketData } from '@/lib/market';
import type { Goal, PlanningData } from '@/lib/planning';

export function InvestmentGoalPlan({goal,data,today,currency,market,save,onEdit}:{goal:Goal;data:PlanningData;today:string;currency:string;market:MarketData|null;save:(action:string,data:unknown)=>Promise<void>;onEdit:()=>void}){
 const {t,locale}=useLanguage(),id=useId();
 const [targets,setTargets]=useState(()=>investmentGoalTargets(goal));
 const [savedTargets,setSavedTargets]=useState(targets);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const dirty=JSON.stringify(targets)!==JSON.stringify(savedTargets);
 const updateMonthly=(index:number,monthly:number)=>setTargets(previous=>previous.map((target,i)=>i===index?{...target,monthly_contribution:monthly}:target));
 const items=investmentGoalItems({...goal,investment_targets:targets},data);
 return <section className="panel goal-forecast investment-goal-plan" aria-labelledby={id}>
  <header className="goal-planner-header"><div className="goal-planner-heading"><span className="goal-planner-icon"><Target size={22} aria-hidden="true"/></span><div><p className="eyebrow">{t('Accumulation plan')}</p><h2 id={id}>{goal.name}</h2><p className="muted">{goal.target_date?`${t('Target date')}: ${formatDate(goal.target_date,locale)}`:t('Choose a target date to see your plan.')}</p></div></div><Button variant="outline" disabled={busy} onClick={onEdit}>{t('Edit goal')}</Button></header>
  <div className="investment-target-plans">{items.map(({target,progress},index)=>{
   const units=(amount:number)=>`${formatNumber(amount,locale,8)} ${target.asset_symbol}`;
   const monthly=Number(target.monthly_contribution??0);
   const plan=progress?investmentGoalPlan({...goal,...target},progress.current,today,monthly):null;
   const reached=progress!==null&&progress.current>=target.target;
   const status=investmentGoalStatus(target.target,progress?.current??null,plan);
   const balance=progress?holdingAccountValue({...progress.account,currency},data.records,market).total:null;
   return <section className="investment-target-row" key={index} aria-labelledby={`${id}-${index}`}>
    <h3 id={`${id}-${index}`}>{target.asset_symbol}{progress?` · ${progress.account.name}`:''}</h3>
    {!progress?<p role="alert" className="error">{t('The selected investment account is unavailable. Edit this goal to choose an account.')}</p>:<>
     <div className="investment-goal-progress"><span>{t('{percent}% complete',{percent:formatNumber(progress.percent,locale,1)})}</span><strong className={status==='Target reached'||status==='On track with this plan'?'positive':''}>{t(status)}</strong><progress value={progress.percent} max={100} aria-label={t('Goal progress')}/></div>
     <div className="investment-plan-body"><div className="investment-plan-controls"><dl className="goal-card-values"><div><dt>{t('Account balance')}</dt><dd>{balance===null?'—':formatMoney(balance,currency,locale)}</dd></div><div><dt>{t('Currently held')}</dt><dd>{units(progress.current)}</dd></div><div><dt>{t('Target quantity')}</dt><dd>{units(target.target)}</dd></div><div><dt>{t('Remaining')}</dt><dd>{units(progress.remaining)}</dd></div></dl>
     {balance===null&&<p className="muted">{t('Account balance is unavailable because an exchange rate is missing.')}</p>}
     <fieldset className="tracker-fields investment-goal-fields" disabled={busy||goal.archived}>
      <label>{t('Units to add each month')} · {target.asset_symbol}<FormattedNumberInput required={false} value={monthly} max={1e12} onValueChange={value=>updateMonthly(index,value)}/></label>
      <div className="entry-actions"><Button type="button" variant="outline" disabled={plan?.required==null||plan.required>1e12} onClick={()=>{if(plan?.required!=null)updateMonthly(index,plan.required);}}>{t('Use required contribution')}</Button></div>
     </fieldset>
     {reached?<p className="positive">{t('You have reached this quantity target.')}</p>:plan?.overdue?<p className="muted">{t('The target date has passed. Edit the goal to set a new date.')}</p>:null}
     {plan&&!plan.overdue&&<div className="ownership-summary"><p>{t('Projected quantity by target date')}: <strong>{units(plan.projected)}</strong></p><p>{t('Required each month')}: <strong>{plan.required===null?'—':units(plan.required)}</strong></p>{!plan.months&&!reached&&<p>{t('The target date is before the next monthly contribution. Add units sooner or choose a later date.')}</p>}</div>}
     </div>{plan&&!plan.overdue&&<section className="goal-chart-section investment-goal-chart" aria-labelledby={`${id}-${index}-chart`}>
      <h4 id={`${id}-${index}-chart`}>{t('Your path to the goal')} · {target.asset_symbol}</h4>
      <div className="goal-projection-chart" role="region" aria-label={`${t('Your path to the goal')} · ${target.asset_symbol}`} tabIndex={0}><div className="goal-chart-canvas">
       <ResponsiveContainer width="100%" height="100%"><LineChart data={plan.points.map(point=>({...point,time:Date.parse(point.date+'T00:00:00Z')}))} accessibilityLayer margin={{top:24,right:24,left:8,bottom:12}}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
        <XAxis dataKey="time" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={time=>formatMonthYear(new Date(Number(time)).toISOString().slice(0,10),locale)} minTickGap={80} height={48} tickLine={false} axisLine={false} tickMargin={8} tick={{fill:'var(--foreground)',fontSize:12}}/>
        <YAxis width="auto" tickFormatter={amount=>formatNumber(Number(amount),locale,8)} domain={[0,'auto']} tickCount={5} tickLine={false} axisLine={false} tickMargin={12} tick={{fill:'var(--foreground)',fontSize:12}}/>
        <Tooltip labelFormatter={time=>formatDate(new Date(Number(time)).toISOString().slice(0,10),locale)} formatter={(amount,name)=>[units(Number(amount)),name]} contentStyle={{background:'var(--popover)',color:'var(--popover-foreground)',borderColor:'var(--border)',borderRadius:14,padding:16}}/>
        <Legend/>
        <Line dataKey="target" name={t('Target quantity')} stroke="var(--muted-foreground)" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false}/>
        <Line dataKey="projected" name={t('Projected quantity')} type="stepAfter" stroke="var(--primary)" strokeWidth={3} dot={false} activeDot={{r:5}} isAnimationActive={false}/>
       </LineChart></ResponsiveContainer>
      </div></div>
     </section>}</div>
    </>}
   </section>;
  })}</div>

  <div className="entry-actions"><Button disabled={busy||goal.archived||!dirty||items.some(item=>!item.progress)} onClick={async()=>{setBusy(true);setError('');try{await save('goal',{...goal,...targets[0],investment_targets:targets,annual_return:0});setSavedTargets(targets);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>{t(busy?'Saving…':'Save plan')}</Button></div>
  <details className="investment-plan-method"><summary>{t('How this plan works')}</summary>  <p className="goal-help">{t('Progress follows the coins or shares held in the selected account. Buying increases progress; selling or moving holdings out reduces it. Price changes do not affect this goal.')}</p>
<p className="goal-help">{t('The plan adds units on each monthly anniversary, starting next month. It does not assume an investment return or place trades.')}</p><p className="goal-help">{t('This goal tracks holdings without reserving them or changing your balances. The same holdings may appear in more than one goal.')} <Link href="/accounts">{t('Manage holdings')}</Link></p></details>
  {error&&<p role="alert" className="error">{t(error)}</p>}
 </section>;
}
