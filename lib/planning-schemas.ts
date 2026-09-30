// The rules every planning action must meet, shared by the planning API and the Telegram bot.
import { z } from 'zod';
import { isoDate,uuid,nonnegativeAmount,fiatCurrency,notes } from './api-validation';
import { instrumentFor } from './market';
const date=isoDate;
const id=uuid, amount=nonnegativeAmount;
const base=z.object({exchange_rate:z.number().finite().positive().max(1e15).optional(),id,account_id:id,target_id:id.nullable().optional(),amount,received:amount.default(0),fee:amount.default(0),date,notes:notes});
const investmentTarget=z.object({holding_account_id:id,asset_kind:z.enum(['Stock','Crypto']),asset_symbol:z.string().trim().max(15),target:amount.positive().max(1e12),monthly_contribution:amount.max(1e12).nullable().default(null)}).refine(v=>instrumentFor({kind:v.asset_kind,name:v.asset_symbol})?.symbol===v.asset_symbol);
export const planningSchemas={
 exception:z.object({target_id:id,date,skip:z.boolean()}),
 transfer:base.refine(v=>!!v.target_id&&v.target_id!==v.account_id&&v.amount>0&&v.received>0),
 reconcile:base.refine(v=>!v.target_id&&v.received===0&&v.fee===0),
 repayment:base.refine(v=>!!v.target_id&&v.amount>0&&v.received===0),
 mortgage:base.refine(v=>!!v.target_id&&v.amount+v.fee>0&&v.received===0),
 occurrence:z.object({amount:z.number().finite().positive().max(1e15),exchange_rate:z.number().finite().positive().max(1e15).optional(),id,account_id:id,target_id:id,date,notes:notes}),
 dismiss:z.object({id,target_id:id,date}),
 delete_goal:z.object({id}),
 category:z.object({id,name:z.string().trim().min(1).max(80),direction:z.enum(['income','expense'])}),
 goal:z.object({investment_targets:z.array(investmentTarget).max(50).optional(),id,name:z.string().trim().min(1).max(120),account_id:id.nullable(),kind:z.enum(['savings','net_worth','investment']).default('savings'),currency:fiatCurrency.optional(),target:amount.positive(),allocated:amount,target_date:date.nullable(),archived:z.boolean().default(false),monthly_contribution:amount.nullable().default(null),annual_return:z.number().finite().min(0).max(100).default(0),holding_account_id:id.nullable().default(null),asset_kind:z.enum(['Stock','Crypto']).nullable().default(null),asset_symbol:z.string().trim().max(15).nullable().default(null)}).transform(v=>v.kind==='investment'&&v.investment_targets?.length?{...v,...v.investment_targets[0]}:v).refine(v=>{
  if(v.investment_targets!==undefined){
   if(v.kind==='investment'&&!v.investment_targets.length)return false;
   if(v.kind!=='investment'&&v.investment_targets.length)return false;
   if(new Set(v.investment_targets.map(item=>item.holding_account_id.toLowerCase()+':'+item.asset_symbol)).size!==v.investment_targets.length)return false;
  }
  if(v.allocated>v.target)return false;
  if(v.kind==='investment')return v.account_id===null&&v.allocated===0&&!!v.holding_account_id&&!!v.asset_kind&&!!v.asset_symbol&&instrumentFor({kind:v.asset_kind,name:v.asset_symbol})?.symbol===v.asset_symbol&&v.annual_return===0&&v.target<=1e12&&(v.monthly_contribution===null||v.monthly_contribution<=1e12);
  if(v.holding_account_id!==null||v.asset_kind!==null||v.asset_symbol!==null)return false;
  return v.kind==='net_worth'?v.account_id===null&&v.allocated===0&&!!v.currency&&!!v.target_date:!!v.account_id;
 }),
};
export type PlanningAction=keyof typeof planningSchemas;
