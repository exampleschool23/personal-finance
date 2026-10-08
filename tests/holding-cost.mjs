import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {holdingCostStart,changeHoldingCost,shownHoldingTotal}=loadTS('lib/holding-cost.ts');
const enter=(state,...steps)=>steps.reduce((current,[field,value])=>changeHoldingCost(current,field,value),state);

test('quantity and unit price work out the total, shown in whole amounts',()=>{
 const state=enter(holdingCostStart(0,0),['quantity',0.05],['cost',75676]);
 assert.equal(state.total,3783.8);
 assert.equal(shownHoldingTotal(state),3784);
 assert.equal(state.quantity,0.05);assert.equal(state.cost,75676);
});

test('quantity and total work out the unit price, keeping up to eight decimals',()=>{
 const state=enter(holdingCostStart(0,0),['quantity',0.05],['total',3784]);
 assert.equal(state.cost,75680);
 assert.equal(shownHoldingTotal(state),3784);
 assert.equal(enter(holdingCostStart(0,0),['quantity',3],['total',100]).cost,33.33333333);
});

test('unit price and total work out the quantity',()=>{
 const state=enter(holdingCostStart(0,0),['cost',80000],['total',4000]);
 assert.equal(state.quantity,0.05);
 assert.equal(enter(holdingCostStart(0,0),['cost',3],['total',1]).quantity,0.33333333);
});

test('the two fields entered last decide the third, also on a saved holding',()=>{
 // A saved holding starts from its quantity and unit price.
 const saved=holdingCostStart(2,100);
 assert.equal(saved.total,200);
 // Typing a total keeps the quantity and changes the unit price.
 const total=enter(saved,['total',300]);
 assert.equal(total.cost,150);assert.equal(total.quantity,2);
 // Then typing a unit price keeps that total and changes the quantity.
 const price=enter(total,['cost',100]);
 assert.equal(price.quantity,3);assert.equal(price.total,300);
});

test('a zero quantity or unit price leaves the field it would divide by unchanged',()=>{
 const noQuantity=enter(holdingCostStart(0,50),['total',500],['quantity',0]);
 assert.equal(noQuantity.cost,50);
 const noPrice=enter(holdingCostStart(4,0),['cost',0],['total',500]);
 assert.equal(noPrice.quantity,4);
 assert.equal(shownHoldingTotal(noPrice),500);
});
