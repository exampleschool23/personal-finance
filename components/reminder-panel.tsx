"use client";
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {Button} from '@/components/ui/button';
import {PanelTitle} from '@/components/presentation-foundation/panel-title';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
import {formatDate} from '@/lib/format';
import {useDisplayMoney} from '@/components/display-money';
import {shiftDay} from '@/lib/calendar-days';
import {depositToday} from '@/lib/deposit-interest';
import type {PlanningData} from '@/lib/planning';
import {dueReminders,type ReminderSettings} from '@/lib/daily-finance';
export function ReminderPanel({data,preferences}:{data:PlanningData;preferences:PreferenceResource}){
 const {t,locale}=useLanguage(),{entered}=useDisplayMoney(),today=depositToday();const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const settings:ReminderSettings=preferences.data.preferences.find(p=>p.key==='reminders')?.data??{enabled:true,days_ahead:7,snoozed:[]};
 const reminders=dueReminders(data,settings,today),shown=reminders.map(item=>entered(item.amount,item.record.currency));
 async function save(next:ReminderSettings){setBusy(true);setError('');try{await preferences.save({key:'reminders',data:next});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 // It has a tab of its own on Recurring, so it is a plain panel; the explanation sits behind the ⓘ.
 return <section className="panel tools-panel reminders-panel"><PanelTitle title={t('Reminders')} hint={t('Shown when you open the app. Connect Telegram in Settings for a morning digest. Reminders never record payments.')}/>
 <ul className="tool-list">{reminders.map((item,index)=><li key={item.key}><div><strong>{item.record.name}</strong><p>{formatDate(item.date,locale)} · {shown[index]} · {t(item.overdue?'Overdue':'Upcoming')}</p></div><div className="entry-actions"><Button variant="outline" disabled={busy} onClick={()=>void save({...settings,snoozed:[...settings.snoozed.filter(s=>s.key!==item.key&&s.until>today).slice(-499),{key:item.key,until:shiftDay(today,1)}]})}>{t('Snooze until tomorrow')}</Button></div></li>)}</ul>{shown.includes('—')&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}{settings.enabled&&!reminders.length&&<p>{t('No reminders in this period.')}</p>}<ErrorPopup message={error}/></section>;
}
