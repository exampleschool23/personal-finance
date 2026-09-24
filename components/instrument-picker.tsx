"use client";
import { useId, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useLanguage } from '@/components/language-provider';
import { instrumentFor } from '@/lib/market';
import { customStockSymbol, instrumentOptions, matchingInstruments } from '@/lib/instrument-catalog';

export function InstrumentPicker({kind,value,onChange,disabled=false,actionLabel,excludedSymbols=[]}:{actionLabel?:string;excludedSymbols?:string[];kind:'Crypto'|'Stock';value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const {t}=useLanguage();
 const id=useId();
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const symbol=instrumentFor({kind,name:value})?.symbol;
 const selected=instrumentOptions(kind).find(item=>item.symbol===symbol);
 const allMatches=matchingInstruments(kind,query);
 const matches=allMatches.filter(item=>!excludedSymbols.includes(item.symbol));
 const custom=kind==='Stock'&&!allMatches.length?customStockSymbol(query):null;
 const label=t(kind==='Crypto'?'Coin':'Stock or ETF (USD-listed)');
 function select(next:string){onChange(next);setOpen(false);setQuery('');}
 return <div className={actionLabel?"instrument-field instrument-add":"instrument-field"}>
  <label className={actionLabel?"sr-only":undefined} id={id+'-label'} htmlFor={id}>{label}</label>
  <Popover open={open} onOpenChange={next=>{setOpen(next);if(!next)setQuery('');}}>
   <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-controls={open?id+'-list':undefined} aria-labelledby={id+'-label '+id+'-value'} disabled={disabled} className={actionLabel?"instrument-trigger instrument-add-trigger":"instrument-trigger"}>
    {actionLabel&&<Plus size={16} aria-hidden="true"/>}<span id={id+'-value'}>{actionLabel??(selected?`${selected.name} (${selected.symbol})`:value||t(kind==='Crypto'?'Select a coin':'Select a stock or ETF'))}</span>{!actionLabel&&<ChevronsUpDown aria-hidden="true" size={16}/>}
   </Button></PopoverTrigger>
   <PopoverContent align="start" className="instrument-popover">
    <Command shouldFilter={false}>
     <CommandInput aria-label={t('Search by name or symbol')} placeholder={t('Search by name or symbol')} value={query} onValueChange={setQuery} maxLength={120}/>
     <CommandList id={id+'-list'} aria-label={label}>
      {(!custom||excludedSymbols.includes(custom))&&<CommandEmpty>{t('No matching instruments.')}</CommandEmpty>}
      <CommandGroup>{matches.map(item=><CommandItem key={item.symbol} value={item.symbol} onSelect={()=>select(item.value)} className="instrument-option"><span><strong>{item.symbol}</strong><span>{item.name}</span></span>{item.symbol===symbol&&<Check size={16} aria-hidden="true"/>}</CommandItem>)}</CommandGroup>
      {custom&&!excludedSymbols.includes(custom)&&<CommandGroup heading={t('Other ticker')}><CommandItem value={'custom:'+custom} onSelect={()=>select(custom)}>{t('Use ticker {symbol}',{symbol:custom})}</CommandItem></CommandGroup>}
     </CommandList>
    </Command>
    <p className="instrument-help">{t(kind==='Crypto'?'Prices depend on market-data availability. You can always enter a price manually.':'Choose a USD-listed stock or ETF, or type another ticker. Live stock prices require a configured price feed.')}</p>
   </PopoverContent>
  </Popover>
 </div>;
}
