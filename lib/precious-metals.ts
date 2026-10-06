import { formatNumber } from './format';
import { isMetalUnit, type MetalUnit } from './market';
export { gramsPerTroyOunce, isMetalCode, isMetalUnit, metalCodes, metalUnitPrice, metalUnits, type MetalCode, type MetalUnit } from './market';

// Precious metals are held by weight. A holding stores its metal, the weight unit it was entered in and its
// purity (999.9 gold is 0.9999); its price per unit is the spot price of one troy ounce of fine metal scaled to
// that unit and purity, so value = units × price per unit like any other holding (migration 116).
export const metals = [
 { code: 'XAU', name: 'Gold' },
 { code: 'XAG', name: 'Silver' },
 { code: 'XPT', name: 'Platinum' },
 { code: 'XPD', name: 'Palladium' },
] as const;
export const metalUnitLabels: Record<MetalUnit, string> = { oz: 'Troy ounces', g: 'Grams', kg: 'Kilograms' };
/** Common fineness marks: bullion, 22-carat gold, sterling and coin silver, then 18- and 14-carat gold. */
export const purityPresets = [0.9999, 0.999, 0.9167, 0.925, 0.9, 0.75, 0.585] as const;
export const metalName = (code: string | null | undefined) => metals.find(metal => metal.code === code)?.name ?? '';

const weightTemplates: Record<MetalUnit, string> = { oz: '{quantity} troy oz', g: '{quantity} g', kg: '{quantity} kg' };
/** A holding's weight as a row reads it: "100 g", "2.5 troy oz". */
export function metalWeight(record: { quantity: number; metal_unit?: string | null }, locale: string, t: (key: string, values?: Record<string, string | number>) => string) {
 const unit = isMetalUnit(record.metal_unit) ? record.metal_unit : 'oz';
 return t(weightTemplates[unit], { quantity: formatNumber(record.quantity, locale) });
}
