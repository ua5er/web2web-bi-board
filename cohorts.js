/* Web-to-Web BI Board — board 1: Cohorts (index.html). Uses ./core.js (BB) + ./ui.js (BB.ui). */
BB.ui.boot(function () { // renders once BB.ready() resolves (data pointer: ?data= · window.BB_DATA_URL · data-src · ./data/demo.json)
  'use strict';
  const U = BB.ui, el = U.el, F = BB.fmt, DAY = BB.util.DAY, isoDate = BB.util.isoDate;
  const T = BB.t;
  /* page labels: LTV on this board is per trial (= the KPI tile's "LTV D{H} / trial"); the signup-denominated alias keeps its ARPU meaning under "LTV (signups)" */
  const LBL = { arpt: T('LTV / trial'), ltv: T('LTV (signups)') };
  const ML = (k) => LBL[k] || BB.lbl(BB.METRIC_BY_KEY[k]), MF = (k) => BB.lbl(BB.METRIC_BY_KEY[k], 'formula'); // metric label / formula in the current language
  const PAGE = 'cohorts';
  const data = BB.load();
  const NOW = data.now;
  const MAX_OFF = BB.OFFSETS[BB.OFFSETS.length - 1];

  /* ---------------------------------------------------------------- page CSS (billing health bars, gauge, churn split) */
  document.head.append(el('style', { html: `
    .bh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 24px}
    @media (max-width:900px){.bh-grid{grid-template-columns:minmax(0,1fr)}}
    .bh-sec h3{font-size:12px;font-weight:500;color:var(--fg-2);margin:0 0 8px;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .bh-sec h3 .caption{font-weight:400}
    .bl{display:grid;grid-template-columns:minmax(96px,150px) minmax(0,1fr) 72px;align-items:center;gap:8px;font-size:12px;min-height:22px}
    .bl + .bl{margin-top:4px}
    .bl .bl-k{color:var(--fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bl .bl-k .mono{font-size:11px}
    .bl .bl-bar{height:8px;background:var(--bg-2);border-radius:4px;overflow:hidden;position:relative}
    .bl .bl-fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--s1);min-width:2px;opacity:.85}
    .bl .bl-fill.bad{background:var(--bad)} .bl .bl-fill.warn{background:var(--warn)} .bl .bl-fill.good{background:var(--good)} .bl .bl-fill.info{background:var(--s1)}
    .bl .bl-v{font-family:var(--mono);font-variant-numeric:tabular-nums;text-align:right;color:var(--fg);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bl .bl-v small{color:var(--fg-4);font-size:11px;margin-left:4px}
    @media (max-width:560px){.bl{grid-template-columns:minmax(72px,120px) minmax(0,1fr) minmax(56px,auto)} .bl .bl-v small{display:block;margin-left:0}}
    .gauge{position:relative;height:14px;background:var(--bg-2);border-radius:4px;overflow:visible;margin:10px 0 18px}
    .gauge .g-fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--good);opacity:.8}
    .gauge .g-fill.over{background:var(--bad)}
    .gauge .g-thr{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--bad);border-radius:1px}
    .gauge .g-thr span{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;font-size:11px;color:var(--fg-3);white-space:nowrap;font-family:var(--mono)}
    .bh-stat{display:flex;flex-wrap:wrap;gap:16px 24px;margin-bottom:14px}
    .bh-stat .s .l{font-size:11px;color:var(--fg-3)}
    .bh-stat .s .v{font-family:var(--mono);font-size:18px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
    .bh-stat .s .v.bad{color:var(--bad)} .bh-stat .s .v.good{color:var(--good)} .bh-stat .s .v.warn{color:var(--warn)}
    .tbl .sub.alloc{color:var(--fg-4)}
    .split{display:flex;height:14px;border-radius:4px;overflow:hidden;background:var(--bg-2);margin:6px 0 10px}
    .split span{display:block;min-width:1px;opacity:.85}
    .legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:var(--fg-3)}
    .legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:-1px}
    .pr-tbl{margin-top:12px}
    .card-body.chart .empty-state{position:absolute;inset:14px;min-height:0}
    .head-actions{flex-wrap:wrap;justify-content:flex-end;min-width:0}
  ` }));

  /* ---------------------------------------------------------------- constants */
  /* metric selector groups (optgroups) — all offset-based BB.METRICS keys */
  const METRIC_GROUPS = [
    { label: T('Monetisation'), keys: ['roas', 'revenue', 'revenue_gross', 'revenue_net', 'arpu', 'arpt', 'arppu', 'ltv', 'ltv_cac', 'payers', 'paying_rate', 'cpp', 'revenue_per_visitor', 'gross_margin'] },
    { label: T('MRR / subscriptions'), keys: ['mrr', 'arr', 'active_subs', 'nrr', 'active_rate', 'renewals', 'avg_renewals', 'expected_lifetime'] },
    { label: T('Retention & churn'), keys: ['first_rebill_rate', 'trial_paid_rate', 'voluntary_churn', 'involuntary_churn', 'recovery_rate', 'winback_rate', 'upgrade_rate', 'coupon_share'] },
    { label: T('PSP / billing'), keys: ['refunds', 'refund_rate', 'disputes', 'dispute_rate', 'fees', 'fee_pct', 'fx_loss', 'failed_rate', 'insufficient_share', 'auth_rate', 'three_ds_share'] },
  ].map((g) => ({ label: g.label, keys: g.keys.filter((k) => BB.METRIC_BY_KEY[k] && BB.METRIC_BY_KEY[k].offsetBased) }));
  const METRIC_OPTS = [].concat(...METRIC_GROUPS.map((g) => g.keys.map((k) => ({ id: k, label: ML(k), group: g.label }))));
  const PREDICTABLE = new Set(['roas', 'revenue', 'revenue_gross', 'revenue_net', 'arpu', 'arpt', 'arppu', 'ltv', 'payers', 'paying_rate']);
  const STEP_LBL = { day: T('daily'), week: T('weekly'), month: T('monthly') };
  const BASIS_LBL = { signup: T('by signup'), trial: T('by trial') };
  const DIMS = BB.DIMENSIONS.map((d) => ({ id: d.id, label: BB.lbl(d) }));
  const dimLabel = (id) => (BB.DIM_BY_ID[id] ? BB.lbl(BB.DIM_BY_ID[id]) : id);
  const ratio = (a, b) => (b > 0 && a != null ? a / b : null);
  const dayLabel = (ts) => BB.bucketLabel(isoDate(ts), 'day');
  const pad2 = (n) => String(n).padStart(2, '0');
  const chLabel = (id) => (BB.CHANNEL_BY_ID[id] ? BB.lbl(BB.CHANNEL_BY_ID[id]) : id);
  const SRC = data.meta.source === 'demo' ? T('Demo data') : BB.lbl(data.meta);
  const PAYER_LBL = () => (st.payer === 'sub' ? T('subscription') : T('any payment'));

  /* fixed (left) columns of the cohort table: row-level metrics + any offset metric "to date" (all events to now) */
  const ROW_LEVEL = ['spend', 'signups', 'trials', 'cpt', 'cpi', 'qualified_rate', 'payers', 'cpp', 'payback_day', 'signup_trial_rate', 'webview_share', 'click_id_rate'];
  const TO_DATE = BB.METRICS.filter((m) => m.offsetBased && !['revenue_gross', 'revenue_net', 'revenue_per_visitor', 'active_rate', 'active_subs', 'mrr', 'arr', 'nrr'].includes(m.key)).map((m) => m.key); // point-in-time-at-DN metrics make no sense "to date"
  /* forecast columns: "pLTV D{ltvH} / trial" and "pPayback" from BB.predict on the row (actual when mature); column ids stay fixed in the hash while ltvH moves */
  const PRED_COLS = ['pltv_trial', 'ppayback'];
  const PRED_LBL = (k) => (k === 'pltv_trial' ? T('pLTV D{h} / trial', { h: U.ltvHorizon(st) }) : T('pPayback'));
  const FIXED_ALL = ROW_LEVEL.concat(TO_DATE.filter((k) => !ROW_LEVEL.includes(k)), PRED_COLS);
  const FIXED_DEFAULT = ['spend', 'signups', 'trials', 'cpt', 'qualified_rate', 'payers', 'cpp'];
  const FIXED_OPTS = () => FIXED_ALL.map((k) => ({ id: k, label: PRED_COLS.includes(k) ? PRED_LBL(k) + ' (' + T('forecast') + ')' : ML(k) + (TO_DATE.includes(k) && !ROW_LEVEL.includes(k) ? ' (' + T('to date') + ')' : '') }));
  const COL_PRESETS = BB.COLUMN_PRESETS.map((p) => ({ id: p.id, label: BB.lbl(p), value: p.metrics.filter((k) => FIXED_ALL.includes(k)) }));

  /* ---------------------------------------------------------------- state */
  /* Page defaults when opened without a hash: 90 days by week (30d by day is a wall of immature cells). */
  if (!location.hash.replace('#', '')) BB.state.write({ preset: '90d', step: 'week' });
  let st = read();
  function read() {
    const s = BB.state.read(PAGE);
    if (!s.offsets || !s.offsets.length) s.offsets = BB.DEFAULT_OFFSETS.slice();
    if (!STEP_LBL[s.step]) s.step = 'day';
    if (!BB.METRIC_BY_KEY[s.metric] || !BB.METRIC_BY_KEY[s.metric].offsetBased) s.metric = 'roas';
    if (!s.bdim || !BB.DIM_BY_ID[s.bdim]) s.bdim = 'country';
    if (s.bdim2 && (!BB.DIM_BY_ID[s.bdim2] || s.bdim2 === s.bdim)) s.bdim2 = null;
    if (s.g2 && (!BB.DIM_BY_ID[s.g2] || s.g2 === s.groupBy || !s.groupBy)) s.g2 = null;
    s.cols = typeof s.cols === 'string' && s.cols ? s.cols.split(',').filter((k) => FIXED_ALL.includes(k)) : FIXED_DEFAULT.concat(s.groupBy === 'plan' || s.groupBy === 'paywall' ? PRED_COLS : []); // plan / paywall view: forecast columns on by default
    if (!s.cols.length) s.cols = FIXED_DEFAULT.slice();
    if (!['plan', 'channel', 'group'].includes(s.pr)) s.pr = 'plan';
    return s;
  }
  const flag = (k) => st[k] === '1' || st[k] === true;
  const predictedOn = () => st.predicted !== '0' && st.predicted !== 0 && st.predicted !== false; // forecast in immature cells is ON by default (hash predicted=0 switches it off)
  const targetRoas = () => { const n = parseFloat(st.targetRoas); return isFinite(n) && n > 0 ? n : 1; }; // shared with Predict / Real-time (payback = first offset with pROAS ≥ target)
  const modelLabel = () => { const m = BB.predict.MODEL_BY_ID[BB.predict.modelOf({ model: st.model })]; return m ? BB.lbl(m).replace(/ \(.*\)$/, '') : 'sBG'; };
  const pivotOn = () => flag('pivot') && !!st.groupBy;
  const money = () => st.money;
  /* local currency of the slice (only when the toolbar says "local") */
  let CUR = null;
  const mf = (kind) => (CUR ? (v) => F.money(v, CUR) : kind); // money formatter: usd/usd2 or local
  const fmtMoney = (v) => (CUR ? F.money(v, CUR) : F.usd(v));
  const fmtFor = (key) => { const m = BB.METRIC_BY_KEY[key]; return m && (m.fmt === 'usd' || m.fmt === 'usd2') ? mf(m.fmt) : m ? m.fmt : 'num'; };
  const fmtAuto = (key, v) => { const m = BB.METRIC_BY_KEY[key]; return m && (m.fmt === 'usd' || m.fmt === 'usd2') ? fmtMoney(v) : F.auto(key, v); };

  /* filter popover: every dimension with value counts over the whole dataset */
  const filterDims = BB.DIMENSIONS.map((d) => {
    const m = new Map();
    data.users.forEach((u) => { const v = BB.dimValue(u, d.id); m.set(v, (m.get(v) || 0) + 1); });
    return { id: d.id, label: BB.lbl(d), values: Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, label: v, count: n })) };
  });

  /* ---------------------------------------------------------------- shell + toolbar */
  const sh = U.shell(PAGE, { title: T('Cohorts'), subtitle: '…', sourceBadge: BB.lbl(data.meta) });
  U.applyTitle(T('Cohorts'));
  const updBadge = U.badge(T('Updated {time} UTC', { time: pad2(new Date(NOW).getUTCHours()) + ':' + pad2(new Date(NOW).getUTCMinutes()) }), 'info');
  const allocBadge = U.badge('≈ ' + T('Allocated spend'), null, { title: T('Dimensions absent from ad accounts (country, paywall, plan, device, PSP…): spend allocated by signups within the same ad and day') });
  const payerBadge = U.badge('', 'accent', { title: '' });
  const mdlBadges = U.modelBadges({ link: true }); // "model: …" + prior / pm / p1hl levers (hash), shown when not default
  sh.headActions.append(mdlBadges.el, updBadge, allocBadge, payerBadge);

  function tbCfg() {
    const range = BB.state.resolveRange(st, NOW);
    const extra = [];
    if (st.groupBy) extra.push({ id: 'g2', label: T('▸ then by'), type: 'select', options: [{ id: '', label: T('none') }].concat(DIMS.filter((d) => d.id !== st.groupBy)), value: st.g2 || '' });
    extra.push({ id: 'predicted', label: T('Forecast in immature cells'), type: 'toggle', value: predictedOn() });
    if (st.groupBy) extra.push({ id: 'pivot', label: T('Pivot: breakdown only'), type: 'toggle', value: pivotOn() });
    const loc = BB.localCurrency(data, Object.assign({}, st, { currency: 'local' }));
    return {
      range: { preset: st.preset, from: st.from || isoDate(range.from), to: st.to || isoDate(range.to), max: isoDate(NOW) },
      step: { options: ['day', 'week', 'month'], value: st.step },
      channel: { value: st.channel }, device: { value: st.device },
      basis: { value: st.basis }, money: { value: st.money }, payer: { value: st.payer },
      currency: { value: st.currency, localLabel: loc.code !== 'USD' ? loc.code : 'Local' },
      compare: { value: st.compare, channels: true }, views: { page: PAGE, value: st.view },
      groupBy: { dims: DIMS, value: st.groupBy }, filters: { dims: filterDims, value: st.filters }, metric: { options: METRIC_OPTS, value: st.metric }, extra,
      offsets: { all: BB.OFFSETS, value: st.offsets, default: BB.DEFAULT_OFFSETS, label: T('Offsets'), title: T('DN offset columns') },
      columns: { all: FIXED_OPTS(), value: st.cols, default: FIXED_DEFAULT, presets: COL_PRESETS, label: T('Columns'), title: T('Fixed columns'), caption: T('"to date" metrics: all events to today · forecast columns: pLTV D{h} / trial, pPayback', { h: U.ltvHorizon(st) }) },
      csv: () => { U.downloadCsv(`cohorts_${st.step}_${st.metric}${pivotOn() ? '_pivot' : ''}.csv`, tbl.toCsv()); U.toast(T('CSV exported'), 'good'); },
    };
  }
  const tb = U.toolbar(tbCfg(), (patch) => {
    const p = {};
    if (patch.range) { p.preset = patch.range.preset; p.from = patch.range.preset === 'custom' ? patch.range.from : null; p.to = patch.range.preset === 'custom' ? patch.range.to : null; }
    else Object.assign(p, patch);
    if ('predicted' in p) p.predicted = p.predicted ? null : '0';
    if ('pivot' in p) p.pivot = p.pivot ? '1' : null;
    if ('g2' in p) p.g2 = p.g2 || null;
    if ('groupBy' in p && !p.groupBy) { p.pivot = null; p.g2 = null; }
    if ('columns' in p) { p.cols = (p.columns || []).join(',') || null; delete p.columns; }
    if ('view' in p && !p.view) p.view = null;
    if ('channel' in p && p.channel === 'all') p.channel = null;
    if ('device' in p && p.device === 'all') p.device = null;
    BB.state.write(p);
  });
  sh.toolbarSlot.append(tb.el);
  /* metric select → grouped optgroups (kit select is flat) */
  function groupMetricSelect() {
    const refs = tb.refs(); const sel = refs.metric && refs.metric.select; if (!sel || sel.querySelector('optgroup')) return;
    const cur = sel.value; U.clear(sel);
    METRIC_GROUPS.forEach((g) => { const og = el('optgroup', { label: g.label }); g.keys.forEach((k) => og.append(el('option', { value: k }, ML(k)))); sel.append(og); });
    sel.value = cur;
  }
  groupMetricSelect();

  /* ---------------------------------------------------------------- static skeleton */
  const kpiHost = el('div'); sh.main.append(kpiHost);

  let expandedAll = false;
  const expandBtn = el('button', { class: 'btn sm ghost', type: 'button', onClick: () => { expandedAll = !expandedAll; if (expandedAll) tbl.expandAll(); else tbl.collapseAll(); expandBtn.textContent = expandedAll ? T('Collapse all') : T('Expand all'); } }, T('Expand all'));
  const metricBadge = U.badge('ROAS', 'accent');
  const tblEmpty = el('div', { class: 'hidden' });
  const tblHost = el('div');
  const tblCard = U.card(sh.main, {
    title: T('Cohort table'), caption: '', actions: [metricBadge, expandBtn], body: { flush: true, node: el('div', {}, tblEmpty, tblHost) },
    foot: [el('span', {}, el('span', { class: 'immature', style: { display: 'inline-block', width: '14px', height: '10px', verticalAlign: '-1px', marginRight: '5px', borderRadius: '2px' } }), T('cohort not yet mature at DN')),
      el('span', { class: 'predicted' }, el('span', { class: 'pv' }, T('dashed italic')), ' — ' + T('forecast (80% interval in tooltip)')),
      el('span', {}, T('Total — weighted over mature cohorts')),
      el('span', {}, T('LTV / trial = revenue per trial (the KPI tile\'s definition); LTV (signups) = ARPU')),
      el('span', { class: 'row' }, 'ROAS: ', el('span', { class: 'bad' }, '< 0.5x'), ' · ', el('span', { class: 'warn' }, '0.5–1x'), ' · ', el('span', { class: 'good' }, '≥ 1x'))],
  });
  const tbl = U.table(tblHost, { columns: [], rows: [], total: null, sort: null, maxHeight: 560, csvBasis: true,
    expandable: { isGroup: (r) => !!(r.children && r.children.length) || !!r._lazy, children: (r) => r.children || lazyChildren(r) }, cellTip, emptyText: T('No cohorts in period') });

  const chartsRow = el('div', { class: 'grid c2' }); sh.main.append(chartsRow);
  const curveCard = U.card(chartsRow, { title: T('ROAS curves by cohort'), caption: '', body: el('canvas') }); curveCard.body.classList.add('chart');
  const rebillCard = U.card(chartsRow, { title: T('Rebills & churn'), caption: '', body: el('canvas') }); rebillCard.body.classList.add('chart');
  let curveChart = null, rebillChart = null, mrrChart = null, prChart = null;
  const curveView = U.viewToggle(curveCard, () => curveChart, { fmt: 'x' }), rebillView = U.viewToggle(rebillCard, () => rebillChart, { fmt: 'int' });

  const subsRow = el('div', { class: 'grid c2' }); sh.main.append(subsRow);
  const mrrCard = U.card(subsRow, { title: T('MRR movement'), caption: '', body: el('canvas'), foot: [el('span', {}, T('MRR = Σ active sub prices per month (weekly × 4.33); a weekly → monthly upgrade can lower normalised MRR (counted as contraction)'))] }); mrrCard.body.classList.add('chart');
  const prSeg = U.segmented([{ id: 'plan', label: T('Plan') }, { id: 'channel', label: T('Channel') }, { id: 'group', label: T('Group by'), title: T('current "Group by"') }], st.pr, (v) => BB.state.write({ pr: v === 'plan' ? null : v }), { label: T('By') });
  const prChartHost = el('div', { class: 'chart', style: { position: 'relative', height: '240px' } }, el('canvas'));
  const prTblHost = el('div', { class: 'pr-tbl' });
  const mrrView = U.viewToggle(mrrCard, () => mrrChart, { fmt: 'usd' });
  const prCard = U.card(subsRow, { title: T('Paid retention'), caption: '', actions: [prSeg.el], body: el('div', {}, prChartHost, prTblHost),
    foot: [el('span', {}, T('k=1 — 1st rebill (100%); k — payers with a succeeded k-th charge among those due ≥ 4 days ago'))] });

  const bdSel = U.select(DIMS, st.bdim, (v) => BB.state.write({ bdim: v, bdim2: v === st.bdim2 ? null : st.bdim2 }), { prefix: T('Dimension') });
  const bdSel2 = U.select([{ id: '', label: T('none') }].concat(DIMS), st.bdim2 || '', (v) => BB.state.write({ bdim2: v || null }), { prefix: T('▸ then') });
  const bdAlloc = U.badge('≈ ' + T('Allocated spend'), null, { title: T('Spend allocated by signups') });
  const bdEmpty = el('div', { class: 'hidden' });
  const bdHost = el('div');
  const bdCard = U.card(sh.main, { title: T('Breakdown matrix'), caption: '', actions: [bdAlloc, bdSel.el, bdSel2.el], body: { flush: true, node: el('div', {}, bdEmpty, bdHost) },
    foot: [el('span', {}, T('Top 15 by spend + Other · rebill, refund, dispute, auth rates — to date · ROAS DN — mature only')), el('span', {}, T('Disputes > 0.75 % (Stripe threshold) in red · second level (▸) on row click'))] });
  const bdTbl = U.table(bdHost, { columns: [], rows: [], total: null, sort: { key: 'spend', dir: 'desc' }, maxHeight: 520, cellTip, emptyText: T('No data'),
    expandable: { isGroup: (r) => !!r._lazyBd, children: (r) => lazyBdChildren(r) } });
  bdCard.actions.prepend(U.tableColumnsButton(bdTbl, { label: T('Columns'), title: T('Matrix columns'), default: ['spend', 'trials', 'cpt', 'qualified_rate', 'first_rebill_rate', 'refund_rate', 'dispute_rate', 'r0', 'r3', 'r7', 'r30', 'payback_day', 'pltv_trial'] }));

  const healthRow = el('div', { class: 'grid c2' }); sh.main.append(healthRow);
  const churnCard = U.card(healthRow, { title: T('Voluntary & involuntary churn'), caption: '', body: el('div') });
  const bhCard = U.card(healthRow, { title: T('Billing health'), caption: T('Stripe · period charges, non-intro'), body: el('div') });

  /* empty-state helper: hide `content`, show "not enough data" in `host` */
  function thinToggle(host, content, thin, sub) {
    if (thin) { U.clear(host); host.append(U.emptyState(null, T('Not enough data'), { sub })); host.classList.remove('hidden'); content.classList.add('hidden'); }
    else { host.classList.add('hidden'); U.clear(host); content.classList.remove('hidden'); }
  }
  function chartThin(card, thin, sub) {
    let es = card.body.querySelector('.empty-state');
    const canvas = card.body.querySelector('canvas');
    if (thin) { if (!es) card.body.append(U.emptyState(null, T('Not enough data'), { sub })); canvas.classList.add('hidden'); }
    else { if (es) es.remove(); canvas.classList.remove('hidden'); }
  }

  /* ---------------------------------------------------------------- metric cells */
  const revOf = (o) => (money() === 'net' ? o.rev_net : o.rev_gross);
  const roasHeat = (v) => (v >= 1 ? { kind: 'good', alpha: 0.14 + Math.min(0.5, (v - 1) * 0.45) } : v >= 0.5 ? { kind: 'warn', alpha: 0.12 + (v - 0.5) * 0.5 } : { kind: 'bad', alpha: 0.12 + (0.5 - Math.max(0, v)) * 0.8 });
  const heatFor = (key) => (key === 'roas' ? roasHeat : BB.METRIC_BY_KEY[key].dir > 0 ? 'good' : 'bad');

  /* numerator / denominator pairs for the hover card */
  function numDen(key, r, o) {
    const rev = revOf(o), usd = fmtMoney, int = F.int, pct = F.pct, REV = T('Revenue {m}', { m: money() });
    switch (key) {
      case 'roas': return [[REV, usd(rev)], [T('Spend'), usd(o.spend)]];
      case 'revenue': case 'revenue_gross': case 'revenue_net': return [[T('Revenue {m}', { m: key === 'revenue' ? money() : key.slice(8) }), usd(key === 'revenue_gross' ? o.rev_gross : key === 'revenue_net' ? o.rev_net : rev)], ['—', '—']];
      case 'arpu': case 'ltv': return [[REV, usd(rev)], [T('Signups'), int(o.signups)]];
      case 'arpt': return [[REV, usd(rev)], [T('Trials'), int(o.trials)]];
      case 'arppu': return [[REV, usd(rev)], [T('Payers'), int(o.payers)]];
      case 'paying_rate': return [[T('Payers'), int(o.payers)], [T('Trials'), int(o.trials)]];
      case 'first_rebill_rate': case 'trial_paid_rate': return [[T('1st rebill succeeded'), int(o.firstRebillOk)], [T('Trials ended'), int(o.trialsEnded)]];
      case 'active_rate': return [[T('Active on day N'), int(o.active)], [T('Payers'), int(o.payers)]];
      case 'payers': return [[T('Payers'), int(o.payers)], ['—', '—']];
      case 'refunds': return [[T('Refunds'), usd(o.refunds) + ' (' + int(o.refunds_n) + ')'], ['—', '—']];
      case 'disputes': return [[T('Disputes $ + fee'), usd(o.disputes + o.dispute_fees) + ' (' + int(o.disputes_n) + ')'], ['—', '—']];
      case 'fees': return [[T('Fees'), usd(o.fees)], ['—', '—']];
      case 'refund_rate': return [[T('Refunds $'), usd(o.refunds)], [T('Gross revenue'), usd(o.rev_gross)]];
      case 'dispute_rate': return [[T('Disputes'), int(o.disputes_n)], [T('Succeeded charges'), int(o.charges_ok)]];
      case 'failed_rate': return [[T('Failed attempts'), int(o.failed)], [T('All attempts'), int(o.attempts)]];
      case 'insufficient_share': return [['insufficient_funds', int(o.insufficient)], [T('Failed attempts'), int(o.failed)]];
      case 'cpp': return [[T('Spend'), usd(o.spend)], [T('Payers'), int(o.payers)]];
      case 'mrr': return [[T('Active MRR on day N'), usd(o.active_mrr)], [T('Active subs'), int(o.active)]];
      case 'arr': return [['MRR × 12', usd(o.active_mrr * 12)], ['—', '—']];
      case 'active_subs': return [[T('Active subs'), int(o.active)], ['—', '—']];
      case 'nrr': return [[T('MRR on day N'), usd(o.active_mrr)], [T('MRR at 1st rebill'), usd(o.initial_mrr)]];
      case 'renewals': return [[T('Succeeded rebills'), int(o.renewals)], ['—', '—']];
      case 'avg_renewals': return [[T('Succeeded rebills'), int(o.renewals)], [T('Payers'), int(o.payers)]];
      case 'expected_lifetime': return [[T('Succeeded rebills'), int(o.renewals)], [T('1st rebills'), int(o.firstRebillOk)]];
      case 'ltv_cac': return [['ARPPU', usd(ratio(rev, o.payers))], ['CAC', usd(ratio(o.spend, o.payers))]];
      case 'gross_margin': return [[T('Net revenue'), usd(o.rev_net)], [T('Gross revenue'), usd(o.rev_gross)]];
      case 'voluntary_churn': return [[T('User cancellations'), int(o.churn_vol)], [T('Payers'), int(o.payers)]];
      case 'involuntary_churn': return [[T('Closed by card decline'), int(o.churn_invol)], [T('Payers'), int(o.payers)]];
      case 'recovery_rate': return [[T('Recovered by retry'), int(o.recovered)], [T('Failed first attempts'), int(o.failed_first)]];
      case 'winback_rate': return [[T('Win-backs'), int(o.winbacks)], [T('Payers'), int(o.payers)]];
      case 'upgrade_rate': return [[T('Upgrades'), int(o.upgrades)], [T('Payers'), int(o.payers)]];
      case 'coupon_share': return [[T('Charges with coupon'), int(o.coupon_n) + ' (' + T('{d} discounts', { d: usd(o.coupon_disc) }) + ')'], [T('Succeeded charges'), int(o.charges_ok)]];
      case 'auth_rate': return [[T('Succeeded attempts'), int(o.ok_all)], [T('All attempts'), int(o.attempts_all)]];
      case 'three_ds_share': return [['authentication_required', int(o.three_ds)], [T('All attempts'), int(o.attempts_all)]];
      case 'fee_pct': return [[T('Fees'), usd(o.fees)], [T('Gross revenue'), usd(o.rev_gross)]];
      case 'fx_loss': return [[T('FX fee'), usd(o.fx_fee)], [T('Gross revenue'), usd(o.rev_gross)]];
      case 'revenue_per_visitor': return [[REV, usd(rev)], [T('Landing views'), int(r.landing_views)]];
    }
    return [[T('Value'), pct(BB.metric(r, key, o.N !== undefined ? o.N : MAX_OFF, money()))]];
  }

  /* prediction → metric value for key, given denominators */
  function predValue(key, p, den) {
    const f = (x) => {
      switch (key) {
        case 'roas': return ratio(x, den.spend);
        case 'revenue': case 'revenue_gross': case 'revenue_net': return x;
        case 'arpu': case 'ltv': return ratio(x, den.signups);
        case 'arpt': return ratio(x, den.trials);
        case 'arppu': return ratio(x, p.payers_expected);
      }
      return null;
    };
    if (key === 'payers') return { v: p.payers_expected, lo: null, hi: null };
    if (key === 'paying_rate') return { v: ratio(p.payers_expected, den.trials), lo: null, hi: null };
    return { v: f(p.mid), lo: f(p.lo), hi: f(p.hi) };
  }
  /* aggregated prediction over several rows (total / pivot rows): actual for matured, predicted for immature */
  /* money for a predicted cell: `revenue_gross` / `revenue_net` name their own basis; every other key follows the toggle */
  const moneyForKey = (key) => (key === 'revenue_gross' ? 'gross' : key === 'revenue_net' ? 'net' : money());
  function predAgg(rows, N, mny) {
    mny = mny || money();
    const a = { mid: 0, lo: 0, hi: 0, observed: 0, payers_expected: 0, spend: 0, signups: 0, trials: 0, nPred: 0, pendingUsers: 0, maturedUsers: 0 };
    rows.forEach((r) => {
      const o = r.byOffset[N]; if (!o) return;
      a.spend += r.spend; a.signups += r.signups; a.trials += r.trials; a.maturedUsers += o.maturedUsers;
      if (o.mature) { const rev = mny === 'net' ? o.rev_net : o.rev_gross; a.mid += rev; a.lo += rev; a.hi += rev; a.observed += rev; a.payers_expected += o.payers; }
      else { const p = BB.predict.cohort(r, { offset: N, money: mny, data }); a.mid += p.mid; a.lo += p.lo; a.hi += p.hi; a.observed += p.observed; a.payers_expected += p.payers_expected; a.pendingUsers += p.pendingUsers || 0; a.nPred++; }
    });
    return a;
  }

  /** Table cell for metric `key` at offset N of engine row r (cohort / child / total / pivot / breakdown row). */
  function cellFor(r, N, key) {
    const o = r.byOffset && r.byOffset[N]; if (!o) return null;
    const isAgg = !!r.isTotal;
    const matured = isAgg ? o.maturedRows > 0 : o.mature;
    if (matured) {
      const v = BB.metric(r, key, N, money());
      const cell = { v, o, N, key, partial: isAgg && !o.mature };
      if (key === 'dispute_rate' && v != null && v > BB.DISPUTE_THRESHOLD) cell.over = true;
      return cell;
    }
    if (predictedOn() && PREDICTABLE.has(key)) {
      let p, den;
      if (isAgg) { if (!r._rows) return { v: null, mature: false, o, N, key }; p = predAgg(r._rows, N, moneyForKey(key)); den = p; }
      else { p = BB.predict.cohort(r, { offset: N, money: moneyForKey(key), data }); den = { spend: r.spend, signups: r.signups, trials: r.trials }; }
      const pv = predValue(key, p, den);
      return { v: pv.v, lo: pv.lo, hi: pv.hi, predicted: true, mature: false, p, o, N, key };
    }
    return { v: null, mature: false, o, N, key };
  }

  /* "to date" value of an offset metric for a cohort row (maturity 'date': byOffset[MAX_OFF] holds every event to now).
     Totals / pivot rows: aggregate the children's MAX_OFF counters over all rows (not only matured). */
  function toDateRow(r) {
    if (r._td) return r._td;
    const list = r._rows && r._rows.length ? r._rows : null;
    if (!list) return (r._td = r);
    const g = {}; const td = { spend: 0, signups: 0, trials: 0, qualified: 0, payers: 0, landing_views: 0, byOffset: {}, money: r.money };
    list.forEach((x) => { const o = x.byOffset[MAX_OFF]; if (!o) return; Object.keys(o).forEach((k) => { if (typeof o[k] === 'number') g[k] = (g[k] || 0) + o[k]; }); td.spend += x.spend; td.signups += x.signups; td.trials += x.trials; td.qualified += x.qualified; td.payers += x.payers; td.landing_views += x.landing_views || 0; });
    g.spend = td.spend; g.signups = td.signups; g.trials = td.trials; g.qualified = td.qualified; g.N = MAX_OFF; td.byOffset[MAX_OFF] = g;
    return (r._td = td);
  }
  function toDateCell(r, key) {
    const t = toDateRow(r); const o = t.byOffset[MAX_OFF]; if (!o) return null;
    const v = BB.metric(t, key, MAX_OFF, money());
    return { v, o, N: MAX_OFF, key, toDate: true, over: key === 'dispute_rate' && v != null && v > BB.DISPUTE_THRESHOLD };
  }

  /* Prediction of an engine row at offset N (actual when the cell is mature): cohort / child / breakdown rows → BB.predict.cohort, total / pivot rows → predAgg over their children. Memoised on the row per ltvH | model | money | target. */
  function predAt(r, N) {
    const k = [N, st.model || 'sbg', money(), BB.predict.hashCfg ? BB.predict.hashCfg().key : ''].join('|');
    r._pa = r._pa || {}; if (r._pa[k]) return r._pa[k];
    let p;
    if (r.isTotal && r._rows) { const a = predAgg(r._rows, N, money()); p = { mid: a.mid, lo: a.lo, hi: a.hi, observed: a.observed, trials: a.trials, signups: a.signups, spend: a.spend, basis: a.nPred ? 'predicted' : 'actual', payers_expected: a.payers_expected, pendingUsers: a.pendingUsers, nPred: a.nPred }; }
    else { const q = BB.predict.cohort(r, { offset: N, money: money(), data, model: st.model, signalDay: 'all' }); p = Object.assign({}, q); }
    p.roas = ratio(p.mid, p.spend); p.ltvTrial = ratio(p.mid, p.trials); p.ltvLo = ratio(p.lo, p.trials); p.ltvHi = ratio(p.hi, p.trials);
    return (r._pa[k] = p);
  }
  const rowAgeDays = (r) => (r.bucketStart ? Math.floor((NOW - r.bucketStart) / DAY) : null);
  /* forecast fixed columns: pLTV D{ltvH} / trial (italic + interval when predicted) and pPayback = first offset with pROAS ≥ targetRoas (suppressed on cohorts younger than 3 days: pure prior) */
  function predCol(r, key) {
    const H = U.ltvHorizon(st);
    if (key === 'pltv_trial') { const p = predAt(r, H); return { v: p.ltvTrial, lo: p.ltvLo, hi: p.ltvHi, predicted: p.basis === 'predicted', p, N: H, key, pt: true }; }
    const age = rowAgeDays(r);
    if (age !== null && age < 3) return { v: null, pt: true, key, N: null, young: true, age };
    const tgt = targetRoas();
    for (const N of BB.OFFSETS) { const p = predAt(r, N); if (p.roas != null && p.roas >= tgt) return { v: N, predicted: p.basis === 'predicted', p, N, key, pt: true, target: tgt }; }
    return { v: null, pt: true, key, N: null, none: true, target: tgt, last: predAt(r, BB.OFFSETS[BB.OFFSETS.length - 1]) };
  }
  function predColTip(row, raw) {
    const H = U.ltvHorizon(st), p = raw.p, kv = [];
    if (raw.key === 'pltv_trial') {
      kv.push([raw.predicted ? T('Forecast') : T('Actual'), fmtMoney(raw.v)]);
      if (raw.predicted) kv.push([T('80% interval'), `${fmtMoney(raw.lo)} – ${fmtMoney(raw.hi)}`], [T('Revenue to date'), fmtMoney(p.observed)], [T('Observed'), p.mid > 0 ? F.pct(Math.min(1, p.observed / p.mid)) : '—']);
      kv.push([T('Trials'), F.int(p.trials)], [`pROAS D${H}`, F.x(p.roas)], [T('Model'), modelLabel() + (p.priorShare > 0 ? ` · ${T('prior {pct}', { pct: F.pct(p.priorShare) })}` : '')]);
      return { title: `${row.label} · pLTV D${H} / ${T('trial')}`, formula: T('(revenue received + expected future revenue to D{h}) / trials', { h: H }), kv, note: raw.predicted ? T('Italic — forecast; the cell is actual once every user of the row is D{h} old', { h: H }) : T('Actual — every user of the row is D{h} old', { h: H }) };
    }
    if (raw.young) return { title: `${row.label} · pPayback`, kv: [[T('Cohort age'), BB.plural(raw.age, 'day|days')]], note: T('Suppressed for cohorts younger than 3 days: payback on a D0-only cohort is pure prior') };
    if (raw.none) return { title: `${row.label} · pPayback`, kv: [[T('Target ROAS'), F.x(raw.target)], [`pROAS D${BB.OFFSETS[BB.OFFSETS.length - 1]}`, F.x(raw.last.roas)]], note: T('No payback by D{n} at target ROAS', { n: BB.OFFSETS[BB.OFFSETS.length - 1] }) };
    kv.push([T('Target ROAS'), F.x(raw.target)], [`pROAS D${raw.N}`, F.x(p.roas) + (raw.predicted ? ` [${F.x(ratio(p.lo, p.spend))} – ${F.x(ratio(p.hi, p.spend))}]` : '')], [T('Model'), modelLabel()]);
    return { title: `${row.label} · pPayback`, formula: T('first offset where pROAS ≥ target ROAS'), kv, note: raw.predicted ? T('Italic — the offset is reached in the forecast, not in observed data') : T('Actual — mature offset') };
  }

  /** Hover card for any cell. */
  function cellTip(row, col, raw) {
    const r = row._r; if (!r) return null;
    if (raw && typeof raw === 'object' && raw.pt) return predColTip(row, raw);
    const m = BB.METRIC_BY_KEY[col.metricKey || col.key];
    if (!raw || typeof raw !== 'object' || raw.N === undefined) {
      if (!m) return null;
      const kv = [];
      if (col.key === 'cpt') kv.push([T('Spend'), fmtMoney(r.spend)], [T('Trials'), F.int(r.trials)]);
      else if (col.key === 'cpi') kv.push([T('Spend'), fmtMoney(r.spend)], [T('Signups'), F.int(r.signups)]);
      else if (col.key === 'cpp') kv.push([T('Spend'), fmtMoney(r.spend)], [T('Payers (to date)'), F.int(r.payers)]);
      else if (col.key === 'qualified_rate') kv.push([T('Qualified trials'), F.int(r.qualified)], [T('Trials'), F.int(r.trials)]);
      else if (col.key === 'signup_trial_rate') kv.push([T('Trials'), F.int(r.trials)], [T('Signups'), F.int(r.signups)]);
      else if (col.key === 'payers') kv.push([T('Definition'), BB.payerLabel(st)]);
      else if (col.key === 'payback_day') kv.push(['ROAS D0', F.x(BB.metric(r, 'roas', 0, money()))]);
      if (r.spendAllocated && (col.key === 'spend' || col.key === 'cpt' || col.key === 'cpp' || col.key === 'cpi')) kv.push([T('Spend'), '≈ ' + T('allocated by signups')]);
      return { title: `${row.label} · ${BB.lbl(m)}`, formula: BB.lbl(m, 'formula'), kv };
    }
    const o = raw.o, N = raw.N, mk = BB.METRIC_BY_KEY[raw.key] || m;
    const kv = [];
    if (raw.predicted) {
      const p = raw.p;
      kv.push([T('Forecast'), fmtAuto(raw.key, raw.v)]);
      if (raw.lo != null && raw.hi != null) kv.push([T('80% interval'), fmtAuto(raw.key, raw.lo) + ' – ' + fmtAuto(raw.key, raw.hi)]);
      kv.push([T('Revenue to date'), fmtMoney(p.observed != null ? p.observed : p.mid)], [T('Expected payers'), F.int(p.payers_expected)]);
      if (p.pendingUsers != null) kv.push([T('Users in forecast'), F.int(p.pendingUsers)]);
      kv.push([T('Model'), modelLabel() + (p.priorShare > 0 ? ` · ${T('prior {pct}', { pct: F.pct(p.priorShare) })}` : '')]);
    } else if (raw.td) {
      const d = r.toDate || {}; const int = F.int;
      const pairs = { first_rebill_rate: [[T('1st rebill succeeded'), int(d.firstRebillOk)], [T('Trials ended'), int(d.trialsEnded)]], paying_rate: [[T('Payers'), int(r.payers)], [T('Trials'), int(r.trials)]],
        refund_rate: [[T('Refunds $'), fmtMoney(d.refunds)], [T('Gross revenue'), fmtMoney(d.revenue_gross)]], dispute_rate: [[T('Disputes'), int(d.dispute_rate != null ? Math.round(d.dispute_rate * d.charges_ok) : null)], [T('Succeeded charges'), int(d.charges_ok)]],
        failed_rate: [[T('Failed attempts'), int(d.failed_rate != null ? Math.round(d.failed_rate * d.attempts) : null)], [T('All attempts'), int(d.attempts)]], auth_rate: [[T('Succeeded attempts'), int(d.charges_ok)], [T('All attempts'), int(d.auth_rate ? Math.round(d.charges_ok / d.auth_rate) : null)]] }[raw.key] || [];
      pairs.forEach((pair, i) => kv.push([(i === 0 ? T('Numerator') : T('Denominator')) + ' · ' + pair[0], pair[1]]));
    } else if (raw.v != null && o) {
      numDen(raw.key, r, o).forEach((pair, i) => kv.push([(i === 0 ? T('Numerator') : T('Denominator')) + ' · ' + pair[0], pair[1]]));
    }
    if (raw.toDate) kv.push([T('Slice'), T('all events to today')]);
    else if (raw.td) kv.push([T('Slice'), T('to date (all users)')]);
    else if (o) {
      const users = r._rows ? r._rows.reduce((s, x) => s + ((x.byOffset[N] || {}).maturedUsers || 0), 0) : o.maturedUsers;
      const base = r.isTotal && !raw.predicted ? (o.signups || r.signups) : r.signups;
      kv.push([T('Users aged D{n}', { n: N }), F.int(users)], [T('Matured'), raw.predicted ? F.pct(ratio(users, r.signups)) + ' (' + T('forecast for the rest') + ')' : F.pct(ratio(users, base))]);
    }
    if (['payers', 'paying_rate', 'cpp', 'arppu', 'ltv_cac'].includes(raw.key)) kv.push([T('Payers'), BB.payerLabel(st)]);
    let note = null;
    if (raw.partial) note = T('Total over {m} mature cohorts of {n} (sums of numerators and denominators)', { m: o.maturedRows, n: r.rows || (r._rows && r._rows.length) || '?' });
    else if (raw.v == null && !raw.predicted && !raw.toDate && !raw.td) note = T('Cohort not yet mature at D{n}: matures in {d} d.', { n: N, d: Math.max(1, N - Math.floor((BB.util.startOfDay(NOW) - Math.min(BB.util.startOfDay(r.cohortEnd != null ? r.cohortEnd : (r.bucketEnd ? r.bucketEnd - DAY : NOW)), BB.util.startOfDay(NOW))) / DAY)) });
    else if (raw.over) note = T('Above Stripe threshold 0.75 %');
    const title = raw.toDate || raw.td ? `${row.label} · ${BB.lbl(mk)} (${T('to date')})` : `${row.label} · ${BB.lbl(mk)} D${N}`;
    return { title, formula: BB.lbl(mk, 'formula'), kv, note };
  }

  /* ---------------------------------------------------------------- view rows */
  function viewRow(r, metricKey) {
    const v = { key: r.key, label: r.label, _r: r };
    st.cols.forEach((k) => {
      if (PRED_COLS.includes(k)) { let memo; Object.defineProperty(v, k, { enumerable: true, configurable: true, get: () => (memo || (memo = predCol(r, k))) }); } // lazy: computed only for rows the table reads (visible, sorted or exported)
      else if (ROW_LEVEL.includes(k)) v[k] = k === 'cpp' ? ratio(r.spend, r.payers) : k === 'payers' ? r.payers : BB.metric(r, k, undefined, money());
      else v[k] = toDateCell(r, k);
    });
    if (r.spendAllocated && !r.isTotal) v.sub = '≈';
    if (r.isOther) v.sub = BB.plural(r.count, 'value|values');
    BB.OFFSETS.forEach((N) => { v['d' + N] = cellFor(r, N, metricKey); });
    if (r.children && r.children.length) v.children = r.children.map((k) => viewRow(k, metricKey));
    else if (st.g2 && r.groupKey !== undefined && !pivotOn()) v._lazy = true; // level-1 child → level-2 on expand
    return v;
  }
  /* second group-by level: cohorts of the same buckets, filtered to dim1 = value, grouped by dim2 (lazy, cached per value) */
  const l2cache = new Map();
  function lazyChildren(v) {
    if (v._kids) return v._kids;
    const r = v._r; if (!r || !st.groupBy || !st.g2) return [];
    const key = st.groupBy + '=' + r.label;
    let res = l2cache.get(key);
    if (!res) {
      const filters = Object.assign({}, st.filters, { [st.groupBy]: [r.label] });
      res = BB.cohorts({ data, state: Object.assign({}, st, { filters, groupBy: st.g2 }), offsets: BB.OFFSETS });
      l2cache.set(key, res);
    }
    const parent = res.rows.find((x) => x.key === r.groupKey);
    v._kids = parent && parent.children ? parent.children.map((k) => { const c = viewRow(k, st.metric); c.key = r.key + '|' + k.label; delete c._lazy; c.sub = (k.spendAllocated ? '≈ ' : '') + dimLabel(st.g2); return c; }) : [];
    return v._kids;
  }
  const fixedCols = () => st.cols.map((k) => {
    if (PRED_COLS.includes(k)) {
      const H = U.ltvHorizon(st);
      if (k === 'pltv_trial') return { key: k, label: PRED_LBL(k), fmt: mf('usd2'), width: 104, heatmap: 'good', heatmapPredicted: false, dir: 1, tip: T('(revenue received + expected future revenue to D{h}) / trials · italic = forecast, 80 % interval in tooltip · model {m}', { h: H, m: modelLabel() }) };
      return { key: k, label: PRED_LBL(k), fmt: 'days', width: 84, tip: T('First offset where pROAS ≥ target ROAS ({t}, hash targetRoas) · italic = reached in the forecast · — = none by D360 or cohort younger than 3 days', { t: F.x(targetRoas()) }) };
    }
    const m = BB.METRIC_BY_KEY[k], td = !ROW_LEVEL.includes(k);
    const c = { key: k, metricKey: k, metric: k, label: ML(k) + (td ? ' ↦' : ''), fmt: fmtFor(k), width: td ? 92 : k === 'spend' ? 84 : k === 'qualified_rate' ? 92 : 76, tip: (td ? T('to date') + ' · ' : '') + MF(k) + (['payers', 'cpp'].includes(k) ? ' · ' + BB.payerLabel(st) : '') };
    if (['cpt', 'cpp', 'cpi'].includes(k)) { c.heatmap = 'bad'; c.dir = 1; }
    else if (k === 'qualified_rate') c.heatmap = 'good';
    else if (td) { c.heatmap = k === 'roas' ? roasHeat : heatFor(k); c.dir = 1; }
    return c;
  });
  function cohortColumns() {
    const m = BB.METRIC_BY_KEY[st.metric];
    return [{ key: 'label', label: T('Cohort'), sticky: true, width: 172, text: true }].concat(fixedCols(),
      BB.OFFSETS.map((N) => ({ key: 'd' + N, metricKey: st.metric, metric: st.metric, label: 'D' + N, fmt: fmtFor(st.metric), heatmap: heatFor(st.metric), dir: 1, heatmapPredicted: false, width: 78, hidden: !st.offsets.includes(N), tip: `${BB.lbl(m)} D${N} = ${BB.lbl(m, 'formula')}` })));
  }

  /* pivot rows: one weighted row per dim value over all cohort buckets (BB.totalRow semantics) */
  function pivotRows(c) {
    const byV = new Map();
    c.rows.forEach((r) => (r.children || []).forEach((k) => { const a = byV.get(k.label); if (a) a.push(k); else byV.set(k.label, [k]); }));
    const mk = (label, list) => { const t = BB.totalRow(list, BB.OFFSETS, label); t.key = 'pv|' + label; t.basis = c.basis; t._rows = list; t.spendAllocated = list.some((x) => x.spendAllocated); return t; };
    let rows = Array.from(byV.entries()).map(([v, list]) => mk(v, list)).sort((a, b) => b.spend - a.spend || b.signups - a.signups);
    if (rows.length > 15) {
      const rest = rows.slice(15), list = [].concat.apply([], rest.map((r) => r._rows));
      const other = mk(T('Other'), list); other.isOther = true; other.count = rest.length;
      rows = rows.slice(0, 15).concat([other]);
    }
    return rows;
  }

  const dateRange = (r) => `${dayLabel(r.from)} – ${dayLabel(r.to)} ${new Date(r.to).getUTCFullYear()}`;

  /* ---------------------------------------------------------------- render */
  let cur = null;
  function render() {
    const t0 = performance.now();
    l2cache.clear(); bdCache.clear();
    CUR = st.currency === 'local' ? (() => { const c = BB.localCurrency(data, st); return c.code === 'USD' ? null : c; })() : null;
    const c = BB.cohorts({ data, state: st, offsets: BB.OFFSETS });
    c.total._rows = c.rows; c.total.basis = c.basis;
    const co = BB.state.compareOf(st, c.range);
    const cmp = co ? BB.cohorts({ data, state: co.state, offsets: BB.OFFSETS }) : null;
    cur = { c, cmp, co };

    /* head */
    const nUsers = c.total.signups;
    const bits = [dateRange(c.range), BB.plural(nUsers, 'user|users', { fmt: F.int })];
    if (st.channel && st.channel !== 'all') bits.push(T('channel: {c}', { c: chLabel(st.channel) }));
    if (st.account && st.account !== 'all') bits.push(T('account: {a}', { a: st.account }));
    if (st.device && st.device !== 'all') bits.push(T('device: {d}', { d: st.device }));
    if (CUR) bits.push(T('currency {c} ({p} of users)', { c: CUR.code, p: F.pct(CUR.share) }));
    else if (st.currency === 'local') bits.push(T('currency USD (no dominant local)'));
    bits.push(SRC);
    sh.setSubtitle(bits.join(' · '));
    allocBadge.classList.toggle('hidden', !c.spendAllocated); // the engine decides (country / geo_tier with spend-side country data are NOT allocated)
    payerBadge.textContent = T('Payers: {p}', { p: PAYER_LBL() }); payerBadge.title = BB.payerLabel(st);
    mdlBadges.update();
    tb.update(tbCfg()); groupMetricSelect();
    prSeg.set(st.pr);

    const thin = U.isThin(nUsers);
    renderKpis(c, cmp, co);
    renderTable(c, thin);
    renderCharts(c, thin);
    renderMrr(thin);
    renderRetention(thin);
    renderBreakdown();
    renderChurn(thin);
    renderBilling();
    if (window.BB_DEBUG) console.log('cohorts render', Math.round(performance.now() - t0), 'ms');
  }

  function renderKpis(c, cmp, co) {
    const TOT = c.total, P = cmp ? cmp.total : null;
    const seq = c.rows.slice().reverse();
    const mature = (r, N) => (r.isTotal ? r.byOffset[N].maturedRows > 0 : r.byOffset[N].mature);
    const val = (r, k) => {
      switch (k) {
        case 'spend': return r.spend; case 'trials': return r.trials; case 'payers': return r.payers;
        case 'cpt': return BB.metric(r, 'cpt'); case 'cpp': return ratio(r.spend, r.payers);
        case 'roas7': return mature(r, 7) ? BB.metric(r, 'roas', 7, st.money) : null;
        case 'roas30': return mature(r, 30) ? BB.metric(r, 'roas', 30, st.money) : null;
        case 'payback': return BB.paybackDay(r, st.money);
      }
      return null;
    };
    const delta = (k) => { if (!P) return null; if (co && co.valid === false) return 'na'; return BB.fmt.rel(val(TOT, k), val(P, k)); }; // incomplete compare window → '—'
    const spark = (k) => seq.map((r) => val(r, k));
    const dl = !co ? T('compare off') : co.kind === 'channel' ? T('vs channel {c} (same period)', { c: chLabel(co.channel) }) : T('vs period {from} – {to}', { from: dayLabel(co.range.from), to: dayLabel(co.range.to) });
    const mk = (label, k, fmt, dir, hint, metric) => ({ label, value: val(TOT, k), fmt, delta: delta(k), dir, spark: spark(k), hint, deltaLabel: dl, basis: dl, metric });
    const payerShort = PAYER_LBL();
    const cards = [
      mk(ML('spend'), 'spend', mf('usd'), 0, MF('spend') + (c.spendAllocated ? ' (≈ ' + T('allocated') + ')' : '')), // dir 0: spend is neutral
      mk(ML('trials'), 'trials', 'int', 1, T('Trial starts in period cohorts')),
      mk(ML('cpt'), 'cpt', mf('usd2'), -1, MF('cpt')),
      mk(ML('payers'), 'payers', 'int', 1, T('Payers to date') + ' · ' + BB.payerLabel(st)),
      mk(ML('cpp'), 'cpp', mf('usd2'), -1, MF('cpp') + ' · ' + BB.payerLabel(st)),
      mk('ROAS D7', 'roas7', 'x', 1, T('revenue to D{n} / spend — mature cohorts only', { n: 7 })),
      mk('ROAS D30', 'roas30', 'x', 1, T('revenue to D{n} / spend — mature cohorts only', { n: 30 })),
      mk(ML('payback_day'), 'payback', 'days', -1, T('First DN with weighted ROAS ≥ 1.0x (mature only)')),
    ];
    cards[3].group = payerShort; cards[4].group = payerShort;
    const m7 = TOT.byOffset[7].maturedRows, m30 = TOT.byOffset[30].maturedRows;
    cards[5].sub = m7 ? T('{m}/{n} mature', { m: m7, n: c.rows.length }) : T('no mature');
    cards[6].sub = m30 ? T('{m}/{n} mature', { m: m30, n: c.rows.length }) : T('no mature');
    if (cards[7].value == null) { cards[7].sub = T('not paid back'); cards[7].delta = null; cards[7].basis = false; }
    if (P) { const pb = val(P, 'payback'); if (pb != null) cards[7].interval = T('prev. D{n}', { n: pb }); }
    const mr = BB.mrr({ data, state: st });
    /* global "LTV D{ltvH} / trial" tile (shared definition on all boards) right after CPT */
    const sliceKey = (r) => [isoDate(r.from), isoDate(r.to), st.basis, st.channel, st.device, JSON.stringify(BB.effFilters(st))].join('|');
    const ltvTile = U.ltvKpi({ data, total: TOT, st, sliceKey: sliceKey(c.range), cmpTotal: P, cmpKey: co ? sliceKey(co.range) + '|' + (co.channel || '') : null, cmpValid: co ? co.valid : null, deltaLabel: dl, cur: CUR });
    cards.splice(3, 0, ltvTile);
    U.kpiRow(kpiHost, cards, { cols: 6 });
    cur.mrr = mr;
  }

  function renderTable(c, thin) {
    const m = BB.METRIC_BY_KEY[st.metric];
    metricBadge.textContent = BB.lbl(m);
    let rows, total, caption;
    if (pivotOn()) {
      rows = pivotRows(c).map((r) => viewRow(r, st.metric)); total = viewRow(c.total, st.metric);
      caption = `${BB.lbl(m)} · ${T('pivot by {dim} over period · weighted over {step} cohorts', { dim: `«${dimLabel(st.groupBy)}»`, step: STEP_LBL[st.step] })}`;
    } else {
      rows = c.rows.map((r) => viewRow(r, st.metric)); total = viewRow(c.total, st.metric);
      caption = `${BB.lbl(m)} · ${STEP_LBL[st.step]} · ${BASIS_LBL[c.basis]} · ${T('newest first')}` + (st.groupBy ? ` · ${T('breakdown by {dim}', { dim: `«${dimLabel(st.groupBy)}»${st.g2 ? ` ▸ «${dimLabel(st.g2)}»` : ''}` })} (${T('click a cohort')})` : '');
    }
    tblCard.setCaption(caption);
    expandBtn.classList.toggle('hidden', !(st.groupBy && !pivotOn()));
    thinToggle(tblEmpty, tblHost, thin, T('{n} users in slice, need ≥ {min}', { n: F.int(c.total.signups), min: BB.MIN_USERS }));
    if (!thin) tbl.update({ columns: cohortColumns(), rows, total });
  }

  function renderCharts(c, thin) {
    if (curveChart) { curveChart.destroy(); curveChart = null; }
    if (rebillChart) { rebillChart.destroy(); rebillChart = null; }
    chartThin(curveCard, thin); chartThin(rebillCard, thin);
    if (thin) return;
    const fg4 = U.cssVar('--fg-4') || '#62666d';
    /* 1. ROAS curves */
    const labels = BB.OFFSETS.map((n) => 'D' + n);
    const last = c.rows.slice(0, 5); // ≤ 5 cohort lines (+ weighted): the ordinal ramp has 5 distinguishable steps
    const fg2 = U.cssVar('--fg-2') || '#d0d6e0';
    /* cohorts are ordered → one-hue ramp (oldest light → newest dark); the weighted aggregate is the neutral ink line, not a 9th hue */
    const ds = last.slice().reverse().map((r, i) => ({ label: r.label, data: BB.OFFSETS.map((N) => (r.byOffset[N].mature ? BB.metric(r, 'roas', N, st.money) : null)), borderColor: U.ordinal(i, last.length), _nmOrd: [i, last.length] })).reverse();
    ds.unshift({ label: T('Weighted'), data: BB.OFFSETS.map((N) => (c.total.byOffset[N].maturedRows > 0 ? BB.metric(c.total, 'roas', N, st.money) : null)), borderWidth: 2.5, fill: true, borderColor: fg2 });
    ds.push({ label: '1.0x', data: BB.OFFSETS.map(() => 1), borderColor: fg4, borderDash: [4, 4], borderWidth: 1, tension: 0, pointRadius: 0, pointHoverRadius: 0 });
    const maxV = Math.max(1.1, ...ds.flatMap((d) => d.data).filter((v) => typeof v === 'number'));
    curveChart = U.chart(curveCard.body.querySelector('canvas'), { type: 'line', data: { labels, datasets: ds }, options: { spanGaps: false, scales: { x: { grid: { display: false } }, y: { min: 0, suggestedMax: Math.min(maxV * 1.08, 3), ticks: { callback: (v) => v.toFixed(1) + 'x' } } },
      plugins: { tooltip: { filter: (i) => i.dataset.label !== '1.0x', callbacks: { label: (i) => ` ${i.dataset.label}: ${i.parsed.y == null ? '—' : i.parsed.y.toFixed(2) + 'x'}` } }, legend: { labels: { filter: (l) => l.text !== '1.0x' } } } } });
    curveCard.setCaption(T('last {n} cohorts ({shade} = newer) · bold = weighted · dashed = 1.0x · mature points only', { n: last.length, shade: U.getTheme() === 'light' ? T('darker') : T('lighter') }));
    curveView.refresh();

    /* 2. first-rebill outcome per cohort */
    const n = st.step === 'day' ? 14 : 16;
    const seq = c.rows.slice(0, n).reverse();
    const ix = data.index;
    const cat = seq.map((r) => {
      const o = { ok: 0, insuf: 0, other: 0, cancel: 0, pending: 0 };
      (r._users || []).forEach((u) => {
        const t = u._trial; if (!t) return;
        const P = BB.PLAN_BY_ID[t.plan], tEnd = t.ts + (P ? P.trialDays : 3) * DAY;
        if (t.cancelled_ts) { o.cancel++; return; }
        if (tEnd > NOW) { o.pending++; return; }
        const cs = ix.chargesByUser.get(u.user_id) || [];
        let ok = false, insuf = false, fail = false;
        for (const ch of cs) { if (ch.type !== 'rebill' || ch.n !== 1) continue; if (ch.status === 'succeeded') { ok = true; break; } fail = true; if (ch.decline_code === 'insufficient_funds') insuf = true; }
        if (ok) o.ok++; else if (insuf) o.insuf++; else if (fail) o.other++; else o.pending++;
      });
      return o;
    });
    const short = (l) => (st.step === 'week' ? l.split(' · ').pop() : l);
    rebillChart = U.chart(rebillCard.body.querySelector('canvas'), { type: 'bar', data: { labels: seq.map((r) => short(r.label)), datasets: [
      /* fixed entity slots shared with "Churn reasons": paid = aqua(3), insufficient = orange(2), other decline = yellow(4), user cancel = magenta(5), pending = neutral */
      { label: T('Rebill succeeded'), data: cat.map((o) => o.ok), backgroundColor: U.palette(2) },
      { label: T('Decline: insufficient_funds'), data: cat.map((o) => o.insuf), backgroundColor: U.palette(1) },
      { label: T('Decline: other'), data: cat.map((o) => o.other), backgroundColor: U.palette(3) },
      { label: T('Cancelled in trial'), data: cat.map((o) => o.cancel), backgroundColor: U.palette(4) },
      { label: T('Pending (trial running)'), data: cat.map((o) => o.pending), backgroundColor: U.cssVar('--bg-3') || '#1c1d1f' },
    ] }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } },
      plugins: { tooltip: { callbacks: { footer: (items) => { const tot = items.reduce((a, i) => a + (i.parsed.y || 0), 0); const ok = items.find((i) => i.datasetIndex === 0); return T('Trials: {n}', { n: tot }) + (ok && tot ? ' · ' + T('1st rebill {p} %', { p: (ok.parsed.y / tot * 100).toFixed(1) }) : ''); } } } } } });
    rebillCard.setCaption(T('1st rebill outcome · last {n} {step} cohorts', { n: seq.length, step: STEP_LBL[st.step] }));
    rebillView.refresh();
  }

  /* MRR movement: stacked bars new / expansion / −contraction / −churned + net line (calendar time, BB.mrr) */
  function renderMrr(thin) {
    if (mrrChart) { mrrChart.destroy(); mrrChart = null; }
    chartThin(mrrCard, thin);
    const mr = cur.mrr || BB.mrr({ data, state: st });
    mrrCard.setCaption(T('{step} · MRR now {mrr} · ARR {arr} · {subs}', { step: STEP_LBL[st.step], mrr: fmtMoney(mr.current.mrr), arr: fmtMoney(mr.current.arr), subs: BB.plural(mr.current.activeSubs, 'active sub|active subs', { fmt: F.int }) }));
    if (thin) return;
    const b = mr.buckets, short = (l) => (st.step === 'week' ? l.split(' · ').pop() : l);
    const rate = CUR ? CUR.rate : 1, cv = (v) => v * rate;
    const signedMoney = (v) => (v < 0 ? '−' : '') + (CUR ? CUR.symbol : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
    mrrChart = U.chart(mrrCard.body.querySelector('canvas'), { type: 'bar', data: { labels: b.map((x) => short(x.label)), datasets: [
      { label: T('New (+ reactivated)'), data: b.map((x) => cv(x.new + x.reactivated)), backgroundColor: U.palette(2), stack: 'mrr' },
      { label: T('Expansion'), data: b.map((x) => cv(x.expansion)), backgroundColor: U.palette(0), stack: 'mrr' },
      { label: T('Contraction'), data: b.map((x) => -cv(x.contraction)), backgroundColor: U.palette(3), stack: 'mrr' },
      { label: T('Churned'), data: b.map((x) => -cv(x.churned)), backgroundColor: U.palette(1), stack: 'mrr' },
      { label: T('Net'), type: 'line', data: b.map((x) => cv(x.net)), borderColor: U.cssVar('--fg-2') || '#d0d6e0', borderWidth: 2, tension: 0.3, pointRadius: 2, pointHoverRadius: 4, order: 0 },
    ] }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (v) => signedMoney(v) } } },
      plugins: { tooltip: { callbacks: { label: (i) => ` ${i.dataset.label}: ${signedMoney(i.parsed.y)}`, footer: (items) => { const x = b[items[0].dataIndex]; return T('MRR: {a} → {b} · {subs} subs · {n} new / {c} churned', { a: fmtMoney(x.starting), b: fmtMoney(x.ending), subs: F.int(x.activeSubs), n: x.newSubs, c: x.churnedSubs }); } } } } } });
    mrrView.refresh();
  }

  /* Paid retention: survival by renewal # per plan / channel / current group-by */
  function renderRetention(thin) {
    if (prChart) { prChart.destroy(); prChart = null; }
    const dim = st.pr === 'group' ? (st.groupBy || 'plan') : st.pr;
    const pr = BB.paidRetention({ data, state: st, groupBy: dim });
    const tot = pr.total;
    prCard.setCaption(T('{dim} · {payers} with 1st rebill · {avg} renewals per payer', { dim: dimLabel(dim), payers: BB.plural(tot.payers, 'payer|payers', { fmt: F.int }), avg: tot.avgRenewals != null ? tot.avgRenewals.toFixed(2) : '—' }));
    const thinPr = thin || U.isThin(tot.payers);
    let es = prCard.body.querySelector('.empty-state'); if (es) es.remove();
    prChartHost.classList.toggle('hidden', thinPr); prTblHost.classList.toggle('hidden', thinPr);
    if (thinPr) { prCard.body.append(U.emptyState(null, T('Not enough data'), { sub: T('{n} payers in slice, need ≥ {min}', { n: F.int(tot.payers), min: BB.MIN_USERS }) })); return; }
    const rows = pr.rows.slice(0, 8);
    const maxK = Math.max(2, ...rows.concat([tot]).map((r) => r.points.length));
    const labels = []; for (let k = 1; k <= maxK; k++) labels.push('k=' + k);
    const series = (r) => labels.map((_, i) => (r.points[i] ? r.points[i].rate : null));
    const ds = rows.map((r) => ({ label: `${r.label} (${r.payers})`, data: series(r), borderColor: dim === 'channel' && BB.CHANNEL_BY_ID[r.key || r.label] ? U.channelColor(r.key || r.label) : U.entityColor('pr:' + dim, r.key) })); // colour follows the entity, not its rank
    ds.unshift({ label: T('All payers'), data: series(tot), borderColor: U.cssVar('--fg-2') || '#d0d6e0', borderWidth: 2.5, fill: true });
    prChart = U.chart(prChartHost.querySelector('canvas'), { type: 'line', data: { labels, datasets: ds }, options: { spanGaps: false, scales: { x: { grid: { display: false }, title: { display: true, text: T('renewal # k') } }, y: { min: 0, max: 1, ticks: { callback: (v) => Math.round(v * 100) + '%' } } },
      plugins: { tooltip: { callbacks: { label: (i) => { const r = i.datasetIndex === 0 ? tot : rows[i.datasetIndex - 1]; const p = r.points[i.dataIndex]; return ` ${i.dataset.label}: ${p ? F.pct(p.rate) + ` (${p.alive}/${p.atRisk}, D${p.day})` : '—'}`; } } } } } });
    const ks = [2, 3, 4, 6, 8, 12].filter((k) => k <= maxK);
    const rowOf = (r) => { const v = { key: r.key, label: r.label, payers: r.payers, period: r.period === 'month' ? T('month') : T('week'), avg: r.avgRenewals }; ks.forEach((k) => { const p = r.points[k - 1]; v['k' + k] = p ? { v: p.rate, tip: T('{a} / {b} payers, day {d}', { a: p.alive, b: p.atRisk, d: p.day }) } : { v: null, mature: false }; }); return v; };
    U.table(prTblHost, { columns: [
      { key: 'label', label: dimLabel(dim), sticky: true, text: true, width: 120 },
      { key: 'payers', label: ML('payers'), fmt: 'int', width: 72 }, { key: 'period', label: T('Period'), text: true, width: 64, sortable: false },
      { key: 'avg', label: ML('avg_renewals'), fmt: 'num', heatmap: 'good', width: 86, tip: MF('avg_renewals') },
      ...ks.map((k) => ({ key: 'k' + k, label: 'k=' + k, fmt: 'pct', heatmap: 'good', width: 64, tip: T('payers with a succeeded {k}-th charge among those due', { k }) })),
    ], rows: pr.rows.map(rowOf), total: Object.assign(rowOf(tot), { label: T('All payers') }), sort: { key: 'payers', dir: 'desc' }, maxHeight: 240, cellTip: (row, col, raw) => (raw && typeof raw === 'object' && raw.tip ? { title: `${row.label} · ${col.label}`, kv: [[T('Numerator / denominator'), raw.tip]] } : null) });
  }

  /* Breakdown matrix (per-user maturity; to-date columns use row.toDate; dim1 ▸ dim2 lazily on expand) */
  const bdCache = new Map();
  function bdRowOf(r, depth) {
    const td = r.toDate || {};
    const tdCell = (key, over) => ({ v: td[key] === undefined ? null : td[key], o: null, N: MAX_OFF, key, td: true, over: !!over && td[key] != null && td[key] > BB.DISPUTE_THRESHOLD });
    const v = { key: r.key, label: r.label, _r: r, spend: r.spend, trials: r.trials, signups: r.signups, cpt: BB.metric(r, 'cpt'), qualified_rate: BB.metric(r, 'qualified_rate'),
      first_rebill_rate: tdCell('first_rebill_rate'), paying_rate: tdCell('paying_rate'), refund_rate: tdCell('refund_rate'), dispute_rate: tdCell('dispute_rate', true), failed_rate: tdCell('failed_rate'), auth_rate: tdCell('auth_rate'),
      payers: r.payers, cpp: ratio(r.spend, r.payers), payback_day: BB.paybackDay(r, st.money) };
    /* forecast columns (lazy, memoised on the engine row): pLTV D{ltvH} / trial and max CPT at the target ROAS (BB.predict.maxCpt) */
    let bp; const bdPred = () => bp || (bp = BB.predict.maxCpt({ row: r, targetRoas: targetRoas(), horizon: U.ltvHorizon(st), money: money(), data, model: st.model }));
    Object.defineProperty(v, 'pltv_trial', { enumerable: true, configurable: true, get: () => { const m = bdPred(), p = predAt(r, U.ltvHorizon(st)); return { v: m.pLtvPerTrial, lo: p.ltvLo, hi: p.ltvHi, predicted: p.basis === 'predicted', p, N: U.ltvHorizon(st), key: 'pltv_trial', pt: true }; } });
    Object.defineProperty(v, 'max_cpt', { enumerable: true, configurable: true, get: () => { const m = bdPred(), p = predAt(r, U.ltvHorizon(st)); return r.trials < 10 ? { v: null, tip: U.tipHtml({ title: `${r.label} · max CPT`, note: T('Not enough data') + ' (< 10 ' + T('trials') + ')' }) } : { v: m.maxCpt, predicted: p.basis === 'predicted', cls: m.headroomPct == null ? null : m.headroomPct >= 15 ? 'good' : m.headroomPct <= -15 ? 'bad' : null, tip: U.tipHtml({ title: `${r.label} · max CPT D${U.ltvHorizon(st)}`, formula: T('max CPT = pLTV per trial / target ROAS'), kv: [[T('Target ROAS'), F.x(targetRoas())], [T('CPT now'), fmtMoney(m.currentCpt)], [T('Headroom'), m.headroomPct == null ? '—' : (m.headroomPct >= 0 ? '+' : '') + m.headroomPct.toFixed(0) + ' %'], [`pROAS D${U.ltvHorizon(st)}`, F.x(m.pRoas)], [T('Verdict'), m.verdict]], note: T('green: can pay ≥ 15 % more · red: overpaying by ≥ 15 %') }) }; } });
    if (r.isOther) v.sub = BB.plural(r.count, 'value|values');
    else if (depth) v.sub = dimLabel(st.bdim2);
    if (r.spendAllocated && !r.isTotal && !depth) v.sub = '≈';
    [0, 3, 7, 30, 90].forEach((N) => { v['r' + N] = cellFor(r, N, 'roas'); });
    if (!depth && st.bdim2 && !r.isOther && !r.isTotal) v._lazyBd = true;
    return v;
  }
  /* total row of a breakdown: to-date ratios from the rows' to-date numerators / denominators */
  function bdTotal(b) {
    const t = b.total; const s = { fro: 0, te: 0, ref: 0, rg: 0, dn: 0, cok: 0, fl: 0, at: 0, aa: 0 };
    b.rows.forEach((r) => { const d = r.toDate; if (!d) return; s.fro += d.firstRebillOk || 0; s.te += d.trialsEnded || 0; s.ref += d.refunds || 0; s.rg += d.revenue_gross || 0; s.cok += d.charges_ok || 0; s.dn += d.dispute_rate != null ? d.dispute_rate * d.charges_ok : 0; s.at += d.attempts || 0; s.fl += d.failed_rate != null ? d.failed_rate * d.attempts : 0; s.aa += d.auth_rate ? d.charges_ok / d.auth_rate : 0; });
    t.toDate = { first_rebill_rate: ratio(s.fro, s.te), paying_rate: ratio(t.payers, t.trials), refund_rate: ratio(s.ref, s.rg), dispute_rate: ratio(s.dn, s.cok), failed_rate: ratio(s.fl, s.at), auth_rate: ratio(s.cok, s.aa) };
    return bdRowOf(t, 0);
  }
  function lazyBdChildren(v) {
    if (v._kids) return v._kids;
    const r = v._r; if (!r || !st.bdim2) return [];
    let b = bdCache.get(r.label);
    if (!b) {
      const filters = Object.assign({}, st.filters, { [st.bdim]: [r.label] });
      b = BB.breakdown({ data, state: Object.assign({}, st, { filters }), dim: st.bdim2, offsets: BB.OFFSETS, topN: 10 });
      bdCache.set(r.label, b);
    }
    v._kids = b.rows.map((k) => { const c = bdRowOf(k, 1); c.key = r.key + '|' + k.label; return c; });
    return v._kids;
  }
  function renderBreakdown() {
    const dim = st.bdim;
    bdSel.set(dim); bdSel2.set(st.bdim2 || '');
    bdSel2.setOptions([{ id: '', label: T('none') }].concat(DIMS.filter((d) => d.id !== dim)), st.bdim2 || '');
    const b = BB.breakdown({ data, state: st, dim, offsets: BB.OFFSETS, topN: 15 });
    b.total._rows = b.rows; b.total.basis = b.rows[0] ? b.rows[0].basis : st.basis;
    bdAlloc.classList.toggle('hidden', !b.spendAllocated);
    const hidden = new Set((bdTbl.state.columns || []).filter((c) => c.hidden).map((c) => c.key));
    const first = !(bdTbl.state.columns || []).length;
    const H = (k, dflt) => (first ? !dflt : hidden.has(k));
    const payerTip = ' · ' + BB.payerLabel(st);
    const cols = [
      { key: 'label', label: dimLabel(dim) + (st.bdim2 ? ` ▸ ${dimLabel(st.bdim2)}` : ''), sticky: true, width: 160, text: true },
      { key: 'spend', metric: 'spend', label: ML('spend'), fmt: mf('usd'), width: 84, hidden: H('spend', true) },
      { key: 'signups', metric: 'signups', label: ML('signups'), fmt: 'int', width: 92, hidden: H('signups', false) },
      { key: 'trials', metric: 'trials', label: ML('trials'), fmt: 'int', width: 72, hidden: H('trials', true) },
      { key: 'cpt', metricKey: 'cpt', metric: 'cpt', label: 'CPT', fmt: mf('usd2'), heatmap: 'bad', dir: 1, width: 76, hidden: H('cpt', true) },
      { key: 'qualified_rate', metricKey: 'qualified_rate', metric: 'qualified_rate', label: ML('qualified_rate'), fmt: 'pct', heatmap: 'good', width: 84, hidden: H('qualified_rate', true) },
      { key: 'first_rebill_rate', metricKey: 'first_rebill_rate', label: ML('first_rebill_rate'), fmt: 'pct', heatmap: 'good', width: 100, tip: T('succeeded 1st rebill / trials ended to date'), hidden: H('first_rebill_rate', true) },
      { key: 'refund_rate', metricKey: 'refund_rate', label: ML('refund_rate'), fmt: 'pct', heatmap: 'bad', dir: 1, width: 92, tip: T('Σ refunds $ / gross revenue, to date'), hidden: H('refund_rate', true) },
      { key: 'dispute_rate', metricKey: 'dispute_rate', label: ML('dispute_rate'), fmt: 'pct', heatmap: 'bad', dir: 1, width: 88, tip: T('disputes / succeeded charges, to date · Stripe threshold 0.75 %'), hidden: H('dispute_rate', true) },
      { key: 'paying_rate', metricKey: 'paying_rate', label: ML('paying_rate'), fmt: 'pct', heatmap: 'good', width: 92, tip: T('payers / trials, to date') + payerTip, hidden: H('paying_rate', false) },
      { key: 'payers', metricKey: 'payers', label: ML('payers'), fmt: 'int', width: 80, tip: T('payers to date') + payerTip, hidden: H('payers', false) },
      { key: 'cpp', metricKey: 'cpp', label: ML('cpp'), fmt: mf('usd2'), heatmap: 'bad', dir: 1, width: 76, tip: T('spend / payers (to date)') + payerTip, hidden: H('cpp', false) },
      ...[0, 3, 7, 30, 90].map((N) => ({ key: 'r' + N, metricKey: 'roas', metric: 'roas', label: 'ROAS D' + N, fmt: 'x', heatmap: roasHeat, heatmapPredicted: false, width: 84, tip: T('revenue to D{n} / spend · matured users only', { n: N }), hidden: H('r' + N, N !== 90) })),
      { key: 'failed_rate', metricKey: 'failed_rate', label: ML('failed_rate'), fmt: 'pct', heatmap: 'bad', dir: 1, width: 84, tip: T('failed / all attempts (non-intro), to date'), hidden: H('failed_rate', false) },
      { key: 'auth_rate', metricKey: 'auth_rate', label: ML('auth_rate'), fmt: 'pct', heatmap: 'good', width: 104, tip: T('succeeded / all charge attempts (incl. intro), to date'), hidden: H('auth_rate', false) },
      { key: 'payback_day', metricKey: 'payback_day', metric: 'payback_day', label: ML('payback_day'), fmt: 'days', width: 96, tip: T('first mature DN with ROAS ≥ 1.0x'), hidden: H('payback_day', true) },
      { key: 'pltv_trial', label: PRED_LBL('pltv_trial'), fmt: mf('usd2'), heatmap: 'good', heatmapPredicted: false, width: 104, tip: T('(revenue received + expected future revenue to D{h}) / trials · italic = forecast · model {m}', { h: U.ltvHorizon(st), m: modelLabel() }), hidden: H('pltv_trial', true) },
      { key: 'max_cpt', label: 'max CPT', fmt: mf('usd2'), width: 84, tip: T('pLTV D{h} per trial / target ROAS ({t}) · green: ≥ 15 % headroom over CPT, red: CPT ≥ 15 % above max', { h: U.ltvHorizon(st), t: F.x(targetRoas()) }), hidden: H('max_cpt', false) },
    ];
    bdCard.setCaption(T('{dim} · top 15 by spend + Other · {rows}', { dim: `${dimLabel(dim)}${st.bdim2 ? ` ▸ ${dimLabel(st.bdim2)}` : ''}`, rows: BB.plural(b.rows.length, 'row|rows', { fmt: F.int }) }));
    const thin = U.isThin(b.total.signups);
    thinToggle(bdEmpty, bdHost, thin, T('{n} users in slice, need ≥ {min}', { n: F.int(b.total.signups), min: BB.MIN_USERS }));
    if (!thin) bdTbl.update({ columns: cols, rows: b.rows.map((r) => bdRowOf(r, 0)), total: bdTotal(b) });
  }

  /* Churn: voluntary vs involuntary (BB.churn) */
  function renderChurn(thin) {
    const h = BB.churn({ data, state: st });
    const body = churnCard.body; U.clear(body);
    churnCard.setCaption(T('{payers} (subs with ≥ 1 rebill) · shares of payers', { payers: BB.plural(h.payers, 'payer|payers', { fmt: F.int }) }));
    if (thin || U.isThin(h.payers)) { body.append(U.emptyState(null, T('Not enough data'), { sub: T('{n} payers in slice, need ≥ {min}', { n: F.int(h.payers), min: BB.MIN_USERS }) })); return; }
    const stat = (l, v, cls) => el('div', { class: 's' }, el('div', { class: 'l' }, l), el('div', { class: 'v' + (cls ? ' ' + cls : '') }, v));
    body.append(el('div', { class: 'bh-stat' },
      stat(ML('voluntary_churn'), F.pct(h.voluntary.rate), 'warn'), stat(ML('involuntary_churn'), F.pct(h.involuntary.rate), 'bad'),
      stat(T('Active'), F.int(h.active), 'good'), stat(T('Past due'), F.int(h.pastDue)), stat(T('Total churn'), `${F.int(h.churned)} · ${F.pct(ratio(h.churned, h.payers))}`)));
    const colors = { user: U.palette(4), payment_failed: U.palette(1), refund: U.palette(3), dispute: U.palette(6) }; // user cancel = magenta(5), card decline = orange(2) — same as "Rebills & churn"
    const REASON_LBL = { user: T('User cancel'), payment_failed: T('Card decline'), refund: T('Refund'), dispute: T('Dispute') };
    const split = el('div', { class: 'split' }); const legend = el('div', { class: 'legend' });
    h.reasons.forEach((x) => { if (!x.n) return; const lbl = REASON_LBL[x.reason] || BB.lbl(x); split.append(el('span', { style: { width: (x.share * 100) + '%', background: colors[x.reason] }, title: `${lbl}: ${F.int(x.n)} (${F.pct(x.share)})` })); legend.append(el('span', {}, el('i', { style: { background: colors[x.reason] } }), `${lbl} ${F.int(x.n)} · ${F.pct(x.share)}`)); });
    body.append(el('div', { class: 'bh-sec' }, el('h3', {}, T('Churn reasons'), el('span', { class: 'caption' }, T('share of churned'))), split, legend));
    const grid = el('div', { class: 'bh-grid', style: { marginTop: '14px' } }); body.append(grid);
    const bar = (label, v, max, text, kind, sub) => el('div', { class: 'bl' }, el('span', { class: 'bl-k', title: typeof label === 'string' ? label : null }, label), el('div', { class: 'bl-bar' }, el('div', { class: 'bl-fill' + (kind ? ' ' + kind : ''), style: { width: (max > 0 && v != null ? Math.max(1, Math.min(100, v / max * 100)) : 0) + '%' } })), el('span', { class: 'bl-v' }, text, sub ? el('small', {}, sub) : null));
    const s1 = el('div', { class: 'bh-sec' }, el('h3', {}, T('Share of payers'), el('span', { class: 'caption' }, T('to date'))));
    const mx = Math.max(0.05, h.voluntary.rate || 0, h.involuntary.rate || 0, h.recovered.rate || 0, h.winbacks.rate || 0, h.upgrades.rate || 0);
    s1.append(
      bar(el('span', { 'data-tip': MF('voluntary_churn') }, T('Voluntary')), h.voluntary.rate, mx, F.pct(h.voluntary.rate), 'warn', F.int(h.voluntary.n)),
      bar(el('span', { 'data-tip': MF('involuntary_churn') }, T('Involuntary')), h.involuntary.rate, mx, F.pct(h.involuntary.rate), 'bad', F.int(h.involuntary.n)),
      bar(T('Refund / dispute'), ratio(h.refund.n + h.dispute.n, h.payers), mx, F.pct(ratio(h.refund.n + h.dispute.n, h.payers)), null, `${F.int(h.refund.n)} / ${F.int(h.dispute.n)}`),
      bar(el('span', { 'data-tip': MF('recovery_rate') }, T('Recovered')), h.recovered.rate, 1, F.pct(h.recovered.rate), 'good', `${F.int(h.recovered.n)}/${F.int(h.recovered.failedFirst)}`),
      bar(el('span', { 'data-tip': MF('winback_rate') }, T('Win-backs')), h.winbacks.rate, mx, F.pct(h.winbacks.rate), 'info', F.int(h.winbacks.n)),
      bar(el('span', { 'data-tip': MF('upgrade_rate') }, T('Upgrade weekly → monthly')), h.upgrades.rate, mx, F.pct(h.upgrades.rate), 'info', F.int(h.upgrades.n)));
    const s2 = el('div', { class: 'bh-sec' }, el('h3', {}, T('Renewal decline codes'), el('span', { class: 'caption' }, T('involuntary churn reasons'))));
    const maxShare = h.declineCodes.length ? h.declineCodes[0].share : 1;
    if (!h.declineCodes.length) s2.append(el('div', { class: 'caption' }, T('No declines')));
    h.declineCodes.slice(0, 7).forEach((d) => s2.append(bar(el('span', { class: 'mono', title: d.code || null }, d.code || T('(no code)')), d.share, maxShare, F.pct(d.share), d.code === 'insufficient_funds' ? 'warn' : null, F.int(d.n))));
    grid.append(s1, s2);
  }

  function renderBilling() {
    const h = BB.billingHealth({ data, state: st });
    const body = bhCard.body; U.clear(body);
    const bar = (label, v, max, text, kind, sub) => el('div', { class: 'bl' }, el('span', { class: 'bl-k', title: typeof label === 'string' ? label : null }, label), el('div', { class: 'bl-bar' }, el('div', { class: 'bl-fill' + (kind ? ' ' + kind : ''), style: { width: (max > 0 && v != null ? Math.max(1, Math.min(100, v / max * 100)) : 0) + '%' } })), el('span', { class: 'bl-v' }, text, sub ? el('small', {}, sub) : null));
    const over = h.disputeRate != null && h.disputeRate > h.disputeThreshold;
    const stat = (l, v, cls, tip) => el('div', { class: 's' }, el('div', { class: 'l', 'data-tip': tip || null }, l), el('div', { class: 'v' + (cls ? ' ' + cls : '') }, v));
    body.append(el('div', { class: 'bh-stat' },
      stat(ML('failed_rate'), F.pct(h.failedRate), null, MF('failed_rate')), stat(T('Attempts / declines'), `${F.int(h.attempts)} / ${F.int(h.failed)}`),
      stat(ML('dispute_rate'), F.pct(h.disputeRate), over ? 'bad' : 'good', MF('dispute_rate')), stat(ML('refund_rate'), F.pct(h.refundRate), null, MF('refund_rate')), stat(T('Succeeded charges'), F.int(h.charges_ok))));
    const grid = el('div', { class: 'bh-grid' }); body.append(grid);
    /* by attempt */
    const s1 = el('div', { class: 'bh-sec' }, el('h3', {}, T('Declines by attempt #'), el('span', { class: 'caption' }, T('retry every 24 h, up to 4 attempts'))));
    h.byAttempt.forEach((a) => s1.append(bar(T('Attempt {n}', { n: a.attempt }), a.rate, 1, F.pct(a.rate), a.rate == null ? null : a.rate > 0.5 ? 'bad' : a.rate > 0.25 ? 'warn' : 'good', `${F.int(a.failed)}/${F.int(a.attempts)}`)));
    /* decline codes */
    const s2 = el('div', { class: 'bh-sec' }, el('h3', {}, T('Decline codes'), el('span', { class: 'caption' }, BB.plural(h.failed, 'decline|declines', { fmt: F.int }))));
    const maxShare = h.declineCodes.length ? h.declineCodes[0].share : 1;
    if (!h.declineCodes.length) s2.append(el('div', { class: 'caption' }, T('No declines')));
    h.declineCodes.slice(0, 8).forEach((d) => s2.append(bar(el('span', { class: 'mono', title: d.code || null }, d.code || T('(no code)')), d.share, maxShare, F.pct(d.share), d.code === 'insufficient_funds' ? 'warn' : null, F.int(d.n))));
    /* funding */
    const s3 = el('div', { class: 'bh-sec' }, el('h3', {}, T('Card type'), el('span', { class: 'caption' }, T('by first payment method'))));
    const fHost = el('div'); s3.append(fHost);
    U.table(fHost, { columns: [
      { key: 'card_funding', label: T('Card type'), sticky: true, text: true, width: 90 },
      { key: 'users', label: T('Users'), fmt: 'int' }, { key: 'trialsEnded', label: T('Trials ended'), fmt: 'int', tip: T('trial ended to date') },
      { key: 'rebillRate', label: ML('first_rebill_rate'), fmt: 'pct', heatmap: 'good', tip: MF('first_rebill_rate') },
      { key: 'failedRate', label: ML('failed_rate'), fmt: 'pct', heatmap: 'bad', dir: 1, tip: MF('failed_rate') }],
      rows: h.funding.map((f) => Object.assign({ key: f.card_funding }, f)), sort: null, maxHeight: 200 });
    /* dispute gauge */
    const s4 = el('div', { class: 'bh-sec' }, el('h3', {}, T('Disputes vs Stripe threshold'), U.badge(over ? T('above 0.75 %') : T('OK'), over ? 'bad' : 'good')));
    const gMax = Math.max(0.015, (h.disputeRate || 0) * 1.3);
    s4.append(el('div', { class: 'gauge' }, el('div', { class: 'g-fill' + (over ? ' over' : ''), style: { width: Math.min(100, (h.disputeRate || 0) / gMax * 100) + '%' } }), el('div', { class: 'g-thr', style: { left: (h.disputeThreshold / gMax * 100) + '%' } }, el('span', {}, '0.75%'))));
    s4.append(el('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12px' } }, el('span', { class: 'muted' }, T('{d} disputes / {c} succeeded charges', { d: F.int(h.disputes_n), c: F.int(h.charges_ok) })), el('span', { class: 'mono' + (over ? ' bad' : '') }, F.pct(h.disputeRate))));
    s4.append(el('div', { class: 'caption', style: { marginTop: '6px' } }, T('Disputes lag 10–45 days — check cohorts older than D45 · refunds {p} ({n})', { p: F.pct(h.refundRate), n: F.int(h.refunds_n) })));
    grid.append(s1, s2, s3, s4);
  }

  /* ---------------------------------------------------------------- wiring */
  BB.state.onChange(() => { st = read(); render(); });
  /* the palette is theme-stepped and the page paints colours into charts, bars and dots → full re-render on theme change */
  U.onTheme(() => render());
  render();
  window.BB_COHORTS = { render, get state() { return st; }, table: tbl, breakdown: bdTbl };
});
