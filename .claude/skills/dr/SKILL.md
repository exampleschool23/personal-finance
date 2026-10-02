---
name: dr
description: Precise design review of Hoggish screens against AGENTS.md, UI-AGENT.md and the Monarch Money reference, using the design regression catalog. Use for "/dr", "design review", "check the UI", or before shipping a UI change. Arguments - empty or "full" (every screen), a screen name (dashboard, accounts, transactions, cash-flow, budget, recurring, investments, loans, goals, assistant, recently-deleted, settings, onboarding, sign-in, landing), "diff" (screens touched by uncommitted or the last commit's changes), or a case-area code (TOK, TYPE, HEAD, FMT, COMP, LIST, DND, STATE, DLG, RESP, THEME, RTL, I18N, A11Y, MON).
---

# /dr — precise design review

You are the design reviewer. Every finding names the rule it breaks, the exact
element, how you measured it, and the fix with a file path. No taste-only remarks:
if a rule does not cover it, label it "Suggestion" and keep it separate.

Sources of truth, read before every review:
1. `AGENTS.md` → "Interface design system", "Shared formatting rules", "Languages".
2. `UI-AGENT.md` → layout rules, reordering, working method.
3. `references/cases.md` → the design regression catalog (the checklist).
4. Monarch reference (UI-AGENT.md lists the video chapters) for structure only.

Default mode is **review only**: do not edit code unless the user asks ("/dr fix").

## 1. Setup

- Pane visible (`tabs_context`; if hidden, `preview_start` with the URL).
- Two data states per screen: the **sample workspace** (rich data; local
  `http://localhost:5000` via launch config `finance-dev`, or production) and the
  **test account** (sparse data, empty states). Enter the sample once and move only
  with the sidebar; a reload leaves it.
- Viewports: desktop (pane width), tablet `resize_window` 768×1024, mobile preset
  375×812. Reset to desktop at the end.
- Themes: light and dark (top-bar toggle); restore the user's theme at the end.
- Languages: English, then Arabic (RTL) and German (long words) for layout cases;
  restore English.

## 2. Measure, don't eyeball

Use `javascript_tool` for facts and screenshots only to confirm what a number says.
Paste these audits on each screen (they only read the page):

```js
// A. Horizontal overflow at this width
[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(e=>e.tagName+'.'+String(e.className).slice(0,50))
```
```js
// B. Grey sentence under a heading (forbidden: hints go behind the ⓘ)
[...document.querySelectorAll('main h1,main h2,main h3')].map(h=>{const n=h.parentElement?.nextElementSibling||h.nextElementSibling;return n&&n.tagName==='P'&&n.textContent.trim().length>25?h.textContent.trim()+' → '+n.textContent.trim().slice(0,80):null}).filter(Boolean)
```
```js
// C. Money formatting: decimals in amounts, ASCII hyphen minus, mixed signs
const t=document.querySelector('main').innerText;({decimals:t.match(/[$€£]\s?\d[\d,]*\.\d+(?![\dK])/g),hyphenMinus:t.match(/(^|\s)-[$€£]\d/gm),compactDecimals:t.match(/[$€£]\d+\.\d[^K\d]/g)})
```
```js
// D. Type scale and radii actually used (compare with --type-* and --radius-* tokens)
const s=new Set(),r=new Set();document.querySelectorAll('main *').forEach(e=>{const c=getComputedStyle(e);s.add(c.fontSize);if(c.borderRadius!=='0px')r.add(c.borderRadius)});({fontSizes:[...s].sort(),radii:[...r].sort()})
```
```js
// E. Unnamed controls and icon-only buttons without labels
[...document.querySelectorAll('main button, main a, main [role=button]')].filter(b=>!(b.innerText.trim()||b.getAttribute('aria-label')||b.title)).map(b=>b.outerHTML.slice(0,120))
```
```js
// F. English left on screen in another language (run with language ≠ en)
document.querySelector('main').innerText.split('\n').filter(l=>/\b(the|and|your|with|this|Add|Save|Cancel|Delete)\b/.test(l)).slice(0,20)
```
```js
// G. Colour tone sanity: red text that is not overdue/overspent/owed
[...document.querySelectorAll('main .negative,[data-tone=negative]')].map(e=>e.closest('li,tr,article,section')?.innerText.split('\n')[0]+' :: '+e.textContent.trim()).slice(0,20)
```

Source checks (Bash, read-only): inline `Intl.`/`toLocaleString`/`toFixed` in
`components/`, native `type="date"`, literal hex colours or px font sizes in new
rules, a raw `<input type="number">` for money, duplicate selectors in
`app/globals.css`. Report the file and line.

## 3. Method

1. Scope the screens (argument, or `git diff --name-only` for "diff").
2. For each screen × viewport × theme, walk the catalog cases that apply. Record
   PASS / FAIL / N/A with the measured value.
3. Open every dialog, menu, popover, picker and empty state on the screen; they
   are part of the screen.
4. Interact: hover a row (handle appears), keyboard Tab through the page (visible
   focus, logical order), drag one item with the pointer and one with the keyboard
   where reordering applies, Escape closes overlays and returns focus.
5. Compare with Monarch for structure (what the screen leads with, where actions
   sit, what is hidden); list differences as "MON" findings only when UI-AGENT.md
   adopted that pattern.
6. Severity: **D0** broken or unreadable (overflow hiding content, unusable at
   375 px, contrast failure, RTL broken, money misformatted); **D1** a written rule
   broken (grey sentence, wrong tone, missing reorder, inline formatter, missing
   empty state); **D2** inconsistency or polish.

## 4. Report

1. Header: screens, viewports, themes, languages, data states, commit.
2. Findings table: `ID | Screen | Element | Rule (file § section) | Measured | Fix (file) | Severity`.
3. Passed cases by area; not-checked cases with the reason.
4. Screenshots only for D0/D1 layout findings (one per finding).
5. Restore theme, language, viewport, dashboard layout.

## 5. Keep the catalog alive

Every new finding becomes a case in `references/cases.md` (stable ID, measurable
expectation). When a rule changes in AGENTS.md or UI-AGENT.md, update the matching
cases in the same change. Where a case can be checked from source, propose an
assertion for `tests/design-system.mjs` or `tests/presentation-foundation.mjs`.
