"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { CurrencySelect } from '@/components/currency-select';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useDiscardChanges } from '@/components/discard-changes';
import { formatMoney } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { income,type Entry } from '@/lib/finance';
import type { EarningSource } from '@/lib/earning-sources';
import type { EarningSourcesController } from '@/hooks/use-earning-sources';
export function IncomeSourcesPanel({controller,currencies,records,onRecord}:{controller:EarningSourcesController;currencies:string[];records:Entry[];onRecord:(source:EarningSource,bonus?:boolean)=>void}){
 const {t,locale}=useLanguage();const [draft,setDraft]=useState<EarningSource|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function archive(source:EarningSource){setBusy(true);setError('');try{await controller.save({...source,archived:!source.archived});}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 return <section id="income-sources" className="panel tools-panel"><div className="panel-title"><div><h2>{t('Income sources')}</h2><p className="muted">{t('Fixed sources have a schedule. Variable sources record only what you actually receive.')}</p></div><Button onClick={()=>setDraft({id:crypto.randomUUID(),name:'',kind:'Other income',currency:currencies[0],mode:'variable',archived:false,amount:null,frequency:null,start_date:null,end_date:null,linked_record_id:null})}>{t('Add income source')}</Button></div>
 {controller.loading?<p>{t('Loading records…')}</p>:controller.error?<p role="alert" className="error">{t(controller.error)}</p>:<ul className="tool-list">{controller.sources.map(source=><li key={source.id}><div><strong>{source.name}</strong><p className="muted">{t(source.archived?'Archived':source.mode==='fixed'?'Fixed income':'Variable income')} · {t(source.kind)}{source.mode==='fixed'&&<> · {formatMoney(source.amount??0,source.currency,locale)} · {t(source.frequency==='Yearly'?'Every year':'Every month')}</>}</p></div><div className="flex flex-wrap gap-2">{!source.archived&&<><Button disabled={busy} onClick={()=>onRecord(source)}>{t('Record income')}</Button><Button variant="outline" disabled={busy} onClick={()=>onRecord(source,true)}>{t('Record bonus')}</Button></>}<Button variant="outline" disabled={busy} onClick={()=>setDraft(source)}>{t('Edit')}</Button><Button variant="ghost" disabled={busy} onClick={()=>void archive(source)}>{t(source.archived?'Restore':'Archive')}</Button></div></li>)}</ul>}
 {!controller.loading&&!controller.error&&!controller.sources.length&&<p className="muted">{t('Add sources such as EPAM or Freelance interviews, then record each payment against them.')}</p>}{error&&<p className="error" role="alert">{t(error)}</p>}
 {draft&&<IncomeSourceEditor key={draft.id} initial={draft} currencies={currencies} records={records} save={controller.save} close={()=>setDraft(null)}/>}
 </section>;
}
export function IncomeSourceEditor({initial,currencies,records,save,close}:{initial:EarningSource;currencies:string[];records:Entry[];save:(source:EarningSource)=>Promise<void>;close:()=>void}){
 const {t}=useLanguage();const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guard=useDiscardChanges(JSON.stringify(initial)!==JSON.stringify(draft),close,busy);
 const linked=records.filter(row=>row.kind===(draft.kind==='Rent income'?'Property':'Business'));
 return <><Dialog open onOpenChange={open=>{if(!open)guard.close();}}><DialogContent className="record-dialog"><DialogTitle>{t('Income source')}</DialogTitle><DialogDescription>{t('A source organizes payments. Creating it does not add money to your account.')}</DialogDescription><form className="record-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await save(draft);close();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>
 <label>{t('Source name')}<Input value={draft.name} required maxLength={120} disabled={busy} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
 <div className="form-grid"><label>{t('Category')}<NativeSelect value={draft.kind} disabled={busy} onChange={event=>setDraft({...draft,kind:event.target.value as EarningSource['kind'],linked_record_id:null})}>{income.map(kind=><option key={kind} value={kind}>{t(kind)}</option>)}</NativeSelect></label><CurrencySelect value={draft.currency} currencies={currencies} savedCurrency={initial.currency} disabled={busy} onChange={currency=>setDraft({...draft,currency})}/></div>
 <label>{t('Income pattern')}<NativeSelect value={draft.mode} disabled={busy} onChange={event=>setDraft({...draft,mode:event.target.value as EarningSource['mode'],...(event.target.value==='variable'?{amount:null,frequency:null,start_date:null,end_date:null}:{amount:0,frequency:'Monthly',start_date:depositToday(),end_date:null})})}><option value="fixed">{t('Fixed income')}</option><option value="variable">{t('Variable income')}</option></NativeSelect></label>
 {['Rent income','Business income'].includes(draft.kind)&&<label>{t(draft.kind==='Rent income'?'Linked rental':'Linked business')}<NativeSelect required value={draft.linked_record_id??''} disabled={busy} onChange={event=>setDraft({...draft,linked_record_id:event.target.value||null})}><option value="">{t('Choose a matching income source.')}</option>{linked.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</NativeSelect></label>}
 {draft.mode==='fixed'?<><label>{t('Expected amount')}<FormattedNumberInput value={draft.amount??0} max={1e15} onValueChange={amount=>setDraft({...draft,amount})}/></label><div className="form-grid"><label>{t('Repeats')}<NativeSelect value={draft.frequency??'Monthly'} onChange={event=>setDraft({...draft,frequency:event.target.value as 'Monthly'|'Yearly'})}><option value="Monthly">{t('Every month')}</option><option value="Yearly">{t('Every year')}</option></NativeSelect></label><label>{t('Start date')}<DatePicker value={draft.start_date??''} onChange={start_date=>setDraft({...draft,start_date})}/></label></div><label>{t('End date (optional)')}<DatePicker value={draft.end_date??''} min={draft.start_date??undefined} required={false} onChange={date=>setDraft({...draft,end_date:date||null})}/></label></>:<p className="muted">{t('No expected amount or due date. Record any number of payments, including none in a month.')}</p>}
 {error&&<p role="alert" className="error">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||!draft.name.trim()||(draft.mode==='fixed'&&!draft.amount)}>{t(busy?'Saving…':'Save income source')}</Button></div>
 </form></DialogContent></Dialog>{guard.confirmation}</>;
}
