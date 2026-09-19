import { z } from 'zod';
import { session, supa, sameOrigin } from '@/lib/supabase';
const schema = z.object({
 account_id:z.string().uuid().optional(), id: z.string().uuid(), mortgage_id: z.string().uuid(),
 principal: z.number().finite().min(0).max(1e15), interest: z.number().finite().min(0).max(1e15),
 date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v),
 notes: z.string().max(2000),
}).refine(v => v.principal + v.interest > 0 && v.principal + v.interest <= 1e15);
const errors = ['Payment date cannot precede the start date.','Mortgage not found.', 'Principal exceeds the outstanding balance.', 'This payment was already saved with different details.', 'Check the payment fields.'];
export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 try {
  const auth = await session();
  if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Check the payment fields.' }, { status: 400 });
  const p = parsed.data;
  if(!p.account_id)return Response.json({error:'Choose a cash account.'},{status:400});
  const result = await supa('/rest/v1/rpc/planning_action', { method: 'POST', body: JSON.stringify({p_action:'mortgage',p_data:{id:p.id,account_id:p.account_id,target_id:p.mortgage_id,amount:p.principal,received:0,fee:p.interest,date:p.date,notes:p.notes}}) }, auth.token);
  if (!result.ok) {
   const error = await result.json() as { message: string };
   return Response.json({ error: errors.includes(error.message) ? error.message : 'Could not save the payment. Check the database migration and try again.' }, { status: errors.includes(error.message) ? 400 : 503 });
  }
  return Response.json(await result.json());
 } catch { return Response.json({ error: 'Payment could not be confirmed. Retry with the same details.' }, { status: 503 }); }
}
