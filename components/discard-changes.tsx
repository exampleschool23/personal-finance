"use client";
import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useLanguage } from '@/components/language-provider';
export function useDiscardChanges(dirty:boolean,onClose:()=>void,busy=false){
 const [pending,setPending]=useState<(()=>void)|null>(null);
 const approved=useRef(false);
 useEffect(()=>{if(!dirty)return;const prevent=(event:BeforeUnloadEvent)=>{if(!approved.current)event.preventDefault();};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty]);
 const request=(action:()=>void)=>{if(!busy){if(dirty)setPending(()=>action);else action();}};
 return {close:()=>request(onClose),request,confirmation:<DiscardChanges open={!!pending} setOpen={open=>{if(!open)setPending(null);}} discard={()=>{approved.current=true;pending?.();setPending(null);}}/>};
}
function DiscardChanges({open,setOpen,discard}:{open:boolean;setOpen:(open:boolean)=>void;discard:()=>void}){
 const {t}=useLanguage();return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogContent><AlertDialogTitle>{t('Discard unsaved changes?')}</AlertDialogTitle><AlertDialogDescription>{t('Your changes have not been saved. Keep editing to finish them.')}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel><AlertDialogAction onClick={discard}>{t('Discard changes')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
export function useDraftDialog(value:{id:string}|null,onClose:()=>void,busy=false){
 const key=value?.id??'';const serialized=JSON.stringify(value);
 const [baseline,setBaseline]=useState({key,serialized});
 if(baseline.key!==key)setBaseline({key,serialized});
 return useDiscardChanges(!!value&&baseline.key===key&&baseline.serialized!==serialized,onClose,busy);
}
// Page forms use the same prompt as dialogs. Capture before the router handles links.
export function useUnsavedNavigation(dirty:boolean){
 const guard=useDiscardChanges(dirty,()=>{});
 useEffect(()=>{
  if(!dirty)return;
  const navigate=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   const link=event.target instanceof Element?event.target.closest('a'):null;
   if(!link||link.target==='_blank'||link.hasAttribute('download')||!link.href||link.href.startsWith(window.location.href.split('#')[0]+'#'))return;
   event.preventDefault();event.stopPropagation();guard.request(()=>window.location.assign(link.href));
  };
  document.addEventListener('click',navigate,true);return()=>document.removeEventListener('click',navigate,true);
 },[dirty,guard]);
 return guard.confirmation;
}
