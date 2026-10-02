import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The /qa and /dr skills run from these catalogs; keep them well formed so a run never skips or double-counts a case.
const catalogs = { qa: '.claude/skills/qa/references/cases.md', dr: '.claude/skills/dr/references/cases.md' };
const rows = path => fs.readFileSync(path, 'utf8').split('\n').filter(line => /^\| [A-Z0-9]+-\d{3} \|/.test(line)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));

for (const [skill, path] of Object.entries(catalogs)) {
 test(`/${skill} catalog has unique, complete cases`, () => {
  const cases = rows(path);
  assert.ok(cases.length > 50, `${path} should cover the app broadly`);
  const ids = cases.map(cells => cells[0]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [], 'case IDs are unique');
  for (const cells of cases) {
   assert.ok(cells.length >= 4, `${cells[0]} has every column`);
   assert.ok(cells.every(cell => cell.length > 0), `${cells[0]} has no empty cell`);
   assert.match(cells[1], skill === 'qa' ? /^P[012]$/ : /^D[012]$/, `${cells[0]} has a valid priority`);
  }
 });
 test(`/${skill} skill points at its catalog and names a valid trigger`, () => {
  const skillFile = fs.readFileSync(`.claude/skills/${skill}/SKILL.md`, 'utf8');
  assert.match(skillFile, new RegExp(`^---\\nname: ${skill}\\ndescription: .+\\n---`, 'm'));
  assert.match(skillFile, /references\/cases\.md/);
  assert.match(skillFile, /AGENTS\.md/);
 });
}

test('every area named in the /qa arguments has cases', () => {
 const skillFile = fs.readFileSync('.claude/skills/qa/SKILL.md', 'utf8');
 const areas = skillFile.match(/an area code \(([^)]+)\)/)[1].split(',').map(area => area.trim());
 const ids = rows(catalogs.qa).map(cells => cells[0].split('-')[0]);
 for (const area of areas) assert.ok(ids.includes(area), `area ${area} has at least one case`);
});

test('every area named in the /dr arguments has cases', () => {
 const skillFile = fs.readFileSync('.claude/skills/dr/SKILL.md', 'utf8');
 const areas = skillFile.match(/a case-area code \(([^)]+)\)/)[1].split(',').map(area => area.trim());
 const ids = rows(catalogs.dr).map(cells => cells[0].split('-')[0]);
 for (const area of areas) assert.ok(ids.includes(area), `area ${area} has at least one case`);
});

// Every page the app serves must belong to a /dr screen and a /qa area, so a full run reaches every place.
const appRoutes = (dir = 'app') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
 const path = `${dir}/${entry.name}`;
 if (entry.isDirectory()) return appRoutes(path);
 return entry.name === 'page.tsx' ? ['/' + dir.split('/').slice(1).filter(part => !part.startsWith('(')).join('/')] : [];
});
const mapRows = (file, header) => {
 const text = fs.readFileSync(file, 'utf8');
 const table = text.slice(text.indexOf(header)).split('\n').slice(2);
 return table.slice(0, table.findIndex(line => !line.startsWith('|'))).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
};
const routesIn = cell => [...cell.matchAll(/`(\/[^`]*)`/g)].map(match => match[1]);

test('the /dr screen map covers every route, names real files, and every screen has its own cases', () => {
 const skillFile = fs.readFileSync('.claude/skills/dr/SKILL.md', 'utf8');
 const screens = skillFile.match(/a screen name \(([^)]+)\)/)[1].split(',').map(screen => screen.trim());
 const map = mapRows('.claude/skills/dr/SKILL.md', '| Screen | Routes | Files |');
 assert.deepEqual(map.map(row => row[0]).sort(), [...screens].sort(), 'one map row per screen named in the description');
 const mapped = new Set(map.flatMap(row => routesIn(row[1])));
 for (const route of appRoutes()) if (route !== '/benchmarks') assert.ok(mapped.has(route), `route ${route} belongs to a /dr screen`);
 for (const route of mapped) assert.ok(appRoutes().includes(route), `mapped route ${route} exists`);
 for (const row of map) for (const [, file] of row[2].matchAll(/`([^`]+)`/g)) assert.ok(fs.existsSync(file), `${row[0]} file ${file} exists`);
 const scr = rows(catalogs.dr).filter(cells => cells[0].startsWith('SCR-')).map(cells => cells[2]);
 for (const screen of screens) assert.ok(scr.includes(screen), `screen ${screen} has an SCR case`);
 for (const screen of scr) assert.ok(screens.includes(screen), `SCR case screen ${screen} is a known screen`);
});

test('every route belongs to a /qa area that has cases', () => {
 const map = mapRows('.claude/skills/qa/SKILL.md', '| Area | Routes |');
 const ids = rows(catalogs.qa).map(cells => cells[0].split('-')[0]);
 const mapped = new Set(map.flatMap(row => routesIn(row[1]).map(route => route.split(' ')[0])));
 for (const route of appRoutes()) assert.ok(mapped.has(route), `route ${route} belongs to a /qa area`);
 for (const [area] of map) assert.ok(ids.includes(area), `area ${area} has cases`);
});

test('both catalogs keep a run log for retests', () => {
 for (const path of Object.values(catalogs)) assert.match(fs.readFileSync(path, 'utf8'), /Run log[\s\S]*2026-\d\d-\d\d/);
 assert.match(fs.readFileSync(catalogs.qa, 'utf8'), /\| \d{4}-\d\d-\d\d \| [0-9a-f]{7}/, 'the /qa run log names the commit tested');
});
