import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const integration=process.argv.includes('--integration');
const files=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.mjs')&&(integration?name==='google-auth.mjs':name!=='google-auth.mjs')).sort().map(name=>'tests/'+name);
const result=spawnSync(process.execPath,['--experimental-strip-types','--experimental-specifier-resolution=node','--test','--test-concurrency=2',...files],{stdio:'inherit',env:{...process.env,PGLITE_MODULE:process.env.PGLITE_MODULE??import.meta.resolve('@electric-sql/pglite')}});
if(result.error)throw result.error;process.exit(result.status??1);
