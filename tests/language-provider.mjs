import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

import {loadTS as load} from './helpers/load-ts.mjs';
const i18n = load('lib/i18n.ts');

test('language changes propagate to page, category, date locale, and back to English', () => {
  let language = 'en';
  const provider = load('components/language-provider.tsx', {
    react: { ...React, useState: () => [language, next => { language = next; }], useEffect: () => {} },
    'react/jsx-runtime': jsx,
    '@/lib/i18n': i18n,
  });
  let setter;
  function Page() {
    const { t, locale } = provider.useLanguage();
    setter = provider.useLanguage().setLanguage;
    return React.createElement('main', { lang: locale },
      t('Assets & investments'), '|', t('Business'), '|', t('Add record'));
  }
  function render() {
    return renderToStaticMarkup(provider.LanguageProvider({ children: React.createElement(Page) }));
  }
  render();
  for (const lang of ['uz', 'ru', 'ar', 'ja', 'es-MX', 'en']) {
    setter(lang);
    const html = render();
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

test('the browser language picks the first supported language, with English as the fallback', () => {
  assert.equal(i18n.detectLanguage(['ru-RU', 'en-US']), 'ru');
  assert.equal(i18n.detectLanguage(['uz-Cyrl-UZ']), 'uz');
  assert.equal(i18n.detectLanguage(['es-MX']), 'es-MX');
  assert.equal(i18n.detectLanguage(['es-419']), 'es-MX');
  assert.equal(i18n.detectLanguage(['es-ES']), 'es');
  assert.equal(i18n.detectLanguage(['pt-PT']), 'pt');
  assert.equal(i18n.detectLanguage(['zh-TW']), 'zh');
  assert.equal(i18n.detectLanguage(['fr-CA', 'en']), 'fr');
  assert.equal(i18n.detectLanguage(['hi-IN']), 'hi');
  assert.equal(i18n.detectLanguage(['ur']), 'ur');
  assert.equal(i18n.detectLanguage(['bn-BD']), 'bn');
  assert.equal(i18n.detectLanguage(['th']), 'th');
  assert.equal(i18n.detectLanguage(['vi-VN']), 'vi');
  assert.equal(i18n.detectLanguage(['ar-SA']), 'ar');
  assert.equal(i18n.detectLanguage(['ja', 'ko']), 'ja');
  assert.equal(i18n.detectLanguage(['de-DE', 'uz', 'ru']), 'de');
  assert.equal(i18n.detectLanguage(['fi-FI', 'uz', 'ru']), 'uz');
  assert.equal(i18n.detectLanguage(['tr-TR']), 'tr');
  assert.equal(i18n.detectLanguage(['fil-PH']), 'fil');
  assert.equal(i18n.detectLanguage(['he-IL']), 'he');
  assert.equal(i18n.detectLanguage(['pl', 'en']), 'pl');
  assert.equal(i18n.detectLanguage(['fi-FI', 'sv']), 'en');
  assert.equal(i18n.detectLanguage(['EN-gb']), 'en');
  assert.equal(i18n.detectLanguage(['fi-FI', 'sv']), 'en');
  assert.equal(i18n.detectLanguage([]), 'en');
  assert.equal(i18n.detectLanguage(undefined), 'en');
});

test('a saved default wins over the browser, and the browser is never written as a default', () => {
  const run = (saved, languages) => {
    const effects = [], updates = [], stored = [];
    const provider = load('components/language-provider.tsx', {
      react: { ...React, useState: () => ['en', next => updates.push(next)], useEffect: effect => effects.push(effect) },
      'react/jsx-runtime': jsx,
      '@/lib/i18n': i18n,
    });
    const previous = { localStorage: globalThis.localStorage, window: globalThis.window, queueMicrotask: globalThis.queueMicrotask };
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    globalThis.localStorage = { getItem: () => saved, setItem: (key, value) => stored.push([key, value]) };
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.queueMicrotask = callback => callback();
    Object.defineProperty(globalThis, 'navigator', { value: { languages, language: languages[0] }, configurable: true });
    try { provider.LanguageProvider({ children: null }); effects[0](); }
    finally {
      Object.assign(globalThis, previous);
      if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    }
    return { updates, stored };
  };
  assert.deepEqual(run(null, ['ru-RU']).updates, ['ru']);
  assert.deepEqual(run(null, ['uz']).updates, ['uz']);
  assert.deepEqual(run(null, ['de']).updates, ['de']);
  assert.deepEqual(run(null, ['fi']).updates, []);
  assert.deepEqual(run('ru', ['en-US']).updates, ['ru']);
  assert.deepEqual(run('uz', ['ru-RU']).updates, ['uz']);
  // A saved value this version does not offer is ignored, so the browser decides.
  assert.deepEqual(run('xx', ['ru-RU']).updates, ['ru']);
  assert.deepEqual(run(null, ['ru-RU']).stored, []);
});
