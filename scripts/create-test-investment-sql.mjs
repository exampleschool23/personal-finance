import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadMarket} from '../lib/server-market.ts';
import {depositToday} from '../lib/deposit-interest.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const fresh=(date,day)=>/^\d{4}-\d{2}-\d{2}$/.test(date??'')&&Number.isFinite(Date.parse(date))&&date<=day&&Date.parse(day)-Date.parse(date)<=7*86400000;
export function investmentMarketSnapshot(market,day=depositToday()){
 if(!fresh(day,day))throw Error('Invalid allocation date.');
 if(!market.rates||!fresh(market.ratesDate,day))throw Error('Current exchange rates are unavailable. No script generated.');
 const rates=Object.fromEntries(Object.entries(market.rates).filter(([code,rate])=>/^[A-Z]{3}$/.test(code)&&positive(rate)).map(([code,rate])=>[code,{rate,date:market.ratesDate,source:'ExchangeRate-API'}]));
 // The app prefers the Central Bank of Uzbekistan for UZS; retain its effective date.
 if(market.fx){
  if(!positive(market.fx.rate)||!fresh(market.fx.date,day))throw Error('UZS exchange rate is invalid or stale.');
  rates.UZS={rate:market.fx.rate,date:market.fx.date,source:market.fx.source};
 }
 rates.USD={rate:1,date:day,source:'Same-currency identity'};
 const quotes={};
 for(const [kind,symbol] of [['Crypto','BTC'],['Crypto','ETH'],['Stock','SPY']]){
  const quote=market.quotes[`${kind}:${symbol}`];
  if(!quote||!positive(quote.usd)||!fresh(quote.fetchedAt?.slice(0,10),day)||quote.marketTime&&!fresh(quote.marketTime.slice(0,10),day))throw Error(`Current ${symbol} quote is unavailable. No script generated.`);
  quotes[symbol]={...quote,kind};
 }
 return {day,rates,quotes};
}
export function renderInvestmentSql(snapshot){
 const template=fs.readFileSync(path.join(root,'scripts/allocate-test-cash.template.sql'),'utf8');
 return template.replace('__MARKET_JSON__',"'"+JSON.stringify(snapshot).replaceAll("'","''")+"'");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const envFile=path.join(root,'.env.local');if(fs.existsSync(envFile))process.loadEnvFile(envFile);
  const market=await loadMarket(['BTC','ETH'],['SPY'],true);
  const snapshot=investmentMarketSnapshot(market);
  const destination=path.join(root,'outputs/allocate-test-cash.sql');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,renderInvestmentSql(snapshot));
  console.log(`Prepared ${destination}. No database changes made.`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
