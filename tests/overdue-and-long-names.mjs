import test from 'node:test';
import assert from 'node:assert/strict';
import {stylesheet} from './helpers/stylesheet.mjs';

const css=stylesheet();
const rule=selector=>{
 const start=css.indexOf(selector+'{');
 assert.ok(start>=0,`${selector} is defined`);
 return css.slice(start,css.indexOf('}',start)+1);
};

// QA 2026-10-08 (LOAN-026): `.overview-list small` out-ranked `.negative`, so the Dashboard's "Overdue · date" showed grey.
test('the Dashboard overdue label stays red after the list caption rule', () => {
 assert.ok(css.indexOf('.overview-list small.negative{')>css.indexOf('.overview-list small{'),'the overdue rule follows the caption rule');
 assert.match(rule('.overview-list small.negative'),/color:var\(--negative\)/);
});

// QA 2026-10-08 (ACC-036): an unbroken 120-character account name ran past the card's right edge at 375px.
test('an account name with no spaces wraps inside its card', () => {
 const name=rule('.account-list-name');
 assert.match(name,/min-width:0/);
 assert.match(name,/overflow-wrap:anywhere/);
});
