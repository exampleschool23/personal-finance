import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Rule: the full "Loading your workspace…" layout appears only on the first load and on a reload. A drawer tap
// (a tab or page change inside the signed-in app) shows shimmer, never the workspace layout or its banner.
const shell = fs.readFileSync('components/workspace/workspace-shell.tsx', 'utf8');
const placeholders = fs.readFileSync('components/presentation-foundation/loading-placeholder.tsx', 'utf8');

test('a drawer tap shows the navigation shimmer, not the workspace layout', () => {
 const navigating = shell.match(/\{destination \? (.+?) : children\}/);
 assert.ok(navigating, 'destination branch is present');
 assert.match(navigating[1], /NavigationShimmer/);
 assert.doesNotMatch(navigating[1], /PageSkeleton|WorkspaceSkeleton|Loading your workspace/);
});

test('the workspace layout and its banner stay on first load only', () => {
 // The only place the banner is set in the shell is the session check that runs before the signed-in app renders.
 const banners = shell.match(/Loading your workspace/g) ?? [];
 assert.equal(banners.length, 1);
 assert.match(shell, /!ready \|\| !signedIn[\s\S]*?Loading your workspace/);
});

test('the navigation shimmer is shimmer only, with a screen-reader label and no banner', () => {
 const shimmer = placeholders.slice(placeholders.indexOf('export function NavigationShimmer'));
 assert.match(shimmer, /role="status" aria-busy="true"/);
 assert.match(shimmer, /<Skeleton/);
 assert.doesNotMatch(shimmer.slice(0, shimmer.indexOf('\n}\n') + 2), /Loading your workspace|WorkspaceSkeleton/);
});
