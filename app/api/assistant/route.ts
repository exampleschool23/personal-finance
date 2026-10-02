import Anthropic from '@anthropic-ai/sdk';
import { assistantContext, assistantInstructions, assistantRequestSchema, assistantUnavailable } from '@/lib/assistant';
import { shiftMonth } from '@/lib/budget';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { planningReadFilters } from '@/lib/planning-reads';
import type { PlanningData } from '@/lib/planning';
import { readOwnerRows } from '@/lib/server-records';
import { session, sameOrigin } from '@/lib/supabase';

/** Whether the assistant can answer at all, so the screen can say so before anyone types. Reveals nothing but a yes or no. */
export const dynamic = 'force-dynamic';
export function GET() {
 return Response.json({ available: assistantAvailable() }, { headers: { 'Cache-Control': 'no-store' } });
}
const assistantAvailable = () => !!process.env.ANTHROPIC_API_KEY;

/** Answers a question about the signed-in user's money with Claude. The request carries the conversation;
 * the server adds a snapshot built from the user's own records, read with their token. */
export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 if (!assistantAvailable()) return Response.json({ error: assistantUnavailable }, { status: 503 });
 const auth = await session(); if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
 const parsed = assistantRequestSchema.safeParse(await req.json().catch(() => null));
 if (!parsed.success) return Response.json({ error: 'Check your question and try again.' }, { status: 400 });
 const { messages, currency, rates } = parsed.data;
 const today = depositToday(), month = today.slice(0, 7);
 let snapshot: string;
 try {
  const filters = planningReadFilters('budget', month, shiftMonth(month, -2));
  const [records, categories, goals, occurrences, activity] = await Promise.all([
   readOwnerRows<Entry>('finance_records', auth.token, filters.records), readOwnerRows<PlanningData['categories'][number]>('transaction_categories', auth.token),
   readOwnerRows<PlanningData['goals'][number]>('savings_goals', auth.token), readOwnerRows<PlanningData['occurrences'][number]>('payment_occurrences', auth.token),
   readOwnerRows<PlanningData['activity'][number]>('account_activity', auth.token, filters.activity),
  ]);
  snapshot = assistantContext({ records: records.map(normalizeEntry), categories, goals, occurrences, activity, investmentLinks: [] }, today, currency, rates);
 } catch { return Response.json({ error: 'Could not load your records. Please try again.' }, { status: 503 }); }
 try {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
   model: 'claude-opus-5-5',
   max_tokens: 8000,
   betas: ['server-side-fallback-2026-07-01'],
   fallbacks: 'default',
   output_config: { effort: 'low' },
   system: [{ type: 'text', text: assistantInstructions, cache_control: { type: 'ephemeral' } }],
   messages: [{ role: 'user', content: `Snapshot of my finances:\n\n${snapshot}` }, { role: 'assistant', content: 'Thanks, I have your snapshot. What would you like to know?' }, ...messages],
  });
  if (response.stop_reason === 'refusal') return Response.json({ error: 'The assistant cannot answer that question.' }, { status: 422 });
  const text = response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim();
  return Response.json({ answer: text || 'No answer was returned. Please try again.' }, { headers: { 'Cache-Control': 'no-store' } });
 } catch (error) {
  if (error instanceof Anthropic.RateLimitError) return Response.json({ error: 'The assistant is busy. Please try again in a minute.' }, { status: 429 });
  if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: assistantUnavailable }, { status: 503 });
  return Response.json({ error: 'The assistant could not answer. Please try again.' }, { status: 502 });
 }
}
