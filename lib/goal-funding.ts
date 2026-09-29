import type { Goal } from './planning';
import { convertAmount } from './market';
export type GoalEvent={id:string;goal_id:string;operation_id:string|null;occurred_on:string;delta:number;balance:number;event_type:string;notes:string;source_name:string|null};
export function fundingPlan(goals:Goal[],surplus:number|null,currency:string,today:string,rates?:Record<string,number>){
 const active=goals.filter(goal=>!goal.archived&&goal.funding_enabled&&!(goal.funding_mode!=='refill'&&goal.completed_on)&&(!goal.paused_until||goal.paused_until<today)).sort((a,b)=>(a.funding_priority??100)-(b.funding_priority??100)||a.id.localeCompare(b.id));
 let remaining=surplus===null?null:Math.max(0,surplus),requested=0,unknown=false;
 const rows=active.map(goal=>{
  const raw=goal.funding_monthly??(goal.kind!=='investment'?goal.monthly_contribution:null)??null;
  const budget=raw===null?null:goal.kind==='savings'?Math.min(raw,Math.max(0,goal.target-goal.allocated)):raw;
  const amount=budget===null||!Number.isFinite(budget)||budget<0||!goal.currency?null:convertAmount(budget,goal.currency,currency,rates);
  if(amount===null){unknown=true;remaining=null;return {goal,requested:null,allocated:null,shortfall:null};}
  requested+=amount;const allocated=remaining===null?null:Math.min(remaining,amount);if(remaining!==null)remaining-=allocated!;
  return {goal,requested:amount,allocated,shortfall:allocated===null?null:amount-allocated};
 });
 return {rows,requested:unknown?null:requested,remaining,shortfall:unknown||surplus===null?null:Math.max(0,requested-Math.max(0,surplus)),complete:!unknown&&surplus!==null};
}
// What the shared plan leaves for this goal: the surplus after every goal funded before it.
// A goal outside the plan comes after all funded goals.
export function fundingRoom(goals:Goal[],selected:Goal,surplus:number|null,currency:string,today:string,rates?:Record<string,number>){
 if(surplus===null)return null;
 const rows=fundingPlan(goals,surplus,currency,today,rates).rows;
 const position=rows.findIndex(row=>row.goal.id===selected.id);
 let room=surplus;
 for(const row of position<0?rows:rows.slice(0,position)){if(row.requested===null)return null;room-=row.requested;}
 return Math.max(0,room);
}
