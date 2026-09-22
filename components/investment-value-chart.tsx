"use client";
import { useId, type ReactElement } from 'react';
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney } from '@/lib/format';
import { historyChartDate } from '@/lib/investment-history';

type Series={key:string;label:string;color:string;dash?:string;primary?:boolean};
type Point={date:string;[key:string]:string|number|null};
export function InvestmentValueChart({points,series,currency,tooltip,height=310}:{points:Point[];series:Series[];currency:string;tooltip?:ReactElement;height?:number}){
 const {locale,t}=useLanguage(),id=useId();
 const data=points.map(point=>({...point,timestamp:Date.parse(point.date+'T00:00:00Z')}));
 const first=data[0]?.timestamp,last=data.at(-1)?.timestamp;
 const single=data.length===1;
 const values=points.flatMap(point=>series.map(item=>point[item.key])).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value));
 const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
 const padding=Math.max((max-min)*.15,Math.abs(max)*.001,1);
 const domain:[number,number]=[Math.floor(min-padding),Math.ceil(max+padding)];
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 return <div className="portfolio-chart" aria-label={t('Investment value')}><ResponsiveContainer width="100%" height={height}><ComposedChart data={data} accessibilityLayer margin={{top:15,right:15,left:5,bottom:20}}>
  <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={.18}/><stop offset="100%" stopColor="var(--primary)" stopOpacity={.01}/></linearGradient></defs>
  <CartesianGrid stroke="var(--border)" strokeOpacity={.6} strokeDasharray="2 6" vertical={false}/>
  <XAxis dataKey="timestamp" type="number" scale="time" domain={first===undefined?['dataMin','dataMax']:[first,single?first+86400000:last!]} ticks={single?[first!]:undefined} tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={80} axisLine={false} tickLine={false} tickMargin={14}/>
  <YAxis width={120} domain={domain} allowDataOverflow tickCount={5} tickFormatter={money} axisLine={false} tickLine={false} tickMargin={12}/>
  <Tooltip offset={{x:0,y:20}} allowEscapeViewBox={{x:false,y:true}} isAnimationActive={false} content={tooltip} labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={amount=>money(Number(amount))} wrapperStyle={{zIndex:20,pointerEvents:'auto'}} contentStyle={{background:'var(--background)',borderColor:'var(--border)',borderRadius:16}}/>
  {series.map(item=><Area key={item.key} type="monotone" dataKey={item.key} name={item.label} baseValue="dataMin" fill={item.primary?`url(#${id})`:'none'} stroke={item.color} strokeDasharray={item.dash} strokeWidth={item.primary?3:2} strokeLinecap="round" strokeLinejoin="round" isAnimationActive={false} connectNulls={false} dot={{r:3,fill:'var(--background)',strokeWidth:2}} activeDot={{r:6,stroke:'var(--background)',strokeWidth:3}}/>)}
 </ComposedChart></ResponsiveContainer></div>;
}
