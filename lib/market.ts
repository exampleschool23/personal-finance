import type { Entry } from './finance';

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
export type Instrument = { kind: 'Crypto' | 'Stock'; symbol: string };
export type Quote = { usd: number; source: string; fetchedAt: string; marketTime?: string };
export type MarketData = { rates?: Record<string, number>; ratesDate?: string; fx: { rate: number; date: string; source: string } | null; quotes: Record<string, Quote>; errors: Record<string, string>; stocksConfigured: boolean };
export const instrumentKey = (instrument: Instrument) => `${instrument.kind}:${instrument.symbol}`;
export function instrumentFor(entry: Pick<Entry, 'kind' | 'name'>): Instrument | null {
  if (entry.kind === 'Crypto') {
    const name = entry.name.trim().toLowerCase();
    const coin = coins.find(c => [c[0], c[1], coinName(c)].some(v => v.toLowerCase() === name));
    return coin ? { kind: 'Crypto', symbol: coin[0] } : null;
  }
  if (entry.kind === 'Stock' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(entry.name.trim())) {
    return { kind: 'Stock', symbol: entry.name.trim() };
  }
  return null;
}
export function convertAmount(amount: number, from: Entry['currency'], to: Entry['currency'], rate?: number | Record<string, number>) {
  if (from === to) return amount;
  const rates = typeof rate === 'number' ? { USD: 1, UZS: rate } as Record<string, number> : rate;
  const fromRate = from === 'USD' ? 1 : rates?.[from];
  const toRate = to === 'USD' ? 1 : rates?.[to];
  if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
  return amount / fromRate * toRate;
}
export function marketEntry(entry: Entry, currency: Entry['currency'], market: MarketData | null): Entry | null {
  const instrument = instrumentFor(entry);
  const quote = instrument ? market?.quotes[instrumentKey(instrument)] : undefined;
  const amount = (quote ? convertAmount(quote.usd, 'USD', currency, (market?.rates ?? market?.fx?.rate)) : null) ?? convertAmount(entry.amount, entry.currency, currency, (market?.rates ?? market?.fx?.rate));
  const cost = convertAmount(entry.cost, entry.currency, currency, (market?.rates ?? market?.fx?.rate));
  const estimatedMonthlyIncome = convertAmount(entry.estimated_monthly_income ?? 0, entry.currency, currency, market?.rates ?? market?.fx?.rate);
  // Never mix currencies when the exchange-rate feed is unavailable.
  return amount === null || cost === null || estimatedMonthlyIncome === null ? null : { ...entry, amount, cost, currency, payment_principal: entry.payment_principal == null ? undefined : convertAmount(Number(entry.payment_principal), entry.currency, currency, market?.rates ?? market?.fx?.rate)!, payment_interest: entry.payment_interest == null ? undefined : convertAmount(Number(entry.payment_interest), entry.currency, currency, market?.rates ?? market?.fx?.rate)!, estimated_monthly_payment: convertAmount(entry.estimated_monthly_payment ?? 0, entry.currency, currency, market?.rates ?? market?.fx?.rate)!, estimated_monthly_income: estimatedMonthlyIncome };
}
