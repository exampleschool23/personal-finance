"use client";
import {decimalTotalEquals} from '@/lib/decimal-amounts';
import {useState} from 'react';
import {useOwnerResource} from '@/hooks/use-owner-resource';
import {useLanguage} from '@/components/language-provider';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {DatePicker} from '@/components/date-picker';
import {FormattedNumberInput} from '@/components/formatted-number-input';
import {useDiscardChanges} from '@/components/discard-changes';
import {formatDate,formatMoney} from '@/lib/format';
import {depositToday} from '@/lib/deposit-interest';
import type {Entry} from '@/lib/finance';
type Leg={key:string;date:string;name:string;amount:number};
type Statement={id:string;account_id:string;start_date:string;end_date:string;opening_balance:number;closing_balance:number;cleared:string[];fingerprint:string;status:'draft'|'reconciled';revision:number|null};
type State={entries:Leg[];fingerprint:string;saved:Statement[]};
const empty:State={entries:[],fingerprint:'',saved:[]};
export function StatementReconciliation({account,owner,onClose,onSaved}:{account:Entry;owner:string|null;onClose:()=>void;onSaved:()=>void}){
 const {t,locale}=useLanguage(),today=depositToday();const [from,setFrom]=useState(today.slice(0,7)+'-01'),[to,setTo]=useState(today),[selected,setSelected]=useState<Statement|null>(null),[editing,setEditing]=useState(false);
 const resource=useOwnerResource(`/api/reconciliation?account=${account.id}&from=${from}&to=${to}`,owner,true,0,empty);
 return <Dialog open onOpenChange={open=>{if(!open&&!editing)onClose();}}><DialogContent className="record-dialog" showCloseButton={!editing}><DialogTitle>{t('Statement reconciliation')} · {account.name}</DialogTitle><DialogDescription>{t('Enter the opening cleared balance immediately before the first day. Match transactions to the bank statement. This review does not change your cash balance.')}</DialogDescription>
 {!editing?<><div className="form-grid"><label>{t('First day')}<DatePicker value={from} max={to} onChange={v=>{setFrom(v);setSelected(null);}}/></label><label>{t('Statement closing date')}<DatePicker value={to} min={from} max={today} onChange={v=>{setTo(v);setSelected(null);}}/></label></div>
 {resource.error&&<p role="alert" className="error">{t(resource.error)} <Button onClick={resource.retry}>{t('Retry')}</Button></p>}
 {resource.loading?<p>{t('Loading records…')}</p>:!resource.error&&<><Button onClick={()=>setEditing(true)}>{t(selected?'Review statement':'Start statement review')}</Button><h3>{t('Saved statements')}</h3><ul className="tool-list">{resource.data.saved.map(s=><li key={s.id}><span>{formatDate(s.start_date,locale)} — {formatDate(s.end_date,locale)}</span><Button variant="outline" onClick={()=>{setFrom(s.start_date);setTo(s.end_date);setSelected(s);}}>{t('Open')}</Button></li>)}</ul></>}
 <Button variant="outline" onClick={onClose}>{t('Close')}</Button></>:<StatementForm key={selected?.id??'new'} initial={selected} account={account} from={from} to={to} state={resource.data} onClose={()=>setEditing(false)} onSaved={()=>{resource.invalidate();setEditing(false);setSelected(null);onSaved();}}/>}
 </DialogContent></Dialog>;
}
function StatementForm({initial,account,from,to,state,onClose,onSaved}:{initial:Statement|null;account:Entry;from:string;to:string;state:State;onClose:()=>void;onSaved:()=>void}){
 const {t,locale}=useLanguage();
 const [draft,setDraft]=useState<Statement>(()=>initial?{...initial,opening_balance:Number(initial.opening_balance),closing_balance:Number(initial.closing_balance),cleared:initial.cleared.filter(k=>state.entries.some(e=>e.key===k)),fingerprint:state.fingerprint}:{id:crypto.randomUUID(),account_id:account.id,start_date:from,end_date:to,opening_balance:0,closing_balance:0,cleared:[],fingerprint:state.fingerprint,status:'draft',revision:null});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const guard=useDiscardChanges(true,onClose,busy);
 const sum=state.entries.filter(e=>draft.cleared.includes(e.key)).reduce((n,e)=>n+Number(e.amount),draft.opening_balance),difference=draft.closing_balance-sum;
 async function save(status:Statement['status']){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/reconciliation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,status})});const body=await r.json() as {error?:string};if(!r.ok)throw Error(body.error);onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><fieldset className="record-form" disabled={busy}>
 {initial&&<p role="status">{t(initial.fingerprint!==state.fingerprint?'Account activity changed. Check the cleared entries again.':initial.status==='reconciled'?'This statement matched when last reviewed.':'Saved draft')}</p>}
 <div className="form-grid"><label>{t('Opening cleared balance')}<FormattedNumberInput value={draft.opening_balance} onValueChange={n=>setDraft({...draft,opening_balance:n})}/></label><label>{t('Statement closing balance')}<FormattedNumberInput value={draft.closing_balance} onValueChange={n=>setDraft({...draft,closing_balance:n})}/></label></div>
 <p className="muted">{t('Unchecked entries remain pending. Direct balance corrections may not have a transaction leg; review unexplained differences instead of forcing a match.')}</p>
 <div className="table-scroll daily-ledger"><table><thead><tr><th>{t('Cleared')}</th><th>{t('Date')}</th><th>{t('Name')}</th><th>{t('Amount')}</th></tr></thead><tbody>{state.entries.map(e=><tr key={e.key}><td><input type="checkbox" aria-label={`${t('Cleared')}: ${e.name}`} checked={draft.cleared.includes(e.key)} onChange={event=>setDraft({...draft,cleared:event.target.checked?[...draft.cleared,e.key]:draft.cleared.filter(k=>k!==e.key)})}/></td><td>{formatDate(e.date,locale)}{e.date<from&&<small className="block">{t('Pending from an earlier statement')}</small>}</td><td>{t(e.name)}</td><td>{formatMoney(Number(e.amount),account.currency,locale)}</td></tr>)}</tbody></table></div>
 <p>{t('Cleared balance')}: <strong>{formatMoney(sum,account.currency,locale)}</strong></p><p>{t('Difference')}: <strong>{formatMoney(difference,account.currency,locale)}</strong></p>{difference!==0&&Math.abs(difference)<1&&<p>{t('A fractional difference remains. Check the precise statement amounts.')}</p>}
 <p className="muted">{t('Any subsequent account balance update requires another review, including a payment after this statement period.')}</p>
 </fieldset>{error&&<p role="alert" className="error">{t(error)}</p>}<div className="record-form-footer"><Button variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button variant="outline" disabled={busy} onClick={()=>void save('draft')}>{t('Save draft')}</Button><Button disabled={busy||!decimalTotalEquals([draft.opening_balance,...state.entries.filter(e=>draft.cleared.includes(e.key)).map(e=>Number(e.amount))],draft.closing_balance)} onClick={()=>void save('reconciled')}>{t('Reconcile statement')}</Button></div>{guard.confirmation}</>;
}
