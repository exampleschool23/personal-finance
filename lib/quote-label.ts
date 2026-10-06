import type { Entry } from './finance';
import { formatDateTime } from './format';
import { convertAmount, instrumentFor, instrumentKey, quotedUnitPrice, type MarketData } from './market';

type Translate = (message: string, values?: Record<string, string | number>) => string;

/** Where a holding's price comes from and how fresh it is, for the record form: the quote's source and time, the
 * reason it is missing, or a prompt to pick an instrument first. */
export function quoteLabel(entry: Entry, market: MarketData | null, currency: string, t: Translate, locale: string) {
 const instrument = instrumentFor(entry), quote = instrument && market?.quotes[instrumentKey(instrument)];
 if (!instrument) return t('Select a coin or enter a stock ticker to fetch prices.');
 const price = quotedUnitPrice(entry, quote);
 if (!quote || price === null || convertAmount(price, 'USD', currency, market?.rates ?? market?.fx?.rate) === null) return t(market?.errors[instrumentKey(instrument)] || 'Saved price');
 const time = formatDateTime(quote.marketTime || quote.fetchedAt, locale);
 return t(quote.marketTime ? '{source} · Quote: {time}' : '{source} · Checked: {time}', { source: quote.source, time });
}
