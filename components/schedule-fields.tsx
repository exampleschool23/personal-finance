"use client";
import {NativeSelect} from '@/components/ui/native-select';
import {FormattedNumberInput} from '@/components/formatted-number-input';
import {useLanguage} from '@/components/language-provider';
import {frequencies,frequencyLabels,type Frequency} from '@/lib/finance';
export function ScheduleFields({frequency,days,onChange,once=false,disabled=false}:{frequency:Frequency;days?:number|null;onChange:(frequency:Frequency,days:number|null)=>void;once?:boolean;disabled?:boolean}){
 const {t}=useLanguage();
 return <><label>{t('Repeats')}<NativeSelect disabled={disabled} value={frequency} onChange={e=>{const f=e.target.value as Frequency;onChange(f,f==='Custom'?days??1:null);}}>{frequencies.filter(f=>once||f!=='Once').map(f=><option key={f} value={f}>{t(frequencyLabels[f])}</option>)}</NativeSelect></label>{frequency==='Custom'&&<label>{t('Days between occurrences')}<FormattedNumberInput value={days??1} max={366} onValueChange={n=>onChange(frequency,n)}/></label>}</>;
}
