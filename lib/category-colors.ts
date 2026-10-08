import type { Kind } from './finance';
import { paletteColors, paletteHue, type PaletteColor } from './business';
// Stable colors shared by badges and category charts; never derive from row order.
export type CategoryKind = Kind | 'Groceries' | 'Family support' | 'Household' | 'Other';
export const categoryHues: Record<CategoryKind, number> = {
  Groceries: 48, 'Family support': 195, Household: 270, Other: 330,
  // Asset kinds share the allocation bar, so their hues sit at least ~30° apart.
  Cash: 145, Stock: 210, Crypto: 32, Deposit: 180, 'Treasury bill': 245,
  Property: 275, Business: 62, Valuables: 320, 'Money lent': 100,
  // Added later; each sits between the hues above rather than on top of one.
  'Precious metals': 45, 'Equity compensation': 225, Bond: 195, 'Retirement account': 260, Vehicle: 5,
  Mortgage: 350, Loan: 15, Debt: 0,
  Salary: 120, 'Rent income': 165, 'Business income': 62, 'Other income': 85,
  'Rent expense': 310, 'Living expense': 48, Charity: 290, 'Other expense': 330,
};
export function categoryHue(kind:string){ if(Object.hasOwn(categoryHues,kind))return categoryHues[kind as CategoryKind]; let hash=0;for(const char of kind)hash=(hash*31+char.charCodeAt(0))>>>0;return hash%360; }
export const categoryColor = (kind: string) => hueColor(categoryHue(kind));
export const hueColor = (hue: number) => `hsl(${hue} 60% 48%)`;
/** Ten hues far apart, for things that have no colour of their own (merchants), coloured by their place in a ranking. */
export const rankHues = [210, 30, 150, 280, 50, 340, 185, 100, 250, 0];
export const rankColor = (index: number) => hueColor(rankHues[index % rankHues.length]);
/** Colours a person may give a category: the palette's hues, without grey, which a tinted badge cannot show. */
export const categoryPaletteColors = paletteColors.filter(color => color !== 'slate');
export type CategoryColors = Record<string, PaletteColor>;
export const isCategoryPaletteColor = (color: string): color is PaletteColor => (categoryPaletteColors as string[]).includes(color);
/** The hue shown for a category (a built-in name, an added category's id or its name): the colour chosen for it, else its stable default. */
export function chosenCategoryHue(kind: string, colors: CategoryColors, categories: readonly { id: string; name: string }[] = []): number {
 const id = Object.hasOwn(colors, kind) ? kind : categories.find(category => category.name === kind)?.id;
 const chosen = id !== undefined && Object.hasOwn(colors, id) ? colors[id] : undefined;
 return chosen && isCategoryPaletteColor(chosen) ? paletteHue(chosen) : categoryHue(kind);
}
