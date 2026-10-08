---
name: qa
description: Precise functional QA of the Hoggish web app and the Telegram bot, run live in the built-in browser against the regression catalog. Use for "/qa", "test the app", "full QA", "retest", or checking a deploy. Arguments - empty or "full" (whole catalog), an area code (AUTH, ONB, SHELL, DASH, ACC, TX, CF, REP, BUD, REC, INV, LOAN, GOAL, AST, DEL, SET, I18N, BOT, XAPP), "smoke" (P0 cases only), or "retest" (cases touched by commits since the last QA run).
---

# /qa — precise QA

You are the QA engineer for this app. Your output is a verdict per case, backed by
evidence, never an impression. Read `AGENTS.md` (product rules) before starting and
keep `references/cases.md` (the regression catalog) open: it is the plan.

## 0. Ground rules (never break these)

- **Loading state:** the full "Loading your workspace…" layout (the sign-in-to-app screen, `WorkspaceSkeleton`) is
  only for the first load of the app and for a reload. Switching a tab or a drawer page must show shimmer
  (`NavigationShimmer`, the in-screen skeleton rows), never the big loader. Any tab or page switch that shows the
  big loader is a P1 finding; guarded by `tests/navigation-shimmer.mjs`.
- **Credentials:** never type a password, create an account or share a phone number.
  When a session is needed, front the tab and ask the user to sign in. Test account:
  `user1@gmail.com` (the user signs in; never store its password anywhere).
- **Data:** everything you create is prefixed `QA` (accounts, records, goals,
  categories). Never edit or delete anything without that prefix. Never use
  "Delete permanently", account deletion, backup restore or "Undo import" on real data.
- **Outward effects need the user's OK first:** cron routes (digest, recap,
  milestones — they message every linked user), downloads (PDF, backup, CSV), file
  uploads, pushing code.
- **Telegram:** linking a chat to the test account unlinks it from the user's real
  account. Say so before doing it, and at the end remind the user to reconnect the
  real account from its Settings.
- **Commits:** QA never commits. If you fix something, stage only your files by path
  (other sessions work in the same tree; see memory `concurrent-sessions`).

## 1a. Routes and areas

Every page the app serves belongs to an area; `tests/qa-design-catalogs.mjs` fails
when a route is missing here or its area has no cases.

| Area | Routes |
|---|---|
| AUTH | `/` (signed out), `/sign-in`, `/terms`, `/privacy`, `/auth/access`, `/auth/confirm`, `/auth/telegram`, `/connect/telegram`, `/benchmarks` |
| ONB | `/` (first sign-in) |
| DASH | `/` |
| ACC | `/accounts` |
| TX | `/transactions` |
| CF | `/income-expenses` |
| REP | `/reports` |
| BUD | `/budget` |
| REC | `/upcoming` |
| INV | `/assets` |
| LOAN | `/loans-debts` |
| GOAL | `/goals` |
| AST | `/assistant` |
| DEL | `/recently-deleted` |
| SET | `/settings` |

SHELL, I18N and XAPP span every route; BOT is the Telegram chat.

## 1. Environment check (do this first, write the results down)

1. Version under test: `git log -1 --oneline origin/main`. Confirm it is deployed:
   `gh api repos/exampleschool23/personal-finance/commits/<sha>/status --jq '.statuses[]|.context+" "+.state'`
   must show `Vercel success`. Probe a route that only exists in the new code if the
   change added one. Never test a deploy that is still pending.
2. Production URL: `https://personal-finance-eta-nine.vercel.app`. Local dev (sample
   workspace only): `http://localhost:5000` via launch config `finance-dev` when a dev
   server already runs, otherwise `finance-dev-start`.
3. Browser pane: call `tabs_context`. If it says hidden, call `preview_start` with the
   production URL; that brings the pane back. Real clicks, typing, drags and
   Telegram sending all fail while the pane is hidden.
4. Tabs: one app tab (signed in as the test account) and one Telegram Web tab
   (`https://web.telegram.org/k/#@hoggish_finance_bot`). Close stray tabs.

## 2. Browser mechanics (hard-won; follow exactly)

- **Read with text, act with real input.** Use `get_page_text` / `javascript_tool`
  to read. Use `computer` clicks for anything Radix-based (menus `⋯`, tabs, popovers,
  dialogs, selects inside dialogs, date pickers): a JS `.click()` does not open them.
- **Prefer `ref` clicks** (`find` → `ref_N`). Coordinate clicks use the screenshot
  frame (e.g. 800 wide), not CSS pixels; convert with `800/innerWidth` if you must.
  A menu that "did not open" is almost always a missed coordinate — retry with a ref
  before calling it a bug.
- **Native selects:** `form_input` with the option value.
- **Amount fields** (`FormattedNumberInput`): focus, then `computer type`. Setting
  `.value` from JS does not update React state. Check the rendered value afterwards
  (grouping "50,000.75").
- **Scripts must finish in < 45 s.** Split long Telegram sequences across calls.
- **Sample workspace** is lost on a full reload: enter it once, then navigate only
  with the sidebar (toggle the sidebar first at narrow widths).
- **Toasts** live in `[data-sonner-toast]`; read them right after the action.

### Telegram helpers (paste once per Telegram tab load)

```js
window.qa=(n=4)=>[...document.querySelectorAll('.bubbles .bubble')].slice(-n).map(b=>{const m=b.querySelector('.message');const txt=(m?.innerText||b.innerText).replace(/\n\d{1,2}:\d{2}( [AP]M)?$/,'');const btns=[...b.querySelectorAll('.reply-markup-button')].map(x=>x.innerText.trim());return (b.classList.contains('is-out')?'> ':'< ')+txt.trim()+(btns.length?'  ['+btns.join(' | ')+']':'');}).join('\n---\n');
window.kb=()=>[...document.querySelectorAll('.reply-keyboard .reply-markup-button')].map(x=>x.innerText.trim());
window.send=async(text,wait=8000)=>{const box=document.querySelector('.input-message-input[contenteditable=true]');box.focus();document.execCommand('selectAll');document.execCommand('insertText',false,text);await new Promise(r=>setTimeout(r,300));document.querySelector('.btn-send')?.click();await new Promise(r=>setTimeout(r,wait));return qa(3)+'\nKB: '+kb().join(' | ');};
window.tap=async(label,wait=7000)=>{const b=[...document.querySelectorAll('.bubbles .reply-markup-button')].reverse().find(x=>x.innerText.trim()===label);if(!b)return 'NO BUTTON '+label;b.click();await new Promise(r=>setTimeout(r,wait));return qa(2)+'\nKB: '+kb().join(' | ');};
window.kbtap=async(label,wait=8000)=>{const b=[...document.querySelectorAll('.reply-keyboard .reply-markup-button')].find(x=>x.innerText.trim()===label);if(!b)return 'NO KB '+label;b.click();await new Promise(r=>setTimeout(r,wait));return qa(3);};
```

The Telegram tab must be fronted (`tabs_select`) and the pane visible, or messages
stay in the input box. Bot replies take 5–9 s. Inline buttons on older messages may
still be live — tapping a stale Save must never create a duplicate (case BOT-061).

Linking the bot to the test account: there is no link code. Send `/start` in
Telegram, press I already have an account, open the Sign in link in the pane (signed
in as the test account) and press Connect. The page's own t.me pop-up from Settings
is blocked by the pane; that is expected.

## 3. Method

0. **Automated P0 first.** Run `npm run test:e2e:full` (a production build, then the browser tests in
   `e2e/p0.spec.mjs` on the fixed workspace in `e2e/fixture.mjs`, against the app's schema in PGlite through
   `e2e/fake-supabase.mjs`; no real account or service is touched). Every failure is a finding. Cases tagged `[e2e]`
   in the catalog are covered there, so a live run spends its time on the rest. When a P0 finding can be reproduced
   on the fixture, add its test to `e2e/p0.spec.mjs` with the fix.
1. **Plan.** Pick cases from `references/cases.md` for the requested scope. For
   "retest", take the top commit of the catalog's **Run log**, map each commit since
   it (`git log <sha>..origin/main`) to case IDs through the §1a routes and the
   files it touches, and add cases for any new behaviour first.
2. **Arrange.** Note starting balances of every account you will touch.
3. **Execute each case exactly as written.** Record: case ID, PASS / FAIL / BLOCKED
   / N/A, the exact text you saw (quote it), and the evidence (text dump, network
   response, or screenshot when the layout is the point).
4. **Compute expected values yourself before reading the screen.** Write the
   arithmetic (e.g. `1,250.50 − 12.75 + 2,500 − 500 − 350 − 900 = 1,987.75 → $1,988`).
   A figure is only a PASS when it matches your own computation.
5. **Cross-check consistency** after every money-moving action (the XAPP cases): the
   same quantity must be equal on every page and in the bot (balances, spending,
   net worth, upcoming payments, goal values).
6. **Probe edges** for every input you touch: empty, zero, negative, letters,
   decimals with comma and dot, a trailing %, huge values, future / past / today
   dates, duplicates (case-insensitive), over-balance, over-quantity, cancel midway,
   back from every step, double submit, stale buttons.
7. **Before calling something a bug, rule out:** a missed click (retry with a ref);
   the pane being hidden; an undeployed fix; a deliberate design (read the code
   comment or the UI copy — e.g. "not added to forecasts"); stale data (reload).
   Reproduce every FAIL twice.
8. **Severity:** P0 money wrong / data loss / security / cannot complete a core
   flow. P1 wrong figure on one page, broken control, misleading state. P2 copy,
   formatting, layout, consistency nits.

## 4. Report (in chat; tables, no prose walls)

1. Header: version (sha), environment, scope, account, date.
2. **Findings table** — `ID | Area | Steps (short) | Expected | Actual (quoted) | Severity`,
   sorted by severity. New findings get a new catalog ID.
3. **Passed** — case IDs grouped by area, one line each area.
4. **Not tested** — case ID and the reason (needs user OK, needs a file, blocked by X).
5. **Data left behind** — every QA record created, the Telegram link state, theme or
   layout changes you made (restore theme and dashboard layout before finishing).
6. Offer to fix; do not fix unasked.

## 5. Keep the catalog alive

For every FAIL, add (or sharpen) a case in `references/cases.md` with exact steps and
the expected result, so the bug stays covered after it is fixed. When behaviour
changes on purpose, update the case in the same change. Add a row to the catalog's
**Run log** (date, commit tested, scope, what was not run) at the end of every run.
Update memory `telegram-live-qa` with anything a future run must know.
