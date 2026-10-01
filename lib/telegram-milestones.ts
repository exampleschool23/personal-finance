// Sends the celebrations in milestones.ts. Each is claimed in
// telegram_milestones first, so a retry or a second device never repeats one.
// The table is server-only; every query is scoped to an owner the caller has
// already verified, like the other background Telegram work.
import type {ActionAuth} from './notify-action';
import type {ActionEvent} from './action-messages';
import {firstRecordKey,goalKey,milestoneMessage,netWorthHigh,netWorthKey,newGoalThresholds,type Milestone} from './milestones';
import {snapshotPoints} from './portfolio-snapshots';
import {serviceDatabase,type ServiceDatabase} from './service-role';
import {ownerProfile,recentSnapshots} from './telegram-owner';
import {sendTelegramMessage,telegramConfig,type TelegramConfig} from './telegram';
type Deps={db?:ServiceDatabase|null;config?:TelegramConfig|null;send?:typeof sendTelegramMessage};
type Subscription={chat_id:number|null;actions_enabled:boolean};
const table='/rest/v1/telegram_milestones';
async function subscriptionOf(db:ServiceDatabase,owner:string){
 const [row]=await db.read<Subscription[]>('/rest/v1/telegram_subscriptions?select=chat_id,actions_enabled&user_id=eq.'+owner);
 return row?.chat_id&&row.actions_enabled?{...row,chat_id:row.chat_id}:null;
}
/** Records the keys and returns the ones that were new, so only the first claimant celebrates. */
async function claim(db:ServiceDatabase,owner:string,keys:string[]){
 const response=await db.write(table+'?on_conflict=user_id,key',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(keys.map(key=>({user_id:owner,key})))});
 if(!response.ok)throw Error('Database request failed.');
 return (await response.json() as Array<{key:string}>).map(row=>row.key);
}
async function celebrate(db:ServiceDatabase,owner:string,subscription:NonNullable<Awaited<ReturnType<typeof subscriptionOf>>>,milestone:(currency:string)=>Milestone,{config=telegramConfig(),send=sendTelegramMessage}:Deps){
 if(!config)return false;
 const profile=await ownerProfile(db,owner);
 return send({chat_id:subscription.chat_id,text:milestoneMessage(milestone(profile.currency),profile.language,profile.name)},config);
}
/** After a saved action: the first record, or a savings goal passing a quarter of its target. Resolves to true when a message was sent. */
export async function sendActionMilestone(auth:ActionAuth,event:ActionEvent,deps:Deps={}){
 const db=deps.db===undefined?serviceDatabase():deps.db,owner=auth.user?.id;
 if(!db||!owner)return false;
 const firstRecord=event.type==='record'&&event.created,goalProgress=event.type==='goal_activity'&&event.activity==='contribution';
 if(!firstRecord&&!goalProgress)return false;
 const subscription=await subscriptionOf(db,owner);
 if(!subscription)return false;
 if(event.type==='record'){
  if(!(await claim(db,owner,[firstRecordKey])).length)return false;
  // Someone who already had records before this feature is marked quietly.
  if((await db.read<unknown[]>(`/rest/v1/finance_records?select=id&user_id=eq.${owner}&limit=2`)).length>1)return false;
  return celebrate(db,owner,subscription,()=>({type:'first_record'}),deps);
 }
 if(event.type!=='goal_activity')return false;
 const [goal]=await db.read<Array<{id:string;name:string;allocated:number;target:number;kind:string;archived:boolean}>>(`/rest/v1/savings_goals?select=id,name,allocated,target,kind,archived&id=eq.${event.goal_id}&user_id=eq.${owner}`);
 if(!goal||goal.kind!=='savings'||goal.archived)return false;
 const prefix=`goal:${goal.id}:`;
 const achieved=(await db.read<Array<{key:string}>>(`${table}?select=key&user_id=eq.${owner}&key=like.${prefix}*`)).filter(row=>row.key.startsWith(prefix)).map(row=>Number(row.key.slice(prefix.length)));
 const fresh=newGoalThresholds(Number(goal.allocated),Number(goal.target),achieved);
 if(!fresh.length)return false;
 const top=Math.max(...fresh),claimed=await claim(db,owner,fresh.map(threshold=>goalKey(goal.id,threshold)));
 if(!claimed.includes(goalKey(goal.id,top)))return false;
 return celebrate(db,owner,subscription,()=>top===100?{type:'goal_complete',goal:goal.name}:{type:'goal',goal:goal.name,percent:top},deps);
}
/** Run after the daily snapshot is captured. Resolves to true when a new high was announced. */
export async function announceNetWorthHigh(owner:string,deps:Deps={}){
 const db=deps.db===undefined?serviceDatabase():deps.db;
 if(!db)return false;
 const subscription=await subscriptionOf(db,owner);
 if(!subscription)return false;
 const profile=await ownerProfile(db,owner);
 const points=snapshotPoints(await recentSnapshots(db,owner,1000),profile.currency);
 const [stored]=await db.read<Array<{value:number|null}>>(`${table}?select=value&user_id=eq.${owner}&key=eq.${netWorthKey}`);
 const decision=netWorthHigh(points.map(point=>point.net),stored?.value===null||stored?.value===undefined?null:Number(stored.value));
 if(decision.store!==null){
  const saved=await db.write(table+'?on_conflict=user_id,key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:owner,key:netWorthKey,value:decision.store,achieved_at:new Date().toISOString()})});
  if(!saved.ok)throw Error('Database request failed.');
 }
 if(!decision.notify)return false;
 return celebrate(db,owner,subscription,currency=>({type:'net_worth',amount:decision.store!,currency}),deps);
}
