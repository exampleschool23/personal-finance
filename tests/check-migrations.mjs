import test from 'node:test';
import assert from 'node:assert/strict';
import { check, fetchSchemaVersion, migrationNumbers, pendingMigrations, readEnv, report, requiredVersion } from '../scripts/check-migrations.mjs';

const names = ['001_lending_dates.sql', '137_category_bills.sql', '138_delete_category_into_built_in.sql', '139_budget_amount_once.sql', 'README.md'];
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
const capture = () => { const out = [], err = []; return { out, err, log: line => out.push(line), warn: line => err.push(line) }; };

test('migration files are read by their three-digit number, in order; other files are ignored', () => {
 assert.deepEqual(migrationNumbers(['139_b.sql', '001_a.sql', 'notes.md', '12_short.sql']).map(item => item.number), [1, 139]);
 assert.deepEqual(pendingMigrations(names, 136), ['137_category_bills.sql', '138_delete_category_into_built_in.sql', '139_budget_amount_once.sql']);
 assert.deepEqual(pendingMigrations(names, 139), []);
 assert.equal(requiredVersion('const requiredSchemaVersion = 139;\n'), 139);
});

test('env files are read KEY=value with quotes stripped, later files winning, and comments skipped', () => {
 const files = { '.env': 'SUPABASE_URL=https://a.supabase.co\n# comment\nSUPABASE_SERVICE_ROLE_KEY="old"\n', '.env.local': "export SUPABASE_SERVICE_ROLE_KEY='new'\nEMPTY=\n" };
 assert.deepEqual(readEnv(['.env', '.env.local', '.env.missing'], file => files[file] ?? ''), { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'new', EMPTY: '' });
});

test('the schema version comes from finance_capabilities with the key in the headers; refusals and odd answers throw', async () => {
 const calls = [];
 const fetcher = async (url, init) => { calls.push({ url, init }); return reply(200, { schema_version: 136, record_revisions: true }); };
 assert.equal(await fetchSchemaVersion('https://a.supabase.co/', 'secret', fetcher), 136);
 assert.equal(calls[0].url, 'https://a.supabase.co/rest/v1/rpc/finance_capabilities');
 assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
 await assert.rejects(fetchSchemaVersion('https://a.supabase.co', 'k', async () => reply(401, {})), /HTTP 401/);
 await assert.rejects(fetchSchemaVersion('https://a.supabase.co', 'k', async () => reply(200, {})), /schema version/);
});

test('the report names every unapplied migration in order and says when the app will refuse the database', () => {
 const behind = report({ applied: 136, names, required: 139 });
 assert.equal(behind.behind, true);
 assert.match(behind.lines[0], /database at schema version 136, app requires 139, newest file 139/);
 assert.match(behind.lines[1], /3 not yet applied/);
 assert.deepEqual(behind.lines.slice(2, 5), ['  migrations/137_category_bills.sql', '  migrations/138_delete_category_into_built_in.sql', '  migrations/139_budget_amount_once.sql']);
 assert.match(behind.lines[5], /refuse this database until it reaches 139/);
 const current = report({ applied: 139, names, required: 139 });
 assert.deepEqual([current.behind, current.lines[1]], [false, 'migrations: every migration is applied.']);
});

test('check warns by default, refuses only in strict mode, and lets a commit through without credentials or a reachable database', async () => {
 const env = { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, source = 'const requiredSchemaVersion = 139;';
 const behind = async () => reply(200, { schema_version: 137 });
 let io = capture();
 assert.equal(await check({ env, names, source, fetcher: behind, ...io }), 0);
 assert.ok(io.err.some(line => line.includes('138_delete_category_into_built_in.sql')), 'unapplied migrations are named on stderr');
 io = capture();
 assert.equal(await check({ env, names, source, fetcher: behind, strict: true, ...io }), 1);
 assert.ok(io.err.at(-1).includes('commit refused'));
 io = capture();
 assert.equal(await check({ env, names, source, fetcher: async () => reply(200, { schema_version: 139 }), strict: true, ...io }), 0);
 assert.deepEqual(io.err, []);
 io = capture();
 assert.equal(await check({ env: {}, names, source, fetcher: behind, strict: true, ...io }), 0);
 assert.match(io.out[0], /not set; skipped/);
 io = capture();
 assert.equal(await check({ env, names, source, fetcher: async () => { throw Error('fetch failed'); }, strict: true, ...io }), 0);
 assert.match(io.err[0], /could not read the database schema version \(fetch failed\)/);
});
