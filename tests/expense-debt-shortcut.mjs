import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('expense shortcut uses owned outstanding liabilities and guards unsaved changes',()=>{
 const ui=fs.readFileSync('components/record-dialog.tsx','utf8');
 assert.match(ui,/planning.data.records.filter\(record=>liabilities.includes\(record.kind\)&&record.amount>0\)/);
 assert.match(ui,/guard.request\(\(\)=>props.onDebtPayment!\(record\)\)/);
 assert.match(ui,/planning.loading\?/);
 assert.match(ui,/planning.error\?/);
 assert.match(ui,/type="button" disabled=\{busy\|\|!selectedDebt/);
});
test('shortcut routes mortgages to their existing form and loans to repayment mode',()=>{
 const workspace=fs.readFileSync('components/finance-workspace.tsx','utf8');
 assert.match(workspace,/setEditing\(null\);if\(record.kind==='Mortgage'\)setPayingMortgage\(record\);else setDebtPayment\(record\)/);
 assert.match(workspace,/initialType="withdrawal" record=\{debtPayment\}/);
 const tracker=fs.readFileSync('components/investment-tracker.tsx','utf8');
 assert.match(tracker,/initialType&&updateTypes.includes\(initialType\)\?initialType:updateTypes\[0\]/);
});

test('debt payment is a third segment and cannot submit an ordinary expense',()=>{
 const ui=fs.readFileSync('components/record-dialog.tsx','utf8');
 assert.match(ui,/<TabsTrigger value="debt"/);
 assert.match(ui,/<TabsContent value="debt"/);
 assert.match(ui,/if\(mode==='debt'\)\{event.preventDefault\(\);return;\}/);
 assert.match(ui,/mode!=='debt'&&<Button className="primary"/);
 assert.doesNotMatch(ui,/showPayments|expense-debt-shortcut/);
});

test('mortgage selection embeds the shared payment fields and guards draft switches',()=>{
 const ui=fs.readFileSync('components/record-dialog.tsx','utf8');
 assert.match(ui,/selectedDebt\?\.kind==='Mortgage'&&onMortgageSave\?<MortgagePaymentDialog inline/);
 assert.match(ui,/requestPaymentSwitch\(change\)/);
 assert.match(ui,/paymentState.dirty/);
 const payment=fs.readFileSync('components/mortgage-payment-dialog.tsx','utf8');
 assert.match(payment,/if\(inline\)return <>{content}{guard.confirmation}<\/>/);
 assert.match(payment,/'Save payment'/);
 assert.doesNotMatch(payment,/<form/);
});

test('debt selection embeds repayment fields with a user-entered partial amount',()=>{
 const ui=fs.readFileSync('components/record-dialog.tsx','utf8');
 assert.match(ui,/<InvestmentTracker inline key=\{selectedDebt.id\} initialType="withdrawal"/);
 const tracker=fs.readFileSync('components/investment-tracker.tsx','utf8');
 assert.match(tracker,/if\(inline\)return <>{paymentFields}{guard.confirmation}<\/>/);
 assert.match(tracker,/max=\{lending&&draft.type==='withdrawal'\?currentBalance:1e15\}/);
 assert.match(tracker,/remainingBalance>=0/);
 assert.match(tracker,/if\(inline\)onClose\(\)/);
});
