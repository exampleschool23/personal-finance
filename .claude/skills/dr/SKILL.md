---
name: dr
description: Precise design review of Hoggish screens against AGENTS.md, UI-AGENT.md and the reference app, using the design regression catalog. Use for "/dr", "design review", "check the UI", or before shipping a UI change. Arguments - empty or "full" (every screen), a screen name (dashboard, accounts, transactions, cash-flow, reports, budget, recurring, investments, loans, goals, assistant, recently-deleted, settings, onboarding, sign-in, landing, legal, account-access, connect), "diff" (screens touched by uncommitted or the last commit's changes), or a case-area code (TOK, TYPE, HEAD, FMT, COMP, LIST, DND, STATE, DLG, RESP, THEME, RTL, I18N, A11Y, MOT, REF, SCR).
---

# /dr — precise design review

You are the design reviewer. Every finding names the rule it breaks, the exact
element, how you measured it, and the fix with a file path. No taste-only remarks:
if a rule does not cover it, label it "Suggestion" and keep it separate.

Sources of truth, read before every review:
1. `AGENTS.md` → "Interface design system", "Shared formatting rules", "Languages".
2. `UI-AGENT.md` → layout rules, reordering, working method.
3. `references/cases.md` → the design regression catalog (the checklist).
4. The reference app (UI-AGENT.md lists the video chapters) for structure only.

Default mode is **review only**: do not edit code unless the user asks ("/dr fix").

## 1. Scope: screens, routes, files

Every page the app serves is one screen here; `tests/qa-design-catalogs.mjs` fails
when a route has no row, a file no longer exists, or a screen has no `SCR` case.
For "diff", map each changed file to the screens whose files (or whose imports)
include it; a change to `app/globals.css` or `app/styles/`, `components/presentation-foundation/`,
`components/workspace/` (shell) or `lib/format.ts` means every workspace screen.

| Screen | Routes | Files |
|---|---|---|
| dashboard | `/` | `components/workspace/screens/overview-screen.tsx`, `components/overview-page.tsx`, `components/dashboard-cards.tsx`, `components/dashboard-board.tsx` |
| accounts | `/accounts` | `components/workspace/screens/accounts-screen.tsx`, `components/planning/accounts-page.tsx`, `components/planning/accounts/account-cards.tsx`, `components/planning/accounts/account-directory.tsx`, `components/planning/accounts/account-activity.tsx` |
| transactions | `/transactions` | `components/workspace/screens/transactions-screen.tsx`, `components/transactions/pickers.tsx`, `components/transactions/bulk-edit.tsx`, `components/transactions/rule-dialog.tsx`, `components/transactions/rules-list.tsx` |
| reports | `/reports` | `components/workspace/screens/reports-screen.tsx`, `components/reports/cash-flow-tab.tsx`, `components/reports/attribute-tab.tsx`, `components/reports/report-filters.tsx`, `components/business-reports.tsx`, `components/tax-prep-sheet.tsx`, `components/business-card.tsx`, `components/business-setup-flow.tsx` |
| cash-flow | `/income-expenses` | `components/workspace/screens/cash-flow-screen.tsx`, `components/cash-flow-report.tsx`, `components/cash-forecast.tsx` |
| budget | `/budget` | `components/workspace/screens/budget-screen.tsx`, `components/budget/budget-rows.tsx`, `components/budget/planned-input.tsx`, `components/budget/left-to-budget-card.tsx`, `components/budget/settings-dialogs.tsx` |
| recurring | `/upcoming` | `components/workspace/screens/upcoming-screen.tsx`, `components/planning/upcoming-page.tsx` |
| investments | `/assets` | `components/workspace/screens/assets-screen.tsx`, `components/asset-dashboard.tsx`, `components/portfolio-allocation-plan.tsx` |
| loans | `/loans-debts` | `components/workspace/screens/loans-debts-screen.tsx`, `components/planning/debt-payoff-panel.tsx` |
| goals | `/goals` | `components/workspace/screens/goals-screen.tsx`, `components/planning/goals-page.tsx`, `components/planning/goal-setup-flow.tsx` |
| assistant | `/assistant` | `components/workspace/screens/assistant-screen.tsx` |
| recently-deleted | `/recently-deleted` | `components/workspace/screens/recently-deleted-screen.tsx`, `components/recently-deleted.tsx` |
| settings | `/settings` | `components/workspace/screens/settings-screen.tsx`, `components/settings-panel.tsx` |
| onboarding | `/` | `components/onboarding-screen.tsx`, `components/onboarding-screen.module.css` |
| sign-in | `/sign-in` | `components/sign-in-screen.tsx`, `components/sign-in-screen.module.css`, `components/phone-sign-in.tsx` |
| landing | `/` | `components/landing-page.tsx`, `components/landing-page.module.css` |
| legal | `/terms`, `/privacy` | `components/legal-page.tsx` |
| account-access | `/auth/access`, `/auth/confirm` | `components/account-access-panel.tsx` |
| connect | `/connect/telegram`, `/auth/telegram` | `app/connect/telegram/page.tsx`, `app/auth/telegram/page.tsx` |

`/benchmarks` only redirects to `/`. Onboarding shows at `/` after the first sign-in
(preview with the temporary URL flag, see memory `welcome-setup`); landing at `/`
signed out.

**Overlays are part of their screen; open each one.** Shell (every screen): Add
expense / record dialog (`components/record-dialog.tsx` and `components/record-dialog/`, income, expense, transfer
tabs), discard prompt, display-currency menu, drawer sheet on mobile, date picker.
Dashboard: Customize, Money invested popover, Comparison settings, Tracking since
picker. Accounts: add / edit account, Adjust balance, Transfer, Reconcile statement,
account ⋯ menu, delete confirm. Transactions: details (`transaction-details-dialog.tsx`),
Add transaction menu, Edit multiple, Rules, Create rule toast, rule delete confirm.
Cash flow: Split, income source add / edit / bonus, Monthly review, mortgage payment
(`mortgage-payment-dialog.tsx`), spending watchlist. Budget: settings (Flex,
Recalculate, apply to future months). Recurring: Record payment, Skip, Stop
(`stop-schedule-dialog.tsx`), skipped occurrences, reminders. Investments: add asset,
Sell / Buy (`planning/asset-movement-dialog.tsx`), Tracker, target allocation,
holding account (`planning/holding-account-dialog.tsx`), corporate event. Loans:
add record, Record payment, payoff planner, Save plan. Goals: add-goal stepper,
goal detail, edit, scenarios, delete confirm. Settings: delete category
(`delete-category-dialog.tsx`), Telegram connect, import mapping, security.

## 2. Setup

- Pane visible (`tabs_context`; if hidden, `preview_start` with the URL).
- Two data states per screen: the **sample workspace** (rich data; local
  `http://localhost:5000` via launch config `finance-dev` when a dev server already
  runs, otherwise `finance-dev-start`; or production) and the
  **test account** (sparse data, empty states). Enter the sample once and move only
  with the sidebar; a reload leaves it.
- Viewports: desktop (pane width), tablet `resize_window` 768×1024, mobile preset
  375×812. Reset to desktop at the end.
- Themes: light and dark (top-bar toggle); restore the user's theme at the end.
- Languages: English, then Arabic (RTL) and German (long words) for layout cases;
  restore English.

## 3. Measure, don't eyeball

Use `javascript_tool` for facts and screenshots only to confirm what a number says.
Paste these audits on each screen (they only read the page):

```js
// A. Overflow: past the window (out), cut off inside a box (clipped), names ellipsised (truncated)
const id=e=>e.tagName+'.'+String(e.className).slice(0,50),all=[...document.querySelectorAll('main *')];
({out:all.filter(e=>e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left<-1).slice(0,10).map(id),
clipped:all.filter(e=>{const c=getComputedStyle(e);return /hidden|clip/.test(c.overflowX)&&c.textOverflow!=='ellipsis'&&e.clientWidth>1&&e.scrollWidth>e.clientWidth+1}).slice(0,10).map(e=>id(e)+' '+e.scrollWidth+'>'+e.clientWidth),
scrollers:all.filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1).slice(0,10).map(id),
truncated:all.filter(e=>getComputedStyle(e).textOverflow==='ellipsis'&&e.scrollWidth>e.clientWidth).slice(0,10).map(e=>e.textContent.trim().slice(0,30))})
```
`out` lists a screen-reader-only `thead` row in stacked tables (clipped to 1px, harmless): check `tr` hits with `closest('thead')`.
`scrollers` are only fine for deliberate scroll areas (wide tables above 720px);
a switch or tab strip that scrolls is a RESP-006 failure.
```js
// B. Grey sentence under a heading (forbidden: hints go behind the ⓘ)
[...document.querySelectorAll('main h1,main h2,main h3')].map(h=>{const n=h.parentElement?.nextElementSibling||h.nextElementSibling;return n&&n.tagName==='P'&&n.textContent.trim().length>25?h.textContent.trim()+' → '+n.textContent.trim().slice(0,80):null}).filter(Boolean)
```
A hit is a candidate: a tile's live figure line ("$29 more than last month by this
day") is allowed by HEAD-003; prose that explains or instructs is the failure.
```js
// C. Money formatting in page text and SVG chart labels: decimals, ASCII hyphen minus. Any currency symbol or ISO code.
const t=document.querySelector('main').innerText+'\n'+[...document.querySelectorAll('main svg text')].map(x=>x.textContent).join('\n'),cur='[$€£¥₹₩₽₺₫₱₦₴₪]|\\b[A-Z]{3}\\b';
({decimals:t.match(new RegExp(`(?:${cur})\\s?\\d[\\d,]*\\.\\d+(?![\\dKMB%])|\\d[\\d,]*\\.\\d+\\s?(?:${cur})`,'g')),hyphenMinus:t.match(new RegExp(`(^|[\\s(])-\\s?(?:${cur})?\\s?\\d`,'gm'))})
```
Run it in English. Unit prices and coin quantities may keep decimals (FMT-002);
everything else in `decimals` is a FMT-001 failure.
```js
// D. Type scale and radii actually used (compare with --type-* and --radius-* tokens)
// Emoji glyphs in .category-icon tiles and chart-library internals are not text; ignore them.
const s=new Set(),r=new Set();document.querySelectorAll('main *:not(.category-icon)').forEach(e=>{const c=getComputedStyle(e);s.add(c.fontSize);if(c.borderRadius!=='0px')r.add(c.borderRadius)});({fontSizes:[...s].sort(),radii:[...r].sort()})
```
```js
// E. Unnamed controls: buttons, links, inputs, selects, textareas (a placeholder is not a name). Run with dialogs open too.
[...document.querySelectorAll('main :is(button,a,[role=button],input:not([type=hidden]),select,textarea), [role=dialog] :is(button,input,select,textarea)')].filter(b=>!((b.matches('button,a,[role=button]')&&b.innerText.trim())||b.getAttribute('aria-label')||b.getAttribute('aria-labelledby')||b.title||b.labels?.length)).map(b=>b.outerHTML.slice(0,120))
```
```js
// F. English left on screen in another language (run with language ≠ en)
document.querySelector('main').innerText.split('\n').filter(l=>/\b(the|and|your|with|this|Add|Save|Cancel|Delete)\b/.test(l)).slice(0,20)
```
```js
// G. Colour tone sanity: red text that is not overdue/overspent/owed
[...document.querySelectorAll('main .negative,[data-tone=negative]')].map(e=>e.closest('li,tr,article,section')?.innerText.split('\n')[0]+' :: '+e.textContent.trim()).slice(0,20)
```
```js
// H. Disabled state honesty: looks enabled but aria-disabled only; disabled with no reason given
[...document.querySelectorAll('main button,[role=dialog] button')].filter(b=>b.getAttribute('aria-disabled')==='true'&&!b.disabled&&getComputedStyle(b).opacity==='1').map(b=>'looks enabled: '+b.innerText.trim()).concat([...document.querySelectorAll('main button:disabled,[role=dialog] button:disabled')].filter(b=>!(b.title||b.getAttribute('aria-describedby')||b.parentElement?.title)).map(b=>'disabled, no reason: '+b.innerText.trim()))
```
```js
// I. Text contrast below 4.5:1. Colours are normalised through a canvas (Tailwind emits oklab/oklch);
// mostly transparent backgrounds are skipped to the parent. Check text on gradients and images by eye.
const cx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
const rgba=c=>{cx.clearRect(0,0,1,1);cx.fillStyle=c;cx.fillRect(0,0,1,1);return [...cx.getImageData(0,0,1,1).data]};
const L=c=>{const [r,g,b,a]=rgba(c);if(a<128)return null;return [r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)};
const bg=e=>{for(;e;e=e.parentElement){const l=L(getComputedStyle(e).backgroundColor);if(l!==null)return l}return L(getComputedStyle(document.body).backgroundColor)??1};
[...document.querySelectorAll('main *, [role=dialog] *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&e.offsetParent&&e.clientWidth>1).map(e=>{const f=L(getComputedStyle(e).color)??0,b=bg(e),r=(Math.max(f,b)+.05)/(Math.min(f,b)+.05);return [r,e]}).filter(([r])=>r<4.5).slice(0,15).map(([r,e])=>r.toFixed(2)+' '+e.textContent.trim().slice(0,30))
```
```js
// J. Touch targets under 44px (the ⓘ reports 22px: its 44px hit area is `.info-hint::after` on coarse pointers) (run at the mobile preset, which emulates a coarse pointer)
[...document.querySelectorAll('button,a,[role=button],input,select,summary')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44&&!e.closest('p')).slice(0,20).map(e=>Math.round(e.getBoundingClientRect().height)+'px '+(e.innerText||e.getAttribute('aria-label')||e.tagName).trim().slice(0,30))
```
```js
// K. Page frame: title position and tab title (compare across screens)
const h=document.querySelector('main h1')?.getBoundingClientRect();({top:h&&Math.round(h.top),left:h&&Math.round(h.left),h1:document.querySelector('main h1')?.textContent.trim(),title:document.title})
```
```js
// L. Wrapped with room: a row whose items went onto a second line although the first line had space for them
// (a breakpoint guessed for the widest row). Measures each item's content, not its stretched box; full-width rows and column stacks are skipped.
const px=(s,...k)=>k.reduce((t,p)=>t+(parseFloat(s[p])||0),0),id=e=>e.tagName.toLowerCase()+'.'+String(e.className).split(' ').filter(Boolean).slice(0,2).join('.');
const content=k=>{const box=k.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(k);const r=range.getBoundingClientRect();if(!r.width)return box.width;const s=getComputedStyle(k);return Math.min(box.width,r.width+px(s,'paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'))};
const hits=[];for(const box of document.querySelectorAll('main *')){const c=getComputedStyle(box),grid=c.display.includes('grid'),flex=c.display.includes('flex');if(!grid&&!flex||flex&&c.flexDirection.startsWith('column')||grid&&c.gridTemplateColumns.split(' ').length<2)continue;
 const inner=box.getBoundingClientRect().width-px(c,'paddingLeft','paddingRight'),kids=[...box.children].filter(k=>k.getBoundingClientRect().width>0&&getComputedStyle(k).position!=='absolute');if(kids.length<2||kids.some(k=>k.getBoundingClientRect().width>=inner*.95))continue;
 const lines=[];for(const k of kids){const r=k.getBoundingClientRect(),w=content(k)+px(getComputedStyle(k),'marginLeft','marginRight'),line=lines.find(l=>r.top<l.bottom-4&&r.bottom>l.top+4);if(line){line.w.push(w);line.bottom=Math.max(line.bottom,r.bottom)}else lines.push({top:r.top,bottom:r.bottom,w:[w]})}
 if(lines.length<2)continue;const gap=parseFloat(c.columnGap)||0,sum=l=>l.w.reduce((s,w)=>s+w,0)+(l.w.length-1)*gap,free=inner-sum(lines[0]),need=Math.min(...lines.slice(1).map(sum));
 if(free>inner*.3&&need+gap<=free)hits.push(id(box)+' free '+Math.round(free)+' of '+Math.round(inner)+'px, line 2 needs '+Math.round(need))}
[...new Set(hits)].slice(0,15)
```
Run it at 1185, 1024 and 768 with the sidebar open (the widths between the
phone and wide desktop, where guessed breakpoints misfire). A hit is a RESP-022
failure unless the second line is deliberate (a wrapped chip list that
fills its first line, a chart legend); fix it with `useColumnsFit` or a layout
that wraps by itself (AGENTS.md, Interface design system).


Source checks (Bash, read-only): inline `Intl.`/`toLocaleString`/`toFixed` in
`components/`, native `type="date"`, literal hex colours or px font sizes in new
rules (`app/styles/*.css` and `components/*.module.css`), a raw `<input type="number">`
for money, duplicate selectors across `app/styles/*.css`, and every `animation` /
`transition` without a `prefers-reduced-motion: reduce` counterpart (MOT-001).
For MOT-002, fetch the landing page with `curl` and confirm nothing is hidden until
JavaScript runs. Report the file and line.

## 4. Method

1. Scope the screens (argument; `git diff --name-only HEAD~1` plus uncommitted
   changes mapped through the §1 table for "diff"; "full" is every row of §1).
   Always include the cross-cutting areas plus the `SCR` cases of each screen.
2. For each screen × viewport × theme, walk the catalog cases that apply. Record
   PASS / FAIL / N/A with the measured value.
3. Open every dialog, menu, popover, picker and empty state on the screen (the §1
   overlay list); they are part of the screen. Run audits B, E, H and I inside each.
4. Watch the motion: open and close disclosures, switch segments, load a page with
   the network throttled; check MOT cases.
5. Interact: hover a row (handle appears), keyboard Tab through the page (visible
   focus, logical order), drag one item with the pointer and one with the keyboard
   where reordering applies, Escape closes overlays and returns focus.
6. Compare with the reference app for structure (what the screen leads with, where actions
   sit, what is hidden); list differences as "REF" findings only when UI-AGENT.md
   adopted that pattern.
7. Severity: **D0** broken or unreadable (overflow hiding content, unusable at
   375 px, contrast failure, RTL broken, money misformatted); **D1** a written rule
   broken (grey sentence, wrong tone, missing reorder, inline formatter, missing
   empty state); **D2** inconsistency or polish.

## 5. Report

1. Header: screens, viewports, themes, languages, data states, commit.
2. Findings table: `ID | Screen | Element | Rule (file § section) | Measured | Fix (file) | Severity`.
3. Passed cases by area; not-checked cases with the reason.
4. Screenshots only for D0/D1 layout findings (one per finding).
5. Restore theme, language, viewport, dashboard layout.

## 6. Keep the catalog alive

Every new finding becomes a case in `references/cases.md` (stable ID, measurable
expectation, tagged `[dr <date>]`); a finding tied to one screen goes in `SCR`.
Add the run to the catalog's run log (date, commit, screens, what was not run). When a rule changes in AGENTS.md or UI-AGENT.md, update the matching
cases in the same change. Where a case can be checked from source, propose an
assertion for `tests/design-system.mjs` or `tests/presentation-foundation.mjs`.
