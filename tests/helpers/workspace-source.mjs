import fs from 'node:fs';

// The shared workspace state as one text: the provider and the hooks it is built from (components/workspace/state/),
// for tests that check how it is wired rather than which file a line sits in.
export function workspaceSource(){
 const folder='components/workspace/state';
 return ['components/workspace/workspace-provider.tsx',...fs.readdirSync(folder).sort().map(name=>`${folder}/${name}`)].map(file=>fs.readFileSync(file,'utf8')).join('\n');
}
