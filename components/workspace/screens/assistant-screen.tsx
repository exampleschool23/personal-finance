"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { assistantSuggestions, assistantUnavailable } from '@/lib/assistant';

type Turn = { role: 'user' | 'assistant'; content: string };

/** AI assistant: ask about your own money in plain words. Questions and a summary of your records go to the model. */
export function AssistantScreen() {
 const { t, language } = useLanguage();
 const { user, demo, currency, market } = useWorkspace();
 const [turns, setTurns] = useState<Turn[]>([]);
 const [draft, setDraft] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const end = useRef<HTMLDivElement>(null);
 // Ask the server up front whether the assistant is configured, so nobody types a question it cannot answer.
 const [status, setStatus] = useState<{ owner: string | null; available: boolean | null }>({ owner: null, available: null });
 const live = !demo && !!user;
 useEffect(() => {
  if (!live) return;
  const controller = new AbortController();
  fetch('/api/assistant', { signal: controller.signal, cache: 'no-store' })
   .then(response => response.ok ? response.json() as Promise<{ available?: boolean }> : { available: true })
   .then(result => setStatus({ owner: user, available: result.available !== false }))
   .catch(() => { if (!controller.signal.aborted) setStatus({ owner: user, available: true }); });
  return () => controller.abort();
 }, [live, user]);
 const available = !live ? null : status.owner === user ? status.available : null;
 const unavailable = available === false;
 // Send says why it is off: the empty state already explains the sample workspace and a missing setup, so it points there.
 const reasonId = useId();
 const send = sendBlocker({ busy, demo, unavailable, asked: turns.length > 0, draft }, reasonId, t);
 const rates = typeof market?.rates === 'object' ? market.rates : {};
 async function ask(question: string) {
  const text = question.trim();
  if (!text || busy || demo || !user || !available) return;
  const next = [...turns, { role: 'user' as const, content: text }].slice(-19);
  setTurns(next); setDraft(''); setBusy(true); setError('');
  requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
  try {
   const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next, currency, rates, language }) });
   const result = await response.json() as { answer?: string; error?: string };
   if (result.error === assistantUnavailable) { setStatus({ owner: user, available: false }); setTurns(turns); setDraft(text); return; }
   if (!response.ok || !result.answer) throw Error(result.error ?? 'The assistant could not answer. Please try again.');
   setTurns([...next, { role: 'assistant', content: result.answer }]);
  } catch (reason) { setError((reason as Error).message); setTurns(turns); setDraft(text); }
  finally { setBusy(false); requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' })); }
 }
 return <div data-page="Assistant" className="content assistant-content">
  <PageHeader title={t('Assistant')} hint={t('Your questions and a summary of your records are sent to Claude, an AI model by Anthropic, to answer them. Answers can be wrong and are not financial advice.')}/>
  <section className="panel assistant-panel" aria-label={t('Assistant')}>
   <div className={unavailable && !turns.length ? 'assistant-log is-unavailable' : 'assistant-log'} aria-live="polite">
    {turns.length ? turns.map((turn, index) => <div key={index} className="assistant-turn" data-role={turn.role}><p>{turn.content}</p></div>)
     : unavailable ? <EmptyState id={reasonId} icon={<Sparkles/>} title={t('The assistant isn’t available yet')} description={t('It will answer questions here once it has been set up for this app.')}/>
     : <EmptyState id={reasonId} icon={<Sparkles/>} title={t('Ask anything about your money')} description={t(demo ? 'Sign in to ask about your own records. The sample workspace has no assistant.' : 'Try one of these, or type your own question.')}/>}
    {busy && <div className="assistant-turn" data-role="assistant"><p className="assistant-thinking">{t('Thinking…')}</p></div>}
    <div ref={end}/>
   </div>
   {!turns.length && !demo && !unavailable && <div className="assistant-suggestions">{assistantSuggestions.map(item => <button key={item} type="button" disabled={busy || !available} onClick={() => ask(t(item))}>{t(item)}</button>)}</div>}
   {error && <p className="form-error" role="alert">{t(error)}</p>}
   <form className="assistant-form" onSubmit={event => { event.preventDefault(); ask(draft); }}>
    <textarea aria-label={t('Ask anything about your money')} placeholder={t('Ask anything about your money…')} value={draft} maxLength={4000} rows={2} disabled={demo || !user || !available} onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(draft); } }}/>
    <span title={send.title}><Button size="icon" disabled={busy || demo || !available || !draft.trim()} aria-label={t('Send')} aria-describedby={send.describedBy}><ArrowUp size={18}/></Button></span>
   </form>
   <p className="assistant-note">{t('The assistant can make mistakes and is not financial advice.')}</p>
  </section>
 </div>;
}

type SendState = { busy: boolean; demo: boolean; unavailable: boolean; asked: boolean; draft: string };
/** Why Send is off. The empty state on screen already explains the sample workspace and a missing setup, so Send points to it (`describedBy`); other reasons are its `title`. */
function sendBlocker({ busy, demo, unavailable, asked, draft }: SendState, emptyId: string, t: (key: string) => string) {
 if (!asked && (demo || unavailable)) return { describedBy: emptyId, title: undefined };
 if (busy) return { describedBy: undefined, title: undefined };
 return { describedBy: undefined, title: unavailable ? t('The assistant isn’t available yet') : draft.trim() ? undefined : t('Type a question.') };
}
