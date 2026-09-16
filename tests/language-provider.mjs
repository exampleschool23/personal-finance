import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, exports);
  return exports;
}
const dictionaries = Object.fromEntries(['en', 'ru', 'uz'].map(lang =>
  [`./locales/${lang}.json`, { default: JSON.parse(fs.readFileSync(`lib/locales/${lang}.json`, 'utf8')) }]));
const i18n = load('lib/i18n.ts', dictionaries);

test('selector changes propagate to page, category, date locale, and back to English', () => {
  let language = 'en';
  const provider = load('components/language-provider.tsx', {
    react: { ...React, useState: () => [language, next => { language = next; }], useEffect: () => {} },
    'react/jsx-runtime': jsx,
    '@/lib/i18n': i18n,
  });
  let selector;
  function Page() {
    const { t, locale } = provider.useLanguage();
    selector = provider.LanguageSelector();
    return React.createElement('main', { lang: locale },
      selector, t('Assets & investments'), '|', t('Business'), '|', t('Add record'));
  }
  function render() {
    return renderToStaticMarkup(provider.LanguageProvider({ children: React.createElement(Page) }));
  }
  render();
  for (const lang of ['uz', 'ru', 'en']) {
    selector.props.onChange({ target: { value: lang } });
    const html = render();
    assert.equal(selector.props.value, lang);
    assert.ok(html.includes(`lang="${i18n.locales[lang]}"`));
    for (const key of ['Assets & investments', 'Business', 'Add record']) {
      const escaped = renderToStaticMarkup(React.createElement('span', null, i18n.translate(lang, key))).slice(6, -7);
      assert.ok(html.includes(escaped), `${lang}: ${key}`);
      if (lang !== 'en') assert.notEqual(i18n.translate(lang, key), key);
    }
  }
});

test('missing provider cannot silently leave the page in English', () => {
  const provider = load('components/language-provider.tsx', {
    react: React, 'react/jsx-runtime': jsx, '@/lib/i18n': i18n,
  });
  function Orphan() { provider.useLanguage(); return null; }
  assert.throws(() => renderToStaticMarkup(React.createElement(Orphan)), /within LanguageProvider/);
});
