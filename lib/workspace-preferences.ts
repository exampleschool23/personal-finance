import {z} from 'zod';
import {dashboardCardIds,retiredDashboardCards} from './dashboard-layout';
import {uuid,nonnegativeAmount,fiatCurrency,isoDate} from './api-validation';
import {taxLineIds,taxTemplates} from './business-tax';
const weights=z.record(z.string().max(80),z.number().finite().min(0).max(100)).refine(value=>Object.keys(value).length<=50&&Math.abs(Object.values(value).reduce((sum,n)=>sum+n,0)-100)<1e-8);
// Dashboard layouts saved before cards could change column keep one `order` list; both shapes load, as do ids of removed cards.
const dashboardCardList=z.array(z.enum([...dashboardCardIds,...retiredDashboardCards] as string[] as [string,...string[]])).max(20);
export const workspacePreferenceSchema=z.discriminatedUnion('key',[
 z.object({key:z.literal('daily_plan'),data:z.object({buffers:z.record(uuid,nonnegativeAmount).refine(v=>Object.keys(v).length<=200),budgets:z.array(z.object({plan_id:uuid,account_id:uuid,schedule_ids:z.array(uuid).max(200)})).max(200).refine(v=>new Set(v.map(b=>b.plan_id)).size===v.length&&new Set(v.flatMap(b=>b.schedule_ids)).size===v.flatMap(b=>b.schedule_ids).length)})}),
 z.object({key:z.literal('reminders'),data:z.object({enabled:z.boolean(),days_ahead:z.number().int().min(0).max(31),snoozed:z.array(z.object({key:z.string().max(100),until:isoDate})).max(500)})}),
 z.object({key:z.literal('entry_templates'),data:z.object({items:z.array(z.object({id:uuid,name:z.string().trim().min(1).max(120),kind:z.enum(['Other income','Rent expense','Living expense','Charity','Other expense']),currency:fiatCurrency,amount:nonnegativeAmount,account_id:uuid.nullable(),custom_category_id:uuid.nullable(),notes:z.string().max(2000)})).max(30)})}),
 z.object({key:z.literal('goal_order'),data:z.object({ids:z.array(uuid).max(1000).refine(ids=>new Set(ids).size===ids.length)})}),
 // Display order only: accounts (record and investment-account ids) and categories (added category ids and built-in category names).
 z.object({key:z.literal('account_order'),data:z.object({ids:z.array(uuid).max(1000).refine(ids=>new Set(ids).size===ids.length)})}),
 z.object({key:z.literal('business_order'),data:z.object({ids:z.array(uuid).max(1000).refine(ids=>new Set(ids).size===ids.length)})}),
 z.object({key:z.literal('tag_order'),data:z.object({ids:z.array(uuid).max(1000).refine(ids=>new Set(ids).size===ids.length)})}),
 // Tax prep: the line template and categories moved to another line (or to none) by hand.
 z.object({key:z.literal('tax_lines'),data:z.object({template:z.enum(taxTemplates),lines:z.record(z.string().trim().min(1).max(80),z.enum(taxLineIds as [string,...string[]]).nullable()).refine(value=>Object.keys(value).length<=500)})}),
 z.object({key:z.literal('category_order'),data:z.object({ids:z.array(z.string().trim().min(1).max(80)).max(1000).refine(ids=>new Set(ids).size===ids.length)})}),
 z.object({key:z.literal('allocation'),data:z.object({weights,target_net_worth:z.object({amount:nonnegativeAmount.positive(),currency:fiatCurrency,date:isoDate.nullable().optional()}).nullable().optional()})}),
 z.object({key:z.literal('watchlists'),data:z.object({items:z.array(z.object({id:uuid,name:z.string().trim().min(1).max(80),query:z.string().trim().max(120),category:z.string().max(80),currency:fiatCurrency,target:nonnegativeAmount.positive()})).max(30)})}),
 z.object({key:z.literal('import_profiles'),data:z.object({items:z.array(z.object({id:uuid,name:z.string().trim().min(1).max(80),delimiter:z.enum([',',';','\t']),mapping:z.object({name:z.number().int().min(0).max(100),date:z.number().int().min(0).max(100),amount:z.number().int().min(0).max(100),notes:z.number().int().min(-1).max(100),sourceId:z.number().int().min(-1).max(100).optional(),dateFormat:z.enum(['iso','dmy','mdy']),decimal:z.enum(['.',','])})})).max(30)})}),
 z.object({key:z.literal('debt_plan'),data:z.object({currency:fiatCurrency,extra:nonnegativeAmount,method:z.enum(['avalanche','snowball']),payments:z.record(uuid,nonnegativeAmount).refine(value=>Object.keys(value).length<=500)})}),
 z.object({key:z.literal('dashboard'),data:z.union([z.object({columns:z.object({left:dashboardCardList,right:dashboardCardList}),hidden:dashboardCardList}),z.object({order:dashboardCardList,hidden:dashboardCardList})])}),
 z.object({key:z.literal('goal_scenarios'),data:z.object({items:z.array(z.object({id:uuid,goal_id:uuid,name:z.string().trim().min(1).max(80),monthly:nonnegativeAmount,annual_return:z.number().min(0).max(100),inflation:z.number().min(0).max(100),deadline:isoDate,missed_date:isoDate.nullable().optional()})).max(50)})})
]);
export type WorkspacePreference=z.infer<typeof workspacePreferenceSchema>;
export type Watchlist=Extract<WorkspacePreference,{key:'watchlists'}>['data']['items'][number];

/** The ids of a saved display order, or none. */
export const savedOrder=(preferences:readonly WorkspacePreference[],key:'account_order'|'business_order'|'tag_order'|'goal_order')=>(preferences.find(item=>item.key===key)?.data as {ids?:string[]}|undefined)?.ids??[];
