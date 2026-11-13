/* Web-to-Web BI Board — Real-time board (channel-aware traffic, checkout funnel, PSP status, device / attribution chips). Uses ./core.js (BB) + ./ui.js (BB.ui). */
BB.ui.boot(function () { // renders once BB.ready() resolves (data pointer: ?data= · window.BB_DATA_URL · data-src · ./data/demo.json)
  'use strict';
  const U = BB.ui, T = BB.t, el = U.el, F = BB.fmt, DAY = BB.util.DAY, isoDate = BB.util.isoDate, startOfDay = BB.util.startOfDay;
  const PAGE = 'realtime';
  const isNum = (x) => typeof x === 'number' && isFinite(x);
  const ratio = (a, b) => (b > 0 ? a / b : null);
  const d2 = (n) => String(n).padStart(2, '0');
  const hhmm = (ts) => { const d = new Date(ts); return d2(d.getUTCHours()) + ':' + d2(d.getUTCMinutes()); };
  const flag = (cc) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🏳️');
  const DIM_LBL = (id) => (BB.DIM_BY_ID[id] ? BB.lbl(BB.DIM_BY_ID[id]) : id);
  const mLbl = (k, fb) => (BB.METRIC_BY_KEY && BB.METRIC_BY_KEY[k] ? BB.lbl(BB.METRIC_BY_KEY[k]) : T(fb || k));
  const mFml = (k, fb) => (BB.METRIC_BY_KEY && BB.METRIC_BY_KEY[k] ? BB.lbl(BB.METRIC_BY_KEY[k], 'formula') : T(fb || k));
  const ALLOC = () => '≈ ' + T('Allocated spend');
  const PRESET_LBL = { today: T('Today'), yesterday: T('Yesterday'), '7d': T('7 days'), '14d': T('14 days'), '30d': T('30 days'), '90d': T('90 days'), all: T('All time'), custom: T('Period') };
  const STEP_LBL = { hour: T('hourly'), day: T('daily'), week: T('weekly'), month: T('monthly') };
  const pp = (v) => (isNum(v) ? (v > 0 ? '−' : '+') + (Math.abs(v) * 100).toFixed(1) + ' ' + T('pp') : '—'); // drop (baseline − current) → signed change of the current value
  const chLabel = (id) => (BB.CHANNEL_BY_ID[id] ? BB.lbl(BB.CHANNEL_BY_ID[id]) : id);
  const pspLabel = (id) => { const p = BB.PSPS.find((x) => x.id === id); return p ? BB.lbl(p) : id || T('(none)'); };
  const pmLabel = (id) => { const p = BB.PAYMENT_METHODS.find((x) => x.id === id); return p ? BB.lbl(p) : id || T('(none)'); };
  const payerShort = () => (st.payer === 'sub' ? T('subscription') : T('any payment'));
  const SRC = () => (data.meta.source === 'demo' ? T('Demo data') : BB.lbl(data.meta));

  /* ---------------- alert rules (editable; persisted in the hash as `rules`) ---------------- */
  const RULE_DEFS = [
    { id: 'cptMax', label: T('CPT above, $'), def: 20, step: 1 },
    { id: 'cptSpend', label: T('…with spend ≥ $'), def: 50, step: 5 },
    { id: 'zeroSpend', label: T('No trials with spend ≥ $'), def: 40, step: 5 },
    { id: 'qualMin', label: T('Qualified rate below, %'), def: 50, step: 5 },
    { id: 'qualTrials', label: T('…with trials ≥'), def: 5, step: 1 },
    { id: 'roasMin', label: T('ROAS D0 ≥, x'), def: 0.3, step: 0.05 },
    { id: 'roasSpend', label: T('…with spend ≥ $'), def: 20, step: 5 },
    { id: 'cpaOver', label: T('CPA over contract by, %'), def: 20, step: 5 },
    { id: 'authDrop', label: T('PSP auth rate drop, pp'), def: 15, step: 1 },
  ];
  const decodeRules = (s) => { const vals = String(s || '').split(',').map(Number); const r = {}; RULE_DEFS.forEach((d, i) => { r[d.id] = isNum(vals[i]) && s ? vals[i] : d.def; }); return r; };
  const encodeRules = (r) => RULE_DEFS.map((d) => r[d.id]).join(',');
  const rulesDefault = (r) => RULE_DEFS.every((d) => r[d.id] === d.def);

  /* ---------------- data & state ---------------- */
  let data = BB.load();
  /* ---------------- forecast helpers: pROAS D{ltvH} and max CPT on anchor-time cohort rows ----------------
     Cached per row.key | ltvH | model | money | targetRoas | slice until the next refresh (data reload clears the cache); computed only for the rows actually shown
     (mini-table ≤ 8 rows, the KPI chips' total). Rows with < 10 trials read "Not enough data". */
  const H = () => U.ltvHorizon(st);
  const targetRoas = () => { const n = parseFloat(st.targetRoas); return isFinite(n) && n > 0 ? n : 1; }; // hash targetRoas, shared with the Predict calculator (default 1)
  const modelLabel = () => { const m = BB.predict.MODEL_BY_ID[BB.predict.modelOf({ model: st.model })]; return m ? BB.lbl(m).replace(/ \(.*\)$/, '') : 'sBG'; };
  const predCache = new Map();
  const sliceKeyOf = () => [st.basis, st.channel, st.device, st.payer, JSON.stringify(BB.effFilters(st))].join('|');
  function predOf(r, scope) {
    const k = [scope, r.key, H(), st.model || 'sbg', st.money, targetRoas(), sliceKeyOf(), BB.predict.hashCfg ? BB.predict.hashCfg().key : ''].join('|');
    let p = predCache.get(k);
    if (!p) {
      const m = BB.predict.maxCpt({ row: r, targetRoas: targetRoas(), horizon: H(), money: st.money, data, model: st.model });
      const q = BB.predict.cohort(r, { offset: H(), money: st.money, data, model: st.model, signalDay: 'all' });
      p = Object.assign({}, m, { basis: q.basis, predicted: q.basis === 'predicted', observed: q.observed, observedShare: q.mid > 0 ? Math.min(1, q.observed / q.mid) : null, priorShare: q.priorShare || 0, pending: q.pendingUsers || 0, thin: r.trials < 10, model: q.model });
      predCache.set(k, p);
    }
    return p;
  }
  const headKind = (p) => (p.headroomPct == null ? null : p.headroomPct >= 15 ? 'good' : p.headroomPct <= -15 ? 'bad' : null);
  const predTip = (label, p) => U.tipHtml({ title: `${label} · D${p.horizon}`, formula: T('max CPT = pLTV per trial / target ROAS; pROAS = (received + expected revenue to D{h}) / spend', { h: p.horizon }),
    kv: [[`pROAS D${p.horizon}`, F.x(p.pRoas) + (p.predicted ? ` [${F.x(p.pRoasLo)} – ${F.x(p.pRoasHi)}]` : '')], [T('pLTV / trial'), F.usd2(p.pLtvPerTrial)], ['max CPT', F.usd2(p.maxCpt)], [T('CPT now'), F.usd2(p.currentCpt)], [T('Headroom'), p.headroomPct == null ? '—' : (p.headroomPct >= 0 ? '+' : '') + p.headroomPct.toFixed(0) + ' %'], [T('Target ROAS'), F.x(targetRoas())], [T('Observed'), p.observedShare == null ? '—' : F.pct(p.observedShare)], [T('Model'), modelLabel() + (p.priorShare > 0 ? ` · ${T('prior {pct}', { pct: F.pct(p.priorShare) })}` : '')]],
    note: (p.predicted ? T('Italic — forecast (80 % interval in brackets). ') : T('Actual — every user is D{h} old. ', { h: p.horizon })) + T('green: can pay ≥ 15 % more than the current CPT · red: CPT ≥ 15 % above max') });
  /* Page defaults when opened without a hash: today by hour (the real-time slice). */
  if (!location.hash.replace('#', '')) BB.state.write({ preset: 'today', step: 'hour' });
  let st = BB.state.read(PAGE);
  let R = decodeRules(st.rules);
  const USD = { code: 'USD', symbol: '$', rate: 1, share: 1 };
  let locCur = USD, cur = USD;                  // local currency of the slice (when ≥ 90 % of users share one) / active display currency
  function syncCurrency() { locCur = BB.localCurrency(data, Object.assign({}, st, { currency: 'local' })); cur = st.currency === 'local' ? locCur : USD; }
  syncCurrency();
  const mUsd = (v) => (cur.code === 'USD' ? F.usd(v) : F.money(v, cur));
  const mUsd2 = (v) => (cur.code === 'USD' ? F.usd2(v) : F.money(v, cur));
  const expanded = new Set();          // traffic tree expanded keys
  let seedKey = null;                  // channel|groupBy the tree was seeded for (channel rows expanded by default)
  let tableSort = null;                // {key, dir} managed by us (tree-aware)
  let lastSeenTs = 0;                  // for feed "new" highlighting
  let liveTimer = null;
  let pspAlerts = [];                  // PSP auth-rate alerts → Signals panel

  /* dimension values with counts for the filter popover (all users) */
  function filterDims() {
    return BB.DIMENSIONS.map((d) => {
      const m = new Map();
      data.users.forEach((u) => { const v = BB.dimValue(u, d.id); m.set(v, (m.get(v) || 0) + 1); });
      const values = Array.from(m, ([v, count]) => ({ v, label: v, count })).sort((a, b) => b.count - a.count);
      return { id: d.id, label: BB.lbl(d), values };
    });
  }
  const GROUP_DIMS = BB.DIMENSIONS.map((d) => ({ id: d.id, label: BB.lbl(d) }));

  /* ---------------- shell ---------------- */
  const sh = U.shell(PAGE, { title: 'Real-time', subtitle: '…', sourceBadge: BB.lbl(data.meta), live: st.live === '1' });
  U.applyTitle('Real-time');
  const updatedEl = el('span', { class: 'row caption', style: { gap: '6px' } }, el('span', { class: 'live-dot' }), el('span', { class: 'upd mono' }, ''));
  const liveToggle = U.toggle(T('Auto-refresh · 60 s'), st.live === '1', (v) => BB.state.write({ live: v ? '1' : null }));
  const refreshBtn = el('button', { class: 'btn sm', type: 'button', title: T('Recompute the "now" slice'), onClick: () => refresh(true) }, T('Refresh'));
  sh.headActions.append(updatedEl, liveToggle.el, refreshBtn);

  /* ---------------- toolbar (v2: channel · device · payer · currency · compare incl. channel · saved views) ---------------- */
  const tbCfg = () => ({
    range: { preset: st.preset, from: st.from || '', to: st.to || '', max: isoDate(data.now) },
    step: { options: ['hour', 'day', 'week', 'month'], value: st.step },
    channel: { value: st.channel }, device: { value: st.device },
    basis: { value: st.basis }, money: { value: st.money }, payer: { value: st.payer },
    currency: { value: st.currency, localLabel: locCur.code !== 'USD' ? locCur.code : 'Local' },
    compare: { value: st.compare, channels: true },
    views: { page: PAGE, value: st.view },
    groupBy: { dims: GROUP_DIMS, value: st.groupBy },
    filters: { dims: filterDims(), value: st.filters },
    csv: () => { U.downloadCsv('realtime-traffic.csv', tbl.toCsv()); U.toast(T('CSV exported'), 'good'); },
  });
  const tb = U.toolbar(tbCfg(), (patch) => {
    if (patch.range) BB.state.write({ preset: patch.range.preset, from: patch.range.from || null, to: patch.range.to || null });
    else BB.state.write(patch);
  });
  sh.toolbarSlot.append(tb.el);

  /* ---------------- layout skeleton ---------------- */
  const main = sh.main;
  const kpiHost = el('div'); main.append(kpiHost);

  /* pace: two small charts sharing x (money above, trials below) — never a dual-axis chart */
  const paceHost = el('div');
  const paceCard = U.card(main, { title: T('Day pace'), caption: '', body: paceHost, foot: [el('span', {}, T('Top: cumulative spend and revenue D0 (dashed = compare) · bottom: trials per interval'))] });
  paceCard.body.classList.add('chart'); paceCard.body.style.height = '340px';
  let paceStack = null;
  const paceView = U.viewToggle(paceCard, () => (paceStack ? paceStack.charts : []), { maxHeight: 340 });

  /* v2 status row: checkout funnel today · PSP auth-rate strip · device split + attribution health */
  const gStatus = el('div', { class: 'grid c3' }); main.append(gStatus);
  const coCard = U.card(gStatus, { title: T('Checkout funnel'), caption: '', body: el('div') });
  const pspBadge = U.badge('—', null, { mono: true });
  const pspCard = U.card(gStatus, { title: T('PSP auth rate'), caption: T('last hour vs 24 h'), actions: [pspBadge], body: el('div') });
  const devCard = U.card(gStatus, { title: T('Devices & attribution'), caption: '', body: el('div') });

  const gTable = el('div', { class: 'grid c2-1' }); main.append(gTable);
  const allocBadge = U.badge(ALLOC(), null, { title: T('Spend allocated by signups (ad × day) for dimensions absent from ad-network reports: device, plan, paywall…') });
  allocBadge.classList.add('hidden');
  const mdlBadges = U.modelBadges({ link: true }); sh.headActions.prepend(mdlBadges.el); // "model: …" + prior / pm / p1hl levers (hash)
  const expandBtn = el('button', { class: 'btn sm ghost', type: 'button', onClick: () => toggleAll() }, T('Expand all'));
  const tblCard = U.card(gTable, { title: T('Traffic'), caption: '', actions: [allocBadge, expandBtn], body: { flush: true, node: el('div') },
    foot: [el('span', {}, T('Status') + ': '), el('span', { class: 'row', style: { gap: '10px' } }, dotLegend('bad', T('problem')), dotLegend('warn', T('watch')), dotLegend('good', T('scale')), dotLegend('', T('ok'))), el('span', { class: 'grow' }), el('span', { class: 'mono caption' }, T('Δ CPT vs 3-day average before period'))] });
  tblCard.el.style.minWidth = '0';
  function dotLegend(k, t) { return el('span', { class: 'row caption', style: { gap: '4px' } }, el('span', { class: 'status-dot ' + k }), t); }

  const sigCount = U.badge('0', null, { mono: true });
  const rulesBtn = el('button', { class: 'btn sm', type: 'button', 'aria-haspopup': 'dialog', onClick: () => openRules(rulesBtn) }, T('Rules'));
  const sigCard = U.card(gTable, { title: T('Signals'), caption: T('by severity'), actions: [sigCount, rulesBtn], body: { flush: true, node: el('div') } });
  const sigBody = sigCard.body.firstChild; sigBody.style.maxHeight = '640px'; sigBody.style.overflow = 'auto';

  const g2 = el('div', { class: 'grid c2 rt-align-start' }); main.append(g2);
  const hmSeg = U.segmented([{ id: 'trials', label: T('Trials') }, { id: 'cpt', label: 'CPT' }], st.hm === 'cpt' ? 'cpt' : 'trials', (v) => BB.state.write({ hm: v === 'trials' ? null : v }));
  const hmCard = U.card(g2, { title: T('Geo × hour'), caption: '', actions: [hmSeg.el], body: el('div') });
  const feedSeg = U.segmented([{ id: 'all', label: T('All') }, { id: 'pay', label: T('Payments') }, { id: 'trial', label: T('Trials') }, { id: 'risk', label: T('Risks') }], st.feed || 'all', (v) => BB.state.write({ feed: v === 'all' ? null : v }));
  const feedCard = U.card(g2, { title: T('Live feed'), caption: T('last 50 events'), actions: [feedSeg.el], body: { flush: true, node: el('div') } });

  const cohLink = el('a', { class: 'btn sm', href: '#' }, T('Open in Cohorts') + ' →');
  const cohFoot = el('span', {}, '');
  const cohCard = U.card(main, { title: T('Recent cohorts'), caption: T('last 7 days · ROAS by signup day'), actions: [cohLink], body: { flush: true, node: el('div') }, foot: [el('span', {}, T('Hatched: cohort not yet mature to DN')), el('span', { class: 'predicted' }, el('span', { class: 'pv' }, T('italic')), ' — ' + T('forecast, 80% interval in tooltip')), cohFoot] });
  let cohTbl = null;

  /* ---------------- helpers over engine rows ---------------- */
  function cellsOf(r, money, d1Map, cptMap) {
    const o0 = r.byOffset[0];
    const rev0 = o0 ? (money === 'net' ? o0.rev_net : o0.rev_gross) : null;
    const d1 = d1Map ? d1Map.get(r.key) : undefined;
    const prevCpt = cptMap ? cptMap.get(r.key) : undefined;
    const cpt = ratio(r.spend, r.trials);
    const x = {
      spend: r.spend, impressions: r.impressions, cpm: BB.metric(r, 'cpm'), ctr: BB.metric(r, 'ctr'), cpc: BB.metric(r, 'cpc'), cpi: BB.metric(r, 'cpi'), landing_views: r.landing_views,
      signups: r.signups, s2t: BB.metric(r, 'signup_trial_rate'), trials: r.trials, cpt, qrate: BB.metric(r, 'qualified_rate'), cpqt: BB.metric(r, 'cpqt'),
      impression_share: BB.metric(r, 'impression_share'), contracted_cpa: BB.metric(r, 'contracted_cpa'), cpa: BB.metric(r, 'cpa'), cpa_delta: BB.metric(r, 'cpa_delta'),
      rev0, roas0: ratio(rev0, r.spend), payers0: o0 ? o0.payers : null,
      roas1: d1 === undefined ? { v: null, mature: false } : d1, prevCpt: isNum(prevCpt) ? prevCpt : null,
    };
    x.dcpt = isNum(cpt) && isNum(prevCpt) && prevCpt > 0 ? cpt / prevCpt - 1 : null;
    return x;
  }
  function evalAlerts(x) {
    const a = [];
    if (x.spend >= R.cptSpend && isNum(x.cpt) && x.cpt > R.cptMax) a.push({ severity: 'bad', chip: T('Expensive trial'), desc: T('CPT {cpt} at spend {spend} (limit {max})', { cpt: F.usd2(x.cpt), spend: F.usd(x.spend), max: F.usd(R.cptMax) }), value: F.usd2(x.cpt), sub: 'CPT' });
    if (x.spend >= R.zeroSpend && x.trials === 0) a.push({ severity: 'bad', chip: T('No trials'), desc: T('Spend {spend}, {signups} signups, 0 trials', { spend: F.usd(x.spend), signups: F.int(x.signups) }), value: F.usd(x.spend), sub: T('spend') });
    if (x.trials >= R.qualTrials && isNum(x.qrate) && x.qrate < R.qualMin / 100) a.push({ severity: 'warn', chip: T('Timer cancels'), desc: T('Qualified {rate} of {trials} trials (limit {min} %)', { rate: F.pct(x.qrate), trials: F.int(x.trials), min: R.qualMin }), value: F.pct(x.qrate), sub: T('qualified') });
    if (x.spend >= R.cptSpend && isNum(x.cpa_delta) && x.cpa_delta > R.cpaOver / 100) a.push({ severity: 'warn', chip: T('CPA over contract'), desc: T('Effective CPA {cpa} vs contract {contract} ({delta}, limit +{max}%)', { cpa: F.usd2(x.cpa), contract: F.usd2(x.contracted_cpa), delta: F.delta(x.cpa_delta, -1).text, max: R.cpaOver }), value: F.usd2(x.cpa), sub: 'CPA' });
    if (x.spend >= R.roasSpend && isNum(x.roas0) && x.roas0 >= R.roasMin) a.push({ severity: 'good', chip: T('Scale?'), desc: T('ROAS D0 {roas}, {trials} trials, spend {spend}', { roas: F.x(x.roas0), trials: F.int(x.trials), spend: F.usd(x.spend) }), value: F.x(x.roas0), sub: 'ROAS D0' });
    return a;
  }
  const SEV_ORDER = { bad: 0, warn: 1, info: 2, good: 3 };
  const worst = (alerts) => alerts.slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])[0];

  /* walk a tree (hierarchy rows) → Map key → value */
  function mapTree(rows, fn, m = new Map()) { rows.forEach((r) => { m.set(r.key, fn(r)); if (r.children) mapTree(r.children, fn, m); }); return m; }
  function customState(from, to, patch) { return Object.assign({}, st, { preset: 'custom', from: isoDate(from), to: isoDate(to) }, patch || {}); }
  /* rows of the traffic table: flat breakdown by a dim, or the channel-aware tree (channel ▸ per-channel levels). `allocated` = spend was allocated for a non-spendable slice. */
  function rowsFor(state, offsets) {
    if (st.groupBy) { const b = BB.breakdown({ data, state, dim: st.groupBy, offsets }); return { rows: b.rows, total: b.total, allocated: b.spendAllocated, columns: {} }; }
    const h = BB.hierarchy({ data, state, offsets, byChannel: true }); return { rows: h.rows, total: h.total, allocated: h.spendAllocated, columns: h.columns };
  }

  /* ---------------- traffic table ---------------- */
  let tree = { rows: [], total: null, hasD1: false, columns: {} };
  const colNum = (key, label, fmt, extra) => Object.assign({ key, label, fmt, get: (r) => r.x[key] }, extra || {});
  const roasHeat = (v) => (v >= R.roasMin ? { kind: 'good', alpha: 0.12 + Math.min(0.5, (v - R.roasMin) * 1.2) } : v < R.roasMin / 2 ? { kind: 'bad', alpha: 0.06 + (R.roasMin / 2 - v) / Math.max(R.roasMin, 0.01) * 0.3 } : { kind: 'warn', alpha: 0.1 });
  const LEVEL_FALLBACK = { channel: T('channel'), campaign: T('campaign'), adset: T('ad set'), ad: T('ad'), partner: T('partner'), placement: T('placement') };
  function levelLabel(r) {
    if (r.level === 'channel') return T('channel');
    const c = BB.CHANNEL_BY_ID[r.channel], l = c && c.levels.find((x) => x.id === r.level);
    return l ? BB.lbl(l).toLowerCase() : LEVEL_FALLBACK[r.level] || r.level;
  }
  function treeLabel() {
    if (st.groupBy) return DIM_LBL(st.groupBy);
    const c = BB.CHANNEL_BY_ID[st.channel], lv = c ? c.levels : BB.CHANNEL_BY_ID.facebook.levels;
    return [T('Channel')].concat(lv.map((l) => BB.lbl(l))).join(' ▸ ');
  }
  function nameCell(r) {
    const depth = r._depth || 0, hasKids = !!(r.children && r.children.length);
    const wrap = el('span', { class: 'row', style: { gap: '4px', paddingLeft: depth * 14 + 'px', display: 'inline-flex', maxWidth: '100%' } });
    if (hasKids) { const ex = el('span', { class: 'exp', 'aria-hidden': 'true' }, U.icon('chev')); if (expanded.has(r.key)) ex.style.transform = 'rotate(90deg)'; wrap.append(ex); }
    const w = worst(r.alerts);
    wrap.append(el('span', { class: 'status-dot ' + (w ? w.severity : ''), role: 'img', 'aria-label': T('status') + ': ' + (w ? w.chip : T('ok')), title: w ? w.chip : T('ok') }));
    if (r.level === 'channel' && r.color) wrap.append(el('span', { 'aria-hidden': 'true', style: { width: '8px', height: '8px', borderRadius: '50%', background: r.color, flex: 'none' } }));
    wrap.append(el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: r.level === 'channel' ? '500' : null }, title: r.label }, r.label));
    if (r.isOther) wrap.append(el('span', { class: 'sub' }, `+${r.count}`));
    else if (r.level) wrap.append(el('span', { class: 'sub' }, levelLabel(r)));
    return wrap;
  }
  /* channel-adaptive columns: the engine's `columns[channel]` lists, in a canonical order; 'all' → union over channels present in the tree */
  const DYN_ORDER = ['impressions', 'impression_share', 'cpm', 'ctr', 'cpc', 'cpi', 'contracted_cpa', 'cpa', 'cpa_delta'];
  const DYN_DEFS = {
    impressions: () => colNum('impressions', mLbl('impressions'), 'int', { metric: 'impressions' }),
    impression_share: () => colNum('impression_share', mLbl('impression_share'), 'pct', { metric: 'impression_share', tip: mFml('impression_share') + ' · ' + T('channel level only'), heatmap: 'info' }),
    cpm: () => colNum('cpm', 'CPM', mUsd2, { metric: 'cpm', tip: mFml('cpm') }),
    ctr: () => colNum('ctr', 'CTR', 'pct', { metric: 'ctr', tip: mFml('ctr') }),
    cpc: () => colNum('cpc', 'CPC', mUsd2, { metric: 'cpc', tip: mFml('cpc'), heatmap: 'bad', dir: 1 }),
    cpi: () => colNum('cpi', 'CPI', mUsd2, { metric: 'cpi', tip: mFml('cpi') }),
    contracted_cpa: () => colNum('contracted_cpa', mLbl('contracted_cpa'), mUsd2, { metric: 'contracted_cpa', tip: mFml('contracted_cpa') }),
    cpa: () => colNum('cpa', mLbl('cpa'), mUsd2, { metric: 'cpa', tip: mFml('cpa') }),
    cpa_delta: () => colNum('cpa_delta', mLbl('cpa_delta'), 'pct', { metric: 'cpa_delta', tip: mFml('cpa_delta'), get: (r) => (isNum(r.x.cpa_delta) ? { v: r.x.cpa_delta, cls: F.delta(r.x.cpa_delta, -1).cls, over: r.x.cpa_delta > R.cpaOver / 100 && r.x.spend >= R.cptSpend } : null), render: (r) => (isNum(r.x.cpa_delta) ? F.delta(r.x.cpa_delta, -1).text : null) }),
  };
  function dynKeys() {
    if (st.groupBy) return ['impressions', 'cpm', 'ctr', 'cpc'];
    const chans = st.channel !== 'all' ? [st.channel] : tree.rows.map((r) => r.channel);
    const set = new Set(); chans.forEach((c) => (tree.columns[c] || []).forEach((k) => set.add(k)));
    const keys = DYN_ORDER.filter((k) => set.has(k));
    return keys.length ? keys : ['impressions', 'cpm', 'ctr', 'cpc'];
  }
  const columns = () => [
    { key: 'label', label: treeLabel(), sticky: true, text: true, width: 250, get: (r) => r.label, render: (r) => (r.isTotal ? r.label : nameCell(r)) },
    colNum('spend', mLbl('spend'), mUsd, { metric: 'spend', tip: mFml('spend') + (tree.allocated ? ' · ≈ ' + T('spend allocated by signups') : '') }),
    ...dynKeys().map((k) => DYN_DEFS[k]()),
    colNum('landing_views', T('Landing'), 'int', { tip: mLbl('landing_views') }),
    colNum('signups', mLbl('signups'), 'int', { tip: mFml('signups') }),
    colNum('s2t', mLbl('signup_trial_rate'), 'pct', { metric: 'signup_trial_rate', tip: mFml('signup_trial_rate'), heatmap: 'good' }),
    colNum('trials', mLbl('trials'), 'int'),
    colNum('cpt', 'CPT', mUsd2, { metric: 'cpt', tip: mFml('cpt'), heatmap: 'bad', dir: 1, get: (r) => (isNum(r.x.cpt) ? { v: r.x.cpt, over: r.x.spend >= R.cptSpend && r.x.cpt > R.cptMax } : null) }),
    colNum('qrate', mLbl('qualified_rate'), 'pct', { metric: 'qualified_rate', tip: mFml('qualified_rate') + ' · ' + T('not cancelled in 20 min'), heatmap: 'good', get: (r) => (isNum(r.x.qrate) ? { v: r.x.qrate, over: r.x.trials >= R.qualTrials && r.x.qrate < R.qualMin / 100 } : null) }),
    colNum('cpqt', 'CPQT', mUsd2, { metric: 'cpqt', tip: mFml('cpqt') }),
    colNum('rev0', T('Revenue D0'), mUsd2, { tip: T('Revenue in first 24 h after signup (intro + packs + 1-day trial rebills)') }),
    colNum('roas0', 'ROAS D0', 'x', { tip: T('revenue D0 / spend'), heatmap: roasHeat }),
    colNum('roas1', 'ROAS D1', 'x', { tip: T('revenue D1 / spend · cohorts up to yesterday only'), hidden: !tree.hasD1, heatmap: roasHeat }),
    colNum('payers0', T('Payers D0'), 'int', { tip: `${T('Payers in first 24 h')} · ${BB.payerLabel(st)}` }),
    colNum('dcpt', T('Δ CPT 3d'), 'pct', { tip: T('CPT in period / avg CPT of 3 days before − 1'), get: (r) => (isNum(r.x.dcpt) ? { v: r.x.dcpt, cls: F.delta(r.x.dcpt, -1).cls } : null), render: (r) => (isNum(r.x.dcpt) ? F.delta(r.x.dcpt, -1).text : null) }),
  ];
  function cellTip(r, col, raw) {
    const x = r.x, kv = (n, d, nv, dv) => ({ title: `${r.label} · ${col.label}`, formula: col.tip, kv: [[n, nv], [d, dv]] });
    switch (col.key) {
      case 'cpm': return kv(T('Spend'), T('Impressions'), F.usd2(x.spend), F.int(x.impressions));
      case 'ctr': return kv(T('Clicks'), T('Impressions'), F.int(r.clicks), F.int(x.impressions));
      case 'cpc': return kv(T('Spend'), T('Clicks'), F.usd2(x.spend), F.int(r.clicks));
      case 'cpi': return kv(T('Spend'), T('Signups'), F.usd2(x.spend), F.int(x.signups));
      case 's2t': return kv(T('Trials'), T('Signups'), F.int(x.trials), F.int(x.signups));
      case 'cpt': return kv(T('Spend'), T('Trials'), F.usd2(x.spend), F.int(x.trials));
      case 'cpa': return kv(T('Spend'), T('Trials'), F.usd2(x.spend), F.int(x.trials));
      case 'cpa_delta': return { title: `${r.label} · ${mLbl('cpa_delta')}`, formula: col.tip, kv: [['CPA', F.usd2(x.cpa)], [mLbl('contracted_cpa'), F.usd2(x.contracted_cpa)]] };
      case 'impression_share': return r.level === 'channel' ? kv(T('Channel impressions'), T('Slice impressions'), F.int(x.impressions), F.int(tree.total ? tree.total.impressions : null)) : { title: `${r.label} · ${mLbl('impression_share')}`, note: T('Channel level only') };
      case 'qrate': return kv(T('Qualified trials'), T('Trials'), F.int(r.qualified), F.int(x.trials));
      case 'cpqt': return kv(T('Spend'), T('Qualified trials'), F.usd2(x.spend), F.int(r.qualified));
      case 'roas0': return kv(T('Revenue D0'), T('Spend'), F.usd2(x.rev0), F.usd2(x.spend));
      case 'roas1': return raw && raw.mature === false ? { title: `${r.label} · ROAS D1`, note: T('No mature cohorts: D1 needs signups up to yesterday') } : { title: `${r.label} · ROAS D1`, formula: col.tip, kv: [['ROAS D1', F.x(raw && raw.v)], [T('Cohorts'), T('up to yesterday')]] };
      case 'payers0': return { title: `${r.label} · ${T('Payers D0')}`, formula: BB.payerLabel(st), kv: [[T('Payers D0'), F.int(x.payers0)], [T('Trials'), F.int(x.trials)]] };
      case 'dcpt': return { title: `${r.label} · Δ CPT`, formula: col.tip, kv: [[T('CPT now'), F.usd2(x.cpt)], [T('CPT 3 days'), F.usd2(x.prevCpt)]] };
      default: return r.alerts && r.alerts.length && col.key === 'label' ? { title: r.label, kv: r.alerts.map((a) => [a.chip, a.value]) } : null;
    }
  }
  function sortSiblings(rows) {
    if (!tableSort) return rows;
    const col = columns().find((c) => c.key === tableSort.key); if (!col) return rows;
    const dir = tableSort.dir === 'asc' ? 1 : -1, val = (r) => { const raw = col.get(r); return raw != null && typeof raw === 'object' ? raw.v : raw; };
    return rows.slice().sort((a, b) => { const va = val(a), vb = val(b); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return isNum(va) && isNum(vb) ? (va - vb) * dir : String(va).localeCompare(String(vb), 'ru') * dir; });
  }
  function flatten(rows, depth, out) { sortSiblings(rows).forEach((r) => { r._depth = depth; out.push(r); if (r.children && r.children.length && expanded.has(r.key)) flatten(r.children, depth + 1, out); }); return out; }
  const tbl = U.table(tblCard.body.firstChild, {
    columns: columns(), rows: [], total: null, maxHeight: 640, sort: null,
    onSort: (s) => { tableSort = s; paintTable(); },
    onRowClick: (r) => { if (r.children && r.children.length) { if (expanded.has(r.key)) expanded.delete(r.key); else expanded.add(r.key); paintTable(); } },
    rowClass: (r, o) => (o.total ? '' : (r._depth ? 'child' : '') + (r.children && r.children.length ? ' group' : '')),
    cellTip,
    emptyText: T('No traffic in period'),
  });
  function paintTable() { tbl.update({ columns: columns(), rows: flatten(tree.rows, 0, []), total: tree.total, sort: tableSort }); }
  function toggleAll() {
    const allKeys = []; mapTree(tree.rows, (r) => { if (r.children && r.children.length) allKeys.push(r.key); });
    const allOpen = allKeys.length && allKeys.every((k) => expanded.has(k));
    if (allOpen) expanded.clear(); else allKeys.forEach((k) => expanded.add(k));
    expandBtn.textContent = allOpen ? T('Expand all') : T('Collapse all'); paintTable();
  }
  function revealRow(path) { path.forEach((k) => expanded.add(k)); paintTable(); const last = path[path.length - 1]; const row = flatten(tree.rows, 0, []).find((r) => r.key === last); if (!row) return; const idx = flatten(tree.rows, 0, []).indexOf(row); const tr = tbl.table.tBodies[0] && tbl.table.tBodies[0].rows[idx + (tree.total ? 1 : 0)]; if (tr) { tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); tr.style.outline = '1px solid var(--accent)'; setTimeout(() => (tr.style.outline = ''), 1600); } }

  function buildTable(range) {
    const money = st.money, todayStart = startOfDay(data.now), yEnd = todayStart - DAY;
    const cur0 = rowsFor(st, [0, 1]);
    // ROAS D1 only for the part of the range that has matured (cohorts up to yesterday) — engine marks D1 immature whenever the range ends today
    const hasD1 = range.from <= yEnd;
    let d1Map = null;
    if (hasD1) { const prev = rowsFor(customState(range.from, yEnd), [1]); d1Map = mapTree(prev.rows, (r) => (r.byOffset[1] && r.byOffset[1].mature ? BB.metric(r, 'roas', 1, money) : { v: null, mature: false })); d1Map.set('__total', prev.total.byOffset[1] && prev.total.byOffset[1].maturedRows ? BB.metric(prev.total, 'roas', 1, money) : { v: null, mature: false }); }
    // 3-day average CPT: three full days before the range start day
    const rs = startOfDay(range.from), p3 = rowsFor(customState(rs - 3 * DAY, rs - DAY), [0]);
    const cptMap = mapTree(p3.rows, (r) => ratio(r.spend, r.trials)); cptMap.set('__total', ratio(p3.total.spend, p3.total.trials));
    const decorate = (r) => { r.x = cellsOf(r, money, d1Map, cptMap); r.alerts = evalAlerts(r.x); if (r.children) r.children.forEach(decorate); };
    cur0.rows.forEach(decorate);
    cur0.total.x = cellsOf(cur0.total, money, d1Map, cptMap); cur0.total.alerts = []; cur0.total.isTotal = true;
    tree = { rows: cur0.rows, total: cur0.total, hasD1, columns: cur0.columns, allocated: cur0.allocated };
    // seed the tree: channel rows open by default (once per channel / group-by combination)
    const sk = st.channel + '|' + (st.groupBy || '');
    if (sk !== seedKey) { seedKey = sk; expanded.clear(); tableSort = null; cur0.rows.forEach((r) => { if (r.level === 'channel' && r.children && r.children.length) expanded.add(r.key); }); }
    allocBadge.classList.toggle('hidden', !cur0.allocated);
    expandBtn.classList.toggle('hidden', !!st.groupBy);
    const thin = U.isThin(cur0.total.signups) ? ' · ' + T('Not enough data (< 30 users)') : '';
    tblCard.setCaption((st.groupBy ? `${DIM_LBL(st.groupBy)} · ${T('top-15 by spend')}` : st.channel !== 'all' ? `${chLabel(st.channel)} · ${(BB.CHANNEL_BY_ID[st.channel] || { levels: [] }).levels.map((l) => BB.lbl(l)).join(' ▸ ') || T('no hierarchy')}` : T('channel ▸ campaign ▸ ad set ▸ ad')) + (cur.code !== 'USD' ? ` · ${cur.code}` : '') + thin);
    paintTable();
    paintSignals();
  }

  /* ---------------- signals panel (table rules + PSP auth-rate alerts) ---------------- */
  function paintSignals() {
    const list = pspAlerts.slice();
    const walk = (rows, path, labels) => rows.forEach((r) => {
      const p = path.concat(r.key), l = labels.concat(r.label);
      r.alerts.forEach((a) => list.push(Object.assign({}, a, { title: l.join(' › '), spend: r.spend, onClick: () => revealRow(p) })));
      if (r.children) walk(r.children, p, l);
    });
    walk(tree.rows, [], []);
    list.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.spend - a.spend);
    U.alertList(sigBody, list, { emptyText: T('No signals') });
    const nBad = list.filter((a) => a.severity === 'bad').length, nWarn = list.filter((a) => a.severity === 'warn').length;
    sigCount.textContent = String(list.length); sigCount.className = 'badge mono ' + (nBad ? 'bad' : nWarn ? 'warn' : list.length ? 'good' : '');
    sigCard.setCaption(T('by severity') + ' · ' + (rulesDefault(R) ? T('default rules') : T('custom rules')) + (pspAlerts.length ? ` · PSP: ${pspAlerts.length}` : ''));
  }
  function openRules(anchor) {
    U.popover(anchor, (api) => {
      const draft = Object.assign({}, R), inputs = {};
      const body = el('div', { class: 'pbody', style: { padding: '8px 12px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px', gap: '6px 10px', alignItems: 'center' } });
      RULE_DEFS.forEach((d) => {
        const inp = el('input', { class: 'input num', type: 'number', inputmode: 'decimal', step: d.step, min: 0, value: draft[d.id], 'aria-label': d.label });
        inp.addEventListener('input', () => { const v = Number(inp.value); if (isNum(v)) draft[d.id] = v; });
        inputs[d.id] = inp; body.append(el('label', { class: 'caption', style: { fontSize: '12px' } }, d.label), inp);
      });
      const legend = el('div', { class: 'caption', style: { padding: '0 12px 8px' } }, T('Red: Expensive trial, No trials, Auth ↓ · Yellow: Timer cancels, CPA over contract · Green: Scale?'));
      return [el('div', { class: 'ph' }, T('Signal rules'), el('span', { class: 'caption' }, T('thresholds'))), body, legend,
        el('div', { class: 'pfoot' },
          el('button', { class: 'btn ghost sm', type: 'button', onClick: () => { RULE_DEFS.forEach((d) => { draft[d.id] = d.def; inputs[d.id].value = d.def; }); } }, T('Defaults')),
          el('button', { class: 'btn primary sm', type: 'button', onClick: () => { R = draft; BB.state.write({ rules: rulesDefault(R) ? null : encodeRules(R) }); api.close(); U.toast(T('Rules applied'), 'good'); } }, T('Apply')))];
    }, { width: 340, align: 'right' });
  }

  /* ---------------- KPI strip ---------------- */
  function compareLabel(ts) {
    if (!ts.compareTotals) return T('no compare');
    if (ts.compareKind === 'channel') return T('vs {channel} (same cohort)', { channel: chLabel(ts.compareChannel) });
    return st.preset === 'today' ? T('vs same time yesterday') : T('vs previous period');
  }
  function kpis(ts) {
    const money = st.money, Tot = ts.totals, P = ts.compareTotals, B = ts.buckets;
    const rev = (b) => (money === 'net' ? b.rev_d0_net : b.rev_d0_gross), rd = (b) => b.refunds + b.disputes;
    const alloc = ts.spendAllocated ? T('≈ allocated') : null, allocHint = ts.spendAllocated ? ' · ≈ ' + T('spend allocated by signups') : '';
    const defs = [
      { label: mLbl('spend'), fmt: 'usd', money: true, dir: 0, v: (b) => b.spend, hint: mFml('spend') + allocHint, group: alloc }, // dir 0: spend is neutral — more is not better or worse
      { label: mLbl('signups'), fmt: 'int', dir: 1, v: (b) => b.signups, hint: mFml('signups') },
      { label: mLbl('cpi'), fmt: 'usd2', money: true, dir: -1, v: (b) => ratio(b.spend, b.signups), hint: mFml('cpi') + allocHint, group: alloc },
      { label: mLbl('trials'), fmt: 'int', dir: 1, v: (b) => b.trials, hint: T('Trial starts') },
      { label: mLbl('cpt'), fmt: 'usd2', money: true, dir: -1, v: (b) => ratio(b.spend, b.trials), hint: mFml('cpt') + allocHint, group: alloc },
      { label: mLbl('qualified'), fmt: 'int', dir: 1, v: (b) => b.qualified, hint: mFml('qualified') },
      { label: mLbl('cpqt'), fmt: 'usd2', money: true, dir: -1, v: (b) => ratio(b.spend, b.qualified), hint: mFml('cpqt') + allocHint, group: alloc },
      { label: T('Revenue D0'), fmt: 'usd2', money: true, dir: 1, v: rev, hint: T('{money} revenue in first 24 h, by charge time', { money: money === 'net' ? 'net' : 'gross' }) },
      { label: 'ROAS D0', fmt: 'x', dir: 1, v: (b) => ratio(rev(b), b.spend), hint: T('revenue D0 / spend') + allocHint, strong: true, group: alloc },
      { label: T('Payers D0'), fmt: 'int', dir: 1, v: (b) => b.payers_d0, hint: `${T('Payers in first 24 h')} · ${BB.payerLabel(st)}`, group: payerShort() },
      { label: T('Declines'), fmt: 'int', dir: -1, v: (b) => b.failed, hint: T('Declined charges (all attempts, all PSPs)') },
      { label: T('Refunds & disputes'), fmt: 'usd2', money: true, dir: -1, v: rd, hint: T('Refunds + disputes incl. dispute fee') },
    ];
    const dl = compareLabel(ts);
    const co = P ? BB.state.compareOf(st, ts.range, data.now, data) : null; // compare window incomplete (coverage < 60 %) → deltas show "—", never "▲ > 500%"
    /* global "LTV D{ltvH} / trial" tile on the same slice (signup cohorts of the range), inserted right after CPT */
    const cst = (s2) => Object.assign({}, s2, { step: 'day', groupBy: null });
    const ltvTot = BB.cohorts({ data, state: cst(st), offsets: [U.ltvHorizon(st)] }).total, ltvCmp = co && co.state ? BB.cohorts({ data, state: cst(co.state), offsets: [U.ltvHorizon(st)] }).total : null;
    const sliceKey = (r, ch) => [isoDate(r.from), isoDate(r.to), st.channel, st.device, JSON.stringify(BB.effFilters(st)), ch || ''].join('|');
    const ltvTile = U.ltvKpi({ data, total: ltvTot, st, sliceKey: sliceKey(ts.range), cmpTotal: ltvCmp, cmpKey: co ? sliceKey(co.range, co.channel) : null, cmpValid: co ? co.valid : null, deltaLabel: dl, cur: cur.code !== 'USD' ? cur : null });
    const nodes = defs.map((d) => {
      const curV = d.v(Tot), prev = P ? d.v(P) : null;
      const delta = !P ? null : co && co.valid === false ? 'na' : BB.fmt.rel(curV, prev);
      const c = { label: d.label, value: curV, fmt: d.fmt, dir: d.dir, delta, hint: d.hint, group: d.group || null, spark: B.length > 1 ? B.map((b) => d.v(b)).map((x) => (isNum(x) ? x : 0)) : null, deltaLabel: dl, basis: P ? dl : T('no compare') };
      if (d.money && cur.code !== 'USD') { c.value = F.money(curV, cur); c.fmt = null; }
      const node = U.kpiCard(c); if (d.strong) node.style.borderColor = 'var(--accent)'; return node;
    });
    /* chips "max CPT" and "pROAS D{ltvH}" under the CPT card, on the range's cohort total (same slice as the LTV tile): colour vs the current CPT (green ≥ +15 % headroom, red ≤ −15 %) */
    const chips = el('div', { class: 'kpi-chips row', style: { gap: '4px', flexWrap: 'wrap', marginTop: '4px' } });
    if (!ltvTot || ltvTot.trials < 10) chips.append(U.badge(T('Not enough data'), null, { title: T('max CPT / pROAS need ≥ 10 trials in the range') }));
    else {
      const p = predOf(ltvTot, 'kpi'), kind = headKind(p);
      const b1 = U.badge(`max CPT ${mUsd2(p.maxCpt)}`, kind, { mono: true }), b2 = U.badge(`pROAS D${p.horizon} ${F.x(p.pRoas)}`, kind, { mono: true });
      [b1, b2].forEach((b) => { if (p.predicted) b.classList.add('predicted'); b.addEventListener('mouseenter', (e) => U.showHover(predTip(T('Range cohorts'), p), e.clientX, e.clientY)); b.addEventListener('mouseleave', U.hideHover); });
      chips.append(b1, b2);
    }
    nodes[4].append(chips);
    nodes.splice(5, 0, ltvTile);
    U.kpiRow(kpiHost, nodes, { cols: 6 });
  }

  /* ---------------- pace chart ---------------- */
  function pace(ts) {
    const money = st.money, B = ts.buckets, C = ts.compareBuckets;
    const cum = (arr, f) => { let s = 0; return arr.map((b) => (b ? (s += f(b)) : null)); };
    const rev = (b) => (money === 'net' ? b.rev_d0_net : b.rev_d0_gross);
    const cmpLabel = ts.compareKind === 'channel' ? chLabel(ts.compareChannel) : st.preset === 'today' ? T('yesterday') : T('prev. period');
    /* entity colours: spend = slot 1 (blue), revenue = slot 3 (aqua), trials = slot 2 (orange) — the same on every board */
    const SPEND = U.palette(0), REV = U.palette(2), TRI = U.palette(1);
    const ds = [
      { label: T('Spend, cumulative'), data: cum(B, (b) => b.spend), borderColor: SPEND, fill: true, order: 1, _nmFmt: 'usd2' },
      { label: T('Revenue D0, cumulative'), data: cum(B, rev), borderColor: REV, order: 1, _nmFmt: 'usd2' },
    ];
    const tri = [{ label: T('Trials per interval'), data: B.map((b) => b.trials), backgroundColor: TRI, _nmFmt: 'int' }];
    if (C) {
      let s1 = 0, s2 = 0; const cs = C.map((b) => (b ? (s1 += b.spend) : null)), cr = C.map((b) => (b ? (s2 += rev(b)) : null));
      ds.push({ label: T('Spend, {cmp}', { cmp: cmpLabel }), data: cs, borderColor: U.hexA(SPEND, 0.55), borderDash: [3, 3], order: 2, _nmFmt: 'usd2' });
      ds.push({ label: T('Revenue D0, {cmp}', { cmp: cmpLabel }), data: cr, borderColor: U.hexA(REV, 0.55), borderDash: [3, 3], order: 2, _nmFmt: 'usd2' });
      tri.push({ label: T('Trials, {cmp}', { cmp: cmpLabel }), data: C.map((b) => (b ? b.trials : null)), backgroundColor: U.hexA(TRI, 0.4), _nmFmt: 'int' });
    }
    const labels = B.map((b) => b.label);
    const moneyCfg = { type: 'line', ariaLabel: T('Cumulative spend and revenue D0'), data: { labels, datasets: ds }, options: {
      scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { callback: (v) => mUsd(v), maxTicksLimit: 5 } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y == null ? '—' : mUsd2(c.parsed.y)}` } } },
    } };
    const triCfg = { type: 'bar', ariaLabel: T('Trials per interval'), data: { labels, datasets: tri }, options: {
      scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 3 } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y == null ? '—' : F.int(c.parsed.y)}` } } },
    } };
    if (paceStack) paceStack.destroy();
    paceStack = U.chartStack(paceHost, [moneyCfg, triCfg], { heights: [5, 3] });
    paceView.refresh();
    const spendT = ts.totals.spend, revT = money === 'net' ? ts.totals.rev_d0_net : ts.totals.rev_d0_gross;
    paceCard.setTitle(st.preset === 'today' ? T('Day pace') : T('Period pace'));
    paceCard.setCaption(`${STEP_LBL[st.step]} · ${BB.plural(B.length, 'interval|intervals')} · ${T('spend {spend} → revenue D0 {rev} ({roas})', { spend: mUsd(spendT), rev: mUsd2(revT), roas: F.x(ratio(revT, spendT)) })}` + (ts.spendAllocated ? ' · ' + ALLOC() : ''));
  }

  /* ---------------- v2 status row: checkout funnel · PSP strip · device / attribution ---------------- */
  const tone = (kind) => (kind ? { borderColor: `rgba(var(--${kind}-rgb),.55)`, color: `var(--${kind})` } : null);
  function statChip(parts, kind, opts) {
    const c = el('span', { class: 'chip', style: Object.assign({ height: 'auto', minHeight: '24px', padding: '2px 8px', gap: '6px', whiteSpace: 'normal' }, tone(kind) || {}), title: (opts && opts.title) || null, onClick: (opts && opts.onClick) || null });
    if (opts && opts.onClick) { c.style.cursor = 'pointer'; c.setAttribute('role', 'button'); c.tabIndex = 0; c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClick(); } }); }
    if (opts && opts.dot) c.append(el('span', { 'aria-hidden': 'true', style: { width: '8px', height: '8px', borderRadius: '50%', background: opts.dot, flex: 'none' } }));
    parts.forEach((p, i) => c.append(el('span', { class: i === 0 ? 'v' : 'k mono', style: i === 0 && kind ? { color: 'inherit' } : null }, p)));
    if (opts && opts.active) { c.style.borderColor = 'var(--accent)'; c.style.boxShadow = '0 0 0 1px rgba(var(--accent-rgb),.35)'; }
    return c;
  }
  const chipRow = (chips) => el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, chips);
  const kicker = (t) => el('div', { class: 'caption', style: { margin: '10px 0 6px' } }, t);

  function checkout(nSign) {
    const body = coCard.body, cf = BB.checkoutFunnel({ data, state: st });
    U.clear(body);
    const stepOf = (id) => cf.steps.find((s) => s.id === id) || { users: 0 };
    const pw = stepOf('paywall_view'), co = stepOf('checkout_start'), tr = stepOf('trial_start');
    if (U.isThin(cf.signups)) { U.emptyState(body, T('Not enough data'), { sub: T('{n} signups in slice · need ≥ {min}', { n: F.int(cf.signups), min: BB.MIN_USERS }) }); coCard.setCaption(BB.plural(cf.signups, 'signup|signups', { fmt: F.int })); return; }
    U.funnelBars(body, [
      { label: T('Paywall view'), value: pw.users, sub: T('{pct} of signups', { pct: F.pct(cf.paywallViewRate) }) },
      { label: T('Checkout started'), value: co.users, sub: T('of paywall') },
      { label: T('Trial started'), value: tr.users, sub: T('of checkout') },
    ]);
    const errRate = cf.errors.rate, errKind = !isNum(errRate) ? null : errRate > 0.08 ? 'bad' : errRate > 0.04 ? 'warn' : 'good';
    body.append(kicker(T('Checkout errors: {n} of {m} ({pct}) · by PSP', { n: F.int(cf.errors.n), m: F.int(co.users), pct: F.pct(errRate) })));
    const chips = cf.errors.byPsp.map((p) => { const k = !isNum(p.rate) ? null : p.rate > 0.08 ? 'bad' : p.rate > 0.04 ? 'warn' : 'good'; return statChip([pspLabel(p.psp), `${F.pct(p.rate)}`, `${F.int(p.errors)}/${F.int(p.starts)}`], k, { title: `${pspLabel(p.psp)} · ${T('errors / checkout starts')} · ${p.codes.slice(0, 3).map((c) => `${c.code} ${F.int(c.n)}`).join(', ') || T('no errors')}` }); });
    body.append(chipRow(chips.length ? chips : [statChip([T('no checkout starts')], null)]));
    if (cf.errors.byMethod.length) body.append(kicker(T('by method') + ': ' + cf.errors.byMethod.slice(0, 4).map((m) => `${pmLabel(m.payment_method)} ${F.pct(m.rate)}`).join(' · ')));
    if (cf.errors.codes.length) body.append(el('div', { class: 'caption mono', style: { marginTop: '4px' } }, T('codes') + ': ' + cf.errors.codes.slice(0, 3).map((c) => `${c.code} ×${c.n}`).join(', ')));
    coCard.setCaption(`${BB.plural(cf.signups, 'signup|signups', { fmt: F.int })} · ${T('errors')} ${F.pct(errRate)}` + (errKind === 'bad' ? ' ⚠' : ''));
  }

  function psp() {
    const body = pspCard.body, h = BB.pspHealth({ data, state: st, window: 1 });
    U.clear(body); pspAlerts = [];
    const thr = R.authDrop / 100;
    const kindOf = (x) => (x.attempts >= 20 && isNum(x.dropPp) && x.dropPp >= thr ? 'bad' : x.attempts >= 20 && isNum(x.dropPp) && x.dropPp >= thr / 2 ? 'warn' : x.attempts > 0 && isNum(x.dropPp) ? 'good' : null);
    const scroll = () => pspCard.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const mk = (label, x, dot) => {
      const k = kindOf(x);
      const parts = x.attempts ? [label, F.pct(x.authRate), `${T('24 h')} ${F.pct(x.baselineAuthRate)}`, pp(x.dropPp), BB.plural(x.attempts, 'attempt|attempts', { fmt: F.int })] : [label, T('no attempts in last hour'), `${T('24 h')} ${F.pct(x.baselineAuthRate)}`];
      const tip = T('{label}: auth rate last hour {now} vs {base} over 24 h · {attempts} attempts, {failed} declines', { label, now: F.pct(x.authRate), base: F.pct(x.baselineAuthRate), attempts: F.int(x.attempts), failed: F.int(x.failed) }) + (x.codes && x.codes.length ? ` · ${x.codes.slice(0, 3).map((c) => `${c.code} ×${c.n}`).join(', ')}` : '');
      if (k === 'bad') pspAlerts.push({ severity: 'bad', chip: T('Auth ↓'), title: `PSP · ${label}`, desc: T('Auth rate last hour {now} vs {base} 24 h ({pp}, {attempts} attempts, limit {thr} pp)', { now: F.pct(x.authRate), base: F.pct(x.baselineAuthRate), pp: pp(x.dropPp), attempts: F.int(x.attempts), thr: R.authDrop }), value: F.pct(x.authRate), sub: T('last 1 h'), spend: Infinity, onClick: scroll });
      else if (k === 'warn') pspAlerts.push({ severity: 'warn', chip: T('Auth dropping'), title: `PSP · ${label}`, desc: T('Auth rate last hour {now} vs {base} 24 h ({pp}, {attempts} attempts)', { now: F.pct(x.authRate), base: F.pct(x.baselineAuthRate), pp: pp(x.dropPp), attempts: F.int(x.attempts) }), value: F.pct(x.authRate), sub: T('last 1 h'), spend: Infinity, onClick: scroll });
      return statChip(parts, k, { title: tip, dot });
    };
    body.append(chipRow([mk(T('All PSPs'), h)]));
    body.append(kicker(T('by provider')));
    body.append(chipRow(h.byPsp.length ? h.byPsp.map((p) => mk(pspLabel(p.psp), p)) : [statChip([T('no charges in last hour')], null)]));
    body.append(kicker(T('by payment method')));
    body.append(chipRow(h.byMethod.length ? h.byMethod.map((m) => mk(pmLabel(m.payment_method), m)) : [statChip([T('no charges in last hour')], null)]));
    if (h.declineReasons.length) body.append(el('div', { class: 'caption mono', style: { marginTop: '8px' } }, T('declines last hour') + ': ' + h.declineReasons.slice(0, 3).map((c) => `${c.code} ×${c.n}`).join(', ') + (isNum(h.threeDsShare) ? ` · 3DS ${F.pct(h.threeDsShare)}` : '')));
    const overall = kindOf(h);
    pspBadge.textContent = h.attempts ? `${F.pct(h.authRate)} · ${pp(h.dropPp)}` : T('no attempts');
    pspBadge.className = 'badge mono ' + (overall || '');
    pspBadge.title = T('Auth rate last hour vs 24 h · {n} attempts', { n: F.int(h.attempts) });
    pspCard.setCaption(T('last hour vs 24 h · alert at drop ≥ {thr} pp', { thr: R.authDrop }) + (pspAlerts.length ? ` · ${T('signals')}: ${pspAlerts.length}` : ''));
  }

  function devices(nSign) {
    const body = devCard.body; U.clear(body);
    if (U.isThin(nSign)) { U.emptyState(body, T('Not enough data'), { sub: T('{n} users in slice · need ≥ {min}', { n: F.int(nSign), min: BB.MIN_USERS }) }); devCard.setCaption(BB.plural(nSign, 'user|users', { fmt: F.int })); return; }
    const b = BB.breakdown({ data, state: st, dim: 'device_class', offsets: [0], topN: 5 });
    const order = { mobile: 0, desktop: 1, tablet: 2 };
    const rows = b.rows.filter((r) => !r.isOther).sort((a, c) => (order[a.key] ?? 9) - (order[c.key] ?? 9));
    body.append(kicker(T('devices · CPT · trial-to-paid ({payer})', { payer: payerShort() }) + (b.spendAllocated ? ' · ' + ALLOC() : '')));
    body.append(chipRow(rows.map((r) => {
      const cpt = ratio(r.spend, r.trials), t2p = ratio(r.payers, r.trials), dc = BB.DEVICE_CLASSES.find((d) => d.id === r.key), label = dc ? BB.lbl(dc) : r.label;
      const clickable = r.key === 'mobile' || r.key === 'desktop';
      return statChip([label, `CPT ${mUsd2(cpt)}`, `${T('Trial-to-paid')} ${F.pct(t2p)}`, BB.plural(r.signups, 'user|users', { fmt: F.int })], null, {
        title: T('{label}: {signups} signups, {trials} trials, CPT {cpt}, {payers} payers (trial-to-paid {t2p})', { label, signups: F.int(r.signups), trials: F.int(r.trials), cpt: F.usd2(cpt), payers: F.int(r.payers), t2p: F.pct(t2p) }) + ` · ${BB.payerLabel(st)}` + (clickable ? ' · ' + T('click to filter by device') : ''),
        active: st.device === r.key, onClick: clickable ? () => BB.state.write({ device: st.device === r.key ? 'all' : r.key }) : null,
      });
    })));
    const ah = BB.attributionHealth({ data, state: st });
    const k = !isNum(ah.clickIdRate) ? null : ah.clickIdRate >= 0.8 ? 'good' : ah.clickIdRate >= 0.6 ? 'warn' : 'bad';
    body.append(kicker(T('attribution · click-id share (fbclid / gclid / ttclid) of signups')));
    const ids = ah.clickIds.filter((c) => c.type !== 'none').map((c) => `${c.type} ${F.pct(c.share)}`).join(' · ');
    body.append(chipRow([
      statChip(['Click-ID', F.pct(ah.clickIdRate), ids || T('no click-id')], k, { title: T('Users with click-id {rate} · EMQ proxy (click-id + email) {emq} · webview {wv} · bounce {bounce}', { rate: F.pct(ah.clickIdRate), emq: F.pct(ah.emq), wv: F.pct(ah.webviewShare), bounce: F.pct(ah.bounceRate) }) }),
      statChip(['EMQ', F.pct(ah.emq)], null, { title: T('Users with click-id and email — Event Match Quality proxy') }),
      statChip(['Webview', F.pct(ah.webviewShare)], isNum(ah.webviewShare) && ah.webviewShare > 0.4 ? 'warn' : null, { title: T('Signups from in-app browsers (Instagram / TikTok / FB) — convert worse (no card autofill)') }),
    ]));
    if (ah.byChannel.length > 1 && st.channel === 'all') body.append(el('div', { class: 'caption mono', style: { marginTop: '6px' } }, T('click-id by channel') + ': ' + ah.byChannel.map((c) => `${chLabel(c.channel)} ${F.pct(c.clickIdRate)}`).join(' · ')));
    devCard.setCaption(`${BB.plural(nSign, 'user|users', { fmt: F.int })} · ${st.device !== 'all' ? T('filter') + ': ' + st.device : T('all devices')}`);
  }

  /* ---------------- geo × hour heatmap ---------------- */
  function heat(range) {
    const f = BB.filter(data, st), mode = st.hm === 'cpt' ? 'cpt' : 'trials';
    const inR = (ts) => ts >= range.from && ts <= range.to;
    const tri = new Map(), sp = new Map(), byC = new Map();
    const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    f.trials.forEach((t) => { if (!inR(t.ts)) return; const u = f.index.userById.get(t.user_id); if (!u) return; const h = new Date(t.ts).getUTCHours(); add(tri, u.country + '|' + h, 1); add(byC, u.country, 1); });
    // spend by country × hour: direct when spend rows carry `country` (mock does), otherwise allocated by signups; a non-spendable slice (device, plan…) is allocated by the engine already
    let allocated = f.spendAllocated;
    const spendByC = new Map();
    if (BB.spendHas(f.raw.spend, 'country')) f.spend.forEach((r) => { add(sp, r.country + '|' + r.hour, r.spend_usd); add(spendByC, r.country, r.spend_usd); });
    else {
      allocated = true;
      const joined = f.raw.users.filter((u) => u.signup_ts >= range.from && u.signup_ts <= range.to && (!f.dimOk || f.dimOk(u)));
      BB.allocSpend({ spend: f.spend, users: joined, sliceOf: (u) => u.country, bucketOf: (r) => r.hour }).map.forEach((v, k) => { const i = k.indexOf('|'); if (i < 0) return; add(sp, k.slice(i + 1) + '|' + k.slice(0, i), v.spend_usd); add(spendByC, k.slice(i + 1), v.spend_usd); });
    }
    spendByC.forEach((v, c) => { if (!byC.has(c)) byC.set(c, 0); });
    const geos = Array.from(byC.keys()).sort((a, b) => (byC.get(b) - byC.get(a)) || ((spendByC.get(b) || 0) - (spendByC.get(a) || 0))).slice(0, 8);
    const hours = Array.from({ length: 24 }, (_, h) => ({ id: h, label: h % 3 === 0 ? d2(h) : '' }));
    U.heatmap(hmCard.body, {
      rows: geos.map((g) => ({ id: g, label: `${flag(g)} ${g}` })), cols: hours, corner: T('geo \\ h'),
      value: (r, c) => { const t = tri.get(r.id + '|' + c.id) || 0, s = sp.get(r.id + '|' + c.id) || 0; if (mode === 'trials') return t || (s > 0 ? 0 : null); return t > 0 ? s / t : null; },
      fmt: mode === 'trials' ? 'int' : (v) => '$' + Math.round(v), colorScale: 'seq', // one-hue sequential for both modes; status colours stay reserved for the signal dots
      tip: (r, c, v) => { const t = tri.get(r.id + '|' + c.id) || 0, s = sp.get(r.id + '|' + c.id) || 0; return { title: `${r.id} · ${d2(c.id)}:00 UTC`, kv: [[T('Trials'), F.int(t)], [T('Spend'), F.usd2(s)], ['CPT', F.usd2(ratio(s, t))]], note: allocated ? '≈ ' + T('spend allocated by signups') : null }; },
    });
    hmCard.setCaption((mode === 'trials' ? T('trials') : 'CPT' + (allocated ? ` (${ALLOC()})` : '')) + ` · ${T('top-{n} countries', { n: geos.length })} · ${st.preset === 'today' ? T('today') : T('sum by hour over period')}`);
    if (!geos.length) hmCard.body.append(el('div', { class: 'tbl-empty' }, T('No data')));
  }

  /* ---------------- live feed ---------------- */
  const FEED_TYPES = { all: null, pay: ['charge_ok', 'charge_fail'], trial: ['trial', 'qualified'], risk: ['charge_fail', 'refund', 'dispute', 'checkout_error'] };
  function feedRender() {
    const kind = FEED_TYPES[st.feed] ? st.feed : 'all';
    const evs = BB.events({ data, state: st, limit: 50, types: FEED_TYPES[kind] || undefined });
    const items = evs.map((e) => {
      const base = [e.channel && e.channel !== 'facebook' ? chLabel(e.channel) : null, e.campaign || 'organic', e.adset, e.creative].filter(Boolean).join(' · ');
      let title = e.label || e.label_ru, plan = e.plan || '', desc = base, amount = e.amount_usd, type = e.type;
      if (e.type === 'charge_ok') { if (e.charge_type === 'pack') { type = 'pack'; title = T('Add-on pack'); } else if (e.charge_type === 'intro') title = T('Intro charge'); else { type = e.n > 1 ? 'renewal' : 'charge_ok'; title = e.n === 1 ? T('First rebill') : T('Renewal #{n}', { n: e.n }); } plan += e.charge_type !== 'intro' && e.charge_type !== 'pack' ? ` · n=${e.n}` : ''; desc = `${base} · ${pmLabel(e.payment_method)} · ${e.card_funding || ''}`; }
      if (e.type === 'charge_fail') { amount = e.amount_usd ? '−' + F.usd2(e.amount_usd).slice(1) : '—'; desc = `${e.decline_code || 'declined'} · ${pspLabel(e.psp)} · ${T('attempt {a}/4', { a: e.attempt })} · ${e.card_funding || ''} · ${base}`; plan += e.n ? ` · n=${e.n}` : ''; }
      if (e.type === 'refund') { amount = -e.amount_usd; }
      if (e.type === 'dispute') { const fee = isNum(e.fee_usd) ? e.fee_usd : 0; amount = -(e.amount_usd + fee); desc = `${e.reason} · ${e.status} · ${T('+{fee} fee', { fee: F.usd2(fee) })} · ${base}`; }
      if (e.type === 'trial') { desc = `${base} · ${e.device_class || e.device || ''}`; }
      if (e.type === 'checkout_error') { type = 'charge_fail'; title = T('Checkout error'); amount = '—'; desc = `${e.decline_code || 'error'} · ${pspLabel(e.psp)} · ${pmLabel(e.payment_method)} · ${base}`; }
      return { type, title, flag: flag(e.country), plan, amount, desc, ts: e.ts, isNew: lastSeenTs && e.ts > lastSeenTs };
    });
    U.feed(feedCard.body.firstChild, items, { max: 50, now: data.now });
    feedCard.setCaption(`${BB.plural(evs.length, 'event|events')} · ${{ all: T('all types'), pay: T('payments'), trial: T('trials'), risk: T('declines, checkout errors, refunds, disputes') }[kind]}`);
  }

  /* ---------------- recent cohorts mini-table ---------------- */
  function cohortsMini() {
    const cst = Object.assign({}, st, { preset: '7d', from: undefined, to: undefined, step: 'day', groupBy: null, offsets: [0, 1, 3, 7] });
    const c = BB.cohorts({ data, state: cst, offsets: [0, 1, 3, 7] });
    const predCells = (r, o) => { // pROAS D{ltvH} + max CPT (BB.predict.maxCpt) per daily row and for the weighted total; < 10 trials → "Not enough data"
      if (r.trials < 10) { const tip = U.tipHtml({ title: `${r.label}`, note: T('Not enough data') + ' (< 10 ' + T('trials') + ')' }); o.proas = { v: null, tip }; o.maxcpt = { v: null, tip }; return; }
      const p = predOf(r, 'mini'), tip = predTip(r.label, p), cls = headKind(p);
      o.proas = p.pRoas == null ? { v: null, tip } : { v: p.pRoas, predicted: p.predicted, lo: p.pRoasLo, hi: p.pRoasHi, tip };
      o.maxcpt = p.maxCpt == null ? { v: null, tip } : { v: p.maxCpt, predicted: p.predicted, cls, tip };
    };
    const rowOf = (r) => { const o = { key: r.key, label: r.label, spend: r.spend, trials: r.trials, cpt: ratio(r.spend, r.trials), payers: r.payers }; [0, 1, 3, 7].forEach((N) => { const g = r.byOffset[N]; o['d' + N] = g && g.mature ? BB.metric(r, 'roas', N, st.money) : { v: null, mature: false }; }); predCells(r, o); return o; };
    const rows = c.rows.map(rowOf), total = rowOf(c.total); total.label = T('Total · weighted');
    [0, 1, 3, 7].forEach((N) => { const g = c.total.byOffset[N]; total['d' + N] = g && g.maturedRows ? BB.metric(c.total, 'roas', N, st.money) : { v: null, mature: false }; });
    const heatF = (v) => (v >= 1 ? { kind: 'good', alpha: 0.15 + Math.min(0.5, (v - 1) * 0.4) } : v >= 0.5 ? { kind: 'warn', alpha: 0.1 + (v - 0.5) * 0.4 } : { kind: 'bad', alpha: 0.08 + (0.5 - v) * 0.4 });
    const cols = [
      { key: 'label', label: T('Cohort'), sticky: true, text: true, width: 110 },
      { key: 'spend', label: T('Spend'), fmt: mUsd }, { key: 'trials', label: T('Trials'), fmt: 'int' }, { key: 'cpt', label: 'CPT', fmt: mUsd2, tip: mFml('cpt') }, { key: 'payers', label: T('Payers'), fmt: 'int', tip: `${T('payers to date')} · ${BB.payerLabel(st)}` },
      ...[0, 1, 3, 7].map((N) => ({ key: 'd' + N, label: `ROAS D${N}`, fmt: 'x', heatmap: heatF, width: 90, tip: T('revenue to D{n} / spend', { n: N }) })),
      { key: 'proas', label: `pROAS D${H()}`, fmt: 'x', heatmap: heatF, heatmapPredicted: false, width: 92, tip: T('Forecast ROAS at D{h}: (received + expected revenue) / spend · italic = forecast, 80 % interval in tooltip · model {m}', { h: H(), m: modelLabel() }) },
      { key: 'maxcpt', label: 'max CPT', fmt: mUsd2, width: 84, tip: T('pLTV D{h} per trial / target ROAS ({t}, hash targetRoas) · green: ≥ 15 % headroom over CPT, red: CPT ≥ 15 % above max', { h: H(), t: F.x(targetRoas()) }) },
    ];
    const cfg = { columns: cols, rows, total, maxHeight: 360, cellTip: (r, col, raw) => (col.key.startsWith('d') ? { title: `${r.label} · ${col.label}`, formula: T('ROAS = revenue(DN) / spend'), kv: [['ROAS', raw && raw.mature === false ? T('immature') : F.x(raw && typeof raw === 'object' ? raw.v : raw)], [T('Spend'), F.usd2(r.spend)], [T('Trials'), F.int(r.trials)]] } : null) };
    if (cohTbl) cohTbl.update(cfg); else cohTbl = U.table(cohCard.body.firstChild, cfg);
    cohCard.setCaption(T('last 7 days · ROAS by signup day') + (c.spendAllocated ? ' · ' + ALLOC() : '') + (st.channel !== 'all' ? ` · ${chLabel(st.channel)}` : ''));
    cohFoot.textContent = T('forecast: {m}, horizon D{h}, target ROAS {t}', { m: modelLabel(), h: H(), t: F.x(targetRoas()) });
    cohLink.href = BB.state.link('cohorts', { preset: '7d', from: null, to: null, step: 'day', hm: null, feed: null, rules: null, live: null, view: null });
  }

  /* ---------------- master render ---------------- */
  function renderAll() {
    const t0 = performance.now();
    predCache.clear(); // forecasts are cached only within one refresh (the "now" slice moves)
    syncCurrency();
    const ts = BB.timeseries({ data, state: st });
    const range = ts.range, nowTxt = T('Updated {time} UTC', { time: hhmm(data.now) }), nSign = ts.totals.signups;
    mdlBadges.update();
    kpis(ts); pace(ts); checkout(nSign); psp(); devices(nSign); buildTable(range); heat(range); feedRender(); cohortsMini();
    const label = st.preset === 'custom' ? `${st.from || '…'} — ${st.to || '…'}` : PRESET_LBL[st.preset] || st.preset;
    const rangeTxt = st.preset === 'today' ? `${label} · 00:00–${hhmm(range.to)} UTC` : `${label} · ${isoDate(range.from)} — ${isoDate(range.to)}`;
    const curTxt = st.currency === 'local' ? (cur.code !== 'USD' ? ` · ${T('currency')} ${cur.code}` : ' · ' + T('currency USD (multi-currency slice)')) : '';
    sh.setSubtitle(`${rangeTxt} · ${BB.plural(nSign, 'user|users', { fmt: F.int })}${U.isThin(nSign) ? ' · ' + T('Not enough data') : ''}${st.channel !== 'all' ? ' · ' + chLabel(st.channel) : ''}${curTxt} · ${SRC()}`);
    updatedEl.querySelector('.upd').textContent = nowTxt;
    updatedEl.querySelector('.live-dot').className = 'live-dot' + (st.live === '1' ? '' : ' off');
    sh.setSource(`${SRC()} · ${nowTxt}`, st.live === '1');
    liveToggle.set(st.live === '1');
    hmSeg.set(st.hm === 'cpt' ? 'cpt' : 'trials'); feedSeg.set(FEED_TYPES[st.feed] ? st.feed : 'all');
    lastSeenTs = data.now;
    if (location.search.includes('perf')) console.log('render ms', Math.round(performance.now() - t0));
  }
  function refresh(manual) {
    data = BB.load({ force: true });            // regenerates the mock with "now" = current time (later: re-fetch)
    renderAll();
    if (manual) U.toast(T('Recomputed · {time} UTC', { time: hhmm(data.now) }), 'good');
  }
  function syncLive() {
    const on = st.live === '1';
    if (on && !liveTimer) liveTimer = setInterval(() => refresh(false), 60000);
    if (!on && liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  }

  BB.state.onChange(() => {
    st = BB.state.read(PAGE); R = decodeRules(st.rules);
    syncCurrency();
    tb.update(tbCfg());
    syncLive();
    renderAll();
  });
  syncLive();
  renderAll();
  U.onTheme(() => renderAll()); // palette is theme-stepped → rebuild charts and dots for the new surface
});
