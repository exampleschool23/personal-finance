import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { assetRecordKinds, income } from '../lib/finance.ts';

// Exercise the currency control's actual visibility and change handler without a browser.
const source = fs.readFileSync('components/record-dialog.tsx', 'utf8');
const tree = ts.createSourceFile('record-dialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let condition, change;
function visit(node) {
 if (ts.isConditionalExpression(node) && ts.isJsxSelfClosingElement(node.whenTrue) && node.whenTrue.tagName.getText(tree) === 'CurrencySelect') {
  condition = node.condition.getText(tree);
  change = node.whenTrue.attributes.properties.find(p => p.name?.getText(tree) === 'onChange').initializer.expression.getText(tree);
 }
 ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(condition && change, 'Currency selector and change handler exist');
const visible = new Function('editing', 'existing', 'assetRecord', 'income', `return ${condition};`);

test('every new asset offers currency selection; existing asset currencies stay locked', () => {
 for (const kind of assetRecordKinds) {
  assert.equal(visible({kind}, false, true, income), true, kind);
  assert.equal(visible({kind}, true, true, income), false, kind);
 }
 assert.equal(visible({kind:'Mortgage'}, false, false, income), false);
});

test('choosing an asset currency preserves exact entered amounts and account assignment', () => {
 const editing = {kind:'Stock', currency:'USD', amount:0.00001234, quantity:1.12345678, cost:0.00000987, holding_account_id:'broker', opened_on:'2026-09-20'};
 const before = structuredClone(editing);
 let updated;
 const onChange = new Function('editing', 'setEditing', `return ${change};`)(editing, value => { updated=value; });
 onChange('EUR');
 assert.deepEqual(updated, {...before, currency:'EUR', account_exchange_rate:null, account_rate_date:null, account_currency:null});
 assert.deepEqual(editing, before);
});
