"use client";
import { useState, type CSSProperties } from 'react';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { CategoryIconPicker } from '@/components/category-icon-picker';
import { useDiscardChanges } from '@/components/discard-changes';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { categoryNameTaken, duplicateCategoryMessage } from '@/lib/category-names';
import type { Category } from '@/lib/planning';
import { categoryPaletteColors, hueColor } from '@/lib/category-colors';
import { paletteColor, paletteLabels, type PaletteColor } from '@/lib/business';
import type { CategoryLookChange } from '@/hooks/use-category-icons';

type Props={
 /** The category being edited; a built-in one has no `category` and keeps its translated name. */
 item:{id:string;label:string;direction:Category['direction'];category?:Category};
 icon:string;chosen:boolean;
 /** The colour chosen for it, if any, and the hue it has without one. */
 color:PaletteColor|null;defaultHue:number;iconsDisabled:boolean;categories:Category[];builtInNames:string[];
 onSave:(change:CategoryLookChange&{name?:string})=>Promise<void>;onDelete?:()=>void;onClose:()=>void;
};

/** Edits a category's icon, colour and, for an added category, its name, in one form. Delete lives here too. */
export function EditCategoryDialog({item,icon,chosen,color,defaultHue,iconsDisabled,categories,builtInNames,onSave,onDelete,onClose}:Props){
 const {t}=useLanguage();
 const [name,setName]=useState(item.label),[nextIcon,setNextIcon]=useState<string|null|undefined>(undefined),[nextColor,setNextColor]=useState<PaletteColor|null>(color),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const renamed=!!item.category&&name.trim()!==item.category.name;
 const recoloured=nextColor!==color;
 const dirty=renamed||nextIcon!==undefined||recoloured;
 const taken=renamed&&categoryNameTaken(name,item.direction,categories,builtInNames,item.id);
 const guard=useDiscardChanges(dirty,onClose,busy);
 const shownIcon=nextIcon===undefined?icon:nextIcon??icon;
 async function submit(event:{preventDefault:()=>void}){
  event.preventDefault();if(busy||!dirty||taken||!name.trim())return;
  setBusy(true);setError('');
  try{await onSave({...(renamed?{name:name.trim()}:{}),...(nextIcon!==undefined?{icon:nextIcon}:{}),...(recoloured?{color:nextColor}:{})});onClose();}
  catch(reason){setError((reason as Error).message);}
  finally{setBusy(false);}
 }
 return <><Dialog open onOpenChange={open=>{if(!open)guard.close();}}><DialogContent className="record-dialog category-edit-dialog" showCloseButton={!busy} aria-describedby={undefined}>
  <DialogTitle>{t('Edit {name}',{name:item.label})}</DialogTitle>
  <form className="record-form" onSubmit={submit}>
   <div className="category-edit-fields">
    <CategoryIconPicker icon={shownIcon} label={t('Change icon for {name}',{name:item.label})} chosen={nextIcon===undefined?chosen:nextIcon!==null} disabled={busy||iconsDisabled} onChoose={setNextIcon}/>
    <label>{t('Name')}<Input required maxLength={80} value={name} disabled={busy||!item.category} aria-invalid={taken||undefined} onChange={event=>setName(event.target.value)}/></label>
   </div>
   <fieldset className="business-color-field category-color-field" disabled={busy||iconsDisabled}><legend>{t('Colour')}</legend>
    <div role="radiogroup" aria-label={t('Colour')}>
     <button type="button" role="radio" aria-checked={nextColor===null} aria-label={t('Automatic')} style={{'--swatch':hueColor(defaultHue)} as CSSProperties} onClick={()=>setNextColor(null)}/>
     {categoryPaletteColors.map(option=><button key={option} type="button" role="radio" aria-checked={nextColor===option} aria-label={t(paletteLabels[option])} style={{'--swatch':paletteColor(option)} as CSSProperties} onClick={()=>setNextColor(option)}/>)}
    </div>
   </fieldset>
   {taken&&<p role="alert" className="error">{t(duplicateCategoryMessage)}</p>}
   <ErrorPopup message={error}/>
   <FormFooter busy={busy} onCancel={guard.close}>
    {onDelete&&<Button type="button" variant="destructive" className="category-edit-delete" disabled={busy} onClick={onDelete}>{t('Delete')}</Button>}
    <Button disabled={busy||!dirty||taken||!name.trim()}>{t(busy?'Saving…':'Save')}</Button>
   </FormFooter>
  </form>
 </DialogContent></Dialog>{guard.confirmation}</>;
}
