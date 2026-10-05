import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { lcovFiles, percent, totals } from './lcov.mjs';
const integration=process.argv.includes('--integration');
// `--coverage` measures which app code the tests run. It fails when line, branch or function coverage drops below
// scripts/coverage-floor.json, or when an app file that no test runs is not on that file's `untested` list, so new
// pages and helpers arrive with tests and the list only ever shrinks.
const coverage=process.argv.includes('--coverage');
const files=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.mjs')&&(integration?name==='google-auth.mjs':name!=='google-auth.mjs')).sort().map(name=>'tests/'+name);
const folders=['lib','components','hooks','app'];
// Third-party UI wrappers (components/ui) are library code, not app logic, so they are left out of the count.
const excluded='components/ui';
const floor=coverage?JSON.parse(readFileSync(new URL('./coverage-floor.json',import.meta.url),'utf8')):null;
if(floor)mkdirSync('coverage',{recursive:true});
const measured=floor?['--enable-source-maps','--experimental-test-coverage',...folders.map(folder=>`--test-coverage-include=${folder}/**`),`--test-coverage-exclude=${excluded}/**`,'--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=lcov','--test-reporter-destination=coverage/lcov.info']:[];
const result=spawnSync(process.execPath,[...measured,'--experimental-strip-types','--experimental-specifier-resolution=node','--test','--test-concurrency=2',...files],{stdio:'inherit',env:{...process.env,PGLITE_MODULE:process.env.PGLITE_MODULE??import.meta.resolve('@electric-sql/pglite')}});
if(result.error)throw result.error;
if(floor&&existsSync('coverage/lcov.info')){
 const root=process.cwd()+'/';
 const files=lcovFiles(readFileSync('coverage/lcov.info','utf8'),root);
 const run=new Set(files.keys());
 const walk=folder=>readdirSync(folder).flatMap(name=>{const path=`${folder}/${name}`;return statSync(path).isDirectory()?walk(path):/\.tsx?$/.test(name)&&!name.endsWith('.d.ts')?[path]:[];});
 const untested=folders.flatMap(walk).filter(file=>!run.has(file)&&!file.startsWith(excluded+'/')).sort();
 const allowed=new Set(floor.untested);
 const fresh=untested.filter(file=>!allowed.has(file)),covered=floor.untested.filter(file=>!untested.includes(file));
 if(covered.length)console.log(`\nNow tested, remove from scripts/coverage-floor.json "untested":\n  ${covered.join('\n  ')}`);
 if(fresh.length){console.error(`\nNo test runs these files. Add tests for them:\n  ${fresh.join('\n  ')}`);process.exit(1);}
 const total=totals(files);
 console.log(`\nCoverage: ${percent(total.lines).toFixed(2)}% lines, ${percent(total.branches).toFixed(2)}% branches, ${percent(total.functions).toFixed(2)}% functions; ${run.size} app files run by tests, ${untested.length} still untested (listed in scripts/coverage-floor.json).`);
 const short=['lines','branches','functions'].filter(key=>percent(total[key])<floor[key]);
 if(short.length){console.error(`Coverage below the floor in scripts/coverage-floor.json: ${short.map(key=>`${key} ${percent(total[key]).toFixed(2)}% < ${floor[key]}%`).join(', ')}`);process.exit(1);}
}
process.exit(result.status??1);

