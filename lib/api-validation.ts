import { z } from 'zod';
import { isCurrency } from './currencies';
export const uuid=z.string().uuid();
export const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
export const nonnegativeAmount=z.number().finite().min(0).max(1e15);
export const fiatCurrency=z.string().refine(isCurrency);
export const notes=z.string().max(2000).default('');
