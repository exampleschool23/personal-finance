// A DOM-free renderer for component tests. Components loaded with `renderer.load` (or with `renderer.react` as their
// 'react') keep hook state per position, run their effects after each render and render again when state changes,
// so a test can call event handlers straight from the tree and read the result.
//
// The tree mirrors what React would mount: a list of nodes `{type, key, props, children}`. Host elements have a
// string `type`; function components stay in the tree too, with their own `type` and props and the output they
// rendered as `children`, so a test can find a stubbed child by its function and call its props. Library components
// that were not loaded through the renderer (a forwardRef icon) stay unrendered nodes with their object `type`. `props` are the
// props as written (`props.children` unexpanded); `children` is the rendered content: nodes and text strings.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTS } from './load-ts.mjs';

const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
const hostTag = Symbol('host tag');

/** `attach(node)` returns what a host element's `ref` points at (a fake DOM node), or null. */
export function createRenderer({ attach = () => null } = {}) {
 const instances = new Map();
 let current = null, cursor = 0, dirty = false, ids = 0, rendered = new Set(), root = null, tree = [];
 const pending = [];
 const slot = () => [current, cursor++];
 const hooks = {
  useState(initial) {
   const [instance, index] = slot();
   if (!(index in instance.hooks)) instance.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
   const state = instance.hooks[index];
   return [state.value, next => { const value = typeof next === 'function' ? next(state.value) : next; if (!Object.is(value, state.value)) { state.value = value; dirty = true; } }];
  },
  // No providers here: a context reads its default value, as React does outside a provider.
  useContext(context) { return context._currentValue; },
  useRef(initial) { const [instance, index] = slot(); return instance.hooks[index] ?? (instance.hooks[index] = { current: initial }); },
  useId() { const [instance, index] = slot(); return (instance.hooks[index] ??= { id: ':r' + (ids++) + ':' }).id; },
  useMemo(factory, deps) { const [instance, index] = slot(); if (changed(instance.hooks[index]?.deps, deps)) instance.hooks[index] = { deps, value: factory() }; return instance.hooks[index].value; },
  useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
  useEffect(effect, deps) {
   const [instance, index] = slot(), old = instance.hooks[index];
   if (!changed(old?.deps, deps)) return;
   const hook = instance.hooks[index] = { deps, cleanup: old?.cleanup };
   pending.push(() => { hook.cleanup?.(); hook.cleanup = effect(); });
  },
  useSyncExternalStore(subscribe, snapshot) {
   const [instance, index] = slot();
   instance.hooks[index] ??= { cleanup: subscribe(() => { dirty = true; }) };
   return snapshot();
  },
  // A stable function that always calls the latest callback it was given.
  useEffectEvent(callback) { const [instance, index] = slot(), hook = instance.hooks[index] ??= {}; hook.callback = callback; return hook.call ??= (...args) => hook.callback(...args); },
  forwardRef: render => Object.assign(props => render(props, props.ref), { displayName: render.displayName || render.name }),
  memo: component => component,
 };
 hooks.useLayoutEffect = hooks.useEffect;
 const react = { ...React, ...hooks };
 react.default = react;

 const cleanup = instance => { for (const hook of instance.hooks) { hook?.cleanup?.(); if (hook) hook.cleanup = undefined; } };
 function component(node, type, props, path, render) {
  const id = path + ':' + (type.displayName || type.name || 'anonymous');
  rendered.add(id);
  const instance = instances.get(id) ?? { hooks: [] };
  instances.set(id, instance);
  const previous = [current, cursor];
  current = instance; cursor = 0;
  let output;
  try { output = render(); } finally { [current, cursor] = previous; }
  return [{ type, key: node.key, props, children: expand(output, id + '>') }];
 }
 function expand(node, path) {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((child, i) => expand(child, path + '.' + (child?.key ?? i)));
  if (!React.isValidElement(node)) return [];
  const { type, props } = node;
  if (type === React.Fragment) return expand(props.children, path + '~');
  if (type?.[hostTag]) return expand(type(props), path);
  if (typeof type === 'function') return component(node, type, props, path, () => type(props));
  // Host elements, and components from outside the loaded modules (a library's forwardRef icon), which keep their
  // props and children but are not run: they would need React's own hooks.
  const host = { type, key: node.key, props, children: expand(props.children, path + '/' + String(type)) };
  if (props.ref) { const target = attach(host); if (typeof props.ref === 'function') props.ref(target); else if (target != null) props.ref.current = target; }
  return [host];
 }
 /** Renders the current root until no effect or store changes state, and returns the tree. */
 function update() {
  for (let pass = 0; pass < 50; pass++) {
   dirty = false; rendered = new Set();
   tree = expand(root, 'root');
   for (const [id, instance] of instances) if (!rendered.has(id)) { cleanup(instance); instances.delete(id); }
   while (pending.length) pending.shift()();
   if (!dirty) return tree;
  }
  throw Error('Render loop did not settle');
 }
 const renderer = {
  react,
  /** Loads a module with this renderer as its React. */
  load: (file, overrides = {}) => loadTS(file, { react, ...overrides }),
  /** Renders `element`; components already at the same position keep their state, as in React. */
  render(element) { root = element; return update(); },
  /** Renders `element` from scratch, unmounting whatever was rendered before. */
  mount(element) { for (const instance of instances.values()) cleanup(instance); instances.clear(); return renderer.render(element); },
  /** Renders the current root again (after a handler changed state). */
  update,
  get tree() { return tree; },
  /** Lets pending promises and timers' callbacks run, rendering after each turn. */
  async flush(turns = 6) { for (let i = 0; i < turns; i++) { await new Promise(resolve => setImmediate(resolve)); update(); } return tree; },
  /** Runs every effect cleanup and store unsubscribe, as an unmount does. The last tree stays readable, and
   * a later `update` shows whether anything still changed state after its cleanup. */
  unmount() { for (const instance of instances.values()) cleanup(instance); },
  /** Static markup of the tree, as React would render it. */
  html: () => renderToStaticMarkup(toElement(tree)),
  all: (predicate, within = tree) => [...walk(within)].filter(predicate),
  find(predicate, within = tree) { const found = renderer.all(predicate, within); if (!found.length) throw Error('No matching node'); return found[0]; },
  /** Calls a node's handler and renders again; returns the handler's result. */
  fire(node, handler, ...args) { const result = node.props[handler](...args); update(); return result; },
  async fireAsync(node, handler, ...args) { const result = await node.props[handler](...args); await renderer.flush(); return result; },
 };
 return renderer;
}

const toElement = item => {
 if (Array.isArray(item)) return item.map(toElement);
 if (typeof item === 'string') return item;
 if (typeof item.type === 'object') return React.createElement(item.type, item.props);
 const children = item.children.map(toElement);
 if (typeof item.type !== 'string') return React.createElement(React.Fragment, null, ...children);
 const props = { ...item.props };
 delete props.children;
 return React.createElement(item.type, props, ...children);
};

/** Every node in document order, a component before what it rendered. */
export function* walk(nodes) {
 for (const node of [].concat(nodes ?? [])) if (node && typeof node === 'object') { yield node; yield* walk(node.children); }
}
/** The text of tree nodes, or of unrendered elements (such as `props.children`) from their written children. */
export const text = nodes => [].concat(nodes ?? []).map(node => node === null || node === undefined || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : text(React.isValidElement(node) ? node.props.children : node.children)).join('');
const isHost = node => typeof node.type === 'string';
/** Nodes of `type`; with `contains`, only those whose text includes it. */
export const byType = (type, contains) => node => node.type === type && (contains === undefined || text(node).includes(contains));
/** Host elements (of `type`, when given) whose whole text is `content`. */
export const byText = (type, content) => node => (type ? node.type === type : isHost(node)) && text(node) === content;
/** Host elements with this aria-label. */
export const byLabel = label => node => isHost(node) && node.props['aria-label'] === label;
/** A DOM-like event that records preventDefault. */
export const event = (extra = {}) => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra });

/** English-like translator that fills {placeholders}. */
export const translate = (message, values = {}) => String(message).replace(/\{(\w+)\}/g, (match, key) => key in values ? String(values[key]) : match);
export const language = (locale = 'en') => ({ useLanguage: () => ({ t: translate, locale, language: locale }) });
/** A module whose every export is a host element named after it (Button, Popover, ...) that keeps its props. */
export const hostModule = (extra = {}) => new Proxy(extra, { get: (target, name) => name in target ? target[name] : name === '__esModule' || typeof name === 'symbol' ? undefined : String(name) });
/** A CSS module whose class names are their keys. */
export const cssModule = () => new Proxy({}, { get: (_, name) => name === '__esModule' || typeof name === 'symbol' ? undefined : name === 'default' ? cssModule() : String(name) });
/** A stub component that renders the host element `tag` with its props (minus asChild, variant and size); the
 * renderer shows only that element, while React (for server markup) calls it as a component. */
export const host = tag => Object.assign(function Host(all) { const props = { ...all }; delete props.asChild; delete props.variant; delete props.size; return React.createElement(tag, props); }, { [hostTag]: tag });

/** Named stand-ins for UI primitives: each renders plain markup and stays in the tree with its props. */
export function stubs() {
 const h = React.createElement;
 const named = (name, render) => Object.assign(render, { displayName: name });
 const Button = named('Button', ({ children, disabled, type, variant }) => h('button', { disabled, type, 'data-variant': variant }, children));
 const NativeSelect = named('NativeSelect', ({ children, disabled }) => h('select', { disabled }, children));
 const DatePicker = named('DatePicker', ({ value, min, max }) => h('span', { 'data-date': value, 'data-min': min, 'data-max': max }));
 const FormattedNumberInput = named('FormattedNumberInput', ({ value, max, maxMessage }) => h('span', { 'data-number': value, 'data-max': max, 'data-max-message': maxMessage }));
 const Dialog = named('Dialog', ({ children }) => h('section', null, children));
 const DialogContent = named('DialogContent', ({ children, className }) => h('div', { className }, children));
 const DialogTitle = named('DialogTitle', ({ children }) => h('h2', null, children));
 const DialogDescription = named('DialogDescription', ({ children }) => h('p', { className: 'description' }, children));
 const FormFooter = named('FormFooter', ({ children, cancelLabel }) => h('footer', { 'data-cancel': cancelLabel }, children));
 const ErrorPopup = named('ErrorPopup', ({ message, detail }) => message ? h('p', { role: 'alert', 'data-detail': detail }, message) : null);
 const ExchangeRatePreview = named('ExchangeRatePreview', ({ fx }) => h('p', { className: 'fx' }, 'rate ' + fx.rate));
 // The ⓘ keeps its explanation in an attribute, so a title's text stays the title.
 const InfoHint = named('InfoHint', ({ children }) => h('i', { 'data-hint': text(children) }));
 return {
  Button, NativeSelect, DatePicker, FormattedNumberInput, Dialog, DialogContent, DialogTitle, DialogDescription, FormFooter, ErrorPopup, ExchangeRatePreview, InfoHint,
  modules: {
   '@/components/ui/button': { Button },
   '@/components/ui/native-select': { NativeSelect },
   '@/components/presentation-foundation/date-picker': { DatePicker },
   '@/components/presentation-foundation/formatted-number-input': { FormattedNumberInput },
   '@/components/ui/dialog': { Dialog, DialogContent, DialogTitle, DialogDescription },
   '@/components/presentation-foundation/form-footer': { FormFooter },
   '@/components/presentation-foundation/error-popup': { ErrorPopup },
   '@/components/presentation-foundation/exchange-rate-preview': { ExchangeRatePreview },
   '@/components/presentation-foundation/info-hint': { InfoHint },
   '@/components/language-provider': language('en-US'),
  },
 };
}
