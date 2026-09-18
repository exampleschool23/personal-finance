import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const files=['components/account-access-panel.tsx','components/planning/goal-funding-panel.tsx','components/planning/goal-scenarios.tsx','components/planning/debt-payoff-panel.tsx','components/portfolio-allocation-plan.tsx','components/spending-watchlists.tsx','components/import-profiles.tsx','components/import-history.tsx','components/transaction-insights.tsx'];
test('new financial workflows share localized formatters and controls with EN, RU and UZ copy',()=>{
 for(const file of files){const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/toLocaleString|toFixed|new Intl\.|type="(?:number|date)"/,file);for(const language of ['en','ru','uz']){const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`));for(const match of source.matchAll(/\bt\('([^']+)'/g))assert.ok(labels[match[1]],`${language}: ${file}: ${match[1]}`);}}
});
