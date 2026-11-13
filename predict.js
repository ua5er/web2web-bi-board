/* predict.js — Board 3 «Predictions». Uses ./core.js (BB) + ./ui.js (BB.ui). */
BB.ui.boot(function () { // renders once BB.ready() resolves (data pointer: ?data= · window.BB_DATA_URL · data-src · ./data/demo.json)
  'use strict';
  const U = BB.ui, el = U.el, F = BB.fmt, DAY = BB.util.DAY, T = BB.t;
  const PRED_OFFSETS = [7, 30, 60, 90, 180, 360];
  const KPI_OFFSETS = [30, 90, 180, 360];
  const SIGNALS = [{ id: '3', label: 'D3' }, { id: '7', label: 'D7' }, { id: '14', label: 'D14' }, { id: 'all', label: T('all') }];
  const CALC_DIMS = ['channel', 'device_class', 'geo_tier', 'country', 'market', 'campaign', 'creative', 'paywall', 'plan', 'psp', 'payment_method', 'os', 'browser'];
  const MIX_DIMS = ['paywall', 'onboarding', 'opt_event', 'campaign', 'channel', 'geo_tier', 'country'];
  const MAX_SEL = 6;
  const REF_GRAY = '#8a8f98'; // readable reference-line colour in both themes (kit re-themes axes / grid itself)

  /* ───────── data & state ───────── */
  const data = BB.load();
  const now = data.now;
  const dimLabel = (id) => (BB.DIM_BY_ID[id] ? BB.lbl(BB.DIM_BY_ID[id]) : id);
  /* Page defaults when opened without a hash: 90 days by week. Steps this board has no columns for (hour, carried over from Real-time) fall back to day. */
  if (!location.hash.replace('#', '')) BB.state.write({ preset: '90d', step: 'week' });
  const readState = () => { const s = BB.state.read('predict'); if (!['day', 'week', 'month'].includes(s.step)) s.step = 'day'; if (!BB.predict.MODEL_BY_ID[s.model]) s.model = 'sbg'; return s; };
  const setState = (patch) => BB.state.write(patch);
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  function scenarioOf(st) {
    const sc = { firstRebillDelta: num(st.scRebill, 0) / 100, churnDelta: num(st.scChurn, 0) / 100, refundRate: st.scRefund != null && st.scRefund !== '' ? num(st.scRefund, 0) / 100 : null, disputeRate: st.scDispute != null && st.scDispute !== '' ? num(st.scDispute, 0) / 100 : null };
    sc.active = !!(sc.firstRebillDelta || sc.churnDelta || sc.refundRate !== null || sc.disputeRate !== null);
    return sc;
  }
  const sigOf = (st) => (st.signalDay === 'all' || st.signalDay == null ? 'all' : +st.signalDay);
  const payerShort = (st) => (st.payer === 'sub' ? T('Payers: subscription') : T('Payers: any payment'));
  const payerGroup = (st) => (st.payer === 'sub' ? T('subscription') : T('any payment'));
  const SRC = data.meta.source === 'demo' ? T('Demo data') : BB.lbl(data.meta);
  const CH_SHORT = { facebook: 'FB', google: 'GO', tiktok: 'TT', web2web: 'W2W', organic: 'ORG' };
  const roasHeat = (v) => (v == null ? null : v >= 1 ? { kind: 'good', alpha: 0.12 + Math.min(0.5, (v - 1) * 0.4) } : v >= 0.5 ? { kind: 'warn', alpha: 0.08 + (v - 0.5) * 0.4 } : { kind: 'bad', alpha: 0.1 + (0.5 - v) * 0.6 });
  /* badge colour of engine verdicts — derived from the same numbers the engine uses (verdict text is localised) */
  const paybackKind = (r) => (r.trials < 10 ? null : r.payback != null ? 'good' : 'bad');
  const headroomKind = (h) => (h == null ? null : h > 0.15 ? 'good' : h < -0.15 ? 'bad' : 'info');
  const sigTxt = (st) => (sigOf(st) === 'all' ? T('signals: all data') : T('signals to D{n}', { n: sigOf(st) }));
  const medianAge = (users, basis) => { const a = users.map((u) => BB.anchorOf(u, basis)).filter((x) => x != null).sort((x, y) => x - y); if (!a.length) return null; return Math.floor((now - a[Math.floor(a.length / 2)]) / DAY); };
  const dayLabel = (N) => 'D' + N;
  const chLabel = (id) => (BB.CHANNEL_BY_ID[id] ? BB.lbl(BB.CHANNEL_BY_ID[id]) : id);

  /* currency (USD / local): money formatters follow the toolbar switch */
  let cur = { code: 'USD', symbol: '$', rate: 1 };
  const money = (v) => F.money(v, cur);
  const moneyFmt = () => (cur.code === 'USD' ? 'usd' : money);
  const money2Fmt = () => (cur.code === 'USD' ? 'usd2' : money);

  /* filter dims with values + counts (users-based) */
  const filterDims = BB.DIMENSIONS.map((d) => {
    const m = new Map();
    data.users.forEach((u) => { const v = BB.dimValue(u, d.id); m.set(v, (m.get(v) || 0) + 1); });
    return { id: d.id, label: BB.lbl(d), values: [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ v, label: v, count: c })) };
  });

  /* ───────── segment helpers (plan × geo_tier × channel, fallback chain) ───────── */
  const LEVEL_LBL = { 3: T('plan × geo × channel'), 2: T('plan × geo'), 1: T('plan'), 0: T('all') };
  const levelOf = (key) => (key === 'all' ? 0 : key.split('|').length);
  const fmtSegKey = (key) => (key === 'all' ? T('all') : key.split('|').map((p, i) => (i === 2 ? chLabel(p) : p)).join(' · '));
  const fmtSegShort = (key) => (key === 'all' ? T('all') : key.split('|').map((p, i) => (i === 2 ? CH_SHORT[p] || chLabel(p) : p)).join(' · '));
  /* "P(1st rebill)" text: recency-weighted rate and the all-time rate (same number when p1hl = 0) */
  const p1Txt = (s) => (s.p1 == null ? '—' : s.p1_hl > 0 && s.p1_all != null ? T('recent {r} · all-time {a}', { r: F.pct(s.p1), a: F.pct(s.p1_all) }) : F.pct(s.p1));
  const priorTxt = (ps) => (ps > 0 ? F.pct(ps) : '—');
  /* Dominant model segment of a row: most frequent full key among users with a trial; resolved to the fitted segment and its fallback level. */
  function segInfo(row) {
    const fit = BB.predict.fit(data), users = row._users || [], cnt = new Map();
    let n = 0;
    users.forEach((u) => { const t = u._trial; if (!t) return; const k = `${t.plan}|${u.geo_tier}|${u.channel || 'organic'}`; cnt.set(k, (cnt.get(k) || 0) + 1); n++; });
    if (!n) return null;
    let best = null; cnt.forEach((c, k) => { if (!best || c > best[1]) best = [k, c]; });
    const full = best[0], parts = full.split('|');
    const f = fit.segments[full] || fit.segments[parts[0] + '|' + parts[1]] || fit.segments[parts[0]] || fit.segments.all;
    if (!f) return null;
    const used = f.fallback || f.key; // where the rates come from
    const priorShare = f.params && f.params.priorShare ? f.params.priorShare : 0;
    return { full, key: f.key, used, level: levelOf(used), levelLbl: LEVEL_LBL[levelOf(used)], own: !f.fallback && f.key === full, share: best[1] / n, mix: cnt.size, p1: f.p1, p1_all: f.p1_all, p1_hl: f.p1_hl, n: f.n, curveFrom: f.curveFrom, priorShare, warn: priorShare > 0.5 || f.curveFrom === 'default', fit: f };
  }
  /* Payers observed under the same definition and cut-off the engine uses for payers_expected (so "pending" = expected − observed, same terms). */
  function observedPayersAt(users, basis, N, payer, sig) {
    const ix = data.index; let n = 0;
    for (const u of users) {
      const a = BB.anchorOf(u, basis); if (a == null) continue;
      const cut = sig === 'all' ? now : Math.min(now, a + sig * DAY), limit = Math.min(a + (N + 1) * DAY, cut + 1);
      const cs = ix.chargesByUser.get(u.user_id) || [];
      for (let k = 0; k < cs.length && cs[k].ts < limit; k++) if (BB.isPayerCharge(cs[k], payer)) { n++; break; }
    }
    return n;
  }

  /* ───────── shell ───────── */
  const sh = U.shell('predict', { title: T('Predictions'), subtitle: '…', sourceBadge: BB.lbl(data.meta) });
  U.applyTitle(T('Predictions'));
  const allocBadge = U.badge(T('≈ Allocated spend'), null, { title: T('Spend for dimensions missing in ad accounts (paywall, plan, device, PSP…) is split pro rata to signups in the same ad and day') });
  const scenBadge = U.badge(T('what-if scenario'), 'warn', { title: T('What-if shifts applied to all forecasts') });
  const sigBadge = U.badge('', 'accent', { title: T('Forecast uses only events up to this user-life day') });
  const payerBadge = U.badge('', null, { title: '' });
  sh.headActions.append(sigBadge, payerBadge, allocBadge, scenBadge);

  /* ───────── toolbar ───────── */
  let tbl = null;
  const tbCfg = (st) => ({
    range: (() => { const r = BB.state.resolveRange(st, now); return { preset: st.preset, from: st.from || BB.util.isoDate(r.from), to: st.to || BB.util.isoDate(r.to), max: BB.util.isoDate(now) }; })(),
    step: { options: ['day', 'week', 'month'], value: st.step },
    channel: { value: st.channel }, device: { value: st.device },
    basis: { value: st.basis }, money: { value: st.money }, payer: { value: st.payer },
    currency: { value: st.currency, localLabel: BB.localCurrency(data, Object.assign({}, st, { currency: 'local' })).code === 'USD' ? 'Local' : BB.localCurrency(data, Object.assign({}, st, { currency: 'local' })).code },
    views: { page: 'predict', value: st.view },
    groupBy: { dims: BB.DIMENSIONS.map((d) => ({ id: d.id, label: BB.lbl(d) })), value: st.groupBy },
    filters: { dims: filterDims, value: st.filters },
    extra: [{ id: 'signalDay', label: T('Signals up to:'), type: 'segmented', options: SIGNALS, value: String(st.signalDay) }],
    csv: () => { if (tbl) { U.downloadCsv('predictions.csv', tbl.toCsv()); U.toast(T('CSV exported'), 'good'); } },
  });
  const tb = U.toolbar(tbCfg(readState()), (patch) => {
    if (patch.range) { const r = patch.range; setState(r.preset === 'custom' ? { preset: 'custom', from: r.from, to: r.to } : { preset: r.preset, from: null, to: null }); return; }
    if ('groupBy' in patch) { setState({ groupBy: patch.groupBy || null }); return; }
    if ('view' in patch && patch.view == null) { setState({ view: null }); return; }
    setState(patch);
  });
  sh.toolbarSlot.append(tb.el);

  /* ───────── layout skeleton ───────── */
  const kpiHost = el('div'); sh.main.append(kpiHost);

  const tblHost = el('div'), tblEmpty = el('div', { class: 'hidden' });
  const tblCard = U.card(sh.main, { title: T('Forecast table'), caption: '', actions: [el('span', { class: 'caption' }, T('click a row to chart it'))], body: { flush: true, node: el('div', {}, tblHost, tblEmpty) },
    foot: [el('span', {}, T('Regular — actual (mature cohort)')), el('span', { class: 'predicted' }, el('span', { class: 'pv' }, T('italic dashed')), T(' — forecast, 80% interval in tooltip')), el('span', {}, T('Segment — plan · geo · channel key; ↳ — level the parameters come from')), el('span', {}, T('Total — weighted over the period'))] });

  const chartCard = U.card(sh.main, { title: T('ROAS curves: actual → forecast'), caption: '', actions: [el('button', { class: 'btn sm ghost', type: 'button', onClick: () => { selected.clear(); render(); } }, T('Clear selection'))], body: el('canvas') });
  chartCard.body.classList.add('chart', 'pd-chart-tall');
  const chartView = U.viewToggle(chartCard, () => curveChart, { fmt: 'x', xFmt: (x) => 'D' + x, maxHeight: 360 });
  chartCard.setFoot(el('div', { class: 'pd-legend' }, el('span', {}, el('i'), T('actual')), el('span', {}, el('i', { class: 'dash' }), T('forecast')), el('span', {}, el('i', { class: 'band' }), T('80% band')), el('span', {}, el('i', { class: 'dash', style: { borderColor: 'var(--fg-4)' } }), T('1.0x / target ROAS'))));

  /* plan-mix card: share of trials per plan for every paywall / test variant / campaign, pLTV per trial per plan, expected pLTV per trial of the mix, "apply mix of X to Y" lever (hash mixDim, mix) */
  const mixDimSel = U.select(MIX_DIMS.map((d) => ({ id: d, label: dimLabel(d) })), 'paywall', (v) => setState({ mixDim: v === 'paywall' ? null : v, mix: null }), { label: T('By') });
  const mixCard = U.card(sh.main, { title: T('Plan mix'), caption: '', actions: [mixDimSel.el], body: el('div'),
    foot: [el('span', {}, T('share = trials on the plan / trials of the row · expected pLTV / trial = Σ share × pLTV per trial of that plan (same users, same horizon)')), el('span', { class: 'predicted' }, el('span', { class: 'pv' }, T('italic')), ' — ' + T('forecast, 80% interval in tooltip'))] });

  const row2 = el('div', { class: 'grid c2' }); sh.main.append(row2);
  const calcCard = U.card(row2, { title: T('Max CPT'), caption: T('max price per trial'), body: el('div') });
  const scenCard = U.card(row2, { title: T('What-if'), caption: T('shifts apply to all forecasts'), body: el('div') });

  const allocCard = U.card(sh.main, { title: T('Budget allocator'), caption: T('daily budget by marginal pROAS'), body: el('div') });

  const row4 = el('div', { class: 'grid c2' }); sh.main.append(row4);
  const mrrCard = U.card(row4, { title: T('MRR forecast'), caption: T('30 / 90 days'), body: el('div') });
  const segCard = U.card(row4, { title: T('Survival curves'), caption: T('plan × geo tier × channel · sBG'), body: el('div') });

  const row5 = el('div', { class: 'grid c2' }); sh.main.append(row5);
  const btCard = U.card(row5, { title: T('Model accuracy'), caption: T('backtest: D3 / D7 forecast vs actual'), body: el('div') });
  const howCard = U.card(row5, { title: T("How it's computed"), caption: '', collapsible: true, collapsed: true, body: el('div', { class: 'pd-howto' }) });

  /* ───────── mutable page objects ───────── */
  const selected = new Set();
  /* colour follows the entity: a selected row keeps its palette slot while it stays selected (lowest free slot for a new one) */
  const selSlot = new Map();
  function syncSlots() { [...selSlot.keys()].forEach((k) => { if (!selected.has(k)) selSlot.delete(k); }); [...selected].forEach((k) => { if (!selSlot.has(k)) { const used = new Set(selSlot.values()); let i = 0; while (used.has(i)) i++; selSlot.set(k, i); } }); }
  const selColorOf = (k) => U.palette(selSlot.get(k) ?? 0);
  let curveChart = null, segChart = null, allocCurveChart = null, allocBarChart = null, mrrChart = null;
  let segPlan = null, segMode = 'geo'; // segment-curves card: plan shown, split by geo tier or channel
  let btTarget = 30;
  let lastRows = [], lastTotal = null, lastPreds = [], lastSt = null, lastSc = null, lastRange = null;

  /* ───────── helpers over BB.predict ───────── */
  function predictOpts(st, sc, extra) { return Object.assign({ money: st.money, signalDay: sigOf(st), scenario: sc.active ? sc : null, data, targetRoas: num(st.targetRoas, 1), payer: st.payer, model: st.model }, extra || {}); }
  function cell(p) { // table cell from a prediction
    if (!p || p.roas == null) return null;
    if (p.basis === 'actual') return p.roas;
    return { v: p.roas, predicted: true, lo: p.roasLo, hi: p.roasHi };
  }
  function intervalTxt(p) { return `[${F.x(p.roasLo)} – ${F.x(p.roasHi)}]`; }
  function destroy(c) { if (c) { try { c.destroy(); } catch (e) { /* already gone */ } } return null; }

  /* ───────── main render ───────── */
  function render() {
    const st = readState(); lastSt = st;
    const sc = scenarioOf(st); lastSc = sc;
    const sig = sigOf(st);
    const target = num(st.targetRoas, 1);
    const t0 = performance.now();
    cur = BB.localCurrency(data, st);
    tb.update(tbCfg(st));
    sigBadge.textContent = sigTxt(st);
    payerBadge.textContent = payerShort(st); payerBadge.title = BB.payerLabel(st);
    scenBadge.classList.toggle('hidden', !sc.active);

    /* rows */
    const co = BB.cohorts({ data, state: st, offsets: BB.OFFSETS });
    const range = co.range; lastRange = range;
    let rows, spendAllocated = co.spendAllocated, modeCaption;
    if (st.groupBy) {
      const bd = BB.breakdown({ data, state: st, dim: st.groupBy, offsets: BB.OFFSETS, topN: 15 });
      rows = bd.rows; spendAllocated = bd.spendAllocated;
      rows.forEach((r) => { r.basis = co.basis; r._age = medianAge(r._users || [], co.basis); });
      modeCaption = T('by {dim} · top 15 by spend', { dim: dimLabel(st.groupBy) });
    } else {
      rows = co.rows;
      rows.forEach((r) => { r._age = r.bucketStart ? Math.floor((now - Math.min(r.bucketEnd - DAY, BB.util.startOfDay(now))) / DAY) : null; });
      modeCaption = T('cohorts {step} · {basis}', { step: ({ day: T('by day'), week: T('by week'), month: T('by month') })[st.step], basis: co.basis === 'trial' ? T('by trial') : T('by signup') });
    }
    const total = co.total; total.basis = co.basis; total.money = st.money; total.payer = st.payer;
    lastRows = rows; lastTotal = total;
    allocBadge.classList.toggle('hidden', !spendAllocated);
    const thin = U.isThin(total.signups);

    const preds = BB.predict.rows(rows, predictOpts(st, sc, { offsets: PRED_OFFSETS }));
    lastPreds = preds;
    const totalPred = BB.predict.rows([total], predictOpts(st, sc, { offsets: BB.OFFSETS }))[0];

    /* subtitle */
    const users = total.signups;
    const sliceTxt = [st.channel !== 'all' ? chLabel(st.channel) : null, st.device !== 'all' ? st.device : null].filter(Boolean).join(' · ');
    sh.setSubtitle(`${fmtRange(range)} · ${BB.plural(users, 'user|users', { fmt: F.int })}${sliceTxt ? ' · ' + sliceTxt : ''} · ${SRC}`);

    /* chart selection must be settled before the table paints swatches / .sel rows */
    [...selected].forEach((k) => { if (!rows.some((r) => r.key === k)) selected.delete(k); });
    if (!selected.size) rows.filter((r) => r.key !== '__other' && r.trials >= 10).slice(0, 4).forEach((r) => selected.add(r.key));
    syncSlots();

    if (thin) {
      const sub = T('Slice has {n} users (< {min}): widen the period or drop filters', { n: F.int(users), min: BB.MIN_USERS });
      U.emptyState(kpiHost, T('Not enough data'), { sub });
      tblHost.classList.add('hidden'); tblEmpty.classList.remove('hidden'); U.emptyState(tblEmpty, T('Not enough data'), { sub });
      curveChart = destroy(curveChart); U.emptyState(chartCard.body, T('Not enough data')); chartCard.setCaption(T('slice too thin'));
    } else {
      tblHost.classList.remove('hidden'); tblEmpty.classList.add('hidden');
      renderKpis(st, total, totalPred, preds, target, sig, sc);
      renderTable(st, rows, preds, total, totalPred, modeCaption, target);
      renderChart(st, sc, rows, target);
    }
    renderModels(st, sc, rows, total, totalPred, preds, target);
    renderMix(st, sc, total, thin);
    renderCalc(st, sc);
    renderScenario(st, sc, total);
    renderAllocator(st);
    renderMrr(st, sc);
    renderSegments();
    renderBacktest(st);
    renderHowto(st);
    const ms = Math.round(performance.now() - t0);
    tblCard.setCaption(`${modeCaption} · ${BB.plural(rows.length, 'row|rows')} · ${ms} ms`);
  }

  function fmtRange(r) {
    const d = (ms) => BB.bucketLabel(BB.util.isoDate(ms), 'day'); // same month abbreviations as the cohort table
    return `${d(r.from)} – ${d(r.to)} ${new Date(r.to).getUTCFullYear()}`;
  }

  /* ───────── A. KPI strip ───────── */
  function renderKpis(st, total, tp, preds, target, sig, sc) {
    const sparkAt = (N) => preds.slice().reverse().map((p) => (p.byOffset[N] && p.byOffset[N].roas != null ? p.byOffset[N].roas : 0));
    const cards = KPI_OFFSETS.map((N) => {
      const p = tp.byOffset[N];
      return { label: `pROAS ${dayLabel(N)}`, value: p.roas, fmt: 'x', interval: p.basis === 'actual' ? T('actual') : intervalTxt(p), spark: sparkAt(N), hint: T('Forecast ROAS to D{n} over all users of the period: (received + expected revenue) / spend. Brackets — 80% interval.', { n: N }), title: p.basis === 'actual' ? T('All cohorts mature — actual') : null };
    });
    const payback = tp.payback_day;
    cards.push({ label: T('Payback (forecast)'), value: payback != null ? F.days(payback) : T('none to D360'), hint: T('First offset where pROAS ≥ {t} (target ROAS from Max CPT)', { t: F.x(target) }), sub: tp.verdict || tp.verdict_ru });
    const p180 = tp.byOffset[180];
    const ltvT = total.trials ? p180.mid / total.trials : null;
    /* global "LTV D{ltvH} / trial" tile (same definition on every board; here the what-if scenario applies, signals do not); D180 kept as the secondary line */
    const sliceKey = [lastRange ? BB.util.isoDate(lastRange.from) + '|' + BB.util.isoDate(lastRange.to) : '', st.basis, st.channel, st.device, JSON.stringify(BB.effFilters(st))].join('|');
    cards.push(U.ltvKpi({ data, total, st, sliceKey, cur: cur.code !== 'USD' ? cur : null, scenario: sc && sc.active ? sc : null, extra: `D180 ${money(ltvT)} · CPT ${money(BB.metric(total, 'cpt'))}` }));
    /* pending rebills: expected payers to D30 − payers already observed, both under the active payer definition and the same cut-off */
    const p30 = tp.byOffset[30];
    const obs30 = observedPayersAt(total._users || [], total.basis, 30, st.payer, sig);
    const pendingN = Math.max(0, p30.payers_expected - obs30), pendingUsd = Math.max(0, p30.mid - p30.observed);
    cards.push({ label: T('Pending rebills'), group: payerGroup(st), value: Math.round(pendingN), fmt: 'int', hint: T('Expected new payers to D30 beyond those observed ({obs}), both under «{def}»: queued trials × segment P(1st rebill) + retries of failed charges. Users with open future: {pending}. Amount — expected revenue beyond received to D30.', { obs: F.int(obs30), def: BB.payerLabel(st), pending: F.int(p30.pendingUsers || 0) }), sub: T('≈ {sum} to D30', { sum: money(pendingUsd) }) });
    U.kpiRow(kpiHost, cards, { cols: 6 });
  }

  /* ───────── M. «Prediction models» panel: registry table, data checks, agreement, hold-out ───────── */
  const MODEL_LABEL = (id) => (BB.predict.MODEL_BY_ID[id] ? BB.lbl(BB.predict.MODEL_BY_ID[id]) : id);
  const STATUS_LBL = { ok: ['ok', 'good'], warn: ['warn', 'warn'], fail: ['fail', 'bad'], no_file: [T('no file'), null], stale: ['stale', 'warn'], error: ['error', 'bad'] };
  const LEVEL_SEV = { fail: 'bad', warn: 'warn', ok: 'good' };
  const SEV_CLS = { blocker: 'bad', degraded: 'warn' };
  const holdCache = new Map(); // (model | target | money | payer | filters) → BB.predict.holdout result
  const holdKey = (id, st) => [id, btTarget, st.money, st.payer, st.basis, st.channel, st.device, JSON.stringify(BB.effFilters(st))].join('|');
  function holdTip(st) { const h = holdCache.get(holdKey('sbg', st)); const d = (ts) => (ts ? BB.bucketLabel(BB.util.isoDate(ts), 'day') : '—'); return h && !h.empty ? T('Out-of-sample: parameters (p₁, rates, curve) fitted as of {train} — only users anchored before it and events up to it; test — cohorts anchored {from} – {to} ({days} d, older than 60 days), actual by today\'s events, forecast from D3 / D7 signals. Coverage — share of cohorts whose actual fell in the 80% interval (target ≈ 80%, < 60% — intervals too narrow).', { train: d(h.trainUntil), from: d(h.testFrom), to: d(h.cutoff), days: h.testDays }) : T('Hold-out unavailable: less than 30 days of history before the test window'); }
  function holdoutFor(id, st) { const k = holdKey(id, st); if (!holdCache.has(k)) holdCache.set(k, BB.predict.holdout(data, id, { state: st, targetDay: btTarget })); return holdCache.get(k); }
  function fmtParams(f, id) {
    const p = f && f.params; if (!p) return '—';
    const n = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (+v).toFixed(d));
    if (id === 'sbg') return `α ${n(p.alpha)} · β ${n(p.beta)}`;
    if (id === 'power' || id === 'power_b') return `a ${n(p.a)} · b ${n(p.b)}${p.bFrom ? ` (${T('b from {src}', { src: p.bFrom === 'own' ? T('own data') : fmtSegKey(p.bFrom) })})` : ''}`;
    if (id === 'geom') return `c ${n(p.c, 3)}`;
    if (id === 'log') return `a ${n(p.a)} · b ${n(p.b)}`;
    if (id === 'weibull') return `λ ${n(p.lambda)} · κ ${n(p.kappa)}`;
    if (id === 'km') return T('tail {v} at k={k}', { v: n(p.tail, 3), k: p.lastK });
    if (id === 'cox') return T('file, k ≤ {k}', { k: p.lastK });
    if (id === 'vlad_v1' || id === 'vlad_v1h' || id === 'vlad_v2') return `α ${n(p.alpha)} · β ${n(p.beta)} · m ${n(p.m, 0)} · ${T('prior {p} {pct}', { p: p.prior === 'none' ? '—' : (p.prior || '').indexOf('|') >= 0 ? '↑' : p.prior, pct: F.pct(p.priorShare || 0) })}`;
    return Object.keys(p).map((k) => `${k} ${n(p[k])}`).join(' · ');
  }
  const pcell = (p) => (!p || p.roas == null ? null : p.basis === 'actual' ? p.roas : { v: p.roas, predicted: true, lo: p.roasLo, hi: p.roasHi });
  const segKeysOf = (rows) => { const out = new Set(); rows.forEach((r) => { const s = r._seg || segInfo(r); if (s) out.add(s.full); }); return [...out]; };

  const mdlBadges = U.modelBadges({ link: false }); // "model: …" + prior / pm / p1hl levers (hash), shown when not default
  sh.headActions.prepend(mdlBadges.el);
  const mdAgreeBadge = U.badge('', null, {}), mdInputBadge = U.badge('', null, {}), mdDataBadge = U.badge('', null, {});
  const mdBody = el('div', { class: 'pd-models' });
  const mdCard = U.card(null, { title: T('Prediction models'), caption: T('sBG vs alternatives · data and fit checks'), collapsible: true, collapsed: true, actions: [mdInputBadge, mdDataBadge, mdAgreeBadge], body: mdBody,
    foot: [el('span', { class: 'pd-foot-hold' }, T('Hold-out (out-of-sample): parameters as of a date before the test window; test — cohorts older than 60 days after it; window in column tooltip.')), el('span', {}, T('In-sample: as in «Model accuracy».')), el('span', { class: 'predicted' }, el('span', { class: 'pv' }, T('italic')), T(' — forecast, 80% interval in tooltip'))] });
  const mdBanner = el('div', { class: 'pd-banner hidden', role: 'status' });
  sh.main.insertBefore(mdCard.el, tblCard.el); sh.main.insertBefore(mdBanner, tblCard.el);
  const mdUI = { checksHost: el('div', { class: 'pd-md-sec' }), tblHost: el('div', { class: 'tbl-host' }), dataHost: el('div', { class: 'pd-md-sec' }), agreeHost: el('div', { class: 'pd-md-sec' }), showAll: false, tbl: null, chart: null, cmpModel: null, cmpTbl: null, pending: false };
  mdBody.append(
    el('div', { class: 'pd-md-h' }, T('Data checks'), el('span', { class: 'caption' }, ' · ' + T('same for all models'))), mdUI.checksHost,
    el('div', { class: 'pd-md-h' }, T('Model registry'), el('span', { class: 'caption' }, ' · ' + T('radio — make active, click row — details'))), mdUI.tblHost,
    el('div', { class: 'pd-md-h' }, T('Data'), el('span', { class: 'caption' }, ' · ' + T('what is missing and what it affects'))), mdUI.dataHost,
    el('div', { class: 'pd-md-h' }, T('Model agreement'), el('span', { class: 'caption' }, ' · ' + T('pROAS for total row and visible cohorts'))), mdUI.agreeHost);
  const mdCsvBtn = el('button', { class: 'btn sm ghost', type: 'button', onClick: (e) => { e.stopPropagation(); if (mdUI.tbl) { U.downloadCsv('models.csv', mdUI.tbl.toCsv()); U.toast(T('CSV exported'), 'good'); } } }, 'CSV');
  mdCard.actions.append(mdCsvBtn);
  const mdOpen = () => mdCard.el.dataset.collapsed !== 'true';
  mdCard.head.addEventListener('click', () => { if (mdOpen() && mdUI.pending && lastSt) renderModelsBody(lastSt, lastSc, lastRows, lastTotal, lastPreds); });

  function renderModels(st, sc, rows, total, totalPred, preds, target) {
    const active = st.model, v = BB.predict.validate(data, active, { segKeys: segKeysOf(rows.concat([total])) });
    const eff = v.effective;
    mdCard.setTitle(T('Prediction models · active: {m}', { m: MODEL_LABEL(active) }) + (eff !== active ? ` (${T('runs {m}', { m: MODEL_LABEL(eff) })})` : ''));
    mdlBadges.update();
    /* header badges: input checks · data · agreement */
    const nWarn = v.input.filter((c) => c.level === 'warn').length, nFail = v.input.filter((c) => c.level === 'fail').length;
    mdInputBadge.textContent = nFail ? T('✗ data error') : nWarn ? '⚠ ' + BB.plural(nWarn, 'warning|warnings') : T('✓ data');
    mdInputBadge.className = 'badge' + (nFail ? ' bad' : nWarn ? ' warn' : ' good'); mdInputBadge.title = T('Data checks') + ': ' + v.input.filter((c) => c.level !== 'ok').map((c) => c.label || c.label_ru).join('; ');
    const blockers = v.missing.filter((m) => m.severity === 'blocker');
    mdDataBadge.textContent = blockers.length ? '✗ ' + BB.plural(blockers.length, 'blocker|blockers') : v.missing.length ? BB.plural(v.missing.length, 'limitation|limitations') : T('data connected');
    mdDataBadge.className = 'badge' + (blockers.length ? ' bad' : v.missing.length ? ' warn' : ' good'); mdDataBadge.title = v.missing.map((m) => m.text || m.text_ru).join('\n') || T('All data for this model connected');
    const ag = BB.predict.agreement(total, predictOpts(st, sc)); mdUI.ag = ag;
    mdAgreeBadge.textContent = ag.spread == null ? T('no comparison') : ag.agree ? T('models agree') : T('models differ by {pct}%', { pct: Math.round(ag.spread * 100) });
    mdAgreeBadge.className = 'badge' + (ag.spread == null ? '' : ag.agree ? ' good' : ' warn'); mdAgreeBadge.title = ag.verdict || ag.verdict_ru;
    /* banner above the prediction table when the active model is degraded */
    const degraded = v.degraded || eff !== active;
    mdBanner.classList.toggle('hidden', !degraded);
    if (degraded) {
      const lines = blockers.length ? blockers.map((m) => m.text || m.text_ru) : [T('Model {m}: status «{s}» — {why}.', { m: MODEL_LABEL(active), s: STATUS_LBL[v.status] ? STATUS_LBL[v.status][0] : v.status, why: v.fit.filter((c) => c.level === 'fail').map((c) => (c.label || c.label_ru).toLowerCase()).join(', ') || T('see «Prediction models»') })];
      U.clear(mdBanner).append(el('b', {}, eff !== active ? T('Forecasts use sBG.') + ' ' : T('Active model degraded.') + ' '), lines.join(' '));
    }
    mdUI.v = v;
    if (mdOpen()) renderModelsBody(st, sc, rows, total, preds); else mdUI.pending = true;
  }

  function renderModelsBody(st, sc, rows, total, preds) {
    mdUI.pending = false;
    const t0 = performance.now();
    const v = mdUI.v || BB.predict.validate(data, st.model, {});
    /* 1. input checks strip */
    const shown = v.input.filter((c) => mdUI.showAll || c.level !== 'ok');
    const items = shown.map((c) => ({ severity: LEVEL_SEV[c.level], title: el('span', { title: T('Fields: {list}', { list: c.fields.join(', ') }) }, c.label || c.label_ru), desc: c.detail, chip: c.level === 'ok' ? null : c.level === 'fail' ? T('error') : T('warn'), value: c.n || '' }));
    U.alertList(mdUI.checksHost, items, { emptyText: T('All data checks passed') });
    const nOk = v.input.filter((c) => c.level === 'ok').length;
    mdUI.checksHost.append(el('button', { class: 'btn sm ghost pd-md-more', type: 'button', 'aria-expanded': String(mdUI.showAll), onClick: () => { mdUI.showAll = !mdUI.showAll; renderModelsBody(st, sc, rows, total, preds); } }, mdUI.showAll ? T('Hide {n} passed', { n: nOk }) : T('Show all {n} checks', { n: v.input.length })));
    /* 2. models table */
    const base = mdUI.ag && mdUI.ag.base;
    const mrows = BB.predict.MODELS.map((m) => {
      const vm = m.id === st.model ? v : BB.predict.validate(data, m.id, {});
      const usable = m.kind === 'js' || BB.predict.offline.usable(m.id);
      const fit = BB.predict.fit(data, m.id), fa = fit.segments.all, agr = mdUI.ag ? mdUI.ag.rows.find((r) => r.id === m.id) : null;
      const ho = usable && !m.scope ? holdoutFor(m.id, st) : null;
      const off = m.kind === 'offline' ? BB.predict.offline.status(m.id) : null;
      return { key: m.id, _m: m, _v: vm, _fit: fit, _ho: ho, _off: off, label: BB.lbl(m), family: m.family, skill: m.skill, kind: m.kind === 'js' ? 'in-browser' : 'offline', usable,
        fitTxt: !usable ? null : m.scope ? null : fa, mapeH3: ho ? ho.holdout.d3.mape : null, mapeH7: ho ? ho.holdout.d7.mape : null, cov3: ho ? ho.holdout.d3.coverage80 : null, cov7: ho ? ho.holdout.d7.coverage80 : null, hoIn: !!(ho && ho.inSample), hoN: ho ? ho.holdout.d3.n : 0, mapeI3: ho ? ho.insample.d3.mape : null, mapeI7: ho ? ho.insample.d7.mape : null,
        p90: agr && agr.p90 ? pcell(agr.p90) : null, p180: agr && agr.p180 ? pcell(agr.p180) : null, d180: agr ? agr.d180 : null, prior: m.prior && agr && agr.p180 ? agr.p180.priorShare : null, status: vm.status, note: m.scope ? T('pMRR only') : '' };
    });
    const radio = (r) => { const inp = el('input', { type: 'radio', name: 'pd-model', value: r.key, 'aria-label': T('Make active: {m}', { m: r.label }), title: r.usable ? T('Switch all forecasts to this model') : T('Model file not loaded') }); inp.checked = st.model === r.key; inp.disabled = !r.usable; inp.addEventListener('change', () => { if (inp.checked) setState({ model: r.key === 'sbg' ? null : r.key }); }); return inp; };
    const fitCell = (r) => {
      if (!r.usable) return el('span', { class: 'dim' }, r._off.status === 'no_file' ? T('no file') : T('file error'));
      if (r._m.scope) return el('span', { class: 'dim' }, r.note);
      const fa = r._fit.segments.all, dg = fa && fa.diag; if (!dg) return '—';
      const conv = fa.curveFrom === 'all' && dg.converged, edge = r._v.fit.find((c) => c.id === 'edge_params'), q = r._v.fit.find((c) => c.id === 'fit_quality');
      return el('span', { class: 'pd-fit' }, el('span', { class: conv ? 'good' : 'warn', title: conv ? T('Converged on «all»') : T('On grid edge / not converged') }, conv ? '✓' : '△'), ' ',
        el('span', { class: 'mono' }, dg.r2 != null ? `R² ${dg.r2.toFixed(2)}` : dg.ll != null ? `ll ${Math.round(dg.ll)}` : '—'), el('span', { class: 'mono dim', title: T('max |S fitted − S actual| on «all»') }, ` · Δ ${dg.maxAbsDev != null ? dg.maxAbsDev.toFixed(3) : '—'}`),
        edge && edge.level !== 'ok' ? el('span', { class: 'warn', title: edge.detail }, ' ⚠') : null, q && q.level === 'fail' ? el('span', { class: 'bad', title: q.detail }, ' ✗') : null);
    };
    const mapeTxt = (a, b) => (a == null && b == null ? '—' : `${a == null ? '—' : F.pct(a)} / ${b == null ? '—' : F.pct(b)}`);
    const mapeKind = (m) => (m == null ? '' : m <= 0.15 ? 'good' : m <= 0.25 ? 'warn' : 'bad');
    const columns = [
      { key: 'active', label: T('Model active'), sticky: true, width: 64, align: 'center', sortable: false, render: radio },
      { key: 'label', label: T('Model'), text: true, align: 'left', width: 170, render: (r) => el('span', { class: 'pd-seg' }, el('span', {}, r.label), el('span', { class: 'pd-mfam' }, r.family)) },
      { key: 'status', label: T('Status'), text: true, align: 'left', width: 60, render: (r) => { const s = STATUS_LBL[r.status] || [r.status, null]; return U.badge(s[0], s[1], { title: r._v.fit.filter((c) => c.level !== 'ok').map((c) => `${c.label || c.label_ru}: ${c.detail}`).join('\n') || (r._off ? r._off.file : '') }); } },
      { key: 'skill', label: T('Reference'), text: true, align: 'left', width: 160, render: (r) => el('span', { class: 'mono pd-skill' }, r.skill) },
      { key: 'kind', label: T('Type'), text: true, align: 'left', render: (r) => U.badge(r.kind, r.kind === 'offline' ? 'info' : null) },
      { key: 'fitTxt', label: T('Fit quality'), text: true, align: 'left', width: 140, sortable: false, render: fitCell, tip: T('Convergence on «all», R² (curves) or log-likelihood, Δ = max |S fitted − S actual|; ⚠ — parameter on grid edge, ✗ — fit quality fail') },
      { key: 'mapeH3', label: `Hold-out MAPE D${btTarget} (D3 / D7)`, width: 150, render: (r) => (r.mapeH3 == null && r.mapeH7 == null ? '—' : el('span', { class: 'pd-seg' }, el('span', { class: mapeKind(r.mapeH3) }, mapeTxt(r.mapeH3, r.mapeH7)), el('span', { class: 'pd-mfam' }, T('80% cov. D3 {a} / D7 {b} · n={n}', { a: r.cov3 == null ? '—' : Math.round(r.cov3 * 100) + '%', b: r.cov7 == null ? '—' : Math.round(r.cov7 * 100) + '%', n: r.hoN })), r.hoIn ? el('span', { class: 'warn pd-mfam', title: T('Model file trained on all data (no train_cutoff) — in-sample for these cohorts; rebuild with --cutoff') }, T('in-sample: file without cutoff')) : null)), tip: holdTip(st) },
      { key: 'mapeI3', label: `In-sample MAPE D${btTarget}`, width: 104, render: (r) => (r.mapeI3 == null ? '—' : el('span', { class: mapeKind(r.mapeI3) }, mapeTxt(r.mapeI3, r.mapeI7))), tip: T('As in «Model accuracy»: parameters saw the tested cohorts') },
      { key: 'prior', label: T('Prior share'), width: 70, render: (r) => (r.prior == null ? el('span', { class: 'dim' }, '—') : el('span', { class: r.prior > 0.5 ? 'warn' : '' }, F.pct(r.prior))), tip: T('Share of the retention curve that comes from the benchmark prior, trial-weighted over the total row (m / (at risk + m) per segment); — for models without a prior; > 50 % — the forecast is mostly the prior') },
      { key: 'p90', label: 'pROAS D90', fmt: 'x', heatmap: roasHeat, width: 78, tip: T('Period total row by this model; interval in tooltip') },
      { key: 'p180', label: 'pROAS D180', fmt: 'x', heatmap: roasHeat, width: 78 },
      { key: 'd180', label: T('Δ to base'), width: 68, render: (r) => (r.d180 == null ? (r.key === 'sbg' ? el('span', { class: 'dim' }, T('base')) : '—') : el('span', { class: Math.abs(r.d180) < 0.0005 ? 'dim' : r.d180 > 0 ? 'good' : 'bad' }, (r.d180 > 0 ? '+' : r.d180 < 0 ? '−' : '') + F.pct(Math.abs(r.d180)))), tip: T('pROAS D180 of model / pROAS D180 sBG − 1') },
    ];
    const cellTip = (r, col, raw) => {
      if (col.key !== 'p90' && col.key !== 'p180') return null;
      const agr = mdUI.ag && mdUI.ag.rows.find((x) => x.id === r.key), p = agr && (col.key === 'p90' ? agr.p90 : agr.p180); if (!p) return null;
      const kv = [['pROAS', F.x(p.roas)], [T('80% interval'), `${F.x(p.roasLo)} – ${F.x(p.roasHi)}`], [T('Revenue (median)'), money(p.mid)], [T('Model'), MODEL_LABEL(r.key)]];
      if (p.basis === 'predicted') kv.push([T('Prior share'), priorTxt(p.priorShare)]);
      return { title: `${r.label} · ${col.key === 'p90' ? 'D90' : 'D180'}`, formula: T('pROAS = (received + expected revenue) / spend'), kv, note: p.basis === 'actual' ? T('Actual — all cohorts mature') : `${T('Forecast')} · ${sigTxt(st)}` };
    };
    const cfg = { columns, rows: mrows, sort: null, cellTip, onRowClick: (r) => openModelDrawer(r, st), rowClass: (r) => (r.key === st.model ? 'sel' : ''), maxHeight: 480, ariaLabel: T('Model registry') };
    if (!mdUI.tbl) mdUI.tbl = U.table(mdUI.tblHost, cfg); else mdUI.tbl.update(cfg);
    /* 3. data block (data requirements) */
    const dItems = v.missing.map((m) => ({ severity: SEV_CLS[m.severity], title: el('span', { title: T('Fields: {list}', { list: m.fields.join(', ') }) }, m.text || m.text_ru), chip: m.severity === 'blocker' ? T('blocker') : null }));
    /* incident windows (data.incidents[]): renewals due inside them are censored for every model */
    const incChk = v.input.find((c) => c.id === 'incidents'), incWins = BB.predict.incidents(data);
    if (incWins.length && incChk) dItems.push({ severity: 'info', title: el('span', { title: T('Fields: {list}', { list: incChk.fields.join(', ') }) }, T('Incident windows declared: {n}; {c} at-risk renewals censored — not evidence about churn for any model.', { n: incWins.length, c: incChk.n })), chip: T('incidents'), value: incWins.map((w) => BB.util.isoDate(w.from) + '…' + BB.util.isoDate(w.to)).join(', ') });
    /* loader validation (BB.adapters.validate, attached by the JSON adapter as meta.validation): first 5 problems of the loaded file */
    const lv = data.meta && data.meta.validation, probs = lv ? lv.errors.concat(lv.warnings) : [];
    probs.slice(0, 5).forEach((e, i) => dItems.push({ severity: lv.errors.includes(e) ? 'bad' : 'warn', title: el('span', { title: e.examples && e.examples.length ? T('Examples: {list}', { list: e.examples.join('; ') }) : T('Data file check') }, e.text || e.text_ru), chip: T('file'), value: e.table || '' }));
    if (probs.length > 5) dItems.push({ severity: 'info', title: T('{n} more data-file notes — full list: BB.load().meta.validation in console', { n: probs.length - 5 }), value: data.meta.file || '' });
    if (!dItems.length) dItems.push({ severity: 'good', title: T('All data for this model connected') });
    U.alertList(mdUI.dataHost, dItems);
    /* 4. agreement: bar chart (D180, total) + per-row table */
    renderAgreement(st, sc, rows, total, preds);
    mdCard.setCaption(`${BB.plural(BB.predict.MODELS.length, 'model|models')} · ${T('active {m}', { m: MODEL_LABEL(st.model) })} · ${Math.round(performance.now() - t0)} ms`);
  }

  function renderAgreement(st, sc, rows, total, preds) {
    const ag = mdUI.ag; if (!ag) return;
    const host = mdUI.agreeHost;
    if (!mdUI.agreeUI) {
      mdUI.agreeUI = { verdict: el('p', { class: 'pd-verdict' }), chartHost: el('div', { class: 'chart pd-agree-chart' }), cmpHost: el('div', { class: 'tbl-host' }), sel: null };
      host.append(mdUI.agreeUI.verdict, el('div', { class: 'grid c2 pd-agree' }, el('div', { class: 'pd-sub' }, el('div', { class: 'pd-sub-t' }, T('pROAS D180 by model · total row · bar — 80% interval')), mdUI.agreeUI.chartHost), el('div', { class: 'pd-sub' }, el('div', { class: 'pd-sub-t row', style: { gap: '8px', alignItems: 'center' } }, T('pROAS by visible cohorts: sBG vs') + ' ', el('span', { id: 'pd-cmp-slot' })), mdUI.agreeUI.cmpHost)));
    }
    const ui = mdUI.agreeUI, target = num(st.targetRoas, 1);
    const hoBase = holdCache.get(holdKey('sbg', st)), best = ag.rows.filter((r) => r.converged && r.id !== 'sbg').map((r) => ({ id: r.id, h: holdCache.get(holdKey(r.id, st)) })).filter((x) => x.h && x.h.holdout.d7.mape != null).sort((a, b) => a.h.holdout.d7.mape - b.h.holdout.d7.mape)[0];
    const hoTxt = hoBase && best ? ' ' + T('Hold-out MAPE D7: sBG {a}, best alternative {m} {b}.', { a: F.pct(hoBase.holdout.d7.mape), m: MODEL_LABEL(best.id), b: F.pct(best.h.holdout.d7.mape) }) : '';
    ui.verdict.textContent = (ag.verdict || ag.verdict_ru) + hoTxt + (ag.consensus ? ' ' + T('Consensus (median of {n} models): pROAS D180 {v}.', { n: ag.consensus.n, v: F.x(ag.consensus.p180.roas) }) : '');
    /* chart: floating bar = 80 % band, point = mid; base highlighted, target line */
    const okRows = ag.rows.filter((r) => r.p180 && r.p180.roas != null);
    const labels = okRows.map((r) => (r.id === 'sbg' ? T('sBG (base)') : CH_MODEL_SHORT[r.id] || r.label)), fullLabels = okRows.map((r) => r.label), slot = (r) => U.entityColor('model', r.id), ink = U.cssVar('--bg-1') || '#111';
    mdUI.chart = destroy(mdUI.chart); U.clear(ui.chartHost); const canvas = el('canvas', { 'aria-label': T('pROAS D180 by model with 80% interval') }); ui.chartHost.append(canvas);
    mdUI.chart = U.chart(canvas, { type: 'bar', data: { labels, datasets: [ // lower index draws on top → markers first, band second
      { type: 'line', label: 'pROAS D180', data: okRows.map((r) => r.p180.roas), showLine: false, pointRadius: 5, pointHoverRadius: 6, pointStyle: 'rectRot', pointBackgroundColor: ink, pointBorderColor: okRows.map((r) => slot(r)), pointBorderWidth: 2, borderColor: ink },
      { type: 'bar', label: T('80% interval'), data: okRows.map((r) => [r.p180.roasLo, r.p180.roasHi]), backgroundColor: okRows.map((r) => U.hexA(slot(r), r.id === 'sbg' ? 0.55 : 0.3)), borderColor: okRows.map((r) => slot(r)), borderWidth: okRows.map((r) => (r.id === 'sbg' ? 2 : 1)), borderSkipped: false, maxBarThickness: 28 },
      { type: 'line', label: T('target {t}', { t: F.x(target) }), _ref: true, data: okRows.map(() => target), borderColor: REF_GRAY, borderDash: [6, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 },
    ] }, options: { interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45 } }, y: { min: 0, suggestedMax: Math.max(1.2, target + 0.2), ticks: { callback: (v) => v.toFixed(1) + 'x' } } },
      plugins: { legend: { display: false }, tooltip: { filter: (it) => !it.dataset._ref, callbacks: { title: (items) => (items.length ? fullLabels[items[0].dataIndex] : ''), label: (c) => (Array.isArray(c.raw) ? ` ${T('80% interval')}: ${F.x(c.raw[0])} – ${F.x(c.raw[1])}` : ` ${c.dataset.label}: ${F.x(c.parsed.y)}`) } } } } });
    /* per-row table vs base at D30 / D90 / D180 for the compare model */
    const cmpOptions = ag.rows.filter((r) => r.id !== 'sbg' && r.p180).map((r) => ({ id: r.id, label: r.label }));
    if (!cmpOptions.length) { U.emptyState(ui.cmpHost, T('No converged alternative models')); return; }
    if (!mdUI.cmpModel || !cmpOptions.some((o) => o.id === mdUI.cmpModel)) mdUI.cmpModel = st.model !== 'sbg' && cmpOptions.some((o) => o.id === st.model) ? st.model : best ? best.id : cmpOptions[0].id;
    const slotEl = host.querySelector('#pd-cmp-slot');
    if (!ui.sel) { ui.sel = U.select(cmpOptions, mdUI.cmpModel, (v) => { mdUI.cmpModel = v; renderAgreement(st, sc, rows, total, preds); }, { label: T('Compare model') }); slotEl.append(ui.sel.el); } else ui.sel.setOptions(cmpOptions, mdUI.cmpModel);
    const cmp = mdUI.cmpModel, D = [30, 90, 180];
    const mkRow = (r, label, isTotal) => { const o = { key: r.key, label, _row: r }; D.forEach((N) => { const b = BB.predict.cohort(r, predictOpts(st, sc, { offset: N, model: 'sbg' })), c = BB.predict.cohort(r, predictOpts(st, sc, { offset: N, model: cmp })); o['b' + N] = pcell(b); o['c' + N] = pcell(c); o['d' + N] = b.roas ? c.roas / b.roas - 1 : null; o['_actual' + N] = b.basis === 'actual'; }); return o; };
    const crows = rows.filter((r) => r.trials >= 10).slice(0, 12).map((r) => mkRow(r, r.label));
    const ctotal = mkRow(total, T('Total / weighted'), true);
    const dcol = (N) => ({ key: 'd' + N, label: `Δ D${N}`, width: 70, render: (r) => (r['_actual' + N] ? el('span', { class: 'dim', title: T('Cohort mature — actual is the same for all models') }, T('actual')) : r['d' + N] == null ? '—' : el('span', { class: Math.abs(r['d' + N]) < 0.0005 ? 'dim' : r['d' + N] > 0 ? 'good' : 'bad' }, (r['d' + N] > 0 ? '+' : r['d' + N] < 0 ? '−' : '') + F.pct(Math.abs(r['d' + N])))) });
    const ccols = [{ key: 'label', label: st.groupBy ? dimLabel(st.groupBy) : T('Cohort'), sticky: true, text: true, width: 150 }];
    D.forEach((N) => { ccols.push({ key: 'b' + N, label: `sBG D${N}`, fmt: 'x', width: 84, heatmap: roasHeat }, { key: 'c' + N, label: `${CH_MODEL_SHORT[cmp] || cmp} D${N}`, fmt: 'x', width: 84, heatmap: roasHeat }, dcol(N)); });
    const ccfg = { columns: ccols, rows: crows, total: ctotal, sort: null, maxHeight: 320, ariaLabel: T('Model agreement by cohort'), emptyText: T('No cohorts with ≥ 10 trials') };
    if (!mdUI.cmpTbl) mdUI.cmpTbl = U.table(ui.cmpHost, ccfg); else mdUI.cmpTbl.update(ccfg);
  }
  const PARAM_LABEL = { sbg: 'α / β', power: 'a / b', power_b: T('a / b (b borrowed)'), geom: 'c', log: 'a / b', weibull: 'λ / κ', km: T('KM tail'), cox: T('Curve from file') };
  const CH_MODEL_SHORT = { power: 'Power', power_b: 'Power·b', geom: 'Const', log: 'Log', weibull: 'Weibull', km: 'KM', cox: 'Cox', arima: 'ARIMA' };

  /* detail drawer: S(k) fitted vs observed, parameters per segment, fit checks, offline file info */
  let drawerChart = null;
  function openModelDrawer(r, st) {
    const m = r._m, fit = r._fit, F2 = fit.segments, v = r._v;
    const body = el('div');
    const keys = Object.keys(F2).filter((k) => k.split('|').length === 2 && F2[k].curveFrom === k).sort((a, b) => F2[b].n - F2[a].n).slice(0, 3);
    const shown = ['all'].concat(keys), K = 26;
    if (r.usable && !m.scope) {
      const chartHost = el('div', { class: 'chart', style: { height: '220px', position: 'relative' } }), canvas = el('canvas'); chartHost.append(canvas);
      body.append(el('div', { class: 'pd-sub-t' }, T('S(k) by model (line) and actual (points), k — renewal number · «all» and 3 largest plan × geo segments')), chartHost);
      const datasets = [];
      shown.forEach((k) => {
        const f = F2[k], color = k === 'all' ? (U.cssVar('--fg-2') || '#d0d6e0') : U.entityColor('seg:pt', k), name = k === 'all' ? T('all') : fmtSegKey(k);
        let S = 1, obsS = 1; const fitted = [], obs = [];
        for (let kk = 1; kk <= K; kk++) { if (kk > 1) S *= f.r(kk); fitted.push({ x: kk, y: S }); const ob = f.obs[kk]; if (kk === 1) obs.push({ x: 1, y: 1 }); else if (ob && ob.n >= 5 && obsS !== null) { obsS *= ob.s / ob.n; obs.push({ x: kk, y: obsS, n: ob.n }); } else obsS = null; }
        datasets.push({ label: name, _legend: true, data: fitted, borderColor: color, borderWidth: k === 'all' ? 2.2 : 1.5 });
        if (obs.length > 1) datasets.push({ label: name + ' · ' + T('actual'), data: obs, borderColor: color, backgroundColor: color, showLine: false, pointRadius: 3.5, pointHoverRadius: 5 });
      });
      drawerChart = destroy(drawerChart);
      requestAnimationFrame(() => { drawerChart = U.chart(canvas, { type: 'line', data: { datasets }, options: { parsing: false, interaction: { mode: 'nearest', intersect: false }, scales: { x: { type: 'linear', min: 1, max: K, grid: { display: false }, ticks: { stepSize: 5, callback: (v) => 'k' + v } }, y: { min: 0, max: 1, ticks: { callback: (v) => Math.round(v * 100) + '%' } } },
        plugins: { legend: { labels: { filter: (item, d) => !!d.datasets[item.datasetIndex]._legend } }, tooltip: { callbacks: { title: (items) => (items.length ? T('renewal #{n}', { n: Math.round(items[0].parsed.x) }) : ''), label: (c) => ` ${c.dataset.label}: ${F.pct(c.parsed.y)}${c.raw && c.raw.n ? ` (n=${c.raw.n})` : ''}` } } } } }); });
      /* parameters per segment */
      const prow = Object.keys(F2).filter((k) => k === 'all' || k.split('|').length <= 2).sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : F2[b].n - F2[a].n)).slice(0, 10).map((k) => { const f = F2[k]; return { key: k, label: k === 'all' ? T('all') : fmtSegKey(k), params: fmtParams(f, fit.model), n: f.n, atRisk: f.atRisk, src: f.curveFrom === k ? T('own') : f.curveFrom === 'default' ? T('default') : `↳ ${fmtSegKey(f.curveFrom)}` }; });
      const pHost = el('div', { class: 'tbl-host' });
      body.append(el('div', { class: 'pd-sub-t', style: { marginTop: '12px' } }, T('Parameters by segment')), pHost);
      U.table(pHost, { columns: [{ key: 'label', label: T('Segment'), sticky: true, text: true, width: 130 }, { key: 'params', label: T('Parameters'), text: true, align: 'left', render: (x) => el('span', { class: 'mono' }, x.params) }, { key: 'atRisk', label: T('At risk'), fmt: 'int' }, { key: 'src', label: T('Curve'), text: true, align: 'left' }], rows: prow, sort: null, maxHeight: 260 });
    }
    /* fit checks */
    body.append(el('div', { class: 'pd-sub-t', style: { marginTop: '12px' } }, T('Fit checks')));
    const fHost = el('div'); body.append(fHost);
    U.alertList(fHost, v.fit.map((c) => ({ severity: LEVEL_SEV[c.level], title: c.label || c.label_ru, desc: c.detail, chip: c.level === 'ok' ? null : c.level === 'fail' ? 'fail' : 'warn' })));
    if (m.kind === 'offline') {
      const o = r._off, kv = [[T('File'), m.file], [T('Status'), (STATUS_LBL[o.status] || [o.status])[0] + (o.staleReason ? ` (${o.staleReason === 'dataset changed' ? T('dataset changed') : o.staleReason})` : '') + (o.error ? `: ${o.error}` : '')], [T('Generated'), o.generated_at ? `${o.generated_at.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC')} (${o.ageDays != null ? o.ageDays.toFixed(1) : '—'} ${T('d')})` : '—'], [T('Tool'), o.tool || '—'], [T('Dataset hash'), `${o.data_hash || '—'} · ${T('current')} ${BB.predict.dataHash(data)}`], [T('Segments in file'), String(o.nSegments)], [T('Users in file'), String(o.nUsers)]];
      if (m.id === 'cox' && r.usable) { const cp = BB.predict.cohort(lastTotal, predictOpts(st, lastSc, { offset: 180, model: 'cox' })); kv.push([T('User coverage (total)'), cp.coverage == null ? '—' : F.pct(cp.coverage)]); }
      body.append(el('div', { class: 'pd-sub-t', style: { marginTop: '12px' } }, T('Offline file')), el('div', { class: 'pd-kv' }, ...kv.map(([k, val]) => el('div', {}, el('span', { class: 'k' }, k), el('span', { class: 'v mono' }, val)))));
    }
    body.append(el('div', { class: 'pd-note' }, T('Reference: {s} · family: {f}', { s: m.skill, f: m.family })));
    U.sidePanel({ title: BB.lbl(m), caption: `${m.kind === 'js' ? T('in-browser') : T('offline file')} · ${(STATUS_LBL[r.status] || [r.status])[0]}`, body, width: 560, onClose: () => { drawerChart = destroy(drawerChart); } });
  }

  /* ───────── B. prediction table ───────── */
  function renderTable(st, rows, preds, total, tp, modeCaption, target) {
    const byKey = new Map(preds.map((p) => [p.key, p]));
    const selColor = new Map([...selected].map((k) => [k, selColorOf(k)]));
    const trows = rows.map((r) => {
      const p = byKey.get(r.key), p360 = p.byOffset[360];
      const actualToDate = p360 ? (p360.basis === 'actual' ? p360.roas : (r.spend ? p360.observed / r.spend : null)) : null;
      const o = { key: r.key, label: r.label, spend: r.spend, trials: r.trials, cpt: BB.metric(r, 'cpt'), roas_now: actualToDate, age: r._age, payback: p.payback_day, verdict: p.verdict || p.verdict_ru, _row: r, _pred: p, _seg: segInfo(r) };
      o.segment = o._seg ? fmtSegKey(o._seg.used) : null;
      PRED_OFFSETS.forEach((N) => { o['p' + N] = cell(p.byOffset[N]); });
      return o;
    });
    const trow = { key: '__total', label: T('Total / weighted'), spend: total.spend, trials: total.trials, cpt: BB.metric(total, 'cpt'), roas_now: total.spend ? tp.byOffset[360].observed / total.spend : null, age: null, payback: tp.payback_day, verdict: tp.verdict || tp.verdict_ru, _pred: tp, _row: total, _seg: segInfo(total) };
    trow.segment = trow._seg ? fmtSegKey(trow._seg.used) : null;
    PRED_OFFSETS.forEach((N) => { trow['p' + N] = cell(tp.byOffset[N]); });

    const segCell = (r) => {
      const s = r._seg; if (!s) return '—';
      const line2 = [s.own ? T('own curve') : `↳ ${s.levelLbl}`];
      if (s.mix > 1) line2.push(T('{pct}% of cohort', { pct: Math.round(s.share * 100) }));
      const warn = s.warn ? el('span', { class: 'warn', title: s.curveFrom === 'default' ? T('Dominant segment is on the default curve (α 1, β 4): no segment in its chain has enough renewals') : T('Dominant segment: {pct} of its curve comes from the benchmark prior (> 50 %) — the forecast is mostly the prior', { pct: F.pct(s.priorShare) }) }, '⚠ ') : null;
      return el('span', { class: 'pd-seg' }, el('span', { class: 'pd-segk' }, warn, fmtSegShort(s.full)), el('span', { class: 'pd-segf' + (s.own ? ' dim' : '') }, line2.join(' · ')));
    };
    const columns = [
      { key: 'label', label: st.groupBy ? dimLabel(st.groupBy) : T('Cohort'), sticky: true, width: 180, text: true, render: (r) => { if (r.key === '__total') return r.label; const c = selColor.get(r.key); return el('span', { class: 'row', style: { gap: 0 } }, el('i', { class: 'pd-sw', style: c ? { background: c } : null }), el('span', {}, r.label)); } },
      { key: 'spend', label: T('Spend'), fmt: moneyFmt(), tip: T('Ad spend of the cohort (USD or local currency per switch)') },
      { key: 'trials', label: T('Trials'), fmt: 'int' },
      { key: 'cpt', label: 'CPT', fmt: money2Fmt(), heatmap: 'bad', dir: 1, tip: T('spend / trials') },
      { key: 'roas_now', label: T('ROAS actual'), fmt: 'x', heatmap: roasHeat, tip: T('All revenue received to date / spend') },
      { key: 'age', label: T('Age'), render: (r) => (r.age == null ? '—' : r.age + ' ' + T('d')), tip: st.groupBy ? T('Median user age in slice, days') : T('Days since cohort end') },
      { key: 'segment', label: T('Model segment'), text: true, align: 'left', width: 180, render: segCell, tip: T('Dominant plan · geo tier · channel segment and the level parameters come from (< 30 trials — one level up)') },
      ...PRED_OFFSETS.map((N) => ({ key: 'p' + N, label: 'pROAS ' + dayLabel(N), fmt: 'x', heatmap: roasHeat, width: 92, tip: T('ROAS to D{n}: actual if the cohort is mature, else forecast', { n: N }) })),
      { key: 'payback', label: T('Payback'), render: (r) => (r.payback == null ? '—' : F.days(r.payback)), tip: T('First D where pROAS ≥ {t}', { t: F.x(target) }) },
      { key: 'verdict', label: T('Verdict'), text: true, align: 'left', width: 150, render: (r) => U.badge(r.verdict, paybackKind(r)) },
    ];
    const cellTip = (row, col, raw) => {
      if (col.key === 'segment') {
        const s = row._seg; if (!s) return null;
        const kv = [[T('Dominant key'), fmtSegKey(s.full)], [T('Share of users in it'), F.pct(s.share)], [T('Distinct segments in row'), F.int(s.mix)], [T('Parameters from'), `${fmtSegKey(s.used)} (${s.levelLbl})`], [T('Curve from'), s.curveFrom === 'default' ? T('default') : fmtSegKey(s.curveFrom)], [T('Trials in segment'), F.int(s.n)], [T('P(1st rebill)'), p1Txt(s)], [T('Prior share'), priorTxt(s.priorShare)]];
        const note = s.warn ? (s.curveFrom === 'default' ? T('⚠ default curve: no segment in the chain has enough renewals') : T('⚠ prior share > 50 %: the forecast is mostly the benchmark prior')) : s.own ? T('Segment thick enough — own parameters') : T('Parameters from one level up: fewer than {n} completed trials / renewals at risk in segment', { n: BB.MIN_USERS });
        return { title: `${row.label} · ${T('model segment')}`, formula: T('key = plan | geo tier | channel → plan | geo tier → plan → all'), kv, note };
      }
      if (!/^p\d+$/.test(col.key)) return null;
      const N = +col.key.slice(1), p = row._pred && row._pred.byOffset[N]; if (!p) return null;
      const kv = [[T('Revenue (median)'), money(p.mid)], [T('Spend'), money(p.spend)], [T('Trials'), F.int(p.trials)]];
      if (row._seg) kv.push([T('Model segment'), `${fmtSegKey(row._seg.used)}${row._seg.own ? '' : ' ' + T('(one level up)')}`]);
      if (p.basis === 'predicted') {
        kv.push([T('80% ROAS interval'), `${F.x(p.roasLo)} – ${F.x(p.roasHi)}`], [T('Received revenue'), money(p.observed)], [T('Expected payers ({def})', { def: payerGroup(st) }), p.payers_expected.toFixed(1)], [T('Users with open future'), F.int(p.pendingUsers || 0)], [T('Prior share'), priorTxt(p.priorShare)]);
        const o = row._row && row._row.byOffset && row._row.byOffset[N];
        if (o && o.mature) kv.push([T('Actual (hidden by signal mode)'), F.x(BB.metric(row._row, 'roas', N))]);
      } else kv.push([T('Payers ({def})', { def: payerGroup(st) }), F.int(p.payers_expected)]);
      return { title: `${row.label} · ${dayLabel(N)}`, formula: p.basis === 'actual' ? T('ROAS = revenue(DN) / spend (actual)') : T('pROAS = (received + expected revenue) / spend'), kv, note: p.basis === 'actual' ? T('Cohort mature by this day') : `${T('Forecast')} · ${sigTxt(st)}` };
    };
    const onRowClick = (r) => {
      if (r.key === '__total') return;
      if (selected.has(r.key)) selected.delete(r.key);
      else if (selected.size >= MAX_SEL) { U.toast(T('Max {n} rows on chart — deselect one', { n: MAX_SEL }), 'bad'); return; }
      else selected.add(r.key);
      render();
    };
    const cfg = { columns, rows: trows, total: trow, cellTip, onRowClick, rowClass: (r) => (selected.has(r.key) ? 'sel' : ''), maxHeight: 560 };
    if (!tbl) tbl = U.table(tblHost, Object.assign({ sort: null }, cfg)); else tbl.update(cfg);
  }

  /* ───────── C. actual → predicted chart ───────── */
  function renderChart(st, sc, rows, target) {
    const sel = [...selected].map((k) => rows.find((r) => r.key === k)).filter(Boolean);
    const sig = sigOf(st);
    const datasets = [];
    sel.forEach((r) => {
      const color = selColorOf(r.key);
      const actual = BB.predict.curve(r, { money: st.money, signalDay: 'all', data, payer: st.payer, model: st.model }).filter((c) => c.basis === 'actual' && c.roas != null);
      const pred = BB.predict.curve(r, predictOpts(st, sc)).filter((c) => c.roas != null);
      const lastA = actual.length ? actual[actual.length - 1].day : -1;
      const predFrom = sig === 'all' ? lastA : Math.min(sig, lastA < 0 ? sig : lastA);
      const predPts = pred.filter((c) => c.day >= predFrom);
      if (sig === 'all' && actual.length && predPts.length && predPts[0].day === lastA) predPts[0] = Object.assign({}, predPts[0], { roas: actual[actual.length - 1].roas, roasLo: actual[actual.length - 1].roas, roasHi: actual[actual.length - 1].roas });
      datasets.push({ label: r.label, _legend: true, data: actual.map((c) => ({ x: c.day, y: c.roas })), borderColor: color, borderWidth: 2 });
      datasets.push({ label: r.label + ' · ' + T('forecast'), data: predPts.map((c) => ({ x: c.day, y: c.roas })), borderColor: color, borderDash: [5, 4], borderWidth: 1.5 });
      const loIdx = datasets.length;
      datasets.push({ label: r.label + ' · lo', _band: true, data: predPts.map((c) => ({ x: c.day, y: c.roasLo })), borderColor: 'transparent', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0 });
      datasets.push({ label: r.label + ' · hi', _band: true, data: predPts.map((c) => ({ x: c.day, y: c.roasHi })), borderColor: 'transparent', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, fill: { target: loIdx }, backgroundColor: U.hexA(color, 0.12) });
    });
    const line = (y, label, dash) => ({ label, _ref: true, data: [{ x: 0, y }, { x: 360, y }], borderColor: REF_GRAY, borderDash: dash, borderWidth: 1, pointRadius: 0, pointHoverRadius: 0, tension: 0 });
    datasets.push(line(1, '1.0x', [2, 3]));
    if (Math.abs(target - 1) > 1e-9) datasets.push(line(target, T('target {t}', { t: F.x(target) }), [6, 4]));
    chartCard.setCaption(`${T('{n} of {max} rows', { n: sel.length, max: MAX_SEL })} · ${st.money === 'net' ? 'Net' : 'Gross'} · ${sigTxt(st)}`);
    curveChart = destroy(curveChart);
    U.clear(chartCard.body); const canvas = el('canvas'); chartCard.body.append(canvas);
    if (chartView.mode === 'table') canvas.hidden = true;
    curveChart = U.chart(canvas, { type: 'line', data: { datasets }, options: {
      parsing: false, spanGaps: true, interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: { type: 'linear', min: 0, max: 360, grid: { display: false }, ticks: { autoSkip: false, callback: (v) => 'D' + v }, afterBuildTicks: (ax) => { ax.ticks = BB.OFFSETS.filter((o) => ![1, 3, 21, 45, 120, 270].includes(o)).map((v) => ({ value: v })); } },
        y: { min: 0, suggestedMax: Math.max(1.2, target + 0.2), ticks: { callback: (v) => v.toFixed(1) + 'x' } },
      },
      plugins: { legend: { labels: { filter: (item, d) => !!d.datasets[item.datasetIndex]._legend } },
        tooltip: { filter: (it) => !it.dataset._band && !it.dataset._ref, callbacks: { title: (items) => (items.length ? 'D' + Math.round(items[0].parsed.x) : ''), label: (c) => ` ${c.dataset.label}: ${c.parsed.y == null ? '—' : F.x(c.parsed.y)}` } } },
    } });
    chartView.refresh();
  }

  /* ───────── D. bid calculator (breakdown incl. channel / device_class) ───────── */
  let calcTbl = null, calcForm = null;
  function renderCalc(st, sc) {
    const body = calcCard.body;
    const target = num(st.targetRoas, 1), horizon = String(num(st.horizon, 90)), margin = num(st.margin, 0), dim = CALC_DIMS.includes(st.calcDim) ? st.calcDim : 'channel';
    if (!calcForm) {
      const tIn = el('input', { class: 'input num', type: 'number', inputmode: 'decimal', min: '0.1', max: '5', step: '0.1', value: target, 'aria-label': T('Target ROAS') });
      tIn.addEventListener('change', () => setState({ targetRoas: String(Math.max(0.1, num(tIn.value, 1))) }));
      const hSel = U.select([30, 60, 90, 180].map((d) => ({ id: String(d), label: 'D' + d })), horizon, (v) => setState({ horizon: String(v) }), { label: T('Horizon') });
      const mIn = el('input', { class: 'input num', type: 'number', inputmode: 'decimal', min: '0', max: '90', step: '5', value: margin, 'aria-label': T('Margin, %') });
      mIn.addEventListener('change', () => setState({ margin: String(Math.min(90, Math.max(0, num(mIn.value, 0)))) }));
      const dSel = U.select(CALC_DIMS.map((d) => ({ id: d, label: dimLabel(d) })), dim, (v) => setState({ calcDim: v }), { label: T('Breakdown') });
      calcForm = { el: el('div', { class: 'pd-form' }, el('label', { class: 'pd-field' }, el('span', {}, T('Target ROAS')), tIn), el('label', { class: 'pd-field' }, el('span', {}, T('Horizon')), hSel.el), el('label', { class: 'pd-field' }, el('span', {}, T('Margin, %')), mIn), el('label', { class: 'pd-field' }, el('span', {}, T('Breakdown')), dSel.el)), tIn, hSel, mIn, dSel, host: el('div', { class: 'tbl-host' }) };
      U.clear(body).append(calcForm.el, calcForm.host, el('div', { class: 'pd-note' }, T('max CPT = pLTV per trial at horizon / target ROAS × (1 − margin) · headroom = (max CPT − CPT) / CPT: green — can pay more, red — overpaying · < 10 trials — «Not enough data»')));
    } else { calcForm.tIn.value = target; calcForm.hSel.set(horizon); calcForm.mIn.value = margin; calcForm.dSel.set(dim); }
    const bd = BB.breakdown({ data, state: st, dim, offsets: [0], topN: 10 });
    const rows = bd.rows.map((r) => {
      r.basis = lastTotal.basis;
      const m = BB.predict.maxCpt({ row: r, targetRoas: target, horizon: +horizon, margin: margin / 100, money: st.money, scenario: sc.active ? sc : null, data, signalDay: sigOf(st), model: st.model });
      const s = segInfo(r);
      return { key: r.key, label: dim === 'channel' && r.key !== '__other' ? chLabel(r.key) : r.label, trials: r.trials, cpt: m.currentCpt, maxCpt: m.maxCpt, cpi: m.currentCpi, maxCpi: m.maxCpi, head: m.headroomPct == null ? null : m.headroomPct / 100,
        proas: m.pRoas == null ? null : { v: m.pRoas, tip: U.tipHtml({ title: `${r.label} · pROAS D${horizon}`, kv: [[T('80% interval'), `${F.x(m.pRoasLo)} – ${F.x(m.pRoasHi)}`], [T('pLTV / trial'), money(m.pLtvPerTrial)], [T('Model segment'), s ? `${fmtSegKey(s.used)}${s.own ? '' : ' ' + T('(one level up)')}` : '—'], [T('Prior share'), s ? priorTxt(s.priorShare) : '—']] }) }, verdict: m.verdict || m.verdict_ru };
    });
    const columns = [
      { key: 'label', label: dimLabel(dim), sticky: true, text: true, width: 120 },
      { key: 'trials', label: T('Trials'), fmt: 'int' },
      { key: 'cpt', label: T('CPT now'), fmt: money2Fmt() },
      { key: 'maxCpt', label: 'max CPT', fmt: money2Fmt(), heatmap: 'good', tip: T('Max trial price at target ROAS') },
      { key: 'cpi', label: T('CPI now'), fmt: money2Fmt() },
      { key: 'maxCpi', label: 'max CPI', fmt: money2Fmt(), tip: T('Max signup price') },
      { key: 'head', label: T('Headroom'), render: (r) => (r.head == null ? '—' : el('span', { class: r.head >= 0 ? 'good' : 'bad' }, (r.head >= 0 ? '+' : '') + F.pct(r.head))), tip: '(max CPT − CPT) / CPT' },
      { key: 'proas', label: `pROAS D${horizon}`, fmt: 'x', heatmap: roasHeat },
      { key: 'verdict', label: T('Recommendation'), text: true, align: 'left', width: 170, render: (r) => U.badge(r.verdict, r.trials < 10 ? null : headroomKind(r.head)) },
    ];
    if (!rows.length) { calcTbl = null; U.emptyState(calcForm.host, T('Not enough data'), { sub: T('No rows with spend in slice') }); }
    else if (!calcTbl) calcTbl = U.table(calcForm.host, { columns, rows, sort: { key: 'trials', dir: 'desc' }, maxHeight: 360 }); else calcTbl.update({ columns, rows });
    calcCard.setCaption(`${dimLabel(dim)} · ${T('horizon D{n}', { n: horizon })} · ${T('target {t}', { t: F.x(target) })}${bd.spendAllocated ? ' · ' + T('≈ Allocated spend') : ''}`);
  }

  /* ───────── Plan mix (§4) ─────────
     Rows = values of mixDim in the slice (BB.breakdown, top 8 by spend + Other). For every row the mix is observed: share_plan = trials on the plan / trials. pLTV per trial per plan =
     BB.predict.cohort on the row's users of that plan at ltvH (observed + expected future, so it works under every model); with a plan-mix model (vlad_v2) the plan values come from
     BB.predict.planMix (expected value of a new trial of the plan) and the observed shares stay. Expected pLTV / trial of the mix = Σ share × pLTV_plan (BB.predict.mixLtv).
     Lever "apply mix of X": every row keeps its own plan values and takes X's shares (plans X has and the row has not are dropped, shares renormalised). */
  let mixTbl = null, mixUI = null;
  function renderMix(st, sc, total, thin) {
    const body = mixCard.body, H = U.ltvHorizon(st), dim = MIX_DIMS.includes(st.mixDim) ? st.mixDim : 'paywall';
    mixDimSel.set(dim);
    if (thin) { mixTbl = null; mixUI = null; U.emptyState(body, T('Not enough data')); mixCard.setCaption(T('slice too thin')); return; }
    const mdl = BB.predict.MODEL_BY_ID[BB.predict.modelOf({ model: st.model })], v2 = !!(mdl && mdl.planMix);
    const pm = v2 ? BB.predict.planMix({ data, state: st, dim, horizon: H, model: st.model, scenario: sc.active ? sc : null }) : null;
    const bd = BB.breakdown({ data, state: st, dim, offsets: [0], topN: 8 });
    const scen = sc.active ? sc : null, basis = total.basis;
    const planRow = (us, spend, key) => ({ key, label: key, _users: us, signups: us.length, trials: us.length, spend, basis, byOffset: {}, money: st.money });
    /* per-plan values of a user set: {plan: {trials, share, ltv, lo, hi}} */
    function mixOf(users, spend, keyPrefix) {
      const byP = new Map(); users.forEach((u) => { const t = u._trial; if (!t || !BB.PLAN_BY_ID[t.plan]) return; let a = byP.get(t.plan); if (!a) { a = []; byP.set(t.plan, a); } a.push(u); });
      const tot = [...byP.values()].reduce((s, a) => s + a.length, 0); if (!tot) return null;
      const mix = [...byP.entries()].map(([plan, us]) => { const q = BB.predict.cohort(planRow(us, spend * us.length / tot, keyPrefix + '|' + plan), { offset: H, money: st.money, data, model: st.model, scenario: scen, signalDay: 'all' });
        const obs = { ltv: q.mid / us.length, lo: q.lo / us.length, hi: q.hi / us.length, predicted: q.basis === 'predicted', observedShare: q.mid > 0 ? Math.min(1, q.observed / q.mid) : null };
        return { plan, trials: us.length, share: us.length / tot, ltvPerTrial: v2 && pm.plans[plan] != null ? pm.plans[plan] : obs.ltv, lo: v2 ? null : obs.lo, hi: v2 ? null : obs.hi, obsLtv: obs.ltv, predicted: obs.predicted, observedShare: obs.observedShare }; }).sort((a, b) => b.trials - a.trials);
      const plans = {}; mix.forEach((m) => { plans[m.plan] = m.ltvPerTrial; });
      const sumW = (f) => { let v = 0, w = 0; mix.forEach((m) => { const x = f(m); if (x != null) { v += m.share * x; w += m.share; } }); return w > 0 ? v / w : null; };
      return { mix, plans, trials: tot, expected: BB.predict.mixLtv({ plans }, mix), lo: v2 ? null : sumW((m) => m.lo), hi: v2 ? null : sumW((m) => m.hi), predicted: mix.some((m) => m.predicted) };
    }
    const rows0 = bd.rows.filter((r) => r.trials >= 10).map((r) => { r.basis = basis; return r; });
    const mixes = rows0.map((r) => mixOf(r._users || [], r.spend, r.key));
    const allMix = mixOf(total._users || [], total.spend, '__all');
    const planIds = [...new Set(rows0.flatMap((r, i) => (mixes[i] ? mixes[i].mix.map((m) => m.plan) : [])))].sort((a, b) => ((allMix && allMix.plans[b]) || 0) - ((allMix && allMix.plans[a]) || 0));
    const mixKey = st.mix && rows0.some((r) => String(r.key) === String(st.mix)) ? String(st.mix) : null, mixX = mixKey ? mixes[rows0.findIndex((r) => String(r.key) === mixKey)] : null;
    const rows = rows0.map((r, i) => {
      const m = mixes[i]; if (!m) return null;
      const pr = BB.predict.rows([r], predictOpts(st, sc, { offsets: BB.OFFSETS }))[0], pH = pr.byOffset[H];
      const with_ = mixX ? BB.predict.mixLtv({ plans: Object.assign({}, allMix ? allMix.plans : {}, m.plans) }, mixX.mix) : null; // plans the row has no users on fall back to the slice-wide pLTV per trial of the plan
      const td = r.toDate || {};
      return { key: r.key, label: dim === 'channel' && r.key !== '__other' ? chLabel(r.key) : r.label, trials: r.trials, _m: m, p1: td.first_rebill_rate != null ? td.first_rebill_rate : null,
        expected: m.expected == null ? null : m.predicted ? { v: m.expected, predicted: true, lo: m.lo, hi: m.hi } : m.expected,
        proas: pH && pH.roas != null ? (pH.basis === 'actual' ? pH.roas : { v: pH.roas, predicted: true, lo: pH.roasLo, hi: pH.roasHi }) : null, _pH: pH,
        payback: pr.payback_day == null ? { v: null } : { v: pr.payback_day, predicted: pr.byOffset[pr.payback_day].basis === 'predicted' },
        withMix: with_ == null ? null : { v: with_, predicted: true }, dMix: with_ != null && m.expected > 0 ? with_ / m.expected - 1 : null };
    }).filter(Boolean);
    if (!mixUI) {
      const sel = U.select([], '', (v) => setState({ mix: v || null }), { label: T('Apply mix of') });
      mixUI = { sel, host: el('div', { class: 'tbl-host' }), legend: el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px', marginTop: '10px' } }), lever: el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } }) };
      mixUI.lever.append(mixUI.sel.el);
      U.clear(body).append(mixUI.lever, mixUI.host, mixUI.legend);
    }
    mixUI.sel.setOptions([{ id: '', label: T('— none (own mix) —') }].concat(rows.map((r) => ({ id: String(r.key), label: r.label }))), mixKey || '');
    const old = mixUI.lever.querySelector('.chip'); if (old) old.remove();
    if (mixX) mixUI.lever.append(U.chip({ k: T('what-if'), v: T('mix of {x} applied to every row', { x: rows.find((r) => String(r.key) === mixKey).label }), onRemove: () => setState({ mix: null }) }));
    const planLbl = (id) => (BB.PLAN_BY_ID[id] ? BB.lbl(BB.PLAN_BY_ID[id]) : id);
    const mixBar = (r) => { const m = r._m; return el('div', { class: 'mix-bar', title: m.mix.map((x) => `${x.plan} ${F.pct(x.share)} · pLTV/${T('trial')} ${money(x.ltvPerTrial)}`).join('\n') }, m.mix.map((x) => el('span', { style: { width: (x.share * 100).toFixed(1) + '%', background: U.entityColor('plan', x.plan) } }, x.share >= 0.18 ? `${x.plan.replace(/^(wk|mo)_/, '')} ${Math.round(x.share * 100)}%` : ''))); };
    const columns = [
      { key: 'label', label: dimLabel(dim), sticky: true, text: true, width: 130 },
      { key: 'trials', label: T('Trials'), fmt: 'int', width: 64 },
      { key: 'mix', label: T('Mix of trials by plan'), text: true, align: 'left', sortable: false, width: 220, render: mixBar, tip: T('share of trials per plan (hover: shares and pLTV per trial per plan)') },
      { key: 'p1', label: T('Trial-to-paid'), fmt: 'pct', heatmap: 'good', width: 86, tip: T('succeeded 1st rebill / trials ended to date (observed)') },
      { key: 'expected', label: T('Expected pLTV / trial'), fmt: money2Fmt(), heatmap: 'good', heatmapPredicted: false, width: 120, tip: T('Σ share_plan × pLTV_plan at D{h}; italic = some users still in forecast', { h: H }) },
      { key: 'proas', label: `pROAS D${H}`, fmt: 'x', heatmap: roasHeat, heatmapPredicted: false, width: 86 },
      { key: 'payback', label: T('Payback'), fmt: 'days', width: 80, tip: T('first offset where pROAS ≥ target ROAS') },
      ...(mixX ? [{ key: 'withMix', label: T('With mix of {x}', { x: rows.find((r) => String(r.key) === mixKey).label }), fmt: money2Fmt(), width: 120, tip: T('own pLTV per plan × shares of the selected row (plans the row never sold: slice-wide pLTV per trial of the plan)') },
        { key: 'dMix', label: 'Δ', width: 64, render: (r) => (r.dMix == null ? '—' : el('span', { class: Math.abs(r.dMix) < 0.005 ? 'dim' : r.dMix > 0 ? 'good' : 'bad' }, (r.dMix > 0 ? '+' : '') + F.pct(r.dMix))), tip: T('with mix / own expected − 1') }] : []),
    ];
    const cellTip = (r, col, raw) => {
      const m = r._m;
      if (col.key === 'expected' || col.key === 'withMix' || col.key === 'mix') {
        const kv = m.mix.map((x) => [`${x.plan} · ${F.pct(x.share)}`, money(x.ltvPerTrial) + (x.lo != null && x.predicted ? ` [${money(x.lo)} – ${money(x.hi)}]` : '')]);
        if (col.key === 'withMix' && mixX) kv.push([T('Shares applied'), mixX.mix.map((x) => `${x.plan} ${F.pct(x.share)}`).join(' · ')]);
        return { title: `${r.label} · ${col.label}`, formula: T('expected pLTV / trial = Σ share × pLTV per trial of the plan'), kv, note: v2 ? T('Plan values: expected value of a new trial of the plan ({m}, plan mix model); shares observed in the row', { m: MODEL_LABEL(st.model) }) : T('Plan values: the row\'s own users of that plan under {m}, D{h}', { m: MODEL_LABEL(st.model), h: H }) };
      }
      if (col.key === 'proas' && r._pH) return { title: `${r.label} · pROAS D${H}`, kv: [[T('80% interval'), `${F.x(r._pH.roasLo)} – ${F.x(r._pH.roasHi)}`], [T('Revenue (median)'), money(r._pH.mid)], [T('Spend'), money(r._pH.spend)], [T('Prior share'), priorTxt(r._pH.priorShare)]], note: r._pH.basis === 'actual' ? T('Actual') : T('Forecast') };
      return null;
    };
    if (!rows.length) { mixTbl = null; U.emptyState(mixUI.host, T('Not enough data'), { sub: T('No rows with ≥ 10 trials') }); }
    else if (!mixTbl) mixTbl = U.table(mixUI.host, { columns, rows, cellTip, sort: { key: 'trials', dir: 'desc' }, maxHeight: 360 }); else mixTbl.update({ columns, rows });
    /* plan legend: catalogue of the slice with pLTV per trial per plan over all rows */
    U.clear(mixUI.legend);
    if (allMix) { mixUI.legend.append(el('span', { class: 'caption' }, T('Plans:'))); allMix.mix.slice(0, 10).forEach((x) => { const P = BB.PLAN_BY_ID[x.plan]; mixUI.legend.append(U.badge([el('i', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: U.entityColor('plan', x.plan) } }), ` ${x.plan} · ${P ? money(P.price) + ' · ' + BB.plural(P.trialDays, 'day|days') : ''} · ${F.pct(x.share)} · pLTV/${T('trial')} ${money(x.ltvPerTrial)}`], null, { mono: true, title: `${planLbl(x.plan)} · ${BB.plural(x.trials, 'trial|trials', { fmt: F.int })}` })); }); if (allMix.mix.length > 10) mixUI.legend.append(el('span', { class: 'caption' }, T('+ {n} more plans', { n: allMix.mix.length - 10 }))); }
    mixCard.setCaption(`${dimLabel(dim)} · ${T('horizon D{n}', { n: H })} · ${MODEL_LABEL(st.model)}${v2 ? ' · ' + T('plan mix model') : ''} · ${BB.plural(rows.length, 'row|rows')}${bd.spendAllocated ? ' · ' + T('≈ Allocated spend') : ''}`);
  }

  /* ───────── Channel budget allocator ───────── */
  let allocUI = null;
  function renderAllocator(st) {
    const body = allocCard.body;
    const target = num(st.allocTarget, num(st.targetRoas, 1)), horizon = num(st.allocHorizon, num(st.horizon, 90));
    /* default budget = current daily paid spend of the range (all channels), rounded to $10 */
    const probe = BB.predict.allocate({ data, state: st, budget: 0, targetRoas: target, horizon, money: st.money, model: st.model });
    const defBudget = Math.max(10, Math.round((probe.currentSpend || 0) / 10) * 10);
    const budget = Math.max(0, num(st.allocBudget, defBudget));
    if (!allocUI) {
      const bIn = el('input', { class: 'input num', type: 'number', inputmode: 'decimal', min: '0', step: '10', value: budget, 'aria-label': T('Daily budget, $') });
      bIn.addEventListener('change', () => setState({ allocBudget: String(Math.max(0, num(bIn.value, defBudget))) }));
      const tIn = el('input', { class: 'input num', type: 'number', inputmode: 'decimal', min: '0.1', max: '5', step: '0.1', value: target, 'aria-label': T('Target ROAS') });
      tIn.addEventListener('change', () => setState({ allocTarget: String(Math.max(0.1, num(tIn.value, 1))) }));
      const hSel = U.select([30, 60, 90, 180].map((d) => ({ id: String(d), label: 'D' + d })), String(horizon), (v) => setState({ allocHorizon: String(v) }), { label: T('Horizon') });
      const reset = el('button', { class: 'btn sm ghost', type: 'button', onClick: () => setState({ allocBudget: null, allocTarget: null, allocHorizon: null }) }, T('Current budget'));
      allocUI = { bIn, tIn, hSel, defBudget,
        form: el('div', { class: 'pd-form' }, el('label', { class: 'pd-field' }, el('span', {}, T('Daily budget, $')), bIn), el('label', { class: 'pd-field' }, el('span', {}, T('Target ROAS')), tIn), el('label', { class: 'pd-field' }, el('span', {}, T('pLTV horizon')), hSel.el), reset),
        out: el('div', { class: 'pd-out pd-out-4' }), host: el('div', { class: 'tbl-host' }),
        curveHost: el('div', { class: 'chart', style: { height: '240px', position: 'relative' } }), barHost: el('div', { class: 'chart', style: { height: '240px', position: 'relative' } }) };
      const charts = el('div', { class: 'grid c2 pd-alloc-charts' },
        el('div', { class: 'pd-sub' }, el('div', { class: 'pd-sub-t' }, T('Marginal pROAS by channel daily spend')), allocUI.curveHost),
        el('div', { class: 'pd-sub' }, el('div', { class: 'pd-sub-t' }, T('Daily spend: now vs recommended')), allocUI.barHost));
      U.clear(body).append(allocUI.form, allocUI.out, allocUI.host, charts, el('div', { class: 'pd-note' }, T('Channel response: trials = a · spend^b (b ∈ [0.45, 1]); budget goes in $5 steps to the channel with the highest marginal pROAS, capacity ≤ 2.5× current spend (Web2Web 1.5×) · channel filter not applied here, see «How it\'s computed»')));
    } else { allocUI.bIn.value = budget; allocUI.tIn.value = target; allocUI.hSel.set(String(horizon)); }
    const a = budget > 0 ? BB.predict.allocate({ data, state: st, budget, targetRoas: target, horizon, money: st.money, model: st.model }) : probe;
    const chs = a.channels;
    /* summary boxes */
    const box = (lbl, val, cmp, cls) => el('div', { class: 'box' }, el('div', { class: 'lbl' }, lbl), el('div', { class: 'val' + (cls ? ' ' + cls : '') }, val), cmp ? el('div', { class: 'cmp' }, cmp) : null);
    U.clear(allocUI.out).append(
      box(T('Budget / allocated'), `${money(a.allocated)}`, T('of {b} per day · now {c}/d', { b: money(a.budget), c: money(a.currentSpend) })),
      box(T('Blended pROAS D{n}', { n: a.horizon }), F.x(a.pRoasBlended), T('now {a} · target {b}', { a: F.x(a.currentRoas), b: F.x(a.targetRoas) }), a.pRoasBlended != null && a.pRoasBlended < a.targetRoas ? 'bad' : 'good'),
      box(T('Within target'), money(a.allocatedAtTarget), a.belowTarget ? T('{x}/d more already below target', { x: money(a.allocated - a.allocatedAtTarget) }) : T('whole budget pays back by marginal pROAS'), a.belowTarget ? 'warn' : 'good'),
      box(T('Unallocated'), money(a.unallocated), a.unallocated > 0 ? T('channels hit capacity (2.5× current)') : T('channel capacity sufficient')));
    if (!chs.length) { allocUI.tbl = null; U.emptyState(allocUI.host, T('Not enough data'), { sub: T('No paid channel spend in period') }); allocCurveChart = destroy(allocCurveChart); allocBarChart = destroy(allocBarChart); U.clear(allocUI.curveHost); U.clear(allocUI.barHost); allocCard.setCaption(T('no channels with spend')); return; }
    const rows = chs.map((c) => ({ key: c.channel, label: BB.lbl(c), _c: c, current: c.current, recommended: c.recommended, atTarget: c.recommendedAtTarget, delta: c.delta, trialsNow: c.currentTrials, trialsRec: c.expectedTrials, cptNow: c.currentCpt, cptRec: c.expectedCpt, ltv: c.ltvPerTrial, proas: c.pRoas == null ? null : { v: c.pRoas, tip: U.tipHtml({ title: `${BB.lbl(c)} · pROAS D${a.horizon}`, kv: [[T('pLTV / trial'), money(c.ltvPerTrial)], [T('80% pLTV interval'), `${money(c.ltvLo)} – ${money(c.ltvHi)}`], [T('Curve'), T('trials = {a} · spend^{b}', { a: c.a.toFixed(3), b: c.b.toFixed(2) })], [T('Capacity'), money(c.cap) + T('/d')]] }) }, marginal: c.marginalRoas, b: c.b, verdict: c.verdict || c.verdict_ru }));
    const columns = [
      { key: 'label', label: T('Channel'), sticky: true, text: true, width: 110, render: (r) => el('span', { class: 'row', style: { gap: 0 } }, el('i', { class: 'pd-sw', style: { background: r._c.color } }), el('span', {}, r.label)) },
      { key: 'current', label: T('Now, $/d'), fmt: moneyFmt() },
      { key: 'recommended', label: T('Recommended, $/d'), fmt: moneyFmt(), heatmap: 'accent', tip: T('Channel daily budget by greedy allocation') },
      { key: 'atTarget', label: T('of it within target'), fmt: moneyFmt(), tip: T('Part given while marginal pROAS ≥ target'), render: (r) => (r.atTarget > 0 ? money(r.atTarget) : '—') },
      { key: 'delta', label: T('Δ budget'), render: (r) => (r.delta == null ? '—' : el('span', { class: r.delta > 0.15 ? 'good' : r.delta < -0.15 ? 'bad' : '' }, (r.delta >= 0 ? '+' : '−') + Math.round(Math.abs(r.delta) * 100) + '%')), tip: T('recommended / now − 1') },
      { key: 'trialsNow', label: T('Trials/d now'), fmt: 'num' },
      { key: 'trialsRec', label: T('Trials/d expected'), fmt: 'num', tip: T('a · recommended^b') },
      { key: 'cptNow', label: T('CPT now'), fmt: money2Fmt() },
      { key: 'cptRec', label: T('CPT expected'), fmt: money2Fmt(), tip: T('At recommended budget (diminishing returns)') },
      { key: 'ltv', label: T('pLTV/trial D{n}', { n: a.horizon }), fmt: money2Fmt() },
      { key: 'proas', label: `pROAS D${a.horizon}`, fmt: 'x', heatmap: roasHeat, tip: T('Average channel pROAS at recommended budget') },
      { key: 'marginal', label: T('Marginal pROAS'), fmt: 'x', heatmap: roasHeat, tip: T('pROAS of the next $5 at recommended level') },
      { key: 'b', label: 'b', fmt: 'num', tip: T('Trial elasticity to spend (1 = linear, lower — saturation)') },
      { key: 'verdict', label: T('Recommendation'), text: true, align: 'left', width: 150, render: (r) => U.badge(r.verdict, r._c.trials < 30 ? null : headroomKind(r.delta)) },
    ];
    if (!allocUI.tbl) allocUI.tbl = U.table(allocUI.host, { columns, rows, sort: null, maxHeight: 300 }); else allocUI.tbl.update({ columns, rows });
    /* marginal pROAS curves */
    const maxX = Math.max(...chs.map((c) => c.cap), budget * 0.6, 10);
    const xs = []; for (let i = 0; i <= 40; i++) xs.push(5 + (maxX - 5) * i / 40);
    const curveSets = chs.map((c) => ({ label: BB.lbl(c), _legend: true, data: c.ltvPerTrial == null ? [] : xs.filter((x) => x <= c.cap * 1.05).map((x) => ({ x, y: c.a * c.b * Math.pow(x, c.b - 1) * c.ltvPerTrial })), borderColor: c.color, borderWidth: 1.5 }));
    chs.forEach((c) => { if (c.recommended > 0 && c.ltvPerTrial != null) curveSets.push({ label: BB.lbl(c) + ' · ' + T('recommended'), _pt: true, data: [{ x: c.recommended, y: c.a * c.b * Math.pow(c.recommended, c.b - 1) * c.ltvPerTrial }], borderColor: c.color, backgroundColor: c.color, showLine: false, pointRadius: 4, pointHoverRadius: 5 }); });
    curveSets.push({ label: T('target {t}', { t: F.x(target) }), _ref: true, data: [{ x: 0, y: target }, { x: maxX, y: target }], borderColor: REF_GRAY, borderDash: [6, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0, tension: 0 });
    allocCurveChart = destroy(allocCurveChart); U.clear(allocUI.curveHost); const c1 = el('canvas'); allocUI.curveHost.append(c1);
    const yMax = Math.min(6, Math.max(target * 1.5, ...curveSets.filter((s) => !s._ref).flatMap((s) => s.data.map((p) => p.y)).filter((y) => isFinite(y))) * 1.05);
    allocCurveChart = U.chart(c1, { type: 'line', data: { datasets: curveSets }, options: { parsing: false, interaction: { mode: 'nearest', intersect: false },
      scales: { x: { type: 'linear', min: 0, max: maxX, grid: { display: false }, ticks: { callback: (v) => '$' + Math.round(v), maxTicksLimit: 8 }, title: { display: true, text: T('channel spend, $/day') } }, y: { min: 0, max: yMax, ticks: { callback: (v) => v.toFixed(1) + 'x' } } },
      plugins: { legend: { labels: { filter: (item, d) => !!d.datasets[item.datasetIndex]._legend } }, tooltip: { filter: (it) => !it.dataset._ref, callbacks: { title: (items) => (items.length ? '$' + Math.round(items[0].parsed.x) + T('/day') : ''), label: (c) => ` ${c.dataset.label}: ${F.x(c.parsed.y)}` } } } } });
    /* current vs recommended bars */
    allocBarChart = destroy(allocBarChart); U.clear(allocUI.barHost); const c2 = el('canvas'); allocUI.barHost.append(c2);
    allocBarChart = U.chart(c2, { type: 'bar', data: { labels: chs.map((c) => BB.lbl(c)), datasets: [
      { label: T('Now'), data: chs.map((c) => c.current), backgroundColor: U.hexA(REF_GRAY, 0.55) },
      { label: T('Recommended · within target'), data: chs.map((c) => c.recommendedAtTarget), backgroundColor: chs.map((c) => U.hexA(c.color, 0.9)), stack: 'rec' },
      { label: T('Recommended · below target'), data: chs.map((c) => c.recommended - c.recommendedAtTarget), backgroundColor: chs.map((c) => U.hexA(c.color, 0.35)), stack: 'rec' },
    ] }, options: { scales: { x: { grid: { display: false }, stacked: true }, y: { min: 0, stacked: true, ticks: { callback: (v) => '$' + Math.round(v) } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}${T('/day')}` } } } } });
    allocCard.setCaption(`${BB.plural(chs.length, 'channel|channels')} · ${T('budget {b}/d', { b: money(budget) })} · ${T('target {t}', { t: F.x(target) })} · ${T('horizon D{n}', { n: a.horizon })} · ${st.money === 'net' ? 'Net' : 'Gross'} · ${T('history {n} d', { n: a.days })}`);
  }

  /* ───────── pMRR forward ───────── */
  let mrrUI = null, mrrDays = 90;
  function renderMrr(st, sc) {
    const body = mrrCard.body;
    if (!mrrUI) {
      mrrUI = { seg: U.segmented([{ id: '30', label: T('30 days') }, { id: '90', label: T('90 days') }], String(mrrDays), (v) => { mrrDays = +v; renderMrr(lastSt, lastSc); }, { label: T('Horizon') }), out: el('div', { class: 'pd-out pd-out-3' }), chartHost: el('div', { class: 'chart', style: { height: '240px', position: 'relative' } }) };
      mrrCard.actions.append(mrrUI.seg.el);
      mrrUI.view = U.viewToggle(mrrCard, () => mrrChart, { fmt: 'usd', xFmt: (x) => (x === 0 ? T('today') : '+' + x + T('d')), targets: () => [mrrUI.chartHost], maxHeight: 240 });
      body.append(mrrUI.out, mrrUI.chartHost, el('div', { class: 'pd-note' }, T('Day 0 — actual MRR (active and past-due subscriptions, week × 4.33); then segment sBG renewals, trial queue and new trials at the 14-day pace · band — 80% interval · scenarios apply')));
    }
    const series = BB.predict.mrrForward({ data, state: st, days: mrrDays, scenario: sc.active ? sc : null, model: st.model });
    const mrrModel = series[1] && series[1].model === 'arima' ? T('ARIMA (file)') : MODEL_LABEL(BB.predict.effectiveModel({ model: st.model }));
    const cur0 = series[0], last = series[series.length - 1], m30 = series[Math.min(30, series.length - 1)];
    const d = cur0.mrr ? last.mrr / cur0.mrr - 1 : null;
    const box = (lbl, val, small, cmp) => el('div', { class: 'box' }, el('div', { class: 'lbl' }, lbl), el('div', { class: 'val' }, val, small ? el('small', {}, small) : null), cmp ? el('div', { class: 'cmp' }, cmp) : null);
    U.clear(mrrUI.out).append(
      box(T('MRR now'), money(cur0.mrr), null, `${BB.plural(cur0.activeSubs, 'active subscription|active subscriptions', { fmt: F.num })} · ARR ${money(cur0.mrr * 12)}`),
      box(T('MRR in 30 days'), money(m30.mrr), `[${money(m30.mrrLo)} – ${money(m30.mrrHi)}]`, T('existing {a} · queue {b} · new {c}', { a: money(m30.fromExisting), b: money(m30.fromPending), c: money(m30.fromNew) })),
      box(T('MRR in {n} days', { n: mrrDays }), money(last.mrr), `[${money(last.mrrLo)} – ${money(last.mrrHi)}]`, d == null ? '' : el('span', { class: d > 0.0005 ? 'good' : d < -0.0005 ? 'bad' : 'dim' }, (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '→ ') + F.pct(Math.abs(d)) + ' ' + T('vs today'))));
    mrrChart = destroy(mrrChart); U.clear(mrrUI.chartHost); const canvas = el('canvas'); mrrUI.chartHost.append(canvas);
    const accent = U.palette(0); // MRR = slot 1 (blue); components keep their own fixed slots
    const pts = (k) => series.map((s) => ({ x: s.day, y: s[k] }));
    mrrChart = U.chart(canvas, { type: 'line', data: { datasets: [
      { label: T('MRR forecast'), _legend: true, data: pts('mrr'), borderColor: accent, borderWidth: 2 },
      { label: 'lo', _band: true, data: pts('mrrLo'), borderColor: 'transparent', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0 },
      { label: 'hi', _band: true, data: pts('mrrHi'), borderColor: 'transparent', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, fill: { target: 1 }, backgroundColor: U.hexA(accent, 0.14) },
      { label: T('existing subscriptions'), _legend: true, data: pts('fromExisting'), borderColor: U.palette(1), borderWidth: 1.2, borderDash: [4, 3] },
      { label: T('trial queue'), _legend: true, data: pts('fromPending'), borderColor: U.palette(2), borderWidth: 1.2, borderDash: [4, 3] },
      { label: T('new trials'), _legend: true, data: pts('fromNew'), borderColor: U.palette(3), borderWidth: 1.2, borderDash: [4, 3] },
    ] }, options: { parsing: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { type: 'linear', min: 0, max: mrrDays, grid: { display: false }, ticks: { callback: (v) => (v === 0 ? T('today') : '+' + v + T('d')), maxTicksLimit: 8 } }, y: { min: 0, ticks: { callback: (v) => '$' + Math.round(v) } } },
      plugins: { legend: { labels: { filter: (item, dd) => !!dd.datasets[item.datasetIndex]._legend } }, tooltip: { filter: (it) => !it.dataset._band, callbacks: { title: (items) => (items.length ? (items[0].parsed.x === 0 ? T('today (actual)') : T('+{n} days · {date}', { n: Math.round(items[0].parsed.x), date: series[Math.round(items[0].parsed.x)].date })) : ''), label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}` } } } } });
    mrrCard.setCaption(`${BB.plural(mrrDays, 'day|days')} · ${F.num(cur0.activeSubs)} → ${F.num(last.activeSubs)} ${BB.plural(last.activeSubs, 'subscription|subscriptions', { bare: true })} · ${mrrModel} · ${sc.active ? T('what-if scenario') : T('base')}`);
    mrrUI.view.refresh();
  }

  /* ───────── F. scenario sliders ───────── */
  let scenUI = null;
  function renderScenario(st, sc, total) {
    const body = scenCard.body;
    const fitAll = BB.predict.fit(data).segments.all || { refundRate: 0.03, disputeRate: 0.02 };
    const baseRefund = fitAll.refundRate * 100, baseDispute = fitAll.disputeRate * 100;
    const defs = [
      { id: 'scRebill', label: T('1st rebill, pp'), min: -15, max: 15, step: 1, def: 0, fmt: (v) => (v > 0 ? '+' : '') + v + ' ' + T('pp'), base: T('segment p₁') },
      { id: 'scChurn', label: T('Weekly churn, pp'), min: -15, max: 15, step: 1, def: 0, fmt: (v) => (v > 0 ? '+' : '') + v + ' ' + T('pp'), base: 'sBG r_k' },
      { id: 'scRefund', label: T('Refund rate (Net)'), min: 0, max: 15, step: 0.1, def: baseRefund, fmt: (v) => v.toFixed(1) + '%', base: T('actual {v}%', { v: baseRefund.toFixed(1) }) },
      { id: 'scDispute', label: T('Dispute rate (Net)'), min: 0, max: 6, step: 0.01, def: baseDispute, fmt: (v) => v.toFixed(2) + '%', base: T('actual {v}%', { v: baseDispute.toFixed(2) }) },
    ];
    if (!scenUI) {
      scenUI = { inputs: {}, vals: {} };
      const grid = el('div', { class: 'pd-sliders' });
      defs.forEach((d) => {
        const val = el('b'); const inp = el('input', { type: 'range', min: d.min, max: d.max, step: d.step, 'aria-label': d.label });
        const say = () => { val.textContent = d.fmt(+inp.value); inp.setAttribute('aria-valuetext', d.fmt(+inp.value)); };
        inp.addEventListener('input', () => { say(); liveScenario(); });
        inp.addEventListener('change', () => { const v = +inp.value; setState({ [d.id]: Math.abs(v - d.def) < d.step / 2 + 1e-9 ? null : String(v) }); });
        scenUI.inputs[d.id] = { inp, val, d };
        grid.append(el('div', { class: 'pd-slider' }, el('div', { class: 'hd' }, el('span', {}, d.label, el('span', { class: 'base' }, d.base)), val), inp, el('div', { class: 'scale' }, el('span', {}, d.fmt(d.min)), el('span', {}, d.fmt(d.max)))));
      });
      scenUI.out = el('div', { class: 'pd-out' });
      scenUI.reset = el('button', { class: 'btn sm ghost', type: 'button', onClick: () => setState({ scRebill: null, scChurn: null, scRefund: null, scDispute: null }) }, T('Reset'));
      scenCard.actions.append(scenUI.reset);
      body.append(grid, scenUI.out, el('div', { class: 'pd-note' }, T('Refunds and disputes affect Net revenue only · release the slider to apply the scenario to the whole page (saved in URL)')));
    }
    defs.forEach((d) => { const u = scenUI.inputs[d.id]; const v = st[d.id] != null && st[d.id] !== '' ? num(st[d.id], d.def) : d.def; u.inp.value = v; u.val.textContent = d.fmt(v); u.inp.setAttribute('aria-valuetext', d.fmt(v)); });
    scenUI.total = total; scenUI.st = st;
    liveScenario(true);
  }
  function liveScenario() {
    const st = scenUI.st, total = scenUI.total; if (!total) return;
    if (U.isThin(total.signups)) { U.emptyState(scenUI.out, T('Not enough data'), { sub: T('Slice under 30 users') }); scenCard.setCaption(T('slice too thin')); return; }
    const read = (id, def) => { const v = +scenUI.inputs[id].inp.value; return Math.abs(v - def) < +scenUI.inputs[id].inp.step / 2 + 1e-9 ? null : v; };
    const fitAll = BB.predict.fit(data).segments.all || { refundRate: 0.03, disputeRate: 0.02 };
    const sc = { firstRebillDelta: (read('scRebill', 0) || 0) / 100, churnDelta: (read('scChurn', 0) || 0) / 100, refundRate: read('scRefund', fitAll.refundRate * 100), disputeRate: read('scDispute', fitAll.disputeRate * 100) };
    if (sc.refundRate !== null) sc.refundRate /= 100; if (sc.disputeRate !== null) sc.disputeRate /= 100;
    const active = !!(sc.firstRebillDelta || sc.churnDelta || sc.refundRate !== null || sc.disputeRate !== null);
    U.clear(scenUI.out);
    [90, 180].forEach((N) => {
      const base = BB.predict.cohort(total, { offset: N, money: st.money, signalDay: sigOf(st), data, payer: st.payer });
      const what = active ? BB.predict.cohort(total, { offset: N, money: st.money, signalDay: sigOf(st), scenario: sc, data, payer: st.payer }) : base;
      const d = base.roas ? what.roas / base.roas - 1 : 0;
      scenUI.out.append(el('div', { class: 'box' }, el('div', { class: 'lbl' }, T('pROAS D{n} · scenario', { n: N })),
        el('div', { class: 'val' }, F.x(what.roas), el('small', {}, `[${F.x(what.roasLo)} – ${F.x(what.roasHi)}]`)),
        el('div', { class: 'cmp' }, `${T('base')} ${F.x(base.roas)} · `, el('span', { class: Math.abs(d) < 0.0005 ? 'dim' : d > 0 ? 'good' : 'bad' }, (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '→ ') + F.pct(Math.abs(d))))));
    });
    scenCard.setCaption(active ? T('scenario active · applied to whole page') : T('shifts apply to all forecasts'));
  }

  /* ───────── E. segment curves (plan × geo tier × channel) ───────── */
  let segUI = null;
  function renderSegments() {
    const mdl = lastSt ? lastSt.model : 'sbg', segs = BB.predict.segments(data, { model: mdl }), effId = segs.length ? segs[0].model : 'sbg';
    const plans = [...new Set(segs.map((s) => s.plan))];
    if (!segPlan || !plans.includes(segPlan)) segPlan = plans[0];
    const body = segCard.body;
    if (!segUI) {
      segUI = { seg: U.segmented(plans.map((p) => ({ id: p, label: p })), segPlan, (v) => { segPlan = v; renderSegments(); }, { label: T('Plan') }),
        mode: U.segmented([{ id: 'geo', label: T('by geo') }, { id: 'channel', label: T('by channel') }], segMode, (v) => { segMode = v; renderSegments(); }, { label: T('Split') }),
        chartHost: el('div', { class: 'chart', style: { height: '240px', position: 'relative' } }), list: el('div', { class: 'tbl-host pd-seg-list' }) };
      segCard.actions.append(segUI.mode.el, segUI.seg.el);
      body.append(segUI.chartHost, segUI.list);
    }
    segUI.seg.setOptions(plans.map((p) => ({ id: p, label: p })), segPlan);
    const ofPlan = segs.filter((s) => s.plan === segPlan);
    /* "by geo": plan aggregate + plan×tier rows; "by channel": plan aggregate + plan×tier×channel rows merged per channel (largest tier per channel shown) */
    let shown;
    if (segMode === 'geo') shown = ofPlan.filter((s) => s.channel === 'all').sort((a, b) => (a.geo_tier === 'all' ? -1 : b.geo_tier === 'all' ? 1 : b.n - a.n)).slice(0, 6);
    else {
      const agg = ofPlan.find((s) => s.geo_tier === 'all'), byCh = new Map();
      ofPlan.filter((s) => s.channel !== 'all').forEach((s) => { const prev = byCh.get(s.channel); if (!prev || s.n > prev.n) byCh.set(s.channel, s); });
      shown = (agg ? [agg] : []).concat([...byCh.values()].sort((a, b) => b.n - a.n)).slice(0, 6);
    }
    const nameOf = (s) => (s.geo_tier === 'all' ? T('all') : segMode === 'geo' ? s.geo_tier : `${chLabel(s.channel)} · ${s.geo_tier}`);
    const P = BB.PLAN_BY_ID[segPlan];
    const datasets = [];
    shown.forEach((s) => {
      const color = s.geo_tier === 'all' ? (U.cssVar('--fg-2') || '#d0d6e0') : segMode === 'channel' && s.channel !== 'all' && BB.CHANNEL_BY_ID[s.channel] ? U.channelColor(s.channel) : U.entityColor('seg:geo', s.geo_tier), name = nameOf(s); // colour follows the entity (channel slot / geo tier), aggregate = neutral ink
      datasets.push({ label: `${name}${s.curveFrom !== s.segment ? ' (' + T('curve: {s}', { s: fmtSegKey(s.curveFrom) }) + ')' : ''}`, _legend: true, data: s.points.map((p) => ({ x: p.day, y: p.fitted })), borderColor: color, borderWidth: s.geo_tier === 'all' ? 2.2 : 1.5, borderDash: s.curveFrom !== s.segment ? [4, 3] : undefined });
      const obs = s.points.filter((p) => p.observed != null);
      if (obs.length > 1) datasets.push({ label: `${name} · ${T('actual')}`, _obs: true, data: obs.map((p) => ({ x: p.day, y: p.observed, n: p.atRisk })), borderColor: color, backgroundColor: color, showLine: false, pointRadius: 3.5, pointHoverRadius: 5, pointStyle: 'circle' });
    });
    segChart = destroy(segChart);
    U.clear(segUI.chartHost); const canvas = el('canvas'); segUI.chartHost.append(canvas);
    const maxDay = P ? P.trialDays + (P.period === 'month' ? 11 : 25) * P.periodDays : 180;
    segChart = U.chart(canvas, { type: 'line', data: { datasets }, options: { parsing: false, interaction: { mode: 'nearest', intersect: false },
      scales: { x: { type: 'linear', min: 0, max: maxDay, grid: { display: false }, ticks: { callback: (v) => 'D' + v, maxTicksLimit: 8, autoSkipPadding: 14 } }, y: { min: 0, max: 1, ticks: { callback: (v) => Math.round(v * 100) + '%' } } },
      plugins: { legend: { labels: { filter: (item, d) => !!d.datasets[item.datasetIndex]._legend } }, tooltip: { callbacks: { title: (items) => (items.length ? `D${Math.round(items[0].parsed.x)} · ${T('renewal #{n}', { n: P ? Math.round((items[0].parsed.x - P.trialDays) / P.periodDays) + 1 : '?' })}` : ''), label: (c) => ` ${c.dataset.label}: ${F.pct(c.parsed.y)}${c.raw && c.raw.n ? ` (n=${c.raw.n})` : ''}` } } } } });
    const hasPrior = !!(BB.predict.MODEL_BY_ID[effId] && BB.predict.MODEL_BY_ID[effId].prior);
    const rows = shown.map((s) => ({ key: s.segment, label: nameOf(s), n: s.n, payers: s.payers, p1: s.p1, p1Txt: p1Txt(s), prior: s.priorShare, ab: fmtParams({ params: s.params }, effId), r2: s.points[1] ? s.points[1].fitted : null, src: s.fallback ? `↳ ${LEVEL_LBL[levelOf(s.fallback)]}` : T('own'), net: 1 - s.refundRate - s.disputeRate - s.feePct }));
    const columns = [
      { key: 'label', label: segMode === 'geo' ? T('Geo tier') : T('Channel · geo'), sticky: true, text: true, width: segMode === 'geo' ? 90 : 140 },
      { key: 'n', label: T('Trials'), fmt: 'int', tip: T('Trials completed by today') },
      { key: 'payers', label: T('Payers (1st rebill)'), fmt: 'int', tip: T('Users with a successful first rebill — model definition, independent of the «Payers» switch') },
      { key: 'p1', label: T('P(1st rebill)'), fmt: 'pct', heatmap: 'good', render: (r) => el('span', { class: 'pd-seg' }, el('span', {}, F.pct(r.p1)), r.p1Txt !== F.pct(r.p1) ? el('span', { class: 'pd-mfam' }, r.p1Txt) : null), tip: T('Trial-to-paid: recency-weighted rate (half-life p1hl, default 45 d) used by the forecast, and the all-time rate') },
      ...(hasPrior ? [{ key: 'prior', label: T('Prior share'), fmt: 'pct', width: 70, tip: T('m / (at risk + m): share of the segment curve that comes from the prior') }] : []),
      { key: 'r2', label: 'r₂', fmt: 'pct', tip: T('Probability of 2nd renewal after 1st ({m})', { m: MODEL_LABEL(effId) }) },
      { key: 'ab', label: PARAM_LABEL[effId] || T('Curve parameters'), text: true, align: 'left', sortable: false, render: (r) => el('span', { class: 'mono' }, r.ab), tip: T('Fitted retention curve parameters ({m}: {f}); P(1st rebill) and r₂ on the left are observed rates', { m: MODEL_LABEL(effId), f: BB.predict.MODEL_BY_ID[effId].family }) },
      { key: 'src', label: T('Parameter source'), text: true, align: 'left', tip: T('Own estimate or the level above the rates / curve come from (channel → plan×geo → plan → all)') },
      { key: 'net', label: T('Net mult.'), fmt: 'pct', tip: T('1 − refunds − disputes − fee') },
    ];
    if (!segUI.tbl) segUI.tbl = U.table(segUI.list, { columns, rows, sort: null }); else segUI.tbl.update({ columns, rows });
    const nCh = ofPlan.filter((s) => s.channel !== 'all').length;
    segCard.setCaption(`${P ? BB.lbl(P) : segPlan} · ${P ? (P.period === 'month' ? T('monthly renewals') : T('weekly renewals')) : ''} · ${MODEL_LABEL(effId)} · ${T('{n} plan segments ({c} with channel) · total {t}', { n: ofPlan.length, c: nCh, t: segs.length })}`);
  }

  /* ───────── «Model accuracy» (backtest, in-sample) ───────── */
  let btUI = null;
  function renderBacktest(st) {
    const body = btCard.body;
    if (!btUI) {
      btUI = { seg: U.segmented([{ id: '30', label: T('target D30') }, { id: '60', label: T('target D60') }], String(btTarget), (v) => { btTarget = +v; renderBacktest(lastSt); }, { label: T('Target day') }), kpi: el('div'), list: el('div', { class: 'tbl-host pd-seg-list' }), note: el('div', { class: 'pd-note' }) };
      btCard.actions.append(btUI.seg.el);
      body.append(btUI.kpi, btUI.list, btUI.note);
    }
    const bt3 = BB.predict.backtest({ data, state: st, signalDay: 3, targetDay: btTarget, model: st.model });
    const bt7 = BB.predict.backtest({ data, state: st, signalDay: 7, targetDay: btTarget, model: st.model });
    const bh3 = BB.predict.backtest({ data, state: st, signalDay: 3, targetDay: btTarget, model: st.model, holdout: true });
    const bh7 = BB.predict.backtest({ data, state: st, signalDay: 7, targetDay: btTarget, model: st.model, holdout: true });
    const mdlLabel = MODEL_LABEL(bt3.model);
    const holdWindowTxt = (bt) => (bt.empty ? T('Hold-out unavailable: less than 30 days of history before the test window.') : T('Parameters fitted as of {train} (users anchored earlier, events up to that date), test — cohorts {from} – {to} ({days} d), actual by today\'s events.', { train: dLabel(bt.trainUntil), from: dLabel(bt.testFrom), to: dLabel(bt.cutoff), days: bt.testDays }));
    const dLabel = (ts) => BB.bucketLabel(BB.util.isoDate(ts), 'day');
    btUI.note.textContent = ''; btUI.note.append(el('b', {}, 'Hold-out (out-of-sample): '), holdWindowTxt(bh3) + ' ', el('b', { class: 'warn' }, 'In-sample: '), T('parameters fitted on the whole history including the tested cohorts, so the error is optimistic · MAPE — mean absolute error, bias — signed mean (plus = overestimate) · period filter not applied, see «How it\'s computed»'));
    const mapeKind = (m) => (m == null ? null : m <= 0.15 ? 'good' : m <= 0.25 ? 'warn' : 'bad');
    const k = (bt, sig, hold) => ({ label: T('MAPE by D{n}', { n: sig }), group: hold ? 'hold-out' : 'in-sample', value: bt.overall.mape, fmt: 'pct', sub: bt.overall.n ? `bias ${bt.overall.bias >= 0 ? '+' : ''}${F.pct(bt.overall.bias)} · n=${bt.overall.n}${hold && bt.overall.coverage80 != null ? ` · ${T('cov.')} ${Math.round(bt.overall.coverage80 * 100)}%` : ''}` : T('no cohorts'), hint: hold ? T('{target} forecast error from signals to D{sig} ({m}). {win}{warn} Coverage — share of cohorts whose actual fell in the 80% interval', { target: dayLabel(btTarget), sig, m: mdlLabel, win: holdWindowTxt(bt), warn: bt.inSample ? ' ' + T('Note: model file trained on all data — in-sample for these cohorts.') : '' }) : T('{target} forecast error from signals to D{sig}; in-sample (model {m} saw these cohorts when fitting)', { target: dayLabel(btTarget), sig, m: mdlLabel }) });
    U.kpiRow(btUI.kpi, [k(bh3, 3, true), k(bh7, 7, true), k(bt3, 3, false), k(bt7, 7, false)], { cols: 4 });
    const segs = new Map();
    const put = (bt, mk, bk) => bt.perSegment.forEach((s) => { const r = segs.get(s.segment) || { key: s.segment, label: fmtSegKey(s.segment), n: s.n }; r[mk] = s.mape; r[bk] = s.bias; segs.set(s.segment, r); });
    put(bh3, 'mapeH3', 'biasH3'); put(bh7, 'mapeH7', 'biasH7'); put(bt3, 'mape3', 'bias3'); put(bt7, 'mape7', 'bias7');
    const rows = [...segs.values()].sort((a, b) => b.n - a.n);
    const total = { key: '__total', label: T('All segments'), n: bt3.overall.n, mapeH3: bh3.overall.mape, biasH3: bh3.overall.bias, mapeH7: bh7.overall.mape, biasH7: bh7.overall.bias, mape3: bt3.overall.mape, bias3: bt3.overall.bias, mape7: bt7.overall.mape, bias7: bt7.overall.bias };
    const mapeCell = (key, label, tip) => ({ key, label, fmt: 'pct', tip, render: (r) => (r[key] == null ? '—' : el('span', { class: mapeKind(r[key]) || '' }, F.pct(r[key]))) });
    const biasCell = (key, label) => ({ key, label, render: (r) => (r[key] == null ? '—' : (r[key] >= 0 ? '+' : '') + F.pct(r[key])) });
    const columns = [{ key: 'label', label: T('Segment'), sticky: true, text: true, width: 150 }, { key: 'n', label: T('Cohort count'), fmt: 'int' },
      mapeCell('mapeH3', 'Hold-out D3', holdWindowTxt(bh3)), biasCell('biasH3', 'Bias'), mapeCell('mapeH7', 'Hold-out D7', holdWindowTxt(bh7)), biasCell('biasH7', 'Bias'),
      mapeCell('mape3', 'In-sample D3', T('Parameters on whole history')), biasCell('bias3', 'Bias'), mapeCell('mape7', 'In-sample D7', T('Parameters on whole history')), biasCell('bias7', 'Bias')];
    if (!btUI.tbl) btUI.tbl = U.table(btUI.list, { columns, rows, total, sort: null, maxHeight: 300, emptyText: T('Not enough mature cohorts for backtest') }); else btUI.tbl.update({ columns, rows, total });
    btCard.setTitle(`${T('Model accuracy')} · ${mdlLabel}`);
    btCard.setCaption(`${T('hold-out and in-sample · {target} forecast from D3 / D7 vs actual · weekly cohorts ≥ 60 days', { target: dayLabel(btTarget) })} · ${st.money === 'net' ? 'Net' : 'Gross'}`);
  }

  /* ───────── «How it's computed» ───────── */
  function renderHowto(st) {
    const hb = BB.predict.backtest({ data, state: st, signalDay: 3, targetDay: 30, model: st.model, holdout: true }), dL = (ts) => BB.bucketLabel(BB.util.isoDate(ts), 'day');
    const howHold = hb.empty ? T('unavailable — less than 30 days of history before the test window.') : T('parameters (p₁, rates, retention curve) fitted as of {train}: only users anchored before it and events up to it (trial must end, renewal must occur 4 days before it); test cohorts anchored {from} – {to} ({days} d; default 90 days before «today − 60», window shrinks with less history), actual by today\'s events.', { train: dL(hb.trainUntil), from: dL(hb.testFrom), to: dL(hb.cutoff), days: hb.testDays });
    const fit = BB.predict.fit(data), keys = Object.keys(fit.segments), nSeg = keys.length, nCh = keys.filter((k) => k.split('|').length === 3).length, nFb = keys.filter((k) => fit.segments[k].fallback).length;
    const mdl = U.esc(MODEL_LABEL(st.model)), fam = U.esc(BB.predict.MODEL_BY_ID[st.model].family);
    const b = howCard.body; U.clear(b);
    b.innerHTML = `
      <h3>1. ${T('Segments')}</h3>
      <p>${T('Segment key — <code>plan × geo tier × channel</code> (T1 / T2 / LATAM / other; Facebook / Google / TikTok / Web2Web / Organic). With fewer than {min} completed trials (rates) or {min} renewals at risk (curve), parameters come from one level up: <code>plan × geo tier</code>, then <code>plan</code>, then <code>all</code>. The model now has {n} segments ({ch} with channel, {fb} on fallback). The «Model segment» column shows the row\'s dominant key and the source level.', { min: BB.MIN_USERS, n: nSeg, ch: nCh, fb: nFb })}</p>
      <h3>2. ${T('Retention curve (active model: {m})', { m: mdl })}</h3>
      <p>${T('Active model — <code>{m}</code> ({f}); switched in «Prediction models», stored in URL (<code>model=</code>). All models get the same per-segment «renewed / at risk» counts and return <code>r_k</code>; first-rebill rates, refunds, disputes and packs are shared. Base model — sBG, below.', { m: mdl, f: fam })}</p>
      <p>${T('From mature cohorts we count subscribers reaching the k-th renewal. Renewal probability follows shifted-beta-geometric: <code>r_k = (β + k − 1) / (α + β + k − 1)</code>; α and β by grid-search maximum likelihood on «renewed / at risk» counts. Thin data — geometric decay r ≈ 0.8. «Survival curves» shows the fitted curve and actual points by geo or channel.')}</p>
      <h3>3. ${T('Expected payer revenue')}</h3>
      <p>${T('To day N: <code>Σ price × P(alive at renewal k)</code> over renewals dated ≤ N (week or month per plan) plus mean add-on pack revenue. Net: × <code>1 − refund − dispute − fee</code> of the segment (or scenario values).')}</p>
      <h3>4. ${T('Cohort forecast')}</h3>
      <p>${T('Per user we take events up to the cut-off (today, or user-life D3/D7/D14 in «Signals up to» mode). Observed revenue — actual. Then: queued trials × <code>P(1st rebill)</code> adjusted for elapsed trial share and cancels; live subscribers × expected future renewals; failed first charges × retry recovery probability (24 h, up to 4 attempts). <code>pLTV(N) = observed + E[future]</code>, <code>pROAS = pLTV / spend</code>. A mature cell in «all» mode shows the actual in regular font.')}</p>
      <h3>5. ${T('Payers and the «Payers» switch')}</h3>
      <p>${T('Expected payers follow the active definition (<code>{def}</code>): observed payers + queued trials × P(rebill) + retries. «Pending rebills» = expected to D30 − observed at the same cut-off under the same definition. Revenue, ROAS and LTV ignore the switch.', { def: U.esc(BB.payerLabel(st)) })}</p>
      <h3>6. ${T('Uncertainty')}</h3>
      <p>${T('80% interval: binomial variance of each user\'s outcomes plus segment rate estimation error (<code>(1 − p)/(p·n)</code> and <code>1/atRisk</code>), <code>±1.28σ</code>; lower bound never below received revenue. Younger cohort and thinner segment — wider band.')}</p>
      <h3>7. ${T('Backtest: hold-out and in-sample')}</h3>
      <p><b>Hold-out (out-of-sample)</b>: ${U.esc(howHold)} ${T('D30/D60 forecast uses only D3 and D7 signals and is compared with actual: MAPE, bias and 80% coverage (share of cohorts whose actual fell in the interval; target ≈ 80%). An offline file without <code>train_cutoff</code> is trained on all data — its hold-out is marked in-sample until rebuilt with a cutoff. <b>In-sample</b>: same cohorts, parameters fitted on the whole history including them, so the estimate is optimistic — a check of calibration and curve shape. Backtest segments — plan × geo (no channel); period filter not applied (history needed), others are. Verdict «Pays back by DN» — first offset where pROAS ≥ target ROAS ({t}); «Not enough data» — fewer than 10 trials.', { t: F.x(num(st.targetRoas, 1)) })}</p>
      <h3>${T('Max CPT')}</h3>
      <p>${T('<code>max CPT = pLTV per trial at horizon / target ROAS × (1 − margin)</code>, <code>max CPI</code> — same per signup. Headroom &gt; +15% → «Raise budget», &lt; −15% → «Lower bid / pause», else «Hold». Breakdown — any dimension incl. channel and device class.')}</p>
      <h3>${T('Budget allocator')}</h3>
      <p>${T('Per paid channel, daily history fits <code>trials = a · spend^b</code> (log-log OLS, <code>b ∈ [0.45, 1]</code>, saturation); pLTV/trial at horizon — from the forecast model on the channel slice. Marginal pROAS of the next dollar = <code>a · b · spend^(b−1) · pLTV/trial</code>. Budget goes in $5 steps to the channel with the highest marginal pROAS (capacity ≤ 2.5× current spend, Web2Web 1.5×); the part given while marginal pROAS ≥ target is shown apart from the tail below target. Channel filter not applied (all channels needed), other filters are.')}</p>
      <h3>${T('MRR forecast')}</h3>
      <p>${T('Day 0 — actual MRR of the slice: active and past_due subscriptions, normalised to a month (week × 4.33). Live subscriptions survive to each next renewal with their segment\'s <code>r_k</code> (past_due weighted 0.35), queued trials convert with <code>P(1st rebill)</code>, new trials arrive at the last-14-day pace and convert by the «all» segment. 80% interval — binomial variance over subscriptions.')}</p>`;
  }

  /* ───────── boot ───────── */
  BB.state.onChange(() => render());
  render();
  BB.predict.offline.fetchAll(data).then((st) => { const loaded = Object.values(st).filter((r) => r.status === 'ok' || r.status === 'stale').length; if (loaded || readState().model !== 'sbg') render(); }); // offline model files (models/*.json) → re-render once known
  U.onTheme(() => render()); // theme-stepped palette → rebuild charts and swatches
});
