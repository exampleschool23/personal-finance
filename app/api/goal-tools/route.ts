import { z } from 'zod';
import { uuid,isoDate,nonnegativeAmount,notes } from '@/lib/api-validation';
import { crossSite,postgrestFailure,readJson,signInAgain } from '@/lib/api-route';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { queueMilestoneCheck } from '@/lib/notify-action';
import { readOwnerRows } from '@/lib/server-records';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('funding'),data:z.object({goal_id:uuid,priority:z.number().int().min(0).max(10000),monthly:nonnegativeAmount.nullable(),enabled:z.boolean(),paused_until:isoDate.nullable(),mode:z.enum(['one_time','refill'])})}),
 z.object({action:z.literal('activity'),data:z.object({id:uuid,goal_id:uuid,target_id:uuid.nullable(),source_id:uuid.nullable(),amount:nonnegativeAmount.positive(),date:isoDate,type:z.enum(['contribution','withdrawal','transfer']),notes})})
]);
export async function GET(){try{const auth=await session();if(!auth)return signInAgain();return Response.json({events:await readOwnerRows('goal_events',auth.token,{order:'occurred_on.desc,created_at.desc,id.asc'})},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Could not load goal activity. Check the latest migrations.'},{status:503});}}
export async function POST(req:Request){if(!sameOrigin(req))return crossSite();try{const auth=await session();if(!auth)return signInAgain();const parsed=schema.safeParse(await readJson(req));if(!parsed.success)return Response.json({error:'Check the goal activity.'},{status:400});const result=await supa('/rest/v1/rpc/'+(parsed.data.action==='funding'?'configure_goal_funding':'record_goal_activity'),{method:'POST',body:JSON.stringify({p_data:parsed.data.data})},auth.token);if(!result.ok)return postgrestFailure(result,'Could not save goal changes. Check the latest migrations.');queueMilestoneCheck(auth,parsed.data.action==='funding'?{type:'goal_funding',goal_id:parsed.data.data.goal_id,monthly:parsed.data.data.monthly,enabled:parsed.data.data.enabled}:{type:'goal_activity',goal_id:parsed.data.data.goal_id,activity:parsed.data.data.type,amount:parsed.data.data.amount,date:parsed.data.data.date});return Response.json({ok:true});}catch{return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}}
