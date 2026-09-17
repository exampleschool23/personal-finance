import { z } from 'zod';
import { session, supa, sameOrigin } from '@/lib/supabase';
const schema = z.object({
 id: z.string().uuid(), mortgage_id: z.string().uuid(),
 principal: z.number().finite().min(0).max(1e15), interest: z.number().finite().min(0).max(1e15),
 date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v),
 notes: z.string().max(2000),
}).refine(v => v.principal + v.interest > 0 && v.principal + v.interest <= 1e15);
const errors = ['Mortgage not found.', 'Principal exceeds the outstanding balance.', 'This payment was already saved with different details.', 'Check the payment fields.'];
export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 try {
  const auth = await session();
  if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Check the payment fields.' }, { status: 400 });
  const p = parsed.data;
  const result = await supa('/rest/v1/rpc/record_mortgage_payment', { method: 'POST', body: JSON.stringify({ p_id:p.id,p_mortgage_id:p.mortgage_id,p_principal:p.principal,p_interest:p.interest,p_date:p.date,p_notes:p.notes }) }, auth.token);
  if (!result.ok) {
   const error = await result.json() as { message: string };
   return Response.json({ error: errors.includes(error.message) ? error.message : 'Could not save the payment. Check the database migration and try again.' }, { status: errors.includes(error.message) ? 400 : 503 });
  }
  return Response.json(await result.json());
 } catch { return Response.json({ error: 'Payment could not be confirmed. Retry with the same details.' }, { status: 503 }); }
}
