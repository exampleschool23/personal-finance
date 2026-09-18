"use client";
import {useEffect,useRef,useState} from 'react';
import {moveGoal,orderedGoals,reorderGoal} from '@/lib/goal-order';
import type {Goal} from '@/lib/planning';
import type {PreferenceResource} from './use-workspace-preferences';
export function useGoalOrder(goals:Goal[],preferences:PreferenceResource,owner:string|null,demo:boolean){
 const scope=demo?'demo':owner;
 const currentScope=useRef(scope);
 useEffect(()=>{currentScope.current=scope;},[scope]);
 const pending=useRef(false);
 const [state,setState]=useState<{scope:string|null;ids:string[];error:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const saved=preferences.data.preferences.find(item=>item.key==='goal_order')?.data.ids??[];
 const ids=state?.scope===scope?state.ids:saved;
 const ordered=orderedGoals(goals,ids);
 async function persist(next:string[]){
  if(pending.current||(!demo&&(preferences.loading||preferences.error||!owner)))return;
  const before=ordered.map(goal=>goal.id);
  if(next.every((value,index)=>value===before[index]))return;
  pending.current=true;setBusy(true);setState({scope,ids:next,error:''});
  try{if(!demo)await preferences.save({key:'goal_order',data:{ids:next}});}
  catch{if(currentScope.current===scope)setState({scope,ids:before,error:'Could not save goal order. Please try again.'});}
  finally{pending.current=false;setBusy(false);}
 }
 const move=(id:string,direction:-1|1,visible?:string[])=>persist(moveGoal(ordered.map(goal=>goal.id),id,direction,visible));
 const reorder=(id:string,target:string,visible?:string[])=>persist(reorderGoal(ordered.map(goal=>goal.id),id,target,visible));
 return {goals:ordered,move,reorder,busy,disabled:busy||(!demo&&(!owner||preferences.loading||!!preferences.error)),error:state?.scope===scope?state.error:''};
}
