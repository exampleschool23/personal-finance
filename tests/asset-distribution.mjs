import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { assets, value } from '../lib/finance.ts';
const source=fs.readFileSync(new URL('../lib/asset-distribution.ts',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace('export function','function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const distribution=new Function('assets','value',js+';return assetDistribution;')(assets,value);
test('combines repeat loans and keeps other categories separate',()=>{
 const rows=[{name:'Ali',kind:'Money lent',amount:100},{name:' ali ',kind:'Money lent',amount:200},{name:'Ali',kind:'Cash',amount:50},{name:'Debt',kind:'Debt',amount:800},{name:'Zero',kind:'Cash',amount:0},{name:'Stock',kind:'Stock',amount:20,quantity:3}];
 const groups=distribution(rows);
 assert.equal(groups.length,3);assert.equal(groups[0].amount,300);assert.equal(groups.reduce((n,g)=>n+g.amount,0),410);
 assert.deepEqual(distribution([]),[]);
});
