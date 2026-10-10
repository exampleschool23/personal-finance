import { z } from 'zod';
import { isoDate, nonnegativeAmount, uuid } from '@/lib/api-validation';
import { crossSite, postgrestFailure, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { queueMilestoneCheck } from '@/lib/notify-action';
const schema = z.object({
 account_id: uuid.optional(), id: uuid, mortgage_id: uuid,
 principal: nonnegativeAmount, interest: nonnegativeAmount,
 date: isoDate,
 notes: z.string().max(2000),
}).refine(v => v.principal + v.interest > 0 && v.principal + v.interest <= 1e15);
// A refusal the database explains (P0001) is shown in its words; a database without the function answers 503 (lib/api-route.ts).
const databaseUpdate = 'The app database needs an update. Ask the administrator to apply the latest migrations.';
export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ error: 'Check the payment fields.' }, { status: 400 });
  const p = parsed.data;
  if(!p.account_id)return Response.json({error:'Choose a cash account.'},{status:400});
  const result = await supa('/rest/v1/rpc/planning_action', { method: 'POST', body: JSON.stringify({p_action:'mortgage',p_data:{id:p.id,account_id:p.account_id,target_id:p.mortgage_id,amount:p.principal,received:0,fee:p.interest,date:p.date,notes:p.notes}}) }, auth.token);
  if (!result.ok) return postgrestFailure(result, 'Could not save the payment. Check the database migration and try again.', { codes: { PGRST202: [databaseUpdate, 503] } });
  queueMilestoneCheck(auth,{type:'mortgage',account_id:p.account_id,target_id:p.mortgage_id,principal:p.principal,interest:p.interest,date:p.date});
  return Response.json(await result.json());
 } catch { return Response.json({ error: 'Payment could not be confirmed. Retry with the same details.' }, { status: 503 }); }
}
