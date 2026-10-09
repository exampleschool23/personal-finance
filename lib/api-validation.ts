import { z } from 'zod';
import { isCurrency } from './currencies';
export const uuid=z.string().uuid();
export const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
/** A calendar month, `YYYY-MM`. */
export const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const nonnegativeAmount=z.number().finite().min(0).max(1e15);
export const fiatCurrency=z.string().refine(isCurrency);
export const notes=z.string().max(2000).default('');
/** A session as Supabase Auth hands it out, before it is saved in cookies. */
export const authSession=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive(),user:z.object({id:uuid})});
