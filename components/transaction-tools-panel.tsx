"use client";
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Pencil } from 'lucide-react';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { DeleteCategoryDialog } from '@/components/delete-category-dialog';
import { useState, type CSSProperties } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { CategoryIconPicker } from '@/components/category-icon-picker';
import { EditCategoryDialog } from '@/components/edit-category-dialog';
import type { CategoryIconsController, CategoryLookChange } from '@/hooks/use-category-icons';
import type { RemovedCategoriesController } from '@/hooks/use-removed-categories';
import { canRemoveCategory, offeredKinds } from '@/lib/removed-categories';
import { categoryHue, chosenCategoryHue } from '@/lib/category-colors';
import { categoryEmoji } from '@/lib/category-icons';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDiscardChanges, useUnsavedNavigation } from '@/components/discard-changes';
import { formatMoney } from '@/lib/format';
import { decimalTotalEquals } from '@/lib/decimal-amounts';
import type { Category } from '@/lib/planning';
import { income, type Entry } from '@/lib/finance';
import type { TransactionTools } from '@/lib/transaction-tools';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { useDisplayOrder } from '@/hooks/use-display-order';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { categoryNameTaken, duplicateCategoryMessage } from '@/lib/category-names';
import { categoryChoices } from '@/lib/transaction-rules';
export type ToolsController={data:TransactionTools;loading:boolean;error:string;save:(action:string,data:unknown)=>Promise<void>;retry:()=>void};
type CategoryItem={id:string;name:string;direction:Category['direction'];category?:Category};
export function TransactionToolsPanel({categories,saveCategory,icons,removed,loading,error,onRetry,onDeleted,preferences,owner,demo}:{categories:Category[];saveCategory:(name:string,direction:Category['direction'],id?:string)=>Promise<string>;icons:CategoryIconsController;removed:RemovedCategoriesController;loading:boolean;error:string;onRetry:()=>void;onDeleted:()=>void;preferences:PreferenceResource;owner:string|null;demo:boolean}){
 const {t}=useLanguage();const [deleting,setDeleting]=useState<Category|null>(null);
 // Built-in categories are listed by name and added ones by id, in the order the person drags them into.
 const items:CategoryItem[]=[...offeredKinds('income',removed.kinds).map(kind=>({id:kind,name:kind,direction:'income' as const})),...offeredKinds('expense',removed.kinds).map(kind=>({id:kind,name:kind,direction:'expense' as const})),...categories.map(category=>({id:category.id,name:category.name,direction:category.direction,category}))];
 const order=useDisplayOrder('category_order',items,preferences,owner,demo);
 return <section id="categories" className="panel tools-panel category-settings"><h2>{t('Categories')}<InfoHint>{t('Add income and expense categories to use when recording transactions.')}</InfoHint></h2>
 {error&&<InlineError message={t(error)} onRetry={onRetry}/>}
 {(['income','expense'] as const).map(direction=><CategoryGroup key={direction} direction={direction} items={order.items.filter(item=>item.direction===direction)} categories={categories} onMove={order.reorder} moveDisabled={order.disabled||loading||!!error} saveCategory={saveCategory} icons={icons} disabled={loading||!!error} removed={removed.kinds} onDelete={category=>{if(demo&&!categories.includes(category))removed.hideForVisit(category.id);else setDeleting(category);}}/>)}
 <ErrorPopup message={order.error}/>
 {deleting&&<DeleteCategoryDialog key={deleting.id} category={deleting} categories={categories} removed={removed.kinds} onClose={()=>setDeleting(null)} onDeleted={()=>{if(!categories.includes(deleting))removed.deleted(deleting.id);onDeleted();}}/>}
 </section>;
}
/** One direction's categories. Deleting a built-in one passes it on as a category whose id is its kind. */
function CategoryGroup({direction,items,categories,onMove,moveDisabled,saveCategory,icons,disabled,removed,onDelete}:{direction:Category['direction'];items:CategoryItem[];categories:Category[];onMove:(id:string,target:string,visible:string[])=>void;moveDisabled:boolean;saveCategory:(name:string,direction:Category['direction'],id?:string)=>Promise<string>;icons:CategoryIconsController;disabled:boolean;removed:readonly string[];onDelete:(category:Category)=>void}){
 const {t}=useLanguage();const [name,setName]=useState(''),[icon,setIcon]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState<CategoryItem|null>(null);const hueOf=(id:string)=>chosenCategoryHue(id,icons.colors??{});
 const emojiOf=(item:CategoryItem)=>icons.emojiOf(item.category?item.name:item.id);
 // Tapping a pill edits its icon and, for an added category, its name; the name is saved before the icon.
 const saveEdit=async(item:CategoryItem,{name:renamed,...look}:CategoryLookChange&{name?:string})=>{if(renamed)await saveCategory(renamed,direction,item.id);if(look.icon!==undefined||look.color!==undefined)await icons.update(item.id,look);};
 const confirmation=useUnsavedNavigation(!!name.trim());
 const label=(item:CategoryItem)=>item.category?item.name:t(item.name);
 const ids=items.map(item=>item.id);
 // Names differing only in letter case would look like the same category in every list.
 const taken=categoryNameTaken(name,direction,categories,items.filter(item=>!item.category).map(label));
 return <section className="category-group"><h3>{t(direction==='income'?'Income categories':'Expense categories')}</h3>
 {/* One row per category, like the reference app: handle, icon tile, name and Edit; the whole row opens the editor. */}
 <SortableList id={`categories-${direction}`} items={ids} nameOf={id=>{const item=items.find(entry=>entry.id===id);return item?label(item):'';}} onMove={(moved,over)=>onMove(moved,over,ids)} disabled={moveDisabled}>
 <ul className="category-rows">{items.map(item=><SortableItem as="li" key={item.id} id={item.id} label={label(item)}><button type="button" className="category-edit-button" disabled={disabled} aria-label={t('Edit {name}',{name:label(item)})} onClick={()=>setEditing(item)}><span className="category-icon" data-size="sm" style={{'--category-hue':hueOf(item.id)} as CSSProperties} aria-hidden="true">{emojiOf(item)}</span><span className="category-row-name">{label(item)}</span><span className="category-row-edit" aria-hidden="true"><Pencil size={14} className="category-edit-icon"/>{t('Edit')}</span></button></SortableItem>)}</ul>
 </SortableList>
 <form className="category-create-form" onSubmit={async event=>{event.preventDefault();if(disabled||busy||!name.trim()||taken)return;setBusy(true);setError('');try{const id=await saveCategory(name.trim(),direction);if(icon)await icons.choose(id,icon);setName('');setIcon(null);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <CategoryIconPicker icon={icon??categoryEmoji(name)} label={t('Choose an icon')} chosen={!!icon} disabled={busy||icons.disabled} onChoose={setIcon}/>
 <label>{t(direction==='income'?'New income category':'New expense category')}<Input required maxLength={80} value={name} disabled={busy} aria-invalid={taken||undefined} placeholder={t(direction==='income'?'e.g. Freelance':'e.g. Leisure')} onChange={event=>setName(event.target.value)}/></label>
 <Button disabled={disabled||busy||!name.trim()||taken} title={!name.trim()&&!disabled?t('Enter a name.'):undefined}>{t(busy?'Saving…':direction==='income'?'Add income category':'Add expense category')}</Button></form>
 {taken&&<p className="error" role="alert">{t(duplicateCategoryMessage)}</p>}
 <ErrorPopup message={error}/>{confirmation}
 {editing&&<EditCategoryDialog key={editing.id} item={{...editing,label:label(editing)}} icon={emojiOf(editing)} chosen={Object.hasOwn(icons.icons,editing.id)} color={icons.colors[editing.id]??null} defaultHue={categoryHue(editing.id)} iconsDisabled={icons.disabled} categories={categories} builtInNames={items.filter(item=>!item.category).map(label)} onSave={change=>saveEdit(editing,change)} onDelete={canRemoveCategory(editing.id,direction,categories,removed)?()=>{const category=editing.category??{id:editing.id,name:t(editing.name),direction};setEditing(null);onDelete(category);}:undefined} onClose={()=>setEditing(null)}/>}</section>;
}
export function SplitTransactionDialog({record,tools,categories,removed=[],onClose}:{record:Entry;tools:ToolsController;categories:Category[];removed?:readonly string[];onClose:()=>void}){
 const {t,locale}=useLanguage();const [initial]=useState(()=>tools.data.splits.filter(part=>part.record_id===record.id).map(({category_id,amount})=>({category_id,amount:Number(amount)})));
 const [parts,setParts]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guard=useDiscardChanges(JSON.stringify(parts)!==JSON.stringify(initial),onClose,busy);
 const valid=parts.length===0||(parts.length>=2&&parts.every(part=>part.category_id&&part.amount>0)&&decimalTotalEquals(parts.map(part=>part.amount),record.amount));
 return <><Dialog open onOpenChange={open=>{if(!open)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t('Split transaction')}<InfoHint>{t('Allocate the existing transaction across categories. Its total and account balance do not change.')}</InfoHint></DialogTitle><DialogDescription className="sr-only">{t('Allocate the existing transaction across categories. Its total and account balance do not change.')}</DialogDescription><p>{record.name} · {formatMoney(record.amount,record.currency,locale)}</p><form className="record-form" onSubmit={async event=>{event.preventDefault();if(!valid)return;setBusy(true);setError('');try{await tools.save('split',{record_id:record.id,splits:parts});onClose();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="tracker-fields">{parts.map((part,index)=><div className="inline-tool-form" key={index}><label>{t('Category')}<NativeSelect required value={part.category_id} onChange={event=>setParts(parts.map((item,i)=>i===index?{...item,category_id:event.target.value}:item))}><option value="">{t('Select category')}</option>{categoryChoices(categories,income.includes(record.kind)?'income':'expense',removed).map(choice=><option key={choice.category_id??choice.kind} value={choice.category_id??choice.kind}>{choice.custom?choice.name:t(choice.name)}</option>)}</NativeSelect></label><label>{t('Amount')}<FormattedNumberInput value={part.amount} max={1e15} onValueChange={amount=>setParts(parts.map((item,i)=>i===index?{...item,amount}:item))}/></label><DeleteButton variant="ghost" label={t('Remove')} onClick={()=>setParts(parts.filter((_,i)=>i!==index))}/></div>)}<Button type="button" variant="outline" disabled={parts.length>=50} onClick={()=>setParts([...parts,{category_id:'',amount:0}])}>{t('Add split')}</Button><Button type="button" variant="ghost" onClick={()=>setParts([])}>{t('Clear split')}</Button></fieldset>
 {!valid&&<p role="status">{t('Use at least two categories and make the amounts equal the transaction total.')}</p>}<ErrorPopup message={error}/><FormFooter busy={busy} onCancel={guard.close}><Button disabled={busy||!valid||!!tools.error||tools.loading}>{t(busy?'Saving…':'Save split')}</Button></FormFooter></form></DialogContent></Dialog>{guard.confirmation}</>;
}
