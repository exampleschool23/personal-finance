"use client";
import { useRef, useState, type CSSProperties } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { businessStructureLabels, businessStructures, paletteColor, paletteColors, paletteLabels, type BusinessStructure } from '@/lib/business';
import type { Entry } from '@/lib/finance';

/** A picture shrunk to a small square data URL that fits the database limit, or an error message. */
async function logoFrom(file: File): Promise<string> {
 if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choose a PNG, JPEG or WebP image.');
 const bitmap = await createImageBitmap(file);
 const side = 128, canvas = document.createElement('canvas');
 canvas.width = side; canvas.height = side;
 const context = canvas.getContext('2d');
 if (!context) throw Error('Could not read this image.');
 const scale = Math.max(side / bitmap.width, side / bitmap.height);
 context.drawImage(bitmap, (side - bitmap.width * scale) / 2, (side - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
 for (const quality of [.85, .7, .5]) {
  const url = canvas.toDataURL('image/webp', quality);
  if (url.startsWith('data:image/webp') && url.length <= 60000) return url;
 }
 const fallback = canvas.toDataURL('image/jpeg', .6);
 if (fallback.length > 60000) throw Error('This image is too large. Choose a smaller one.');
 return fallback;
}

type Profile = Pick<Entry, 'name' | 'business_structure' | 'business_color' | 'business_logo'>;
/** A business's legal structure, colour and logo. */
export function BusinessProfileFields({ value, onChange, disabled }: { value: Profile; onChange: (patch: Partial<Profile>) => void; disabled?: boolean }) {
 const { t } = useLanguage();
 const file = useRef<HTMLInputElement>(null);
 const [error, setError] = useState('');
 return <div className="business-profile-fields">
  <label>{t('Legal structure')}<NativeSelect disabled={disabled} value={value.business_structure ?? ''} onChange={event => onChange({ business_structure: (event.currentTarget.value || null) as BusinessStructure | null })}>
   <option value="">{t('Not set')}</option>
   {businessStructures.map(structure => <option key={structure} value={structure}>{t(businessStructureLabels[structure])}</option>)}
  </NativeSelect></label>
  <fieldset className="business-color-field" disabled={disabled}><legend>{t('Colour')}</legend>
   <div role="radiogroup" aria-label={t('Colour')}>{paletteColors.map(color => <button key={color} type="button" role="radio" aria-checked={(value.business_color ?? 'slate') === color} aria-label={t(paletteLabels[color])} style={{ '--swatch': paletteColor(color) } as CSSProperties} onClick={() => onChange({ business_color: color })}/>)}</div>
  </fieldset>
  <div className="business-logo-field"><span>{t('Logo (optional)')}</span>
   <div><BusinessMark name={value.name || '?'} color={value.business_color} logo={value.business_logo} size="lg"/>
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async event => { const picked = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!picked) return; setError(''); try { onChange({ business_logo: await logoFrom(picked) }); } catch (reason) { setError(t((reason as Error).message || 'Could not read this image.')); } }}/>
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => file.current?.click()}><ImagePlus size={15} aria-hidden="true"/>{t(value.business_logo ? 'Change logo' : 'Upload logo')}</Button>
    {value.business_logo && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ business_logo: null })}><X size={15} aria-hidden="true"/>{t('Remove')}</Button>}
   </div>
   {error && <p className="form-error" role="alert">{error}</p>}
  </div>
 </div>;
}
