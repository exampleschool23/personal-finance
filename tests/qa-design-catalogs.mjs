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
