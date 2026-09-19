import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the workspace's actual routing effect without a browser or network.
const source = fs.readFileSync('components/finance-workspace.tsx', 'utf8');
const tree = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' &&
      node.arguments[1]?.getText(tree) === '[ready, user, demo, pathname, router]') {
    callback = node.arguments[0].getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(callback, 'Workspace must install its session routing effect');
const run = new Function('ready', 'user', 'demo', 'pathname', 'router', `return (${callback})();`);

test('signed-out workspace URLs return to login using history replacement', () => {
  for (const path of ['/goals', '/settings', '/assets', '/accounts']) {
    const destinations = [];
    const router = { replace: destination => destinations.push(destination) };
    run(false, null, false, path, router);
    assert.deepEqual(destinations, [], 'Wait for the initial session check');
    run(true, null, false, path, router);
    assert.deepEqual(destinations, ['/']);
  }
});

test('login, signed-in users and demo navigation do not redirect; logout does', () => {
  const destinations = [];
  const router = { replace: destination => destinations.push(destination) };
  run(true, null, false, '/', router);
  run(true, 'owner@example.com', false, '/goals', router);
  run(true, null, true, '/goals', router);
  assert.deepEqual(destinations, []);
  run(true, null, false, '/goals', router);
  assert.deepEqual(destinations, ['/']);
});
