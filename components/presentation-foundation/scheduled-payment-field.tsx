"use client";
import {useEffect} from 'react';
import {NativeSelect} from '@/components/ui/native-select';
import {useLanguage} from '@/components/language-provider';
import {formatMoney} from '@/lib/format';
import {frequencyLabels,type Entry} from '@/lib/finance';
/** Which recurring income or bill a new one-time payment pays, named by id. A choice that no longer fits (another category,
 * business or currency) is cleared; with no schedule to offer the field is not shown. A `saved` payment keeps the schedule
 * and due date it was saved with (the database refuses to change them), so the field neither shows nor clears it. */
export function ScheduledPaymentField({schedules,value,onChange,disabled=false,saved=false}:{schedules:Entry[];value?:string|null;onChange:(schedule:Entry|null)=>void;disabled?:boolean;saved?:boolean}){
 const {t,locale}=useLanguage();
 const stale=!saved&&!!value&&!schedules.some(schedule=>schedule.id===value);
 useEffect(()=>{if(stale)onChange(null);},[stale,onChange]);
 if(saved||!schedules.length)return null;
 return <label>{t('Scheduled payment')}<NativeSelect value={stale?'':value??''} disabled={disabled} onChange={event=>onChange(schedules.find(schedule=>schedule.id===event.target.value)??null)}>
  <option value="">{t('Not a scheduled payment')}</option>
  {schedules.map(schedule=><option key={schedule.id} value={schedule.id}>{schedule.name} · {formatMoney(schedule.amount,schedule.currency,locale)} · {t(frequencyLabels[schedule.frequency])}</option>)}
 </NativeSelect></label>;
}
