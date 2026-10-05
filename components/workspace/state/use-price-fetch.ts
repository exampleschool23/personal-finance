"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import { fetchMarket } from '@/hooks/use-market';
import type { Entry } from '@/lib/finance';
import { convertAmount, instrumentFor, instrumentKey } from '@/lib/market';

/** The record form's "fetch price": the current quote of the holding being edited, in its own currency. A failure
 * message belongs to the holding it was for and disappears once its name or currency changes. */
export function usePriceFetch(editing: Entry | null, setEditing: Dispatch<SetStateAction<Entry | null>>) {
    const [fetchingPrice, setFetchingPrice] = useState(false);
    const priceKey = JSON.stringify([editing?.id, editing?.name, editing?.currency]);
    const [priceResult, setPriceResult] = useState({key:'',message:''});
    const priceMessage = priceResult.key === priceKey ? priceResult.message : '';
    const setPriceMessage = (message:string) => setPriceResult({key:priceKey,message});
    async function fetchPrice() {
        if (!editing) return;
        const target = editing, instrument = instrumentFor(target);
        if (!instrument) return;
        setFetchingPrice(true); setPriceMessage('');
        try {
            const data = await fetchMarket([target]);
            const quote = data.quotes[instrumentKey(instrument)];
            if (!quote) throw Error(data.errors[instrumentKey(instrument)] || 'Price unavailable. Saved price is shown.');
            const amount = convertAmount(quote.usd, 'USD', target.currency, (data.rates ?? data.fx?.rate));
            if (amount === null) throw Error('Exchange rate unavailable.');
            setEditing(current => current?.id === target.id && current.name === target.name && current.currency === target.currency && current.kind === target.kind ? { ...current, amount } : current);
        } catch (error) { setPriceMessage((error as Error).message); }
        finally { setFetchingPrice(false); }
    }
    const resetPrice = () => setPriceResult({key:'',message:''});
    return { fetchPrice, fetchingPrice, priceMessage, resetPrice };
}
