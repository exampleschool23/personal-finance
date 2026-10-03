"use client";
import { useMemo, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useLanguage } from '@/components/language-provider';
import { countryOptions } from '@/lib/countries';
import { countryFlag, dialCode, dialLabel, phoneCountries, splitInternational } from '@/lib/phone-countries';
import styles from './sign-in-screen.module.css';

/** A phone number as a country (flag and dialing code, searchable by name or code) and the number within it. Pasting +998… picks the country. */
export function PhoneNumberField({ id, country, national, onChange }: { id: string; country: string; national: string; onChange: (country: string, national: string) => void }) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const countries = useMemo(() => { const dialable = new Set(phoneCountries); return countryOptions(locale).filter(item => dialable.has(item.code)); }, [locale]);
  const search = query.trim().toLowerCase().replace(/^\+/, '');
  const matches = search ? countries.filter(item => item.name.toLowerCase().includes(search) || item.code.toLowerCase() === search || dialCode(item.code).startsWith(search.replace(/\s/g, ''))) : countries;
  const name = countries.find(item => item.code === country)?.name;
  function type(value: string) {
    const split = splitInternational(value, country);
    if (split) onChange(split.country, split.national); else onChange(country, value.replace(/[^\d\s()-]/g, ''));
  }
  return <div className={styles.phoneField}>
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(''); }}>
      <PopoverTrigger asChild><Button type="button" variant="outline" className={styles.countryTrigger} role="combobox" aria-expanded={open} aria-controls={open ? id + '-countries' : undefined} aria-label={name ? `${t('Country code')}: ${name} ${dialLabel(country)}` : t('Country code')}>
        {country ? <span className={styles.flag} aria-hidden="true">{countryFlag(country)}</span> : <Globe size={18} aria-hidden="true"/>}<span dir="ltr">{country ? dialLabel(country) : '+'}</span><ChevronDown size={14} aria-hidden="true"/>
      </Button></PopoverTrigger>
      <PopoverContent align="start" className={styles.countryPopover}>
        <Command shouldFilter={false}>
          <CommandInput aria-label={t('Search countries')} placeholder={t('Search countries')} value={query} onValueChange={setQuery} maxLength={60}/>
          <CommandList id={id + '-countries'} aria-label={t('Country code')}>
            <CommandEmpty>{t('No matching countries.')}</CommandEmpty>
            <CommandGroup>{matches.map(item => <CommandItem key={item.code} value={item.code} onSelect={() => { onChange(item.code, national); setOpen(false); setQuery(''); }} className={styles.countryOption}>
              <span className={styles.flag} aria-hidden="true">{countryFlag(item.code)}</span><span className={styles.countryName}>{item.name}</span><span className={styles.countryDial} dir="ltr">{dialLabel(item.code)}</span>{item.code === country && <Check size={16} aria-hidden="true"/>}
            </CommandItem>)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <Input id={id} name="phone" type="tel" dir="ltr" required autoComplete="tel-national" inputMode="tel" autoFocus value={national} onChange={event => type(event.target.value)}/>
  </div>;
}
