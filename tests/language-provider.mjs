import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

import {loadTS as load} from './helpers/load-ts.mjs';
const i18n = load('lib/i18n.ts');

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
