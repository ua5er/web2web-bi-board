/* Board 4 — User Flow (flow.html). Uses BB (core.js) + BB.ui (ui.js). */
BB.ui.boot(function () { // renders once BB.ready() resolves (data pointer: ?data= · window.BB_DATA_URL · data-src · ./data/demo.json)
  'use strict';
  const U = BB.ui, el = U.el, F = BB.fmt, T = BB.t;
  const isNum = (x) => typeof x === 'number' && isFinite(x);
  const ratio = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b : null);
  const rel = (cur, prev) => (isNum(cur) && isNum(prev) && prev > 0 ? cur / prev - 1 : null);
  const hhmm = (ts) => { const d = new Date(ts); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const DAY = 864e5, HOUR = 36e5;
  const MODES = [{ id: 'users', label: T('Users') }, { id: 'trials', label: T('Trials') }, { id: 'payers', label: T('Payers') }];
  const VIEWS = [{ id: 'graph', label: T('Graph') }, { id: 'table', label: T('Table') }];
  const LANE_OPTS = [{ id: '', label: T('None') }, { id: 'channel', label: T('Channel') }, { id: 'device_class', label: T('Device') }, { id: 'market', label: T('Market') }];
  const BD_DIMS = ['country', 'channel', 'campaign', 'creative', 'device_class', 'paywall', 'plan', 'psp', 'payment_method', 'landing_variant', 'price_test'].map((id) => ({ id, label: BB.DIM_BY_ID[id] ? BB.lbl(BB.DIM_BY_ID[id]) : id }));
  const STEP_LBL = { hour: T('hourly'), day: T('daily'), week: T('weekly'), month: T('monthly') };
  const DIMS = BB.DIMENSIONS.map((d) => ({ id: d.id, label: BB.lbl(d) }));
  const dimLabel = (id) => (BB.DIM_BY_ID[id] ? BB.lbl(BB.DIM_BY_ID[id]) : id);
  const CH_TAG = { facebook: 'FB', google: 'GO', tiktok: 'TT', web2web: 'WW', organic: 'OR' };
  const chLabel = (id) => (BB.CHANNEL_BY_ID[id] ? BB.lbl(BB.CHANNEL_BY_ID[id]) : id);
  const PW_TAG = new Proxy({}, { get: (o, id) => { const w = BB.PAYWALLS.find((x) => x.id === id); return w && w.variant ? w.variant : undefined; } }); // A/B tag of a paywall id from the catalogue (paywalls[].variant)
  const NONE = BB.dimValue({}, 'country'); // engine sentinel for a missing dimension value (localised by core.js)
  /* page-side short names for the engine's flow nodes (engine labels are already localised by core.js) */
  const nodeLbl = (n) => n; // node labels come localised from core.js (BB.graph)
  const SRC = () => (data.meta.source === 'demo' ? T('Demo data') : BB.lbl(data.meta));

  /* ───────── data ───────── */
  let data = BB.load();
  /* Page defaults when opened without a hash: 7 days by day — with 'Today' the payment stages are all 0 (no rebill can exist yet). */
  if (!location.hash.replace('#', '')) BB.state.write({ preset: '7d', step: 'day' });
  let st = BB.state.read('flow');
  /* v1 hash key `view=table` now belongs to saved views (kit) → page uses `vw` */
  if (st.view === 'table') { BB.state.write({ view: null, vw: 'table' }); st = BB.state.read('flow'); }
  const live = new Set(['1', 'true', 'on']);
  const isOn = (v) => live.has(String(v));
  let filterDims = null, EXPS = [];
  function buildFilterDims() {
    const counts = {};
    DIMS.forEach((d) => (counts[d.id] = new Map()));
    data.users.forEach((u) => DIMS.forEach((d) => { const v = BB.dimValue(u, d.id); const m = counts[d.id]; m.set(v, (m.get(v) || 0) + 1); }));
    filterDims = DIMS.map((d) => ({ id: d.id, label: d.label, values: [...counts[d.id].entries()].sort((a, b) => b[1] - a[1]).map(([v, count]) => ({ v, label: v, count })) }));
    /* live experiments = user dimensions with ≥ 2 variants in the data */
    const live2 = (dim) => [...counts[dim].keys()].filter((v) => v !== NONE).length >= 2;
    EXPS = [{ id: 'onboarding', label: T('Onboarding'), dim: 'onboarding' }, { id: 'paywall', label: T('Paywall'), dim: 'paywall' }, { id: 'landing_variant', label: T('Landing'), dim: 'landing_variant' }, { id: 'price_test', label: T('Price'), dim: 'price_test' }].filter((e) => counts[e.dim] && live2(e.dim));
    if (!EXPS.length) EXPS = [{ id: 'onboarding', label: T('Onboarding'), dim: 'onboarding' }];
  }
  buildFilterDims();
  const curExp = () => EXPS.find((e) => e.id === (st.exp || 'onboarding')) || EXPS[0];

  /* step used for charts/sparklines: fall back when the range would produce too many buckets */
  function chartStep(range) {
    const span = range.to - range.from, order = ['hour', 'day', 'week', 'month'];
    let s = st.step;
    while (span / ({ hour: HOUR, day: DAY, week: 7 * DAY, month: 30 * DAY })[s] > 400 && order.indexOf(s) < 3) s = order[order.indexOf(s) + 1];
    return s;
  }
  const money = () => st.money || 'gross';
  const payerMode = () => (st.payer === 'sub' ? 'sub' : 'any');
  const payerShort = () => (payerMode() === 'sub' ? T('subscription') : T('any payment'));
  /* currency: USD or the dominant local currency of the slice (BB.localCurrency) */
  let cur = { code: 'USD', symbol: '$', rate: 1 };
  const useLocal = () => st.currency === 'local' && cur.code !== 'USD';
  const fmtM = (v) => (useLocal() ? F.money(v, cur) : F.usd(v));
  const fmtM2 = (v) => (useLocal() ? F.money(v, cur) : F.usd2(v));
  const curCode = () => (useLocal() ? cur.code : 'USD');

  /* ───────── forecast on flow nodes ─────────
     A node's user set (n.set = facts with x.u) is wrapped into a pseudo-row {_users, signups, trials, spend, basis, byOffset: {}} and fed to BB.predict.cohort at the global
     horizon ltvH: with byOffset empty the engine takes the per-user branch (observed + expected future per user), i.e. "pLTV D{H} of this node's users". Hash `pred=0` turns the
     pill forecast off (pills then show LTV to date again). Cached per render: key = lane | node | ltvH | model | money. */
  const predOn = () => st.pred !== '0';
  const H = () => U.ltvHorizon(st);
  const Z80 = 1.2816;
  const predCache = new Map();
  const nodeRow = (users, spend, key) => ({ key, label: key, _users: users, signups: users.length, trials: users.reduce((s, u) => s + (u._trial ? 1 : 0), 0), spend: isNum(spend) ? spend : 0, basis: model ? model.f.basis : (st.basis || 'signup'), byOffset: {}, money: money() });
  function predictUsers(users, spend, key) {
    const h = H(), k = [key, h, st.model || 'sbg', money()].join('|');
    let p = predCache.get(k);
    if (!p) {
      const row = nodeRow(users, spend, key), q = BB.predict.cohort(row, { offset: h, money: money(), data, model: st.model, signalDay: 'all' });
      const now = data.now, basis = row.basis;
      const youngest = users.reduce((m, u) => { const a = BB.anchorOf(u, basis); return a === null ? m : Math.min(m, now - a); }, Infinity);
      const per = (v, d) => ratio(v, d), sp = row.spend > 0 ? row.spend : null;
      p = { mid: q.mid, lo: q.lo, hi: q.hi, observed: q.observed, users: users.length, trials: row.trials, spend: sp, horizon: h, model: q.model, priorShare: q.priorShare || 0, pending: q.pendingUsers || 0,
        perUser: per(q.mid, users.length), perUserLo: per(q.lo, users.length), perUserHi: per(q.hi, users.length), perTrial: per(q.mid, row.trials), perTrialLo: per(q.lo, row.trials), perTrialHi: per(q.hi, row.trials),
        roas: per(q.mid, sp), roasLo: per(q.lo, sp), roasHi: per(q.hi, sp), observedShare: q.mid > 0 ? Math.min(1, q.observed / q.mid) : null, predicted: youngest < h * DAY };
      predCache.set(k, p);
    }
    return p;
  }
  const spendOf = (n) => (n.stage === 'source' ? n.spend : isNum(n.roas) && n.roas > 0 && isNum(n.rev) ? n.rev / n.roas : null); // non-source nodes carry ROAS only for a single-campaign slice (rev / total spend)
  const nodePred = (n, laneKey) => (n.set && n.set.length ? predictUsers(n.set.map((x) => x.u), spendOf(n), (laneKey || '') + '|' + n.id) : null);
  /* Plan mix of a paywall node: share of trials per plan (its plan sub-nodes) and the expected pLTV per trial of the mix = Σ share_plan × pLTV_plan (§4).
     pLTV_plan: the plan sub-node's users under the active model (observed + future per trial); with a plan-mix model (vlad_v2) the plan values come from BB.predict.planMix (expected value of a new trial of that plan). */
  let planMixV2 = null; // BB.predict.planMix result of the board's slice (vlad_v2 only), per render
  function paywallMix(pw, nodes, laneKey) {
    const plans = nodes.filter((x) => x.sub && x.parent === pw.id && x.users > 0 && x.id.startsWith('plan:')); if (!plans.length) return null;
    const tot = plans.reduce((s, x) => s + x.users, 0);
    const mdl = BB.predict.MODEL_BY_ID[BB.predict.modelOf({ model: st.model })];
    if (mdl && mdl.planMix && !planMixV2) planMixV2 = BB.predict.planMix({ data, state: Object.assign({}, st, { groupBy: null }), dim: 'paywall', horizon: H(), model: st.model });
    const mix = plans.map((x) => { const plan = x.id.slice(5), p = nodePred(x, laneKey), v = planMixV2 && planMixV2.plans[plan] != null ? planMixV2.plans[plan] : p ? p.perTrial : null; return { plan, trials: x.users, share: x.users / tot, ltvPerTrial: v, lo: p ? p.perTrialLo : null, hi: p ? p.perTrialHi : null }; }).sort((a, b) => b.trials - a.trials);
    const plansV = {}; mix.forEach((m) => { plansV[m.plan] = m.ltvPerTrial; });
    const expected = BB.predict.mixLtv({ plans: plansV }, mix);
    const sumW = (f) => { let v = 0, w = 0; mix.forEach((m) => { const x = f(m); if (x != null) { v += m.share * x; w += m.share; } }); return w > 0 ? v / w : null; };
    return { mix, expected, lo: planMixV2 ? null : sumW((m) => m.lo), hi: planMixV2 ? null : sumW((m) => m.hi), trials: tot, v2: !!planMixV2, horizon: H() };
  }
  /* P(variant beats every other) on pLTV per user from the 80 % intervals (normal approximation: sd = (hi − mid) / z₈₀; product over the other variants) */
  const Phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), pr = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z >= 0 ? 1 - pr : pr; };
  function pBetterNormal(ps) {
    if (ps.length < 2) return ps.map(() => null);
    const sd = (q) => Math.max(1e-9, (q.perUserHi - q.perUser) / Z80);
    return ps.map((p, i) => { if (!p || p.perUser == null) return null; let pr = 1; ps.forEach((q, j) => { if (j === i || !q || q.perUser == null) return; pr *= Phi((p.perUser - q.perUser) / Math.sqrt(sd(p) ** 2 + sd(q) ** 2)); }); return pr; });
  }

  /* ───────── compute ───────── */
  let model = null;
  function compute() {
    const t0 = performance.now();
    predCache.clear(); planMixV2 = null;
    cur = BB.localCurrency(data, st);
    const f = BB.filter(data, st);
    const g = BB.flow({ data: f, state: st, mode: st.mode, baseNode: st.base || null });
    g.nodes.forEach(nodeLbl); (g.lanes || []).forEach((l) => l.graph.nodes.forEach(nodeLbl));
    /* KPI strip always describes the whole funnel (users mode); the mode toggle only re-scopes the canvas */
    const gk = st.mode === 'users' ? g : BB.flow({ data: f, state: Object.assign({}, st, { compare: 'none', groupBy: null }), mode: 'users' });
    let prev = null, prevK = null, co = null;
    if ((st.compare || 'prev') !== 'none' && BB.state.compareOf) {
      co = BB.state.compareOf(st, f.range);
      if (co) {
        const pst = Object.assign({}, co.state, { compare: 'none', groupBy: null });
        const pf = BB.filter(data, pst); pf.range = co.range;
        pf.users = pf.users.filter((u) => { const a = BB.anchorOf(u, pf.basis); return a >= co.range.from && a <= co.range.to; });
        prev = BB.flow({ data: pf, state: pst, mode: st.mode, baseNode: null });
        prevK = st.mode === 'users' ? prev : BB.flow({ data: pf, state: pst, mode: 'users', baseNode: null });
        g.compareRange = co.range;
        /* node trends follow the selected compare (prev period or the same cohort of another channel) */
        g.nodes.forEach((n) => { const p = prev.nodeById[n.id]; n.trend = p && p.users > 0 ? n.users / p.users - 1 : null; n.prevUsers = p ? p.users : 0; });
      }
    }
    const step = chartStep(f.range);
    const ts = BB.timeseries({ data, state: st, step });
    const ab = BB.abTests({ data: f, state: st });
    const thin = U.isThin(f.users.length);
    model = { f, g, gk, prev, prevK, co, ts, step, ab, thin, ms: performance.now() - t0 };
    return model;
  }

  /* adapt BB.flow graph → BB.ui.flowGraph graph: no empty nodes, base-relative rates, loss nodes drawn at the bottom of the column
     their sources point to (saves the separate 'loss' column), optional plan / PSP sub-pills laid out as small pills under their parent column */
  const LOSS_COL = { loss_drop: 'payment', loss_card: 'payment', loss_refund: 'outcome', loss_dispute: 'outcome', loss_checkout: 'trial' };
  const UI_STAGES = BB.FLOW_STAGES.filter((s) => s.id !== 'loss');
  const subsOn = () => isOn(st.subs);
  /* pill forecast line (pred on): "pLTV $x" per user of the node (per trial on plan sub-pills), "· pROAS x" where the node has spend, "· /trial $y" on paywall pills; italic when any user is younger than ltvH */
  function pillPred(x, n, nodes, laneKey) {
    if (!predOn()) return;
    const p = nodePred(n, laneKey); if (!p) return;
    x._pred = p;
    const isPlan = n.sub && n.id.startsWith('plan:'), isPw = n.id.startsWith('pw:');
    if (isPw) x._mix = paywallMix(n, nodes, laneKey);
    const bits = [isPlan ? `pLTV/trial ${fmtM2(p.perTrial)}` : `pLTV ${fmtM2(p.perUser)}`, isPw && isNum(p.perTrial) ? `/trial ${fmtM2(p.perTrial)}` : isNum(p.roas) ? `pROAS ${F.x(p.roas)}` : null].filter(Boolean);
    x.pillSub = bits.join(' · '); x.pillPredicted = p.predicted;
  }
  function uiNodes(nodes, byId, laneKey) {
    const out = [];
    nodes.forEach((n) => {
      if (!(n.users > 0)) return;
      if (n.sub) {
        if (!subsOn()) return;
        const par = byId[n.parent];
        const x = Object.assign({}, n, { loss: true, isSub: true, pctOfStage: par && par.users ? n.users / par.users : n.pctOfStage, variantTag: null });
        pillPred(x, n, nodes, laneKey);
        out.push(x);
        return;
      }
      const x = Object.assign({}, n, { stage: LOSS_COL[n.id] || n.stage, pctOfStage: isNum(n.pctOfBase) ? n.pctOfBase : n.loss ? n.pctOfEntry : n.pctOfStage });
      if (n.stage === 'source' && n.channel) x.variantTag = CH_TAG[n.channel] || null;
      pillPred(x, n, nodes, laneKey);
      out.push(x);
    });
    return out;
  }
  function uiEdges(graph, base) {
    const B = base && graph.nodeById[base];
    if (!B || !B.users) return graph.edges;
    const down = new Set([base]); let grew = true;
    while (grew) { grew = false; graph.edges.forEach((e) => { if (down.has(e.from) && !down.has(e.to)) { down.add(e.to); grew = true; } }); }
    return graph.edges.map((e) => (down.has(e.from) ? Object.assign({}, e, { rate: Math.min(1, e.users / B.users), baseRel: true }) : e));
  }
  function toUiGraph(g) {
    const out = { stages: UI_STAGES, nodes: uiNodes(g.nodes, g.nodeById), edges: uiEdges(g, g.baseNode) };
    if (g.lanes && g.lanes.length) out.lanes = g.lanes.map((l) => ({ key: l.key, label: `${dimLabel(g.lanesDim)}: ${l.label} · ${BB.plural(l.users, 'user|users', { fmt: F.int })}`, nodes: uiNodes(l.graph.nodes, l.graph.nodeById, String(l.key)), edges: uiEdges(l.graph, l.graph.baseNode) }));
    return out;
  }

  /* ───────── shell + toolbar ───────── */
  const sh = U.shell('flow', { title: T('User flow'), subtitle: '…', sourceBadge: BB.lbl(data.meta), live: isOn(st.auto) });
  const updatedEl = el('span', { class: 'row caption', style: { gap: '6px' } }, el('span', { class: 'live-dot' + (isOn(st.auto) ? '' : ' off') }), el('span', { class: 'upd-txt mono' }, ''));
  const autoTg = U.toggle(T('Auto-refresh · 60 s'), isOn(st.auto), (v) => BB.state.write({ auto: v ? '1' : null }));
  const allocBadge = U.badge(T('≈ Allocated spend'), null, { title: T('Filters without ad-account spend (paywall, plan, device, PSP…): spend split by signups') });
  const mdlBadges = U.modelBadges({ link: true }); // "model: …" + prior / pm / p1hl levers (hash)
  sh.headActions.append(mdlBadges.el, updatedEl, autoTg.el, allocBadge);
  U.applyTitle(T('User flow'));

  const tbCfg = () => ({
    range: { preset: st.preset, from: st.from || '', to: st.to || '', max: BB.util.isoDate(data.now) },
    step: { options: ['hour', 'day', 'week', 'month'], value: st.step },
    channel: { value: st.channel || 'all' }, device: { value: st.device || 'all' },
    money: { value: money() }, payer: { value: payerMode() },
    currency: { value: st.currency || 'usd', localLabel: (() => { const c = BB.localCurrency(data, Object.assign({}, st, { currency: 'local' })); return c && c.code !== 'USD' ? c.code : undefined; })() },
    compare: { value: st.compare || 'prev', channels: true },
    views: { page: 'flow', value: st.view || null },
    groupBy: { dims: DIMS, value: st.groupBy }, filters: { dims: filterDims, value: st.filters || {} },
    csv: () => { U.downloadCsv('flow.csv', flowCsv()); U.toast(T('CSV exported'), 'good'); },
  });
  const tb = U.toolbar(tbCfg(), (patch) => {
    if (patch.range) { BB.state.write({ preset: patch.range.preset, from: patch.range.preset === 'custom' ? patch.range.from : null, to: patch.range.preset === 'custom' ? patch.range.to : null }); return; }
    BB.state.write(patch);
  });
  sh.toolbarSlot.append(tb.el);

  /* bucket counts of user facts by signup time (sparklines / panel charts) */
  const bucketCount = (facts, step, keys) => { const m = Object.fromEntries(keys.map((k) => [k, 0])); facts.forEach((x) => { const k = BB.bucket(x.u.signup_ts, step); if (k in m) m[k]++; }); return keys.map((k) => m[k]); };
  const setOf = (g, id) => ((g.nodeById[id] || {}).set) || [];

  /* ───────── KPI strip ───────── */
  const kpiHost = el('div'); sh.main.append(kpiHost);
  function renderKpis() {
    const { gk, prevK, ts, co } = model, k = gk.kpis, p = prevK ? prevK.kpis : {};
    const b = ts.buckets, rev = (x) => (money() === 'net' ? x.rev_net : x.rev_gross);
    const sp = (fn) => (b.length > 1 ? b.map(fn).map((v) => (isNum(v) ? v : 0)) : null);
    const keys = b.map((x) => x.key), chk = bucketCount(setOf(gk, 'checkout'), model.step, keys), chkErr = bucketCount(setOf(gk, 'loss_checkout'), model.step, keys), tr = bucketCount(setOf(gk, 'trial'), model.step, keys);
    const spArr = (arr) => (b.length > 1 ? arr : null);
    const dl = !prevK ? T('no compare') : co && co.kind === 'channel' ? T('vs channel {ch}', { ch: chLabel(co.channel) }) : T('vs previous period');
    /* compare rule: no compare → no delta; compare window incomplete (coverage < 60 %) → '—'; else BB.fmt.rel */
    const rel = (a, b) => (!prevK ? null : co && co.valid === false ? 'na' : BB.fmt.rel(a, b));
    const pl = BB.payerLabel(st);
    const cards = [
      { label: T('Entry'), value: k.entry, fmt: 'int', delta: rel(k.entry, p.entry), dir: 1, spark: sp((x) => x.landing_views), hint: T('Landing views from paid channels; organic = signups') },
      { label: T('Signups'), value: k.signups, fmt: 'int', delta: rel(k.signups, p.signups), dir: 1, spark: sp((x) => x.signups), hint: T('Signups (= web installs)') },
      { label: T('Signup → Trial'), value: k.signupToTrial, fmt: 'pct', delta: rel(k.signupToTrial, p.signupToTrial), dir: 1, spark: sp((x) => ratio(x.trials, x.signups)), hint: T('trials / signups') },
      { label: T('Checkouts'), value: k.checkouts, fmt: 'int', delta: rel(k.checkouts, p.checkouts), dir: 1, spark: spArr(chk), hint: T('Opened checkout after the paywall') },
      { label: T('Checkout → Trial'), value: k.checkoutToTrial, fmt: 'pct', delta: rel(k.checkoutToTrial, p.checkoutToTrial), dir: 1, spark: spArr(keys.map((_, i) => ratio(tr[i], chk[i]) || 0)), hint: T('trials / checkouts started') },
      { label: T('Checkout error rate'), value: k.checkoutErrorRate, fmt: 'pct', delta: rel(k.checkoutErrorRate, p.checkoutErrorRate), dir: -1, spark: spArr(keys.map((_, i) => ratio(chkErr[i], chk[i]) || 0)), hint: T('checkout errors / checkouts started — PSP declined the intro payment, no trial') },
      { label: T('Trial-to-paid'), value: k.trialToPay, fmt: 'pct', delta: rel(k.trialToPay, p.trialToPay), dir: 1, spark: sp((x) => ratio(x.payers_d0, x.trials)), hint: T('payers / trials · payer = {pl}', { pl }) },
      { label: T('Entry → Paid'), value: k.entryToPay, fmt: 'pct', delta: rel(k.entryToPay, p.entryToPay), dir: 1, spark: sp((x) => ratio(x.payers_d0, x.landing_views)), hint: T('payers / landing views · payer = {pl}', { pl }), group: T('end-to-end') },
      { label: T('Payers'), value: k.payers, fmt: 'int', delta: rel(k.payers, p.payers), dir: 1, spark: sp((x) => x.payers_d0), hint: T('Payer definition: {pl}', { pl }), group: payerShort() },
      { label: `${T('LTV per entry')} · ${curCode()}`, value: fmtM2(k.ltvPerEntry), delta: rel(k.ltvPerEntry, p.ltvPerEntry), dir: 1, spark: sp((x) => ratio(rev(x), x.landing_views)), hint: T('Revenue ({money}) to date / landing views', { money: money() }) },
      { label: T('ROAS to date'), value: k.roas, fmt: 'x', delta: rel(k.roas, p.roas), dir: 1, spark: sp((x) => ratio(rev(x), x.spend)), hint: T('Revenue ({money}) to date / period spend', { money: money() }) },
    ];
    cards.forEach((c) => { c.deltaLabel = dl; c.basis = dl; });
    /* global "LTV D{ltvH} / trial" tile on the board's slice (same filters, range and channel as the funnel) */
    const cst = (s2) => Object.assign({}, s2, { step: 'day', groupBy: null, compare: 'none' });
    const H = U.ltvHorizon(st), ltvTot = BB.cohorts({ data, state: cst(st), offsets: [H] }).total, ltvCmp = co && co.state ? BB.cohorts({ data, state: cst(co.state), offsets: [H] }).total : null;
    const sliceKey = (r, ch) => [BB.util.isoDate(r.from), BB.util.isoDate(r.to), st.channel || 'all', st.device || 'all', JSON.stringify(BB.effFilters(st)), ch || ''].join('|');
    cards.splice(5, 0, U.ltvKpi({ data, total: ltvTot, st, sliceKey: sliceKey(model.f.range), cmpTotal: ltvCmp, cmpKey: co ? sliceKey(co.range, co.channel) : null, cmpValid: co ? co.valid : null, deltaLabel: dl, cur: cur && cur.code !== 'USD' ? cur : null }));
    U.kpiRow(kpiHost, cards, { cols: 6 });
  }

  /* ───────── flow canvas ───────── */
  const modeSeg = U.segmented(MODES, st.mode, (v) => BB.state.write({ mode: v }), { label: T('Mode') });
  const viewSeg = U.segmented(VIEWS, st.vw === 'table' ? 'table' : 'graph', (v) => BB.state.write({ vw: v === 'graph' ? null : v }), { label: T('View') });
  const laneOpts = () => LANE_OPTS.concat(st.groupBy && !LANE_OPTS.some((o) => o.id === st.groupBy) ? [{ id: st.groupBy, label: dimLabel(st.groupBy) }] : []);
  const laneSeg = U.segmented(laneOpts(), st.groupBy || '', (v) => BB.state.write({ groupBy: v || null }), { label: T('Lanes') });
  const subsTg = U.toggle(T('Sub-nodes'), subsOn(), (v) => BB.state.write({ subs: v ? '1' : null }));
  subsTg.el.title = T('Small nodes: plans under the paywall, PSP / method under payment');
  const predTg = U.toggle(T('pLTV on pills'), predOn(), (v) => BB.state.write({ pred: v ? null : '0' }));
  predTg.el.title = T('Pills show the forecast revenue to D{h} per user of the node (hash ltvH; pred=0 switches back to revenue to date)', { h: H() });
  const nodesBadge = U.badge('', null, { mono: true });
  const baseChipHost = el('span', { class: 'row' });
  const flowCard = U.card(sh.main, { title: T('Funnel map'), caption: '', actions: [baseChipHost, nodesBadge, laneSeg.el, subsTg.el, predTg.el, modeSeg.el, viewSeg.el], body: { flush: true, node: el('div') } });
  const flowHost = flowCard.body.firstChild; flowHost.classList.add('flow-canvas-host');
  const chanHost = el('div', { class: 'row flow-channels', style: { flexWrap: 'wrap', gap: '6px', padding: '8px 12px', borderBottom: '1px solid var(--line)' } });
  const graphHost = el('div'), tableHost = el('div');
  flowHost.append(chanHost, graphHost, tableHost);
  let fg = null, flowTbl = null;

  const nodeTip = (n) => {
    const kv = [[T('Users'), F.int(n.users)], [n.isSub ? T('% of parent') : T('% of column'), F.pct(n.pctOfStage)], [T('% of entry'), F.pct(n.pctOfEntry)]];
    if (isNum(n.pctOfBase)) kv.push([T('% of base'), F.pct(n.pctOfBase)]);
    if (n._pred) {
      const p = n._pred, h = p.horizon, iv = (lo, hi) => (p.predicted ? ` [${fmtM2(lo)} – ${fmtM2(hi)}]` : '');
      kv.push([`pLTV D${h} / ${T('user')}`, fmtM2(p.perUser) + iv(p.perUserLo, p.perUserHi)]);
      if (p.trials) kv.push([`pLTV D${h} / ${T('trial')}`, fmtM2(p.perTrial) + iv(p.perTrialLo, p.perTrialHi)]);
      if (isNum(p.roas)) kv.push([`pROAS D${h}`, F.x(p.roas) + (p.predicted ? ` [${F.x(p.roasLo)} – ${F.x(p.roasHi)}]` : '')]);
      kv.push([T('Observed'), p.observedShare == null ? '—' : `${F.pct(p.observedShare)}${p.pending ? ' · ' + T('{n} in forecast', { n: BB.plural(p.pending, 'user|users', { fmt: F.int }) }) : ''}`]);
      if (n._mix) kv.push([T('Expected pLTV / trial of the mix'), fmtM2(n._mix.expected) + (isNum(n._mix.lo) ? ` [${fmtM2(n._mix.lo)} – ${fmtM2(n._mix.hi)}]` : '')], [T('Plan mix'), n._mix.mix.map((m) => `${m.plan} ${F.pct(m.share)}`).join(' · ')]);
      kv.push([T('Model'), modelLabel() + (p.priorShare > 0 ? ` · ${T('prior {pct}', { pct: F.pct(p.priorShare) })}` : '')]);
    }
    kv.push([`LTV ${money()} (${T('to date')})`, fmtM2(n.ltv)], ['ARPU', fmtM2(n.arpu)], [`${T('Payers')} (${payerShort()})`, F.int(n.payers)]);
    if (n.channel) kv.push([T('Channel'), chLabel(n.channel)]);
    if (isNum(n.spend)) kv.push([T('Spend'), F.usd(n.spend)]);
    if (isNum(n.roas)) kv.push(['ROAS', F.x(n.roas)]);
    if (isNum(n.trend)) kv.push([T('vs compare'), F.delta(n.trend, 1).text + ` (${F.int(n.prevUsers)})`]);
    if (isNum(n.insufficientShare)) kv.push([T('Insufficient funds'), F.pct(n.insufficientShare)]);
    if (n.byPsp) Object.entries(n.byPsp).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => kv.push([T('{psp} errors', { psp: k }), F.int(v)]));
    return U.tipHtml({ title: n.label + (n.variantTag && !n.channel ? ` · ${T('variant {tag}', { tag: n.variantTag })}` : ''), kv, note: (n._pred && n._pred.predicted ? T('Italic — forecast (80 % interval in brackets). ') : '') + T('Click: details, breakdown, set as base') });
  };
  const modelLabel = () => { const m = BB.predict.MODEL_BY_ID[BB.predict.modelOf({ model: st.model })]; return m ? BB.lbl(m).replace(/ \(.*\)$/, '') : st.model || 'sBG'; };
  const edgeTip = (e, a, b) => U.tipHtml({ title: `${a.label} → ${b.label}`, formula: e.baseRel ? T('conversion relative to the base node') : T('conversion = target users / source users'),
    kv: [[T('Conversion'), F.pct(e.rate)], [T('Users'), F.int(e.users)], [T('Median time'), fmtHours(e.medianHours)], [T('Revenue ({money})', { money: money() }), fmtM(e.revDownstream)]], note: T('Click: conversion and time over time') });
  const fmtHours = (h) => (!isNum(h) ? '—' : h < 1 ? T('{n} min', { n: Math.round(h * 60) }) : h < 48 ? T('{n} h', { n: h.toFixed(1) }) : T('{n} d', { n: (h / 24).toFixed(1) }));

  /* channel strip over the source column: lane colour, users, share of entry, ROAS; click = channel quick filter (collapses the
     source column to that channel's campaigns), click again = all */
  function renderChannels(g) {
    U.clear(chanHost);
    const active = st.channel && st.channel !== 'all' ? st.channel : null;
    chanHost.append(el('span', { class: 'caption', style: { marginRight: '4px' } }, T('Channels:')));
    (g.channels || []).forEach((c) => {
      const on = active === c.channel;
      chanHost.append(el('button', { type: 'button', class: 'btn sm' + (on ? ' primary' : ''), title: `${BB.lbl(c)}: ${BB.plural(c.campaigns.length, 'campaign|campaigns')} · ${T('spend')} ${F.usd(c.spend)} · ${on ? T('clear channel filter') : T('only this channel')}`,
        onClick: () => BB.state.write({ channel: on ? 'all' : c.channel }) },
        el('span', { class: 'dot-c', style: { background: c.color || 'var(--fg-4)', display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px' } }),
        BB.lbl(c), el('span', { class: 'mono muted', style: { marginLeft: '6px' } }, `${F.int(c.users)} · ${F.pct(c.pctOfEntry)}` + (isNum(c.roas) ? ` · ${F.x(c.roas)}` : ''))));
    });
    if (active) chanHost.append(U.chip({ k: T('Channel'), v: chLabel(active), onRemove: () => BB.state.write({ channel: 'all' }) }));
  }

  /* channel colour on source pills (tag + bar) and `sub` styling for plan / PSP pills: applied over the kit's SVG after every draw */
  let colorById = {};
  function decorate() {
    if (!fg) return;
    fg.svg.querySelectorAll('g.node[data-id]').forEach((gn) => {
      const id = gn.dataset.id;
      if (id.startsWith('src:')) { const c = colorById[id]; if (c) { gn.style.setProperty('--nc', c); const bar = gn.querySelector('.node-bar'); if (bar) bar.style.fill = c; } }
      else if (id.startsWith('plan:') || id.startsWith('psp:')) { gn.classList.remove('loss'); gn.classList.add('sub'); const bar = gn.querySelector('.node-bar'); if (bar) bar.style.fill = 'var(--nc)'; }
    });
  }
  let decoObs = null, decoRaf = 0;
  const watchDecorate = () => { const nodesG = fg.svg.querySelector('g.nodes'); if (!nodesG) return; decoObs = new MutationObserver(() => { cancelAnimationFrame(decoRaf); decoRaf = requestAnimationFrame(decorate); }); decoObs.observe(nodesG, { childList: true }); };

  function renderFlow() {
    const { g, thin } = model;
    renderChannels(g);
    const view = st.vw === 'table' ? 'table' : 'graph';
    graphHost.classList.toggle('hidden', view !== 'graph'); tableHost.classList.toggle('hidden', view !== 'table');
    flowCard.setCaption(`${rangeLabel()} · ${MODES.find((m) => m.id === st.mode).label.toLowerCase()} · ${money()} · ${T('payers')}: ${payerShort()}` + (g.lanesDim ? ` · ${T('lanes')}: ${dimLabel(g.lanesDim)}` : ''));
    U.clear(baseChipHost);
    if (g.baseNode) baseChipHost.append(U.chip({ k: T('Base'), v: g.nodeById[g.baseNode].label, onRemove: () => BB.state.write({ base: null }) }));
    if (thin) {
      if (fg) { decoObs && decoObs.disconnect(); decoObs = null; fg.destroy(); fg = null; }
      flowTbl = null;
      const sub = T('{n} in slice (< {min}) — widen the period or clear filters', { n: BB.plural(model.f.users.length, 'user|users', { fmt: F.int }), min: BB.MIN_USERS });
      U.emptyState(graphHost, T('Not enough data'), { sub }); U.emptyState(tableHost, T('Not enough data'), { sub });
      nodesBadge.textContent = BB.plural(model.f.users.length, 'user|users', { fmt: F.int }); flowCard.setFoot(null);
      return;
    }
    const ug = toUiGraph(g);
    colorById = {}; ug.nodes.concat(ug.lanes ? ug.lanes.flatMap((l) => l.nodes) : []).forEach((n) => { if (n.stage === 'source' && n.color) colorById[n.id] = n.color; });
    const nodesN = ug.nodes.length + (ug.lanes ? ug.lanes.reduce((a, l) => a + l.nodes.length, 0) : 0);
    nodesBadge.textContent = BB.plural(nodesN, 'node|nodes'); nodesBadge.title = T('computed in {ms} ms', { ms: model.ms.toFixed(0) });
    const opts = { height: 520, baseNode: g.baseNode || null, money: money(), nodeTip, edgeTip, onNode: openNode, onEdge: openEdge, fitOnUpdate: true, zoomMount: flowCard.actions };
    if (view === 'graph') {
      if (!fg) { fg = U.flowGraph(graphHost, ug, opts); watchDecorate(); }
      else fg.update(ug, opts);
      decorate(); fitHeight();
      flowCard.setFoot([el('span', {}, [T('width = users'), g.baseNode ? T('chip = conversion from base') : T('chip = conversion'), T('dashed = losses'), T('tag = channel'), subsOn() ? T('small nodes = plans / PSP') : null, predOn() ? T('pLTV = forecast to D{h} per user (per trial on plans) · italic = users younger than D{h} · {m}', { h: H(), m: modelLabel() }) : null].filter(Boolean).join(' · ')), el('span', { class: 'mono caption', title: T('render time') }, `${fg.renderMs} ms`)]);
    } else renderTable();
  }

  /* size the canvas to the graph as fitted by width (min 520px, fills the card width, re-fitted on load and on window resize) */
  function fitHeight() {
    if (!fg) return;
    const L = fg.layout, cw = fg.el.clientWidth || 1000; if (!L) return;
    const scale = cw < 600 ? 1 : cw / (L.width + 16);
    const h = Math.round(Math.max(520, Math.min(900, L.height * scale + 56)));
    if (Math.abs(parseFloat(fg.el.style.height) - h) > 2) fg.el.style.height = h + 'px';
    fg.fit();
  }
  let fitTimer = null;
  window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => { if (fg && st.vw !== 'table') fitHeight(); }, 120); });
  window.addEventListener('load', () => { if (fg && st.vw !== 'table') fitHeight(); });

  /* table view of the same graph (+ channel and checkout columns, exported as is) */
  const tblCols = () => [
    { key: 'stageLabel', label: T('Stage'), sticky: true, text: true, width: 120 },
    { key: 'label', label: T('Node'), text: true, align: 'left', render: (r) => el('span', { class: 'row', style: { gap: '6px' } }, r.sub ? el('span', { class: 'caption' }, '└') : null, r.label, r.variantTag ? U.badge(r.variantTag, 'accent', { mono: true }) : null) },
    { key: 'channel', label: T('Channel'), text: true, render: (r) => (r.channelId ? el('span', { class: 'row', style: { gap: '6px' } }, el('span', { class: 'dot-c', style: { background: r.color || 'var(--fg-4)', display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%' } }), r.channel) : el('span', { class: 'muted' }, '—')) },
    { key: 'users', label: T('Users'), fmt: 'int', heatmap: 'accent' },
    { key: 'pctOfStage', label: T('% of column'), fmt: 'pct' },
    { key: 'pctOfEntry', label: T('% of entry'), fmt: 'pct' },
    { key: 'pctOfBase', label: T('% of base'), fmt: 'pct', hidden: !model.g.baseNode },
    { key: 'conversionIn', label: T('Conversion in'), fmt: 'pct', heatmap: 'good', tip: T('node users / source-node users') },
    { key: 'checkouts', label: T('Checkouts'), fmt: 'int', tip: T('node users who reached checkout') },
    { key: 'checkoutRate', label: T('Checkout rate'), fmt: 'pct', heatmap: 'good', tip: T('checkouts / node users') },
    { key: 'checkoutErrors', label: T('Checkout errors'), fmt: 'int', heatmap: 'bad', tip: T('checkout errors among node users') },
    { key: 'pltv', label: `pLTV D${H()} / ${T('user')} ${curCode()}`, fmt: fmtM2, heatmap: 'good', hidden: !predOn(), tip: T('Forecast revenue to D{h} of the node\'s users / users (italic = some users younger than D{h})', { h: H() }) },
    { key: 'pltvTrial', label: `pLTV D${H()} / ${T('trial')} ${curCode()}`, fmt: fmtM2, hidden: !predOn(), tip: T('Forecast revenue to D{h} / trials in node', { h: H() }) },
    { key: 'ltv', label: `LTV ${money()} ${curCode()} (${T('to date')})`, fmt: fmtM2, heatmap: 'good' },
    { key: 'arpu', label: 'ARPU', fmt: fmtM2 },
    { key: 'roas', label: 'ROAS', fmt: 'x', heatmap: 'good' },
    { key: 'trend', label: T('Trend'), render: (r) => { const d = F.delta(r.trend, 1); return el('span', { class: d.cls }, d.text); }, tip: T('users vs compare period') },
  ];
  const tblRows = () => BB.flowTable(model.g).map((r) => {
    const n = model.g.nodeById[r.node] || {}, set = n.set || [], chk = set.filter((x) => x.checkout).length;
    const p = predOn() && n.id ? nodePred(n, '') : null, pc = (v, lo, hi) => (!p || v == null ? null : p.predicted ? { v, predicted: true, lo, hi } : v);
    return Object.assign(r, { key: r.node, label: n.label || r.label, channelId: n.channel || null, channel: n.channel ? chLabel(n.channel) : null, color: n.color || null,
      pltv: p ? pc(p.perUser, p.perUserLo, p.perUserHi) : null, pltvTrial: p ? pc(p.perTrial, p.perTrialLo, p.perTrialHi) : null,
      checkouts: n.stage === 'source' || n.stage === 'landing' || set.length ? chk : null, checkoutRate: set.length ? chk / set.length : null, checkoutErrors: set.length ? set.filter((x) => x.checkoutError).length : null,
      pctOfBase: n.pctOfBase ?? null });
  });
  function renderTable() {
    const cfg = { columns: tblCols(), rows: tblRows(), maxHeight: 560, onRowClick: (r) => { const n = model.g.nodeById[r.node]; if (n) openNode(n); },
      cellTip: (r, c, raw) => (raw && typeof raw === 'object' && raw.predicted ? { title: `${r.label} · ${c.label}`, kv: [[T('Forecast'), fmtM2(raw.v)], [T('80% interval'), `${fmtM2(raw.lo)} – ${fmtM2(raw.hi)}`], [T('Model'), modelLabel()]], note: T('Italic — some users of the node are younger than D{h}', { h: H() }) } : null), csvBasis: predOn() };
    if (!flowTbl) { U.clear(tableHost); flowTbl = U.table(tableHost, cfg); } else flowTbl.update(cfg);
  }
  const flowCsv = () => BB.csv([{ key: 'stageLabel', label: 'stage' }, { key: 'label', label: 'node' }, { key: 'channel', label: 'channel' }, 'users', { key: 'pctOfStage', label: 'pct_stage' }, { key: 'pctOfEntry', label: 'pct_entry' }, { key: 'pctOfBase', label: 'pct_base' }, { key: 'conversionIn', label: 'conversion_in' },
    'checkouts', { key: 'checkoutRate', label: 'checkout_rate' }, { key: 'checkoutErrors', label: 'checkout_errors' }, { key: 'pltv', label: 'pltv_d' + H() + '_per_user_usd' }, { key: 'pltvTrial', label: 'pltv_d' + H() + '_per_trial_usd' }, { key: 'ltv', label: 'ltv_' + money() + '_usd' }, { key: 'arpu', label: 'arpu_usd' }, 'roas', 'trend'], tblRows());

  /* ───────── side panel: node ───────── */
  const panelCharts = [];
  const killCharts = () => { panelCharts.splice(0).forEach((c) => c && c.destroy()); };
  function openNode(n0) {
    const g = model.g, n = g.nodeById[n0.id] || n0, stage = BB.lbl(BB.FLOW_STAGES.find((s) => s.id === n.stage));
    killCharts();
    const p = U.sidePanel({ title: n.label, caption: stage + (n.variantTag ? ` · ${T('variant {tag}', { tag: n.variantTag })}` : '') + (n.channel ? ` · ${chLabel(n.channel)}` : ''), onClose: killCharts, body: (b) => {
      const isBase = g.baseNode === n.id;
      const camp = n.stage === 'source' && !n.organic ? n.label : null;
      const lk = camp ? { filters: Object.assign({}, st.filters || {}, { campaign: [camp] }) } : null;
      b.append(el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
        el('button', { class: 'btn primary sm', type: 'button', onClick: () => { BB.state.write({ base: isBase ? null : n.id }); U.toast(isBase ? T('Base reset') : T('Base: {node}', { node: n.label }), 'good'); p.close(); } }, isBase ? T('Reset base') : T('Set as base')),
        el('a', { class: 'btn sm', href: BB.state.link('cohorts', lk) }, T('Open in Cohorts')),
        el('a', { class: 'btn sm', href: BB.state.link('realtime', lk) }, 'Real-time')));
      const k = el('div');
      const np = predOn() ? nodePred(n, '') : null, nmix = np && n.id.startsWith('pw:') ? paywallMix(n, g.nodes, '') : null;
      U.kpiRow(k, [
        { label: n.stage === 'source' || n.stage === 'landing' ? T('Views') : T('Users'), value: n.users, fmt: 'int', delta: n.trend, dir: 1, sub: isNum(n.prevUsers) ? T('compare: {n}', { n: F.int(n.prevUsers) }) : null },
        { label: isNum(n.pctOfBase) ? T('% of base') : T('% of entry'), value: isNum(n.pctOfBase) ? n.pctOfBase : n.pctOfEntry, fmt: 'pct', sub: `${F.pct(n.pctOfStage)} ${n.sub ? T('of parent') : T('of column')}` },
        { label: `LTV ${money()} · ${curCode()} (${T('to date')})`, value: fmtM2(n.ltv), sub: `ARPPU ${fmtM2(n.arppu)}` },
        { label: `${T('Payers')} · ${payerShort()}`, value: n.payers, fmt: 'int', sub: `${T('revenue')} ${fmtM(n.rev)}`, hint: BB.payerLabel(st) },
      ]);
      if (np) {
        const tile = U.kpiCard({ label: `pLTV D${np.horizon} / ${T('user')} · ${curCode()}`, value: fmtM2(np.perUser), interval: np.predicted ? `[${fmtM2(np.perUserLo)} – ${fmtM2(np.perUserHi)}]` : null, group: np.observedShare == null ? null : T('{pct} % observed', { pct: Math.round(np.observedShare * 100) }), basis: [np.trials ? `${T('per trial')} ${fmtM2(np.perTrial)}` : null, isNum(np.roas) ? `pROAS ${F.x(np.roas)}` : null, modelLabel()].filter(Boolean).join(' · '), hint: T('Forecast revenue to D{h} of the node\'s users / users; per trial = / trials in node. Italic — forecast, brackets — 80 % interval.', { h: np.horizon }) });
        if (np.predicted) { tile.classList.add('predicted'); tile.querySelector('.value').classList.add('pv'); }
        k.append(tile);
        if (nmix) k.append(U.kpiCard({ label: `${T('Expected pLTV / trial')} · D${nmix.horizon}`, value: fmtM2(nmix.expected), interval: isNum(nmix.lo) ? `[${fmtM2(nmix.lo)} – ${fmtM2(nmix.hi)}]` : null, basis: T('Σ share × pLTV per plan') + (nmix.v2 ? ' · ' + T('plan values: new-trial model') : ''), hint: T('Plan mix of this paywall: share of trials per plan × pLTV per trial of that plan (same users, same horizon)') }));
      }
      if (isNum(n.roas) || isNum(n.spend)) k.append(U.kpiCard({ label: 'ROAS', value: n.roas, fmt: 'x', sub: isNum(n.spend) ? `${T('spend')} ${F.usd(n.spend)}` : null }));
      if (n.id === 'loss_card') k.append(U.kpiCard({ label: T('Insufficient funds'), value: n.insufficientShare, fmt: 'pct', sub: T('share of declines') }));
      k.style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))';
      b.append(k);
      /* PSP errors of the checkout loss node */
      if (n.id === 'loss_checkout') {
        const byPsp = Object.entries(n.byPsp || {}).sort((a, c) => c[1] - a[1]);
        const codes = new Map(); (n.set || []).forEach((x) => { const c = x.u.checkout_error && x.u.checkout_error.code; if (c) codes.set(c, (codes.get(c) || 0) + 1); });
        b.append(el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, el('span', { class: 'caption' }, T('By PSP:')), byPsp.map(([ps, v]) => U.badge(`${BB.lbl(BB.PSPS.find((x) => x.id === ps)) || ps} · ${F.int(v)} · ${F.pct(ratio(v, n.users))}`, 'bad', { mono: true }))));
        b.append(el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, el('span', { class: 'caption' }, T('Decline codes:')), [...codes.entries()].sort((a, c) => c[1] - a[1]).map(([c, v]) => U.badge(`${c} · ${F.pct(ratio(v, n.users))}`, null, { mono: true }))));
      }
      /* sub-pills: plans of a paywall node, PSP / payment method of the pay node */
      const subs = g.nodes.filter((x) => x.sub && x.parent === n.id && x.users > 0).sort((a, c) => c.users - a.users);
      if (subs.length) b.append(el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, el('span', { class: 'caption' }, n.id === 'pay' ? T('PSP / method:') : T('Plans:')),
        subs.map((x) => { const xp = predOn() ? nodePred(x, '') : null; return U.badge(`${x.label} · ${F.int(x.users)} · ${F.pct(ratio(x.users, n.users))} · ${xp && x.id.startsWith('plan:') ? `pLTV/${T('trial')} ${fmtM2(xp.perTrial)}` : xp ? `pLTV ${fmtM2(xp.perUser)}` : `LTV ${fmtM2(x.ltv)}`}`, 'accent', { mono: true, title: (n.id === 'pay' ? `${x.psp || 'stripe'} / ${x.payment_method || 'card'}` : x.label) + (xp ? ` · ${T('LTV to date')} ${fmtM2(x.ltv)}` + (xp.predicted ? ` · ${T('forecast D{h}', { h: xp.horizon })} [${fmtM2(x.id.startsWith('plan:') ? xp.perTrialLo : xp.perUserLo)} – ${fmtM2(x.id.startsWith('plan:') ? xp.perTrialHi : xp.perUserHi)}]` : '') : '') }); })));
      /* breakdown */
      const facts = n.set || [];
      let dim = n.stage === 'source' ? 'country' : 'channel';
      const bdHost = el('div');
      const bdCard = U.card(b, { title: T('Breakdown'), caption: BB.plural(facts.length, 'user|users', { fmt: F.int }), actions: [U.select(BD_DIMS, dim, (v) => { dim = v; paintBd(); }, { label: T('Dimension') }).el], body: { flush: true, node: bdHost } });
      let bdTbl = null;
      function bdRows() {
        const m = new Map();
        facts.forEach((x) => { const v = BB.dimValue(x.u, dim); let r = m.get(v); if (!r) { r = { key: v, label: v, users: 0, trials: 0, checkouts: 0, payers: 0, rev: 0, _us: [] }; m.set(v, r); } r.users++; r._us.push(x.u); if (x.checkout) r.checkouts++; if (x.trial) r.trials++; if (x.payer) r.payers++; r.rev += money() === 'net' ? x.rev_net : x.rev_gross; });
        let rows = [...m.values()].sort((a, c) => c.users - a.users);
        if (rows.length > 12) { const rest = rows.slice(12), o = { key: '__other', label: T('Other ({n})', { n: rest.length }), users: 0, trials: 0, checkouts: 0, payers: 0, rev: 0, _us: [] }; rest.forEach((r) => { o.users += r.users; o.trials += r.trials; o.checkouts += r.checkouts; o.payers += r.payers; o.rev += r.rev; o._us = o._us.concat(r._us); }); rows = rows.slice(0, 12).concat(o); }
        return rows.map((r) => { const p = predOn() && r._us.length ? predictUsers(r._us, null, `bd|${n.id}|${dim}|${r.key}`) : null; return Object.assign(r, { share: ratio(r.users, facts.length), checkoutRate: ratio(r.checkouts, r.users), trialRate: ratio(r.trials, r.users), payRate: ratio(r.payers, r.trials), ltv: ratio(r.rev, r.users), pltv: !p || p.perUser == null ? null : p.predicted ? { v: p.perUser, predicted: true, lo: p.perUserLo, hi: p.perUserHi } : p.perUser }); });
      }
      function paintBd() {
        const cfg = { columns: [{ key: 'label', label: BD_DIMS.find((d) => d.id === dim).label, sticky: true, text: true }, { key: 'users', label: T('Users'), fmt: 'int', heatmap: 'accent' }, { key: 'share', label: '%', fmt: 'pct' }, { key: 'checkoutRate', label: T('→ Checkout'), fmt: 'pct', heatmap: 'good' }, { key: 'trialRate', label: T('→ Trial'), fmt: 'pct', heatmap: 'good' }, { key: 'payRate', label: T('Trial-to-paid'), fmt: 'pct', heatmap: 'good' }, { key: 'pltv', label: `pLTV D${H()} ${curCode()}`, fmt: fmtM2, heatmap: 'good', hidden: !predOn(), tip: T('Forecast revenue to D{h} per user of the row', { h: H() }) }, { key: 'ltv', label: `LTV ${curCode()} (${T('to date')})`, fmt: fmtM2, heatmap: 'good' }], rows: bdRows(), maxHeight: 300, emptyText: T('No users in node'),
          cellTip: (r, c, raw) => (raw && typeof raw === 'object' && raw.predicted ? { title: `${r.label} · ${c.label}`, kv: [[T('Forecast'), fmtM2(raw.v)], [T('80% interval'), `${fmtM2(raw.lo)} – ${fmtM2(raw.hi)}`], [T('Model'), modelLabel()]] } : null) };
        if (!bdTbl) bdTbl = U.table(bdHost, cfg); else bdTbl.update(cfg);
        bdCard.setCaption(`${BB.plural(facts.length, 'user|users', { fmt: F.int })} · ${STEP_LBL[model.step]}`);
      }
      paintBd();
      /* mini time-series */
      const keys = BB.bucketsBetween(model.f.range.from, Math.min(model.f.range.to, data.now), model.step);
      const tsCard = U.card(b, { title: T('Over time'), caption: `${STEP_LBL[model.step]} · ${T('by signup time')}`, body: el('canvas') }); tsCard.body.classList.add('chart'); tsCard.body.style.height = '180px';
      const curN = bucketCount(facts, model.step, keys);
      const prevN = model.prev && model.prev.nodeById[n.id];
      const ds = [{ label: T('Current period'), data: curN, backgroundColor: n.color || U.ordinal(BB.FLOW_STAGES.findIndex((s) => s.id === n.stage), BB.FLOW_STAGES.length), _nmFmt: 'int' }];
      if (prevN && model.g.compareRange) { const sh2 = model.g.compareRange.shift || 0; const pk = keys.map((kk) => BB.bucket(BB.bucketStart(kk, model.step) - sh2, model.step)); ds.push({ type: 'line', label: model.co && model.co.kind === 'channel' ? T('Channel {ch}', { ch: chLabel(model.co.channel) }) : T('Previous period'), data: bucketCount(prevN.set || [], model.step, pk), borderColor: U.cssVar('--fg-4'), borderDash: [4, 3] }); }
      const tsChart = U.chart(tsCard.body.firstChild, { type: 'bar', data: { labels: keys.map((kk) => BB.bucketLabel(kk, model.step)), datasets: ds }, options: { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, ticks: { precision: 0 } } } } });
      panelCharts.push(tsChart); U.viewToggle(tsCard, () => tsChart, { fmt: 'int', maxHeight: 220 });
      /* funnel from this node */
      const fs = [{ label: n.label, value: facts.length }, { label: T('Checkout'), value: facts.filter((x) => x.checkout).length }, { label: T('Trial'), value: facts.filter((x) => x.trial).length }, { label: T('Qualified trial'), value: facts.filter((x) => x.qualified).length }, { label: T('Paid'), value: facts.filter((x) => x.payer).length, sub: payerShort() }, { label: T('Active D30'), value: facts.filter((x) => x.outcome === 'active').length }];
      const fc = U.card(b, { title: T('Funnel from node'), caption: '', body: el('div') }); U.funnelBars(fc.body, fs);
    } });
  }

  /* ───────── side panel: edge ───────── */
  const hoursFor = (e, x) => { // time-to-convert per user for known edge types
    const u = x.u, t = u._trial, f = e.from, to = e.to;
    if (f.startsWith('onb:') && to.startsWith('pw:')) return u.paywall_viewed_ts != null ? (u.paywall_viewed_ts - u.signup_ts) / HOUR : null;
    if (f.startsWith('pw:') && to === 'checkout') return u.checkout_ts != null && u.paywall_viewed_ts != null ? (u.checkout_ts - u.paywall_viewed_ts) / HOUR : null;
    if (f === 'checkout' && to === 'trial') return t && u.checkout_ts != null ? (t.ts - u.checkout_ts) / HOUR : null;
    if (f === 'trial' && to === 'qualified') return 20 / 60;
    if (f === 'qualified' && to === 'pay') return t && x.firstOkTs != null ? (x.firstOkTs - t.ts) / HOUR : null;
    if (f === 'pay' && to === 'loss_refund') { const r = (data.index.refundsByUser.get(u.user_id) || [])[0]; return r && x.firstOkTs != null ? (r.ts - x.firstOkTs) / HOUR : null; }
    if (f === 'pay' && to === 'loss_dispute') { const d = (data.index.disputesByUser.get(u.user_id) || [])[0]; return d && x.firstOkTs != null ? (d.ts - x.firstOkTs) / HOUR : null; }
    return null; // source → landing → signup are instantaneous; pay → outcome is a D30 status, not a transition in time
  };
  const HIST = [{ l: T('< 1 h'), max: 1 }, { l: T('1–6 h'), max: 6 }, { l: T('6–24 h'), max: 24 }, { l: T('1–3 d'), max: 72 }, { l: T('3–7 d'), max: 168 }, { l: T('7–14 d'), max: 336 }, { l: T('14–30 d'), max: 720 }, { l: T('> 30 d'), max: Infinity }];
  function openEdge(e, a0, b0) {
    const g = model.g, a = g.nodeById[a0.id] || a0, b = g.nodeById[b0.id] || b0;
    killCharts();
    const fromIds = new Set((a.set || []).map((x) => x.u.user_id));
    const conv = (b.set || []).filter((x) => fromIds.has(x.u.user_id));
    U.sidePanel({ title: `${a.label} → ${b.label}`, caption: T('transition'), onClose: killCharts, body: (bd) => {
      const k = el('div');
      U.kpiRow(k, [
        { label: e.baseRel ? T('Conversion (from base)') : T('Conversion'), value: e.rate, fmt: 'pct', sub: T('{a} of {b}', { a: F.int(e.users), b: F.int(a.users) }) },
        { label: T('Median time'), value: fmtHours(e.medianHours), sub: T('to transition') },
        { label: T('Revenue ({money})', { money: money() }), value: fmtM(e.revDownstream), sub: T('downstream revenue') },
        { label: T('LTV of converted') + ` (${T('to date')})`, value: fmtM2(ratio(conv.reduce((s, x) => s + (money() === 'net' ? x.rev_net : x.rev_gross), 0), conv.length)), sub: BB.plural(conv.length, 'user|users', { fmt: F.int }) },
      ]);
      if (predOn() && conv.length) {
        const ep = predictUsers(conv.map((x) => x.u), null, `edge|${e.id}`);
        const tile = U.kpiCard({ label: `pLTV D${ep.horizon} ${T('of converted')} · ${curCode()}`, value: fmtM2(ep.perUser), interval: ep.predicted ? `[${fmtM2(ep.perUserLo)} – ${fmtM2(ep.perUserHi)}]` : null, group: ep.observedShare == null ? null : T('{pct} % observed', { pct: Math.round(ep.observedShare * 100) }), basis: modelLabel(), hint: T('Forecast revenue to D{h} of the users on this edge / users ("in money" at the horizon, independent of age)', { h: ep.horizon }) });
        if (ep.predicted) { tile.classList.add('predicted'); tile.querySelector('.value').classList.add('pv'); }
        k.append(tile);
      }
      k.style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))'; bd.append(k);
      /* conversion over time */
      const keys = BB.bucketsBetween(model.f.range.from, Math.min(model.f.range.to, data.now), model.step);
      const fromC = bucketCount(a.set || [], model.step, keys), toC = bucketCount(conv, model.step, keys);
      /* conversion (rate) above, transitions (count) below — two small charts sharing x instead of a dual-axis chart */
      const c1Host = el('div');
      const c1 = U.card(bd, { title: T('Conversion over time'), caption: `${STEP_LBL[model.step]} · ${T('by signup time')} · ${T('rate above, count below')}`, body: c1Host }); c1.body.classList.add('chart'); c1.body.style.height = '260px';
      const xLabels = keys.map((kk) => BB.bucketLabel(kk, model.step));
      const stack = U.chartStack(c1Host, [
        { type: 'line', ariaLabel: T('Conversion by interval'), data: { labels: xLabels, datasets: [{ label: T('Conversion'), data: keys.map((_, i) => (fromC[i] ? toC[i] / fromC[i] : null)), fill: true, borderColor: U.palette(0), spanGaps: true, _nmFmt: 'pct' }] },
          options: { scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { min: 0, max: 1, ticks: { callback: (v) => Math.round(v * 100) + '%', maxTicksLimit: 4 } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${F.pct(c.parsed.y)}` } } } } },
        { type: 'bar', ariaLabel: T('Transitions by interval'), data: { labels: xLabels, datasets: [{ label: T('Converted'), data: toC, backgroundColor: U.palette(1), _nmFmt: 'int' }] },
          options: { scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 3 } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${F.int(c.parsed.y)}` } } } } },
      ], { heights: [3, 2] });
      stack.charts.forEach((ch) => ch && panelCharts.push(ch)); U.viewToggle(c1, () => stack.charts, { maxHeight: 260 });
      /* time-to-convert histogram */
      const hs = conv.map((x) => hoursFor(e, x)).filter(isNum);
      const c2 = U.card(bd, { title: T('Time to convert'), caption: hs.length ? `${BB.plural(hs.length, 'user|users', { fmt: F.int })} · ${T('median {t}', { t: fmtHours(e.medianHours) })}` : T('Not timed for this transition'), body: el('canvas') }); c2.body.classList.add('chart'); c2.body.style.height = '180px';
      if (hs.length) {
        const bins = HIST.map(() => 0); hs.forEach((h) => { bins[HIST.findIndex((x) => h < x.max)]++; });
        const hChart = U.chart(c2.body.firstChild, { type: 'bar', data: { labels: HIST.map((x) => x.l), datasets: [{ label: T('Users'), data: bins, backgroundColor: U.palette(0), _nmFmt: 'int' }] }, options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } } });
        panelCharts.push(hChart); U.viewToggle(c2, () => hChart, { fmt: 'int', maxHeight: 220 });
      } else U.emptyState(c2.body, conv.length ? T('Instant or not time-bound') : T('No data'));
    } });
  }

  /* ───────── A/B strip ───────── */
  const expSeg = U.segmented(EXPS, curExp().id, (v) => BB.state.write({ exp: v === 'onboarding' ? null : v }), { label: T('Experiment') });
  const abCard = U.card(sh.main, { title: T('A/B tests'), caption: '', actions: [expSeg.el], body: { flush: true, node: el('div') } });
  let abTbl = null;
  const prob = (v) => (!isNum(v) ? null : { v, cls: v >= 0.9 ? 'good' : v <= 0.1 ? 'bad' : null });
  /* experiment rows: onboarding / paywall straight from BB.abTests; other user dimensions (landing_variant, price_test…) built the same way
     from BB.breakdown rows (rates, LTV D7/D30, allocated spend) + BB.abTest (Beta-Binomial for rates, bootstrap of per-user LTV) */
  function expVariants(ex) {
    const core = model.ab.find((x) => x.experiment === ex.id);
    if (core) return core.variants;
    const bd = BB.breakdown({ data: model.f, state: st, dim: ex.dim, offsets: [7, 30], topN: 8 });
    const facts = setOf(model.gk, 'signup'), byV = new Map();
    facts.forEach((x) => { const v = BB.dimValue(x.u, ex.dim); if (v === NONE) return; let a = byV.get(v); if (!a) { a = []; byV.set(v, a); } a.push(money() === 'net' ? x.rev_net : x.rev_gross); });
    const mat = (r, N) => (r.byOffset && r.byOffset[N] && r.byOffset[N].mature ? BB.metric(r, 'arpu', N, money()) : null);
    const variants = bd.rows.filter((r) => !r.isOther && (byV.has(String(r.key)) || byV.has(String(r.label)))).map((r) => {
      const v = byV.has(String(r.key)) ? String(r.key) : String(r.label), vals = byV.get(v) || [], td = r.toDate || {};
      return { variant: v, users: r.signups, trials: r.trials, signupToTrial: ratio(r.trials, r.signups), trialsEnded: td.trialsEnded || 0, firstRebillOk: td.firstRebillOk || 0, trialToPay: ratio(td.firstRebillOk, td.trialsEnded),
        payers: r.payers, ltv7: mat(r, 7), ltv30: mat(r, 30), rev: BB.util.sum(vals), spend: r.spend, roas: ratio(BB.util.sum(vals), r.spend), _ltv: vals, probBeat: {} };
    }).sort((a, c) => (a.variant < c.variant ? -1 : 1));
    if (variants.length > 1) {
      const a = BB.abTest(variants.map((v) => ({ variant: v.variant, n: v.users, k: v.trials })), 'signupToTrial');
      const b = BB.abTest(variants.map((v) => ({ variant: v.variant, n: v.trialsEnded, k: v.firstRebillOk })), 'trialToPay');
      const c = BB.abTest(variants.map((v) => ({ variant: v.variant, values: v._ltv })), 'ltv', { sims: 1000 });
      variants.forEach((v, i) => { v.probBeat = { signupToTrial: a[i].probBeat, trialToPay: b[i].probBeat, ltv: c[i].probBeat }; v.ltvLo = c[i].lo; v.ltvHi = c[i].hi; });
    }
    variants.forEach((v) => delete v._ltv);
    return variants;
  }
  const tagOf = (ex, variant, i) => (ex.id === 'onboarding' ? variant : ex.id === 'paywall' ? PW_TAG[variant] || String.fromCharCode(65 + i) : String.fromCharCode(65 + i));
  /* users of a variant (same assignment rule as BB.abTests: onboarding = users.onboarding, paywall = users.experiments.paywall; other experiments = the dimension value) */
  const variantUsers = (ex, variant) => model.f.users.filter((u) => String(ex.id === 'onboarding' ? u.onboarding : ex.id === 'paywall' ? (u.experiments && u.experiments.paywall) : BB.dimValue(u, ex.dim)) === String(variant));
  function renderAb() {
    const ex = curExp();
    if (model.thin) { abTbl = null; U.emptyState(abCard.body.firstChild, T('Not enough data'), { sub: T('{n} in slice (< {min})', { n: BB.plural(model.f.users.length, 'user|users', { fmt: F.int }), min: BB.MIN_USERS }) }); abCard.setCaption(`${ex.label} · ${rangeLabel()}`); return; }
    const vs = expVariants(ex), h = H();
    /* forecast per variant: pseudo-row of the variant's users with its (allocated) spend → pLTV D{H} per user, pROAS D{H}; P(better) from the 80 % intervals (normal approximation) */
    const ps = vs.map((v) => { const us = variantUsers(ex, v.variant); return us.length ? predictUsers(us, v.spend, `ab|${ex.id}|${v.variant}`) : null; });
    const pb = pBetterNormal(ps);
    const pc = (p, v, lo, hi) => (!p || v == null ? null : p.predicted ? { v, predicted: true, lo, hi } : v);
    const rows = vs.map((v, i) => ({ key: v.variant, variant: v.variant, tag: tagOf(ex, v.variant, i), users: v.users, trials: v.trials, signupToTrial: v.signupToTrial, pST: prob(v.probBeat.signupToTrial), trialToPay: v.trialToPay, pTP: prob(v.probBeat.trialToPay), payers: v.payers, ltv7: v.ltv7, ltv30: v.ltv30, roas: v.roas, pLtv: prob(v.probBeat.ltv), ltvLo: v.ltvLo, ltvHi: v.ltvHi,
      _p: ps[i], pltv: ps[i] ? pc(ps[i], ps[i].perUser, ps[i].perUserLo, ps[i].perUserHi) : null, proas: ps[i] ? pc(ps[i], ps[i].roas, ps[i].roasLo, ps[i].roasHi) : null, pPltv: prob(pb[i]) }));
    const pcol = (key, label, tip) => ({ key, label, fmt: 'pct', tip, render: (r) => { const x = r[key]; return x ? el('span', { class: x.cls || 'muted' }, F.pct(x.v)) : '—'; } });
    const cfg = { columns: [
      { key: 'variant', label: T('Variant'), sticky: true, text: true, render: (r) => el('span', { class: 'row', style: { gap: '6px' } }, U.badge(r.tag, 'accent', { mono: true }), r.variant) },
      { key: 'users', label: T('Users'), fmt: 'int' }, { key: 'trials', label: T('Trials'), fmt: 'int' },
      { key: 'signupToTrial', label: T('Signup → Trial'), fmt: 'pct', heatmap: 'good' }, pcol('pST', T('P(better)'), T('Beta-Binomial: P(variant beats the rest) on signup → trial')),
      { key: 'trialToPay', label: T('Trial-to-paid'), fmt: 'pct', heatmap: 'good', tip: T('1st rebill OK / trials ended') }, pcol('pTP', T('P(better)'), T('Beta-Binomial on trial-to-paid')),
      { key: 'payers', label: `${T('Payers')} · ${payerShort()}`, fmt: 'int', tip: BB.payerLabel(st) },
      { key: 'ltv7', label: `LTV D7 ${curCode()}`, fmt: fmtM2, heatmap: 'good', tip: T('ARPU at D7 (mature users)') }, { key: 'ltv30', label: `LTV D30 ${curCode()}`, fmt: fmtM2, heatmap: 'good' },
      { key: 'roas', label: T('ROAS to date'), fmt: 'x', heatmap: 'good', tip: T('≈ spend allocated by signups') },
      pcol('pLtv', T('P(better) LTV'), T('Bootstrap of mean LTV to date; 80% interval in tooltip')),
      ...(predOn() ? [
        { key: 'pltv', label: `pLTV D${h} / ${T('user')} ${curCode()}`, fmt: fmtM2, heatmap: 'good', heatmapPredicted: false, tip: T('Forecast revenue to D{h} of the variant\'s users / users (italic = forecast; 80 % interval and per-trial value in tooltip)', { h }) },
        { key: 'proas', label: `pROAS D${h}`, fmt: 'x', heatmap: 'good', heatmapPredicted: false, tip: T('Forecast revenue to D{h} / spend (≈ allocated by signups)', { h }) },
        pcol('pPltv', T('P(better) pLTV'), T('P(variant beats every other on pLTV D{h} per user): normal approximation from the 80 % intervals, product over the other variants', { h })),
      ] : []),
    ], rows, cellTip: (r, c) => {
      if (c.key === 'pLtv' && isNum(r.ltvLo)) return { title: `${r.variant} · ${T('LTV to date')}`, kv: [[T('80% interval'), `${fmtM2(r.ltvLo)} – ${fmtM2(r.ltvHi)}`]] };
      const p = r._p; if (!p || !['pltv', 'proas', 'pPltv'].includes(c.key)) return null;
      const iv = (lo, hi, f) => (p.predicted ? `${f(lo)} – ${f(hi)}` : T('actual'));
      return { title: `${r.variant} · pLTV D${p.horizon}`, formula: T('observed revenue + expected future revenue to D{h} per user', { h: p.horizon }), kv: [[`pLTV / ${T('user')}`, fmtM2(p.perUser)], [T('80% interval'), iv(p.perUserLo, p.perUserHi, fmtM2)], [`pLTV / ${T('trial')}`, fmtM2(p.perTrial)], [`pROAS D${p.horizon}`, `${F.x(p.roas)} (${iv(p.roasLo, p.roasHi, F.x)})`], [T('Observed'), p.observedShare == null ? '—' : F.pct(p.observedShare)], [T('Users in forecast'), F.int(p.pending)], [T('Model'), modelLabel() + (p.priorShare > 0 ? ` · ${T('prior {pct}', { pct: F.pct(p.priorShare) })}` : '')]], note: T('Spend ≈ allocated by signups; pLTV / trial = / trials of the variant') };
    }, emptyText: T('No exposures in period') };
    if (!abTbl) { U.clear(abCard.body.firstChild); abTbl = U.table(abCard.body.firstChild, cfg); } else abTbl.update(cfg);
    abCard.setCaption(`${ex.label} · ${rangeLabel()} · ${BB.plural(EXPS.length, 'live test|live tests')}`);
  }

  /* ───────── distribution charts ───────── */
  const distGrid = el('div', { class: 'grid c2' }); sh.main.append(distGrid);
  const distCard = U.card(distGrid, { title: T('Variant split by campaign'), caption: '', body: el('canvas') }); distCard.body.classList.add('chart');
  const funCard = U.card(distGrid, { title: T('Funnel'), caption: '', body: el('div') });
  let distChart = null;
  const distView = U.viewToggle(distCard, () => distChart, { fmt: 'pct', maxHeight: 260 });
  function renderDist() {
    const ex = curExp(), users = model.f.users;
    if (distChart) { distChart.destroy(); distChart = null; }
    if (model.thin) { U.emptyState(distCard.body, T('Not enough data')); distCard.setCaption(`${ex.label}`); }
    else {
      if (!distCard.body.querySelector('canvas')) { U.clear(distCard.body); distCard.body.append(el('canvas')); }
      const byC = new Map();
      users.forEach((u) => { const v = BB.dimValue(u, ex.dim); if (!v || v === NONE) return; let m = byC.get(u.campaign); if (!m) { m = { total: 0, by: new Map() }; byC.set(u.campaign, m); } m.total++; m.by.set(v, (m.by.get(v) || 0) + 1); });
      const camps = [...byC.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
      const variants = [...new Set(camps.flatMap(([, m]) => [...m.by.keys()]))].sort();
      const datasets = variants.map((v) => ({ label: v, data: camps.map(([, m]) => ratio(m.by.get(v) || 0, m.total)), backgroundColor: U.entityColor('variant', v), _n: camps.map(([, m]) => m.by.get(v) || 0), _nmFmt: 'pct' })); // colour follows the variant, not its position
      distChart = U.chart(distCard.body.firstChild, { type: 'bar', data: { labels: camps.map(([c]) => c), datasets }, options: { indexAxis: 'y', scales: { x: { stacked: true, min: 0, max: 1, ticks: { callback: (v) => Math.round(v * 100) + '%' } }, y: { stacked: true, grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${F.pct(c.parsed.x)} (${F.int(c.dataset._n[c.dataIndex])})` } } } } });
      distCard.setCaption(`${ex.label}: ${T('variant share per campaign (expect an even split) · top {n} by signups', { n: camps.length })}`);
      distView.refresh();
    }
    const k = model.g.kpis, nb = model.g.nodeById;
    U.funnelBars(funCard.body, [
      { label: T('Entry'), value: k.entry, sub: T('landing views') }, { label: T('Signups'), value: k.signups }, { label: T('Paywall'), value: model.g.nodes.filter((n) => n.stage === 'paywall' && !n.sub).reduce((s, n) => s + n.users, 0), sub: T('viewed') },
      { label: T('Checkout'), value: k.checkouts, sub: isNum(k.checkoutErrorRate) ? T('errors {pct}', { pct: F.pct(k.checkoutErrorRate) }) : T('started') },
      { label: T('Trials'), value: k.trials }, { label: T('Qualified trials'), value: k.qualified, sub: T('20 min') }, { label: T('Payers'), value: k.payers, sub: payerShort() }, { label: T('Active D30'), value: nb.active30 ? nb.active30.users : 0 },
    ]);
    funCard.setCaption(`${rangeLabel()} · ${MODES.find((m) => m.id === st.mode).label.toLowerCase()}` + (st.channel && st.channel !== 'all' ? ` · ${chLabel(st.channel)}` : '') + (st.device && st.device !== 'all' ? ` · ${st.device}` : ''));
  }

  /* ───────── header / orchestration ───────── */
  function rangeLabel() {
    const r = model.f.range, pr = BB.PRESETS.find((p) => p.id === st.preset);
    const d = (ts) => BB.bucketLabel(BB.util.isoDate(ts), 'day'); // same month abbreviations as the cohort table
    const span = st.preset === 'today' ? T('today to {time} UTC', { time: hhmm(r.to) }) : st.preset === 'yesterday' ? T('yesterday') : `${d(r.from)} – ${d(r.to)} ${new Date(r.to).getUTCFullYear()}`;
    return (pr && st.preset !== 'custom' && st.preset !== 'today' && st.preset !== 'yesterday' ? BB.lbl(pr) + ' · ' : '') + span;
  }
  function renderHead() {
    mdlBadges.update();
    const sub = el('span', {}, `${rangeLabel()} · ${BB.plural(model.f.users.length, 'user|users', { fmt: F.int })} · ${SRC()}`);
    if (st.channel && st.channel !== 'all') sub.append(el('span', {}, ` · ${T('channel')}: ${chLabel(st.channel)}`));
    if (st.device && st.device !== 'all') sub.append(el('span', {}, ` · ${st.device}`));
    if (st.preset !== 'today') sub.append(el('span', { class: 'muted' }, ' · ' + T('payments start D1–D7')));
    else sub.append(el('span', { class: 'muted' }, ' · ' + T('payments start D1–D7 · pick 7d for revenue')));
    sh.setSubtitle(sub);
    updatedEl.querySelector('.upd-txt').textContent = T('updated {time} UTC', { time: hhmm(data.now) });
    updatedEl.querySelector('.live-dot').classList.toggle('off', !isOn(st.auto));
    sh.setSource(SRC() + ' · ' + T('updated {time} UTC', { time: hhmm(data.now) }), isOn(st.auto));
    allocBadge.classList.toggle('hidden', !model.f.spendAllocated);
  }
  function renderAll() {
    compute();
    renderHead(); renderKpis(); renderFlow(); renderAb(); renderDist();
  }
  function syncControls() {
    tb.update(tbCfg()); modeSeg.set(st.mode); viewSeg.set(st.vw === 'table' ? 'table' : 'graph'); expSeg.set(curExp().id); autoTg.set(isOn(st.auto)); subsTg.set(subsOn());
    laneSeg.setOptions(laneOpts(), st.groupBy || '');
  }
  BB.state.onChange(() => { st = BB.state.read('flow'); syncControls(); renderAll(); scheduleAuto(); });
  U.onTheme(() => renderAll()); // theme-stepped palette: rebuild the map, charts and KPI strip for the new surface

  /* auto-refresh: regenerate the "now" slice of the mock every 60 s */
  let timer = null;
  function scheduleAuto() {
    clearInterval(timer); timer = null;
    if (!isOn(st.auto)) return;
    timer = setInterval(() => { data = BB.load({ force: true }); renderAll(); U.toast(T('Data updated · {time} UTC', { time: hhmm(data.now) })); }, 60000);
  }
  renderAll(); scheduleAuto();
  window.NMFlow = { get model() { return model; }, graph: () => fg, rerender: renderAll }; // for debugging / tests
});
