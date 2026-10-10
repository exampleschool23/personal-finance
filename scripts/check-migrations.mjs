// Are the migrations in migrations/ applied to the database this checkout talks to?
// The database reports its schema version through finance_capabilities() (the same
// number lib/database-capabilities.ts requires); each migration file carries its
// number in its name. The pre-commit hook runs this after lint and prints the
// migrations the database has not seen yet, so a commit that needs one is never a
// surprise on deploy. It warns by default; MIGRATIONS_CHECK=strict refuses the commit
// instead. Without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env / .env.local
// (or the environment) it says so and lets the commit through, so a fresh clone
// still commits. Also runs on its own: npm run migrations:check.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** KEY=value lines of the env files that exist, later files winning; never printed. */
export function readEnv(files, read = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')) {
 const env = {};
 for (const file of files) for (const line of read(file).split('\n')) {
  const match = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
  if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
 }
 return env;
}

/** The migration files by number: `001_lending_dates.sql` → 1. Files without the three-digit prefix are ignored. */
export function migrationNumbers(names) {
 return names.map(name => ({ name, number: Number(/^(\d{3})_.*\.sql$/.exec(name)?.[1]) })).filter(item => Number.isInteger(item.number)).sort((a, b) => a.number - b.number);
}

/** The migrations the database has not applied: every file numbered above its schema version. */
export const pendingMigrations = (names, applied) => migrationNumbers(names).filter(item => item.number > applied).map(item => item.name);

/** The version the app requires, from lib/database-capabilities.ts. */
export const requiredVersion = source => Number(/requiredSchemaVersion\s*=\s*(\d+)/.exec(source)?.[1] ?? NaN);

/** Asks the database for its schema version through finance_capabilities(); the key is sent, never shown. */
export async function fetchSchemaVersion(url, key, fetcher = fetch) {
 const response = await fetcher(url.replace(/\/$/, '') + '/rest/v1/rpc/finance_capabilities', {
  method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000),
 });
 if (!response.ok) throw Error(`the database answered HTTP ${response.status}`);
 const data = await response.json();
 if (!data || typeof data.schema_version !== 'number') throw Error('the database did not report a schema version');
 return data.schema_version;
}

/** What to say, and whether the database is behind. */
export function report({ applied, names, required }) {
 const pending = pendingMigrations(names, applied);
 const lines = [`migrations: database at schema version ${applied}, app requires ${required}, newest file ${migrationNumbers(names).at(-1)?.number ?? 'none'}.`];
 if (!pending.length) lines.push('migrations: every migration is applied.');
 else lines.push(`migrations: ${pending.length} not yet applied to the database (apply in order):`, ...pending.map(name => '  migrations/' + name));
 if (Number.isInteger(required) && required > applied) lines.push(`migrations: the app will refuse this database until it reaches ${required}.`);
 return { lines, pending, behind: pending.length > 0 };
}

/** Runs the check; returns the exit code. `strict` turns a database that is behind into a failure. */
export async function check({ env = readEnv(['.env', '.env.local']), names = fs.readdirSync('migrations'), source = fs.readFileSync('lib/database-capabilities.ts', 'utf8'), fetcher = fetch, strict = false, log = console.log, warn = console.error } = {}) {
 const url = process.env.SUPABASE_URL || env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !key) { log('migrations: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; skipped the applied-migrations check.'); return 0; }
 let applied;
 try { applied = await fetchSchemaVersion(url, key, fetcher); }
 catch (error) { warn(`migrations: could not read the database schema version (${error.message}); skipped the check.`); return 0; }
 const result = report({ applied, names, required: requiredVersion(source) });
 for (const line of result.lines) (result.behind ? warn : log)(line);
 if (result.behind && strict) { warn('migrations: MIGRATIONS_CHECK=strict, commit refused until the migrations above are applied.'); return 1; }
 return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 process.exitCode = await check({ strict: process.env.MIGRATIONS_CHECK === 'strict' || process.argv.includes('--strict') });
}
