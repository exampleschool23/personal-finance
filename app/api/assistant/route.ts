import Anthropic from '@anthropic-ai/sdk';
import { assistantContext, assistantInstructions, assistantRequestSchema, assistantUnavailable } from '@/lib/assistant';
import { shiftMonth } from '@/lib/calendar-days';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { planningReadFilters } from '@/lib/planning-reads';
import type { PlanningData } from '@/lib/planning';
import { readOwnerRows } from '@/lib/server-records';
import { crossSite, readJson, signInAgain, tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';
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
 if (!sameOrigin(req)) return crossSite();
 if (!assistantAvailable()) return Response.json({ error: assistantUnavailable }, { status: 503 });
 const auth = await session(); if (!auth) return signInAgain();
 const parsed = assistantRequestSchema.safeParse(await readJson(req));
 if (!parsed.success) return Response.json({ error: 'Check your question and try again.' }, { status: 400 });
 // Each answer costs money: a person gets a fair share per hour and per day, wherever they ask from.
 if (await rateLimited(req, 'assistant', limits.assistant, auth.user.id, { perIp: false })) return tooManyAttempts();
 const { messages, currency, rates, language } = parsed.data;
 const today = depositToday(), month = today.slice(0, 7);
 let snapshot: string;
 try {
  const filters = planningReadFilters('budget', month, shiftMonth(month, -2));
  const [records, categories, goals, occurrences, activity] = await Promise.all([
   readOwnerRows<Entry>('finance_records', auth.token, filters.records), readOwnerRows<PlanningData['categories'][number]>('transaction_categories', auth.token),
   readOwnerRows<PlanningData['goals'][number]>('savings_goals', auth.token), readOwnerRows<PlanningData['occurrences'][number]>('payment_occurrences', auth.token),
   readOwnerRows<PlanningData['activity'][number]>('account_activity', auth.token, filters.activity),
  ]);
  snapshot = assistantContext({ records: records.map(normalizeEntry), categories, goals, occurrences, activity, investmentLinks: [] }, today, currency, rates, language);
 } catch { return Response.json({ error: 'Could not load your records. Please try again.' }, { status: 503 }); }
 try {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
   model: 'claude-opus-5-5',
   // Answers are brief by instruction; this bounds the cost of one that is not.
   max_tokens: 4000,
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
