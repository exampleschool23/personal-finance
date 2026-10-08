"use client";
import { useIsMobile } from '@/hooks/use-mobile';
import { useId, type ReactElement } from 'react';
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney } from '@/lib/format';
import { ChartGradient, chartAxis, chartGrid, chartLine, chartTooltip, chartValueAxis, leadArea, moneyTick } from '@/components/presentation-foundation/chart';
import { niceAxis } from '@/lib/chart-scale';
import { historyChartDate } from '@/lib/investment-history';

type Series={key:string;label:string;color:string;dash?:string;primary?:boolean};
type Point={date:string;[key:string]:string|number|null};
/** Renders nothing: the tooltip keeps tracking the touched day without drawing over the details window. */
const noTooltip=()=>null;

export function InvestmentValueChart({points,series,currency,tooltip,onPointSelect,height=310,label='Investment value'}:{points:Point[];series:Series[];currency:string;tooltip?:ReactElement;onPointSelect?:(date:string)=>void;height?:number;label?:string}){
 const {locale,t}=useLanguage(),id=useId();
 const mobile=useIsMobile();
 // On phones a tap opens the point's details window; a tooltip drawn under the same finger would show through it
 // as the window fades in and look like a flash, so there the tooltip stays empty (its cursor line still marks the day).
 const tapOpensDetails=mobile&&!!onPointSelect;
 const data=points.map(point=>({...point,timestamp:Date.parse(point.date+'T00:00:00Z')}));
 const first=data[0]?.timestamp,last=data.at(-1)?.timestamp;
 const single=data.length===1;
 const values=points.flatMap(point=>series.map(item=>point[item.key])).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value));
 const axis=niceAxis(values);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 return <div className="portfolio-chart" aria-label={t(label)}><ResponsiveContainer width="100%" height={height}><ComposedChart data={data} accessibilityLayer onClick={state=>{
   // Clicks in the axis margins report a stale index; only open the hovered point.
   if(!state.isTooltipActive)return;
   const index=state.activeTooltipIndex;
   if(index===undefined||index===null||index==='')return;
   const point=data[Number(index)];
   if(point&&series.length)onPointSelect?.(point.date);
  }} margin={{top:15,right:15,left:5,bottom:20}}>
  <ChartGradient id={id}/>
  <CartesianGrid {...chartGrid}/>
  <XAxis dataKey="timestamp" type="number" scale="time" domain={first===undefined?['dataMin','dataMax']:[first,single?first+86400000:last!]} ticks={single?[first!]:undefined} tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={80} {...chartAxis}/>
  <YAxis domain={axis.domain} ticks={axis.ticks} allowDataOverflow tickFormatter={moneyTick(currency,locale)} {...chartValueAxis}/>
  <Tooltip {...chartTooltip} position={mobile?{x:0,y:40}:undefined} offset={{x:0,y:20}} allowEscapeViewBox={{x:false,y:true}} content={tapOpensDetails?noTooltip:tooltip} labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={amount=>money(Number(amount))} wrapperStyle={{zIndex:20,pointerEvents:'auto',maxWidth:'100%',...(mobile?{width:'100%',whiteSpace:'normal' as const}:{})}}/>
  {series.map(item=><Area key={item.key} type="monotone" dataKey={item.key} name={item.label} baseValue="dataMin" {...(item.primary?leadArea(id):{...chartLine,fill:'none'})} stroke={item.color} strokeDasharray={item.dash} connectNulls={false} activeDot={false}/>)}
 </ComposedChart></ResponsiveContainer></div>;
}
