"use client";
import { useEffect, useState, useRef } from 'react';
import type { Entry } from '@/lib/finance';
import { expensePlanMonth, type ExpensePlan } from '@/lib/expense-plans';

export function useExpensePlans(user:string|null,demo:boolean,rows:Entry[],reload:number,onSaved:()=>void,month=expensePlanMonth()) {
 const [saved,setSaved]=useState<ExpensePlan[]>([]),[demoPlans,setDemoPlans]=useState<ExpensePlan[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const scope=`${user}:${month}`;
 const [loadedScope,setLoadedScope]=useState('');
 const completedScope=useRef('');
 if((!user||demo)&&loadedScope!==''){setLoadedScope('');setSaved([]);setError('');}
 useEffect(()=>{
  if(!user||demo)return;
  const controller=new AbortController();
  const started=setTimeout(()=>{if(!controller.signal.aborted){setLoading(true);setError('');}},0);
  fetch('/api/expense-plans?month='+month,{signal:controller.signal}).then(async response=>{
   const data=await response.json() as ExpensePlan[] & {error?:string};
   if(!response.ok)throw Error(data.error);
   if(!controller.signal.aborted){setSaved(data.map(p=>({...p,amount:Number(p.amount),spent:Number(p.spent??0)})));setError('');}
  }).catch(e=>{if(!controller.signal.aborted){setError(e.message);if(completedScope.current!==scope)setSaved([]);}}).finally(()=>{if(!controller.signal.aborted){clearTimeout(started);setLoading(false);setLoadedScope(scope);completedScope.current=scope;}});
  return ()=>{clearTimeout(started);controller.abort();};
 },[user,demo,reload,month,scope]);
 const [previousDemo,setPreviousDemo]=useState(demo);
 if(previousDemo!==demo){setPreviousDemo(demo);if(!demo)setDemoPlans([]);}
 const plans=demo?demoPlans.map(p=>({...p,spent:rows.filter(r=>r.expense_plan_id===p.id&&r.date.slice(0,7)===month).reduce((n,r)=>n+r.amount,0)})):user&&loadedScope===scope?saved:[];
 async function save(plan:ExpensePlan) {
  if(demo){
   if(rows.some(r=>r.expense_plan_id===plan.id&&(r.currency!==plan.currency||r.date<plan.start_date||(plan.end_date&&r.date>plan.end_date))))throw Error('Keep the currency and dates compatible with recorded spending.');
   setDemoPlans(prev=>[...prev.filter(p=>p.id!==plan.id),plan]);
  } else {
   const response=await fetch('/api/expense-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...plan,amount:plan.amount||plan.base_amount,month:month<plan.start_date.slice(0,7)?plan.start_date.slice(0,7):month})});
   const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);
  }
  onSaved();
 }
 function restoreDemo(plan:ExpensePlan) {
  if(rows.some(r=>r.expense_plan_id===plan.id&&(r.currency!==plan.currency||r.date<plan.start_date||(plan.end_date&&r.date>plan.end_date))))throw Error('Keep the currency and dates compatible with recorded spending.');
  setDemoPlans(prev=>[...prev.filter(p=>p.id!==plan.id),plan]);
 }
 async function remove(id:string) {
  if(demo){if(rows.some(r=>r.expense_plan_id===id))throw Error('This plan has spending. Set an end date instead of deleting it.');setDemoPlans(prev=>prev.filter(p=>p.id!==id));}
  else {const response=await fetch('/api/expense-plans',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);}
  onSaved();
 }
 return {restoreDemo,plans,month,loading:!!user&&!demo&&loadedScope!==scope,refreshing:!!user&&!demo&&loading,error:!demo&&user&&loadedScope===scope?error:'',save,remove};
}
