import React from 'react';
// A tiny renderer for component tests without a DOM: it runs one component with its own hook state, expands the
// (stubbed) child components into plain element trees, and lets a test fire handlers and render again.
const fragment = Symbol.for('react.fragment');
const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));

export function createRenderer({ attach = () => null } = {}) {
 let scope = null;
 const persistent = { slots: [], cursor: 0, effects: [] };
 const slot = (make) => { const index = scope.cursor++; if (!(index in scope.slots)) scope.slots[index] = make(); return [index, scope.slots[index]]; };
 const hooks = {
  useState(initial) { const [index, value] = slot(() => ({ value: typeof initial === 'function' ? initial() : initial })); const state = scope.slots[index]; return [value.value, next => { const updated = typeof next === 'function' ? next(state.value) : next; if (!Object.is(updated, state.value)) persistent.dirty = true; state.value = updated; }]; },
  useRef(initial) { return slot(() => ({ current: initial }))[1]; },
  useMemo(factory, deps) { const index = scope.cursor++; if (changed(scope.slots[index]?.deps, deps)) scope.slots[index] = { deps, value: factory() }; return scope.slots[index].value; },
  useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
  useId() { return slot(() => ':r' + scope.cursor + ':')[1]; },
  useSyncExternalStore(subscribe, snapshot) { const own = scope; slot(() => ({ unsubscribe: own === persistent ? subscribe(() => { persistent.storeChanged = true; }) : null })); return snapshot(); },
  useEffect(effect, deps) {
   const index = scope.cursor++, previous = scope.slots[index];
   if (deps && previous && !changed(previous.deps, deps)) return;
   const entry = scope.slots[index] = { deps, cleanup: previous?.cleanup };
   if (scope === persistent) scope.effects.push(() => { entry.cleanup?.(); entry.cleanup = effect(); });
  },
 };
 hooks.useLayoutEffect = hooks.useEffect;
 const react = { ...React, ...hooks };
 react.default = react;

 function expand(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(expand);
  if (typeof node !== 'object' || !('type' in node) || !('props' in node)) return [node];
  if (node.type === fragment) return expand(node.props.children);
  if (typeof node.type === 'function') {
   const outer = scope; scope = { slots: [], cursor: 0, effects: [] };
   try { return expand(node.type(node.props)); } finally { scope = outer; }
  }
  const props = { ...node.props, children: expand(node.props.children) };
  const element = { type: node.type, key: node.key, props };
  const ref = node.props.ref;
  if (ref) { const target = attach(element); if (typeof ref === 'function') ref(target); else if (target != null) ref.current = target; }
  return [element];
 }

 /** Renders `Component` with `props`, runs pending effects (rendering again when they set state) and returns the expanded tree (a list of root nodes). */
 function render(Component, props) {
  let tree;
  for (let pass = 0; pass < 5; pass++) {
   scope = persistent; persistent.cursor = 0; persistent.dirty = false; persistent.storeChanged = false;
   const output = Component(props);
   tree = expand(output); scope = null;
   while (persistent.effects.length) persistent.effects.shift()();
   // Like React, state set by an effect (or a changed external store) renders again.
   if (!persistent.storeChanged && !persistent.dirty) break;
  }
  return tree;
 }
 /** Runs every effect cleanup, as an unmount does. */
 function unmount() { for (const entry of persistent.slots) { entry?.cleanup?.(); entry?.unsubscribe?.(); } }
 return { react, render, unmount, slots: persistent.slots };
}

export function* walk(nodes) {
 for (const node of [].concat(nodes)) if (node && typeof node === 'object') { yield node; yield* walk(node.props.children); }
}
export const findAll = (tree, test) => [...walk(tree)].filter(test);
export function find(tree, test, label = 'element') { const found = findAll(tree, test); if (!found.length) throw Error('No ' + label + ' found'); return found[0]; }
export const text = nodes => [].concat(nodes).map(node => node && typeof node === 'object' ? text(node.props.children) : String(node)).join('');
/** Elements of `type` whose own text contains `label`. */
export const byText = (tree, type, label) => find(tree, node => node.type === type && text(node).includes(label), `${type} "${label}"`);
export const settle = () => new Promise(resolve => setTimeout(resolve, 0));
/** A stub component rendering a host element named `tag` that keeps its props (minus the noise). */
export const host = tag => function Host(all) { const props = { ...all }; delete props.asChild; delete props.variant; delete props.size; return React.createElement(tag, props); };
