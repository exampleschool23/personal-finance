// One-time Telegram celebrations: a first record, savings goals passing 25, 50,
// 75 and 100 percent, and a new net-worth high. The decisions and the wording
// are pure; telegram-milestones.ts reads and writes what they need.
import {formatMoney} from './format';
import {locales,translate,type Language} from './i18n';
import {escapeHtml} from './telegram';
export const goalThresholds=[25,50,75,100];
export const firstRecordKey='first_record';
export const netWorthKey='net_worth_high';
export const goalKey=(goalId:string,threshold:number)=>`goal:${goalId}:${threshold}`;
/** The thresholds a goal has reached that were not celebrated yet. */
export function newGoalThresholds(allocated:number,target:number,achieved:readonly number[]){
 if(!(target>0)||!Number.isFinite(allocated))return [];
 const percent=allocated/target*100;
 return goalThresholds.filter(threshold=>percent>=threshold&&!achieved.includes(threshold));
}
export type NetWorthDecision={notify:boolean;store:number|null};
/**
 * `history` is net worth by day, oldest first, ending today. A high is only
 * celebrated after a week of history and when it beats the last celebrated
 * high (or, the first time, the best earlier day) by 2%, so a slow climb does
 * not message every night. The first run records its baseline quietly.
 */
export function netWorthHigh(history:readonly number[],celebrated:number|null,minDays=8,margin=0.02):NetWorthDecision{
 if(history.length<minDays)return {notify:false,store:null};
 const today=history[history.length-1],baseline=celebrated??Math.max(...history.slice(0,-1));
 const bar=baseline>0?baseline*(1+margin):baseline;
 if(today>0&&today>bar)return {notify:true,store:today};
 return {notify:false,store:celebrated===null?baseline:null};
}
export type Milestone=
 |{type:'first_record'}
 |{type:'goal';goal:string;percent:number}
 |{type:'goal_complete';goal:string}
 |{type:'net_worth';amount:number;currency:string};
/** The celebration text; without a name it drops the address instead of leaving a gap. */
export function milestoneMessage(milestone:Milestone,language:Language,name=''):string{
 const t=(key:string,params?:Record<string,string|number>)=>translate(language,key,params);
 const who=name.trim()?{name:escapeHtml(name.trim())}:null,pick=(named:string,plain:string,params:Record<string,string|number>={})=>who?t(named,{...params,...who}):t(plain,params);
 switch(milestone.type){
  case 'first_record':return pick('{name}, you saved your first record 🎉 Your money story starts here.','You saved your first record 🎉 Your money story starts here.');
  case 'goal':return pick('{name}, your {goal} just passed {percent}% 🎉','Your {goal} just passed {percent}% 🎉',{goal:`<b>${escapeHtml(milestone.goal)}</b>`,percent:milestone.percent});
  case 'goal_complete':return pick('{name}, you reached your {goal} goal 🏆','You reached your {goal} goal 🏆',{goal:`<b>${escapeHtml(milestone.goal)}</b>`});
  case 'net_worth':return pick('{name}, new net-worth high: {amount} 📈','New net-worth high: {amount} 📈',{amount:formatMoney(milestone.amount,milestone.currency,locales[language])});
 }
}
