import { income, expenses, type Entry } from './finance';
import type { Category } from './planning';

/** Added categories use the corresponding general cash-flow kind for calculations. */
export function selectTransactionCategory(entry:Entry, selected:string, categories:Category[], direction:Category['direction']):Entry {
 const defaults=direction==='income'?income:expenses;
 if(defaults.includes(selected))return {...entry,kind:selected as Entry['kind'],custom_category_id:null};
 const category=categories.find(item=>item.id===selected&&item.direction===direction);
 if(!category)return entry;
 return {...entry,kind:direction==='income'?'Other income':'Other expense',custom_category_id:category.id};
}
