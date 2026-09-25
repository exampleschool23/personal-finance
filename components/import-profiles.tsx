"use client";
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
import type {ColumnMapping} from '@/lib/csv';
export function ImportProfiles({mapping,delimiter,apply,preferences}:{mapping:ColumnMapping;delimiter:string;apply:(mapping:ColumnMapping,delimiter:string)=>void;preferences:PreferenceResource}){
 const {t}=useLanguage();const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const profiles=preferences.data.preferences.find(p=>p.key==='import_profiles')?.data.items??[];
 return <details className="import-profiles"><summary>{t('Saved statement mappings')}</summary>{preferences.error?<p role="alert">{t(preferences.error)} <Button onClick={preferences.retry}>{t('Retry')}</Button></p>:<><div className="entry-actions import-profile-list">{profiles.map(profile=><Button key={profile.id} variant="outline" type="button" disabled={busy||preferences.loading} onClick={()=>apply(profile.mapping,profile.delimiter)}>{profile.name}</Button>)}</div><form className="inline-tool-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const existing=profiles.find(p=>p.name===name.trim());await preferences.save({key:'import_profiles',data:{items:[...profiles.filter(p=>p.id!==existing?.id),{id:existing?.id??crypto.randomUUID(),name,delimiter:delimiter as ','|';'|'\t',mapping}]}});setName('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>{t('Mapping name')}<Input value={name} required maxLength={80} onChange={event=>setName(event.target.value)}/></label><Button disabled={busy||preferences.loading||!name.trim()}>{t('Save current mapping')}</Button></form><p className="muted">{t('Saving the same mapping name replaces its column settings. Verify the preview whenever a bank changes its file format.')}</p></>}{error&&<p role="alert">{t(error)}</p>}</details>;
}
