"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import { fetchMarket } from '@/hooks/use-market';
import type { Entry } from '@/lib/finance';
import { convertAmount, instrumentFor, instrumentKey, quotedUnitPrice, marketRates } from '@/lib/market';

/** The record form's "fetch price": the current quote of the holding being edited, in its own currency. A failure
 * message belongs to the holding it was for and disappears once its name or currency changes. */
export function usePriceFetch(editing: Entry | null, setEditing: Dispatch<SetStateAction<Entry | null>>) {
    const [fetchingPrice, setFetchingPrice] = useState(false);
    const priceKey = JSON.stringify([editing?.id, editing?.name, editing?.currency, editing?.metal, editing?.metal_unit, editing?.metal_purity]);
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
            const price = quotedUnitPrice(target, data.quotes[instrumentKey(instrument)]);
            if (price === null) throw Error(data.errors[instrumentKey(instrument)] || 'Price unavailable. Saved price is shown.');
            const amount = convertAmount(price, 'USD', target.currency, marketRates(data));
            if (amount === null) throw Error('Exchange rate unavailable.');
            setEditing(current => current?.id === target.id && current.name === target.name && current.currency === target.currency && current.kind === target.kind && current.metal === target.metal && current.metal_unit === target.metal_unit && current.metal_purity === target.metal_purity ? { ...current, amount } : current);
        } catch (error) { setPriceMessage((error as Error).message); }
        finally { setFetchingPrice(false); }
    }
    const resetPrice = () => setPriceResult({key:'',message:''});
    return { fetchPrice, fetchingPrice, priceMessage, resetPrice };
}
