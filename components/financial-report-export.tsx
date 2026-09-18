"use client";
import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLanguage } from '@/components/language-provider';

export function FinancialReportExport({demo}:{demo:boolean}){
 const {t,language}=useLanguage();const [open,setOpen]=useState(false),[context,setContext]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);const downloading=useRef(false);
 async function download(){
  if(demo||downloading.current)return;
  downloading.current=true;setBusy(true);setError('');setDone(false);
  try{
   const [response,fontResponse,model,pdf]=await Promise.all([fetch('/api/backup',{cache:'no-store'}),fetch('/fonts/NotoSans-Regular.ttf'),import('@/lib/financial-report'),import('@/lib/financial-report-pdf')]);
   if(!response.ok)throw Error('Could not export all data. No incomplete backup was created.');
   if(!fontResponse.ok)throw Error('Could not create the PDF. Please try again.');
   const report=model.buildFinancialReport(await response.json(),language,context);
   const bytes=await pdf.renderFinancialReportPdf(report,new Uint8Array(await fontResponse.arrayBuffer()));
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
   const link=document.createElement('a');link.href=url;link.download='personal-financial-report.pdf';document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);setDone(true);
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not create the PDF. Please try again.');}finally{downloading.current=false;setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogTrigger asChild><Button variant="outline" disabled={demo}><FileText size={18} aria-hidden="true"/>{t('Download financial report (PDF)')}</Button></DialogTrigger>
 <DialogContent className="max-h-[85dvh] overflow-y-auto" showCloseButton={!busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onPointerDownOutside={event=>{if(busy)event.preventDefault();}}>
 <DialogTitle>{t('Personal financial report')}</DialogTitle>
 <DialogDescription>{t('A 1–2 page summary for an agent: net worth, income, expenses, goals and key interest rates.')}</DialogDescription>
 <label>{t('About me and interests (optional)')}<textarea rows={5} maxLength={450} disabled={busy} value={context} onChange={event=>{setContext(event.target.value);setDone(false);}} placeholder={t('Add your priorities, interests, family situation, risk tolerance or questions for the agent.')}/></label>
 <p className="muted">{t('This context is included only in this download. Nothing is sent to an agent automatically.')}</p>
 <p className="muted">{t('Only key information is included. Long lists are shortened; full data remains available in the backup.')}</p>
 {error&&<p className="error" role="alert">{t(error)}</p>}
 {done&&<p role="status">{t('Your PDF is ready. Upload it to your agent when you want feedback.')}</p>}
 <div className="record-form-footer"><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{t('Close')}</Button><Button disabled={busy||demo} onClick={()=>void download()}>{t(busy?'Preparing PDF…':'Download PDF')}</Button></div>
 </DialogContent></Dialog>;
}
