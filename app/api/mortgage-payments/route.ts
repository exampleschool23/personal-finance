import { z } from 'zod';
import { isoDate, nonnegativeAmount, uuid } from '@/lib/api-validation';
import { crossSite, postgrestError, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { queueMilestoneCheck } from '@/lib/notify-action';
const schema = z.object({
 account_id: uuid.optional(), id: uuid, mortgage_id: uuid,
 principal: nonnegativeAmount, interest: nonnegativeAmount,
 date: isoDate,
 notes: z.string().max(2000),
}).refine(v => v.principal + v.interest > 0 && v.principal + v.interest <= 1e15);
const errors = ['Payment date cannot precede the start date.','Mortgage not found.', 'Principal exceeds the outstanding balance.', 'This payment was already saved with different details.', 'Check the payment fields.'];
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
  if (!result.ok) {
   const { message = '' } = await postgrestError(result);
   return Response.json({ error: errors.includes(message) ? message : 'Could not save the payment. Check the database migration and try again.' }, { status: errors.includes(message) ? 400 : 503 });
  }
  queueMilestoneCheck(auth,{type:'mortgage',account_id:p.account_id,target_id:p.mortgage_id,principal:p.principal,interest:p.interest,date:p.date});
  return Response.json(await result.json());
 } catch { return Response.json({ error: 'Payment could not be confirmed. Retry with the same details.' }, { status: 503 }); }
}
