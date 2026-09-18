import {z} from 'zod';
import {uuid,nonnegativeAmount,fiatCurrency,isoDate} from './api-validation';
const weights=z.record(z.string().max(80),z.number().finite().min(0).max(100)).refine(value=>Object.keys(value).length<=50&&Math.abs(Object.values(value).reduce((sum,n)=>sum+n,0)-100)<1e-8);
export const workspacePreferenceSchema=z.discriminatedUnion('key',[
 z.object({key:z.literal('goal_order'),data:z.object({ids:z.array(uuid).max(1000).refine(ids=>new Set(ids).size===ids.length)})}),
 z.object({key:z.literal('allocation'),data:z.object({weights})}),
 z.object({key:z.literal('watchlists'),data:z.object({items:z.array(z.object({id:uuid,name:z.string().trim().min(1).max(80),query:z.string().trim().max(120),category:z.string().max(80),currency:fiatCurrency,target:nonnegativeAmount.positive()})).max(30)})}),
 z.object({key:z.literal('import_profiles'),data:z.object({items:z.array(z.object({id:uuid,name:z.string().trim().min(1).max(80),delimiter:z.enum([',',';','\t']),mapping:z.object({name:z.number().int().min(0).max(100),date:z.number().int().min(0).max(100),amount:z.number().int().min(0).max(100),notes:z.number().int().min(-1).max(100),sourceId:z.number().int().min(-1).max(100).optional(),dateFormat:z.enum(['iso','dmy','mdy']),decimal:z.enum(['.',','])})})).max(30)})}),
 z.object({key:z.literal('debt_plan'),data:z.object({currency:fiatCurrency,extra:nonnegativeAmount,method:z.enum(['avalanche','snowball']),payments:z.record(uuid,nonnegativeAmount).refine(value=>Object.keys(value).length<=500)})}),
 z.object({key:z.literal('goal_scenarios'),data:z.object({items:z.array(z.object({id:uuid,goal_id:uuid,name:z.string().trim().min(1).max(80),monthly:nonnegativeAmount,annual_return:z.number().min(0).max(100),inflation:z.number().min(0).max(100),deadline:isoDate,missed_date:isoDate.nullable().optional()})).max(50)})})
]);
export type WorkspacePreference=z.infer<typeof workspacePreferenceSchema>;
export type Watchlist=Extract<WorkspacePreference,{key:'watchlists'}>['data']['items'][number];
