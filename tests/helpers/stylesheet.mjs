import fs from 'node:fs';
import path from 'node:path';

// The app's stylesheet as the browser receives it: app/globals.css with its own `./styles/*` imports inlined in order.
export function stylesheet(file='app/globals.css'){
 return fs.readFileSync(file,'utf8').replace(/@import "(\.\/[^"]+\.css)";/g,(_,name)=>stylesheet(path.join(path.dirname(file),name)));
}
