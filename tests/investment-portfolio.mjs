import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {investmentValueChange}=loadTS('lib/investment-portfolio.ts');
test('value change compares the last value with the first and needs both',()=>{
 assert.equal(investmentValueChange([400000,400150,400400]),400);
 assert.equal(investmentValueChange([400,399.75]),-.25);
 assert.equal(investmentValueChange([]),null);
 assert.equal(investmentValueChange([400]),null);
 assert.equal(investmentValueChange([null,400]),null);
 assert.equal(investmentValueChange([400,null]),null);
});
