import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {assets,liabilities,value} from '../lib/finance.ts';
import {convertAmount,instrumentFor,instrumentKey} from '../lib/market.ts';
const source=ts.transpileModule(fs.readFileSync('lib/portfolio-snapshots.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deps={assets,liabilities,value,convertAmount,instrumentFor,instrumentKey};
const {snapshotTotals,snapshotPoints,mergePortfolioPoints}=new Function(...Object.keys(deps),source+';return {snapshotTotals,snapshotPoints,mergePortfolioPoints};')(...Object.values(deps));
const cash={id:'cash',kind:'Cash',amount:1200000,currency:'UZS'};
const btc={id:'btc',kind:'Crypto',name:'BTC',quantity:2,amount:1,currency:'USD'};
const market={quotes:{'Crypto:BTC':{usd:100}},rates:{USD:1,UZS:12000},fx:null};
test('market prices and holdings quantities change snapshots without changing saved balances',()=>{
 const records=[cash,btc,{kind:'Business',amount:1000,ownership_percentage:40,currency:'USD'},{kind:'Loan',amount:50,currency:'USD'}];
 assert.deepEqual(snapshotTotals(records,market),{assets:700,debt:50,rates:market.rates});
 assert.equal(snapshotTotals(records,{...market,quotes:{'Crypto:BTC':{usd:200}}}).assets,900);
 assert.equal(snapshotTotals([{...btc,quantity:3}],market).assets,300);assert.equal(btc.amount,1);
});
test('missing FX or live quotes never save partial or stale-priced totals',()=>{
 assert.equal(snapshotTotals([btc],{...market,quotes:{}}),null);
 assert.equal(snapshotTotals([cash],{quotes:{},fx:null}),null);
 assert.equal(snapshotTotals([{...btc,quantity:0}],{quotes:{},fx:null}).assets,0);
});
test('observations retain historical currency rates without overriding dated corrections',()=>{
 const history=[{occurred_on:'2026-09-17',assets:100,debt:20,rates:{USD:1,UZS:12000},updated_at:'2026-09-17T12:00:00Z'}];
 assert.deepEqual(snapshotPoints(history,'UZS'),[{date:'2026-09-17',assets:1200000,debt:240000,net:960000}]);
 assert.deepEqual(snapshotPoints(history,'EUR'),[]);
 const current={date:'2026-09-18',assets:150,debt:20,net:130};
 const points=mergePortfolioPoints([{date:'2026-09-17',assets:1,debt:0,net:1}],snapshotPoints(history,'USD'),current,'observed');
 assert.deepEqual(points,[{date:'2026-09-17',assets:100,debt:20,net:80},current]);
 assert.deepEqual(mergePortfolioPoints([],[],current),[current]);
});
test('initial chart draws a starting line without fabricating a second dated balance',()=>{
 const ui=fs.readFileSync('components/portfolio-overview.tsx','utf8');
 assert.ok(ui.includes('InvestmentValueChart'));assert.ok(!ui.includes('Your first snapshot is ready'));
});

test('default dated history includes backdated car debt instead of an incomplete daily total',()=>{
 const recorded=[{date:'2026-09-17',assets:398000,debt:99251,net:298749},{date:'2026-09-18',assets:398000,debt:92021,net:305979}];
 const old=[{date:'2026-09-17',assets:397894,debt:87000,net:310894}];
 const current={date:'2026-09-19',assets:398195,debt:92021,net:306174};
 assert.deepEqual(mergePortfolioPoints(recorded,old,current),[...recorded,current]);
 assert.deepEqual(mergePortfolioPoints([],old,current),[current]);
 assert.deepEqual(mergePortfolioPoints(recorded,old,current,'observed'),[...old,current]);
});
