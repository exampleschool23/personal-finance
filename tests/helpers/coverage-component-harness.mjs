import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// A minimal hook runtime: components loaded with `harness.react` as their 'react' import keep state between
// explicit renders, so a test can call event handlers from the returned element tree and render again.
export function createHarness() {
 let slots = [], cursor = 0, pending = [], ids = 0;
 const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
 const react = {
  ...React,
  default: React,
  useState(initial) {
   const index = cursor++;
   if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
   const slot = slots[index];
   return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  },
  useRef(initial) { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
  useId() { const index = cursor++; return slots[index] ?? (slots[index] = ':r' + (ids++) + ':'); },
  useMemo(factory, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
  useCallback(callback, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { deps, callback }; return slots[index].callback; },
  useEffect(effect, deps) {
   const index = cursor++;
   const old = slots[index];
   if (!old || changed(old.deps, deps)) {
    slots[index] = { deps };
    pending.push(() => { old?.cleanup?.(); const cleanup = effect(); slots[index].cleanup = cleanup; });
   }
  },
 };
 function mount(Component, initialProps) {
  slots = []; cursor = 0; pending = [];
  const view = {
   props: initialProps,
   tree: null,
   render(nextProps) {
    if (nextProps) view.props = { ...view.props, ...nextProps };
    cursor = 0;
    view.tree = Component(view.props);
    while (pending.length) pending.shift()();
    return view;
   },
   unmount() { for (const slot of slots) slot?.cleanup?.(); },
   html: () => renderToStaticMarkup(view.tree),
   all: predicate => [...walk(view.tree)].filter(predicate),
   find(predicate) {
    const found = view.all(predicate);
    if (!found.length) throw Error('No element matched');
    return found[0];
   },
   byType: (type, label) => view.find(element => element.type === type && (label === undefined || text(element).includes(label))),
   async settle() { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); return view.render(); },
  };
  return view.render();
 }
 return { react, mount };
}

export function* walk(node) {
 if (Array.isArray(node)) { for (const child of node) yield* walk(child); return; }
 if (!React.isValidElement(node)) return;
 yield node;
 for (const [key, value] of Object.entries(node.props ?? {})) {
  if (key === 'children' || React.isValidElement(value) || Array.isArray(value)) yield* walk(value);
 }
}

export function text(node) {
 if (node === null || node === undefined || typeof node === 'boolean') return '';
 if (typeof node === 'string' || typeof node === 'number') return String(node);
 if (Array.isArray(node)) return node.map(text).join('');
 if (React.isValidElement(node)) return text(node.props.children);
 return '';
}

export const translate = (value, values = {}) => value.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? key);
export const language = { useLanguage: () => ({ locale: 'en-US', t: translate }) };

// Named stand-ins for UI primitives: each renders plain markup and keeps its props for handler calls.
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
 return {
  Button, NativeSelect, DatePicker, FormattedNumberInput, Dialog, DialogContent, DialogTitle, DialogDescription, FormFooter, ErrorPopup, ExchangeRatePreview,
  modules: {
   '@/components/ui/button': { Button },
   '@/components/ui/native-select': { NativeSelect },
   '@/components/presentation-foundation/date-picker': { DatePicker },
   '@/components/presentation-foundation/formatted-number-input': { FormattedNumberInput },
   '@/components/ui/dialog': { Dialog, DialogContent, DialogTitle, DialogDescription },
   '@/components/presentation-foundation/form-footer': { FormFooter },
   '@/components/presentation-foundation/error-popup': { ErrorPopup },
   '@/components/presentation-foundation/exchange-rate-preview': { ExchangeRatePreview },
   '@/components/language-provider': language,
  },
 };
}
