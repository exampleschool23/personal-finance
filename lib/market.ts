import type { Entry } from './finance';

// Precious metals are quoted per troy ounce of fine metal. Tests load this module directly, so the pricing
// primitives live here without imports; lib/precious-metals.ts adds the names and labels around them.
export const metalCodes = ['XAU', 'XAG', 'XPT', 'XPD'] as const;
export type MetalCode = typeof metalCodes[number];
export const metalUnits = ['oz', 'g', 'kg'] as const;
export type MetalUnit = typeof metalUnits[number];
/** Grams in one troy ounce, the unit metals are quoted in. */
export const gramsPerTroyOunce = 31.1034768;
const troyOunces: Record<MetalUnit, number> = { oz: 1, g: 1 / gramsPerTroyOunce, kg: 1000 / gramsPerTroyOunce };
export const isMetalCode = (value: unknown): value is MetalCode => metalCodes.includes(value as MetalCode);
export const isMetalUnit = (value: unknown): value is MetalUnit => metalUnits.includes(value as MetalUnit);
/** The price of one unit of a holding (one gram of 22-carat gold, say) from the spot price of a fine troy ounce. */
export function metalUnitPrice(spotPerOunce: number, unit: MetalUnit, purity: number) {
  return spotPerOunce * troyOunces[unit] * purity;
}

export const coins = [
  ['BTC', 'Bitcoin'], ['ETH', 'Ethereum'], ['SOL', 'Solana'], ['USDT', 'Tether'],
  ['USDC', 'USD Coin'], ['XRP', 'XRP'], ['DOGE', 'Dogecoin'], ['ADA', 'Cardano'],
  ['AVAX', 'Avalanche'], ['LINK', 'Chainlink'], ['LTC', 'Litecoin'], ['BCH', 'Bitcoin Cash'],
  ['DOT', 'Polkadot'], ['XLM', 'Stellar'], ['SHIB', 'Shiba Inu'], ['UNI', 'Uniswap'],
  ['TON', 'Toncoin'], ['BNB', 'BNB'], ['TRX', 'TRON'], ['SUI', 'Sui'],
  ['NEAR', 'NEAR Protocol'], ['APT', 'Aptos'], ['ATOM', 'Cosmos'], ['INJ', 'Injective'],
  ['ARB', 'Arbitrum'], ['OP', 'Optimism'], ['POL', 'Polygon'], ['AAVE', 'Aave'],
  ['ICP', 'Internet Computer'], ['FIL', 'Filecoin'], ['HBAR', 'Hedera'], ['ALGO', 'Algorand'],
  ['ETC', 'Ethereum Classic'], ['XTZ', 'Tezos'], ['XMR', 'Monero'], ['DAI', 'Dai'],
  ['WBTC', 'Wrapped Bitcoin'], ['PAXG', 'PAX Gold'], ['PEPE', 'Pepe'], ['BONK', 'Bonk'],
  ['RENDER', 'Render'], ['SEI', 'Sei'], ['STX', 'Stacks'], ['GRT', 'The Graph'],
  ['CRV', 'Curve DAO'], ['LDO', 'Lido DAO'], ['TAO', 'Bittensor'], ['JUP', 'Jupiter'],
  ['HYPE', 'Hyperliquid'], ['ZEC', 'Zcash'], ['KAS', 'Kaspa'], ['ENA', 'Ethena'],
  ['ONDO', 'Ondo'], ['WLD', 'Worldcoin'], ['TIA', 'Celestia'], ['FET', 'Artificial Superintelligence Alliance'],
  ['MNT', 'Mantle'], ['OKB', 'OKB'], ['CRO', 'Cronos'], ['BGB', 'Bitget Token'],
  ['VET', 'VeChain'], ['QNT', 'Quant'], ['IMX', 'Immutable'], ['S', 'Sonic'],
  ['EGLD', 'MultiversX'], ['MINA', 'Mina'], ['KAVA', 'Kava'], ['DASH', 'Dash'],
  ['NEO', 'Neo'], ['XDC', 'XDC Network'], ['QTUM', 'Qtum'], ['ZEN', 'Horizen'],
  ['KSM', 'Kusama'], ['ROSE', 'Oasis'], ['FLOW', 'Flow'], ['FLR', 'Flare'],
  ['CELO', 'Celo'], ['AR', 'Arweave'], ['HNT', 'Helium'], ['AKT', 'Akash Network'],
  ['RUNE', 'THORChain'], ['OSMO', 'Osmosis'], ['A', 'Vaulta'], ['BERA', 'Berachain'],
  ['IP', 'Story'], ['MON', 'Monad'], ['XPL', 'Plasma'], ['LINEA', 'Linea'],
  ['STRK', 'Starknet'], ['ZK', 'ZKsync'], ['ZRO', 'LayerZero'], ['W', 'Wormhole'],
  ['AXL', 'Axelar'], ['PYTH', 'Pyth Network'], ['JTO', 'Jito'], ['RAY', 'Raydium'],
  ['ORCA', 'Orca'], ['DRIFT', 'Drift'], ['PUMP', 'Pump.fun'], ['ME', 'Magic Eden'],
  ['SKY', 'Sky'], ['COMP', 'Compound'], ['SNX', 'Synthetix'], ['PENDLE', 'Pendle'],
  ['MORPHO', 'Morpho'], ['EIGEN', 'EigenCloud'], ['ETHFI', 'ether.fi'], ['RPL', 'Rocket Pool'],
  ['CVX', 'Convex Finance'], ['LQTY', 'Liquity'], ['YFI', 'yearn.finance'], ['BAL', 'Balancer'],
  ['SUSHI', 'SushiSwap'], ['CAKE', 'PancakeSwap'], ['AERO', 'Aerodrome Finance'], ['COW', 'CoW Protocol'],
  ['DYDX', 'dYdX'], ['GMX', 'GMX'], ['ASTER', 'Aster'], ['SYRUP', 'Maple Finance'],
  ['GNO', 'Gnosis'], ['SAFE', 'Safe'], ['ENS', 'Ethereum Name Service'], ['ZRX', '0x Protocol'],
  ['LRC', 'Loopring'], ['BAT', 'Basic Attention Token'], ['LPT', 'Livepeer'], ['ANKR', 'Ankr'],
  ['SKL', 'SKALE'], ['STORJ', 'Storj'], ['MASK', 'Mask Network'], ['NMR', 'Numeraire'],
  ['TRAC', 'OriginTrail'], ['AMP', 'Amp'], ['JASMY', 'JasmyCoin'], ['CHZ', 'Chiliz'],
  ['ATH', 'Aethir'], ['IO', 'io.net'], ['GRASS', 'Grass'], ['VIRTUAL', 'Virtuals Protocol'],
  ['KAITO', 'Kaito'], ['PLUME', 'Plume'], ['WLFI', 'World Liberty Financial'], ['ZORA', 'Zora'],
  ['SAND', 'The Sandbox'], ['MANA', 'Decentraland'], ['AXS', 'Axie Infinity'], ['APE', 'ApeCoin'],
  ['GALA', 'Gala'], ['ENJ', 'Enjin Coin'], ['SUPER', 'SuperVerse'], ['PRIME', 'Echelon Prime'],
  ['BLUR', 'Blur'], ['NOT', 'Notcoin'], ['WIF', 'dogwifhat'], ['FLOKI', 'Floki'],
  ['TRUMP', 'Official Trump'], ['PENGU', 'Pudgy Penguins'], ['POPCAT', 'Popcat'], ['FARTCOIN', 'Fartcoin'],
  ['SPX', 'SPX6900'], ['PNUT', 'Peanut the Squirrel'], ['MOG', 'Mog Coin'], ['TURBO', 'Turbo'],
  ['MEW', 'cat in a dogs world'], ['USDE', 'Ethena USDe'], ['USDS', 'Sky Dollar'], ['PYUSD', 'PayPal USD'],
  ['RLUSD', 'Ripple USD'], ['EURC', 'Euro Coin'], ['XAUT', 'Tether Gold'], ['CBETH', 'Coinbase Wrapped Staked ETH'],
  ['MSOL', 'Marinade Staked SOL'], ['JITOSOL', 'Jito Staked SOL'],
] as const;
export const coinName = (coin: readonly [string, string]) => `${coin[1]} (${coin[0]})`;
export type Instrument = { kind: 'Crypto' | 'Stock' | 'Metal'; symbol: string };
export type Quote = { usd: number; source: string; fetchedAt: string; marketTime?: string };
export type MarketData = { rates?: Record<string, number>; ratesDate?: string; fx: { rate: number; date: string; source: string } | null; quotes: Record<string, Quote>; errors: Record<string, string>; stocksConfigured: boolean };
export const instrumentKey = (instrument: Instrument) => `${instrument.kind}:${instrument.symbol}`;
/** What a holding is priced by: a coin, a USD-listed ticker (also for vested employer shares) or a metal's spot price. */
export function instrumentFor(entry: Pick<Entry, 'kind' | 'name'> & { metal?: string | null }): Instrument | null {
  if (entry.kind === 'Precious metals') return isMetalCode(entry.metal) ? { kind: 'Metal', symbol: entry.metal } : null;
  if (entry.kind === 'Crypto') {
    const name = entry.name.trim().toLowerCase();
    const coin = coins.find(c => [c[0], c[1], coinName(c)].some(v => v.toLowerCase() === name));
    return coin ? { kind: 'Crypto', symbol: coin[0] } : null;
  }
  if ((entry.kind === 'Stock' || entry.kind === 'Equity compensation') && /^[A-Z][A-Z0-9.-]{0,14}$/.test(entry.name.trim())) {
    return { kind: 'Stock', symbol: entry.name.trim() };
  }
  return null;
}
/** A holding's price per unit in USD from its quote: the quote itself, or for a metal (quoted per fine troy ounce)
 * the price of one unit of the holding's own weight and purity. Null without a usable quote. */
export function quotedUnitPrice(entry: Pick<Entry, 'kind' | 'metal_unit' | 'metal_purity'>, quote: Quote | null | undefined) {
  if (!quote || !Number.isFinite(quote.usd) || quote.usd <= 0) return null;
  if (entry.kind !== 'Precious metals') return quote.usd;
  return isMetalUnit(entry.metal_unit) && Number(entry.metal_purity) > 0 ? metalUnitPrice(quote.usd, entry.metal_unit, Number(entry.metal_purity)) : null;
}
/** The symbols to request for a set of holdings, one list per feed, without repeats. */
export function marketSymbols(entries: ReadonlyArray<Pick<Entry, 'kind' | 'name'> & { metal?: string | null }>) {
  const instruments = entries.map(instrumentFor).filter(instrument => instrument !== null);
  const of = (kind: Instrument['kind']) => [...new Set(instruments.filter(instrument => instrument.kind === kind).map(instrument => instrument.symbol))];
  return { crypto: of('Crypto'), stocks: of('Stock'), metals: of('Metal') };
}
/** A bare amount through the market feed's USD table. This file stays free of runtime imports, so it keeps its own
 * arithmetic; it matches `convertMoney` in lib/money.ts, which new code uses so an amount travels with its currency. */
export function convertAmount(amount: number, from: Entry['currency'], to: Entry['currency'], rate?: number | Record<string, number>) {
  if (from === to) return amount;
  const rates = typeof rate === 'number' ? { USD: 1, UZS: rate } as Record<string, number> : rate;
  const fromRate = from === 'USD' ? 1 : rates?.[from];
  const toRate = to === 'USD' ? 1 : rates?.[to];
  if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
  return amount / fromRate * toRate;
}
type MarketRates = Pick<MarketData, 'rates' | 'fx'>;
const tables = new WeakMap<MarketRates, Record<string, number> | undefined>();
/** The market feed's rates as one table, the shape `convertAmount` and `convertMoney` (lib/money.ts) both read: units of
 * each currency per US dollar, always with USD itself at 1, and the older single UZS rate (`fx.rate`) as {USD:1,UZS:rate}.
 * Undefined without either. The same feed object always gives the same table, so it is safe in React dependencies. */
export function marketRates(market: MarketRates | null | undefined): Record<string, number> | undefined {
  if (!market) return undefined;
  if (!tables.has(market)) tables.set(market, market.rates ? { ...market.rates, USD: 1 } : typeof market.fx?.rate === 'number' ? { USD: 1, UZS: market.fx.rate } : undefined);
  return tables.get(market);
}
export function marketEntry(entry: Entry, currency: Entry['currency'], market: MarketData | null): Entry | null {
  const instrument = instrumentFor(entry);
  const quote = instrument ? market?.quotes[instrumentKey(instrument)] : undefined;
  const unitQuote = quotedUnitPrice(entry, quote);
  const rates = marketRates(market);
  const amount = (unitQuote !== null ? convertAmount(unitQuote, 'USD', currency, rates) : null) ?? convertAmount(entry.amount, entry.currency, currency, rates);
  const cost = convertAmount(entry.cost, entry.currency, currency, rates);
  const estimatedMonthlyIncome = convertAmount(entry.estimated_monthly_income ?? 0, entry.currency, currency, rates);
  // Never mix currencies when the exchange-rate feed is unavailable.
  return amount === null || cost === null || estimatedMonthlyIncome === null ? null : { ...entry, amount, cost, currency, payment_principal: entry.payment_principal == null ? undefined : convertAmount(Number(entry.payment_principal), entry.currency, currency, rates)!, payment_interest: entry.payment_interest == null ? undefined : convertAmount(Number(entry.payment_interest), entry.currency, currency, rates)!, estimated_monthly_payment: convertAmount(entry.estimated_monthly_payment ?? 0, entry.currency, currency, rates)!, estimated_monthly_income: estimatedMonthlyIncome };
}
