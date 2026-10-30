# All-India Dashboard — UI/UX Upgrade Plan (deep spec)

Written 29 Oct 2026. This is an execution spec: any model/engineer should be able to
follow it step by step and produce the same result. Read the whole file before touching code.

---

## 0. Ground rules (non-negotiable)

1. **Only `DASHBOARD/dashboard.template.html` changes.** Do not touch `server.js`, the
   pipeline (`*.py`), `data/*.json`, `UP-DASHBOARD/`, `PunjabLens/`, `hot_*`.
2. **Every number stays.** No KPI, card, chart, table or insight line is removed, renamed
   in meaning, re-computed or rounded differently. Formatting helpers (`uf2`, `fmt`, `N`)
   are reused, never rewritten. If a layout wants fewer things on screen, use **collapse /
   secondary styling**, never deletion.
3. **No data/JS logic edits.** The only JS that may change is (a) the HTML string a
   renderer emits (class names / wrapper markup), (b) Chart.js *option* objects (fonts,
   grid, tooltip, legend, colors), (c) new purely-presentational code (count-up, sticky
   bar, skeleton, nav grouping). Never change what is summed, filtered or sorted.
4. **Preserve every id, `data-*` attribute, `onclick` and class that JS queries.** The
   inventory is in §2. If a class must be restyled, restyle it; do not rename it.
5. **Scope = the Dashboard tab (`#sec-dashboard`) + the shell (header, sidebar, filter
   bar).** Other tabs get only what they inherit from shared tokens/cards; verify they did
   not break (§9).
6. **Both scopes share this file's JS twice**: KPI cards are rendered by **two**
   functions (`kc()` in `renderDashDate`, and `card()` in the `tw-rt-split` IIFE). Any
   change to KPI markup must be applied to **both**, identically.
7. Work in small commits, one section per commit, screenshot after each (see §8).
8. Hinglish comments in the file are the house style — keep a short dated comment
   (`/* ui-v2 (29-Oct): ... */`) at every block you add or change.

---

## 1. Current state (what the user sees today)

Page order inside `#sec-dashboard > #pdfCapture > main`:

| # | Block | Markup anchor | Rendered by |
|---|---|---|---|
| 1 | Filter bar (Party, Quick, From, To, Reset, range note) | `.parties-filter-bar` (static) | static + `dashPresetChange/dashReset/dashCustom` |
| 2 | "Tweet Summary" collapsible bar | `#barTwSum` (injected) | `tw-rt-split` IIFE `setup()` → `bar()` |
| 3 | 6 KPI cards | `#dashKpis` (static, `.kpi-row`) | `renderDashDate()` → `kc()` |
| 4 | KPI detail panel (chart + table) | `#kpiDetailPanel` (static) | `kpiOpenDetail()` |
| 5 | "Retweet Summary" bar + 3 KPI cards | `#barRtSum`, `#dashRtKpis` (injected) | `tw-rt-split` `render()` → `card()` |
| 6 | "Total Tweets by Category" bar + category cards | `#barMainCat`, `#lvStrip` | `renderCatStrip()` + `updateLevelStrip()` |
| 7 | "Others" bar + cards | `#barOtherCat`, `#lvOtherStrip`, `#lvOtherWrap` | same |
| 8 | Category detail panel | `#catDetailPanel` | `catOpenDetail()` |
| 9 | "Overview — Trends & Distribution" title | `.sec-title` | static |
| 10 | Overview section 1: Daily Activity line + Posting-time heatmap | `.ov-section` × `ov_trend`, `ov_heat` | `mk()`, `renderHeat()` |
| 11 | Overview section 2: Party doughnut, Sentiment mix, Likes vs RT | `ov_party`, `ov_sent`, `ov_eng` | `mk()` |
| 12 | Overview section 3: Top performers bar, Most active bar | `ov_top`, `ov_active` | `mk()` |
| 13 | Overview section 4: Top states bar, Reach concentration doughnut + `#ov_concStat` | `ov_states`, `ov_conc` | `mk()` |
| 14 | "Executive Summary" title + 4 summary cards | `.summary-grid` → `#khCard`, `#siCard`, `#ppCard`, Top Performers (`#execTop`) | `hExecRange()`, `renderSentInsights()`, `renderDashDate()` |

Visible problems (from the 29-Oct screenshot and code):

- Everything has the same visual weight; no hierarchy between the 4 "hero" numbers
  (Tweets, Views, Likes, Retweets) and the 2 ratios (Avg Views/Tweet, Avg Likes/Tweet).
- Label sits *under* the number; the eye reads "13.34L" before knowing what it is.
- "TAP FOR ANALYSIS" pill repeated on 9 cards — noise.
- Sparklines are a separate strip with no axis context; fine as a trend hint but they
  compete with the number.
- Filter bar is a row of `<select>`s, scrolls away, Quick-range needs 2 clicks.
- Three different "section header" styles on one page: `.cat-sec-bar` (orange left
  border, collapsible), `.sec-title` (small caps with a line), `.ov-section-label`
  (numbered). Pick one system.
- Charts: mixed tick fonts (8 / 8.5 / 9), legends right/bottom, borderRadius 5 on bars,
  heatmap axis labels 7px. No shared Chart.js theme.
- Sidebar: `.main-nav` scrolls but the Pulse Eye button sits on top of the last items
  ("Leader Board" is half hidden in the screenshot). No grouping of 16 tabs.
- Executive Summary uses emoji icons and 11px text; four cards of unequal height.
- Mobile layer (`#mobCss`) is a long list of overrides; tokens would shrink it.

---

## 2. Inventory — things JS depends on (MUST survive unchanged)

### ids
`dashParty dashPreset dashFrom dashTo dashRangeNote dashKpis dashRtKpis kpiDetailPanel
kpiDpLabel kpiDpVal kpiDpRange kpiDpChart kpiDpTh kpiDpTbody barTwSum barRtSum barMainCat
badgeMainCat lvStrip lvOtherWrap barOtherCat badgeOtherCat lvOtherStrip catDetailPanel
catDpTitle catDpBadge catDpTweets catDpHandles catDpAvg catDpRange catDpChart catDpTbody
ov_trend ov_heat ov_party ov_sent ov_eng ov_top ov_active ov_states ov_conc ov_concStat
execTitle khCard siCard siRows ppCard execTop execTopSub lvLSMP lvRSMP lvMLA lvCont lvMLC
lvCM lvDyCM lvOthers (+ same with `h` suffix) appSidebar mainNav appBurger sbBackdrop
pulseEyeWrap updPill dataPill pdfCapture`

### classes queried by JS (grep before renaming anything)
`.kpi .kpi-val .kpi-lbl .kpi-sub .kpi-action .kpi-action-txt .kpi-action-arrow .kpi-spark
canvas.kspark .kpi-open .lv-card .cat-card-open .cat-action .cat-action-txt .cat-action-arrow
.cat-sec-bar .cat-sec-collapsed .cat-sec-toggle-txt .cat-sec-bar-badge .cat-sec-bar-chevron
.mnav-tab (data-tab) .sidebar .show .sb-open .page-section .insight-row .insight-icon
.insight-text .sum-card .filter-select .parties-filter-bar`

### attributes
`data-kpi` on `.kpi`, `data-cat` on `.lv-card`, `data-tab` on `.mnav-tab`,
`style="--ka:<color>"` on `.kpi`, `style="--lc:<color>"` on `.lv-card`,
`aria-expanded` on section bars.

### functions that must keep working (do not edit bodies)
`renderDashDate dashSetRange dashPresetChange dashReset dashCustom updateLevelStrip
renderCatStrip catOpenDetail catCloseDetail kpiOpenDetail kpiCloseDetail ovRefresh mk
renderHeat hExecRange renderSentInsights setSidebarOpen toggleCatSection pRange`

### chart variables (const, created once by `mk()`; updated in `ovRefresh`)
`chTrend chEng chParty chSent chTop chAct chState chConc` + `_kpiChart` + `window._ksp[]`
(KPI sparklines) + `SP[]` (RT sparklines) + the cat detail chart.

### pitfalls
- `#dashKpis{grid-template-columns:repeat(3,1fr)}` at CSS line ~128 is a separate
  override; `#dashRtKpis` gets its own `<style>` injected by the IIFE (3 cols).
- `renderSparks()` is dead (`return;` first line) — sparklines come from `kc()` itself.
- `.kpi:hover` and `.kpi.kpi-open` are defined twice (lines ~129–131 and ~150–152). The
  later block wins; keep one.
- `.lv-card` and `.level-strip` grid columns are set **inline** by `fill()` (`repeat(n,1fr)`,
  n ≤ 7). Any CSS grid change on `.level-strip` must be via `!important` or by changing
  the inline style string in `fill()` (allowed: it is markup, not data).
- `.sec-title::after` draws the line; `.ov-section-label::after` draws another.
- `#mobCss` is the last `<style>` in `<head>` so it wins the cascade. Add the new token
  block **before** it, and put new responsive rules **inside** it.
- `Chart.register({id:'mobileLegend'...})` rewrites legend position on phones; keep it.
- Loader `#loader` covers the page ~2.4 s; leave it.

---

## 3. Design system (tokens)

Add one `<style id="uiV2Tokens">` right after the existing `:root{...}` line (~line 15).
Keep the old variables (other tabs use them); add new ones alongside.

```css
:root{
  /* colour */
  --ink:#141414;--ink-2:#3B3B3B;--ink-3:#6B6B6B;--ink-4:#9A9A9A;
  --paper:#F6F3EE;--card:#FFFFFF;--card-2:#FBF9F6;--line:#E8E2D9;--line-2:#F1ECE4;
  --saffron:#E65100;--saffron-2:#FF8F00;--saffron-soft:#FFF1E4;
  --navy:#0D1B6E;--green:#1B5E20;--maroon:#B71C1C;--violet:#4A148C;--teal:#00838F;
  /* type scale (px) */
  --fs-hero:34px;--fs-kpi:28px;--fs-kpi-sm:22px;--fs-h2:15px;--fs-h3:12px;
  --fs-body:12.5px;--fs-sm:11px;--fs-xs:10px;
  /* space scale */
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:20px;--s6:24px;--s8:32px;
  /* shape + depth */
  --r-sm:8px;--r-md:12px;--r-lg:16px;
  --sh-1:0 1px 2px rgba(20,20,20,.04),0 1px 8px rgba(20,20,20,.04);
  --sh-2:0 6px 20px rgba(20,20,20,.08);
  --sh-focus:0 0 0 2px var(--saffron);
  --ease:cubic-bezier(.2,.7,.2,1);
}
```

Typography rules:
- Numbers: `Rajdhani 700`, tabular (`font-variant-numeric:tabular-nums`), tight tracking.
- Labels: `DM Sans 600`, `--fs-xs`, uppercase, letter-spacing .6px, colour `--ink-3`.
- Section headings: `Rajdhani 700 --fs-h2`, sentence case (NOT all caps), colour `--ink`.
- Body/insight text: `DM Sans 400/500 --fs-body`, line-height 1.5.
- Metric colours stay exactly as today (`#1a1a1a #B71C1C #1B5E20 #4A148C #E65100 #00838F`)
  because the detail panel and sparklines reuse the same `--ka`.

Party colours: keep `pc()` / `pc2()` outputs; do not restyle party chips.

---

## 4. Component specs

### 4.1 Shell — header
- Keep layout and gradient. Changes: `--header-h` stays JS-synced.
- Right side: `#updPill` and `#dataPill` become one pill group with a 1px divider;
  text size `--fs-sm`; the user menu unchanged.
- No new elements.

### 4.2 Shell — sidebar (`#appSidebar`)
Goal: 16 tabs readable, nothing hidden under the Pulse Eye button.

- Fix overlap: make `.main-nav` the only scrolling element and give `#pulseEyeWrap` and
  `.sb-lotus` `flex:0 0 auto` (already), then add
  `.main-nav{padding-bottom:var(--s3);mask-image:linear-gradient(#000 calc(100% - 18px),transparent)}`
  so the fade tells the user there is more. Also set `.sidebar{overflow:hidden}` (already)
  and verify `.main-nav` has `min-height:0` (it does).
- Group the tabs with **non-interactive** labels inserted by a small presentational IIFE
  (`ui-v2 nav-groups`) that inserts `<div class="mnav-grp">Overview</div>` elements
  before the first tab of each group. Groups (by `data-tab`):
  - **Overview**: dashboard, top-leaders, states-cm, mla-tracker
  - **Analysis**: parties, narrative-groups, handle-analytics, sentiment, hashtags
  - **Content**: tweets, breaking, wordcloud, profiles
  - **Tools**: reports, handle-req
  Grouping only reorders *visually*: do **not** move the DOM nodes (other code finds tabs
  by `data-tab` and the hidden `growth` tab stays commented out). Insert the label before
  the first tab of each group **in the existing order**; if the existing order interleaves
  groups, insert the label where the group *starts* and accept the order — no reordering.
- `.mnav-grp{font:700 9.5px 'DM Sans';letter-spacing:1.4px;text-transform:uppercase;
  color:var(--ink-4);padding:var(--s3) var(--s3) var(--s1)}`
- Active tab: keep orange gradient (brand), reduce shadow to `--sh-1`, radius `--r-md`.
- Hover: `background:var(--saffron-soft);color:#C2410C`.

### 4.3 Filter bar (`.parties-filter-bar` inside `#sec-dashboard`)
Keep every control and its id/onchange. Re-skin + make sticky.

- Wrap nothing new around it; add class `ui-fbar` to the existing div.
- `position:sticky;top:var(--header-h);z-index:120;background:rgba(246,243,238,.86);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line);margin:0 -24px var(--s4);
  padding:var(--s2) 24px` (negative margin so it spans `main`'s padding).
- **Quick range as pills**: keep `<select id="dashPreset">` in the DOM (JS reads it) but
  visually hide it (`.ui-fbar #dashPreset{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}`)
  and render a pill group `<div class="ui-pills" role="tablist">` with buttons
  `Today · Yesterday · 3D · 7D · Full · Custom`. Each button sets `#dashPreset.value` to
  the matching option value (`today`, `yest`, `3`, `7`, `all`, `custom`) and dispatches
  `new Event('change')` on the select — so **all existing listeners run exactly as before**.
  Note: the current `<select>` has no `yest` option; add `<option value="yest">Yesterday</option>`
  (pRange already supports `'yest'`). Active pill = the select's current value; sync on
  every `change` (also when dates are edited → `custom`).
- Party `<select>` stays a select, restyled (`.filter-select` token skin: height 34px,
  radius `--r-sm`, border `--line`, focus `--sh-focus`).
- From/To inputs: show only when preset is `custom` **or** on `>=1100px`; on narrower
  screens they sit behind a "Dates" disclosure. Never remove them from DOM.
- `#dashRangeNote`: bold, `--fs-sm`, with a calendar icon (inline SVG, replace the emoji
  text prefix in the renderer string? — no: the renderer writes `'📅 '+rlab`. Keep the
  emoji; hide it with CSS `font-size:0` on the first char is hacky — instead, leave the
  text as is; style only).
- Reset button: ghost style, `↺ Reset` text kept.

### 4.4 Section headers — one system
Replace the three styles with one look, keeping all three class names:

- `.cat-sec-bar` (collapsible, injected and static): becomes a **flat heading row**:
  no card background, no left border; `display:flex;align-items:center;gap:var(--s3);
  padding:var(--s2) 0;border-bottom:1px solid var(--line);margin:var(--s5) 0 var(--s3)`.
  Title: `Rajdhani 700 --fs-h2`, sentence case via CSS `text-transform:none`.
  Badge `.cat-sec-bar-badge`: soft chip (`--card-2`, `--ink-3`, radius 999px).
  Chevron block stays on the right; hover → `color:var(--saffron)`.
- `.sec-title`: same metrics, no `::after` line (replace with `border-bottom`), sentence
  case.
- `.ov-section-label`: same as above; the numbered circle `.ov-section-num` stays (useful
  anchor) but 20px, `--saffron-soft` background, saffron text.
- Add a tiny "section index" at the top of `main`? **No** (scope creep). Smooth anchor
  scrolling only: `html{scroll-behavior:smooth}`.

### 4.5 KPI cards — Tweet Summary (`#dashKpis`) — the hero block
Markup emitted by `kc()` (line ~7674) and `card()` (line ~15600). New markup, identical
in both:

```html
<div class="kpi kpi-v2 [kpi-hero|kpi-ratio]" data-kpi="KEY" onclick="..." style="--ka:COLOR;cursor:pointer">
  <div class="kpi-top">
    <div class="kpi-lbl">LABEL</div>
    <button type="button" class="kpi-action" aria-label="Open analysis for LABEL" tabindex="-1">
      <span class="kpi-action-txt">Tap for Analysis</span><span class="kpi-action-arrow">&#x25BE;</span>
    </button>
  </div>
  <div class="kpi-val">VALUE</div>
  <div class="kpi-sub">SUB</div>
  <div class="kpi-spark"><canvas class="kspark"></canvas></div>
</div>
```
Rules:
- Order of children changed (label first) — allowed, JS queries by class, not position.
- `.kpi-action` becomes an **icon-only** button visually: `.kpi-action-txt` is
  visually-hidden (sr-only) by default and shown as a tooltip on hover/focus; the arrow
  becomes a 20px round ghost button at top-right. `kpiOpenDetail()` still sets
  `.kpi-action-txt.textContent = 'Viewing Analysis'` — when `.kpi-open`, show the text
  as a small chip next to the arrow (CSS only).
- Hero vs ratio: in `kc()` the 6 calls are, in order: tweets, likes, rts, views, avgvpt,
  avglpt. Add class `kpi-hero` to tweets/likes/rts/views and `kpi-ratio` to avgvpt/avglpt
  by extending `kc(key,val,lbl,sub,col)` with a 6th param `cls` (presentational only).
  Grid: `#dashKpis{grid-template-columns:repeat(4,1fr)}` with `.kpi-ratio{grid-column:span 2}`
  → row 1: four heroes; row 2: two wide ratio cards. At `<=1200px`: 2 cols, ratio span 2;
  at `<=600px`: 1 col.
- Hero: `--fs-kpi` 28px → on `>=1400px` use `--fs-hero` 34px. Ratio cards: `--fs-kpi-sm`,
  `--ka` colour kept, lighter card (`--card-2` background).
- Sparkline: full-bleed at the card bottom, `height:38px`, `margin:var(--s2) -16px -14px`
  (negative to bleed), `border-radius:0 0 var(--r-md) var(--r-md)`, `opacity:.9`.
  Chart config stays (line, fill `COLOR+'22'`, tension .4). Do not add axes.
- Card: `background:var(--card);border:1px solid var(--line);border-left:4px solid var(--ka)`
  (keep the colour bar — it is the only colour cue that links card → detail panel),
  `border-radius:var(--r-md);padding:14px 16px;box-shadow:var(--sh-1)`.
  Hover: `transform:translateY(-2px);box-shadow:var(--sh-2)`; open: `--sh-focus`.
- Tweets card sub-note is long ("13,34,473 politicians + 3,12,429 media house / journalist
  = 16,46,902 own tweets in database"). Keep the text; style it as a second line
  `.kpi-sub` with `line-height:1.35;max-height:2.7em;overflow:hidden` and full text in
  `title`. **Do not shorten the text.**
- Count-up on first paint only (not on every filter change — numbers must settle
  instantly on filter). Implement with a MutationObserver on `#dashKpis` that runs once:
  animate from 0 to the *displayed string's numeric part* over 600 ms, keep the suffix
  (L/Cr/K). If parsing fails, skip. Respect `prefers-reduced-motion`.

### 4.6 Retweet Summary (`#barRtSum` + `#dashRtKpis`)
- Same card markup via `card()`; all three get class `kpi-ratio`-like density
  (`kpi-v2 kpi-sec`): smaller value (`--fs-kpi-sm`), `--card-2` background, 3 columns.
- Section header per §4.4; badge text unchanged.
- The whole block sits inside a subtle container `#dashRtKpis{padding:var(--s3);
  background:var(--card-2);border:1px dashed var(--line);border-radius:var(--r-lg)}` to
  read as "secondary / reposts" vs the hero block. Collapsed by default? **No** — user
  wants all info visible. Default stays expanded.

### 4.7 KPI detail panel (`#kpiDetailPanel`)
- Keep structure. Style: radius `--r-lg`, border `1px solid var(--line)`, left accent
  `4px solid` in the KPI colour (set `style.borderLeftColor = def.color` is JS — not
  allowed; instead CSS `border-left:4px solid var(--saffron)` constant).
- Layout: chart left (`2fr`), table right (`1fr`) on `>=1000px` (currently stacked);
  grid via CSS only — wrap not needed: use `display:grid;grid-template-columns:2fr 1fr;
  grid-template-areas:"top top" "chart tbl"` with `.kpi-dp-top{grid-area:top}` etc.
- Close button: ghost, keyboard focusable (already a `<button>`).
- Chart option tweak (allowed): legend off, tooltip theme (§4.11), `borderWidth:2`,
  `pointRadius:0`, `pointHitRadius:12`.

### 4.8 Category cards (`#lvStrip`, `#lvOtherStrip`)
Markup from `renderCatStrip().card()`; keep ids/`data-cat`/onclick. New look:

```html
<div class="lv-card lv-v2" style="--lc:COLOR" data-cat="..." onclick="...">
  <div class="lv-lbl">LABEL</div>
  <div class="lv-val" id="lvXXX">N</div>
  <div class="lv-sub" id="lvXXXh">3,789 handles · 2,900 par data</div>
  <div class="cat-action"><span class="cat-action-txt">View details</span><span class="cat-action-arrow">&rarr;</span></div>
</div>
```
- Label first (same reasoning). Value `Rajdhani 700 22px` in `--lc`. Sub `--fs-xs`.
- Left 4px colour bar kept; top-left a 8px dot of `--lc` before the label.
- Grid: `fill()` sets inline `repeat(n,1fr)` (n ≤ 7). Change that string to
  `repeat(auto-fit,minmax(150px,1fr))` — markup-level, allowed — so 7 cards wrap
  gracefully instead of squeezing.
- `.cat-action` becomes a right-aligned arrow only; text sr-only, shown on hover.
- "Others" strip: identical cards, section header per §4.4.

### 4.9 Category detail panel (`#catDetailPanel`)
- Same treatment as 4.7. `.cat-dp-kpis` 4 tiles → tokens (`--card-2`, `--r-md`).
- Body grid already `2fr 1fr`; keep.

### 4.10 Overview charts (4 `.ov-section`s)
Layout changes (CSS/markup only):
- Section 1: trend `span 7`, heatmap `span 5`; height `--ov-h:200px` (today 158px — too
  short for 210 days of data). Heatmap cells get `border-radius:2px;gap:2px` kept; axis
  labels 9px (`#ov_heat` inline styles are emitted by `renderHeat()` — those are strings;
  bump `7px→9px`, `8px→10px`, colours to `--ink-4`/`--ink-3`; allowed as presentation).
- Section 2: three equal `span 4`, height 200px.
- Section 3: two `span 6`, height 220px (6 bars each need room).
- Section 4: states `span 8` 220px; concentration `span 4` with `#ov_concStat` as a big
  number (`--fs-kpi`) above a 140px doughnut.
- `.ov-card`: tokens; `.ov-t` → sentence case, `--fs-h3`, `--ink-2`; the `.dim` note
  becomes a soft chip.
- Add an "ℹ︎" tooltip per chart? **Optional, later.**

### 4.11 Chart.js theme (one place)
`mk()` (line ~8329) is the single factory for the 8 overview charts; the KPI detail chart,
cat detail chart and sparklines are created separately. Add a presentational helper
`uiV2Theme(cfg)` and call it inside `mk()` **before** `new Chart`. It only sets options
that are not already set by the caller (so no chart loses a custom tooltip callback):

```js
Chart.defaults.font.family="'DM Sans',sans-serif";
Chart.defaults.font.size=11;
Chart.defaults.color='#6B6B6B';
// per chart (merge, do not overwrite callers' keys):
options.plugins.tooltip: {backgroundColor:'#141414',titleFont:{family:'Rajdhani',size:13,weight:'700'},
  bodyFont:{size:11.5},padding:10,cornerRadius:8,displayColors:true,boxPadding:4}
options.plugins.legend.labels: {usePointStyle:true,pointStyle:'circle',boxWidth:8,padding:12,font:{size:10.5}}
scales.*.grid.color='#F1ECE4'; scales.*.border.display=false; ticks.font.size=10; ticks.padding=6
bar datasets: borderRadius 6, maxBarThickness 22, categoryPercentage .7
doughnut: borderWidth 3, borderColor '#fff', hoverOffset 6
line: borderWidth 2, pointRadius 0, pointHitRadius 10, tension .35
```
- Legend positions: keep `right` for party doughnut on desktop (mobileLegend plugin moves
  it on phones), `bottom` elsewhere.
- Datalabels remain off on overview charts (as today).
- Colours of datasets are **not** changed (party colours, metric colours).

### 4.12 Executive Summary (4 `.sum-card`)
- Grid: `repeat(2,1fr)` → on `>=1400px` `repeat(4,1fr)`, equal heights via
  `align-items:stretch`.
- Card: tokens, title `Rajdhani --fs-h2` sentence case, title icon = existing emoji kept
  in the markup but wrapped… the titles are static HTML (`🏆 Key Highlights`), so replace
  the emoji with an inline 16px SVG (trophy / bar-chart / building / pin). Markup only.
- `.insight-row`: `padding:var(--s2) 0`, `.insight-icon` 26px soft tile (keep the emoji
  content — rows are rendered by JS with emoji strings; do not change strings), text
  `--fs-body`, `<strong>` in `--ink`.
- `#siRows` (sentiment list) gets the same row rhythm.

### 4.13 Motion & states
- Page/section fade-in on first paint only (`@keyframes ui-in`, 240 ms, `--ease`),
  disabled under `prefers-reduced-motion`.
- Skeletons: while `#dashKpis` is empty, show 4 shimmering placeholder cards via
  `#dashKpis:empty::before/::after` (pure CSS, no JS).
- Collapse state of `#barTwSum/#barRtSum/#barMainCat/#barOtherCat` remembered in
  `localStorage` (`ipp_ui_collapse`) — presentational IIFE that listens to the bars'
  clicks and re-applies on load by calling the existing toggle (click the bar) — never by
  setting styles directly, so JS state stays consistent.
- Focus rings everywhere (`:focus-visible{box-shadow:var(--sh-focus)}`).

### 4.14 Responsive
Inside `#mobCss` (end of head), add/replace:
- `<=1200px`: `#dashKpis` 2 cols (ratio span 2); ov grid all `span 12` except section 2
  which goes `span 6` each with the third wrapping full; summary 2 cols.
- `<=820px`: filter bar not sticky (space); pills scroll horizontally
  (`overflow-x:auto;scroll-snap-type:x mandatory`); KPI 1 col hero / 2 col ratio; category
  cards 2 cols; ov 1 col; summary 1 col; chart heights 180px.
- `<=560px`: all 1 col; `--fs-kpi:24px`.

---

## 5. Implementation order (each step = one commit + screenshot)

1. **Tokens + base** — add `#uiV2Tokens`, `html{scroll-behavior}`, focus rings, section
   header system (§3, §4.4). Nothing moves yet; page should look calmer only.
2. **Shell** — sidebar overlap fix + nav groups + header pill group (§4.1, §4.2).
3. **Filter bar** — sticky + pills + `yest` option (§4.3). Verify every preset drives the
   same `change` events (check `#dashRangeNote` text and KPI values match the old select).
4. **KPI cards** — edit `kc()` and `card()` markup; new CSS; hero/ratio grid; sparkline
   bleed; action icon; count-up (§4.5, 4.6). Verify `kpiOpenDetail` highlight text still
   toggles ("Viewing Analysis").
5. **Detail panels** (§4.7, 4.9).
6. **Category cards** (§4.8) — `card()` + `fill()` string.
7. **Charts** — `mk()` theme + heights + `renderHeat` label sizes (§4.10, 4.11).
8. **Executive Summary** (§4.12).
9. **Motion/states** (§4.13).
10. **Responsive pass** (§4.14) — mobile 375, tablet 768, laptop 1366, wide 1920.
11. **Regression sweep** on other tabs (§9) + final screenshots + push.

---

## 6. How to edit safely in a 1.6 MB file

- Use `Grep` with the anchor strings above to find positions; never rely on line numbers
  from this doc (they drift).
- Edit with exact `old_string` → `new_string` replacements; keep each edit < 40 lines.
- After each step: `node --check` is not applicable (HTML); instead reload
  `http://localhost:3000` in the browser pane and read `read_console_messages` for errors
  (`[tw-rt-split]`, `Chart`, `renderCatStrip` warnings are the usual suspects).
- The server caches the built page; the cache key includes the template `mtime`, so a
  reload after save is enough (no restart). If HOT/Atlas is on, first paint can take
  10–35 s — wait before judging.

---

## 7. Verification checklist (per step and at the end)

Numbers (must be identical before/after, same filter):
- [ ] 6 Tweet Summary values + sub-notes, 3 Retweet Summary values
- [ ] every category card value + "handles · par data" sub-line (main + Others)
- [ ] `#ov_concStat` %, all 8 chart datasets (compare tooltips on 2–3 points)
- [ ] Executive Summary: 5 highlights, sentiment rows, 5 party lines, top 5 performers
- [ ] `#dashRangeNote` text for Today / Yesterday / 3D / 7D / Full / Custom

Behaviour:
- [ ] clicking each KPI opens the detail panel under its own section; second click closes
- [ ] category card opens `#catDetailPanel`; close works
- [ ] Party filter + each preset re-render everything (KPIs, strips, charts, summary)
- [ ] Tweet/Retweet/Category/Others collapse + expand; state restored after reload
- [ ] sidebar: all 16 tabs reachable, Pulse Eye button never covers a tab, burger works
- [ ] PDF download still renders (`#pdfCapture` untouched)
- [ ] no console errors; no horizontal scroll at 375 px

Visual (screenshots to save in `DASHBOARD/_ui_v2_shots/`):
- [ ] 1366×768 top of page, KPI detail open, category detail open, charts, summary
- [ ] 1920×1080 top
- [ ] 768 and 375 top + charts

---

## 8. Screenshot protocol

The browser pane keeps the login session. After each step: navigate to
`http://localhost:3000`, wait for `#loader.hiding`, `computer screenshot` at scale 0.6,
then `resize_window` to 375 for the mobile shot. Show both to the user before the next
step; wait for "theek" / changes.

---

## 9. Regression scope outside the Dashboard tab

Shared classes touched: `.kpi* .lv-card .cat-sec-bar .sec-title .sum-card .insight-*
.filter-select .parties-filter-bar .mnav-tab .ov-*`. Open and eyeball once:
Top Leaders, States & CM (uses `.kpi-lbl`), Parties (`.parties-filter-bar`, `.pcard`),
Sentiment, Reports, Tweet Intelligence. Anything that looks broken there gets a
scoped override `#sec-dashboard .x{}` instead of a global change.

---

## 10. Out of scope (do not do without asking)

- Adding deltas / "vs previous period" numbers (new computation).
- Removing, merging or reordering any card/chart/insight.
- Dark mode (`body.dark` exists but the toggle is hidden; leave it).
- Changing party colours, metric colours, number formats (L/Cr/K).
- Touching UP / Punjab templates (they will get a separate pass later).
