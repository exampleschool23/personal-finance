import { expenses, income } from './finance';
import type { Category } from './planning';

const key = (name: string) => name.trim().toLocaleLowerCase();

/** Whether a new category name repeats a built-in or added category of the same type, ignoring letter case and spaces.
 * `labels` adds the translated names of the built-in categories shown to the person. */
export function categoryNameTaken(name: string, direction: Category['direction'], categories: readonly Pick<Category, 'id' | 'name' | 'direction'>[], labels: readonly string[] = [], except?: string): boolean {
 const wanted = key(name);
 if (!wanted) return false;
 const builtIn = direction === 'income' ? income : expenses;
 return [...builtIn, ...labels].some(label => key(label) === wanted)
  || categories.some(category => category.direction === direction && category.id !== except && key(category.name) === wanted);
}

export const duplicateCategoryMessage = 'A category with this name already exists.';
