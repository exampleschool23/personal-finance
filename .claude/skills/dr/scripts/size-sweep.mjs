// /dr size sweep (SKILL.md §2): every workspace screen of the sample workspace at phone, landscape, tablet and desktop sizes,
// with Audits A (overflow), J (touch targets), M (overlap), N (broken words) and the 16px field check; DIALOGS=1 also opens
// every page button's dialog, menu or popover and runs Audit O inside it. Read-only: demo-mode changes stay in this browser.
// Run from the repository root with a dev server up: `node .claude/skills/dr/scripts/size-sweep.mjs`.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = process.env.BASE || 'http://localhost:5000';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const lang = process.env.LANG_CODE || 'en';
const routes = ['/', '/accounts', '/transactions', '/income-expenses', '/reports', '/budget', '/upcoming', '/assets', '/loans-debts', '/goals', '/assistant', '/recently-deleted', '/settings'].filter(r => !only || only.includes(r));
const touchSizes = [[280, 653], [320, 568], [375, 812], [667, 375], [768, 1024], [1024, 768]];
const fineSizes = [[768, 1024], [1024, 768], [1185, 800], [1440, 900]];
const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

const audit = (touch) => {
  const id = e => e.tagName.toLowerCase() + '.' + String(e.className?.baseVal ?? e.className).split(' ').filter(Boolean).slice(0, 2).join('.');
  const label = e => (e.innerText || e.getAttribute('aria-label') || e.title || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
  const root = document.querySelector('main') || document.body;
  const all = [...root.querySelectorAll('*')].filter(e => e.getClientRects().length && e.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }));
  const visible = e => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.visibility === 'hidden' || c.display === 'none') return false; if (p.closest('thead') && c.clip !== 'auto') return false; } return true; };
  const res = {};
  res.pageScroll = document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth + '>' + innerWidth : null;
  res.out = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('[data-scroll-area],.table-scroll,.recharts-wrapper') && !e.closest('thead') && visible(e) && !(() => { for (let p = e.parentElement; p; p = p.parentElement) { if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) return true; } return false; })(); }).slice(0, 8).map(id);
  res.clipped = all.filter(e => { const c = getComputedStyle(e); return /hidden|clip/.test(c.overflowX) && c.textOverflow !== 'ellipsis' && e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1 && e.querySelector('button,a,span,p,strong') && !e.matches('.sr-only,[data-slot=chart],.recharts-wrapper,svg *'); }).slice(0, 8).map(e => id(e) + ' ' + e.scrollWidth + '>' + e.clientWidth);
  res.stripScroll = all.filter(e => /auto|scroll/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1 && e.matches('.segmented,.page-tabs,[role=tablist],.row-actions,.filters,.toolbar,form')).map(id);
  res.truncated = all.filter(e => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && !e.matches('.topbar-page-title h1')).slice(0, 8).map(e => e.textContent.trim().slice(0, 30));
  res.brokenWords = (() => { const hits = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode()) && hits.length < 8;) { if (!n.parentElement?.offsetParent || n.parentElement.closest('svg,.sr-only') || getComputedStyle(n.parentElement).hyphens === 'auto') continue; for (const m of n.textContent.matchAll(/[^\s\-\u2010\u2011\u2013\u2014/]{3,}/g)) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const tops = new Set([...r.getClientRects()].filter(q => q.width > 0).map(q => Math.round(q.top))); if (tops.size > 1) { hits.push(id(n.parentElement) + ' "' + m[0].slice(0, 24) + '"'); break; } } } return hits; })();
  res.overlap = (() => { const leaf = [...root.querySelectorAll('button,a,input,select,.status-badge,[class*=badge],strong,small,h1,h2,h3,label,span,p,td')].filter(e => { if (!e.offsetParent || !e.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) || e.closest('svg,.recharts-wrapper,.sr-only,[data-dragging],.drag-handle')) return false; const own = e.getBoundingClientRect(); for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p); if (/fixed|sticky/.test(c.position) || c.visibility === 'hidden' || c.opacity === '0') return false; if (p !== e && /hidden|clip|auto|scroll/.test(c.overflowX + c.overflowY)) { const q = p.getBoundingClientRect(); if (own.bottom <= q.top + 1 || own.top >= q.bottom - 1 || own.right <= q.left + 1 || own.left >= q.right - 1) return false; } } const t = e.matches('button,a,input,select') || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!t) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight * 6; }); const boxes = leaf.map(e => [e, e.getBoundingClientRect()]); const hits = []; for (let i = 0; i < boxes.length && hits.length < 8; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, r] = boxes[i], [b, q] = boxes[j]; if (a.contains(b) || b.contains(a) || a.className === b.className && a.matches('.recurring-bar')) continue; const w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); if (w > 3 && h > 3) { hits.push(id(a) + ' "' + label(a) + '" × ' + id(b) + ' "' + label(b) + '" ' + Math.round(w) + 'x' + Math.round(h)); break; } } return hits; })();
  if (touch) {
    res.small = [...document.querySelectorAll('button,a,[role=button],input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,summary')].filter(e => e.offsetParent && visible(e) && e.checkVisibility() && e.offsetHeight < 44 && !e.closest('p,.month-calendar,[data-calendar],.info-hint,.recharts-wrapper,nav[aria-label*=reak]') && !e.matches('.info-hint')).slice(0, 12).map(e => e.offsetHeight + 'px ' + label(e));
    res.input16 = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).slice(0, 8).map(e => getComputedStyle(e).fontSize + ' ' + (e.getAttribute('aria-label') || e.name || e.placeholder || id(e)));
  }
  return Object.fromEntries(Object.entries(res).filter(([, v]) => v && (!Array.isArray(v) || v.length)));
};

const dialogAudit = () => {
  const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[data-slot=popover-content],[role=menu]')].filter(e => e.offsetParent || getComputedStyle(e).position === 'fixed').pop();
  if (!d) return null;
  const r = d.getBoundingClientRect(), res = { title: (d.querySelector('h2,h1,[data-slot$=title]')?.textContent || d.getAttribute('aria-label') || d.getAttribute('role')).trim().slice(0, 40) };
  const issues = [];
  if (r.left < -1 || r.right > innerWidth + 1) issues.push(`wider than screen ${Math.round(r.left)}..${Math.round(r.right)}/${innerWidth}`);
  if (r.top < -1 || r.bottom > innerHeight + 1) {
    // fine when the dialog itself or a child scrolls so its end is reachable
    const scroller = [d, ...d.querySelectorAll('*')].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1);
    if (!scroller || r.top < -1) issues.push(`taller than screen ${Math.round(r.top)}..${Math.round(r.bottom)}/${innerHeight}${scroller ? ' (scroller inside)' : ' no scroller'}`);
  }
  if (d.scrollWidth > d.clientWidth + 1) issues.push(`sideways scroll ${d.scrollWidth}>${d.clientWidth}`);
  const inner = [...d.querySelectorAll('*')].filter(e => { const c = getComputedStyle(e); const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > r.right + 1 || q.left < r.left - 1) && !e.closest('.sr-only') && !/hidden|auto|scroll|clip/.test(getComputedStyle(e.parentElement).overflowX) && c.position !== 'fixed'; });
  if (inner.length) issues.push('content past dialog edge: ' + inner.slice(0, 4).map(e => e.tagName.toLowerCase() + '.' + String(e.className?.baseVal ?? e.className).split(' ')[0] + ' "' + (e.innerText || '').trim().slice(0, 18) + '"').join(', '));
  const clipped = [...d.querySelectorAll('*')].filter(e => { const c = getComputedStyle(e); return /hidden|clip/.test(c.overflowX) && c.textOverflow !== 'ellipsis' && e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1 && !e.matches('.sr-only'); });
  if (clipped.length) issues.push('clipped: ' + clipped.slice(0, 4).map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + e.scrollWidth + '>' + e.clientWidth).join(', '));
  if (matchMedia('(pointer: coarse)').matches) {
    const small = [...d.querySelectorAll('button,a,[role=button],input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,summary,[role=menuitem]')].filter(e => e.offsetParent && e.offsetHeight < 44 && !e.closest('p,.month-calendar,[data-calendar]') && !e.matches('.info-hint'));
    if (small.length) issues.push('small targets: ' + small.slice(0, 6).map(e => e.offsetHeight + 'px ' + (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20)).join(', '));
    const fonts = [...d.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16);
    if (fonts.length) issues.push('inputs <16px: ' + fonts.slice(0, 4).map(e => getComputedStyle(e).fontSize + ' ' + (e.getAttribute('aria-label') || e.name || e.placeholder || '?')).join(', '));
  }
  // buttons in the footer: equal height, none wrapped onto two lines of text
  const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent && b.innerText.trim());
  // A label that wraps: one of the button's own text runs spans two lines (an icon or a description line beside it does not count).
  const wrapped = btns.filter(b => { const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); if (new Set([...r.getClientRects()].filter(q => q.width > 0).map(q => Math.round(q.top / 4))).size > 1) return true; } return false; });
  if (wrapped.length) issues.push('button text on 2+ lines: ' + wrapped.slice(0, 4).map(b => b.innerText.trim().replace(/\s+/g, ' ').slice(0, 24)).join(', '));
  res.issues = issues;
  return res;
};

async function enterDemo(page) {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const label = JSON.parse(fs.readFileSync(new URL('../../../../lib/locales/' + lang + '.json', import.meta.url), 'utf8'))['Explore sample workspace'];
  await page.getByRole('button', { name: label }).first().click();
  await page.waitForSelector('main [data-page]', { timeout: 60000 });
  await page.waitForTimeout(1500);
}
async function go(page, route) {
  // A drawer link clicked from script, so an open popover or toast cannot block it; without the drawer, enter the sample again.
  const clicked = new URL(page.url()).pathname === route || await page.evaluate(r => { const a = document.querySelector(`a[href="${r}"]`); a?.click(); return !!a; }, route);
  if (!clicked) { await enterDemo(page); return go(page, route); }
  await page.waitForFunction(r => location.pathname === r, route, { timeout: 30000 });
  await page.waitForSelector('main [data-page]', { timeout: 30000 });
  await page.waitForTimeout(1200);
}

const skipBtn = /delete|remove|sign out|log out|reset|clear|disconnect|stop|archive|leave|export|download|import|connect|upload|copy|print|send|share|invite|revoke|enable|pause|restore|undo|save|apply|record payment|skip|mark|use |sell|close|move|duplicate|o'chir|удал/i;

async function dialogsOn(page, route, tag) {
  const buttons = await page.$$eval('main button:not([disabled]), header button:not([disabled])', bs => bs.map((b, i) => ({ i, name: (b.getAttribute('aria-label') || b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), popup: b.getAttribute('aria-haspopup') })).filter(b => b.name));
  const seen = new Set();
  for (const b of buttons) {
    if (seen.has(b.name) || skipBtn.test(b.name) || /^(Light|Dark|Theme|Previous|Next|Show|Hide|Collapse|Expand|Toggle)/i.test(b.name)) continue;
    seen.add(b.name);
    const handle = (await page.$$('main button:not([disabled]), header button:not([disabled])'))[b.i];
    if (!handle || !(await handle.isVisible())) continue;
    const beforeUrl = page.url();
    try { await handle.click({ timeout: 2000 }); } catch { continue; }
    await page.waitForTimeout(450);
    const d = await page.evaluate(dialogAudit);
    if (d && d.issues.length) log(`  DIALOG ${tag} ${route} [${b.name}] → "${d.title}": ${d.issues.join(' | ')}`);
    for (let k = 0; k < 3; k++) {
      if (!(await page.$('[role=dialog],[role=alertdialog],[data-slot=popover-content],[role=menu]'))) break;
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      const discard = page.getByRole('button', { name: /^Discard/ });
      if (await discard.count()) { await discard.first().click(); await page.waitForTimeout(250); }
    }
    if (page.url() !== beforeUrl) await go(page, route);
  }
}

const browser = await chromium.launch();
const mk = async (touch) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: touch, isMobile: touch, locale: lang, extraHTTPHeaders: { 'Accept-Language': lang } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('  PAGEERROR', e.message.slice(0, 160)));
  await enterDemo(page);
  return page;
};
for (const [touch, sizes] of [[false, fineSizes], [true, touchSizes]].filter(([t]) => !process.env.TOUCH_ONLY || t)) {
  const page = await mk(touch);
  for (const route of routes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press('Escape');
    try { await go(page, route); } catch (error) { log(`${touch ? 'touch' : 'fine'} ${route} NOT REACHED: ${error.message.split('\n')[0]}`); await enterDemo(page); continue; }
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      const r = await page.evaluate(audit, touch);
      if (Object.keys(r).length) log(`${touch ? 'touch' : 'fine'} ${w}x${h} ${route}`, JSON.stringify(r));
      if (process.env.DIALOGS && (w === 320 || w === 667 || w === 1024 && !touch)) await dialogsOn(page, route, `${touch ? 'touch' : 'fine'} ${w}x${h}`);
    }
  }
}
await browser.close();
if (process.env.OUT) fs.writeFileSync(process.env.OUT, out.join('\n'));
if (!out.length) console.log('No findings.');
