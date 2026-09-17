import type { Goal, InvestmentTarget, PlanningData } from './planning';
import { instrumentFor } from './market';
import { projectGoal } from './goal-projection';

export function investmentGoalProgress(goal:Goal,data:Pick<PlanningData,'records'|'holdingAccounts'>){
 const account=data.holdingAccounts?.find(item=>item.id===goal.holding_account_id&&item.kind===goal.asset_kind);
 if(goal.kind!=='investment'||!account||!goal.asset_symbol)return null;
 const holdings=data.records.filter(record=>record.holding_account_id===account.id&&record.kind===goal.asset_kind&&instrumentFor(record)?.symbol===goal.asset_symbol);
 const current=holdings.reduce((sum,record)=>sum+Number(record.quantity),0);
 return {account,current,remaining:Math.max(0,Number(goal.target)-current),percent:Math.max(0,Math.min(100,current/Number(goal.target)*100))};
}
export function investmentGoalPlan(goal:Goal,current:number,today:string,monthly:number){
 if(!goal.target_date)return null;
 // Unit accumulation has no assumed price return: price changes do not create coins/shares.
 const projection=projectGoal(current,Number(goal.target),today,goal.target_date,monthly,0);
 if(!projection)return null;
 const required=projection.required===null?null:Math.ceil(projection.required*1e8)/1e8;
 return {...projection,required};
}

// Legacy single-instrument goals remain editable until the next save upgrades them.
export function investmentGoalTargets(goal:Goal):InvestmentTarget[]{
 if(goal.kind!=='investment')return [];
 if(goal.investment_targets?.length)return goal.investment_targets;
 return goal.holding_account_id&&goal.asset_kind&&goal.asset_symbol?[{holding_account_id:goal.holding_account_id,asset_kind:goal.asset_kind,asset_symbol:goal.asset_symbol,target:Number(goal.target),monthly_contribution:goal.monthly_contribution??null}]:[];
}
export function investmentGoalItems(goal:Goal,data:Pick<PlanningData,'records'|'holdingAccounts'>){
 return investmentGoalTargets(goal).map(target=>({target,progress:investmentGoalProgress({...goal,...target},data)}));
}
export function investmentGoalCompletion(goal:Goal,data:Pick<PlanningData,'records'|'holdingAccounts'>){
 const items=investmentGoalItems(goal,data);
 // Different units cannot be summed; each target has equal weight, capped at 100%.
 return !items.length||items.some(item=>!item.progress)?null:items.reduce((sum,item)=>sum+item.progress!.percent,0)/items.length;
}
