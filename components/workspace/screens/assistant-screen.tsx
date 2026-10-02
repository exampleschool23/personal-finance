"use client";
import { useRef, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { assistantSuggestions } from '@/lib/assistant';

type Turn = { role: 'user' | 'assistant'; content: string };

/** Monarch's AI assistant: ask about your own money in plain words. Questions and a summary of your records go to the model. */
export function AssistantScreen() {
 const { t, language } = useLanguage();
 const { user, demo, currency, market } = useWorkspace();
 const [turns, setTurns] = useState<Turn[]>([]);
 const [draft, setDraft] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const end = useRef<HTMLDivElement>(null);
 const rates = typeof market?.rates === 'object' ? market.rates : {};
 async function ask(question: string) {
  const text = question.trim();
  if (!text || busy || demo || !user) return;
  const next = [...turns, { role: 'user' as const, content: text }].slice(-19);
  setTurns(next); setDraft(''); setBusy(true); setError('');
  requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
  try {
   const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next, currency, rates, language }) });
   const result = await response.json() as { answer?: string; error?: string };
   if (!response.ok || !result.answer) throw Error(result.error ?? 'The assistant could not answer. Please try again.');
   setTurns([...next, { role: 'assistant', content: result.answer }]);
  } catch (reason) { setError((reason as Error).message); setTurns(turns); setDraft(text); }
  finally { setBusy(false); requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' })); }
 }
 return <div data-page="Assistant" className="content assistant-content">
  <PageHeader title={t('Assistant')} hint={t('Your questions and a summary of your records are sent to Claude, an AI model by Anthropic, to answer them. Answers can be wrong and are not financial advice.')}/>
  <section className="panel assistant-panel" aria-label={t('Assistant')}>
   <div className="assistant-log" aria-live="polite">
    {turns.length ? turns.map((turn, index) => <div key={index} className="assistant-turn" data-role={turn.role}><p>{turn.content}</p></div>)
     : <EmptyState icon={<Sparkles/>} title={t('Ask anything about your money')} description={t(demo ? 'Sign in to ask about your own records. The sample workspace has no assistant.' : 'Try one of these, or type your own question.')}/>}
    {busy && <div className="assistant-turn" data-role="assistant"><p className="assistant-thinking">{t('Thinking…')}</p></div>}
    <div ref={end}/>
   </div>
   {!turns.length && !demo && <div className="assistant-suggestions">{assistantSuggestions.map(item => <button key={item} type="button" disabled={busy} onClick={() => ask(t(item))}>{t(item)}</button>)}</div>}
   {error && <p className="form-error" role="alert">{t(error)}</p>}
   <form className="assistant-form" onSubmit={event => { event.preventDefault(); ask(draft); }}>
    <textarea aria-label={t('Ask anything about your money')} placeholder={t('Ask anything about your money…')} value={draft} maxLength={4000} rows={2} disabled={demo || !user} onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(draft); } }}/>
    <Button size="icon" disabled={busy || demo || !draft.trim()} aria-label={t('Send')}><ArrowUp size={18}/></Button>
   </form>
   <p className="assistant-note">{t('The assistant can make mistakes and is not financial advice.')}</p>
  </section>
 </div>;
}
