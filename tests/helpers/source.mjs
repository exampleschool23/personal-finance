import fs from 'node:fs';

// A module's source with its parts: `components/record-dialog.tsx` and the files of `components/record-dialog/`, for
// tests that check what a module renders or refuses rather than which of its files holds the line.
export function sourceWithParts(file){
 const folder=file.replace(/\.[jt]sx?$/,'');
 const parts=fs.existsSync(folder)?fs.readdirSync(folder).sort().map(name=>`${folder}/${name}`):[];
 return [file,...parts].map(path=>fs.readFileSync(path,'utf8')).join('\n');
}
