import { z } from 'zod';

export const allocationKinds = ['crypto','stock','deposit','business','cash'] as const;
export const diversifiedPortfolioSchema = z.object({
 crypto: z.number().finite().min(0).max(100),
 stock: z.number().finite().min(0).max(100),
 deposit: z.number().finite().min(0).max(100),
 business: z.number().finite().min(0).max(100),
 cash: z.number().finite().min(0).max(100),
 cryptoSymbol: z.string().regex(/^[A-Z][A-Z0-9]{0,14}$/),
 stockSymbol: z.string().regex(/^[A-Z][A-Z0-9.-]{0,14}$/),
 businessRate: z.number().finite().min(0).max(1000),
}).refine(value => Math.abs(allocationKinds.reduce((sum,key)=>sum+value[key],0)-100)<1e-8);
export type DiversifiedPortfolio = z.infer<typeof diversifiedPortfolioSchema>;
export const defaultDiversifiedPortfolio: DiversifiedPortfolio = {crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:0};
