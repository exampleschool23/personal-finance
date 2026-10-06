"use client";
import { NativeSelect } from '@/components/ui/native-select';
import { useLanguage } from '@/components/language-provider';
import { formatNumber } from '@/lib/format';
import { metals, metalUnitLabels, metalUnits, purityPresets, type MetalUnit } from '@/lib/precious-metals';
import type { Entry } from '@/lib/finance';

/** Fineness as it is stamped on a bar or coin (999.9), with the carat for gold jewellery grades. */
function purityLabel(purity: number, gold: boolean, locale: string, t: (key: string, values?: Record<string, string | number>) => string) {
 const fineness = formatNumber(purity * 1000, locale, 1);
 const carat = Math.round(purity * 24);
 return gold && Math.abs(carat / 24 - purity) < 0.002 ? t('{fineness} · {carat} carat', { fineness, carat }) : fineness;
}

/** A precious metal holding: which metal, the unit its weight is entered in and its purity. The price per unit then
 * follows the metal's spot price, so changing any of them clears the saved price until it is fetched again. */
export function MetalFields({ editing, setEditing, disabled }: { editing: Entry; setEditing: (entry: Entry) => void; disabled: boolean }) {
 const { t, locale } = useLanguage();
 const change = (patch: Partial<Entry>) => setEditing({ ...editing, ...patch, amount: 0 });
 const purity = Number(editing.metal_purity ?? 0.9999);
 const presets = purityPresets.includes(purity as typeof purityPresets[number]) ? purityPresets : [...purityPresets, purity];
 return <div className="form-grid metal-fields">
  <label>{t('Metal')}<NativeSelect disabled={disabled} value={editing.metal ?? 'XAU'} onChange={event => change({ metal: event.target.value })}>{metals.map(metal => <option key={metal.code} value={metal.code}>{t(metal.name)}</option>)}</NativeSelect></label>
  <label>{t('Weight unit')}<NativeSelect disabled={disabled} value={editing.metal_unit ?? 'g'} onChange={event => change({ metal_unit: event.target.value as MetalUnit })}>{metalUnits.map(unit => <option key={unit} value={unit}>{t(metalUnitLabels[unit])}</option>)}</NativeSelect></label>
  <label>{t('Purity')}<NativeSelect disabled={disabled} value={String(purity)} onChange={event => change({ metal_purity: Number(event.target.value) })}>{presets.map(value => <option key={value} value={String(value)}>{purityLabel(value, (editing.metal ?? 'XAU') === 'XAU', locale, t)}</option>)}</NativeSelect></label>
 </div>;
}
