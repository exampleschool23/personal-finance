import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {allocationKinds,portfolioAssets,portfolioAssetCurrency,defaultDiversifiedPortfolio} from '../lib/diversified-portfolio.ts';
const control=()=>null;
const Button=({children,...props})=>React.createElement('button',props,children);
const deps={React,allocationKinds,portfolioAssets,portfolioAssetCurrency,Button,Input:control,CurrencySelect:control,Trash2:control,FormattedNumberInput:control,InstrumentPicker:control,instrumentFor:()=>null,formatNumber:String,useLanguage:()=>({locale:'en',t:key=>key})};
const source=ts.transpileModule(fs.readFileSync('components/diversified-portfolio-settings.tsx','utf8').replace(/^import .*;\n/gm,'').replace('export function','function'),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const Editor=new Function(...Object.keys(deps),source+';return DiversifiedPortfolioSettings;')(...Object.values(deps));
function find(node,predicate){if(!node||typeof node!=='object')return; if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const result=find(child,predicate);if(result)return result;}}
test('deleting the last stock or coin removes its group and leaves an add-back button',()=>{
 for(const kind of ['stock','crypto']){
  let value={...defaultDiversifiedPortfolio,assets:[{id:'one',kind,symbol:kind==='stock'?'NVDA':'BTC',name:'',weight:100,rate:0}]};
  const render=()=>Editor({value,currencies:['USD'],onChange:next=>{value=next;}});
  const tree=render();
  const remove=find(tree,node=>node.type===Button&&node.props['aria-label']==='Remove {symbol}');
  assert.ok(remove);remove.props.onClick();
  assert.deepEqual(value.assets,[]);
  const markup=renderToStaticMarkup(render());
  assert.ok(!markup.includes('portfolio-instrument-group'));
  const add=find(render(),node=>node.type===Button&&node.props.children===(kind==='stock'?'Stock':'Crypto'));
  assert.ok(add);add.props.onClick();
  assert.equal(value.assets[0].kind,kind);
  assert.ok(renderToStaticMarkup(render()).includes('portfolio-instrument-group'));
 }
});
