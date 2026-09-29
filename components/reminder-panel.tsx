"use client";
import { ErrorPopup } from '@/components/error-popup';
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {Button} from '@/components/ui/button';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
import {formatDate,formatMoney} from '@/lib/format';
import {depositToday} from '@/lib/deposit-interest';
import type {PlanningData} from '@/lib/planning';
import {dueReminders,type ReminderSettings} from '@/lib/daily-finance';
export function ReminderPanel({data,preferences}:{data:PlanningData;preferences:PreferenceResource}){
 const {t,locale}=useLanguage(),today=depositToday();const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const settings:ReminderSettings=preferences.data.preferences.find(p=>p.key==='reminders')?.data??{enabled:true,days_ahead:7,snoozed:[]};
 const reminders=dueReminders(data,settings,today);
 async function save(next:ReminderSettings){setBusy(true);setError('');try{await preferences.save({key:'reminders',data:next});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="panel tools-panel reminders-panel"><summary><h2>{t('Reminders')}</h2></summary><p className="muted">{t('Shown when you open the app. No email or push messages are sent, and reminders never record payments.')}</p>
 <ul className="tool-list">{reminders.map(item=><li key={item.key}><div><strong>{item.record.name}</strong><p>{formatDate(item.date,locale)} · {formatMoney(item.record.amount,item.record.currency,locale)} · {t(item.overdue?'Overdue':'Upcoming')}</p></div><div className="entry-actions"><Button variant="outline" disabled={busy} onClick={()=>void save({...settings,snoozed:[...settings.snoozed.filter(s=>s.key!==item.key&&s.until>today).slice(-499),{key:item.key,until:new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10)}]})}>{t('Snooze until tomorrow')}</Button></div></li>)}</ul>{settings.enabled&&!reminders.length&&<p>{t('No reminders in this period.')}</p>}<ErrorPopup message={error}/></details>;
}
