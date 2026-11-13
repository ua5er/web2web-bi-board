/* Web-to-Web BI Board — core.js (data layer)
 * Schema, JSON loader + validation, aggregation engine, state (URL hash), predictions, formatters.
 * Works in browser (extends window.BB) and in Node (module.exports). No DOM access at load. */
(function (root) {
  'use strict';
  var BB = root.BB = root.BB || {};
  var DAY = 86400000, HOUR = 3600000;

  /* ───────────────────────── i18n ─────────────────────────
   * English is the base language of the UI; every other language is a dictionary keyed by the English string.
   * BB.lang          'en' | 'ru' — resolved from the hash (lang=), then localStorage 'bb-lang', then 'en'.
   * BB.t(s, vars)    translate an English UI string; {name} placeholders are substituted from vars. Unknown → s.
   * BB.plural(n, 'cohort|cohorts')   "3 cohorts" — forms from the dictionary ('one|few|many' in RU), number prepended.
   * BB.lbl(o, field) label of a catalogue object: o[field] (EN) or o[field + '_ru'] by language, falling back across.
   * BB.setLang(l, {reload}) persist + apply. Dictionaries live in i18n/<lang>.js (BB.I18N[lang] = {en: ru}). */
  BB.LANGS = [{ id: 'en', label: 'EN', name: 'English' }, { id: 'ru', label: 'RU', name: 'Русский' }];
  BB.I18N = BB.I18N || {};
  function langOk(l) { return BB.LANGS.some(function (x) { return x.id === l; }); }
  function readLang() {
    var l = null;
    try { var m = typeof location !== 'undefined' && /(?:^#|&)lang=([a-z]{2})/.exec(location.hash || ''); if (m) l = m[1]; } catch (e) { /* no DOM */ }
    if (!l) { try { l = typeof localStorage !== 'undefined' ? localStorage.getItem('bb-lang') : null; } catch (e) { /* private mode */ } }
    return langOk(l) ? l : 'en';
  }
  BB.lang = readLang();
  function subst(s, vars) { return vars ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined && vars[k] !== null ? vars[k] : m; }) : s; }
  BB.t = function (s, vars) {
    if (s === null || s === undefined) return '';
    var d = BB.I18N[BB.lang], out = d && Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s;
    return subst(out, vars);
  };
  function pluralIndex(n, lang) {
    n = Math.abs(Math.round(n));
    if (lang === 'ru') { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2; }
    return n === 1 ? 0 : 1;
  }
  BB.plural = function (n, forms, opts) { // forms = 'cohort|cohorts' (EN key); dictionary gives 'когорта|когорты|когорт'
    var f = BB.t(forms).split('|'), i = Math.min(pluralIndex(n, BB.lang), f.length - 1);
    var num = opts && opts.fmt ? opts.fmt(n) : String(n);
    return opts && opts.bare ? f[i] : num + ' ' + f[i];
  };
  BB.lbl = function (o, field) {
    if (!o) return '';
    if (typeof o === 'string') return BB.t(o);
    field = field || 'label';
    var en = o[field] !== undefined && o[field] !== null ? o[field] : o[field + '_en'], ru = o[field + '_ru'];
    if (BB.lang === 'ru') return ru !== undefined && ru !== null ? ru : en !== undefined && en !== null ? BB.t(en) : (o.id || '');
    return en !== undefined && en !== null ? en : ru !== undefined && ru !== null ? ru : (o.id || '');
  };
  BB.setLang = function (l, opts) {
    if (!langOk(l)) return BB.lang;
    BB.lang = l;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('bb-lang', l); } catch (e) { /* ignore */ }
    try { if (typeof document !== 'undefined') document.documentElement.lang = l; } catch (e) { /* no DOM */ }
    if (!(opts && opts.reload === false) && typeof location !== 'undefined' && typeof location.reload === 'function') {
      try { if (/(?:^#|&)lang=/.test(location.hash || '')) location.hash = location.hash.replace(/(^#|&)lang=[a-z]{2}/, '$1lang=' + l); } catch (e) { /* ignore */ }
      location.reload();
    }
    return l;
  };
  try { if (typeof document !== 'undefined') document.documentElement.lang = BB.lang; } catch (e) { /* no DOM */ }

  /* ───────────────────────── Constants ───────────────────────── */
  BB.OFFSETS = [0, 1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 360];
  BB.DEFAULT_OFFSETS = [0, 1, 3, 7, 14, 30, 60, 90, 180, 360];

  /* Built-in plan catalogue = the demo product's catalogue (tools/generate-demo-data.mjs writes the same tables into data/demo.json).
     A data file replaces it with its own `plans` / `paywalls` tables (see docs/DATA_CONTRACT.md). */
  BB.PLANS = [
    { id: 'wk_3d_149',  paywall: 'pw_classic', label: 'Weekly · 3-day trial for $1.49',  label_ru: 'Неделя · 3 дня за $1.49',      trialDays: 3, intro: 1.49, price: 7.99,  period: 'week',  periodDays: 7,  from: '2025-09-01', to: null },
    { id: 'mo_7d_499',  paywall: 'pw_classic', label: 'Monthly · 7-day trial for $4.99', label_ru: 'Месяц · 7 дней за $4.99',      trialDays: 7, intro: 4.99, price: 29.99, period: 'month', periodDays: 30, from: '2025-09-01', to: null },
    { id: 'wk_free_3d', paywall: 'pw_v2',      label: 'Weekly · 3-day free trial',       label_ru: 'Неделя · 3 дня бесплатно',     trialDays: 3, intro: 0,    price: 7.99,  period: 'week',  periodDays: 7,  from: '2026-08-17', to: null },
    { id: 'mo_3d_249',  paywall: 'pw_v2',      label: 'Monthly · 3-day trial for $2.49', label_ru: 'Месяц · 3 дня за $2.49',       trialDays: 3, intro: 2.49, price: 27.99, period: 'month', periodDays: 30, from: '2026-08-17', to: null }
  ];
  BB.PLAN_BY_ID = {};
  BB.PLANS.forEach(function (p) { BB.PLAN_BY_ID[p.id] = p; });
  BB.PAYWALLS = [
    { id: 'pw_classic', label: 'Classic paywall', label_ru: 'Классический пейвол', from: '2025-09-01', to: null, variant: 'A' },
    { id: 'pw_v2',      label: 'Paywall v2',      label_ru: 'Пейвол v2',           from: '2026-08-17', to: null, variant: 'B' }
  ];
  /* Catalogue override (loader item 2): a JSON file may carry `plans` / `paywalls` tables that replace the built-in catalogue.
     plans[]: {id*, paywall*, price*, trialDays* (≥ 0), intro (0), period ('week'|'month'; derived from periodDays), periodDays (7|30 from period), label (EN) / label_ru (both optional, default id), from, to}.
     paywalls[]: {id*, label / label_ru, from, to}. BB.PLANS / BB.PAYWALLS / BB.PLAN_BY_ID are mutated in place so every engine sees the new catalogue. */
  var DEFAULT_PLANS = BB.PLANS.map(function (p) { return Object.assign({}, p); }), DEFAULT_PAYWALLS = BB.PAYWALLS.map(function (p) { return Object.assign({}, p); });
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isDateOrNull(v) { return v === undefined || v === null || (typeof v === 'string' && DATE_RE.test(v)); }
  /** Validates the optional catalogue tables → {ok, errors:[text (localised sentence)], plans:[normalised]|null, paywalls:[normalised]|null}. */
  BB.validateCatalogue = function (raw) {
    var errors = [], plans = null, paywalls = null, seen = {};
    if (raw && raw.plans !== undefined) {
      if (!Array.isArray(raw.plans)) errors.push(BB.t('Table plans must be an array of objects.'));
      else {
        plans = [];
        raw.plans.forEach(function (p, i) {
          var where = 'plans[' + i + ']' + (p && p.id ? ' (' + p.id + ')' : '');
          if (!p || typeof p !== 'object') { errors.push(BB.t('{where}: not an object.', { where: where })); return; }
          if (typeof p.id !== 'string' || !p.id) errors.push(BB.t('{where}: field id (string) is required.', { where: where }));
          else if (seen['p:' + p.id]) errors.push(BB.t('{where}: duplicate plan id.', { where: where })); else seen['p:' + p.id] = 1;
          if (typeof p.paywall !== 'string' || !p.paywall) errors.push(BB.t('{where}: field paywall (paywall id) is required.', { where: where }));
          if (typeof p.price !== 'number' || !(p.price >= 0)) errors.push(BB.t('{where}: field price (period price, USD, number ≥ 0) is required.', { where: where }));
          if (typeof p.trialDays !== 'number' || !(p.trialDays >= 0)) errors.push(BB.t('{where}: field trialDays (trial length in days, number ≥ 0) is required.', { where: where }));
          if (p.intro !== undefined && p.intro !== null && (typeof p.intro !== 'number' || p.intro < 0)) errors.push(BB.t('{where}: field intro must be a number ≥ 0.', { where: where }));
          if (p.period !== undefined && p.period !== null && p.period !== 'week' && p.period !== 'month') errors.push(BB.t("{where}: field period must be 'week' or 'month'.", { where: where }));
          if (p.periodDays !== undefined && p.periodDays !== null && (typeof p.periodDays !== 'number' || !(p.periodDays > 0))) errors.push(BB.t('{where}: field periodDays must be a number > 0.', { where: where }));
          if (!isDateOrNull(p.from) || !isDateOrNull(p.to)) errors.push(BB.t('{where}: fields from / to must be YYYY-MM-DD dates or null.', { where: where }));
          var periodDays = p.periodDays != null ? p.periodDays : (p.period === 'month' ? 30 : 7), period = p.period || (periodDays >= 28 ? 'month' : 'week');
          plans.push({ id: p.id, paywall: p.paywall, label: p.label || p.label_en || null, label_ru: p.label_ru || p.label || p.id, trialDays: p.trialDays, intro: p.intro || 0, price: p.price, period: period, periodDays: periodDays, from: p.from || null, to: p.to || null });
        });
      }
    }
    if (raw && raw.paywalls !== undefined) {
      if (!Array.isArray(raw.paywalls)) errors.push(BB.t('Table paywalls must be an array of objects.'));
      else {
        paywalls = [];
        raw.paywalls.forEach(function (w, i) {
          var where = 'paywalls[' + i + ']' + (w && w.id ? ' (' + w.id + ')' : '');
          if (!w || typeof w !== 'object') { errors.push(BB.t('{where}: not an object.', { where: where })); return; }
          if (typeof w.id !== 'string' || !w.id) errors.push(BB.t('{where}: field id (string) is required.', { where: where }));
          else if (seen['w:' + w.id]) errors.push(BB.t('{where}: duplicate paywall id.', { where: where })); else seen['w:' + w.id] = 1;
          if (!isDateOrNull(w.from) || !isDateOrNull(w.to)) errors.push(BB.t('{where}: fields from / to must be YYYY-MM-DD dates or null.', { where: where }));
          paywalls.push({ id: w.id, label: w.label || w.label_en || null, label_ru: w.label_ru || w.label || w.id, from: w.from || null, to: w.to || null, variant: typeof w.variant === 'string' && w.variant ? w.variant : null }); // variant: optional A/B tag (A, B…) shown on the User flow board
        });
      }
    }
    if (plans && paywalls) plans.forEach(function (p) { if (!paywalls.some(function (w) { return w.id === p.paywall; })) errors.push(BB.t('Plan {plan} references paywall {paywall}, which is not in the paywalls table.', { plan: p.id, paywall: p.paywall })); });
    return { ok: !errors.length, errors: errors, plans: plans, paywalls: paywalls };
  };
  function replaceInPlace(arr, rows) { arr.splice.apply(arr, [0, arr.length].concat(rows)); }
  /** Replaces the catalogue in place ({plans?, paywalls?}; already validated rows). Tables left out keep the built-in default. */
  BB.setCatalogue = function (cat) {
    replaceInPlace(BB.PLANS, (cat && cat.plans ? cat.plans : DEFAULT_PLANS).map(function (p) { return Object.assign({}, p); }));
    replaceInPlace(BB.PAYWALLS, (cat && cat.paywalls ? cat.paywalls : DEFAULT_PAYWALLS).map(function (p) { return Object.assign({}, p); }));
    Object.keys(BB.PLAN_BY_ID).forEach(function (k) { delete BB.PLAN_BY_ID[k]; });
    BB.PLANS.forEach(function (p) { BB.PLAN_BY_ID[p.id] = p; });
    BB.CATALOGUE_SOURCE = cat && (cat.plans || cat.paywalls) ? 'json' : 'default';
    return BB.PLANS;
  };
  BB.resetCatalogue = function () { return BB.setCatalogue(null); };
  BB.CATALOGUE_SOURCE = 'default';

  var T1 = { US: 1, GB: 1, CA: 1, AU: 1, DE: 1, FR: 1, NL: 1, SE: 1, NO: 1, CH: 1, IE: 1, NZ: 1 };
  var T2 = { ES: 1, IT: 1, PT: 1, PL: 1, CZ: 1, GR: 1, JP: 1, KR: 1, SG: 1, AE: 1, SA: 1, IL: 1 };
  var LATAM = { MX: 1, CO: 1, AR: 1, CL: 1, PE: 1, BR: 1, EC: 1, UY: 1, GT: 1, DO: 1, CR: 1, PA: 1, BO: 1, PY: 1, VE: 1 };
  BB.GEO_TIER = function (country) {
    if (T1[country]) return 'T1';
    if (T2[country]) return 'T2';
    if (LATAM[country]) return 'LATAM';
    return 'other';
  };

  /* v2: channels, PSPs, payment methods, devices. */
  BB.CHANNELS = [
    { id: 'facebook', label: 'Facebook', label_ru: 'Facebook', color: '#2a78d6', levels: [{ id: 'campaign', label: 'Campaign', label_ru: 'Кампания' }, { id: 'adset', label: 'Ad set', label_ru: 'Адсет' }, { id: 'ad', label: 'Ad', label_ru: 'Объявление' }], columns: ['impressions', 'cpm', 'ctr', 'cpc', 'cpt'] },
    { id: 'google',   label: 'Google', label_ru: 'Google',   color: '#1baf7a', levels: [{ id: 'campaign', label: 'Campaign', label_ru: 'Кампания' }, { id: 'adset', label: 'Ad group', label_ru: 'Группа объявлений' }, { id: 'ad', label: 'Keyword / asset group', label_ru: 'Ключ / asset group' }], columns: ['impression_share', 'cpc', 'cpt', 'cpi'] },
    { id: 'tiktok',   label: 'TikTok', label_ru: 'TikTok',   color: '#eb6834', levels: [{ id: 'campaign', label: 'Campaign', label_ru: 'Кампания' }, { id: 'adset', label: 'Ad group', label_ru: 'Ad group' }, { id: 'ad', label: 'Ad', label_ru: 'Объявление' }], columns: ['impressions', 'cpm', 'ctr', 'cpc', 'cpt'] },
    { id: 'web2web',  label: 'Web2Web', label_ru: 'Web2Web',  color: '#6250d6', levels: [{ id: 'partner', label: 'Partner', label_ru: 'Партнёр' }, { id: 'placement', label: 'Placement', label_ru: 'Площадка' }], columns: ['contracted_cpa', 'cpa', 'cpa_delta', 'cpt'] },
    { id: 'organic',  label: 'Organic', label_ru: 'Organic',  color: '#008300', levels: [], columns: ['signups', 'trials'] }
  ];
  BB.CHANNEL_BY_ID = {};
  BB.CHANNELS.forEach(function (c) { BB.CHANNEL_BY_ID[c.id] = c; });
  /* Projects (scope panel): a single project today; the selector is a placeholder for a multi-project setup. */
  BB.PROJECTS = [{ id: 'demo', label: 'Demo app', label_ru: 'Demo app' }];
  /* Ad accounts present in the data: distinct non-null `account` of spend ∪ campaigns → [{id, label, label_ru}], sorted; labels from data.meta.accounts[id].label when the adapter provides them. Memoised per data object. */
  var _accountsCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  BB.accounts = function (data) {
    if (!data) return [];
    if (_accountsCache && _accountsCache.has(data)) return _accountsCache.get(data);
    var seen = {}, out = [], meta = (data.meta && data.meta.accounts) || {};
    function add(a) { if (a === null || a === undefined || a === '') return; a = String(a); if (seen[a]) return; seen[a] = 1; var m = meta[a] || {}; out.push({ id: a, label: m.label || a, label_ru: m.label_ru || m.label || a }); }
    (data.spend || []).forEach(function (r) { add(r.account); });
    (data.campaigns || []).forEach(function (c) { add(c.account); });
    out.sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; });
    if (_accountsCache) _accountsCache.set(data, out);
    return out;
  };
  BB.PSPS = [{ id: 'stripe', label: 'Stripe', label_ru: 'Stripe' }, { id: 'paypal', label: 'PayPal', label_ru: 'PayPal' }, { id: 'paddle', label: 'Paddle', label_ru: 'Paddle' }];
  BB.PAYMENT_METHODS = [{ id: 'card', label: 'Card', label_ru: 'Карта' }, { id: 'apple_pay', label: 'Apple Pay', label_ru: 'Apple Pay' }, { id: 'google_pay', label: 'Google Pay', label_ru: 'Google Pay' }, { id: 'paypal', label: 'PayPal', label_ru: 'PayPal' }, { id: 'link', label: 'Link', label_ru: 'Link' }];
  BB.WALLETS = { apple_pay: 1, google_pay: 1, link: 1 };
  BB.DEVICE_CLASSES = [{ id: 'mobile', label: 'Mobile', label_ru: 'Mobile' }, { id: 'desktop', label: 'Desktop', label_ru: 'Desktop' }, { id: 'tablet', label: 'Tablet', label_ru: 'Tablet' }];
  BB.WEBVIEWS = { instagram_webview: 1, tiktok_webview: 1, fb_webview: 1 };
  BB.CURRENCIES = { USD: { symbol: '$', rate: 1 }, EUR: { symbol: '€', rate: 0.92 }, GBP: { symbol: '£', rate: 0.79 }, MXN: { symbol: 'MX$', rate: 18.5 }, BRL: { symbol: 'R$', rate: 5.4 } }; // rate = local units per 1 USD
  BB.MRR_FACTOR = { week: 4.33, month: 1 };
  BB.MIN_USERS = 30; // below this a slice is "too few users to conclude"
  /* Global payer definition (state.payer): 'any' = ≥ 1 succeeded charge with amount_usd > 0 (paid intro, rebill, renewal, pack); 'sub' = ≥ 1 succeeded rebill / renewal (intro and packs excluded). */
  BB.PAYER_MODES = [{ id: 'any', label: 'Payers: any payment', label_ru: 'Платящие: любая оплата' }, { id: 'sub', label: 'Payers: subscription', label_ru: 'Платящие: подписка' }];
  BB.isPayerCharge = function (c, mode) {
    if (!c || c.status !== 'succeeded') return false;
    if (mode === 'sub') return c.type === 'rebill' || c.type === 'renewal';
    return c.amount_usd > 0;
  };
  BB.payerLabel = function (state) { var m = state && state.payer === 'sub' ? 'sub' : 'any'; return m === 'sub' ? BB.t('subscription payers (rebill / renewal)') : BB.t('any payment > $0 (intro, rebill, renewal, pack)'); };
  /* Column presets for the cohort board's metric picker (metric keys). */
  BB.COLUMN_PRESETS = [
    { id: 'ua_basic',      label: 'UA basic', label_ru: 'UA basic',      metrics: ['spend', 'signups', 'trials', 'cpt', 'qualified_rate', 'payers', 'cpp', 'roas', 'payback_day'] },
    { id: 'stripe_health', label: 'Billing health', label_ru: 'Здоровье биллинга', metrics: ['auth_rate', 'failed_rate', 'insufficient_share', 'three_ds_share', 'refund_rate', 'dispute_rate', 'fee_pct', 'fx_loss', 'recovery_rate'] },
    { id: 'retention',     label: 'Retention', label_ru: 'Retention',     metrics: ['first_rebill_rate', 'active_rate', 'renewals', 'avg_renewals', 'mrr', 'nrr', 'voluntary_churn', 'involuntary_churn', 'ltv'] }
  ];

  // id, label, table the raw value lives in, whether spend rows carry it (else spend is allocated). `field` = user property when it differs from id.
  BB.DIMENSIONS = [
    { id: 'country',        label: 'Country', label_ru: 'Страна',          table: 'users',   spendable: false },
    { id: 'geo_tier',       label: 'Geo tier', label_ru: 'Гео-тир',         table: 'derived', spendable: false },
    { id: 'market',         label: 'Market', label_ru: 'Рынок',           table: 'spend',   spendable: true },
    { id: 'campaign',       label: 'Campaign', label_ru: 'Кампания',        table: 'spend',   spendable: true },
    { id: 'adset',          label: 'Ad set', label_ru: 'Адсет',           table: 'spend',   spendable: true },
    { id: 'ad',             label: 'Ad', label_ru: 'Объявление',      table: 'spend',   spendable: true },
    { id: 'creative',       label: 'Creative', label_ru: 'Креатив',         table: 'spend',   spendable: true },
    { id: 'utm_source',     label: 'UTM source', label_ru: 'UTM source',      table: 'users',   spendable: false },
    { id: 'utm_medium',     label: 'UTM medium', label_ru: 'UTM medium',      table: 'users',   spendable: false },
    { id: 'utm_campaign',   label: 'UTM campaign', label_ru: 'UTM campaign',    table: 'users',   spendable: false },
    { id: 'utm_content',    label: 'UTM content', label_ru: 'UTM content',     table: 'users',   spendable: false },
    { id: 'paywall',        label: 'Paywall', label_ru: 'Пейвол',          table: 'users',   spendable: false },
    { id: 'plan',           label: 'Plan', label_ru: 'План',            table: 'users',   spendable: false },
    { id: 'device',         label: 'Device', label_ru: 'Устройство',      table: 'users',   spendable: false },
    { id: 'lang',           label: 'Language', label_ru: 'Язык',            table: 'users',   spendable: false },
    { id: 'card_funding',   label: 'Card funding', label_ru: 'Тип карты',       table: 'derived', spendable: false },
    { id: 'fbclid_present', label: 'fbclid', label_ru: 'fbclid',          table: 'users',   spendable: false },
    { id: 'onboarding',     label: 'Onboarding A/B', label_ru: 'Онбординг A/B',   table: 'derived', spendable: false },
    { id: 'landing',        label: 'Landing', label_ru: 'Лендинг',   table: 'users',   spendable: false },
    /* v2 */
    { id: 'channel',        label: 'Channel', label_ru: 'Канал',           table: 'spend',   spendable: true },
    { id: 'account',        label: 'Ad account', label_ru: 'Рекламный аккаунт', table: 'spend', spendable: true },   // adapter field spend.account / campaigns.account (ad account id or short code); users inherit it from their campaign
    { id: 'partner',        label: 'Partner (web2web)', label_ru: 'Партнёр (web2web)', table: 'spend', spendable: true },
    { id: 'opt_event',      label: 'Optimisation event', label_ru: 'Событие оптимизации', table: 'spend', spendable: true },   // from campaigns table: TrialQualified | TrialPaidOrSub
    { id: 'paywall_mode',   label: 'Paywall mode', label_ru: 'Режим пейвола',   table: 'spend',   spendable: true },   // from campaigns table: pw1 | pw2 | random
    { id: 'placement',      label: 'Placement', label_ru: 'Плейсмент',       table: 'spend',   spendable: true, spendField: 'platform_placement' },
    { id: 'objective',      label: 'Objective', label_ru: 'Цель кампании',   table: 'spend',   spendable: true },
    { id: 'cost_model',     label: 'Cost model', label_ru: 'Модель оплаты',   table: 'spend',   spendable: true },
    { id: 'device_class',   label: 'Device class', label_ru: 'Класс устройства', table: 'users',  spendable: false },
    { id: 'os',             label: 'OS', label_ru: 'ОС',              table: 'users',   spendable: false },
    { id: 'browser',        label: 'Browser', label_ru: 'Браузер',         table: 'users',   spendable: false },
    { id: 'psp',            label: 'PSP', label_ru: 'Провайдер (PSP)', table: 'derived', spendable: false },
    { id: 'payment_method', label: 'Payment method', label_ru: 'Способ оплаты',   table: 'derived', spendable: false },
    { id: 'landing_variant',label: 'Landing variant', label_ru: 'Вариант лендинга', table: 'users',  spendable: false },
    { id: 'price_test',     label: 'Price test', label_ru: 'Ценовой тест',    table: 'users',   spendable: false },
    { id: 'region',         label: 'Region', label_ru: 'Регион',          table: 'users',   spendable: false },
    { id: 'currency',       label: 'Currency', label_ru: 'Валюта',          table: 'users',   spendable: false, field: 'locale_currency' },
    { id: 'coupon',         label: 'Coupon', label_ru: 'Купон',           table: 'derived', spendable: false },
    { id: 'click_id_type',  label: 'Click ID', label_ru: 'Click id',        table: 'users',   spendable: false }
  ];
  BB.DIM_BY_ID = {};
  BB.DIMENSIONS.forEach(function (d) { BB.DIM_BY_ID[d.id] = d; });

  /* Metric dictionary — single source of truth for every board. */
  /* M(key, label (EN), label_ru, fmt, dir, formula (EN), formula_ru, needsSpend, offsetBased). UI reads BB.lbl(m) / BB.lbl(m, 'formula'). */
  function M(key, label, label_ru, fmt, dir, formula, formula_ru, needsSpend, offsetBased) {
    return { key: key, label: label, label_ru: label_ru, fmt: fmt, dir: dir, formula: formula, formula_ru: formula_ru, needsSpend: !!needsSpend, offsetBased: !!offsetBased };
  }
  BB.METRICS = [
    M('spend',              'Spend',              'Расход',               'usd',  -1, 'Σ ad spend in period', 'Σ расход за период', true, false),
    M('impressions',        'Impressions',        'Показы',               'int',  +1, 'Σ impressions', 'Σ показов', true, false),
    M('clicks',             'Clicks',             'Клики',                'int',  +1, 'Σ clicks', 'Σ кликов', true, false),
    M('ctr',                'CTR',                'CTR',                  'pct',  +1, 'clicks / impressions', 'клики / показы', true, false),
    M('cpc',                'CPC',                'CPC',                  'usd2', -1, 'spend / clicks', 'расход / клики', true, false),
    M('cpm',                'CPM',                'CPM',                  'usd2', -1, 'spend / impressions × 1000', 'расход / показы × 1000', true, false),
    M('landing_views',      'Landing views',      'Просмотры лендинга',   'int',  +1, 'Σ landing views', 'Σ просмотров лендинга', true, false),
    M('signups',            'Signups',            'Регистрации',          'int',  +1, 'Σ signups (= installs for web)', 'Σ регистраций (= installs для web)', false, false),
    M('cpi',                'CPI',                'CPI',                  'usd2', -1, 'spend / signups', 'расход / регистрации', true, false),
    M('signup_trial_rate',  'Signup → Trial',     'Регистрация → Триал',  'pct',  +1, 'trials / signups', 'триалы / регистрации', false, false),
    M('trials',             'Trials',             'Триалы',               'int',  +1, 'Σ trials', 'Σ триалов', false, false),
    M('cpt',                'CPT',                'CPT',                  'usd2', -1, 'spend / trials', 'расход / триалы', true, false),
    M('qualified',          'Qualified trials',   'Квалиф. триалы',       'int',  +1, 'Σ TrialQualified (not cancelled within 20 min)', 'Σ TrialQualified (не отменил за 20 мин)', false, false),
    M('cpqt',               'CPQT',               'CPQT',                 'usd2', -1, 'spend / qualified trials', 'расход / квалиф. триалы', true, false),
    M('qualified_rate',     'Qualified rate',     'Квалиф. %',            'pct',  +1, 'qualified / trials', 'квалиф. / триалы', false, false),
    M('revenue_gross',      'Gross revenue',      'Выручка gross',        'usd',  +1, 'Σ succeeded charges by DN (intro + rebills + packs)', 'Σ успешных платежей к DN (intro + ребиллы + пакеты)', false, true),
    M('revenue_net',        'Net revenue',        'Выручка net',          'usd',  +1, 'gross − PSP fees − refunds − disputes (amount + $15)', 'gross − комиссии PSP − возвраты − диспуты (сумма + $15)', false, true),
    M('revenue',            'Revenue',            'Выручка',              'usd',  +1, 'gross or net per the toggle', 'gross или net по переключателю', false, true),
    M('refunds',            'Refunds $',          'Возвраты $',           'usd',  -1, 'Σ refunds by DN', 'Σ возвратов к DN', false, true),
    M('disputes',           'Disputes $',         'Диспуты $',            'usd',  -1, 'Σ disputed amounts + $15 fee each, by DN', 'Σ сумм диспутов + $15 комиссия за каждый, к DN', false, true),
    M('fees',               'Fees $',             'Комиссии $',           'usd',  -1, 'Σ PSP fees (2.9% + $0.30, +1.5% non-US, +1% FX)', 'Σ комиссий PSP (2.9% + $0.30, +1.5% не-US, +1% конверсия)', false, true),
    M('payers',             'Payers',             'Платящие',             'int',  +1, 'users with ≥ 1 succeeded charge > $0 by DN (paid intro, rebill, pack)', 'юзеры с ≥ 1 успешным платежом > $0 к DN (платный intro, ребилл, пакет)', false, true),
    M('paying_rate',        'Payer rate',         'Платящие %',           'pct',  +1, 'payers / trials', 'платящие / триалы', false, true),
    M('first_rebill_rate',  '1st rebill rate',    '1-й ребилл %',         'pct',  +1, 'trials with a succeeded 1st rebill / trials ended by DN', 'триалы с успешным 1-м ребиллом / триалы, закончившиеся к DN', false, true),
    M('cpp',                'CAC',                'CAC',                  'usd2', -1, 'spend / payers (cost per payer, CPP)', 'расход / платящие (стоимость платящего, CPP)', true, true),
    M('arpu',               'ARPU',               'ARPU',                 'usd2', +1, 'revenue / signups', 'выручка / регистрации', false, true),
    M('arpt',               'ARPT',               'ARPT',                 'usd2', +1, 'revenue / trials', 'выручка / триалы', false, true),
    M('arppu',              'ARPPU',              'ARPPU',                'usd2', +1, 'revenue / payers', 'выручка / платящие', false, true),
    M('roas',               'ROAS',               'ROAS',                 'x',    +1, 'revenue / spend', 'выручка / расход', true, true),
    M('ltv',                'LTV',                'LTV',                  'usd2', +1, '= ARPU by DN', '= ARPU к DN', false, true),
    M('payback_day',        'Payback',            'Окупаемость',          'days', -1, 'first DN with ROAS ≥ 1.0x (mature cells only)', 'первый DN, где ROAS ≥ 1.0x (только зрелые)', true, false),
    M('active_rate',        'Active subs %',      'Активные подписки %',  'pct',  +1, 'users with a paid period covering day N / payers', 'юзеры с оплаченным периодом, покрывающим день N / платящие', false, true),
    M('renewals',           'Renewals',           'Продления',            'int',  +1, 'Σ succeeded rebills + renewals by DN', 'Σ успешных ребиллов и продлений к DN', false, true),
    M('failed_rate',        'Decline rate',       'Отказы оплат %',       'pct',  -1, 'failed attempts (non-intro) / all attempts (non-intro) by DN', 'неуспешные попытки (не-intro) / все попытки (не-intro) к DN', false, true),
    M('insufficient_share', 'Insufficient funds %', 'insufficient_funds %', 'pct', -1, 'insufficient_funds / all failed attempts (non-intro) by DN', 'insufficient_funds / все неуспешные попытки (не-intro) к DN', false, true),
    M('refund_rate',        'Refund rate',        'Возвраты %',           'pct',  -1, 'Σ refunds $ / gross revenue by DN', 'Σ возвратов $ / выручка gross к DN', false, true),
    M('dispute_rate',       'Dispute rate',       'Диспуты %',            'pct',  -1, 'disputes / succeeded charges by DN (Stripe threshold 0.75%)', 'диспуты / успешные платежи к DN (порог Stripe 0.75%)', false, true),
    /* v2 — acquisition / traffic quality */
    M('cpl',                'CPL',                'CPL',                  'usd2', -1, 'spend / landing views', 'расход / просмотры лендинга', true, false),
    M('landing_signup_rate','Landing → Signup',   'Лендинг → Регистрация','pct',  +1, 'signups / landing views', 'регистрации / просмотры лендинга', true, false),
    M('bounce_rate',        'Bounce rate',        'Отказы (bounce)',      'pct',  -1, '1 − signups / landing views', '1 − регистрации / просмотры лендинга', true, false),
    M('paywall_view_rate',  'Paywall view rate',  'Просмотр пейвола %',   'pct',  +1, 'paywall views / signups', 'просмотры пейвола / регистрации', false, false),
    M('checkout_start_rate','Checkout rate',      'Старт чекаута %',      'pct',  +1, 'checkout starts / paywall views', 'старты чекаута / просмотры пейвола', false, false),
    M('checkout_error_rate','Checkout error rate','Ошибки чекаута %',     'pct',  -1, 'checkout errors / checkout starts (PSP declines at checkout)', 'ошибки чекаута / старты чекаута (отказы PSP на чекауте)', false, false),
    M('trial_start_rate',   'Paywall → Trial',    'Пейвол → Триал',       'pct',  +1, 'trials / paywall views', 'триалы / просмотры пейвола', false, false),
    M('cpa',                'CPA',                'CPA',                  'usd2', -1, 'spend / trials (FB, TikTok, Google: CPT; web2web: effective CPA)', 'расход / триалы (FB, TikTok, Google: CPT; web2web: эффективный CPA)', true, false),
    M('contracted_cpa',     'Contracted CPA',     'CPA контракт',         'usd2', -1, 'web2web partner contracted CPA (trial-weighted)', 'договорной CPA партнёра web2web (взвешенно по триалам)', false, false),
    M('cpa_delta',          'CPA vs contract',    'CPA vs контракт',      'pct',  -1, 'effective CPA / contracted CPA − 1', 'эффективный CPA / договорной CPA − 1', true, false),
    M('impression_share',   'Impression share',   'Доля показов',         'pct',  +1, 'channel impressions / impressions of all channels in the slice (Google IS proxy)', 'показы канала / показы всех каналов среза (прокси доли показов Google)', true, false),
    M('webview_share',      'Webview %',          'Webview %',            'pct',  -1, 'users from in-app webviews (FB / IG / TikTok) / signups', 'юзеры из in-app webview (FB / IG / TikTok) / регистрации', false, false),
    M('click_id_rate',      'Click ID %',         'Click ID %',           'pct',  +1, 'users with fbclid / gclid / ttclid / signups (attribution health)', 'юзеры с fbclid / gclid / ttclid / регистрации (здоровье атрибуции)', false, false),
    M('emq',                'EMQ (proxy)',        'EMQ (прокси)',         'pct',  +1, 'users with click ID and email / signups (Event Match Quality proxy)', 'юзеры с click ID и email / регистрации (прокси Event Match Quality)', false, false),
    M('revenue_per_visitor','Revenue / visit',    'Выручка / визит',      'usd2', +1, 'revenue by DN / landing views', 'выручка к DN / просмотры лендинга', true, true),
    /* v2 — subscription economics */
    M('mrr',                'MRR',                'MRR',                  'usd',  +1, 'Σ price of subscriptions active on day N, normalised to a month (weekly × 4.33)', 'Σ цена активных подписок на день N, нормированная к месяцу (неделя × 4.33)', false, true),
    M('arr',                'ARR',                'ARR',                  'usd',  +1, 'MRR × 12', 'MRR × 12', false, true),
    M('active_subs',        'Active subs',        'Активные подписки',    'int',  +1, 'subscriptions with a paid period covering day N', 'подписки с оплаченным периодом, покрывающим день N', false, true),
    M('trial_paid_rate',    'Trial-to-paid',      'Триал → Оплата',       'pct',  +1, '= 1st rebill rate: trials with a succeeded 1st rebill / ended trials', '= 1-й ребилл %: триалы с успешным 1-м ребиллом / завершившиеся триалы', false, true),
    M('avg_renewals',       'Renewals / payer',   'Продлений / платящий', 'num',  +1, 'Σ succeeded rebills by DN / payers', 'Σ успешных ребиллов к DN / платящие', false, true),
    M('expected_lifetime',  'Expected lifetime',  'Ожид. периодов',       'num',  +1, 'Σ succeeded rebills / 1st rebills = 1 / churn — observed paid periods per payer', 'Σ успешных ребиллов / первые ребиллы = 1 / churn — наблюдаемое число оплаченных периодов на платящего', false, true),
    M('ltv_cac',            'LTV / CAC',          'LTV / CAC',            'x',    +1, 'ARPPU by DN / CAC (CAC = spend / payers)', 'ARPPU к DN / CAC (CAC = расход / платящие)', true, true),
    M('gross_margin',       'Gross margin',       'Маржа %',              'pct',  +1, 'net revenue / gross revenue (after PSP fees, refunds, disputes)', 'выручка net / выручка gross (после комиссий PSP, возвратов, диспутов)', false, true),
    M('voluntary_churn',    'Voluntary churn',    'Отток добровольный',   'pct',  -1, 'subscriptions cancelled by the user (cancel_reason = user) by DN / payers; refunds and disputes excluded', 'подписки, отменённые самим юзером (cancel_reason = user) к DN / платящие; возвраты и диспуты не входят', false, true),
    M('involuntary_churn',  'Involuntary churn',  'Отток недобровольный', 'pct',  -1, 'subscriptions closed by payment_failed by DN / payers', 'подписки, закрытые по payment_failed к DN / платящие', false, true),
    M('recovery_rate',      'Recovery rate',      'Восстановлено %',      'pct',  +1, 'charges recovered by retry / failed first attempts by DN', 'списания, восстановленные ретраем / неуспешные первые попытки к DN', false, true),
    M('winback_rate',       'Win-back rate',      'Вернулись %',          'pct',  +1, 'returned after churn (is_winback) by DN / payers', 'вернувшиеся после оттока (is_winback) к DN / платящие', false, true),
    M('upgrade_rate',       'Upgrade rate',       'Апгрейды %',           'pct',  +1, 'weekly → monthly upgrades (is_upgrade) by DN / payers', 'апгрейды неделя → месяц (is_upgrade) к DN / платящие', false, true),
    M('coupon_share',       'Coupon share',       'Купоны %',             'pct',  -1, 'succeeded charges with a coupon / succeeded charges by DN', 'успешные платежи с купоном / успешные платежи к DN', false, true),
    M('nrr',                'NRR',                'NRR',                  'pct',  +1, 'cohort MRR on day N / MRR of the same payers at their 1st rebill (net revenue retention)', 'MRR когорты на день N / MRR тех же платящих при первом ребилле (net revenue retention)', false, true),
    /* v2 — payments / PSP */
    M('auth_rate',          'Auth rate',          'Авторизация %',        'pct',  +1, 'succeeded attempts / all charge attempts (incl. intro) by DN', 'успешные попытки / все попытки списания (вкл. intro) к DN', false, true),
    M('three_ds_share',     '3DS %',              '3DS-запросы %',        'pct',  -1, 'authentication_required declines / all attempts by DN', 'отказы authentication_required / все попытки к DN', false, true),
    M('fee_pct',            'Fee %',              'Комиссия %',           'pct',  -1, 'PSP fees / gross revenue by DN', 'комиссии PSP / выручка gross к DN', false, true),
    M('fx_loss',            'FX loss %',          'Потери FX %',          'pct',  -1, 'FX conversion fee (1%) / gross revenue by DN', 'комиссия за конвертацию валюты (1%) / выручка gross к DN', false, true)
  ];
  BB.METRIC_BY_KEY = {};
  BB.METRICS.forEach(function (m) { BB.METRIC_BY_KEY[m.key] = m; });
  BB.DISPUTE_THRESHOLD = 0.0075;

  /* ───────────────────────── Utilities ───────────────────────── */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  BB.rng = mulberry32;
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(ts) { var d = new Date(ts); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function parseDate(s) { return Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s); }
  function startOfDay(ts) { return Math.floor(ts / DAY) * DAY; }
  function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function weighted(rnd, pairs) { // [[value, weight], ...]
    var tot = 0, i; for (i = 0; i < pairs.length; i++) tot += pairs[i][1];
    var x = rnd() * tot;
    for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sum(arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f ? f(arr[i]) : arr[i]; return s; }
  BB.util = { DAY: DAY, HOUR: HOUR, isoDate: isoDate, parseDate: parseDate, startOfDay: startOfDay, clamp: clamp, sum: sum };

  /* ───────────────────────── Formatters ───────────────────────── */
  var DASH = '—';
  function bad(v) { return v === null || v === undefined || typeof v !== 'number' || !isFinite(v); }
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var fmt = {
    usd: function (v) { if (bad(v)) return DASH; var r = Math.round(Math.abs(v)); return (v < 0 && r > 0 ? '−$' : '$') + group(r); },
    usd2: function (v) { if (bad(v)) return DASH; var a = Math.abs(v).toFixed(2).split('.'); return (v < 0 ? '−$' : '$') + group(a[0]) + '.' + a[1]; },
    pct: function (v) { return bad(v) ? DASH : (v * 100).toFixed(1) + '%'; },
    x: function (v) { return bad(v) ? DASH : v.toFixed(2) + 'x'; },
    int: function (v) { return bad(v) ? DASH : group(Math.round(v)); },
    days: function (v) { return bad(v) ? DASH : 'D' + Math.round(v); },
    num: function (v) { if (bad(v)) return DASH; if (Math.abs(v) >= 100 || v === Math.round(v)) return (v < 0 ? '−' : '') + group(Math.round(Math.abs(v))); return (v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) >= 10 ? 1 : 2); },
    /* money in a currency: cur = BB.localCurrency(...) or code; v is USD */
    money: function (v, cur) { if (bad(v)) return DASH; var c = typeof cur === 'string' ? { code: cur, rate: (BB.CURRENCIES[cur] || BB.CURRENCIES.USD).rate, symbol: (BB.CURRENCIES[cur] || BB.CURRENCIES.USD).symbol } : (cur || { code: 'USD', rate: 1, symbol: '$' }); var x = v * c.rate, big = Math.abs(x) >= 100; var a = Math.abs(x).toFixed(big ? 0 : 2).split('.'); return (x < 0 ? '−' : '') + c.symbol + group(a[0]) + (big ? '' : '.' + a[1]); },
    auto: function (metricKey, v) { var m = BB.METRIC_BY_KEY[metricKey]; return (m && fmt[m.fmt] ? fmt[m.fmt] : fmt.int)(v); },
    // relative delta (v = cur/prev − 1); dir from METRICS. → {text, cls:'good'|'bad'|'neutral'}
    delta: function (v, dir) {
      if (v === 'na') return { text: DASH, cls: 'neutral', na: true, title: BB.t(BB.COMPARE_NA) };
      if (bad(v)) return { text: DASH, cls: 'neutral' };
      var up = v > 0.0005, down = v < -0.0005;
      var cls = (!up && !down) ? 'neutral' : ((up ? 1 : -1) * (dir || 1) > 0 ? 'good' : 'bad');
      if (Math.abs(v) > BB.DELTA_CAP) return { text: (up ? '▲ > ' : '▼ > ') + '500%', cls: cls, capped: true };
      return { text: (up ? '▲ ' : down ? '▼ ' : '') + group((Math.abs(v) * 100).toFixed(1)) + '%', cls: cls };
    },
    /* 'dd.mm hh:mm UTC' stamp for the source badge (meta.generated_at) */
    stampUtc: function (ts) { if (bad(ts)) return DASH; var d = new Date(ts); return pad2(d.getUTCDate()) + '.' + pad2(d.getUTCMonth() + 1) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ' UTC'; },
    /* relative delta with the comparison-sanity rule: base < 5 % of cur (or cur/base both ~0) → 'na' (render "—", tooltip BB.COMPARE_NA_RU) */
    rel: function (cur, base) {
      if (bad(cur) || bad(base)) return null;
      if (base === 0) return cur === 0 ? 0 : 'na';
      if (Math.abs(base) < Math.abs(cur) * BB.COMPARE_MIN_BASE) return 'na';
      return cur / base - 1;
    }
  };
  BB.fmt = fmt;
  BB.DELTA_CAP = 5;              // |Δ| > 500 % renders as "> 500%"
  BB.COMPARE_MIN_BASE = 0.05;    // compare base < 5 % of current → delta 'na'
  BB.COMPARE_MIN_COVERAGE = 0.6; // compare window must cover ≥ 60 % of the data days
  BB.COMPARE_NA = 'no full period to compare with'; // translate with BB.t at render time
  Object.defineProperty(BB, 'COMPARE_NA_RU', { get: function () { return BB.t(BB.COMPARE_NA); }, enumerable: false, configurable: true }); // legacy alias

  /* CSV: columns = [{key, label, get?(row)}] or strings; returns CSV text with header. */
  BB.csv = function (columns, rows) {
    var cols = columns.map(function (c) { return typeof c === 'string' ? { key: c, label: c } : c; });
    function cell(v) {
      if (v === null || v === undefined) return '';
      var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var out = [cols.map(function (c) { return cell(c.label || c.key); }).join(',')];
    rows.forEach(function (r) {
      out.push(cols.map(function (c) { return cell(c.get ? c.get(r) : r[c.key]); }).join(','));
    });
    return out.join('\n');
  };

  /* ───────────────────────── PSP fees ───────────────────────── */
  var CONV_COUNTRIES = { GB: 1, DE: 1, ES: 1, FR: 1, NL: 1, IE: 1, IT: 1, PT: 1, MX: 1, SE: 1, BR: 1 }; // non-USD presentment → +1 % FX fee
  function pspFee(amount, cardCountry, psp) {
    var f;
    if (psp === 'paypal') f = amount * 0.0349 + 0.49;
    else { f = amount * 0.029 + 0.30; if (cardCountry !== 'US') f += amount * 0.015; }
    if (CONV_COUNTRIES[cardCountry]) f += amount * 0.01;
    return Math.round(f * 100) / 100;
  }
  /** PSP fee for a charge by the default fee rules (card 2.9 % + $0.30, +1.5 % non-US card, +1 % non-USD presentment; PayPal 3.49 % + $0.49). Used when a loaded charge lacks fee_usd. */
  BB.feeOf = function (c) { return c.status === 'succeeded' ? pspFee(+c.amount_usd || 0, c.card_country || 'US', c.psp || (c.payment_method === 'paypal' ? 'paypal' : 'stripe')) : 0; };

  /* ───────────────────────── Subscriptions (derived from trials + charges) ───────────────────────── */
  function mrrOf(planId, amount) { var P = BB.PLAN_BY_ID[planId]; var price = amount !== undefined && amount !== null ? amount : (P ? P.price : 0); return price * (P && P.period === 'week' ? BB.MRR_FACTOR.week : 1); }
  BB.mrrOf = mrrOf;
  /** One subscription per trial. {sub_id, user_id, plan (current), start_ts, status ('trialing'|'active'|'past_due'|'canceled'), cancel_ts, cancel_reason ('user'|'payment_failed'|'refund'|'dispute'|null),
   *  current_period_end, renewals, first_paid_ts, last_paid_ts, mrr_usd (current normalised monthly price, 0 when not active/past_due), upgrades, winbacks}. Requires data.index. */
  BB.deriveSubscriptions = function (data) {
    var ix = data.index, now = data.now, out = [];
    data.trials.forEach(function (t) {
      var P0 = BB.PLAN_BY_ID[t.plan], tEnd = t.ts + (P0 ? P0.trialDays : 3) * DAY;
      var cs = (ix.chargesByUser.get(t.user_id) || []).filter(function (c) { return c.type === 'rebill' || c.type === 'renewal'; });
      var s = { sub_id: 'sub_' + t.trial_id.slice(3), user_id: t.user_id, plan: t.plan, start_ts: t.ts, status: 'trialing', cancel_ts: null, cancel_reason: null,
        current_period_end: tEnd, renewals: 0, first_paid_ts: null, last_paid_ts: null, mrr_usd: 0, upgrades: 0, winbacks: 0 };
      var lastOk = null, lastAttempt = null, i, c;
      for (i = 0; i < cs.length; i++) {
        c = cs[i];
        if (c.status === 'succeeded') { s.renewals++; lastOk = c; s.plan = c.plan || s.plan; if (s.first_paid_ts === null) s.first_paid_ts = c.ts; s.last_paid_ts = c.ts; if (c.is_upgrade) s.upgrades++; if (c.is_winback) s.winbacks++; }
        lastAttempt = c;
      }
      if (t.cancelled_ts) { s.status = 'canceled'; s.cancel_ts = t.cancelled_ts; s.cancel_reason = 'user'; out.push(s); return; }
      if (!lastOk) {
        if (tEnd > now) { s.status = 'trialing'; }
        else if (lastAttempt && lastAttempt.attempt < 4 && lastAttempt.ts + DAY > now) { s.status = 'past_due'; }
        else { s.status = 'canceled'; s.cancel_reason = 'payment_failed'; s.cancel_ts = lastAttempt ? lastAttempt.ts : tEnd; }
        out.push(s); return;
      }
      var periodEnd = lastOk.ts + periodOf(lastOk.plan) * DAY;
      s.current_period_end = periodEnd;
      var rf = (ix.refundsByUser.get(t.user_id) || []).filter(function (r) { return r.ts >= lastOk.ts; })[0];
      var dp = (ix.disputesByUser.get(t.user_id) || []).filter(function (d) { return d.ts >= lastOk.ts; })[0];
      var later = cs.filter(function (x) { return x.ts > lastOk.ts; }), lastLater = later[later.length - 1];
      if (rf && rf.ts <= now) { s.status = 'canceled'; s.cancel_reason = 'refund'; s.cancel_ts = rf.ts; }
      else if (dp && dp.ts <= now) { s.status = 'canceled'; s.cancel_reason = 'dispute'; s.cancel_ts = dp.ts; }
      else if (periodEnd > now) { s.status = 'active'; }
      else if (lastLater && lastLater.attempt < 4 && lastLater.ts + DAY > now) { s.status = 'past_due'; }
      else if (lastLater) { s.status = 'canceled'; s.cancel_reason = 'payment_failed'; s.cancel_ts = lastLater.ts; }
      else { s.status = 'canceled'; s.cancel_reason = 'user'; s.cancel_ts = periodEnd; }
      if (s.status === 'active' || s.status === 'past_due') s.mrr_usd = mrrOf(lastOk.plan, lastOk.amount_usd + (lastOk.discount_usd || 0));
      out.push(s);
    });
    return out;
  };

  /* ───────────────────────── Index & loading ───────────────────────── */
  function groupMap(arr, keyF) {
    var m = new Map();
    for (var i = 0; i < arr.length; i++) { var k = keyF(arr[i]); var g = m.get(k); if (g) g.push(arr[i]); else m.set(k, [arr[i]]); }
    return m;
  }
  function optEventOf(name) { return /_TQ$/.test(name || '') ? 'TrialQualified' : /_TPS$/.test(name || '') ? 'TrialPaidOrSub' : null; }
  function channelOf(u) { // derive channel from click id / utm_source when the adapter did not set it
    if (u.channel) return u.channel;
    var cid = u.click_id_type, src = String(u.utm_source || '').toLowerCase();
    if (cid === 'fbclid' || u.fbclid_present || src === 'facebook' || src === 'instagram' || src === 'fb' || src === 'ig') return 'facebook';
    if (cid === 'gclid' || cid === 'gbraid' || cid === 'wbraid' || src === 'google') return 'google';
    if (cid === 'ttclid' || src === 'tiktok') return 'tiktok';
    if (u.partner || (u.utm_medium && /affiliate|partner|publisher/.test(u.utm_medium))) return 'web2web';
    return u.ad_id ? 'facebook' : 'organic';
  }
  /* Adds Map indexes and derived fields (users: geo_tier, card_funding, onboarding, _trial, channel, click_id_type, device_class, psp, payment_method, coupon, opt_event, paywall_mode, _sub;
     spend: _ts, geo_tier, channel, placement, opt_event, paywall_mode; tables campaigns / subscriptions / events are derived when missing). Idempotent. */
  BB.index = function (data) {
    data.now = data.now || (data.meta && data.meta.generated_at) || Date.now();
    data.events = data.events || [];
    var ix = data.index = {
      userById: new Map(), trialsByUser: groupMap(data.trials, function (t) { return t.user_id; }),
      chargesByUser: groupMap(data.charges, function (c) { return c.user_id; }),
      refundsByUser: groupMap(data.refunds, function (r) { return r.user_id; }),
      disputesByUser: groupMap(data.disputes, function (d) { return d.user_id; }),
      chargeById: new Map(), usersByAdDate: new Map(), campaignById: new Map(), subsByUser: null, eventsByUser: null
    };
    data.charges.forEach(function (c) { ix.chargeById.set(c.charge_id, c); if (!c.psp) c.psp = c.payment_method === 'paypal' ? 'paypal' : 'stripe'; if (!c.payment_method) c.payment_method = 'card'; if (!c.currency) { c.currency = 'USD'; c.amount_local = c.amount_usd; c.fx_rate = 1; } if (c.fx_fee_usd === undefined) c.fx_fee_usd = 0; if (c.discount_usd === undefined) c.discount_usd = 0; });
    // campaigns lookup table (derived from spend/users when the adapter did not provide one)
    if (!data.campaigns) {
      var seen = new Map();
      data.spend.concat(data.users).forEach(function (r) { if (r.campaign_id && !seen.has(r.campaign_id)) seen.set(r.campaign_id, { campaign_id: r.campaign_id, campaign: r.campaign, channel: r.channel || null, account: r.account || null, market: r.market || null, opt_event: null, paywall_mode: null, partner: r.partner || null, cost_model: r.cost_model || null, contracted_cpa: r.contracted_cpa || null, placement: r.platform_placement || r.placement || null, objective: r.objective || null, from: null, to: null }); });
      data.campaigns = Array.from(seen.values());
    }
    data.campaigns.forEach(function (c) { if (!c.opt_event) c.opt_event = optEventOf(c.campaign); if (!c.paywall_mode) c.paywall_mode = c.campaign_id === 'organic' ? null : 'random'; ix.campaignById.set(c.campaign_id, c); });
    var camp = function (id) { return ix.campaignById.get(id) || null; };
    /* Optional `ads` lookup table {ad_id, ad, adset_id, adset, creative, campaign_id}: spend rows and users that carry only ad_id / campaign_id inherit the
       descriptive fields (ad / ad set names, creative) from it and campaign-level fields (campaign name, market, objective, cost model, contracted CPA, placement)
       from the campaigns table. Fields already present on a row are never overwritten. */
    var adById = ix.adById = new Map(); (data.ads || []).forEach(function (a) { if (a && a.ad_id != null) adById.set(a.ad_id, a); });
    function fillAd(r) { var a = adById.size && r.ad_id != null ? adById.get(r.ad_id) : null; if (!a) return; if (r.campaign_id == null && a.campaign_id != null) r.campaign_id = a.campaign_id; if (r.adset_id === undefined) r.adset_id = a.adset_id != null ? a.adset_id : null; if (r.adset === undefined) r.adset = a.adset != null ? a.adset : null; if (r.ad === undefined) r.ad = a.ad != null ? a.ad : r.ad_id; if (r.creative === undefined) r.creative = a.creative != null ? a.creative : null; }
    function fillCamp(r, c) { if (!c) return; if (r.campaign === undefined) r.campaign = c.campaign; if (r.market === undefined && c.market != null) r.market = c.market; if (r.objective === undefined && c.objective != null) r.objective = c.objective; if (r.cost_model === undefined && c.cost_model != null) r.cost_model = c.cost_model; if (r.contracted_cpa === undefined && c.contracted_cpa != null) r.contracted_cpa = c.contracted_cpa; if (r.partner === undefined && c.partner != null) r.partner = c.partner; }
    var dateCache = {}, lastCid = null, lastC = null, i, r, c;
    for (i = 0; i < data.spend.length; i++) { // hot loop (≈ 250k rows): memoised date parse + campaign lookup
      r = data.spend[i];
      fillAd(r);
      r._ts = (dateCache[r.date] || (dateCache[r.date] = parseDate(r.date))) + r.hour * HOUR;
      if (r.country != null) r.geo_tier = BB.GEO_TIER(r.country);
      if (r.campaign_id !== lastCid) { lastCid = r.campaign_id; lastC = camp(lastCid); }
      c = lastC;
      fillCamp(r, c);
      if (!r.channel) r.channel = (c && c.channel) || 'facebook';
      if (c && !c.channel) c.channel = r.channel;
      if (r.account === undefined || r.account === null) r.account = c && c.account != null ? c.account : null;
      if (c && c.account == null && r.account != null) c.account = r.account;
      r.placement = r.platform_placement === undefined ? (r.placement || (c && c.placement) || null) : r.platform_placement;
      r.opt_event = c ? c.opt_event : optEventOf(r.campaign); r.paywall_mode = c ? c.paywall_mode : null;
      if (r.partner === undefined) r.partner = c ? c.partner : null;
    }
    if (!data.subscriptions && !data._noSubs) data.subscriptions = null; // derived below once users are indexed
    ix.eventsByUser = data.events.length ? groupMap(data.events, function (e) { return e.user_id; }) : new Map();
    data.users.forEach(function (u) {
      ix.userById.set(u.user_id, u);
      fillAd(u); fillCamp(u, camp(u.campaign_id));
      u.geo_tier = BB.GEO_TIER(u.country);
      u.experiments = u.experiments || { onboarding: null, paywall: u.paywall };
      u.onboarding = u.experiments.onboarding || null;
      if (u.landing === undefined) u.landing = u.utm_content || 'default';
      var ts = ix.trialsByUser.get(u.user_id); u._trial = ts ? ts[0] : null;
      var cs = ix.chargesByUser.get(u.user_id); u.card_funding = cs ? cs[0].card_funding : null;
      if (cs) { if (!u.psp) u.psp = cs[0].psp; if (!u.payment_method) u.payment_method = cs[0].payment_method; }
      if (u.coupon === undefined) { u.coupon = null; if (cs) for (var ci = 0; ci < cs.length; ci++) if (cs[ci].coupon) { u.coupon = cs[ci].coupon; break; } }
      if (u.click_id_type === undefined) u.click_id_type = u.fbclid_present ? 'fbclid' : 'none';
      if (u.fbclid_present === undefined) u.fbclid_present = u.click_id_type === 'fbclid';
      if (!u.channel) u._channel_derived = !((u.click_id_type && u.click_id_type !== 'none') || u.fbclid_present || u.utm_source || u.partner || u.ad_id); // no channel and no signal to derive it from → counts as missing (validator: channel_coverage)
      u.channel = channelOf(u);
      if (!u.device_class) u.device_class = u.device === 'desktop' ? 'desktop' : 'mobile';
      if (!u.os) u.os = u.device === 'ios' ? 'ios' : u.device === 'android' ? 'android' : 'other';
      if (!u.device && u.os) u.device = u.os === 'ios' ? 'ios' : u.os === 'android' ? 'android' : 'desktop'; // device (ios | android | desktop) from os when absent
      if (u.browser === undefined || u.browser === '') u.browser = null; // unknown browser stays unknown (not 'other')
      if (u.locale_currency === undefined) u.locale_currency = 'USD';
      if (u.has_email === undefined) u.has_email = false; // null = unknown (EMQ: not counted)
      if (u.partner === undefined) u.partner = null;
      var c = camp(u.campaign_id);
      u.opt_event = c ? c.opt_event : optEventOf(u.campaign); u.paywall_mode = c ? c.paywall_mode : null;
      if (u.account === undefined || u.account === null) u.account = c && c.account != null ? c.account : null; // ad account via the campaign (organic → null)
      if (u.placement === undefined) u.placement = c ? c.placement : null;
      if (u.checkout_ts === undefined) { // from events (json adapter)
        u.checkout_ts = null; u.checkout_error = null;
        var evs = ix.eventsByUser.get(u.user_id); if (evs) for (var ei = 0; ei < evs.length; ei++) { if (evs[ei].name === 'checkout_start' && u.checkout_ts === null) u.checkout_ts = evs[ei].ts; if (evs[ei].name === 'checkout_error') u.checkout_error = evs[ei].props || {}; }
      }
      if (u.paywall_viewed_ts === undefined) { // from events (json adapter): first paywall_view
        u.paywall_viewed_ts = null;
        var evp = ix.eventsByUser.get(u.user_id); if (evp) for (var pi = 0; pi < evp.length; pi++) if (evp[pi].name === 'paywall_view' && (u.paywall_viewed_ts === null || evp[pi].ts < u.paywall_viewed_ts)) u.paywall_viewed_ts = evp[pi].ts;
      }
      if (u.ad_id) { var k = u.ad_id + '|' + isoDate(u.signup_ts); var g = ix.usersByAdDate.get(k); if (g) g.push(u); else ix.usersByAdDate.set(k, [u]); }
    });
    if (!data.subscriptions) data.subscriptions = BB.deriveSubscriptions(data);
    ix.subsByUser = groupMap(data.subscriptions, function (s) { return s.user_id; });
    data.users.forEach(function (u) { var ss = ix.subsByUser.get(u.user_id); u._sub = ss ? ss[0] : null; });
    data._indexed = true;
    return data;
  };

  var _cache = null;
  /* Dataset used by all boards: the JSON document loaded by BB.boot() (cached). Before a file is loaded (or in Node without one) it is an empty, indexed dataset.
     The demo dataset is a static file (data/demo.json) produced by tools/generate-demo-data.mjs; {force:true} is accepted for API compatibility and keeps the loaded file. */
  BB.empty = function () {
    return BB.index({ users: [], trials: [], charges: [], refunds: [], disputes: [], spend: [], events: [], campaigns: [], now: Date.now(),
      meta: { source: 'empty', label: 'No data', label_ru: 'Нет данных' } });
  };
  BB.load = function () {
    if (!_cache) _cache = BB.empty();
    return _cache;
  };

  /* ───────────────────────── Loader: timestamps, validation, data pointer ───────────────────────── */
  /** ISO string | ms number | null → ms number | null; NaN when unparsable. Numbers < 1e11 are treated as seconds (Stripe) and multiplied by 1000. */
  function toMs(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? (Math.abs(v) < 1e11 ? v * 1000 : v) : NaN;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') { var t = v.trim(); if (/^-?\d+(\.\d+)?$/.test(t)) return toMs(+t); return Date.parse(t.length === 10 && DATE_RE.test(t) ? t + 'T00:00:00Z' : t); }
    return NaN;
  }
  BB.toMs = toMs;
  var TS_FIELDS = { users: ['signup_ts', 'paywall_viewed_ts', 'checkout_ts'], trials: ['ts', 'cancelled_ts'], charges: ['ts'], refunds: ['ts'], disputes: ['ts'], events: ['ts'],
    subscriptions: ['start_ts', 'cancel_ts', 'current_period_end', 'first_paid_ts', 'last_paid_ts'], incidents: ['from', 'to'] };
  var REQUIRED_TABLES = ['users', 'trials', 'charges', 'refunds', 'disputes', 'spend'], OPTIONAL_TABLES = ['campaigns', 'ads', 'events', 'subscriptions', 'incidents'];
  var REQUIRED_COLS = { users: ['user_id', 'signup_ts'], trials: ['trial_id', 'user_id', 'ts', 'plan'], charges: ['charge_id', 'user_id', 'ts', 'type', 'amount_usd', 'status'],
    refunds: ['user_id', 'ts', 'amount_usd'], disputes: ['user_id', 'ts', 'amount_usd'], spend: ['date', 'campaign_id', 'ad_id', 'spend_usd'], events: ['user_id', 'ts', 'name'], campaigns: ['campaign_id'], ads: ['ad_id'], incidents: ['from', 'to'], subscriptions: ['user_id', 'start_ts'] };
  var ID_COLS = { users: 'user_id', trials: 'trial_id', charges: 'charge_id' };
  var ZERO_COLS = { spend: ['hour', 'impressions', 'clicks', 'link_clicks', 'landing_views'] };
  var SAMPLE = 500, EXAMPLES = 3;
  function sampleIdx(n) { var out = [], step = Math.max(1, Math.floor(n / SAMPLE)); for (var i = 0; i < n; i += step) out.push(i); return out; }
  function showVal(x) { return x === undefined ? BB.t('(none)') : JSON.stringify(x); }
  function rowRef(table, i, r) { var id = r && (r[ID_COLS[table]] || r.user_id || r.refund_id || r.dispute_id || (r.ad_id && r.date ? r.ad_id + ' ' + r.date : null)); return table + '[' + i + ']' + (id ? ' ' + id : ''); }
  function plural(n, forms) { return BB.plural(n, forms); } // thin wrapper: 'row|rows' → '3 rows' (RU forms from the dictionary)
  function spendDateOf(r) { // spend.date: 'YYYY-MM-DD' | ISO datetime | ms → {date, hour|null}
    var v = r.date, h = null, dstr = null;
    if (typeof v === 'string' && DATE_RE.test(v)) dstr = v;
    else { var ms = toMs(v); if (ms !== null && !isNaN(ms)) { dstr = isoDate(ms); if (typeof v === 'string' && v.length > 10) h = new Date(ms).getUTCHours(); } }
    return { date: dstr, hour: h };
  }
  /** Validates a raw JSON document before BB.index → {ok, errors:[{code, table, text (localised sentence), examples[]}], warnings:[same]}. Errors block the load; warnings do not.
   *  Catalogue tables are validated with BB.validateCatalogue; plan ids are checked against the catalogue the file will use. */
  BB.adapters = {
    /** Compact form: any table may be {columns: [names], rows: [[values]]} instead of an array of row objects. Expands such tables in place
     *  (null cells are left out, i.e. treated as absent fields) and returns raw. Idempotent; called by validate() and fromObject(). */
    expand: function (raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
      Object.keys(raw).forEach(function (t) {
        var v = raw[t];
        if (!v || Array.isArray(v) || typeof v !== 'object' || !Array.isArray(v.columns) || !Array.isArray(v.rows)) return;
        var cols = v.columns, out = new Array(v.rows.length);
        for (var i = 0; i < v.rows.length; i++) { var row = v.rows[i] || [], o = {}; for (var j = 0; j < cols.length; j++) { var x = row[j]; if (x !== null && x !== undefined) o[cols[j]] = x; } out[i] = o; }
        raw[t] = out;
      });
      return raw;
    },
    validate: function (raw) {
      BB.adapters.expand(raw);
      var errors = [], warnings = [];
      var E = function (code, table, text, ex) { errors.push({ code: code, table: table, text: text, examples: ex || [] }); };
      var W = function (code, table, text, ex) { warnings.push({ code: code, table: table, text: text, examples: ex || [] }); };
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { E('not_object', null, BB.t('The file must be a JSON object with tables users, trials, charges, refunds, disputes, spend.')); return { ok: false, errors: errors, warnings: warnings }; }
      var tables = {};
      REQUIRED_TABLES.concat(OPTIONAL_TABLES).forEach(function (t) {
        var v = raw[t];
        if (v === undefined || v === null) { if (t === 'users') E('missing_table', t, BB.t('Table users is missing; cohorts cannot be built without it.')); else if (REQUIRED_TABLES.indexOf(t) >= 0) W('missing_table', t, t === 'spend' ? BB.t('Table spend is missing: treated as empty (no CPT or ROAS).') : BB.t('Table {t} is missing: treated as empty.', { t: t })); return; }
        if (!Array.isArray(v)) { E('not_array', t, BB.t('Table {t} must be an array of objects, not {type}.', { t: t, type: typeof v === 'object' ? BB.t('an object') : typeof v })); return; }
        tables[t] = v;
        var idx = sampleIdx(v.length), bad = idx.filter(function (i) { return !v[i] || typeof v[i] !== 'object' || Array.isArray(v[i]); });
        if (bad.length) { E('not_object_rows', t, BB.t('Table {t} has rows that are not objects ({rows} in the sample).', { t: t, rows: plural(bad.length, 'row|rows') }), bad.slice(0, EXAMPLES).map(function (i) { return t + '[' + i + ']'; })); delete tables[t]; return; }
        if (v.length) {
          var missing = REQUIRED_COLS[t].filter(function (col) { return !idx.some(function (i) { return v[i][col] !== undefined; }); });
          if (missing.length) E('missing_columns', t, BB.t('Table {t} is missing required columns: {cols}.', { t: t, cols: missing.join(', ') }));
        }
      });
      if (raw.now !== undefined && raw.now !== null) { var nowMs = toMs(raw.now); if (nowMs === null || isNaN(nowMs)) E('bad_ts', null, BB.t('Field now is not a valid time (ms UTC or ISO string expected): {v}.', { v: JSON.stringify(raw.now) })); }
      if (raw.meta !== undefined && (raw.meta === null || typeof raw.meta !== 'object' || Array.isArray(raw.meta))) E('bad_meta', null, BB.t('Field meta must be an object (label_ru, from, to, generated_at).'));
      else if (raw.meta && raw.meta.generated_at !== undefined && raw.meta.generated_at !== null) { var g = toMs(raw.meta.generated_at); if (g === null || isNaN(g)) E('bad_ts', null, BB.t('Field meta.generated_at is not a valid time: {v}.', { v: JSON.stringify(raw.meta.generated_at) })); }
      var cat = BB.validateCatalogue(raw);
      cat.errors.forEach(function (txt) { E('catalogue', 'plans', txt); });
      var planIds = {}; (cat.plans || DEFAULT_PLANS).forEach(function (p) { planIds[p.id] = 1; });
      var sawEmptyRequired = {};
      /* timestamps (all rows), required-cell presence, duplicate ids */
      Object.keys(TS_FIELDS).forEach(function (t) {
        var v = tables[t]; if (!v) return;
        TS_FIELDS[t].forEach(function (f) {
          var ex = [], n = 0;
          for (var i = 0; i < v.length; i++) { var x = v[i][f]; if (x === undefined || x === null) continue; var ms = toMs(x); if (ms === null || isNaN(ms)) { n++; if (ex.length < EXAMPLES) ex.push(rowRef(t, i, v[i]) + ': ' + f + ' = ' + showVal(x)); } }
          if (n) E('bad_ts', t, BB.t('Table {t}: field {f} is not a valid time in {rows} (ms UTC or ISO string expected).', { t: t, f: f, rows: plural(n, 'row|rows') }), ex);
        });
      });
      Object.keys(ID_COLS).forEach(function (t) {
        var v = tables[t]; if (!v) return;
        var col = ID_COLS[t], seen = new Map(), dups = [], nd = 0, empty = 0, exe = [];
        for (var i = 0; i < v.length; i++) { var id = v[i][col]; if (id === undefined || id === null || id === '') { empty++; if (exe.length < EXAMPLES) exe.push(t + '[' + i + ']'); continue; } if (seen.has(id)) { nd++; if (dups.length < EXAMPLES) dups.push(String(id)); } else seen.set(id, 1); }
        if (empty && v.length) E('empty_id', t, BB.t('Table {t}: {rows} have an empty {col}.', { t: t, rows: plural(empty, 'row|rows'), col: col }), exe);
        if (nd) W('duplicate_ids', t, BB.t('Table {t}: duplicate {col} ({dups}); {effect}.', { t: t, col: col, dups: plural(nd, 'duplicate|duplicates'), effect: t === 'users' ? BB.t('the first row counts, the rest distort cohorts') : BB.t('rows are counted twice') }), dups);
      });
      /* references */
      if (tables.users) {
        var uids = new Set(); tables.users.forEach(function (u) { if (u.user_id != null) uids.add(u.user_id); });
        ['trials', 'charges', 'refunds', 'disputes', 'events'].forEach(function (t) {
          var v = tables[t]; if (!v || !v.length) return;
          var n = 0, ex = [];
          for (var i = 0; i < v.length; i++) if (v[i].user_id != null && !uids.has(v[i].user_id)) { n++; if (ex.length < EXAMPLES) ex.push(rowRef(t, i, v[i]) + ' → user_id ' + JSON.stringify(v[i].user_id)); }
          if (n) W('unknown_user', t, BB.t('Table {t}: {rows} reference a user_id not in users; {effect}.', { t: t, rows: plural(n, 'row|rows'), effect: t === 'charges' ? BB.t('this money is left out of cohorts') : BB.t('these rows are left out') }), ex);
        });
      }
      /* plan ids */
      [['trials', 'plan'], ['charges', 'plan'], ['users', 'plan']].forEach(function (tp) {
        var v = tables[tp[0]]; if (!v) return;
        var unknown = new Map();
        for (var i = 0; i < v.length; i++) { var p = v[i][tp[1]]; if (p === null || p === undefined) continue; if (tp[0] === 'charges' && v[i].type === 'pack') continue; if (!planIds[p]) unknown.set(p, (unknown.get(p) || 0) + 1); }
        if (unknown.size) W('unknown_plan', tp[0], BB.t('Table {t} has plans missing from the catalogue{src}: {ids}{more}. Trial length set to 3 days, period 7 days, MRR = 0; add a plans table.', { t: tp[0], src: cat.plans ? BB.t(' (plans table of the file)') : BB.t(' (built-in plan catalogue)'), ids: Array.from(unknown.keys()).slice(0, 5).join(', '), more: unknown.size > 5 ? BB.t(' and {n} more', { n: unknown.size - 5 }) : '' }), Array.from(unknown.entries()).slice(0, EXAMPLES).map(function (e) { return e[0] + ': ' + plural(e[1], 'row|rows'); }));
      });
      /* spend */
      if (tables.spend && tables.spend.length) {
        var sp = tables.spend, badDate = 0, exd = [], noHour = 0, noCountry = 0, idx = sampleIdx(sp.length);
        for (var i = 0; i < sp.length; i++) { var sd = spendDateOf(sp[i]); if (!sd.date) { badDate++; if (exd.length < EXAMPLES) exd.push(rowRef('spend', i, sp[i]) + ': date = ' + showVal(sp[i].date)); } }
        if (badDate) E('bad_ts', 'spend', BB.t('Table spend: field date is not a valid date in {rows} (YYYY-MM-DD, ISO or ms expected).', { rows: plural(badDate, 'row|rows') }), exd);
        idx.forEach(function (i) { if (sp[i].hour === undefined || sp[i].hour === null) noHour++; if (sp[i].country === undefined || sp[i].country === null) noCountry++; });
        if (noHour === idx.length) W('no_hour', 'spend', BB.t('Table spend has no hour field: spend placed at 00:00 UTC each day (hourly Real-time will be coarse).'));
        if (noCountry === idx.length) W('no_country', 'spend', BB.t('Table spend has no country field: geo CPT / ROAS are allocated by signups (badge “≈ spend allocated”).'));
        ZERO_COLS.spend.filter(function (c) { return c !== 'hour'; }).forEach(function (c) { if (idx.every(function (i) { return sp[i][c] === undefined || sp[i][c] === null; })) W('zero_default', 'spend', BB.t('Table spend has no {c} field: set to 0 (CTR / CPC / CPM and Flow entry will be empty).', { c: c })); });
      }
      if (tables.charges && tables.charges.length) {
        var ch = tables.charges, noFee = 0, cidx = sampleIdx(ch.length), badStatus = 0, exs = [];
        cidx.forEach(function (i) { if (ch[i].fee_usd === undefined || ch[i].fee_usd === null) noFee++; });
        if (noFee) W('fee_default', 'charges', BB.t('Table charges: {what}; fees computed by the default rules (Stripe 2.9 % + $0.30, +1.5 % non-US card, +1 % non-USD; PayPal 3.49 % + $0.49).', { what: noFee === cidx.length ? BB.t('no fee_usd field') : BB.t('some rows lack fee_usd') }));
        for (var k = 0; k < ch.length; k++) if (ch[k].status !== 'succeeded' && ch[k].status !== 'failed') { badStatus++; if (exs.length < EXAMPLES) exs.push(rowRef('charges', k, ch[k]) + ': status = ' + showVal(ch[k].status)); }
        if (badStatus) W('bad_status', 'charges', BB.t("Table charges: {rows} have a status other than 'succeeded' / 'failed'; counted as failed.", { rows: plural(badStatus, 'row|rows') }), exs);
      }
      if (tables.users && tables.users.length) {
        var us = tables.users, uidx = sampleIdx(us.length);
        if (uidx.every(function (i) { return us[i].has_email === undefined; })) W('default_false', 'users', BB.t('Table users has no has_email field: set to false, EMQ chip will be 0 %.'));
        if (uidx.every(function (i) { return us[i].browser === undefined; })) W('default_null', 'users', BB.t('Table users has no browser field: browser unknown, in-app browser share not computed.'));
      }
      if (tables.users && tables.users.length && !(tables.events && tables.events.length)) W('no_events', 'events', BB.t('Table events is empty or missing: checkout funnel and paywall views unavailable.'));
      return { ok: !errors.length, errors: errors, warnings: warnings };
    },
    /** Normalises a raw document in place (timestamps → ms, numeric defaults, fee_usd, spend.date/hour) — after validate, before BB.index. */
    normalize: function (d) {
      REQUIRED_TABLES.forEach(function (t) { d[t] = Array.isArray(d[t]) ? d[t] : []; }); // optional: subscriptions, events, campaigns (derived when absent)
      OPTIONAL_TABLES.forEach(function (t) { if (d[t] !== undefined && !Array.isArray(d[t])) delete d[t]; });
      Object.keys(TS_FIELDS).forEach(function (t) { var v = d[t]; if (!v) return; var fs = TS_FIELDS[t]; for (var i = 0; i < v.length; i++) for (var j = 0; j < fs.length; j++) { var f = fs[j]; if (v[i][f] !== undefined) { var ms = toMs(v[i][f]); v[i][f] = ms === null || isNaN(ms) ? null : ms; } } });
      d.now = toMs(d.now); if (d.now === null || isNaN(d.now)) d.now = null;
      if (d.meta && d.meta.generated_at !== undefined) { var g = toMs(d.meta.generated_at); d.meta.generated_at = g === null || isNaN(g) ? null : g; }
      d.spend.forEach(function (r) {
        var sd = spendDateOf(r); if (sd.date) r.date = sd.date; if ((r.hour === undefined || r.hour === null) && sd.hour !== null) r.hour = sd.hour;
        ZERO_COLS.spend.forEach(function (c) { r[c] = +r[c] || 0; });
        r.spend_usd = +r.spend_usd || 0;
      });
      d.charges.forEach(function (c) { c.amount_usd = +c.amount_usd || 0; if (c.fee_usd === undefined || c.fee_usd === null || c.fee_usd === '') c.fee_usd = BB.feeOf(c); else c.fee_usd = +c.fee_usd || 0; });
      d.refunds.forEach(function (r) { r.amount_usd = +r.amount_usd || 0; });
      d.disputes.forEach(function (x) { x.amount_usd = +x.amount_usd || 0; x.fee_usd = x.fee_usd === undefined || x.fee_usd === null ? 15 : +x.fee_usd || 0; });
      return d;
    },
    /** Raw document (already parsed) → validated, normalised, catalogue applied, indexed dataset cached in BB.load(). Throws Error with .validation when errors exist. */
    fromObject: function (raw, info) {
      BB.adapters.expand(raw);
      var v = BB.adapters.validate(raw);
      if (!v.ok) { var err = new Error(BB.t('Data file failed validation: {errors}', { errors: v.errors.map(function (e) { return e.text; }).join(' ') })); err.validation = v; err.code = 'validation'; throw err; }
      var cat = BB.validateCatalogue(raw); BB.setCatalogue(cat);
      var d = BB.adapters.normalize(raw);
      var url = info && info.url || '', file = url ? url.split('?')[0].split('#')[0].split('/').pop() || url : 'JSON';
      d.meta = Object.assign({ source: 'json' }, d.meta || {}, { url: url, file: file, validation: v });
      if (!d.meta.generated_at && d.now) d.meta.generated_at = d.now;
      if (!d.meta.label && !d.meta.label_ru) d.meta.label = d.meta.label_ru = file + (d.meta.generated_at ? ' · ' + BB.fmt.stampUtc(d.meta.generated_at) : ''); // file badge: same text in both languages
      if (!d.meta.from && d.users.length) d.meta.from = isoDate(Math.min.apply(null, d.users.map(function (u) { return u.signup_ts; }).filter(function (x) { return x != null; })));
      if (!d.meta.to && (d.now || d.meta.generated_at)) d.meta.to = isoDate(d.now || d.meta.generated_at);
      _cache = BB.index(d);
      return _cache;
    },
    /** Loads a JSON document with the same tables: {users, trials, charges, refunds, disputes, spend, meta?, now?, plans?, paywalls?, campaigns?, events?, subscriptions?}.
     *  Timestamps may be ISO strings or ms; validated (BB.adapters.validate) and normalised. Returns Promise<dataset> (indexed, cached in BB.load()); rejects with Error {code:'http'|'parse'|'validation'|'network', status?, validation?}. */
    json: function (url) {
      var fetchFn = typeof fetch === 'function' ? fetch : null;
      if (!fetchFn) return Promise.reject(new Error(BB.t('fetch is not available')));
      return fetchFn(url, { cache: 'no-store' }).catch(function (e) { var err = new Error(BB.t('Could not fetch {url}: {err}.', { url: url, err: e && e.message || e })); err.code = 'network'; throw err; })
        .then(function (r) {
          if (!r.ok) { var err = new Error(BB.t('Server returned {status} for {url}.', { status: r.status + (r.statusText ? ' ' + r.statusText : ''), url: url })); err.code = 'http'; err.status = r.status; throw err; }
          return r.text().then(function (txt) { try { return JSON.parse(txt); } catch (e) { var err = new Error(BB.t('File {url} is not valid JSON: {err}.', { url: url, err: e.message })); err.code = 'parse'; throw err; } });
        })
        .then(function (raw) { return BB.adapters.fromObject(raw, { url: url }); });
    },
    /** STUB. Stripe CSV exports → tables. Intended mapping:
     *  - payments.csv: id→charge_id, Customer→user_id (via metadata.user_id), Created (UTC)→ts, Amount→amount_usd (Converted Amount),
     *    Status (Paid/Failed)→status, Decline Reason→decline_code, Fee→fee_usd, Card Issue Country→card_country, Card Funding→card_funding,
     *    metadata.type ('intro'|'rebill'|'renewal'|'pack')→type, metadata.renewal_n→n, metadata.attempt→attempt, metadata.plan→plan.
     *  - refunds.csv: id→refund_id, Charge→charge_id, Created→ts, Amount→amount_usd.
     *  - disputes.csv: id→dispute_id, Charge→charge_id, Created→ts, Amount→amount_usd, Reason→reason, Status→status, fee_usd=15.
     *  - customers.csv + metadata (utm_*, campaign/adset/ad ids, country, device, lang, paywall, plan)→users; trials from metadata.trial_started_at.
     *  Spend must come from a Meta Insights export (ad-level, hourly breakdown). Not implemented: throws. */
    stripeCsv: function (files) { throw new Error('BB.adapters.stripeCsv: not implemented — see the JSDoc mapping'); }
  };

  /* Data pointer (loader item 1). Captured at script load: data-src attribute on the core.js <script> tag. */
  BB.DEFAULT_DATA_URL = './data/demo.json';
  var SCRIPT_DATA_SRC = (function () { try { var sc = typeof document !== 'undefined' && document.currentScript; return sc && sc.getAttribute('data-src') || null; } catch (e) { return null; } })();
  /** Resolves where the data comes from: ?data=<url> → window.BB_DATA_URL → data-src on the core.js tag → BB.DEFAULT_DATA_URL (./data/demo.json). Pure given {search, global, attr}; defaults read the browser environment. */
  BB.dataSource = function (env) {
    env = env || {};
    var search = env.search !== undefined ? env.search : (typeof location !== 'undefined' ? location.search : '');
    var global = env.global !== undefined ? env.global : (typeof window !== 'undefined' ? window.BB_DATA_URL : undefined);
    var attr = env.attr !== undefined ? env.attr : SCRIPT_DATA_SRC;
    var q = null;
    if (search) { var m = /[?&]data=([^&#]*)/.exec(search); if (m) { try { q = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { q = m[1]; } } }
    if (q) return { kind: 'query', url: q };
    if (typeof global === 'string' && global) return { kind: 'global', url: global };
    if (typeof attr === 'string' && attr) return { kind: 'attr', url: attr };
    return { kind: 'default', url: BB.DEFAULT_DATA_URL };
  };
  var _boot = null;
  /** Starts loading the dataset for the resolved source (once): BB.adapters.json(url). Rejections carry {code, status?, validation?, source}. */
  BB.boot = function (env) {
    if (_boot) return _boot;
    var src = BB.dataSource(env);
    BB.bootSource = src;
    _boot = BB.adapters.json(src.url).catch(function (e) { e.source = src; BB.bootError = e; throw e; });
    return _boot;
  };
  /** Promise of the dataset the page should render (calls BB.boot() when nothing started it). */
  BB.ready = function () { return _boot || BB.boot(); };
  /* test hook: forget the boot promise and the cached dataset (does not touch the catalogue) */
  BB._resetLoader = function () { _boot = null; _cache = null; delete BB.bootError; delete BB.bootSource; };


  /* Value of a dimension for a user (string). */
  BB.dimValue = function (u, dim) {
    var v, d = BB.DIM_BY_ID[dim];
    if (dim === 'fbclid_present') return u.fbclid_present ? BB.t('yes') : BB.t('no');
    v = u[d && d.field ? d.field : dim];
    return v === null || v === undefined ? BB.t('(none)') : String(v);
  };
  /* Dominant locale currency of a user set (≥ 90 % share and ≠ USD) → {code, symbol, rate, share}; else USD. state.currency !== 'local' → USD. */
  BB.localCurrency = function (data, state) {
    var usd = { code: 'USD', symbol: '$', rate: 1, share: 1 };
    if (!state || state.currency !== 'local') return usd;
    var f = BB.filter(data, state), m = new Map(), n = 0;
    f.users.forEach(function (u) { var c = u.locale_currency || 'USD'; m.set(c, (m.get(c) || 0) + 1); n++; });
    var best = null; m.forEach(function (cnt, c) { if (!best || cnt > best[1]) best = [c, cnt]; });
    if (!best || !BB.CURRENCIES[best[0]] || best[0] === 'USD' || best[1] / n < 0.9) return usd;
    return { code: best[0], symbol: BB.CURRENCIES[best[0]].symbol, rate: BB.CURRENCIES[best[0]].rate, share: best[1] / n };
  };

  /* ───────────────────────── Time buckets ───────────────────────── */
  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monS(i) { return BB.t(MON_SHORT[i]); }   // translated per call (dictionary may load after core.js)
  function monL(i) { return BB.t(MON_LONG[i]); }
  function mondayOf(ts) { var d = startOfDay(ts); var dow = (new Date(d).getUTCDay() + 6) % 7; return d - dow * DAY; }
  function isoWeek(ts) {
    var d = new Date(startOfDay(ts)); var day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    var firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  }
  function bucketRaw(ts, step) {
    var d = new Date(ts);
    if (step === 'hour') return isoDate(ts) + 'T' + pad2(d.getUTCHours());
    if (step === 'week') return isoDate(mondayOf(ts));
    if (step === 'month') return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1);
    return isoDate(ts);
  }
  var bucketCache = { hour: {}, day: {}, week: {}, month: {} };
  /* Memoised per hour / day index: bucketing ≈ 250k spend rows is the hottest loop of every board. */
  BB.bucket = function (ts, step) {
    var c = bucketCache[step] || (bucketCache[step] = {}), k = step === 'hour' ? Math.floor(ts / HOUR) : Math.floor(ts / DAY);
    return c[k] || (c[k] = bucketRaw(ts, step));
  };
  BB.bucketStart = function (key, step) {
    if (step === 'hour') return parseDate(key.slice(0, 10)) + parseInt(key.slice(11, 13), 10) * HOUR;
    if (step === 'month') return parseDate(key + '-01');
    return parseDate(key);
  };
  BB.bucketEnd = function (key, step) { // exclusive
    var s = BB.bucketStart(key, step);
    if (step === 'hour') return s + HOUR;
    if (step === 'week') return s + 7 * DAY;
    if (step === 'month') { var d = new Date(s); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
    return s + DAY;
  };
  BB.bucketLabel = function (key, step) {
    var s = BB.bucketStart(key, step), d = new Date(s);
    if (step === 'hour') return pad2(d.getUTCHours()) + ':00';
    if (step === 'month') return monL(d.getUTCMonth()) + ' ' + d.getUTCFullYear();
    if (step === 'week') {
      var e = new Date(s + 6 * DAY);
      var span = d.getUTCMonth() === e.getUTCMonth() ? d.getUTCDate() + '–' + e.getUTCDate() + ' ' + monS(e.getUTCMonth())
        : d.getUTCDate() + ' ' + monS(d.getUTCMonth()) + ' – ' + e.getUTCDate() + ' ' + monS(e.getUTCMonth());
      return BB.t('Wk') + ' ' + isoWeek(s) + ' · ' + span;
    }
    return d.getUTCDate() + ' ' + monS(d.getUTCMonth());
  };
  /* All bucket keys covering [from, to]. */
  BB.bucketsBetween = function (from, to, step) {
    var keys = [], k = BB.bucket(from, step);
    while (BB.bucketStart(k, step) <= to) { keys.push(k); k = BB.bucket(BB.bucketEnd(k, step), step); }
    return keys;
  };

  /* ───────────────────────── State (URL hash) ───────────────────────── */
  BB.PRESETS = [
    { id: 'today', label: 'Today', label_ru: 'Сегодня' }, { id: 'yesterday', label: 'Yesterday', label_ru: 'Вчера' }, { id: '7d', label: '7d', label_ru: '7д' }, { id: '14d', label: '14d', label_ru: '14д' },
    { id: '30d', label: '30d', label_ru: '30д' }, { id: '90d', label: '90d', label_ru: '90д' }, { id: 'all', label: 'All', label_ru: 'Всё' }, { id: 'custom', label: 'Custom', label_ru: 'Период' }
  ];
  BB.PAGES = { cohorts: 'index.html', realtime: 'realtime.html', predict: 'predict.html', flow: 'flow.html' };
  var hasLoc = function () { return typeof location !== 'undefined' && typeof history !== 'undefined'; };
  var memHash = '', listeners = [], hooked = false;
  function getHash() { return hasLoc() ? decodeURIComponent(location.hash.replace(/^#/, '')) : memHash; }
  function parseHash(h) {
    var st = {};
    if (!h) return st;
    h.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      if (k.slice(0, 2) === 'f.') { (st.filters = st.filters || {})[k.slice(2)] = v.split(',').filter(Boolean).map(decodeURIComponent); }
      else if (k === 'g') st.groupBy = v || null;
      else if (k === 'offsets') st.offsets = v.split(',').map(Number).filter(function (n) { return !isNaN(n); });
      else st[k] = v;
    });
    return st;
  }
  function serialize(st) {
    var parts = [];
    Object.keys(st).sort().forEach(function (k) {
      var v = st[k];
      if (v === null || v === undefined || v === '' || k === 'filters') return;
      if (k === 'groupBy') { parts.push('g=' + encodeURIComponent(v)); return; }
      if (k === 'offsets') { parts.push('offsets=' + v.join(',')); return; }
      parts.push(k + '=' + encodeURIComponent(String(v)));
    });
    if (st.filters) Object.keys(st.filters).sort().forEach(function (d) {
      var vals = st.filters[d]; if (vals && vals.length) parts.push('f.' + d + '=' + vals.map(encodeURIComponent).join(','));
    });
    return parts.join('&');
  }
  /* ───── Persisted scope (rail panel: project / source / account) ─────
     localStorage 'bb-scope' = { remember, project, channel, account, ts }. remember (default true) → the last selection is restored on every board
     when the hash does not carry the key (hash > saved > default). remember=false → nothing is stored, boards open with the defaults.
     No localStorage (node, private mode) → in-memory object. */
  var SCOPE_KEYS = ['project', 'channel', 'account'], SCOPE_LS = 'bb-scope', memScope = null;
  function scopeRead() {
    var o = null;
    try { if (typeof localStorage !== 'undefined') o = JSON.parse(localStorage.getItem(SCOPE_LS) || 'null'); } catch (e) { o = null; }
    if (!o && memScope) o = memScope;
    o = o && typeof o === 'object' ? o : {};
    if (o.remember === undefined) o.remember = true;
    return o;
  }
  function scopeWrite(o) {
    memScope = o;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(SCOPE_LS, JSON.stringify(o)); } catch (e) { /* private mode */ }
    return o;
  }
  BB.scope = {
    KEYS: SCOPE_KEYS, STORAGE_KEY: SCOPE_LS,
    get: scopeRead,
    /* Turn remembering on/off; off clears the stored values. on → caller usually saves the current selection right away. */
    setRemember: function (on) { var o = on ? Object.assign(scopeRead(), { remember: true }) : { remember: false }; return scopeWrite(o); },
    /* Store the scope keys of patch (others ignored); no-op when remember is off. */
    save: function (patch) {
      var o = scopeRead(); if (!o.remember || !patch) return o;
      var touched = false;
      SCOPE_KEYS.forEach(function (k) { if (patch[k] !== undefined) { if (patch[k] === null) delete o[k]; else o[k] = String(patch[k]); touched = true; } });
      if (touched) { o.ts = Date.now(); scopeWrite(o); }
      return o;
    },
    /* Fill the scope keys the parsed hash lacks from storage (remember on). Mutates and returns st. */
    apply: function (st) {
      var o = scopeRead(); if (!o.remember) return st;
      SCOPE_KEYS.forEach(function (k) { if (st[k] === undefined && o[k] !== undefined && o[k] !== null) st[k] = o[k]; });
      return st;
    },
    clear: function () { memScope = null; try { if (typeof localStorage !== 'undefined') localStorage.removeItem(SCOPE_LS); } catch (e) { /* ignore */ } }
  };
  function fire() { var st = BB.state.read(); listeners.forEach(function (cb) { try { cb(st); } catch (e) { console.error(e); } }); }
  BB.state = {
    parse: parseHash, serialize: serialize,
    /* Defaults per page ('cohorts'|'realtime'|'predict'|'flow'). */
    defaults: function (page) {
      var base = { preset: '30d', step: 'day', basis: 'signup', money: 'gross', compare: 'prev', groupBy: null, filters: {}, metric: 'roas', offsets: BB.DEFAULT_OFFSETS.slice(),
        channel: 'all', device: 'all', currency: 'usd', view: null, payer: 'any', account: 'all', project: 'demo' }; // scope panel: account (ad account id | all), project (placeholder, BB.PROJECTS) // v2: channel segmented filter, device quick toggle (all|mobile|desktop), currency (usd|local), saved view name
      if (page === 'realtime') Object.assign(base, { preset: 'today', step: 'hour', metric: 'roas' });
      if (page === 'predict') Object.assign(base, { step: 'week', signalDay: 'all', targetRoas: '1', horizon: '90', margin: '0', model: 'sbg' });
      if (page === 'flow') Object.assign(base, { preset: 'today', step: 'hour', mode: 'users' });
      return base;
    },
    /* Parsed hash; with page → merged over defaults(page). */
    read: function (page) {
      var st = parseHash(getHash());
      if (st.preset === undefined && (st.from || st.to)) st.preset = 'custom';
      if (page) BB.scope.apply(st); // saved project / channel / account when the hash has none
      return page ? Object.assign(BB.state.defaults(page), st) : st;
    },
    /* Merge patch into hash (null removes a key). Notifies onChange listeners. */
    write: function (patch) {
      var st = Object.assign(parseHash(getHash()), patch || {});
      Object.keys(st).forEach(function (k) { if (st[k] === null || st[k] === undefined) delete st[k]; });
      if (st.preset && st.preset !== 'custom') { delete st.from; delete st.to; }
      var h = serialize(st);
      if (hasLoc()) { history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : '')); }
      else memHash = h;
      BB.scope.save(patch); // scope keys of the patch → last selection (remember on)
      fire();
      return st;
    },
    onChange: function (cb) {
      listeners.push(cb);
      if (!hooked && typeof window !== 'undefined' && window.addEventListener) { hooked = true; window.addEventListener('hashchange', fire); }
      return function () { listeners = listeners.filter(function (f) { return f !== cb; }); };
    },
    /* href to another board keeping the current hash. page = key of BB.PAGES or a file name.
       step=hour is downgraded to day when the target board has no hourly step (only realtime / flow do). */
    link: function (page, patch) {
      var file = BB.PAGES[page] || page;
      var key = BB.PAGES[page] ? page : Object.keys(BB.PAGES).filter(function (k) { return BB.PAGES[k] === file; })[0] || null;
      var st = Object.assign(parseHash(getHash()), patch || {});
      if (st.step === 'hour' && key !== 'realtime' && key !== 'flow') st.step = 'day';
      var h = serialize(st);
      return './' + file + (h ? '#' + h : '');
    },
    /* {from, to} ms for the state's preset/custom range. */
    resolveRange: function (st, now) {
      now = now || (_cache && _cache.now) || Date.now();
      var today = startOfDay(now), p = st.preset || (st.from || st.to ? 'custom' : '30d');
      var m = /^(\d+)d$/.exec(p);
      if (p === 'today') return { from: today, to: now };
      if (p === 'yesterday') return { from: today - DAY, to: today - 1 };
      if (m) return { from: today - (parseInt(m[1], 10) - 1) * DAY, to: now };
      if (p === 'all') { var mf = _cache && _cache.meta && _cache.meta.from && DATE_RE.test(_cache.meta.from) ? parseDate(_cache.meta.from) : today - 365 * DAY; return { from: mf, to: now }; } // whole dataset: data.meta.from (first signup day)
      var from = st.from ? parseDate(st.from) : today - 29 * DAY;
      var to = st.to ? Math.min(parseDate(st.to) + DAY - 1, now) : now;
      return { from: from, to: to };
    },
    /* Previous period of equal length (whole days), aligned to the same elapsed time. */
    compareRange: function (range) {
      var shift = Math.max(DAY, Math.ceil((range.to - range.from) / DAY) * DAY);
      return { from: range.from - shift, to: range.to - shift, shift: shift };
    },
    /* What "Compare with" means for a state: compare = 'prev' (default) | 'none' | 'channel:<id>' (same cohort / range, another channel).
       → null | {kind:'prev', state, range} | {kind:'channel', channel, state (same range, channel swapped), range (same)}. */
    compareOf: function (st, range, now, data) {
      var c = (st && st.compare) || 'prev';
      if (c === 'none') return null;
      range = range || BB.state.resolveRange(st || {}, now);
      if (c.slice(0, 8) === 'channel:') {
        var ch = c.slice(8);
        return { kind: 'channel', channel: ch, range: Object.assign({}, range, { shift: 0 }), coverage: 1, valid: true, state: Object.assign({}, st, { channel: ch, compare: 'none' }) };
      }
      var cr = BB.state.compareRange(range), cov = BB.state.compareCoverage(cr, data || _cache);
      return { kind: 'prev', range: cr, coverage: cov, valid: cov === null || cov >= BB.COMPARE_MIN_COVERAGE, state: Object.assign({}, st, { preset: 'custom', from: isoDate(cr.from), to: isoDate(cr.to), compare: 'none' }) };
    },
    /* Share of the compare window's days that lie inside the data set (data.meta.from..to); null when the data bounds are unknown.
       A window covering < BB.COMPARE_MIN_COVERAGE (60 %) has no full period to compare with → pages render deltas as "—". */
    compareCoverage: function (cr, data) {
      var meta = data && data.meta; if (!meta || !meta.from || !cr) return null;
      var dFrom = parseDate(meta.from), dTo = meta.to ? parseDate(meta.to) + DAY : Infinity;
      var span = Math.max(36e5, cr.to - cr.from), inside = Math.max(0, Math.min(cr.to, dTo) - Math.max(cr.from, dFrom)); // span = the window itself (an intraday 'today' window is a few hours, not a day)
      return clamp(inside / span, 0, 1);
    }
  };

  /* ───────────────────────── Filtering & spend allocation ───────────────────────── */
  var SPEND_FIELDS = ['spend_usd', 'impressions', 'clicks', 'link_clicks', 'landing_views'];
  function anchorOf(u, basis) { return basis === 'trial' ? (u._trial ? u._trial.ts : null) : u.signup_ts; }
  BB.anchorOf = anchorOf;
  function spendHas(spend, dim) { // can spend rows be sliced by dim directly?
    var d = BB.DIM_BY_ID[dim];
    if (!d) return false;
    if (d.spendable) return true;
    if (dim === 'country' || dim === 'geo_tier') return spendHasCountry(spend); // geo_tier derived from spend.country in BB.index
    return false;
  }
  var _spendCountry = typeof WeakMap === 'function' ? new WeakMap() : null;
  function spendHasCountry(spend) { // any row of a ≤ 500-row sample (evenly spaced) carries country; memoised per array
    if (!spend || !spend.length) return false;
    if (_spendCountry && _spendCountry.has(spend)) return _spendCountry.get(spend);
    var step = Math.max(1, Math.floor(spend.length / 500)), has = false;
    for (var i = 0; i < spend.length; i += step) if (spend[i].country != null) { has = true; break; }
    if (_spendCountry) _spendCountry.set(spend, has);
    return has;
  }
  BB.spendHasCountry = spendHasCountry;
  BB.spendHas = spendHas;
  /* state.filters + the toolbar quick filters (channel segmented control, device toggle) → one filters object. */
  function effFilters(state) {
    var f = Object.assign({}, (state && state.filters) || {});
    if (state && state.channel && state.channel !== 'all') f.channel = [state.channel];
    if (state && state.account && state.account !== 'all') f.account = [String(state.account)];
    if (state && state.device && state.device !== 'all') f.device_class = [state.device];
    return f;
  }
  BB.effFilters = effFilters;
  function makeDimOk(filters) {
    var dims = Object.keys(filters || {}).filter(function (d) { return filters[d] && filters[d].length; });
    if (!dims.length) return null;
    var sets = dims.map(function (d) { var s = new Set(filters[d].map(String)); return { d: d, s: s }; });
    return function (u) { for (var i = 0; i < sets.length; i++) if (!sets[i].s.has(BB.dimValue(u, sets[i].d))) return false; return true; };
  }
  /* Shares of signups per spend slot (ad_id|date) for each slice; fallback = global shares. */
  function slotShares(usersByAdDate, usersInRange, sliceOf) {
    var slots = new Map(), glob = new Map(), globTot = 0;
    usersInRange.forEach(function (u) {
      if (!u.ad_id) return;
      var k = u.ad_id + '|' + isoDate(u.signup_ts), sl = sliceOf(u);
      if (sl === null || sl === undefined) return;
      var m = slots.get(k); if (!m) { m = { tot: 0, by: new Map() }; slots.set(k, m); }
      m.tot++; m.by.set(sl, (m.by.get(sl) || 0) + 1);
      glob.set(sl, (glob.get(sl) || 0) + 1); globTot++;
    });
    return { slots: slots, glob: glob, globTot: globTot };
  }
  /** Proportional spend allocation for dimensions spend rows don't carry.
   *  {spend, users (signups joined to the same dates), sliceOf(u)→slice, bucketOf?(row)→bucket}
   *  → {map: Map(bucket|slice or slice → {spend_usd, impressions, clicks, link_clicks, landing_views}), allocated:true} */
  BB.allocSpend = function (o) {
    var sh = slotShares(null, o.users, o.sliceOf), map = new Map();
    function add(key, row, share) {
      var a = map.get(key); if (!a) { a = { spend_usd: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_views: 0 }; map.set(key, a); }
      SPEND_FIELDS.forEach(function (f) { a[f] += (row[f] || 0) * share; });
    }
    o.spend.forEach(function (r) {
      var slot = sh.slots.get(r.ad_id + '|' + r.date), b = o.bucketOf ? o.bucketOf(r) + '|' : '';
      if (slot) slot.by.forEach(function (n, sl) { add(b + sl, r, n / slot.tot); });
      else if (sh.globTot) sh.glob.forEach(function (n, sl) { add(b + sl, r, n / sh.globTot); });
    });
    return { map: map, allocated: true };
  };
  function aggSpend(rows) {
    var a = { spend_usd: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_views: 0 };
    for (var i = 0; i < rows.length; i++) for (var j = 0; j < SPEND_FIELDS.length; j++) a[SPEND_FIELDS[j]] += rows[i][SPEND_FIELDS[j]] || 0;
    return a;
  }
  BB.aggSpend = aggSpend;

  /* Share of each spend row that belongs to the slice defined by the NON-spendable filters (signups of the same ad+date), direct filters respected.
     → share(row) → 0..1; null when no allocation is needed. Used by BB.filter and BB.timeseries. */
  function spendAllocator(data, filters, range) {
    var fdims = Object.keys(filters || {}).filter(function (k) { return filters[k] && filters[k].length; });
    var alloc = fdims.filter(function (k) { return !spendHas(data.spend, k); });
    if (!alloc.length) return null;
    var direct = fdims.filter(function (k) { return spendHas(data.spend, k); });
    var aOk = makeDimOk(alloc.reduce(function (o, k) { o[k] = filters[k]; return o; }, {}));
    var dOk = makeDimOk(direct.reduce(function (o, k) { o[k] = filters[k]; return o; }, {}));
    var joined = data.users.filter(function (u) { return u.signup_ts >= range.from && u.signup_ts <= range.to && (!dOk || dOk(u)); });
    var sh = slotShares(null, joined, function (u) { return aOk(u) ? 'in' : 'out'; });
    var gShare = sh.globTot ? (sh.glob.get('in') || 0) / sh.globTot : 0;
    return function (r) { var slot = sh.slots.get(r.ad_id + '|' + r.date); return slot ? (slot.by.get('in') || 0) / slot.tot : gShare; };
  }
  BB.spendAllocator = spendAllocator;
  /** Apply state (range on cohort anchor per basis, dimension filters + state.channel / state.device quick filters) → filtered dataset.
   *  Returns {users, trials, charges, refunds, disputes, spend, spendAllocated, range, now, basis, index, raw, _filtered:true}.
   *  Passing an already filtered dataset returns it unchanged. */
  BB.filter = function (data, state) {
    if (data._filtered) return data;
    if (!data._indexed) BB.index(data);
    state = Object.assign({}, state || {}); state.filters = effFilters(state);
    var basis = state.basis || 'signup', ix = data.index, now = data.now;
    var range = BB.state.resolveRange(state, now);
    var dimOk = makeDimOk(state.filters);
    var users = [], trials = [], charges = [], refunds = [], disputes = [];
    for (var i = 0; i < data.users.length; i++) {
      var u = data.users[i], a = anchorOf(u, basis);
      if (a === null || a < range.from || a > range.to) continue;
      if (dimOk && !dimOk(u)) continue;
      users.push(u);
      var t = ix.trialsByUser.get(u.user_id); if (t) trials.push.apply(trials, t);
      var c = ix.chargesByUser.get(u.user_id); if (c) charges.push.apply(charges, c);
      var r = ix.refundsByUser.get(u.user_id); if (r) refunds.push.apply(refunds, r);
      var d = ix.disputesByUser.get(u.user_id); if (d) disputes.push.apply(disputes, d);
    }
    // spend: date range, then direct filters for spendable dims, allocation for the others
    var fdims = Object.keys(state.filters || {}).filter(function (k) { return state.filters[k] && state.filters[k].length; });
    var direct = fdims.filter(function (k) { return spendHas(data.spend, k); });
    var alloc = fdims.filter(function (k) { return !spendHas(data.spend, k); });
    var dsets = direct.map(function (k) { return { k: k, s: new Set(state.filters[k].map(String)) }; });
    var spend = data.spend.filter(function (r) {
      if (r._ts < range.from || r._ts > range.to) return false;
      for (var j = 0; j < dsets.length; j++) if (!dsets[j].s.has(String(r[dsets[j].k]))) return false;
      return true;
    });
    var spendAllocated = false;
    if (alloc.length) {
      var share = spendAllocator(data, state.filters, range);
      spend = spend.map(function (r) { var sh = share(r), o = Object.assign({}, r, { allocated: true }); SPEND_FIELDS.forEach(function (f) { o[f] = (r[f] || 0) * sh; }); return o; });
      spendAllocated = true;
    }
    return { users: users, trials: trials, charges: charges, refunds: refunds, disputes: disputes, spend: spend, spendAllocated: spendAllocated,
      range: range, now: now, basis: basis, state: state, index: ix, raw: data, dimOk: dimOk, _filtered: true };
  };

  /* ───────────────────────── Row builder (shared by cohorts / breakdown / hierarchy) ───────────────────────── */
  var OFF_FIELDS = ['rev_gross', 'fees', 'charges_ok', 'renewals', 'packs_rev', 'failed', 'insufficient', 'attempts', 'attempts_all', 'ok_all', 'three_ds', 'refunds', 'refunds_n',
    'disputes', 'dispute_fees', 'disputes_n', 'payers', 'active', 'active_mrr', 'initial_mrr', 'firstRebillOk', 'firstRebillFail', 'trialsEnded', 'cancelledInTrial', 'maturedUsers',
    'mTrials', 'mQual', 'upgrades', 'winbacks', 'coupon_n', 'coupon_disc', 'recovered', 'failed_first', 'fx_fee', 'churn_vol', 'churn_invol'];
  var FI = {}; OFF_FIELDS.forEach(function (f, i) { FI[f] = i; });
  var NF = OFF_FIELDS.length;
  function emptyOffset() {
    var o = {}; for (var i = 0; i < NF; i++) o[OFF_FIELDS[i]] = 0;
    o.rev_net = 0; o.mature = true; o.spend = 0; o.signups = 0; o.trials = 0; o.qualified = 0;
    delete o.mTrials; delete o.mQual;
    return o;
  }
  function trialEndOf(t) { var P = BB.PLAN_BY_ID[t.plan]; return t.ts + (P ? P.trialDays : 3) * DAY; }
  function periodOf(plan) { var P = BB.PLAN_BY_ID[plan]; return P ? P.periodDays : 7; }

  /** Build one row from a set of users. o = {key, label, users, spendAgg, offsets, basis, now, index, bucketStart?, bucketEnd?, cohortEnd?, groupKey?, groupLabel?, spendAllocated, money, maturity?}
   *  maturity: 'date' (default, cohort rows) — byOffset[N].mature when today − cohort_end_day ≥ N, numerators over all users;
   *            'users' (breakdown / hierarchy rows spanning many signup days) — per-user: only users with age ≥ N contribute to byOffset[N]
   *            (numerators AND denominators: signups/trials/qualified = matured users, spend prorated by matured share);
   *            mature when maturedUsers ≥ 30 or ≥ 50 % of the row's users.
   *  Implementation: every per-user contribution is a range over offset indexes [j0, jEnd) written into difference arrays, prefix-summed once per row. */
  function buildRow(o) {
    var offsets = o.offsets || BB.OFFSETS, now = o.now, ix = o.index, todayStart = startOfDay(now), perUser = o.maturity === 'users';
    var sa = o.spendAgg || { spend_usd: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_views: 0 };
    var row = { key: o.key, label: o.label, bucketStart: o.bucketStart || null, bucketEnd: o.bucketEnd || null,
      spend: sa.spend_usd, spendAllocated: !!o.spendAllocated, impressions: sa.impressions, clicks: sa.clicks, link_clicks: sa.link_clicks, landing_views: sa.landing_views,
      signups: 0, users: 0, trials: 0, qualified: 0, pendingTrials: 0, cancelledInTrial: 0, payers: 0, byOffset: {}, money: o.money || 'gross', basis: o.basis || 'signup', payer: o.payer === 'sub' ? 'sub' : 'any',
      paywall_views: 0, checkout_starts: 0, checkout_errors: 0, webview_users: 0, clickid_users: 0, emq_users: 0, contracted_cpa_sum: 0, contracted_n: 0 };
    if (o.groupKey !== undefined) { row.groupKey = o.groupKey; row.groupLabel = o.groupLabel; }
    var cohortEnd = o.cohortEnd !== undefined ? o.cohortEnd : (o.bucketEnd ? o.bucketEnd - DAY : todayStart);
    var lastDay = Math.min(startOfDay(cohortEnd), todayStart);
    var L = offsets.length, i, j, maxOff = offsets[L - 1];
    var D = []; for (j = 0; j <= L; j++) D.push(new Float64Array(NF)); // D[L] = sink for range ends
    var idxByDay = new Int16Array(maxOff + 2); // first offset index with offsets[j] ≥ day
    for (j = 0, i = 0; i <= maxOff + 1; i++) { while (j < L && offsets[j] < i) j++; idxByDay[i] = j; }
    function jOf(ts, a) { var d = Math.floor((ts - a) / DAY); return d < 0 ? 0 : d > maxOff ? L : idxByDay[d]; }
    function jCeil(ts, a) { var d = Math.ceil((ts - a) / DAY); return d < 0 ? 0 : d > maxOff ? L : idxByDay[d]; }
    var users = o.users, basis = o.basis || 'signup';
    var TD = { attempts_all: 0, attempts: 0, charges_ok: 0, rev_gross: 0, fees: 0, renewals: 0, failed: 0, refunds: 0, refunds_n: 0, disputes: 0, disputes_n: 0, trialsEnded: 0, firstRebillOk: 0 }; // to-date (no offset) counters
    for (i = 0; i < users.length; i++) {
      var u = users[i], a = anchorOf(u, basis);
      if (a === null) continue;
      row.signups++;
      if (u.paywall_viewed_ts) row.paywall_views++;
      if (u.checkout_ts) row.checkout_starts++;
      if (u.checkout_error) row.checkout_errors++;
      if (BB.WEBVIEWS[u.browser]) row.webview_users++;
      if (u.click_id_type && u.click_id_type !== 'none') { row.clickid_users++; if (u.has_email) row.emq_users++; }
      var t = u._trial, tEnd = t ? trialEndOf(t) : null;
      if (t) {
        row.trials++; if (t.qualified) row.qualified++;
        if (t.cancelled_ts) row.cancelledInTrial++;
        else if (tEnd > now) row.pendingTrials++;
        if (u.contracted_cpa) { row.contracted_cpa_sum += u.contracted_cpa; row.contracted_n++; }
      }
      // matured offsets for this user: offsets[j]·DAY ≤ now − a  ⇔ j < jm
      var age = now - a, jm = L;
      for (j = 0; j < L; j++) if (offsets[j] * DAY > age) { jm = j; break; }
      var end = perUser ? jm : L; // per-user maturity: immature offsets get nothing from this user
      if (jm > 0) { D[0][FI.maturedUsers] += 1; D[jm][FI.maturedUsers] -= 1; if (t) { D[0][FI.mTrials] += 1; D[jm][FI.mTrials] -= 1; if (t.qualified) { D[0][FI.mQual] += 1; D[jm][FI.mQual] -= 1; } } }
      if (end === 0) continue;
      var add = function (f, j0, v) { if (j0 >= end) return; D[j0][f] += v; D[end][f] -= v; };
      var cs = ix.chargesByUser.get(u.user_id) || [], rs = ix.refundsByUser.get(u.user_id) || [], ds = ix.disputesByUser.get(u.user_id) || [];
      var payerJ = L, okFirstJ = L, failFirstJ = L, initialDone = false, k, c, j0, payerTD = false, okFirstTD = false;
      for (k = 0; k < cs.length; k++) {
        c = cs[k]; if (c.ts > now) continue;
        TD.attempts_all++; if (c.type !== 'intro') TD.attempts++;
        if (c.status === 'succeeded') { TD.charges_ok++; TD.rev_gross += c.amount_usd; TD.fees += c.fee_usd; if (c.type === 'rebill' || c.type === 'renewal') { TD.renewals++; if (c.n === 1 && c.type === 'rebill' && !c.is_winback) okFirstTD = true; } if (BB.isPayerCharge(c, row.payer)) payerTD = true; } else if (c.type !== 'intro') TD.failed++; // failed_rate: non-intro attempts in numerator and denominator alike
        j0 = jOf(c.ts, a);
        add(FI.attempts_all, j0, 1);
        if (c.type !== 'intro') add(FI.attempts, j0, 1);
        if (c.status === 'succeeded') {
          add(FI.rev_gross, j0, c.amount_usd); add(FI.fees, j0, c.fee_usd); add(FI.charges_ok, j0, 1); add(FI.ok_all, j0, 1);
          if (c.fx_fee_usd) add(FI.fx_fee, j0, c.fx_fee_usd);
          if (c.coupon) { add(FI.coupon_n, j0, 1); add(FI.coupon_disc, j0, c.discount_usd || 0); }
          if (BB.isPayerCharge(c, row.payer)) { if (j0 < payerJ) payerJ = j0; } // payer per state.payer ('any': paid intro counts as a D0 payer; 'sub': rebill/renewal only); first_rebill_* stay rebill-only
          if (c.type === 'rebill' || c.type === 'renewal') {
            add(FI.renewals, j0, 1);
            if (c.n === 1 && c.type === 'rebill' && !c.is_winback) { if (j0 < okFirstJ) okFirstJ = j0; if (!initialDone) { initialDone = true; add(FI.initial_mrr, j0, mrrOf(c.plan, c.amount_usd + (c.discount_usd || 0))); } }
            if (c.is_upgrade) add(FI.upgrades, j0, 1);
            if (c.is_winback) add(FI.winbacks, j0, 1);
            if (c.attempt > 1) add(FI.recovered, j0, 1);
            // active at day N: c.ts ≤ a + N·DAY < c.ts + period, and N matured (j < jm)
            var jA = jCeil(c.ts, a), jB = jCeil(c.ts + periodOf(c.plan) * DAY, a), jE = Math.min(jB, jm, end);
            if (jA < jE) { var m = mrrOf(c.plan, c.amount_usd + (c.discount_usd || 0)); D[jA][FI.active] += 1; D[jE][FI.active] -= 1; D[jA][FI.active_mrr] += m; D[jE][FI.active_mrr] -= m; }
          }
          if (c.type === 'pack') add(FI.packs_rev, j0, c.amount_usd);
        } else {
          if (c.type !== 'intro') { add(FI.failed, j0, 1); if (c.decline_code === 'insufficient_funds') add(FI.insufficient, j0, 1); } // intro failures are checkout errors, not billing failures
          if (c.decline_code === 'authentication_required') add(FI.three_ds, j0, 1);
          if (c.type !== 'intro' && c.attempt === 1) add(FI.failed_first, j0, 1);
          if (c.n === 1 && c.type === 'rebill' && j0 < failFirstJ) failFirstJ = j0;
        }
      }
      for (k = 0; k < rs.length; k++) { if (rs[k].ts > now) continue; TD.refunds += rs[k].amount_usd; TD.refunds_n++; j0 = jOf(rs[k].ts, a); add(FI.refunds, j0, rs[k].amount_usd); add(FI.refunds_n, j0, 1); }
      for (k = 0; k < ds.length; k++) { if (ds[k].ts > now) continue; TD.disputes += ds[k].amount_usd + ds[k].fee_usd; TD.disputes_n++; j0 = jOf(ds[k].ts, a); add(FI.disputes, j0, ds[k].amount_usd); add(FI.dispute_fees, j0, ds[k].fee_usd); add(FI.disputes_n, j0, 1); }
      if (payerJ < L) add(FI.payers, payerJ, 1);
      if (payerTD) row.payers++;
      if (t) {
        if (tEnd <= now) {
          TD.trialsEnded++; if (okFirstTD) TD.firstRebillOk++;
          var jT = jOf(tEnd, a);
          add(FI.trialsEnded, jT, 1);
          if (okFirstJ < L) add(FI.firstRebillOk, Math.max(jT, okFirstJ), 1);
          if (!t.cancelled_ts && failFirstJ < L) { var f0 = Math.max(jT, failFirstJ), f1 = Math.min(okFirstJ, end); if (f0 < f1) { D[f0][FI.firstRebillFail] += 1; D[f1][FI.firstRebillFail] -= 1; } }
        }
        if (t.cancelled_ts && t.cancelled_ts <= now) add(FI.cancelledInTrial, jOf(t.cancelled_ts, a), 1);
        var sb = u._sub;
        if (sb && sb.cancel_ts && sb.first_paid_ts !== null && sb.cancel_ts <= now) { if (sb.cancel_reason === 'payment_failed') add(FI.churn_invol, jOf(sb.cancel_ts, a), 1); else if (sb.cancel_reason === 'user') add(FI.churn_vol, jOf(sb.cancel_ts, a), 1); } // refund / dispute cancels are neither (see BB.churn)
      }
    }
    row.users = row.signups;
    var acc = new Float64Array(NF);
    for (j = 0; j < L; j++) {
      var G = emptyOffset(), Dj = D[j];
      for (i = 0; i < NF; i++) acc[i] += Dj[i];
      for (i = 0; i < NF; i++) if (OFF_FIELDS[i] !== 'mTrials' && OFF_FIELDS[i] !== 'mQual') G[OFF_FIELDS[i]] = Math.abs(acc[i]) < 1e-9 ? 0 : acc[i];
      G.rev_net = G.rev_gross - G.fees - G.refunds - G.disputes - G.dispute_fees;
      G.maturedUsers = Math.round(G.maturedUsers);
      if (perUser) {
        G.signups = G.maturedUsers; G.trials = Math.round(acc[FI.mTrials]); G.qualified = Math.round(acc[FI.mQual]);
        G.spend = row.signups > 0 ? row.spend * G.maturedUsers / row.signups : row.spend;
        G.mature = G.maturedUsers >= 30 || G.maturedUsers >= 0.5 * row.signups;
      } else { G.spend = row.spend; G.signups = row.signups; G.trials = row.trials; G.qualified = row.qualified; G.mature = (todayStart - lastDay) >= offsets[j] * DAY; }
      G.users = G.signups;
      row.byOffset[offsets[j]] = G;
    }
    row.maturity = perUser ? 'users' : 'date';
    // to-date ratios (all events up to now, no offset / maturity) — for breakdown & hierarchy columns like "1st rebill %", "Refund %", "Dispute %"
    row.toDate = { first_rebill_rate: ratio(TD.firstRebillOk, TD.trialsEnded), paying_rate: ratio(row.payers, row.trials), refund_rate: ratio(TD.refunds, TD.rev_gross), dispute_rate: ratio(TD.disputes_n, TD.charges_ok),
      failed_rate: ratio(TD.failed, TD.attempts), auth_rate: ratio(TD.charges_ok, TD.attempts_all), revenue_gross: TD.rev_gross, revenue_net: TD.rev_gross - TD.fees - TD.refunds - TD.disputes, refunds: TD.refunds, disputes: TD.disputes,
      payers: row.payers, renewals: TD.renewals, trialsEnded: TD.trialsEnded, firstRebillOk: TD.firstRebillOk, charges_ok: TD.charges_ok, attempts: TD.attempts, roas: ratio(row.money === 'net' ? TD.rev_gross - TD.fees - TD.refunds - TD.disputes : TD.rev_gross, row.spend) };
    row._users = users;
    return row;
  }
  BB.buildRow = buildRow;

  /* Weighted total: sums numerators; per offset only over matured rows (denominators stored in byOffset[N]). */
  function totalRow(rows, offsets, label) {
    var tot = { key: '__total', label: label || BB.t('Total'), bucketStart: null, bucketEnd: null, spend: 0, spendAllocated: false, impressions: 0, clicks: 0, link_clicks: 0, landing_views: 0,
      signups: 0, users: 0, trials: 0, qualified: 0, pendingTrials: 0, cancelledInTrial: 0, payers: 0, byOffset: {}, money: rows[0] ? rows[0].money : 'gross', isTotal: true, rows: rows.length };
    rows.forEach(function (r) {
      ['spend', 'impressions', 'clicks', 'link_clicks', 'landing_views', 'signups', 'trials', 'qualified', 'pendingTrials', 'cancelledInTrial', 'payers'].forEach(function (k) { tot[k] += r[k] || 0; });
      if (r.spendAllocated) tot.spendAllocated = true;
    });
    tot.users = tot.signups;
    offsets.forEach(function (N) {
      var g = emptyOffset(); g.spend = 0; g.maturedRows = 0; g.mature = true;
      rows.forEach(function (r) {
        var x = r.byOffset[N]; if (!x) return;
        if (!x.mature) { g.mature = false; return; }
        g.maturedRows++;
        Object.keys(x).forEach(function (k) { if (typeof x[k] === 'number') g[k] += x[k]; });
      });
      g.users = g.signups;
      tot.byOffset[N] = g;
    });
    tot._users = [].concat.apply([], rows.map(function (r) { return r._users || []; }));
    return tot;
  }
  BB.totalRow = totalRow;

  /* ───────────────────────── Metric evaluation ───────────────────────── */
  function ratio(a, b) { return b > 0 ? a / b : null; }
  /** Any BB.METRICS key for a row; N = offset for offset-based metrics; money overrides row.money. Returns number|null. */
  BB.metric = function (row, key, N, money) {
    if (!row) return null;
    money = money || row.money || 'gross';
    var o = (N !== undefined && N !== null && row.byOffset) ? row.byOffset[N] : null;
    var spend = o && o.spend !== undefined ? o.spend : row.spend, signups = o ? o.signups : row.signups, trials = o ? o.trials : row.trials, qualified = o ? o.qualified : row.qualified;
    var rev = o ? (money === 'net' ? o.rev_net : o.rev_gross) : null;
    switch (key) {
      case 'spend': return row.spend;
      case 'impressions': return row.impressions;
      case 'clicks': return row.clicks;
      case 'ctr': return ratio(row.clicks, row.impressions);
      case 'cpc': return ratio(row.spend, row.clicks);
      case 'cpm': return row.impressions > 0 ? row.spend / row.impressions * 1000 : null;
      case 'landing_views': return row.landing_views;
      case 'signups': return row.signups;
      case 'cpi': return ratio(row.spend, row.signups);
      case 'signup_trial_rate': return ratio(row.trials, row.signups);
      case 'trials': return row.trials;
      case 'cpt': return ratio(row.spend, row.trials);
      case 'qualified': return row.qualified;
      case 'cpqt': return ratio(row.spend, row.qualified);
      case 'qualified_rate': return ratio(row.qualified, row.trials);
      case 'payback_day': return BB.paybackDay(row, money);
      case 'cpl': return ratio(row.spend, row.landing_views);
      case 'landing_signup_rate': return ratio(row.signups, row.landing_views);
      case 'bounce_rate': return row.landing_views > 0 ? clamp(1 - row.signups / row.landing_views, 0, 1) : null;
      case 'paywall_view_rate': return ratio(row.paywall_views, row.signups);
      case 'checkout_start_rate': return ratio(row.checkout_starts, row.paywall_views);
      case 'checkout_error_rate': return ratio(row.checkout_errors, row.checkout_starts);
      case 'trial_start_rate': return ratio(row.trials, row.paywall_views);
      case 'cpa': return ratio(row.spend, row.trials);
      case 'contracted_cpa': return ratio(row.contracted_cpa_sum, row.contracted_n);
      case 'cpa_delta': { var cc = ratio(row.contracted_cpa_sum, row.contracted_n), ca = ratio(row.spend, row.trials); return cc && ca !== null ? ca / cc - 1 : null; }
      case 'impression_share': return row.impression_share === undefined ? null : row.impression_share;
      case 'webview_share': return ratio(row.webview_users, row.signups);
      case 'click_id_rate': return ratio(row.clickid_users, row.signups);
      case 'emq': return ratio(row.emq_users, row.signups);
    }
    if (!o) return null;
    switch (key) {
      case 'revenue_gross': return o.rev_gross;
      case 'revenue_net': return o.rev_net;
      case 'revenue': return rev;
      case 'refunds': return o.refunds;
      case 'disputes': return o.disputes + o.dispute_fees;
      case 'fees': return o.fees;
      case 'payers': return o.payers;
      case 'paying_rate': return ratio(o.payers, trials);
      case 'first_rebill_rate': return ratio(o.firstRebillOk, o.trialsEnded);
      case 'cpp': return ratio(spend, o.payers);
      case 'arpu': return ratio(rev, signups);
      case 'arpt': return ratio(rev, trials);
      case 'arppu': return ratio(rev, o.payers);
      case 'roas': return ratio(rev, spend);
      case 'ltv': return ratio(rev, signups);
      case 'active_rate': return ratio(o.active, o.payers);
      case 'renewals': return o.renewals;
      case 'failed_rate': return ratio(o.failed, o.attempts);
      case 'insufficient_share': return ratio(o.insufficient, o.failed);
      case 'refund_rate': return ratio(o.refunds, o.rev_gross);
      case 'dispute_rate': return ratio(o.disputes_n, o.charges_ok);
      case 'revenue_per_visitor': return ratio(rev, row.landing_views);
      case 'mrr': return o.active_mrr;
      case 'arr': return o.active_mrr * 12;
      case 'active_subs': return o.active;
      case 'trial_paid_rate': return ratio(o.firstRebillOk, o.trialsEnded);
      case 'avg_renewals': return ratio(o.renewals, o.payers);
      case 'expected_lifetime': return ratio(o.renewals, o.firstRebillOk);
      case 'ltv_cac': return o.payers > 0 && spend > 0 ? (rev / o.payers) / (spend / o.payers) : null;
      case 'gross_margin': return ratio(o.rev_net, o.rev_gross);
      case 'voluntary_churn': return ratio(o.churn_vol, o.payers);
      case 'involuntary_churn': return ratio(o.churn_invol, o.payers);
      case 'recovery_rate': return ratio(o.recovered, o.failed_first);
      case 'winback_rate': return ratio(o.winbacks, o.payers);
      case 'upgrade_rate': return ratio(o.upgrades, o.payers);
      case 'coupon_share': return ratio(o.coupon_n, o.charges_ok);
      case 'nrr': return ratio(o.active_mrr, o.initial_mrr);
      case 'auth_rate': return ratio(o.ok_all, o.attempts_all);
      case 'three_ds_share': return ratio(o.three_ds, o.attempts_all);
      case 'fee_pct': return ratio(o.fees, o.rev_gross);
      case 'fx_loss': return ratio(o.fx_fee, o.rev_gross);
    }
    return null;
  };
  /* First matured offset where ROAS ≥ 1, else null. */
  BB.paybackDay = function (row, money) {
    if (!row || !row.byOffset) return null;
    var keys = Object.keys(row.byOffset).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) {
      var o = row.byOffset[keys[i]]; if (!o.mature) continue;
      var r = BB.metric(row, 'roas', keys[i], money); if (r !== null && r >= 1) return keys[i];
    }
    return null;
  };

  function joinedUsers(f) { // raw users whose signup falls in range (spend join semantics), passing dim filters
    return f.raw.users.filter(function (u) { return u.signup_ts >= f.range.from && u.signup_ts <= f.range.to && (!f.dimOk || f.dimOk(u)); });
  }
  /* Spend aggregates per slice of a dimension: direct when spend carries it, else allocated. bucketOf optional. */
  function spendBySlice(f, dim, bucketOf) {
    if (spendHas(f.raw.spend, dim)) {
      var m = new Map();
      f.spend.forEach(function (r) {
        var k = (bucketOf ? bucketOf(r) + '|' : '') + (r[dim] === null || r[dim] === undefined ? BB.t('(none)') : String(r[dim]));
        var a = m.get(k); if (!a) { a = { spend_usd: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_views: 0 }; m.set(k, a); }
        SPEND_FIELDS.forEach(function (fld) { a[fld] += r[fld] || 0; });
      });
      return { map: m, allocated: f.spendAllocated };
    }
    var res = BB.allocSpend({ spend: f.spend, users: joinedUsers(f), sliceOf: function (u) { return BB.dimValue(u, dim); }, bucketOf: bucketOf });
    return res;
  }

  /* ───────────────────────── Cohorts ───────────────────────── */
  /** {data, state, offsets?} → {rows (newest first, each with children when state.groupBy), total, step, basis, range, spendAllocated} */
  BB.cohorts = function (o) {
    var f = BB.filter(o.data, o.state), st = o.state || {}, step = st.step || 'day';
    var offsets = o.offsets || st.offsets || BB.DEFAULT_OFFSETS, money = st.money || 'gross';
    var byB = groupMap(f.users, function (u) { return BB.bucket(anchorOf(u, f.basis), step); });
    var spendByB = groupMap(f.spend, function (r) { return BB.bucket(r._ts, step); });
    var keys = new Set(byB.keys()); spendByB.forEach(function (v, k) { keys.add(k); });
    var common = { offsets: offsets, basis: f.basis, now: f.now, index: f.index, money: money, payer: st.payer };
    var rows = Array.from(keys).sort().reverse().map(function (k) {
      var bs = BB.bucketStart(k, step), be = BB.bucketEnd(k, step);
      return buildRow(Object.assign({ key: k, label: BB.bucketLabel(k, step), users: byB.get(k) || [], spendAgg: aggSpend(spendByB.get(k) || []),
        bucketStart: bs, bucketEnd: be, spendAllocated: f.spendAllocated }, common));
    });
    if (st.groupBy) {
      var dim = st.groupBy, sb = spendBySlice(f, dim, function (r) { return BB.bucket(r._ts, step); });
      rows.forEach(function (r) {
        var byV = groupMap(byB.get(r.key) || [], function (u) { return BB.dimValue(u, dim); });
        var vals = new Set(byV.keys()); sb.map.forEach(function (v, k) { if (k.slice(0, r.key.length + 1) === r.key + '|') vals.add(k.slice(r.key.length + 1)); });
        r.children = Array.from(vals).map(function (v) {
          return buildRow(Object.assign({ key: r.key + '|' + v, label: v, users: byV.get(v) || [], spendAgg: sb.map.get(r.key + '|' + v),
            bucketStart: r.bucketStart, bucketEnd: r.bucketEnd, groupKey: r.key, groupLabel: r.label, spendAllocated: sb.allocated }, common));
        }).sort(function (a, b) { return b.spend - a.spend || b.signups - a.signups; });
      });
    }
    return { rows: rows, total: totalRow(rows, offsets, BB.t('Total · weighted')), step: step, basis: f.basis, range: f.range, offsets: offsets, spendAllocated: f.spendAllocated, groupBy: st.groupBy || null };
  };

  /* ───────────────────────── Breakdown & hierarchy ───────────────────────── */
  function rowsFromSlices(f, byV, sb, offsets, money, cohortEnd, keyPrefix) {
    var vals = new Set(byV.keys()); sb.map.forEach(function (v, k) { vals.add(k); });
    return Array.from(vals).map(function (v) {
      return buildRow({ key: (keyPrefix || '') + v, label: v, users: byV.get(v) || [], spendAgg: sb.map.get(v), offsets: offsets, basis: f.basis, now: f.now, index: f.index,
        money: money, cohortEnd: cohortEnd, maturity: 'users', spendAllocated: sb.allocated, payer: f.state && f.state.payer });
    });
  }
  /** {data, state, dim, offsets?, topN=15} → {rows (top N by spend + 'Other'), total, dim, spendAllocated}. Rows use per-user maturity (see buildRow). */
  BB.breakdown = function (o) {
    var f = BB.filter(o.data, o.state), st = o.state || {}, dim = o.dim || st.groupBy || 'country', topN = o.topN || 15;
    var offsets = o.offsets || st.offsets || BB.DEFAULT_OFFSETS, money = st.money || 'gross';
    var byV = groupMap(f.users, function (u) { return BB.dimValue(u, dim); });
    var sb = spendBySlice(f, dim, null);
    var rows = rowsFromSlices(f, byV, sb, offsets, money, f.range.to).sort(function (a, b) { return b.spend - a.spend || b.signups - a.signups; });
    if (rows.length > topN) {
      var rest = rows.slice(topN), users = [].concat.apply([], rest.map(function (r) { return r._users; }));
      var sa = { spend_usd: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_views: 0 };
      rest.forEach(function (r) { sa.spend_usd += r.spend; sa.impressions += r.impressions; sa.clicks += r.clicks; sa.link_clicks += r.link_clicks; sa.landing_views += r.landing_views; });
      var other = buildRow({ key: '__other', label: BB.t('Other'), users: users, spendAgg: sa, offsets: offsets, basis: f.basis, now: f.now, index: f.index, money: money, cohortEnd: f.range.to, maturity: 'users', spendAllocated: sb.allocated, payer: st.payer });
      other.isOther = true; other.count = rest.length;
      rows = rows.slice(0, topN).concat([other]);
    }
    return { rows: rows, total: totalRow(rows, offsets, BB.t('Total')), dim: dim, spendAllocated: sb.allocated, range: f.range };
  };

  /** Channel-aware traffic tree. {data, state, offsets=[0,1,3,7], byChannel=true} → {rows, total, range, levels, columns, byChannel}.
   *  byChannel: rows = channel rows {level:'channel', id, channel, levels (per-channel level list), columns (metric keys the channel uses), children}; per channel:
   *    facebook / tiktok / google → campaign ▸ adset ▸ ad (labels differ: BB.CHANNEL_BY_ID[ch].levels), web2web → partner ▸ placement, organic → no children.
   *  byChannel:false → legacy campaign ▸ adset ▸ ad over all channels. Per-user maturity (see buildRow). Channel rows carry `impression_share` (channel / all). */
  BB.hierarchy = function (o) {
    var f = BB.filter(o.data, o.state), st = o.state || {}, offsets = o.offsets || [0, 1, 3, 7], money = st.money || 'gross';
    var common = { offsets: offsets, basis: f.basis, now: f.now, index: f.index, money: money, cohortEnd: f.range.to, maturity: 'users', spendAllocated: f.spendAllocated, payer: st.payer };
    function level(users, spend, idF, labelF, lvl, next, ch) {
      var byU = groupMap(users, idF), byS = groupMap(spend, idF), ids = new Set(byU.keys()); byS.forEach(function (v, k) { ids.add(k); });
      return Array.from(ids).map(function (id) {
        var us = byU.get(id) || [], sp = byS.get(id) || [];
        var r = buildRow(Object.assign({ key: lvl + ':' + (ch ? ch + ':' : '') + id, label: labelF(us[0] || sp[0]), users: us, spendAgg: aggSpend(sp) }, common));
        r.level = lvl; r.id = id; if (ch) r.channel = ch;
        if (next) r.children = next(us, sp, ch);
        return r;
      }).sort(function (a, b) { return b.spend - a.spend || b.signups - a.signups; });
    }
    var campaignTree = function (us, sp, ch) {
      return level(us, sp, function (x) { return x.campaign_id; }, function (x) { return x ? x.campaign : BB.t('(none)'); }, 'campaign', function (us1, sp1) {
        return level(us1, sp1, function (x) { return x.adset_id; }, function (x) { return x ? x.adset : BB.t('(none)'); }, 'adset', function (us2, sp2) {
          return level(us2, sp2, function (x) { return x.ad_id || 'organic'; }, function (x) { return x ? x.ad : BB.t('(none)'); }, 'ad', null, ch);
        }, ch);
      }, ch);
    };
    var partnerTree = function (us, sp, ch) {
      return level(us, sp, function (x) { return x.partner || '(none)'; }, function (x) { return x && x.partner ? x.partner : BB.t('(none)'); }, 'partner', function (us1, sp1) {
        return level(us1, sp1, function (x) { return x.placement || '(none)'; }, function (x) { return x && x.placement ? x.placement : BB.t('(none)'); }, 'placement', null, ch);
      }, ch);
    };
    var levels = { channel: [{ id: 'channel', label: 'Channel', label_ru: 'Канал' }] }, columns = {};
    BB.CHANNELS.forEach(function (c) { levels[c.id] = c.levels; columns[c.id] = c.columns; });
    var rows;
    if (o.byChannel === false) rows = campaignTree(f.users, f.spend, null);
    else {
      var totImpr = sum(f.spend, function (r) { return r.impressions; });
      rows = level(f.users, f.spend, function (x) { return x.channel || 'organic'; }, function (x) { var c = BB.CHANNEL_BY_ID[x ? x.channel : null]; return c ? BB.lbl(c) : (x && x.channel) || 'Organic'; }, 'channel', function (us, sp) {
        var ch = us[0] ? us[0].channel : sp[0] ? sp[0].channel : 'organic';
        if (ch === 'organic') return [];
        return ch === 'web2web' ? partnerTree(us, sp, ch) : campaignTree(us, sp, ch);
      });
      rows.forEach(function (r) { r.channel = r.id; var c = BB.CHANNEL_BY_ID[r.id]; r.levels = c ? c.levels : []; r.columns = c ? c.columns : []; r.color = c ? c.color : null; r.impression_share = ratio(r.impressions, totImpr); });
    }
    return { rows: rows, total: totalRow(rows, offsets, BB.t('Total')), range: f.range, levels: levels, columns: columns, byChannel: o.byChannel !== false, spendAllocated: f.spendAllocated };
  };

  /* ───────────────────────── Time series (real-time) ───────────────────────── */
  function seriesFor(data, st, range, step, dimOk, basis) {
    var now = data.now, keys = BB.bucketsBetween(range.from, Math.min(range.to, now), step), ix = {};
    var filters = effFilters(st), share = spendAllocator(data, filters, range);
    var buckets = keys.map(function (k, i) {
      ix[k] = i;
      return { key: k, label: BB.bucketLabel(k, step), start: BB.bucketStart(k, step), spend: 0, impressions: 0, clicks: 0, landing_views: 0, signups: 0, trials: 0, qualified: 0,
        rev_gross: 0, rev_net: 0, rev_d0_gross: 0, rev_d0_net: 0, payers_d0: 0, charges_ok: 0, failed: 0, refunds: 0, refunds_n: 0, disputes: 0, disputes_n: 0 };
    });
    var inR = function (ts) { return ts >= range.from && ts <= range.to; };
    var B = function (ts) { return buckets[ix[BB.bucket(ts, step)]]; };
    var okU = function (uid) { var u = data.index.userById.get(uid); return u && (!dimOk || dimOk(u)) ? u : null; };
    var fsets = Object.keys(filters).filter(function (k) { return filters[k] && filters[k].length && spendHas(data.spend, k); })
      .map(function (k) { return { k: k, s: new Set(filters[k].map(String)) }; });
    data.spend.forEach(function (r) {
      if (!inR(r._ts)) return;
      for (var j = 0; j < fsets.length; j++) if (!fsets[j].s.has(String(r[fsets[j].k]))) return;
      var b = B(r._ts); if (!b) return;
      var w = share ? share(r) : 1; // non-spendable filters (paywall, plan, device…) → spend allocated by signups of the same ad+date
      b.spend += r.spend_usd * w; b.impressions += r.impressions * w; b.clicks += r.clicks * w; b.landing_views += r.landing_views * w;
    });
    data.users.forEach(function (u) { if (inR(u.signup_ts) && (!dimOk || dimOk(u))) { var b = B(u.signup_ts); if (b) b.signups++; } });
    data.trials.forEach(function (t) { if (inR(t.ts) && okU(t.user_id)) { var b = B(t.ts); if (b) { b.trials++; if (t.qualified) b.qualified++; } } });
    var d0payers = new Set();
    data.charges.forEach(function (c) {
      if (!inR(c.ts)) return; var u = okU(c.user_id); if (!u) return; var b = B(c.ts); if (!b) return;
      if (c.status !== 'succeeded') { b.failed++; return; }
      b.charges_ok++; b.rev_gross += c.amount_usd; b.rev_net += c.amount_usd - c.fee_usd;
      var a = anchorOf(u, basis), d0 = a !== null && c.ts - a < DAY;
      if (d0) { b.rev_d0_gross += c.amount_usd; b.rev_d0_net += c.amount_usd - c.fee_usd; if (BB.isPayerCharge(c, st.payer) && !d0payers.has(c.user_id)) { d0payers.add(c.user_id); b.payers_d0++; } } // D0 payer per state.payer
    });
    data.refunds.forEach(function (r) { if (inR(r.ts) && okU(r.user_id)) { var b = B(r.ts); if (b) { b.refunds += r.amount_usd; b.refunds_n++; b.rev_net -= r.amount_usd; } } });
    data.disputes.forEach(function (d) { if (inR(d.ts) && okU(d.user_id)) { var b = B(d.ts); if (b) { b.disputes += d.amount_usd + d.fee_usd; b.disputes_n++; b.rev_net -= d.amount_usd + d.fee_usd; } } });
    var tot = {}; buckets.forEach(function (b) { Object.keys(b).forEach(function (k) { if (typeof b[k] === 'number' && k !== 'start') tot[k] = (tot[k] || 0) + b[k]; }); });
    return { buckets: buckets, totals: tot, spendAllocated: !!share };
  }
  /** {data, state, step?, compare?} → {buckets, compareBuckets (index-aligned, cut at the same elapsed time), totals, compareTotals, range, compareRange, step}
   *  Events are bucketed by their own timestamp (spend/signups/trials/charges in the range), not by cohort anchor. */
  BB.timeseries = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data; if (!data._indexed) BB.index(data);
    var st = o.state || {}, step = o.step || st.step || 'hour', basis = st.basis || 'signup';
    var range = BB.state.resolveRange(st, data.now), dimOk = makeDimOk(effFilters(st));
    var cur = seriesFor(data, st, range, step, dimOk, basis);
    var res = { buckets: cur.buckets, totals: cur.totals, range: range, step: step, spendAllocated: cur.spendAllocated, compareBuckets: null, compareTotals: null, compareRange: null, compareKind: null };
    var compare = o.compare !== undefined ? o.compare : (st.compare || 'prev') !== 'none';
    if (compare) {
      var co = BB.state.compareOf(Object.assign({}, st, { compare: st.compare || 'prev' }), range) || BB.state.compareOf(Object.assign({}, st, { compare: 'prev' }), range);
      var cst = co.state, prev = seriesFor(data, cst, co.range, step, makeDimOk(effFilters(cst)), basis);
      res.compareRange = co.range; res.compareKind = co.kind; res.compareChannel = co.channel || null;
      res.compareBuckets = cur.buckets.map(function (b, i) { return prev.buckets[i] || null; }); res.compareTotals = prev.totals;
    }
    return res;
  };

  /* ───────────────────────── Live events ───────────────────────── */
  var EVENT_LABEL = { trial: 'Trial started', qualified: 'Qualified', charge_ok: 'Charge succeeded', charge_fail: 'Charge declined', refund: 'Refund', dispute: 'Dispute', checkout_error: 'Checkout error' }; // EN keys, translated via BB.t at call time
  /** {data, state, limit=50, types?} → latest events in range (by event ts) with user dims. */
  BB.events = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data; if (!data._indexed) BB.index(data);
    var st = o.state || {}, range = BB.state.resolveRange(st, data.now), dimOk = makeDimOk(effFilters(st)), limit = o.limit || 50, now = data.now;
    var types = o.types ? new Set(o.types) : null, out = [];
    var inR = function (ts) { return ts >= range.from && ts <= range.to; };
    function push(type, ts, uid, extra) {
      if (!inR(ts) || (types && !types.has(type))) return;
      var u = data.index.userById.get(uid); if (!u || (dimOk && !dimOk(u))) return;
      out.push(Object.assign({ type: type, label: BB.t(EVENT_LABEL[type]), ts: ts, user_id: uid, country: u.country, market: u.market, geo_tier: u.geo_tier, plan: u.plan,
        paywall: u.paywall, campaign: u.campaign, adset: u.adset, ad: u.ad, creative: u.creative, device: u.device, channel: u.channel, device_class: u.device_class, psp: u.psp, payment_method: u.payment_method, amount_usd: null, decline_code: null }, extra));
    }
    data.trials.forEach(function (t) { push('trial', t.ts, t.user_id, { plan: t.plan, amount_usd: t.intro_amount_usd }); if (t.qualified && t.ts + 20 * 60000 <= now) push('qualified', t.ts + 20 * 60000, t.user_id, { plan: t.plan }); });
    data.charges.forEach(function (c) { push(c.status === 'succeeded' ? 'charge_ok' : 'charge_fail', c.ts, c.user_id, { amount_usd: c.amount_usd, decline_code: c.decline_code, charge_type: c.type, n: c.n, attempt: c.attempt, card_funding: c.card_funding, psp: c.psp, payment_method: c.payment_method, is_upgrade: !!c.is_upgrade, is_winback: !!c.is_winback }); });
    data.events.forEach(function (e) { if (e.name === 'checkout_error') push('checkout_error', e.ts, e.user_id, { decline_code: e.props && e.props.code, psp: e.props && e.props.psp, payment_method: e.props && e.props.payment_method }); });
    data.refunds.forEach(function (r) { push('refund', r.ts, r.user_id, { amount_usd: r.amount_usd }); });
    data.disputes.forEach(function (d) { push('dispute', d.ts, d.user_id, { amount_usd: d.amount_usd, fee_usd: d.fee_usd, reason: d.reason, status: d.status }); });
    out.sort(function (a, b) { return b.ts - a.ts; });
    return out.slice(0, limit);
  };

  /* ───────────────────────── Billing health ───────────────────────── */
  /** {data, state} → {byAttempt:[{attempt, attempts, failed, rate}], declineCodes:[{code, n, share}], funding:[{card_funding, users, trialsEnded, firstRebillOk, rebillRate, attempts, failed, failedRate}],
   *  failedRate, disputeRate, disputeThreshold, refundRate, charges_ok, disputes_n, refunds_n} */
  BB.billingHealth = function (o) {
    var f = BB.filter(o.data, o.state), now = f.now;
    var byA = [1, 2, 3, 4].map(function (a) { return { attempt: a, attempts: 0, failed: 0, rate: null }; });
    var codes = new Map(), fund = {}, ok = 0, failed = 0, attempts = 0;
    ['credit', 'debit', 'prepaid'].forEach(function (k) { fund[k] = { card_funding: k, users: 0, trialsEnded: 0, firstRebillOk: 0, rebillRate: null, attempts: 0, failed: 0, failedRate: null }; });
    f.charges.forEach(function (c) {
      if (c.status === 'succeeded') ok++;
      if (c.type === 'intro' || c.type === 'pack') return;
      attempts++; var A = byA[c.attempt - 1]; if (A) A.attempts++;
      var F = fund[c.card_funding]; if (F) F.attempts++;
      if (c.status === 'failed') { failed++; if (A) A.failed++; if (F) F.failed++; codes.set(c.decline_code, (codes.get(c.decline_code) || 0) + 1); }
    });
    f.users.forEach(function (u) {
      var F = fund[u.card_funding]; if (!F) return; F.users++;
      var t = u._trial; if (!t || trialEndOf(t) > now) return;
      F.trialsEnded++;
      var cs = f.index.chargesByUser.get(u.user_id) || [];
      for (var i = 0; i < cs.length; i++) if (cs[i].type === 'rebill' && cs[i].n === 1 && cs[i].status === 'succeeded') { F.firstRebillOk++; break; }
    });
    byA.forEach(function (a) { a.rate = ratio(a.failed, a.attempts); });
    var funding = Object.keys(fund).map(function (k) { var F = fund[k]; F.rebillRate = ratio(F.firstRebillOk, F.trialsEnded); F.failedRate = ratio(F.failed, F.attempts); return F; });
    var declineCodes = Array.from(codes.entries()).map(function (e) { return { code: e[0], n: e[1], share: ratio(e[1], failed) }; }).sort(function (a, b) { return b.n - a.n; });
    return { byAttempt: byA, declineCodes: declineCodes, funding: funding, failedRate: ratio(failed, attempts), attempts: attempts, failed: failed,
      disputeRate: ratio(f.disputes.length, ok), disputeThreshold: BB.DISPUTE_THRESHOLD, refundRate: ratio(f.refunds.length, ok), charges_ok: ok, disputes_n: f.disputes.length, refunds_n: f.refunds.length };
  };

  /* ───────────────────────── Subscription economics ───────────────────────── */
  var MRR_GRACE = 4 * DAY;
  function usersOk(data, st) { var dimOk = makeDimOk(effFilters(st)); return dimOk ? data.users.filter(dimOk) : data.users; }
  /* Per-user MRR events from paid coverage: [{ts, kind:'new'|'reactivated'|'expansion'|'contraction'|'churned', delta, subs}] */
  function mrrEvents(u, ix, now) {
    var cs = ix.chargesByUser.get(u.user_id) || [], ev = [], cur = null, i, c;
    for (i = 0; i < cs.length; i++) {
      c = cs[i]; if (c.status !== 'succeeded' || (c.type !== 'rebill' && c.type !== 'renewal') || c.ts > now) continue;
      var m = mrrOf(c.plan, c.amount_usd + (c.discount_usd || 0)), end = c.ts + periodOf(c.plan) * DAY;
      if (cur && c.ts <= cur.end + MRR_GRACE) { if (Math.abs(m - cur.mrr) > 1e-9) ev.push({ ts: c.ts, kind: m > cur.mrr ? 'expansion' : 'contraction', delta: m - cur.mrr, subs: 0, upgrade: !!c.is_upgrade }); cur.mrr = m; cur.end = Math.max(cur.end, end); }
      else { if (cur) ev.push({ ts: cur.end, kind: 'churned', delta: -cur.mrr, subs: -1 }); ev.push({ ts: c.ts, kind: cur ? 'reactivated' : 'new', delta: m, subs: 1, winback: !!c.is_winback }); cur = { end: end, mrr: m }; }
    }
    if (cur && cur.end + MRR_GRACE <= now) ev.push({ ts: cur.end, kind: 'churned', delta: -cur.mrr, subs: -1 });
    return ev;
  }
  /** MRR movement per bucket (calendar time, dimension filters, no cohort anchoring). {data, state, step?} →
   *  {buckets:[{key, label, start, end, starting, new, reactivated, expansion, contraction, churned, net, ending, arr, activeSubs, newSubs, churnedSubs, upgrades, winbacks}], totals, current:{mrr, arr, activeSubs}, step, range}.
   *  Identity per bucket: ending = starting + new + reactivated + expansion − contraction − churned (= starting + net). MRR = Σ monthly-normalised price of paid coverage (weekly × 4.33). */
  BB.mrr = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data; if (!data._indexed) BB.index(data);
    var st = o.state || {}, step = o.step || st.step || 'day'; if (step === 'hour') step = 'day';
    var now = data.now, range = BB.state.resolveRange(st, now), ix = data.index;
    var keys = BB.bucketsBetween(range.from, Math.min(range.to, now), step);
    var buckets = keys.map(function (k) { return { key: k, label: BB.bucketLabel(k, step), start: BB.bucketStart(k, step), end: Math.min(BB.bucketEnd(k, step), now + 1), starting: 0, new: 0, reactivated: 0, expansion: 0, contraction: 0, churned: 0, net: 0, ending: 0, arr: 0, activeSubs: 0, startingSubs: 0, newSubs: 0, churnedSubs: 0, upgrades: 0, winbacks: 0 }; });
    var all = [];
    usersOk(data, st).forEach(function (u) { var e = mrrEvents(u, ix, now); for (var i = 0; i < e.length; i++) all.push(e[i]); });
    all.sort(function (a, b) { return a.ts - b.ts; });
    var mrr = 0, subs = 0, bi = 0, i;
    for (i = 0; i < all.length && all[i].ts < range.from; i++) { mrr += all[i].delta; subs += all[i].subs; }
    for (bi = 0; bi < buckets.length; bi++) {
      var b = buckets[bi]; b.starting = mrr; b.startingSubs = subs;
      while (i < all.length && all[i].ts < b.end) {
        var e = all[i++]; if (e.ts > now) break;
        if (e.kind === 'new') { b.new += e.delta; b.newSubs++; if (e.winback) b.winbacks++; }
        else if (e.kind === 'reactivated') { b.reactivated += e.delta; b.newSubs++; b.winbacks++; }
        else if (e.kind === 'expansion') { b.expansion += e.delta; if (e.upgrade) b.upgrades++; }
        else if (e.kind === 'contraction') { b.contraction -= e.delta; if (e.upgrade) b.upgrades++; } // weekly → monthly upgrade lowers normalised MRR 
        else { b.churned -= e.delta; b.churnedSubs++; }
        mrr += e.delta; subs += e.subs;
      }
      b.net = b.new + b.reactivated + b.expansion - b.contraction - b.churned; b.ending = mrr; b.arr = mrr * 12; b.activeSubs = subs;
    }
    var totals = { starting: buckets.length ? buckets[0].starting : mrr, new: 0, reactivated: 0, expansion: 0, contraction: 0, churned: 0, net: 0, ending: buckets.length ? buckets[buckets.length - 1].ending : mrr, newSubs: 0, churnedSubs: 0, upgrades: 0, winbacks: 0 };
    buckets.forEach(function (b) { ['new', 'reactivated', 'expansion', 'contraction', 'churned', 'net', 'newSubs', 'churnedSubs', 'upgrades', 'winbacks'].forEach(function (k) { totals[k] += b[k]; }); });
    for (; i < all.length && all[i].ts <= now; i++) { mrr += all[i].delta; subs += all[i].subs; }
    return { buckets: buckets, totals: totals, current: { mrr: mrr, arr: mrr * 12, activeSubs: subs }, step: step, range: range };
  };

  /** Paid retention: survival of payers by renewal #. {data, state, groupBy?, maxK?} → {rows:[{key, label, payers, period, price, points:[{k, day, atRisk, alive, rate}], avgRenewals, expectedLifetime}], total, groupBy}.
   *  rate(k) = payers with a succeeded renewal n=k / payers whose k-th renewal was due ≥ 4 days ago (k=1 is the first rebill, rate 1). groupBy: dim id | null (total only); default state.groupBy || 'plan'. */
  BB.paidRetention = function (o) {
    var f = BB.filter(o.data, o.state), st = o.state || {}, dim = o.groupBy !== undefined ? o.groupBy : (st.groupBy || 'plan'), ix = f.index, now = f.now;
    var payers = f.users.filter(function (u) { if (!u._trial) return false; var cs = ix.chargesByUser.get(u.user_id) || []; for (var i = 0; i < cs.length; i++) if (cs[i].status === 'succeeded' && cs[i].type === 'rebill' && cs[i].n === 1) return true; return false; });
    function rowOf(key, label, us) {
      var periods = { week: 0, month: 0 }, priceSum = { week: 0, month: 0 }, trialSum = { week: 0, month: 0 }, maxK = o.maxK || 16, atRisk = new Array(maxK + 1).fill(0), alive = new Array(maxK + 1).fill(0), ren = 0, i, k;
      us.forEach(function (u) {
        var t = u._trial, P = BB.PLAN_BY_ID[t.plan] || BB.PLANS[0], tEnd = trialEndOf(t), cs = ix.chargesByUser.get(u.user_id) || [], ok = {};
        periods[P.period]++; priceSum[P.period] += P.price; trialSum[P.period] += P.trialDays;
        for (i = 0; i < cs.length; i++) if (cs[i].status === 'succeeded' && (cs[i].type === 'rebill' || cs[i].type === 'renewal')) { ok[cs[i].n] = true; ren++; }
        for (k = 1; k <= maxK; k++) { if (tEnd + (k - 1) * P.periodDays * DAY > now - GRACE) break; atRisk[k]++; if (ok[k]) alive[k]++; }
      });
      var period = periods.month > periods.week ? 'month' : 'week', pd = period === 'month' ? 30 : 7, np = periods[period] || 0, td = np ? Math.round(trialSum[period] / np) : (period === 'month' ? 7 : 3), pts = [];
      for (k = 1; k <= maxK; k++) { if (!atRisk[k]) break; pts.push({ k: k, day: td + (k - 1) * pd, atRisk: atRisk[k], alive: alive[k], rate: alive[k] / atRisk[k] }); }
      var price = np ? Math.round(priceSum[period] / np * 100) / 100 : null; // average catalogue price of the row's plans of the dominant period
      return { key: key, label: label, payers: us.length, period: period, price: price, points: pts, avgRenewals: ratio(ren, us.length), expectedLifetime: ratio(ren, us.length) };
    }
    var rows = [];
    if (dim) { var byV = groupMap(payers, function (u) { return BB.dimValue(u, dim); }); byV.forEach(function (us, v) { rows.push(rowOf(v, v, us)); }); rows.sort(function (a, b) { return b.payers - a.payers; }); }
    return { rows: rows, total: rowOf('__total', BB.t('All payers'), payers), groupBy: dim || null, range: f.range };
  };

  /** Churn split. {data, state} → {payers, active, pastDue, voluntary:{n, rate}, involuntary:{n, rate}, refund:{n, rate}, dispute:{n, rate}, recovered:{n, failedFirst, rate},
   *  winbacks:{n, rate}, upgrades:{n, rate}, reasons:[{reason, n, share}], declineCodes:[{code, n, share}] (failed renewal attempts)}. Rates are / payers (subs that paid ≥ 1 rebill). */
  BB.churn = function (o) {
    var f = BB.filter(o.data, o.state), ix = f.index, now = f.now;
    var r = { payers: 0, active: 0, pastDue: 0, voluntary: { n: 0 }, involuntary: { n: 0 }, refund: { n: 0 }, dispute: { n: 0 }, recovered: { n: 0, failedFirst: 0 }, winbacks: { n: 0 }, upgrades: { n: 0 } }, codes = new Map(), failedN = 0;
    f.users.forEach(function (u) {
      var sb = u._sub; if (!sb || sb.first_paid_ts === null) return;
      r.payers++;
      if (sb.status === 'active') r.active++; else if (sb.status === 'past_due') r.pastDue++;
      else if (sb.status === 'canceled' && sb.cancel_ts <= now) { var k = sb.cancel_reason === 'payment_failed' ? 'involuntary' : sb.cancel_reason === 'refund' ? 'refund' : sb.cancel_reason === 'dispute' ? 'dispute' : 'voluntary'; r[k].n++; }
      if (sb.winbacks) r.winbacks.n++; if (sb.upgrades) r.upgrades.n++;
      var cs = ix.chargesByUser.get(u.user_id) || [];
      for (var i = 0; i < cs.length; i++) { var c = cs[i]; if (c.type !== 'rebill' && c.type !== 'renewal') continue; if (c.status === 'failed') { failedN++; codes.set(c.decline_code, (codes.get(c.decline_code) || 0) + 1); if (c.attempt === 1) r.recovered.failedFirst++; } else if (c.attempt > 1) r.recovered.n++; }
    });
    ['voluntary', 'involuntary', 'refund', 'dispute', 'winbacks', 'upgrades'].forEach(function (k) { r[k].rate = ratio(r[k].n, r.payers); });
    r.recovered.rate = ratio(r.recovered.n, r.recovered.failedFirst);
    r.churned = r.voluntary.n + r.involuntary.n + r.refund.n + r.dispute.n;
    r.reasons = [{ reason: 'user', label: BB.t('User cancel'), n: r.voluntary.n }, { reason: 'payment_failed', label: BB.t('Card declined'), n: r.involuntary.n }, { reason: 'refund', label: BB.t('Refund'), n: r.refund.n }, { reason: 'dispute', label: BB.t('Dispute'), n: r.dispute.n }].map(function (x) { x.share = ratio(x.n, r.churned); return x; });
    r.declineCodes = Array.from(codes.entries()).map(function (e) { return { code: e[0], n: e[1], share: ratio(e[1], failedN) }; }).sort(function (a, b) { return b.n - a.n; });
    r.range = f.range;
    return r;
  };

  /* ───────────────────────── Payments / PSP health ───────────────────────── */
  function authSplit(charges, keyF, label) {
    var m = new Map();
    charges.forEach(function (c) { var k = keyF(c) || BB.t('(none)'), a = m.get(k); if (!a) { a = { key: k, attempts: 0, ok: 0, failed: 0, authRate: null, gross: 0, fees: 0, codes: new Map() }; m.set(k, a); }
      a.attempts++; if (c.status === 'succeeded') { a.ok++; a.gross += c.amount_usd; a.fees += c.fee_usd; } else { a.failed++; a.codes.set(c.decline_code, (a.codes.get(c.decline_code) || 0) + 1); } });
    return Array.from(m.values()).map(function (a) { a[label] = a.key; a.authRate = ratio(a.ok, a.attempts); a.feePct = ratio(a.fees, a.gross); a.codes = Array.from(a.codes.entries()).map(function (e) { return { code: e[0], n: e[1], share: ratio(e[1], a.failed) }; }).sort(function (x, y) { return y.n - x.n; }); return a; }).sort(function (x, y) { return y.attempts - x.attempts; });
  }
  /** PSP health: auth rate (succeeded / attempted, all charge types) by psp / payment_method / card_funding + decline reasons, vs a baseline, with an alert flag.
   *  {data, state, window?: hours} → {authRate, baselineAuthRate, dropPp (baseline − current, fraction), alert (attempts ≥ 20 && dropPp ≥ 0.15), attempts, ok, failed,
   *  byPsp / byMethod / byFunding: [{key, attempts, ok, failed, authRate, baselineAuthRate, dropPp, alert, feePct, codes:[{code, n, share}]}], declineReasons:[{code, n, share}],
   *  threeDsShare, feePct, fxLoss, range, baselineRange, window}. window (hours) → current = last `window` h, baseline = last 24 h; without window: current = state range, baseline = compare period (BB.state.compareOf). */
  BB.pspHealth = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data; if (!data._indexed) BB.index(data);
    var st = o.state || {}, now = data.now, dimOk = makeDimOk(effFilters(st)), range, base;
    if (o.window) { range = { from: now - o.window * HOUR, to: now }; base = { from: now - 24 * HOUR, to: now }; }
    else { range = BB.state.resolveRange(st, now); var co = BB.state.compareOf(Object.assign({}, st, { compare: st.compare === 'none' ? 'prev' : st.compare }), range); base = co.range; }
    var okU = function (uid) { var u = data.index.userById.get(uid); return u && (!dimOk || dimOk(u)); };
    var pick = function (r) { return data.charges.filter(function (c) { return c.ts >= r.from && c.ts <= r.to && okU(c.user_id); }); };
    var cur = pick(range), prev = pick(base);
    function agg(list) {
      var a = { attempts: list.length, ok: 0, failed: 0, threeDs: 0, gross: 0, fees: 0, fx: 0 };
      list.forEach(function (c) { if (c.status === 'succeeded') { a.ok++; a.gross += c.amount_usd; a.fees += c.fee_usd; a.fx += c.fx_fee_usd || 0; } else { a.failed++; if (c.decline_code === 'authentication_required') a.threeDs++; } });
      a.authRate = ratio(a.ok, a.attempts); return a;
    }
    var A = agg(cur), B = agg(prev), drop = A.authRate !== null && B.authRate !== null ? B.authRate - A.authRate : null;
    function withBase(curS, prevS) {
      var pm = {}; prevS.forEach(function (p) { pm[p.key] = p; });
      return curS.map(function (c) { var p = pm[c.key]; c.baselineAuthRate = p ? p.authRate : null; c.dropPp = p && c.authRate !== null && p.authRate !== null ? p.authRate - c.authRate : null; c.alert = c.attempts >= 20 && c.dropPp !== null && c.dropPp >= 0.15; return c; });
    }
    var codes = new Map(); cur.forEach(function (c) { if (c.status === 'failed') codes.set(c.decline_code, (codes.get(c.decline_code) || 0) + 1); });
    return { authRate: A.authRate, baselineAuthRate: B.authRate, dropPp: drop, alert: A.attempts >= 20 && drop !== null && drop >= 0.15, attempts: A.attempts, ok: A.ok, failed: A.failed, baselineAttempts: B.attempts,
      byPsp: withBase(authSplit(cur, function (c) { return c.psp; }, 'psp'), authSplit(prev, function (c) { return c.psp; }, 'psp')),
      byMethod: withBase(authSplit(cur, function (c) { return c.payment_method; }, 'payment_method'), authSplit(prev, function (c) { return c.payment_method; }, 'payment_method')),
      byFunding: withBase(authSplit(cur, function (c) { return c.card_funding; }, 'card_funding'), authSplit(prev, function (c) { return c.card_funding; }, 'card_funding')),
      declineReasons: Array.from(codes.entries()).map(function (e) { return { code: e[0], n: e[1], share: ratio(e[1], A.failed) }; }).sort(function (x, y) { return y.n - x.n; }),
      threeDsShare: ratio(A.threeDs, A.attempts), feePct: ratio(A.fees, A.gross), fxLoss: ratio(A.fx, A.gross), range: range, baselineRange: base, window: o.window || null };
  };

  /** Checkout funnel (events by their own ts in range, dimension filters): {data, state} → {signups, steps:[{id:'signup'|'paywall_view'|'checkout_start'|'trial_start', label, users, rate (vs previous step), ofSignups}],
   *  errors:{n, rate (/ checkout_start), byPsp:[{psp, starts, errors, rate, codes:[{code, n, share}]}], byMethod:[...], codes:[{code, n, share}]}, paywallViewRate, checkoutStartRate, trialStartRate, range}. */
  BB.checkoutFunnel = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data; if (!data._indexed) BB.index(data);
    var st = o.state || {}, range = BB.state.resolveRange(st, data.now), dimOk = makeDimOk(effFilters(st));
    var inR = function (ts) { return ts >= range.from && ts <= range.to; };
    var sets = { signup: new Set(), paywall_view: new Set(), checkout_start: new Set(), checkout_error: new Set(), trial_start: new Set() };
    var byPsp = new Map(), byM = new Map(), codes = new Map();
    var bump = function (m, k, f) { var a = m.get(k); if (!a) { a = { key: k, starts: 0, errors: 0, codes: new Map() }; m.set(k, a); } f(a); };
    data.events.forEach(function (e) {
      if (!inR(e.ts) || !sets[e.name]) return; var u = data.index.userById.get(e.user_id); if (!u || (dimOk && !dimOk(u))) return;
      sets[e.name].add(e.user_id); var p = e.props || {};
      if (e.name === 'checkout_start') { bump(byPsp, p.psp || BB.t('(none)'), function (a) { a.starts++; }); bump(byM, p.payment_method || BB.t('(none)'), function (a) { a.starts++; }); }
      if (e.name === 'checkout_error') { codes.set(p.code, (codes.get(p.code) || 0) + 1); bump(byPsp, p.psp || BB.t('(none)'), function (a) { a.errors++; a.codes.set(p.code, (a.codes.get(p.code) || 0) + 1); }); bump(byM, p.payment_method || BB.t('(none)'), function (a) { a.errors++; a.codes.set(p.code, (a.codes.get(p.code) || 0) + 1); }); }
    });
    var n = function (k) { return sets[k].size; }, order = [['signup', 'Signups'], ['paywall_view', 'Paywall views'], ['checkout_start', 'Checkout started'], ['trial_start', 'Trial started']];
    var steps = order.map(function (x, i) { return { id: x[0], label: BB.t(x[1]), users: n(x[0]), rate: i ? ratio(n(x[0]), n(order[i - 1][0])) : null, ofSignups: ratio(n(x[0]), n('signup')) }; });
    var fin = function (m, lab) { return Array.from(m.values()).map(function (a) { a[lab] = a.key; a.rate = ratio(a.errors, a.starts); a.codes = Array.from(a.codes.entries()).map(function (e) { return { code: e[0], n: e[1], share: ratio(e[1], a.errors) }; }).sort(function (x, y) { return y.n - x.n; }); return a; }).sort(function (x, y) { return y.starts - x.starts; }); };
    var errN = n('checkout_error');
    return { signups: n('signup'), steps: steps, errors: { n: errN, rate: ratio(errN, n('checkout_start')), byPsp: fin(byPsp, 'psp'), byMethod: fin(byM, 'payment_method'), codes: Array.from(codes.entries()).map(function (e) { return { code: e[0], n: e[1], share: ratio(e[1], errN) }; }).sort(function (x, y) { return y.n - x.n; }) },
      paywallViewRate: ratio(n('paywall_view'), n('signup')), checkoutStartRate: ratio(n('checkout_start'), n('paywall_view')), trialStartRate: ratio(n('trial_start'), n('paywall_view')), range: range };
  };

  /** Attribution / traffic quality. {data, state} → {users, landingViews, bounceRate, clickIdRate, emq, webviewShare, clickIds:[{type, n, share}], browsers:[{browser, n, share}],
   *  byChannel:[{channel, label, users, clickIdRate, emq, webviewShare, bounceRate}]} (cohort-anchored: BB.filter). */
  BB.attributionHealth = function (o) {
    var f = BB.filter(o.data, o.state);
    function agg(us, sp) {
      var a = { users: us.length, clickId: 0, emq: 0, webview: 0, landingViews: sum(sp, function (r) { return r.landing_views; }) }, ids = new Map(), br = new Map();
      us.forEach(function (u) { var t = u.click_id_type || 'none'; ids.set(t, (ids.get(t) || 0) + 1); var b = u.browser == null ? BB.t('(none)') : u.browser; br.set(b, (br.get(b) || 0) + 1); if (t !== 'none') { a.clickId++; if (u.has_email === true) a.emq++; } if (BB.WEBVIEWS[u.browser]) a.webview++; }); // has_email null = unknown, not matched
      a.clickIdRate = ratio(a.clickId, a.users); a.emq = ratio(a.emq, a.users); a.webviewShare = ratio(a.webview, a.users); a.bounceRate = a.landingViews > 0 ? clamp(1 - a.users / a.landingViews, 0, 1) : null;
      a.clickIds = Array.from(ids.entries()).map(function (e) { return { type: e[0], n: e[1], share: ratio(e[1], a.users) }; }).sort(function (x, y) { return y.n - x.n; });
      a.browsers = Array.from(br.entries()).map(function (e) { return { browser: e[0], n: e[1], share: ratio(e[1], a.users) }; }).sort(function (x, y) { return y.n - x.n; });
      return a;
    }
    var out = agg(f.users, f.spend), byU = groupMap(f.users, function (u) { return u.channel; }), byS = groupMap(f.spend, function (r) { return r.channel; });
    out.byChannel = BB.CHANNELS.filter(function (c) { return byU.has(c.id) || byS.has(c.id); }).map(function (c) { var a = agg(byU.get(c.id) || [], byS.get(c.id) || []); a.channel = c.id; a.label = BB.lbl(c); delete a.clickIds; delete a.browsers; return a; });
    out.range = f.range;
    return out;
  };

  /* ───────────────────────── Predictions (BB.predict) ───────────────────────── */
  var Z80 = 1.2816, GRACE = 4 * DAY, MIN_SEG = 30;
  function segKey(plan, tier, channel) { return channel ? plan + '|' + tier + '|' + channel : plan + '|' + tier; }
  function segChain(k) { var parts = k.split('|'), out = []; for (var n = parts.length - 1; n >= 1; n--) out.push(parts.slice(0, n).join('|')); if (k !== 'all') out.push('all'); return out; }
  function sbgR(alpha, beta, k) { return (beta + k - 1) / (alpha + beta + k - 1); } // retention at renewal k ≥ 2 (Fader–Hardie sBG)
  function fitSbg(obs) { // obs[k] = {n, s}; grid search MLE
    var grid = [], g; for (g = -2.3; g <= 3.0; g += 0.2) grid.push(Math.exp(g));
    var best = null;
    grid.forEach(function (a) { grid.forEach(function (b) {
      var ll = 0;
      Object.keys(obs).forEach(function (k) { var o = obs[k], r = sbgR(a, b, +k); ll += o.s * Math.log(r) + (o.n - o.s) * Math.log(1 - r); });
      if (best === null || ll > best.ll) best = { alpha: a, beta: b, ll: ll };
    }); });
    return best;
  }
  function sumNum(o) { var s = 0; Object.keys(o).forEach(function (k) { s += o[k].n; }); return s; }
  /* Incident windows (billing / product outages): data.incidents = [{from, to, reason}] (ms after normalize; ISO accepted). A renewal whose due date falls inside a window is
     not evidence about churn: it is dropped from obs (censored). A paid renewal inside the window still lets the scan continue; an unpaid one ends it (we do not know why it failed). */
  function incidentWindows(data) {
    var raw = data && data._filtered ? data.raw : data, list = raw && Array.isArray(raw.incidents) ? raw.incidents : [];
    return list.map(function (w) { var a = typeof w.from === 'number' ? w.from : Date.parse(w.from), b = typeof w.to === 'number' ? w.to : Date.parse(w.to); return isFinite(a) && isFinite(b) && b > a ? { from: a, to: b, reason: w.reason || '' } : null; }).filter(Boolean);
  }
  function inIncident(wins, ts) { for (var i = 0; i < wins.length; i++) if (ts >= wins[i].from && ts < wins[i].to) return true; return false; }
  BB.predict = {};
  BB.predict.incidents = incidentWindows;

  /* Build raw per-segment statistics from the whole dataset. */
  function segStats(data, opt) {
    var now = opt && opt.now ? opt.now : data.now, S = {}, userOk = opt && opt.userOk, trunc = !!(opt && opt.now);
    var wins = incidentWindows(data), hlDays = hashCfg().p1hl, hl = hlDays * DAY; // recency weights of the base p1 (hash p1hl, 0 = unweighted) and incident censoring: accumulated for every model
    function get(k) {
      if (!S[k]) S[k] = { key: k, trialsEnded: 0, firstRebillOk: 0, firstFailed: 0, firstRecovered: 0, obs: {}, cancelled: 0, cancelled20: 0, payers: 0, gross: 0, fees: 0, refunds: 0, disputes: 0, packs: 0, censored: 0, wTrials: 0, wOk: 0, wSq: 0, p1hl: hlDays };
      return S[k];
    }
    data.users.forEach(function (u) {
      var t = u._trial; if (!t) return;
      if (userOk && !userOk(u)) return;
      var P = BB.PLAN_BY_ID[t.plan]; if (!P) return;
      var tEnd = t.ts + P.trialDays * DAY; if (tEnd > now) return;
      var keys = [segKey(t.plan, u.geo_tier, u.channel || 'organic'), segKey(t.plan, u.geo_tier), t.plan, 'all'];
      var cs = data.index.chargesByUser.get(u.user_id) || [], okN = {}, firstFail = false, i;
      if (trunc) { cs = cs.filter(function (c) { return c.ts < now; }); } // hold-out: only events known at `now`
      for (i = 0; i < cs.length; i++) { var c = cs[i]; if (c.status === 'succeeded') { if (c.type === 'rebill' || c.type === 'renewal') okN[c.n] = true; } else if (c.n === 1 && c.type === 'rebill' && c.attempt === 1) firstFail = true; }
      var rs = data.index.refundsByUser.get(u.user_id) || [], ds = data.index.disputesByUser.get(u.user_id) || [];
      if (trunc) { rs = rs.filter(function (r) { return r.ts < now; }); ds = ds.filter(function (r) { return r.ts < now; }); }
      var wRec = hl > 0 ? Math.pow(0.5, Math.max(0, now - tEnd) / hl) : 1; // age of the trial end as of `now` (hold-out: as of trainUntil)
      keys.forEach(function (k) {
        var s = get(k); s.trialsEnded++; s.wTrials += wRec; s.wSq += wRec * wRec; if (okN[1]) s.wOk += wRec;
        if (t.cancelled_ts) { s.cancelled++; if (t.cancelled_ts - t.ts <= 20 * 60000) s.cancelled20++; }
        if (okN[1]) { s.firstRebillOk++; s.payers++; if (firstFail) s.firstRecovered++; } if (firstFail) s.firstFailed++;
        for (i = 0; i < cs.length; i++) if (cs[i].status === 'succeeded') { s.gross += cs[i].amount_usd; s.fees += cs[i].fee_usd; if (cs[i].type === 'pack') s.packs += cs[i].amount_usd; }
        for (i = 0; i < rs.length; i++) s.refunds += rs[i].amount_usd;
        for (i = 0; i < ds.length; i++) s.disputes += ds[i].amount_usd + ds[i].fee_usd;
        if (okN[1]) for (var k2 = 2; k2 <= 60; k2++) {
          if (!okN[k2 - 1]) break;
          var due = tEnd + (k2 - 1) * P.periodDays * DAY; if (due > now - GRACE) break;
          if (wins.length && inIncident(wins, due)) { s.censored++; if (okN[k2]) continue; else break; } // incident censoring: not evidence about churn
          var o = s.obs[k2] || (s.obs[k2] = { n: 0, s: 0 }); o.n++; if (okN[k2]) o.s++;
        }
      });
    });
    return S;
  }
  /* ───────── Model registry: every model turns per-segment obs[k] = {n, s} into r(k) = P(pay renewal k | paid k−1), k ≥ 2 ───────── */
  BB.predict.MODELS = [
    { id: 'sbg', kind: 'js', label: 'sBG (base)', skill: 'Fader & Hardie (2007)', family: 'shifted-beta-geometric', params: ['alpha', 'beta'] },
    { id: 'power', kind: 'js', label: 'Power curve', skill: 'power-law cohort decay', family: 'S(t)=a·t^−b', params: ['a', 'b'] },
    { id: 'power_b', kind: 'js', label: 'Power, borrowed decay', skill: 'power law, decay from a mature segment', family: 'S(t)=a·t^−b, b from mature segment', params: ['a', 'b', 'bFrom'] },
    { id: 'geom', kind: 'js', label: 'Constant churn (exp)', skill: 'geometric (constant churn)', family: 'r(k)=c', params: ['c'] },
    { id: 'log', kind: 'js', label: 'Log curve', skill: 'logarithmic decay', family: 'S(t)=a−b·ln t', params: ['a', 'b'] },
    { id: 'weibull', kind: 'js', label: 'Weibull (discrete)', skill: 'discrete Weibull survival', family: 'S(t)=exp(−(t/λ)^κ)', params: ['lambda', 'kappa'] },
    { id: 'km', kind: 'js', label: 'Kaplan–Meier + tail', skill: 'Kaplan & Meier (1958)', family: 'empirical, tail = last 3 r(k) mean', params: ['tail', 'lastK'] },
    { id: 'vlad_v1', kind: 'js', label: 'Vlad v1 · benchmark-prior sBG', skill: 'Vlad Yasinski', family: 'sBG MAP: observed renewals + m pseudo-renewals from a benchmark curve (prior=, pm=)', params: ['alpha', 'beta', 'm', 'priorShare', 'prior'], prior: 'bench', keepEdge: true },
    { id: 'vlad_v1h', kind: 'js', label: 'Vlad v1h · hierarchical prior', skill: 'Vlad Yasinski', family: 'sBG MAP: observed renewals + m pseudo-renewals from the parent segment posterior (benchmark only at “all”)', params: ['alpha', 'beta', 'm', 'priorShare', 'prior'], prior: 'parent', keepEdge: true },
    { id: 'vlad_v2', kind: 'js', label: 'Vlad v2 · v1 + recency p1 + plan mix', skill: 'Vlad Yasinski', family: 'v1 retention; recency-weighted p1 (shared base, p1hl=); plan-mix forward model for pMRR and paywall pLTV', params: ['alpha', 'beta', 'm', 'priorShare', 'prior'], prior: 'bench', keepEdge: true, planMix: true },
    /* Offline models (kind: 'offline', file: 'models/<id>.json') can be registered here; their JSON is fetched by BB.predict.offline.fetchAll. None ship with the release. */
  ];
  var MODEL_BY_ID = {}; BB.predict.MODELS.forEach(function (m) { MODEL_BY_ID[m.id] = m; });
  BB.predict.MODEL_BY_ID = MODEL_BY_ID;
  BB.predict.DEFAULT_MODEL = 'sbg';
  var FRESH_DAYS = 7;

  /* Survival points S(1)=1, S(k)=Π s_i/n_i over consecutive observed k, stopping at the first k with n < 5. */
  function survPoints(obs) {
    var pts = [{ k: 1, S: 1, n: null }], S = 1;
    for (var k = 2; k <= 60; k++) { var o = obs[k]; if (!o || o.n < 5) break; S *= o.s / o.n; pts.push({ k: k, S: S, n: o.n }); }
    return pts;
  }
  function ols(xs, ys) { // → {a: intercept, b: slope, r2}
    var n = xs.length, mx = sum(xs) / n, my = sum(ys) / n, sxy = 0, sxx = 0, syy = 0, i;
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    var b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx, ssr = 0;
    for (i = 0; i < n; i++) { var e = ys[i] - (a + b * xs[i]); ssr += e * e; }
    return { a: a, b: b, r2: syy > 0 ? 1 - ssr / syy : 1 };
  }
  function llOf(obs, r) { var ll = 0; Object.keys(obs).forEach(function (k) { var o = obs[k], p = clamp(r(+k), 1e-6, 1 - 1e-6); ll += o.s * Math.log(p) + (o.n - o.s) * Math.log(1 - p); }); return ll; }
  function devOf(obs, S) { var pts = survPoints(obs), d = 0, s1 = S(1) || 1; pts.forEach(function (p) { d = Math.max(d, Math.abs(S(p.k) / s1 - p.S)); }); return d; } // normalised: only S(k)/S(1) matters for r(k)
  function rFromS(S) { return function (k) { if (k <= 1) return 1; var a = S(k - 1), b = S(k); return a > 0 ? clamp(b / a, 0.01, 0.995) : 0.01; }; }
  function Sfrom(r) { return function (k) { var s = 1; for (var i = 2; i <= k; i++) s *= r(i); return s; }; }
  function diagOf(obs, r, S, extra) { return Object.assign({ nObs: survPoints(obs).length - 1, atRisk: sumNum(obs), ll: llOf(obs, r), maxAbsDev: devOf(obs, S), r2: null, converged: true, edge: false, note: '' }, extra || {}); }
  var SBG_GRID = (function () { var g = []; for (var x = -2.3; x <= 3.0; x += 0.2) g.push(Math.exp(x)); return g; })();
  /* Power-curve helper shared by `power` and `power_b` (b fixed when given). */
  function fitPower(obs, fixedB) {
    var pts = survPoints(obs), xs = pts.map(function (p) { return Math.log(p.k); }), ys = pts.map(function (p) { return Math.log(Math.max(p.S, 1e-6)); });
    var need = fixedB === undefined ? 3 : 2;
    if (pts.length < need) return { params: {}, r: rFromS(function (k) { return Math.pow(k, -0.5); }), diag: { nObs: pts.length - 1, atRisk: sumNum(obs), ll: null, maxAbsDev: null, r2: null, converged: false, edge: false, note: 'fewer than ' + need + ' survival points' } };
    var b, lnA, r2;
    if (fixedB === undefined) { var o = ols(xs, ys); b = clamp(-o.b, 0.05, 2); lnA = o.a; r2 = o.r2; }
    else { b = fixedB; var acc = 0; for (var i = 0; i < xs.length; i++) acc += ys[i] + b * xs[i]; lnA = acc / xs.length; var my = sum(ys) / ys.length, ssr = 0, syy = 0; for (i = 0; i < xs.length; i++) { var e = ys[i] - (lnA - b * xs[i]); ssr += e * e; syy += (ys[i] - my) * (ys[i] - my); } r2 = syy > 0 ? 1 - ssr / syy : 1; }
    var A = Math.exp(lnA), S = function (k) { return A * Math.pow(k, -b); }, r = rFromS(S);
    return { params: { a: A, b: b }, r: r, S: S, diag: diagOf(obs, r, S, { r2: r2, edge: fixedB === undefined && (b <= 0.05 || b >= 2), nPoints: pts.length }) };
  }
  /* ───────── Vlad v1/v2: benchmark prior (empirical-Bayes sBG). Config in BB.predict.vlad.cfg, change with BB.predict.vlad.set({...}, data) which also clears the caches. ───────── */
  var VLAD = { cfg: {
    prior: 'research',             // 'research' (illustrative sBG prior for web subscriptions: weekly α 0.74 β 0.65, monthly α 1.31 β 2.02) | 'placeholder' (hand-set step curve) | 'none'. Replace with your own benchmark.
    m: { 3: 10, 2: 20, 1: 30, all: 50 }, // prior weight in pseudo-renewals at risk per level: plan|tier|channel, plan|tier, plan, all
    mScale: null,                  // when a number: every level's m is replaced by this value (grid search helper)
    normalize: true,               // true: Σ_k n0[k] = m (m is the total pseudo at-risk count, so priorShare = m/(Σn+m) is a share of observations); false: n0[k] = m·w(k) literally
    wMode: 'flat',                 // w(k) = 1 for k ≤ kBench ('flat') or w(k) ∝ k ('tail', prior acts mostly on the tail)
    kBench: { week: 26, month: 12 },
    minOwn: 5,                     // a segment uses its own posterior when atRisk ≥ minOwn and atRisk + m ≥ MIN_SEG (m = 0 → exactly the sBG gate)
    geoMult: {},                   // optional per geo_tier multipliers on the prior's r(2), e.g. {LATAM: {r2: 0.65}}; default off
    halfLifeDays: 45,              // default recency half-life (days) of the base p1 weights — every model; hash key p1hl overrides (0 = unweighted)
  } };
  var PRIOR_IDS = ['research', 'placeholder', 'none'];
  /* Global hash levers read like `model` (BB.state): prior=research|placeholder|none (benchmark of vlad_v1 / v2), pm=<multiplier of the prior weights cfg.m>
     (absent = 1, 0 = plain sBG), p1hl=<half-life in days of the recency weights of p1> (absent = cfg.halfLifeDays, 0 = unweighted). Changing any of them invalidates the cached fits. */
  function hashCfg() {
    var st = {}; try { st = BB.state && BB.state.read ? BB.state.read() : {}; } catch (e) { st = {}; }
    var prior = st.prior && PRIOR_IDS.indexOf(st.prior) >= 0 ? st.prior : VLAD.cfg.prior;
    var pm = st.pm !== undefined && st.pm !== null && st.pm !== '' && isFinite(+st.pm) && +st.pm >= 0 ? +st.pm : 1;
    var hl = st.p1hl !== undefined && st.p1hl !== null && st.p1hl !== '' && isFinite(+st.p1hl) && +st.p1hl >= 0 ? +st.p1hl : +VLAD.cfg.halfLifeDays;
    return { prior: prior, pm: pm, p1hl: hl, key: prior + '|' + pm + '|' + hl + '|' + (VLAD.cfg.mScale === null || VLAD.cfg.mScale === undefined ? '' : VLAD.cfg.mScale) };
  }
  BB.predict.hashCfg = hashCfg;
  BB.predict.PRIORS = PRIOR_IDS;
  function syncCfg(data) { var k = hashCfg().key; if (data._cfgKey !== k) { data._cfgKey = k; delete data._segStats; delete data._rateFits; delete data._fit; delete data._fitHold; delete data._inputChecks; } }
  var BENCH_RESEARCH = { week: { alpha: 0.74, beta: 0.65 }, month: { alpha: 1.31, beta: 2.02 } }; // illustrative research prior (sBG), ≈ 4.4 renewals per weekly payer
  var BENCH = {
    placeholder: { week: { r: { 2: 0.60, 3: 0.70, 4: 0.76, 5: 0.80, 6: 0.83, 7: 0.855 }, tail: null, step: function (k) { return k >= 16 ? 0.92 : k >= 8 ? 0.88 : null; }, K: 7 },
                   month: { r: { 2: 0.55, 3: 0.68, 4: 0.75, 5: 0.80 }, tail: null, step: function (k) { return k >= 12 ? 0.90 : k >= 6 ? 0.85 : null; }, K: 5 } } };
  function benchR(table, k) { if (table.r[k] !== undefined) return table.r[k]; if (table.step) { var v = table.step(k); if (v !== null) return v; } return table.tail; }
  BB.predict.vlad = {
    cfg: VLAD.cfg, bench: BENCH, benchResearch: BENCH_RESEARCH,
    /* r_bench(k) for a plan period under the configured prior; the optional geo multiplier acts on r(2) only */
    /* effective prior id: hash `prior` when valid, else cfg.prior */
    priorId: function () { return hashCfg().prior; },
    rBench: function (period, tier) {
      var c = VLAD.cfg, prior = hashCfg().prior, p = period === 'month' ? 'month' : 'week', g = tier && c.geoMult && c.geoMult[tier], m2 = g && g.r2 ? +g.r2 : 1, base;
      if (prior === 'none') return null;
      if (prior === 'research') { var ab = BENCH_RESEARCH[p]; base = function (k) { return sbgR(ab.alpha, ab.beta, k); }; }
      else { var t = (BENCH[prior] || BENCH.placeholder)[p]; base = function (k) { return benchR(t, k); }; }
      return function (k) { return clamp(base(k) * (k === 2 ? m2 : 1), 0.01, 0.995); };
    },
    priorSbg: function (period) { var prior = hashCfg().prior, p = period === 'month' ? 'month' : 'week'; return prior === 'research' ? BENCH_RESEARCH[p] : null; },
    /* prior weight (pseudo-renewals at risk) of a segment key: cfg.m per level (or cfg.mScale) × hash pm */
    mFor: function (key) { var c = VLAD.cfg, pm = hashCfg().pm, base; if (c.mScale !== null && c.mScale !== undefined) base = +c.mScale; else { var lvl = key === 'all' ? 'all' : key.split('|').length; base = +(c.m[lvl] !== undefined ? c.m[lvl] : 0); } return base * pm; },
    /* Pseudo-observations of the prior for one segment: n0[k] = m·w(k) (normalised to Σ = m when cfg.normalize), s0[k] = n0[k]·r_prior(k) */
    priorObs: function (m, rPrior, period) {
      var c = VLAD.cfg, K = c.kBench[period === 'month' ? 'month' : 'week'] || 26, w = {}, sw = 0, k, out = {};
      if (!(m > 0) || !rPrior) return out;
      for (k = 2; k <= K; k++) { w[k] = c.wMode === 'tail' ? k : 1; sw += w[k]; }
      for (k = 2; k <= K; k++) { var n0 = c.normalize ? m * w[k] / sw : m * w[k]; out[k] = { n: n0, s: n0 * rPrior(k) }; }
      return out;
    },
    /* Change the configuration; clears every cached fit / stat of `data` so the next BB.predict.fit refits. */
    set: function (patch, data) {
      Object.keys(patch || {}).forEach(function (k) { VLAD.cfg[k] = patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && VLAD.cfg[k] && typeof VLAD.cfg[k] === 'object' ? Object.assign({}, VLAD.cfg[k], patch[k]) : patch[k]; });
      if (data) { var raw = data._filtered ? data.raw : data; delete raw._segStats; delete raw._rateFits; delete raw._fit; delete raw._fitHold; delete raw._inputChecks; delete raw._cfgKey; }
      return VLAD.cfg;
    },
  };
  function vladFit(obs, ctx) { // ctx: {key, period, tier, rPrior (k → r) | null, m}
    var m = ctx.m || 0, prior = m > 0 && ctx.rPrior ? BB.predict.vlad.priorObs(m, ctx.rPrior, ctx.period) : {}, comb = {}, n = sumNum(obs), n0 = 0;
    Object.keys(obs).forEach(function (k) { comb[k] = { n: obs[k].n, s: obs[k].s }; });
    Object.keys(prior).forEach(function (k) { var c = comb[k] || (comb[k] = { n: 0, s: 0 }); c.n += prior[k].n; c.s += prior[k].s; n0 += prior[k].n; });
    var best = fitSbg(comb), r = function (k) { return sbgR(best.alpha, best.beta, k); }, S = Sfrom(r);
    var edge = best.alpha === SBG_GRID[0] || best.alpha === SBG_GRID[SBG_GRID.length - 1] || best.beta === SBG_GRID[0] || best.beta === SBG_GRID[SBG_GRID.length - 1];
    var share = n + n0 > 0 ? n0 / (n + n0) : 1;
    /* fit quality of a prior model: maxAbsDev against the blended target (obs + prior pseudo-observations = what the fit saw); obsDev against the raw observed points;
       excessDev = the part of the blended deviation not explained by the prior: max_k max(0, |S_fit − S_target| − priorShare · |S_prior − S_target|) (the fit may sit between data and prior in proportion to the prior share). m = 0 → all three equal sBG's maxAbsDev. */
    var Sp = ctx.rPrior && m > 0 ? Sfrom(ctx.rPrior) : null, excess = 0; survPoints(comb).forEach(function (pt) { if (pt.k === 1) return; var dv = Math.abs(S(pt.k) - pt.S), allow = Sp ? share * Math.abs(Sp(pt.k) - pt.S) : 0; excess = Math.max(excess, dv - allow); });
    return { params: { alpha: best.alpha, beta: best.beta, m: m, priorShare: share, prior: ctx.priorFrom || 'none', nEff: n + n0 }, r: r, S: S,
      diag: diagOf(obs, r, S, { maxAbsDev: devOf(comb, S), obsDev: devOf(obs, S), excessDev: excess, converged: !edge, edge: edge, priorShare: share, nEff: n + n0, note: (edge ? 'α/β on the grid edge; ' : '') + 'prior ' + (ctx.priorFrom || 'none') + ' m=' + m + ' share=' + (share * 100).toFixed(0) + '%' }) }; // maxAbsDev against the blended target (obs + prior pseudo-observations = what the fit saw); obsDev against the raw observed points (m = 0 → both equal sBG's)
  }
  /* In-browser models. fit(obs, ctx) → {params, r(k), S(k)?, diag:{nObs, atRisk, ll, r2, maxAbsDev, converged, edge, note}} */
  var models = {
    vlad_v1: { fit: vladFit }, vlad_v1h: { fit: vladFit }, vlad_v2: { fit: vladFit },
    sbg: { fit: function (obs) {
      var best = fitSbg(obs), r = function (k) { return sbgR(best.alpha, best.beta, k); }, S = Sfrom(r);
      var edge = best.alpha === SBG_GRID[0] || best.alpha === SBG_GRID[SBG_GRID.length - 1] || best.beta === SBG_GRID[0] || best.beta === SBG_GRID[SBG_GRID.length - 1];
      return { params: { alpha: best.alpha, beta: best.beta }, r: r, S: S, diag: diagOf(obs, r, S, { converged: !edge, edge: edge, note: edge ? 'α/β on the grid edge' : '' }) };
    } },
    power: { fit: function (obs) { return fitPower(obs); } },
    power_b: { fit: function (obs, ctx) {
      var src = ctx && ctx.borrow ? ctx.borrow() : (ctx && ctx.pooled && ctx.pooled.params && ctx.pooled.params.b !== undefined ? { b: ctx.pooled.params.b, from: 'all' } : null);
      if (!src) { var own = fitPower(obs); own.params.bFrom = 'own'; own.diag.note = 'no mature segment to borrow b from'; return own; }
      var f = fitPower(obs, src.b); f.params.bFrom = src.from; f.diag.note = 'b borrowed from ' + src.from; return f;
    } },
    geom: { fit: function (obs) {
      var n = 0, s = 0; Object.keys(obs).forEach(function (k) { n += obs[k].n; s += obs[k].s; });
      var c = n ? clamp(s / n, 0.01, 0.995) : 0.8, r = function () { return c; }, S = function (k) { return Math.pow(c, k - 1); };
      return { params: { c: c }, r: r, S: S, diag: diagOf(obs, r, S, { converged: n > 0, note: n ? '' : 'no renewals at risk' }) };
    } },
    log: { fit: function (obs) {
      var pts = survPoints(obs);
      if (pts.length < 3) return { params: {}, r: function () { return 0.8; }, diag: { nObs: pts.length - 1, atRisk: sumNum(obs), ll: null, maxAbsDev: null, r2: null, converged: false, edge: false, note: 'fewer than 3 survival points' } };
      var o = ols(pts.map(function (p) { return Math.log(p.k); }), pts.map(function (p) { return p.S; })), a = o.a, b = -o.b;
      var S = function (k) { return Math.max(0.02, a - b * Math.log(k)); }, r = rFromS(S);
      return { params: { a: a, b: b }, r: r, S: S, diag: diagOf(obs, r, S, { r2: o.r2, edge: b <= 0, note: b <= 0 ? 'curve does not decay' : '' }) };
    } },
    weibull: { fit: function (obs) {
      var best = null, L = [], i; for (i = 0; i < 40; i++) L.push(Math.exp(Math.log(1) + (Math.log(200) - Math.log(1)) * i / 39));
      var Sk = function (lam, kap) { return function (k) { return k <= 1 ? 1 : Math.exp(-Math.pow((k - 1) / lam, kap)); }; };
      for (var kap = 0.3; kap <= 3.0001; kap += 0.05) for (i = 0; i < L.length; i++) { var S = Sk(L[i], kap), ll = llOf(obs, rFromS(S)); if (best === null || ll > best.ll) best = { lambda: L[i], kappa: +kap.toFixed(2), ll: ll }; }
      var S2 = Sk(best.lambda, best.kappa), r = rFromS(S2), edge = best.kappa <= 0.3 || best.kappa >= 3 || best.lambda === L[0] || best.lambda === L[L.length - 1];
      return { params: { lambda: best.lambda, kappa: best.kappa }, r: r, S: S2, diag: diagOf(obs, r, S2, { converged: sumNum(obs) > 0 && !edge, edge: edge, note: edge ? 'κ/λ at a bound' : '' }) };
    } },
    km: { fit: function (obs) {
      var pts = survPoints(obs), rk = {}, last = 1, tailVals = [];
      pts.forEach(function (p, i) { if (i === 0) return; rk[p.k] = pts[i - 1].S > 0 ? clamp(p.S / pts[i - 1].S, 0.01, 0.995) : 0.01; last = p.k; });
      for (var k = last; k >= 2 && tailVals.length < 3; k--) tailVals.push(rk[k]);
      var tail = tailVals.length ? sum(tailVals) / tailVals.length : 0.8, r = function (k) { return rk[k] !== undefined ? rk[k] : tail; }, S = Sfrom(r);
      return { params: { tail: tail, lastK: last }, r: r, S: S, diag: diagOf(obs, r, S, { converged: last >= 2, note: last >= 2 ? 'tail extrapolated from k=' + last : 'no observed renewals' }) };
    } },
  };
  BB.predict.models = models;

  /* ───────── Offline models: JSON produced by Python; loaded via BB.predict.offline.load / fetchAll ───────── */
  function fnv1a(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  /* data_hash the offline producers must reproduce: FNV-1a 32-bit over sorted user_ids of users who signed up before today (UTC) joined by '\n' + '|' + ISO date of `now` (UTC).
     Today's signups are excluded so the hash is stable within a day while new users keep arriving (the mock grows with the clock); the date part forces a daily refresh. */
  BB.predict.dataHash = function (data) {
    if (data._filtered) data = data.raw;
    if (data._dataHash) return data._dataHash;
    var day0 = startOfDay(data.now), ids = [];
    data.users.forEach(function (u) { if (u.signup_ts < day0) ids.push(String(u.user_id)); });
    ids.sort();
    data._dataHash = fnv1a(ids.join('\n') + '|' + isoDate(data.now));
    return data._dataHash;
  };
  var offlineStore = {};
  BB.predict.offline = {
    /* Register a parsed JSON for model `id`. Returns the status record {status:'ok'|'stale'|'error'|'no_file', generated_at, tool, data_hash, ageDays, nSegments, nUsers, error}. */
    load: function (id, json, data) {
      var m = MODEL_BY_ID[id]; if (!m || m.kind !== 'offline') throw new Error('not an offline model: ' + id);
      var rec = { id: id, file: m.file, status: 'error', generated_at: null, tool: null, data_hash: null, train_cutoff: null, ageDays: null, nSegments: 0, nUsers: 0, error: null, json: null };
      try {
        if (!json || typeof json !== 'object' || json.model !== id) throw new Error(json && json.model ? 'model "' + json.model + '" ≠ ' + id : 'malformed JSON');
        if (id === 'cox' && (!json.segments || typeof json.segments !== 'object')) throw new Error('segments missing');
        if (id === 'arima' && (!json.series || typeof json.series !== 'object')) throw new Error('series missing');
        rec.json = json; rec.generated_at = json.generated_at || null; rec.tool = json.tool || null; rec.data_hash = json.data_hash || null;
        rec.train_cutoff = json.train_cutoff && isFinite(Date.parse(json.train_cutoff)) ? json.train_cutoff : null; // null → trained on everything (in-sample for any backtest)
        rec.nSegments = json.segments ? Object.keys(json.segments).length : 0; rec.nUsers = json.users ? Object.keys(json.users).length : 0;
        var now = data ? data.now : Date.now(), gen = rec.generated_at ? Date.parse(rec.generated_at) : NaN;
        rec.ageDays = isFinite(gen) ? (now - gen) / DAY : null;
        var hashOk = data ? rec.data_hash === BB.predict.dataHash(data) : true;
        rec.status = hashOk && rec.ageDays !== null && rec.ageDays <= FRESH_DAYS ? 'ok' : 'stale';
        rec.staleReason = !hashOk ? 'dataset changed' : rec.ageDays === null ? 'no generated_at' : rec.ageDays > FRESH_DAYS ? 'older than ' + FRESH_DAYS + ' days' : null;
      } catch (e) { rec.status = 'error'; rec.error = e.message; rec.json = null; }
      offlineStore[id] = rec;
      if (data) { var raw = data._filtered ? data.raw : data; if (raw._fit) delete raw._fit[id]; if (raw._fitHold) Object.keys(raw._fitHold).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete raw._fitHold[k]; }); }
      return rec;
    },
    unload: function (id, data) { delete offlineStore[id]; if (data) { var raw = data._filtered ? data.raw : data; if (raw._fit) delete raw._fit[id]; } },
    status: function (id) { var m = MODEL_BY_ID[id]; return offlineStore[id] || { id: id, file: m ? m.file : null, status: 'no_file', generated_at: null, tool: null, data_hash: null, ageDays: null, nSegments: 0, nUsers: 0, error: null, json: null }; },
    get: function (id) { var r = offlineStore[id]; return r && r.json ? r.json : null; },
    usable: function (id) { var s = BB.predict.offline.status(id).status; return s === 'ok' || s === 'stale'; },
    /* Browser: fetch every offline model's file relative to the page. Resolves to {id: statusRecord}; never rejects. */
    fetchAll: function (data, base) {
      var fetchFn = typeof fetch === 'function' ? fetch : null, out = {};
      var list = BB.predict.MODELS.filter(function (m) { return m.kind === 'offline'; });
      if (!fetchFn) { list.forEach(function (m) { out[m.id] = BB.predict.offline.status(m.id); }); return Promise.resolve(out); }
      return Promise.all(list.map(function (m) {
        return fetchFn((base || './') + m.file, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) { out[m.id] = BB.predict.offline.load(m.id, j, data); })
          .catch(function (e) { var missing = /HTTP 404|Failed to fetch|NetworkError/.test(String(e && e.message)); if (missing) { delete offlineStore[m.id]; out[m.id] = BB.predict.offline.status(m.id); } else out[m.id] = BB.predict.offline.load(m.id, { model: '__broken__', error: String(e && e.message) }, data); if (out[m.id].status === 'error' && !out[m.id].error) out[m.id].error = String(e && e.message); });
      })).then(function () { return out; });
    },
  };
  function offlineModel(id) { // fit adapter for a loaded offline retention file (cox): r(k) from segments[key].r
    return { fit: function (obs, ctx) {
      var j = BB.predict.offline.get(id), seg = j && j.segments ? j.segments[ctx.key] : null, arr = seg && Array.isArray(seg.r) ? seg.r : null;
      if (!arr) return { params: {}, r: function () { return 0.8; }, diag: { nObs: 0, atRisk: sumNum(obs), ll: null, maxAbsDev: null, r2: null, converged: false, edge: false, note: 'segment not in file' } };
      var rk = {}, last = 1; for (var k = 2; k < arr.length; k++) if (typeof arr[k] === 'number' && isFinite(arr[k])) { rk[k] = clamp(arr[k], 0.01, 0.995); last = k; }
      if (last < 2) return { params: {}, r: function () { return 0.8; }, diag: { nObs: 0, atRisk: sumNum(obs), ll: null, maxAbsDev: null, r2: null, converged: false, edge: false, note: 'empty r[] in file' } };
      var tail = rk[last], r = function (k) { return rk[k] !== undefined ? rk[k] : tail; }, S = Sfrom(r);
      return { params: { lastK: last, note: seg.note || '' }, r: r, S: S, diag: diagOf(obs, r, S, { converged: true, note: seg.note || ('file curve to k=' + last) }) };
    } };
  }

  /* Model id to use: explicit → hash key `model` → 'sbg'. Offline models without a usable file (and arima, which has no retention curve) resolve to sbg for cohort maths. */
  function stateModel() { try { var m = BB.state && BB.state.read ? BB.state.read().model : null; return m && MODEL_BY_ID[m] ? m : 'sbg'; } catch (e) { return 'sbg'; } }
  BB.predict.modelOf = function (opts) { var id = opts && opts.model; return id && MODEL_BY_ID[id] ? id : stateModel(); };
  function retentionModel(id) { var m = MODEL_BY_ID[id] || MODEL_BY_ID.sbg; if (m.kind === 'offline') return m.scope || !BB.predict.offline.usable(id) ? 'sbg' : id; return m.id; }
  BB.predict.effectiveModel = function (opts) { return retentionModel(BB.predict.modelOf(opts)); };

  /* Raw stats → rate parameters per segment (shared by every model: p1, pRecover, cancel shares, pack, refund / dispute / fee rates) with the rates fallback chain. */
  function rateFits(S) {
    var fits = {};
    Object.keys(S).forEach(function (k) {
      var s = S[k], f = { key: k, n: s.trialsEnded, payers: s.payers };
      f.p1 = (s.wOk + 0.5) / (s.wTrials + 1); // recency-weighted (w = 0.5^(age / p1hl)), Laplace-smoothed; p1hl = 0 → the unweighted rate
      f.p1_all = (s.firstRebillOk + 0.5) / (s.trialsEnded + 1); // unweighted, all-time
      f.p1_hl = s.p1hl; f.p1_wn = s.wTrials; f.p1_neff = s.wSq > 0 ? s.wTrials * s.wTrials / s.wSq : 0; // Kish effective sample of the weighted rate (= n when unweighted)
      f.n_eff = f.p1_neff;
      f.pRecover = s.firstFailed >= 10 ? s.firstRecovered / s.firstFailed : 0.08;
      f.cancelShare = s.trialsEnded ? s.cancelled / s.trialsEnded : 0; f.cancel20Share = s.cancelled ? s.cancelled20 / s.cancelled : 0.3;
      f.obs = s.obs;
      f.packPerPayer = s.payers ? s.packs / s.payers : 0;
      f.refundRate = s.gross ? s.refunds / s.gross : 0.03; f.disputeRate = s.gross ? s.disputes / s.gross : 0.02; f.feePct = s.gross ? s.fees / s.gross : 0.045;
      f.fallback = null;
      fits[k] = f;
    });
    Object.keys(fits).forEach(function (k) {
      var f = fits[k], chain = segChain(k);
      if (f.n < MIN_SEG) { for (var i = 0; i < chain.length; i++) { var p = fits[chain[i]]; if (p && p.n >= MIN_SEG) { f.p1 = p.p1; f.p1_all = p.p1_all; f.pRecover = p.pRecover; f.cancelShare = p.cancelShare; f.cancel20Share = p.cancel20Share; f.n_eff = p.n_eff; f.fallback = chain[i]; break; } } } // gate on the UNWEIGHTED count
    });
    return fits;
  }
  function baseRates(S, data) { if (data) { if (!data._rateFits) data._rateFits = rateFits(S); return data._rateFits; } return rateFits(S); }
  /* Retention curve per segment for one model over stats S: own fit when ≥ MIN_SEG renewals at risk and converged, else the chain, else the default geometric-ish curve (α=1, β=4).
     Prior models (vlad_*): own posterior fit when atRisk ≥ cfg.minOwn and atRisk + m ≥ MIN_SEG; the prior is the benchmark curve of the plan period (vlad_v1 / v2) or the parent's posterior (vlad_v1h, benchmark only at `all`). */
  function curveFits(S, base, modelId) {
    var m = MODEL_BY_ID[modelId], impl = m.kind === 'offline' ? offlineModel(modelId) : models[modelId], fits = {}, own = {};
    Object.keys(base).forEach(function (k) { fits[k] = Object.assign({}, base[k]); });
    var periodOf = {}, topPlan = null; Object.keys(S).forEach(function (k) { if (k.indexOf('|') < 0 && k !== 'all' && (!topPlan || S[k].trialsEnded > S[topPlan].trialsEnded)) topPlan = k; });
    Object.keys(S).forEach(function (k) { var P = BB.PLAN_BY_ID[k.split('|')[0]] || BB.PLAN_BY_ID[topPlan]; periodOf[k] = P ? P.period : 'week'; });
    var keysOrdered = Object.keys(S).sort(function (a, b) { return (a === 'all' ? 0 : a.split('|').length) - (b === 'all' ? 0 : b.split('|').length); }); // parents before children (hierarchical prior)
    var pooledPower = modelId === 'power_b' && S.all ? fitPower(S.all.obs) : null;
    function borrowFor(k) { // nearest chain ancestor with ≥ 8 survival points, else `all`
      var chain = segChain(k);
      for (var i = 0; i < chain.length; i++) { var a = S[chain[i]]; if (a && survPoints(a.obs).length >= 8) { var pf = chain[i] === 'all' ? pooledPower : fitPower(a.obs); if (pf.diag.converged) return { b: pf.params.b, from: chain[i] }; } }
      return pooledPower && pooledPower.diag.converged ? { b: pooledPower.params.b, from: 'all' } : null;
    }
    keysOrdered.forEach(function (k) {
      var s = S[k], f = fits[k], atRisk = sumNum(s.obs), mPrior = m.prior ? BB.predict.vlad.mFor(k) : 0, tier = k.split('|')[1] || null;
      if (m.kind === 'offline' || atRisk >= MIN_SEG || (m.prior && atRisk >= VLAD.cfg.minOwn && atRisk + mPrior >= MIN_SEG)) {
        var ctx = { key: k, periodDays: null, trialDays: null, period: periodOf[k], tier: tier, pooled: pooledPower, borrow: modelId === 'power_b' ? function () { return borrowFor(k); } : null, m: mPrior, rPrior: null, priorFrom: null };
        if (m.prior === 'bench') { ctx.rPrior = BB.predict.vlad.rBench(periodOf[k], tier); ctx.priorFrom = ctx.rPrior ? hashCfg().prior : 'none'; }
        else if (m.prior === 'parent') { var chain = segChain(k), par = null; for (var j = 0; j < chain.length; j++) { var q = fits[chain[j]]; if (q && q.r && q.curveFrom === chain[j]) { par = q; break; } }
          if (par) { ctx.rPrior = par.r; ctx.priorFrom = par.key; } else { ctx.rPrior = BB.predict.vlad.rBench(periodOf[k], tier); ctx.priorFrom = ctx.rPrior ? hashCfg().prior : 'none'; } }
        var res = impl.fit(s.obs, ctx);
        own[k] = res.diag;
        if (res.diag.converged || modelId === 'sbg' || m.keepEdge) { f.r = res.r; f.params = res.params; f.diag = res.diag; f.atRisk = atRisk; f.curveFrom = k; }
      }
      f.censored = s.censored || 0;
    });
    Object.keys(fits).forEach(function (k) {
      var f = fits[k], chain = segChain(k);
      if (!f.r) { for (var j = 0; j < chain.length; j++) { var q = fits[chain[j]]; if (q && q.r) { f.r = q.r; f.params = q.params; f.diag = q.diag; f.atRisk = q.atRisk; f.curveFrom = chain[j]; f.fallback = f.fallback || chain[j]; break; } } }
      if (!f.r) { f.r = function (k2) { return sbgR(1, 4, k2); }; f.params = { alpha: 1, beta: 4 }; f.diag = null; f.atRisk = 0; f.curveFrom = 'default'; } // geometric-ish r≈0.8
      if (f.params && f.params.alpha !== undefined) { f.alpha = f.params.alpha; f.beta = f.params.beta; }
      f.ownDiag = own[k] || null;
      f.n_eff = f.n_eff || f.n;
    });
    return fits;
  }
  /* Fitted model per segment with fallback chain plan×tier×channel → plan×tier → plan → all. Cached per model on the dataset: data._fit[modelId]. */
  BB.predict.fit = function (data, modelId) {
    if (data._filtered) data = data.raw;
    if (!data._indexed) BB.index(data);
    var id = retentionModel(modelId && MODEL_BY_ID[modelId] ? modelId : stateModel());
    syncCfg(data);
    data._fit = data._fit || {};
    if (data._fit[id]) return data._fit[id];
    if (!data._segStats) data._segStats = segStats(data);
    var S = data._segStats, cfg = hashCfg();
    data._fit[id] = { model: id, segments: curveFits(S, baseRates(S, data), id), now: data.now, incidents: incidentWindows(data).length, prior: MODEL_BY_ID[id].prior ? cfg.prior : null, pm: cfg.pm, p1hl: cfg.p1hl };
    return data._fit[id];
  };
  /* Hold-out fit "as of `trainUntil`": parameters from users anchored before trainUntil, using only events with ts < trainUntil
     (trials must have ended, renewals must have been due ≥ GRACE before trainUntil). Cached data._fitHold[model|trainUntil|basis]. */
  BB.predict.fitHoldout = function (data, modelId, trainUntil, basis) {
    if (data._filtered) data = data.raw;
    if (!data._indexed) BB.index(data);
    var id = retentionModel(modelId || 'sbg'), key = id + '|' + trainUntil + '|' + (basis || 'signup');
    syncCfg(data);
    data._fitHold = data._fitHold || {};
    if (data._fitHold[key]) return data._fitHold[key];
    var S = segStats(data, { now: trainUntil, userOk: function (u) { var a = anchorOf(u, basis || 'signup'); return a !== null && a < trainUntil; } });
    data._fitHold[key] = { model: id, segments: curveFits(S, baseRates(S, null), id), now: data.now, holdout: true, trainUntil: trainUntil, cutoff: trainUntil, empty: !S.all };
    return data._fitHold[key];
  };
  BB.predict.fitAt = BB.predict.fitHoldout;
  function segFor(fit, u) {
    var t = u._trial; if (!t) return null;
    return fit.segments[segKey(t.plan, u.geo_tier, u.channel || 'organic')] || fit.segments[segKey(t.plan, u.geo_tier)] || fit.segments[t.plan] || fit.segments.all || null;
  }
  function rAt(f, k, sc) { return clamp(f.r(k) - (sc.churnDelta || 0), 0.01, 0.995); } // dispatches on the fitted model's r(k)
  /* Expected future renewal revenue (and variance) for a payer whose last paid renewal index is j, horizon N days from anchor. */
  function futureFrom(f, P, j, N, sc) {
    var mean = 0, e2 = 0, surv = 1, m = 0, k;
    for (k = j + 1; k < j + 80; k++) {
      var day = P.trialDays + (k - 1) * P.periodDays; if (day > N) break;
      surv *= k === 1 ? 1 : rAt(f, k, sc); m++;
      mean += surv; e2 += (2 * m - 1) * surv;
    }
    var price = P.price;
    return { mean: mean * price, var: Math.max(0, (e2 - mean * mean)) * price * price };
  }
  function scenarioOf(o) { return Object.assign({ firstRebillDelta: 0, churnDelta: 0, refundRate: null, disputeRate: null }, o && o.scenario || {}); }
  function netMult(f, money, sc) {
    if (money !== 'net') return 1;
    var rr = sc.refundRate !== null && sc.refundRate !== undefined ? sc.refundRate : f.refundRate;
    var dr = sc.disputeRate !== null && sc.disputeRate !== undefined ? sc.disputeRate : f.disputeRate;
    return clamp(1 - rr - dr - f.feePct, 0.5, 1);
  }

  /** Predict cohort revenue at an offset. row from cohorts/breakdown (needs row._users); opts {offset, money, signalDay:'all'|3|7|14, scenario, data}
   *  → {mid, lo, hi, roas, roasLo, roasHi, payers_expected, basis:'actual'|'predicted', observed, offset, trials, signups, spend, maturedOnly}
   *  trials/signups/spend are the slice `mid` covers: for a per-user-maturity row in the `actual` branch that is the matured slice (maturedOnly:true), otherwise the whole row. */
  BB.predict.cohort = function (row, opts) {
    opts = opts || {};
    var data = opts.data || _cache || BB.load(), modelId = BB.predict.modelOf(opts), fit = opts._fit || BB.predict.fit(data, modelId), now = data.now, ix = data.index;
    var off = modelId === 'cox' && !opts._fit && BB.predict.offline.usable('cox') ? BB.predict.offline.get('cox') : null, offUsers = off && off.users && typeof off.users === 'object' ? off.users : null;
    var offH = off && off.users_horizon_days > 0 ? +off.users_horizon_days : 180, offGen = off && off.generated_at && isFinite(Date.parse(off.generated_at)) ? Date.parse(off.generated_at) : now, covered = 0;
    var N = opts.offset !== undefined ? opts.offset : 90, money = opts.money || row.money || 'gross', sc = scenarioOf(opts), payerMode = opts.payer || row.payer || 'any';
    var sig = opts.signalDay === undefined || opts.signalDay === 'all' || opts.signalDay === null ? null : +opts.signalDay;
    var o = row.byOffset && row.byOffset[N];
    var basis = row.basis || 'signup', users = row._users || [];
    if (o && o.mature && sig === null) {
      var act = money === 'net' ? o.rev_net : o.rev_gross, sp = o.spend !== undefined ? o.spend : row.spend; // o.spend = prorated for per-user maturity rows
      return { mid: act, lo: act, hi: act, roas: ratio(act, sp), roasLo: ratio(act, sp), roasHi: ratio(act, sp), payers_expected: o.payers, basis: 'actual', observed: act, offset: N,
        trials: o.trials !== undefined ? o.trials : row.trials, signups: o.signups !== undefined ? o.signups : row.signups, spend: sp, maturedOnly: o.trials !== undefined && o.trials !== row.trials, priorShare: 0, model: fit.model }; // `mid` covers only the matured users → per-trial / per-signup ratios must divide by these, not row.trials
    }
    var observed = 0, future = 0, fvar = 0, payersObs = 0, payersExp = 0, relErr2 = 0, nUsers = 0, psSum = 0, psN = 0, i;
    for (i = 0; i < users.length; i++) {
      var u = users[i], a = anchorOf(u, basis); if (a === null) continue;
      var cut = sig === null ? now : Math.min(now, a + sig * DAY), limit = Math.min(a + (N + 1) * DAY, cut + 1);
      var t = u._trial; if (!t) continue;
      var P = BB.PLAN_BY_ID[t.plan]; if (!P) continue;
      var f = segFor(fit, u); if (!f) continue;
      psN++; if (f.params && f.params.priorShare > 0) psSum += f.params.priorShare; // prior share of the curve this user resolves to (0 for models without a prior)
      var p1 = clamp(f.p1 + (sc.firstRebillDelta || 0), 0.005, 0.99), nm = netMult(f, money, sc);
      var cs = ix.chargesByUser.get(u.user_id) || [], rs = ix.refundsByUser.get(u.user_id) || [], ds = ix.disputesByUser.get(u.user_id) || [];
      var lastOk = 0, isPayer = false, failedFirst = false, failN = 0, lastFailTs = 0, k;
      for (k = 0; k < cs.length && cs[k].ts < limit; k++) {
        var c = cs[k];
        if (c.status === 'succeeded') { observed += money === 'net' ? c.amount_usd - c.fee_usd : c.amount_usd; if (BB.isPayerCharge(c, payerMode)) isPayer = true; if ((c.type === 'rebill' || c.type === 'renewal') && c.n > lastOk) { lastOk = c.n; failN = 0; } }
        else if (c.type === 'rebill' || c.type === 'renewal') { if (c.n === 1) failedFirst = true; if (c.n === lastOk + 1) { failN++; lastFailTs = c.ts; } }
      }
      var dunning = failN > 0 && failN < 4 && cut - lastFailTs < 2 * DAY ? (4 - failN) / 3 : 0; // still inside the 24h-retry window
      if (money === 'net') { for (k = 0; k < rs.length && rs[k].ts < limit; k++) observed -= rs[k].amount_usd; for (k = 0; k < ds.length && ds[k].ts < limit; k++) observed -= ds[k].amount_usd + ds[k].fee_usd; }
      if (isPayer) payersObs++;
      var tEnd = t.ts + P.trialDays * DAY, horizon = a + N * DAY;
      if (horizon <= cut) continue; // fully observed for this user
      if (t.cancelled_ts && t.cancelled_ts <= cut) continue;
      nUsers++;
      var exp = 0, v = 0, ff, uf = offUsers ? offUsers[u.user_id] : null;
      if (uf && typeof uf.expected_future_usd === 'number') { // offline user-level model (Cox / RSF): E[future revenue to users_horizon_days], linear in the horizon still ahead; variance from p_churn_30
        var ageGen = Math.max(0, (offGen - a) / DAY), scale = clamp((N - ageGen) / Math.max(offH - ageGen, 1), 0, 1);
        exp = Math.max(0, uf.expected_future_usd) * scale; v = exp * exp * clamp(uf.p_churn_30 !== undefined && uf.p_churn_30 !== null ? +uf.p_churn_30 : 0.3, 0.05, 1); covered++;
      } else if (tEnd > cut || (!lastOk && !failedFirst && cs.length === 0)) { // pending trial: P(rebill | not cancelled so far)
        if (tEnd <= horizon) {
          var phi = clamp((cut - t.ts) / (P.trialDays * DAY), 0, 1), gone = f.cancelShare * (f.cancel20Share + (1 - f.cancel20Share) * phi);
          var pc = clamp(p1 / Math.max(1 - gone, 0.05), 0.005, 0.99);
          ff = futureFrom(f, P, 1, N, sc); var R = P.price + ff.mean + f.packPerPayer; exp = pc * R; v = pc * (R * R + ff.var) - exp * exp; if (!isPayer) payersExp += pc; // pending rebills under the same payer definition
        }
      } else if (lastOk > 0) {
        var due = tEnd + lastOk * P.periodDays * DAY; // next renewal
        var pAlive = due > cut ? 1 : dunning * rAt(f, lastOk + 1, sc) * 0.3;
        if (pAlive > 0) { ff = futureFrom(f, P, lastOk, N, sc); exp = pAlive * ff.mean; v = pAlive * (ff.mean * ff.mean + ff.var) - exp * exp; }
      } else if (failedFirst && dunning > 0) { // first rebill failed, retries left
        ff = futureFrom(f, P, 1, N, sc); var R2 = P.price + ff.mean, pr = f.pRecover * dunning; exp = pr * R2; v = pr * (R2 * R2 + ff.var) - exp * exp; if (!isPayer) payersExp += pr;
      }
      future += exp * nm; fvar += Math.max(0, v) * nm * nm;
      relErr2 += exp * exp * ((1 - p1) / (p1 * Math.max(f.n_eff, 1)) + 1 / Math.max(f.atRisk || 0, 20));
    }
    var sd = Math.sqrt(fvar + relErr2), mid = observed + future;
    var lo = Math.max(observed, mid - Z80 * sd), hi = mid + Z80 * sd;
    return { mid: mid, lo: lo, hi: hi, roas: ratio(mid, row.spend), roasLo: ratio(lo, row.spend), roasHi: ratio(hi, row.spend),
      payers_expected: payersObs + payersExp, basis: 'predicted', observed: observed, offset: N, trials: row.trials, signups: row.signups, spend: row.spend, maturedOnly: false, pendingUsers: nUsers,
      priorShare: psN ? psSum / psN : 0, model: fit.model, coverage: offUsers ? (nUsers ? covered / nUsers : null) : undefined };
  };

  /** Predictions for many rows. opts: {offsets?, money, signalDay, scenario, targetRoas=1, data}
   *  → [{key, label, byOffset:{N: prediction}, payback_day, verdict, age_days}] */
  BB.predict.rows = function (rows, opts) {
    opts = opts || {};
    var offsets = opts.offsets || BB.OFFSETS, target = +(opts.targetRoas || 1), now = (opts.data || _cache || BB.load()).now;
    return rows.map(function (r) {
      var out = { key: r.key, label: r.label, byOffset: {}, payback_day: null, verdict: '', trials: r.trials, spend: r.spend,
        age_days: r.bucketStart ? Math.floor((now - r.bucketStart) / DAY) : null };
      offsets.forEach(function (N) {
        var p = BB.predict.cohort(r, Object.assign({}, opts, { offset: N }));
        out.byOffset[N] = p;
        if (out.payback_day === null && p.roas !== null && p.roas >= target) out.payback_day = N;
      });
      if (r.trials < 10) out.verdict = BB.t('Not enough data');
      else if (out.payback_day !== null) out.verdict = BB.t('Pays back by D{n}', { n: out.payback_day });
      else out.verdict = BB.t('No payback by D{n}', { n: offsets[offsets.length - 1] });
      return out;
    });
  };

  /** ROAS curve 0..360 for one row. opts as cohort + {days?: [...]} → [{day, roas, roasLo, roasHi, rev, basis}] */
  BB.predict.curve = function (row, opts) {
    opts = opts || {};
    var days = opts.days || (function () { var d = []; for (var i = 0; i <= 360; i += (i < 30 ? 1 : i < 120 ? 3 : 10)) d.push(i); if (d[d.length - 1] !== 360) d.push(360); return d; })();
    var data = opts.data || _cache || BB.load(), now = data.now, basis = row.basis || 'signup';
    return days.map(function (day) {
      var p = BB.predict.cohort(row, Object.assign({}, opts, { offset: day }));
      // a day is "actual" when every user of the row has lived that long
      var allMature = row.bucketEnd ? (startOfDay(now) - Math.min(row.bucketEnd - DAY, startOfDay(now))) >= day * DAY : p.basis === 'actual';
      return { day: day, roas: p.roas, roasLo: p.roasLo, roasHi: p.roasHi, rev: p.mid, basis: allMature && (opts.signalDay === undefined || opts.signalDay === 'all') ? 'actual' : 'predicted' };
    });
  };

  /** Backtest: predict targetDay revenue from data available at signalDay for cohorts ≥ 60 days old.
   *  {data, state?, signalDay=3, targetDay=30, step='week', minTrials=20} → {perSegment:[{segment, n, mape, bias}], overall:{n, mape, bias}, rows} */
  BB.predict.backtest = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data; if (!data._indexed) BB.index(data);
    var st = Object.assign({}, o.state || {}, { preset: 'all' }); delete st.groupBy;
    var sig = o.signalDay || 3, tgt = o.targetDay || 30, step = o.step || 'week', minTrials = o.minTrials || 20, money = (o.state && o.state.money) || 'gross';
    var modelId = BB.predict.modelOf(o), holdout = !!o.holdout, cutoffDays = +(o.cutoffDays || 60), testDays = +(o.testDays || 90), minTrainDays = +(o.minTrainDays || 30);
    var f = BB.filter(data, st), now = data.now, cutoff = startOfDay(now) - cutoffDays * DAY, testFrom = cutoff - testDays * DAY, trainUntil = null, fitH = null, empty = false;
    if (holdout) { // out-of-sample: fit "as of testFrom" (users anchored before it, events before it); test cohorts anchored in [testFrom, cutoff) with actuals to date
      var first = null; data.users.forEach(function (u) { var a = anchorOf(u, f.basis); if (a !== null && u._trial && (first === null || a < first)) first = a; });
      if (first !== null && testFrom < startOfDay(first) + minTrainDays * DAY) testFrom = startOfDay(first) + minTrainDays * DAY; // short history: shrink the test window so the training set has ≥ minTrainDays
      trainUntil = testFrom;
      if (testFrom >= cutoff) empty = true; else { fitH = BB.predict.fitHoldout(data, modelId, trainUntil, f.basis); empty = !!fitH.empty; }
    }
    var old = empty ? [] : f.users.filter(function (u) { var a = anchorOf(u, f.basis); return a !== null && a < cutoff && (!holdout || a >= testFrom) && u._trial; });
    var bySeg = groupMap(old, function (u) { return segKey(u._trial.plan, u.geo_tier); });
    var rows = [], per = [];
    function evalGroup(name, users) {
      var byB = groupMap(users, function (u) { return BB.bucket(anchorOf(u, f.basis), step); }), errs = [];
      byB.forEach(function (us, k) {
        var r = buildRow({ key: k, label: BB.bucketLabel(k, step), users: us, spendAgg: null, offsets: [tgt], basis: f.basis, now: now, index: f.index, money: money, payer: st.payer,
          bucketStart: BB.bucketStart(k, step), bucketEnd: BB.bucketEnd(k, step) });
        r.basis = f.basis;
        if (r.trials < minTrials || !r.byOffset[tgt].mature) return;
        var actual = money === 'net' ? r.byOffset[tgt].rev_net : r.byOffset[tgt].rev_gross; if (actual <= 0) return;
        var p = BB.predict.cohort(r, { offset: tgt, money: money, signalDay: sig, data: data, model: modelId, _fit: fitH });
        errs.push((p.mid - actual) / actual);
        rows.push({ segment: name, key: k, label: r.label, trials: r.trials, actual: actual, predicted: p.mid, lo: p.lo, hi: p.hi, err: (p.mid - actual) / actual, inBand: actual >= p.lo - 1e-9 && actual <= p.hi + 1e-9 });
      });
      if (!errs.length) return null;
      return { segment: name, n: errs.length, mape: sum(errs, Math.abs) / errs.length, bias: sum(errs) / errs.length };
    }
    bySeg.forEach(function (us, k) { var r = evalGroup(k, us); if (r) per.push(r); });
    per.sort(function (a, b) { return b.n - a.n; });
    var overallErrs = rows.map(function (r) { return r.err; });
    var overall = overallErrs.length ? { n: overallErrs.length, mape: sum(overallErrs, Math.abs) / overallErrs.length, bias: sum(overallErrs) / overallErrs.length } : { n: 0, mape: null, bias: null };
    var out = { perSegment: per, overall: overall, rows: rows, signalDay: sig, targetDay: tgt, model: fitH ? fitH.model : BB.predict.fit(data, modelId).model };
    if (holdout) { out.holdout = true; out.cutoff = cutoff; out.cutoffDays = cutoffDays; out.testFrom = testFrom; out.trainUntil = trainUntil; out.testDays = Math.round((cutoff - testFrom) / DAY); out.empty = empty; overall.coverage80 = rows.length ? rows.filter(function (r) { return r.inBand; }).length / rows.length : null;
      var mm = MODEL_BY_ID[modelId]; out.inSample = !!(mm && mm.kind === 'offline' && BB.predict.offline.usable(modelId) && !BB.predict.offline.status(modelId).train_cutoff); } // offline file trained on everything → its curve is in-sample for these cohorts
    return out;
  };

  /** Bid calculator. {row, targetRoas=1, horizon=90, margin=0, money, scenario, data}
   *  → {maxCpt, maxCpi, currentCpt, currentCpi, headroomPct, verdict, pLtvPerTrial, pRoas} */
  BB.predict.maxCpt = function (o) {
    var r = o.row, target = +(o.targetRoas || 1), N = +(o.horizon || 90), margin = +(o.margin || 0);
    var p = BB.predict.cohort(r, { offset: N, money: o.money, scenario: o.scenario, data: o.data, signalDay: o.signalDay, model: o.model });
    var ltvT = ratio(p.mid, p.trials), ltvU = ratio(p.mid, p.signups); // p.trials / p.signups = the users `mid` covers (matured slice when the row is only partly aged)
    var maxCpt = ltvT === null ? null : ltvT / target * (1 - margin), maxCpi = ltvU === null ? null : ltvU / target * (1 - margin);
    var cpt = ratio(r.spend, r.trials), cpi = ratio(r.spend, r.signups);
    var head = (maxCpt !== null && cpt) ? (maxCpt - cpt) / cpt : null, verdict;
    if (r.trials < 10) verdict = BB.t('Not enough data');
    else if (head === null) verdict = BB.t('No spend');
    else if (head > 0.15) verdict = BB.t('Raise budget');
    else if (head < -0.15) verdict = BB.t('Lower bid / pause');
    else verdict = BB.t('Hold');
    return { maxCpt: maxCpt, maxCpi: maxCpi, currentCpt: cpt, currentCpi: cpi, headroomPct: head === null ? null : head * 100, verdict: verdict, pLtvPerTrial: ltvT, pRoas: p.roas, pRoasLo: p.roasLo, pRoasHi: p.roasHi, horizon: N };
  };

  /** Expected LTV of one *new* trial of plan P at horizon N under segment fit f: intro + p1 × (price + E[renewals to N] + packs). Unconditional on cancellation (a trial that has just started). */
  function trialValue(f, P, N, sc) { sc = sc || scenarioOf(null); var p1 = clamp(f.p1 + (sc.firstRebillDelta || 0), 0.005, 0.99), ff = futureFrom(f, P, 1, N, sc); return (P.intro || 0) + p1 * (P.price + ff.mean + f.packPerPayer); }
  /** Plan-mix table (Vlad v2): share of trials per plan for every value of `dim` (paywall | campaign | channel | geo_tier …) in the filtered range, and the expected pLTV per trial of that mix
   *  = Σ share_plan × pLTV_plan(N), where pLTV_plan is the plan-level segment's trialValue (or the plan|tier|channel segment when `bySegment`).
   *  {data, state, dim='paywall', horizon=180, model, scenario, minTrials=1} → {rows:[{key, label, trials, mix:[{plan, trials, share, ltvPerTrial}], ltvPerTrial}], plans:{plan: ltvPerTrial}, horizon, model}
   *  What-if "mix of paywall X on campaign Y": BB.predict.mixLtv(res, res.rows[X].mix) — the plan values are the same, only the shares change. */
  BB.predict.planMix = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data, f = BB.filter(data, Object.assign({}, o.state || {}, { groupBy: null })), dim = o.dim || 'paywall', N = +(o.horizon || 180);
    var modelId = BB.predict.modelOf(o), fit = BB.predict.fit(data, modelId), sc = scenarioOf(o), minTrials = o.minTrials || 1;
    var plans = {}, by = new Map();
    f.users.forEach(function (u) { var t = u._trial; if (!t || !BB.PLAN_BY_ID[t.plan]) return; var a = anchorOf(u, f.basis); if (a === null || a < f.range.from || a >= f.range.to) return;
      var key = dim === 'paywall' ? (t.paywall || u.paywall || 'none') : dim === 'plan' ? t.plan : (u[dim] === undefined || u[dim] === null ? 'none' : String(u[dim]));
      var g = by.get(key) || { key: key, trials: 0, byPlan: {} }; g.trials++; g.byPlan[t.plan] = (g.byPlan[t.plan] || 0) + 1; by.set(key, g);
      if (plans[t.plan] === undefined) { var fs = fit.segments[t.plan] || fit.segments.all; plans[t.plan] = fs ? trialValue(fs, BB.PLAN_BY_ID[t.plan], N, sc) : null; } });
    var rows = Array.from(by.values()).filter(function (g) { return g.trials >= minTrials; }).map(function (g) {
      var mix = Object.keys(g.byPlan).map(function (p) { return { plan: p, trials: g.byPlan[p], share: g.byPlan[p] / g.trials, ltvPerTrial: plans[p] }; }).sort(function (a, b) { return b.trials - a.trials; });
      return { key: g.key, label: g.key, trials: g.trials, mix: mix, ltvPerTrial: BB.predict.mixLtv({ plans: plans }, mix) };
    }).sort(function (a, b) { return b.trials - a.trials; });
    return { rows: rows, plans: plans, horizon: N, model: fit.model, dim: dim };
  };
  BB.predict.mixLtv = function (res, mix) { var v = 0, w = 0; mix.forEach(function (x) { var p = res.plans[x.plan]; if (p !== null && p !== undefined) { v += x.share * p; w += x.share; } }); return w > 0 ? v / w : null; };
  BB.predict.trialValue = function (data, planId, opts) { opts = opts || {}; var fit = BB.predict.fit(data, BB.predict.modelOf(opts)), P = BB.PLAN_BY_ID[planId]; if (!P) return null; var key = opts.segment || planId, f = fit.segments[key] || fit.segments[planId] || fit.segments.all; return f ? trialValue(f, P, +(opts.horizon || 180), scenarioOf(opts)) : null; };

  /** Fitted survival curves per segment with observed points.
   *  → [{segment, plan, geo_tier, n, payers, p1, alpha, beta, fallback, curveFrom, period, price, points:[{k, day, fitted, observed|null, atRisk}]}] */
  BB.predict.segments = function (data, opts) {
    opts = opts || {};
    var fit = BB.predict.fit(data || _cache || BB.load(), BB.predict.modelOf(opts)), out = [];
    Object.keys(fit.segments).forEach(function (k) {
      var f = fit.segments[k], parts = k.split('|'), plan = parts[0], P = BB.PLAN_BY_ID[plan];
      if (!P) return; // 'all' aggregate skipped
      var K = P.period === 'month' ? 12 : 26, surv = 1, obsSurv = 1, pts = [];
      for (var kk = 1; kk <= K; kk++) {
        if (kk > 1) surv *= f.r(kk); // active model's retention (sBG: (β+k−1)/(α+β+k−1))
        var ob = f.obs[kk], observed = null;
        if (kk === 1) observed = 1; else if (ob && ob.n >= 5 && obsSurv !== null) { obsSurv *= ob.s / ob.n; observed = obsSurv; } else obsSurv = null;
        pts.push({ k: kk, day: P.trialDays + (kk - 1) * P.periodDays, fitted: surv, observed: observed, atRisk: ob ? ob.n : 0 });
      }
      out.push({ segment: k, plan: plan, geo_tier: parts[1] || 'all', channel: parts[2] || 'all', n: f.n, payers: f.payers, p1: f.p1, p1_all: f.p1_all, p1_hl: f.p1_hl, priorShare: f.params && f.params.priorShare ? f.params.priorShare : 0, censored: f.censored || 0, alpha: f.alpha, beta: f.beta, fallback: f.fallback, curveFrom: f.curveFrom,
        period: P.period, price: P.price, refundRate: f.refundRate, disputeRate: f.disputeRate, feePct: f.feePct, points: pts, model: fit.model, params: f.params || null, diag: f.diag || null, atRisk: f.atRisk });
    });
    return out.sort(function (a, b) { return b.n - a.n; });
  };

  /** Channel budget allocator. {data, state, budget (daily, USD), targetRoas=1, horizon=90, money, step=5}
   *  Diminishing-returns curve per channel trials = A · spend^b fitted on daily history (log-log OLS, b ∈ [0.45, 1]); pLTV per trial at `horizon` from BB.predict.cohort on the channel breakdown row;
   *  greedy allocation in $`step` increments to the channel with the highest marginal pROAS while it stays ≥ targetRoas (capacity ≤ 2.5× current daily spend, web2web 1.5×).
   *  → {channels:[{channel, label, current, currentTrials, currentCpt, recommended, expectedTrials, expectedCpt, pRoas, marginalRoas, ltvPerTrial, ltvLo, ltvHi, a, b, cap, delta, verdict}], budget, allocated, unallocated, pRoasBlended, currentRoas, targetRoas, horizon} */
  BB.predict.allocate = function (o) {
    var st = Object.assign({}, o.state || {}, { channel: 'all', groupBy: null }), data = o.data._filtered ? o.data.raw : o.data, f = BB.filter(data, st);
    var budget = +(o.budget || 0), target = +(o.targetRoas || 1), N = +(o.horizon || 90), money = o.money || st.money || 'gross', step = o.step || 5;
    var days = Math.max(1, Math.ceil((f.range.to - f.range.from) / DAY));
    var bd = BB.breakdown({ data: f, state: st, dim: 'channel', offsets: [0, N], topN: 10 });
    var out = [];
    BB.CHANNELS.forEach(function (c) {
      if (c.id === 'organic') return;
      var row = bd.rows.filter(function (r) { return r.key === c.id; })[0]; if (!row || !(row.spend > 0)) return;
      var byDay = new Map();
      f.spend.forEach(function (r) { if (r.channel !== c.id) return; var k = r.date, d = byDay.get(k); if (!d) { d = { spend: 0, trials: 0 }; byDay.set(k, d); } d.spend += r.spend_usd; });
      row._users.forEach(function (u) { if (!u._trial) return; var k = isoDate(u._trial.ts), d = byDay.get(k); if (d) d.trials++; });
      var xs = [], ys = []; byDay.forEach(function (d) { if (d.spend > 1 && d.trials > 0) { xs.push(Math.log(d.spend)); ys.push(Math.log(d.trials)); } });
      var b = 0.8, A, fitted = xs.length >= 5, mx = 0, my = 0;
      if (fitted) { mx = sum(xs) / xs.length; my = sum(ys) / ys.length; var sxy = 0, sxx = 0; for (var i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); } b = clamp(sxx > 0 ? sxy / sxx : 0.8, 0.45, 1); }
      if (c.id === 'web2web') b = Math.max(b, 0.9); // CPA deals scale almost linearly
      A = fitted ? Math.exp(my - b * mx) : (row.trials / days) / Math.pow(row.spend / days, b); // intercept for the final b (least squares given b)
      var p = BB.predict.cohort(row, { offset: N, money: money, data: data, model: o.model });
      var ltvT = ratio(p.mid, p.trials), cur = row.spend / days; // pLTV per trial over the trials `mid` covers (item 6)
      out.push({ channel: c.id, label: BB.lbl(c), color: c.color, current: cur, currentTrials: row.trials / days, currentCpt: ratio(row.spend, row.trials), a: A, b: b, cap: cur * (c.id === 'web2web' ? 1.5 : 2.5),
        ltvPerTrial: ltvT, ltvLo: ratio(p.lo, p.trials), ltvHi: ratio(p.hi, p.trials), trials: row.trials, recommended: 0 });
    });
    var marginal = function (ch, x) { return ch.ltvPerTrial === null ? 0 : ch.a * ch.b * Math.pow(Math.max(x, step) + step / 2, ch.b - 1) * ch.ltvPerTrial; };
    var left = budget, guard = 0, atTarget = 0;
    out.forEach(function (ch) { ch.recommendedAtTarget = 0; });
    while (left >= step && guard++ < 100000) { // greedy by marginal pROAS; capacity-capped; the part allocated while marginal ≥ target is tracked separately
      var best = null, bm = -1;
      out.forEach(function (ch) { if (ch.recommended + step > ch.cap) return; var m = marginal(ch, ch.recommended); if (m > bm) { bm = m; best = ch; } });
      if (!best) break;
      best.recommended += step; left -= step;
      if (bm >= target) { best.recommendedAtTarget += step; atTarget += step; }
    }
    var tot = 0, rev = 0, curRev = 0, curSp = 0;
    out.forEach(function (ch) {
      ch.expectedTrials = ch.a * Math.pow(ch.recommended, ch.b); ch.expectedCpt = ratio(ch.recommended, ch.expectedTrials);
      ch.pRoas = ch.ltvPerTrial !== null && ch.recommended > 0 ? ch.expectedTrials * ch.ltvPerTrial / ch.recommended : null; ch.marginalRoas = marginal(ch, ch.recommended);
      ch.delta = ch.current > 0 ? ch.recommended / ch.current - 1 : null;
      ch.verdict = ch.trials < 30 ? BB.t('Not enough data') : ch.delta === null ? '—' : ch.delta > 0.15 ? BB.t('Increase budget') : ch.delta < -0.15 ? BB.t('Decrease budget') : BB.t('Hold');
      tot += ch.recommended; if (ch.ltvPerTrial !== null) { rev += ch.expectedTrials * ch.ltvPerTrial; curRev += ch.a * Math.pow(ch.current, ch.b) * ch.ltvPerTrial; } curSp += ch.current;
    });
    out.sort(function (x, y) { return y.recommended - x.recommended; });
    return { channels: out, budget: budget, allocated: tot, allocatedAtTarget: atTarget, unallocated: Math.max(0, budget - tot), belowTarget: atTarget < tot, pRoasBlended: ratio(rev, tot), currentRoas: ratio(curRev, curSp), currentSpend: curSp, targetRoas: target, horizon: N, days: days, money: money };
  };

  /** pMRR forward. {data, state, days=90, trialsPerDay?} → [{day, date (YYYY-MM-DD), mrr, mrrLo, mrrHi, activeSubs, fromExisting, fromPending, fromNew, basis:'actual'|'predicted'}].
   *  Existing paid subs survive renewal by renewal with the segment sBG curve; trialing subs convert with the segment p1; new trials keep coming at the last-14-days rate (filters applied) and convert with the 'all' segment. */
  BB.predict.mrrForward = function (o) {
    var data = o.data._filtered ? o.data.raw : o.data; if (!data._indexed) BB.index(data);
    var st = o.state || {}, days = +(o.days || 90), now = data.now, modelId = BB.predict.modelOf(o), fit = BB.predict.fit(data, modelId), ix = data.index, sc = scenarioOf(o);
    var users = usersOk(data, st), subs = [], pend = [], recentTrials = 0, recentByPlan = {};
    users.forEach(function (u) {
      var sb = u._sub, t = u._trial; if (!sb || !t) return;
      var P = BB.PLAN_BY_ID[sb.plan] || BB.PLAN_BY_ID[t.plan]; if (!P) return;
      var f = segFor(fit, u) || fit.segments.all;
      if (t.ts >= now - 14 * DAY) { recentTrials++; recentByPlan[t.plan] = (recentByPlan[t.plan] || 0) + 1; }
      if (sb.status === 'active' || sb.status === 'past_due') subs.push({ f: f, P: P, k: sb.renewals, due: sb.current_period_end, mrr: sb.mrr_usd || mrrOf(P.id), pastDue: sb.status === 'past_due' });
      else if (sb.status === 'trialing') pend.push({ f: f, P: P, tEnd: trialEndOf(t), mrr: mrrOf(t.plan) });
    });
    var defP = null, defN = -1; Object.keys(recentByPlan).forEach(function (pl) { if (BB.PLAN_BY_ID[pl] && recentByPlan[pl] > defN) { defN = recentByPlan[pl]; defP = BB.PLAN_BY_ID[pl]; } }); defP = defP || BB.PLANS[0];
    var tpd = o.trialsPerDay !== undefined ? +o.trialsPerDay : recentTrials / 14, fAll = fit.segments.all, newMrr = defP ? mrrOf(defP.id) : 0, p1New = fAll ? fAll.p1 : 0.3;
    var newMix = [{ share: 1, f: fAll, trialDays: defP ? defP.trialDays : 3, periodDays: defP ? defP.periodDays : 7, mrr: newMrr, p1: p1New }]; // default: the dominant plan of the last 14 days (catalogue's first plan when there are none)
    if (MODEL_BY_ID[fit.model] && MODEL_BY_ID[fit.model].planMix && recentTrials > 0) newMix = Object.keys(recentByPlan).map(function (pl) { var P = BB.PLAN_BY_ID[pl], fs = fit.segments[pl] || fAll; return P && fs ? { share: recentByPlan[pl] / recentTrials, f: fs, trialDays: P.trialDays, periodDays: P.periodDays, mrr: mrrOf(pl), p1: fs.p1 } : null; }).filter(Boolean); // vlad_v2: observed plan mix of the last 14 days
    var out = [], d;
    for (d = 0; d <= days; d++) {
      var date = now + d * DAY, mrr = 0, v = 0, n = 0, ex = 0, pe = 0, nw = 0, i, k, p, due;
      for (i = 0; i < subs.length; i++) {
        var s = subs[i]; p = s.pastDue ? 0.35 : 1; k = s.k; due = s.due;
        while (due <= date) { k++; p *= rAt(s.f, Math.max(k, 2), sc); due += s.P.periodDays * DAY; }
        mrr += p * s.mrr; v += p * (1 - p) * s.mrr * s.mrr; n += p; ex += p * s.mrr;
      }
      for (i = 0; i < pend.length; i++) {
        var q = pend[i]; if (q.tEnd > date) continue;
        p = clamp(q.f.p1 + (sc.firstRebillDelta || 0), 0.005, 0.99); k = 1; due = q.tEnd + q.P.periodDays * DAY;
        while (due <= date) { k++; p *= rAt(q.f, k, sc); due += q.P.periodDays * DAY; }
        mrr += p * q.mrr; v += p * (1 - p) * q.mrr * q.mrr; n += p; pe += p * q.mrr;
      }
      if (fAll && tpd > 0) for (var sD = 1; sD <= d; sD++) for (var mi = 0; mi < newMix.length; mi++) { // trials started on future day sD, per plan of the mix (default: 3-day trial, weekly plan as the blend)
        var mx = newMix[mi], age = d - sD; if (age < mx.trialDays) continue;
        p = clamp(mx.p1 + (sc.firstRebillDelta || 0), 0.005, 0.99); k = 1;
        for (var r = mx.trialDays + mx.periodDays; r <= age; r += mx.periodDays) { k++; p *= rAt(mx.f, k, sc); }
        var tp = tpd * mx.share, e = tp * p; mrr += e * mx.mrr; v += tp * p * (1 - p) * mx.mrr * mx.mrr; n += e; nw += e * mx.mrr;
      }
      var sd = Math.sqrt(v);
      out.push({ day: d, date: isoDate(date), mrr: mrr, mrrLo: Math.max(0, mrr - Z80 * sd), mrrHi: mrr + Z80 * sd, activeSubs: n, fromExisting: ex, fromPending: pe, fromNew: nw, basis: d === 0 ? 'actual' : 'predicted' });
    }
    if (modelId === 'arima' && BB.predict.offline.usable('arima')) { // offline time-series forecast of MRR: level + band from the file, components scaled from the sBG path; day 0 stays actual
      var j = BB.predict.offline.get('arima'), ser = j && j.series && Array.isArray(j.series.mrr) ? j.series.mrr : null;
      if (ser && ser.length) {
        var byDay = {}; ser.forEach(function (pt) { if (pt && typeof pt.day === 'number') byDay[pt.day] = pt; });
        var lastPt = null;
        out.forEach(function (row) {
          if (row.day === 0) return;
          var pt = byDay[row.day] || lastPt; if (!pt) return; lastPt = pt;
          var k = row.mrr > 0 ? pt.mean / row.mrr : 1;
          row.mrr = pt.mean; row.mrrLo = Math.max(0, pt.lo !== undefined ? pt.lo : pt.mean); row.mrrHi = pt.hi !== undefined ? pt.hi : pt.mean;
          row.fromExisting *= k; row.fromPending *= k; row.fromNew *= k; row.model = 'arima';
        });
      }
    }
    return out;
  };

  /* ───────────────────────── Validation: is the data right, is the analysis right ───────────────────────── */
  function chk(id, level, label, detail, n, fields) { return { id: id, level: level, label: label, detail: detail, n: n || 0, fields: fields || [] }; }
  var LEVEL_RANK = { ok: 0, warn: 1, fail: 2 };
  function worstLevel(list) { var w = 'ok'; list.forEach(function (c) { if (LEVEL_RANK[c.level] > LEVEL_RANK[w]) w = c.level; }); return w; }
  function segLabel(key) { return key === 'all' ? BB.t('all') : key.split('|').map(function (p, i) { return i === 2 && BB.CHANNEL_BY_ID[p] ? BB.lbl(BB.CHANNEL_BY_ID[p]) : p; }).join(' · '); }
  function ensureStats(data) { if (!data._segStats) BB.predict.fit(data, 'sbg'); return data._segStats; }

  /** 3.1 Input checks — same for every model, cached per dataset. → [{id, level:'ok'|'warn'|'fail', label, detail, n, fields}] */
  BB.predict.inputChecks = function (data) {
    if (data._filtered) data = data.raw; if (!data._indexed) BB.index(data);
    syncCfg(data);
    if (data._inputChecks) return data._inputChecks;
    var now = data.now, ix = data.index, out = [], S = ensureStats(data);
    var badNA = 0; data.charges.forEach(function (c) { if ((c.type === 'rebill' || c.type === 'renewal') && (c.n === null || c.n === undefined || c.attempt === null || c.attempt === undefined)) badNA++; });
    out.push(chk('charges_n_attempt', badNA ? 'fail' : 'ok', BB.t('Renewal index and attempt number on charges'), badNA ? BB.t('{n} rebill/renewal without renewal index or attempt number', { n: BB.plural(badNA, 'charge|charges') }) : BB.t('All rebill/renewal charges carry a renewal index and attempt number'), badNA, ['charges.n', 'charges.attempt']));
    var futureN = 0; [data.charges, data.trials, data.refunds].forEach(function (tb) { tb.forEach(function (x) { if (x.ts > now + HOUR) futureN++; }); });
    out.push(chk('future_ts', futureN ? 'fail' : 'ok', BB.t('No timestamps in the future'), futureN ? BB.t('{n} later than “now” + 1 h', { n: BB.plural(futureN, 'event|events') }) : BB.t('No charge, trial or refund later than “now”'), futureN, ['charges.ts', 'trials.ts', 'refunds.ts']));
    var planBad = {}; data.trials.forEach(function (t) { if (!BB.PLAN_BY_ID[t.plan]) planBad[t.plan] = (planBad[t.plan] || 0) + 1; });
    var pbKeys = Object.keys(planBad);
    out.push(chk('plan_catalogue', pbKeys.length ? 'fail' : 'ok', BB.t('Trial plans exist in the catalogue'), pbKeys.length ? BB.t('Unknown plans: {list}', { list: pbKeys.join(', ') }) : BB.t('All trial plans found in the catalogue ({n})', { n: BB.PLANS.length }), pbKeys.length, ['trials.plan', 'BB.PLANS']));
    var payers = 0, gaps = 0, trialBad = 0, perGaps = {}, noChannel = 0, trialUsers = 0;
    data.users.forEach(function (u) {
      var t = u._trial; if (!t) return; trialUsers++;
      if (!u.channel || u._channel_derived) noChannel++; // _channel_derived = no attribution signal at all (index fell back to organic)
      var P = BB.PLAN_BY_ID[t.plan]; if (!P) return;
      var cs = ix.chargesByUser.get(u.user_id) || [], okN = {}, okTs = {}, i;
      for (i = 0; i < cs.length; i++) { var c = cs[i]; if (c.status === 'succeeded' && (c.type === 'rebill' || c.type === 'renewal') && !c.is_winback && !okN[c.n]) { okN[c.n] = true; okTs[c.n] = c.ts; } }
      if (!okN[1]) return; payers++;
      var gap = false, ks = Object.keys(okN).map(Number).sort(function (a, b) { return a - b; });
      ks.forEach(function (k) { if (k >= 2) { if (!okN[k - 1]) gap = true; else (perGaps[t.plan] = perGaps[t.plan] || []).push((okTs[k] - okTs[k - 1]) / DAY); } });
      if (gap) gaps++;
      if (Math.abs(okTs[1] - (t.ts + P.trialDays * DAY)) > 2 * DAY) trialBad++;
    });
    var gapShare = payers ? gaps / payers : 0;
    out.push(chk('renewal_gaps', gapShare > 0.02 ? 'fail' : gapShare > 0.005 ? 'warn' : 'ok', BB.t('Renewal index is contiguous'), payers ? BB.t('{n} of {total} ({pct} %) have renewal k without a succeeded k−1', { n: BB.plural(gaps, 'payer|payers'), total: payers, pct: (gapShare * 100).toFixed(1) }) : BB.t('No payers'), gaps, ['charges.n', 'charges.status']));
    var tbShare = payers ? trialBad / payers : 0;
    out.push(chk('trial_len', tbShare > 0.05 ? 'fail' : tbShare > 0.01 ? 'warn' : 'ok', BB.t('Trial length matches the catalogue'), payers ? BB.t('{n} ({pct} %) have the 1st rebill more than 2 days from the catalogue trial end', { n: BB.plural(trialBad, 'payer|payers'), pct: (tbShare * 100).toFixed(1) }) : BB.t('No payers'), trialBad, ['trials.ts', 'PLANS.trialDays', 'charges.ts (n=1)']));
    var perBad = [];
    Object.keys(perGaps).forEach(function (pl) { var P = BB.PLAN_BY_ID[pl], med = median(perGaps[pl].slice()); if (P && med !== null && Math.abs(med - P.periodDays) > 1) perBad.push(BB.t('{plan}: median {med} d instead of {exp}', { plan: pl, med: med.toFixed(1), exp: P.periodDays })); });
    out.push(chk('period_len', perBad.length ? 'fail' : 'ok', BB.t('Renewal interval matches the plan'), perBad.length ? perBad.join('; ') : BB.t('Median renewal interval matches the plan period ({n})', { n: BB.plural(Object.keys(perGaps).length, 'plan|plans') }), perBad.length, ['charges.ts', 'PLANS.periodDays']));
    var allRisk = S.all ? sumNum(S.all.obs) : 0, thinPT = Object.keys(S).filter(function (k) { return k.split('|').length === 2 && sumNum(S[k].obs) < MIN_SEG; });
    out.push(chk('at_risk_volume', allRisk < MIN_SEG ? 'fail' : thinPT.length ? 'warn' : 'ok', BB.t('Renewals at risk'), allRisk < MIN_SEG ? BB.t('Only {n} renewals at risk (< {min}) — curve not estimated', { n: allRisk, min: MIN_SEG }) : thinPT.length ? BB.t('{n} plan × geo thinner than {min}: {list}', { n: BB.plural(thinPT.length, 'segment|segments'), min: MIN_SEG, list: thinPT.map(segLabel).join(', ') }) : BB.t('{n} renewals at risk, every plan × geo segment ≥ {min}', { n: allRisk, min: MIN_SEG }), allRisk, ['obs[k].n']));
    var censBad = 0, censN = 0, censDue = 0, censInc = 0, wins = incidentWindows(data); // recount the at-risk observations of `all` independently of segStats and flag any whose due date is inside GRACE
    data.users.forEach(function (u) { var t = u._trial; if (!t) return; var P = BB.PLAN_BY_ID[t.plan]; if (!P) return; var tEnd = t.ts + P.trialDays * DAY; if (tEnd > now) return;
      var cs = ix.chargesByUser.get(u.user_id) || [], okN = {}; for (var i = 0; i < cs.length; i++) if (cs[i].status === 'succeeded' && (cs[i].type === 'rebill' || cs[i].type === 'renewal')) okN[cs[i].n] = true;
      if (!okN[1]) return; for (var k2 = 2; k2 <= 60 && okN[k2 - 1]; k2++) { var due = tEnd + (k2 - 1) * P.periodDays * DAY; if (due > now - GRACE) { if (okN[k2]) censDue++; break; } if (wins.length && inIncident(wins, due)) { censInc++; if (okN[k2]) continue; else break; } censN++; if (due > now - GRACE) censBad++; } });
    var censOk = censBad === 0 && censN === allRisk;
    out.push(chk('incidents', wins.length ? 'warn' : 'ok', BB.t('Incident windows'), wins.length ? BB.t('{n}: {c} censored (not evidence about churn) — {list}', { n: BB.plural(wins.length, 'incident window|incident windows'), c: BB.plural(censInc, 'at-risk renewal|at-risk renewals'), list: wins.map(function (w) { return isoDate(w.from) + '…' + isoDate(w.to) + (w.reason ? ' ' + w.reason : ''); }).join('; ') }) : BB.t('No incident windows declared (data.incidents[]); every renewal counts as evidence'), censInc, ['incidents.from', 'incidents.to', 'incidents.reason']));
    var sa = S.all, p1r = sa ? (sa.wOk + 0.5) / (sa.wTrials + 1) : null, p1a = sa ? (sa.firstRebillOk + 0.5) / (sa.trialsEnded + 1) : null, hlD = sa ? sa.p1hl : hashCfg().p1hl;
    var drift = p1r !== null && p1a > 0 ? Math.abs(p1r - p1a) / p1a : 0, pctS = function (v) { return (v * 100).toFixed(1); };
    out.push(chk('p1_drift', drift > 0.5 ? 'warn' : 'ok', BB.t('Trial-to-paid drift'), sa === undefined || sa === null ? BB.t('No ended trials') : !(hlD > 0) ? BB.t('Recency weighting off (p1hl=0): all-time rate {a} % is used', { a: pctS(p1a) }) : drift > 0.5 ? BB.t('Trial-to-paid changed: recent {r} % vs all-time {a} %. Forecasts use the recent rate (half-life {n} d).', { r: pctS(p1r), a: pctS(p1a), n: hlD }) : BB.t('Recent trial-to-paid {r} % vs all-time {a} % (half-life {n} d)', { r: pctS(p1r), a: pctS(p1a), n: hlD }), p1r === null ? 0 : Math.round(drift * 100), ['trials.ts', 'charges.ts (n=1)', 'p1hl']));
    out.push(chk('censoring', censOk ? 'ok' : 'fail', BB.t('Censoring of recent renewals'), censOk ? BB.t('{n} at-risk observations recounted: none due after “now” − {g} d; {due} succeeded renewals inside the window deferred', { n: censN, g: GRACE / DAY, due: censDue }) : censBad ? BB.t('{n} observations due within {g} d counted as at risk', { n: censBad, g: GRACE / DAY }) : BB.t('recount gives {n} observations, the model sees {seen}', { n: censN, seen: allRisk }), censBad, ['charges.ts', 'charges.n', 'GRACE']));
    var ncShare = trialUsers ? noChannel / trialUsers : 0;
    out.push(chk('channel_coverage', ncShare > 0.3 ? 'warn' : 'ok', BB.t('Channel known for trial users'), BB.t('{n} of {total} ({pct} %) without a channel — the channel segment level collapses to organic', { n: BB.plural(noChannel, 'user|users'), total: trialUsers, pct: (ncShare * 100).toFixed(0) }), noChannel, ['users.channel', 'users.click_id_type', 'users.utm_source']));
    var spendDaysBad = [];
    BB.CHANNELS.forEach(function (c) {
      if (c.id === 'organic') return;
      var sp = 0, days = {}; data.spend.forEach(function (r) { if (r.channel === c.id) { sp += r.spend_usd; days[r.date] = days[r.date] || 0; } });
      if (!(sp > 0)) return;
      data.users.forEach(function (u) { if (u.channel === c.id && u._trial) { var dk = isoDate(u._trial.ts); if (days[dk] !== undefined) days[dk]++; } });
      var nd = Object.keys(days).filter(function (k) { return days[k] > 0; }).length; if (nd < 5) spendDaysBad.push(BB.lbl(c) + ' (' + BB.plural(nd, 'day|days') + ')');
    });
    out.push(chk('spend_days', spendDaysBad.length ? 'warn' : 'ok', BB.t('Spend history for the response curve'), spendDaysBad.length ? BB.t('Fewer than 5 days with trials: {list} — allocator uses a fixed b', { list: spendDaysBad.join(', ') }) : BB.t('Every paid channel has ≥ 5 days with spend and trials'), spendDaysBad.length, ['spend.date', 'spend.channel', 'trials.ts']));
    var refFail = [], refWarn = [];
    Object.keys(S).forEach(function (k) { var s = S[k]; if (s.gross > 0) { if (s.refunds > s.gross) refFail.push(segLabel(k)); else if (s.refunds / s.gross > 0.25) refWarn.push(segLabel(k)); } });
    out.push(chk('refund_sanity', refFail.length ? 'fail' : refWarn.length ? 'warn' : 'ok', BB.t('Refunds do not exceed revenue'), refFail.length ? BB.t('Refunds above revenue: {list}', { list: refFail.join(', ') }) : refWarn.length ? BB.t('Refund share > 25 %: {list}', { list: refWarn.join(', ') }) : BB.t('Refund share ≤ 25 % in every segment (total {pct} %)', { pct: S.all && S.all.gross ? (S.all.refunds / S.all.gross * 100).toFixed(1) : '0' }), refFail.length + refWarn.length, ['refunds.amount_usd', 'charges.amount_usd']));
    data._inputChecks = out;
    return out;
  };

  /** 3.2 Fit checks for one model. → [{id, level, label, detail, n}] */
  BB.predict.fitChecks = function (data, modelId) {
    if (data._filtered) data = data.raw;
    var id = modelId && MODEL_BY_ID[modelId] ? modelId : 'sbg', m = MODEL_BY_ID[id], out = [];
    if (m.kind === 'offline') {
      var st = BB.predict.offline.status(id), lvl = st.status === 'ok' ? 'ok' : st.status === 'stale' ? 'warn' : 'fail';
      var det = st.status === 'no_file' ? BB.t('File {f} not loaded', { f: m.file }) : st.status === 'error' ? BB.t('File {f} is corrupt: {err}', { f: m.file, err: st.error || BB.t('parse error') }) : st.status === 'stale' ? BB.t('File {f} is stale ({why})', { f: m.file, why: st.staleReason === 'dataset changed' ? BB.t('dataset changed') : st.ageDays !== null ? BB.plural(Math.round(st.ageDays), 'day|days') : BB.t('no generation date') }) : BB.t('File {f} is fresh ({age}, {tool})', { f: m.file, age: BB.plural(Math.round(st.ageDays), 'day|days'), tool: st.tool || BB.t('tool not stated') });
      out.push(chk('offline_fresh', lvl, BB.t('Offline file freshness'), det, st.nSegments, ['generated_at', 'data_hash']));
      if (!BB.predict.offline.usable(id) || m.scope) return out;
    }
    var fit = BB.predict.fit(data, id), F = fit.segments, all = F.all;
    if (!all) { out.push(chk('converged', 'fail', BB.t('Fit convergence'), BB.t('No “all” segment — no data for a curve'), 0)); return out; }
    var allOwn = all.curveFrom === 'all' && all.diag && all.diag.converged;
    var ptBad = Object.keys(F).filter(function (k) { return k.split('|').length === 2 && sumNum(F[k].obs) >= MIN_SEG && (F[k].curveFrom !== k || !(F[k].diag && F[k].diag.converged)); });
    var allEdge = !allOwn && all.curveFrom === 'all' && all.diag && all.diag.edge; // best point on the grid / clamp edge: the curve is usable (reported as edge_params too) → warn, not fail
    out.push(chk('converged', !allOwn && !allEdge ? 'fail' : (!allOwn || ptBad.length) ? 'warn' : 'ok', BB.t('Fit convergence'), allEdge ? BB.t('On “all” the optimum sits on the grid edge ({note}) — curve degenerates to geometric but is usable', { note: all.diag.note || 'edge' }) : !allOwn ? BB.t('Model did not converge on “all”') + (all.ownDiag && all.ownDiag.note ? ' (' + all.ownDiag.note + ')' : '') : ptBad.length ? BB.t('Did not converge on {n} plan × geo: {list}', { n: BB.plural(ptBad.length, 'segment|segments'), list: ptBad.map(segLabel).join(', ') }) : BB.t('Converged on “all” and every plan × geo segment with ≥ {min} renewals', { min: MIN_SEG }), ptBad.length, ['diag.converged']));
    var dg = all.diag || {}, dev = dg.maxAbsDev, isCurve = id === 'power' || id === 'power_b' || id === 'log';
    var lvlDev = m.prior && dg.excessDev !== null && dg.excessDev !== undefined ? dg.excessDev : dev; // prior models: thresholds on the deviation not explained by the prior
    var qLvl = lvlDev === null || lvlDev === undefined ? 'warn' : lvlDev < 0.03 ? 'ok' : lvlDev < 0.07 ? 'warn' : 'fail';
    if (isCurve && dg.r2 !== null && dg.r2 !== undefined && dg.r2 < 0.9 && qLvl === 'ok') qLvl = 'warn';
    var priorNote = ''; // prior models: maxAbsDev is measured against the blended target; a deviation from the raw observed points is by design → warn with a note, never fail
    if (m.prior && dg.obsDev !== null && dg.obsDev !== undefined && dg.obsDev > 0.07) { if (qLvl === 'ok') qLvl = 'warn'; priorNote = ' · ' + BB.t('deviates from observed points by {v} (prior share {pct} %)', { v: dg.obsDev.toFixed(3), pct: Math.round((dg.priorShare || 0) * 100) }); }
    out.push(chk('fit_quality', qLvl, BB.t('Fit quality on “all”'), (dev === null || dev === undefined ? BB.t('no deviation estimate') : m.prior ? BB.t('max |S fit − S target| = {v} (target = observed + prior pseudo-observations), beyond the prior’s pull {e}', { v: dev.toFixed(3), e: (dg.excessDev || 0).toFixed(3) }) : BB.t('max |S fit − S actual| = {v}', { v: dev.toFixed(3) })) + (dg.r2 !== null && dg.r2 !== undefined ? ' · R² = ' + dg.r2.toFixed(3) : '') + (dg.ll !== null && dg.ll !== undefined ? ' · ll = ' + dg.ll.toFixed(1) : '') + priorNote, 0, ['diag.maxAbsDev', 'diag.excessDev', 'diag.obsDev', 'diag.r2']));
    var mono = true, Sv = 1, kBad = null; for (var k = 2; k <= 60; k++) { var r = all.r(k); if (!(r > 0 && r < 1)) { mono = false; kBad = k; break; } Sv *= r; }
    out.push(chk('monotone', mono ? 'ok' : 'fail', BB.t('Monotone S(k), r(k) ∈ (0, 1)'), mono ? BB.t('S(k) non-increasing, r(k) ∈ (0, 1) for k ≤ 60') : BB.t('r({k}) outside (0, 1)', { k: kBad }), 0, ['r(k)']));
    var dom = null, domN = -1; Object.keys(F).forEach(function (k) { if (k.indexOf('|') < 0 && k !== 'all' && F[k].n > domN) { domN = F[k].n; dom = k; } });
    var P = dom ? BB.PLAN_BY_ID[dom] : null, K = P && P.period === 'month' ? 12 : 26, pts = survPoints(all.obs), lastObs = pts[pts.length - 1], SK = Sfrom(all.r)(K);
    var obsAtK = null; pts.forEach(function (p) { if (p.k === K) obsAtK = p; }); // the data may already reach K (long histories): then check the fit against the observed S(K)
    var kmTail = models.km.fit(all.obs), Skm = obsAtK ? obsAtK.S : lastObs.S * Math.pow(kmTail.params.tail, Math.max(0, K - lastObs.k)); // empirical tail: observed S(K), or the last 3 observed r(k) carried forward
    var floor = Math.min(0.005, 0.1 * Skm), collapse = SK < floor, inflate = obsAtK ? SK > obsAtK.S * 1.5 + 0.01 : SK > lastObs.S + 1e-9, tailOk = !collapse && !inflate;
    out.push(chk('tail_sanity', tailOk ? 'ok' : 'fail', BB.t('Curve tail S({k})', { k: K }), BB.t('S({k}) = {s} %, actual S({kl}) = {sl} %, empirical tail S({k}) ≈ {se} %', { k: K, s: (SK * 100).toFixed(2), kl: lastObs.k, sl: (lastObs.S * 100).toFixed(1), se: (Skm * 100).toFixed(2) }) + (tailOk ? '' : collapse ? BB.t(' — tail collapses 10+× faster than empirical') : BB.t(' — curve above the last actual (inflates)')), 0, ['S(k)']));
    var edges = Object.keys(F).filter(function (k) { return F[k].curveFrom === k && F[k].diag && F[k].diag.edge; });
    out.push(chk('edge_params', edges.length ? 'warn' : 'ok', BB.t('Parameters off the grid edge'), edges.length ? BB.t('On the edge: {list}', { list: edges.map(segLabel).join(', ') }) : BB.t('No segment hit the grid edge / clamp'), edges.length, m.params));
    return out;
  };

  /* Data requirements registry → "<what is not connected>: <what it is needed for>." sentences (EN keys, localised by reqItem). Static rows test the dataset; dynamic rows depend on the model / visible segments / horizon. */
  var DATA_REQS = [
    { key: 'spend_channel', fields: ['spend.channel'], label: 'Channel spend data not connected', needed_for: ['channel pROAS', 'budget allocation'], needed: 'channel pROAS and budget allocation unavailable', severity: 'degraded',
      missing: function (d) { if (!d.spend.length) return true; var n = 0; d.spend.forEach(function (r) { if (r.channel) n++; }); return n / d.spend.length < 0.5; } },
    { key: 'charges_psp', fields: ['charges.psp', 'charges.payment_method'], label: 'PSP and payment method data not connected', needed_for: ['PSP auth rate', 'payment method breakdown'], needed: 'PSP auth rate and payment method breakdown unavailable', severity: 'degraded',
      missing: function (d) { if (!d.charges.length) return true; var n = 0; d.charges.forEach(function (c) { if (c.psp && c.payment_method) n++; }); return n / d.charges.length < 0.5; } },
    { key: 'cancel_reason', fields: ['subscriptions.cancel_reason'], label: 'Subscription cancel reasons not connected', needed_for: ['voluntary / involuntary churn'], needed: 'voluntary vs involuntary churn split unavailable', severity: 'degraded',
      missing: function (d) { var subs = d.subscriptions || [], c = 0, w = 0; subs.forEach(function (s) { if (s.status === 'canceled') { c++; if (s.cancel_reason) w++; } }); return c > 0 && w / c < 0.5; } },
    { key: 'attribution', fields: ['users.click_id_type', 'users.utm_source', 'users.utm_medium'], label: 'Click IDs and UTM tags not connected', needed_for: ['channel attribution', 'EMQ'], needed: 'channel attribution and EMQ unavailable', severity: 'degraded',
      missing: function (d) { if (!d.users.length) return true; var n = 0; d.users.forEach(function (u) { if ((u.click_id_type && u.click_id_type !== 'none') || u.utm_source) n++; }); return n / d.users.length < 0.3; } },
    { key: 'events', fields: ['events.name (paywall_view, checkout_start)'], label: 'Paywall and checkout events not connected', needed_for: ['checkout funnel'], needed: 'checkout funnel unavailable', severity: 'degraded',
      missing: function (d) { var ev = d.events || []; for (var i = 0; i < ev.length; i++) if (ev[i].name === 'paywall_view' || ev[i].name === 'checkout_start') return false; return true; } },
  ];
  BB.predict.DATA_REQS = DATA_REQS;
  var OFFLINE_NAME = { cox: 'Cox/RSF', arima: 'ARIMA' };
  /* r.label / r.needed / r.needed_for[] are EN keys (static registry rows) or already-localised strings (dynamic rows); BB.t is idempotent on the latter. */
  function reqItem(r, extra) { var o = Object.assign({ key: r.key, fields: r.fields, label: BB.t(r.label), needed_for: (r.needed_for || []).map(function (x) { return BB.t(x); }), needed: BB.t(r.needed), severity: r.severity }, extra || {}); o.text = o.label + ': ' + o.needed + '.'; return o; }
  /** Data requirements → missing[]: {key, label, needed_for[], needed, text ('label: needed.'), severity:'blocker'|'degraded', fields}. opts: {segKeys:[full segment keys of visible rows], horizon} */
  BB.predict.missing = function (data, modelId, opts) {
    if (data._filtered) data = data.raw; if (!data._indexed) BB.index(data);
    opts = opts || {};
    var id = modelId && MODEL_BY_ID[modelId] ? modelId : 'sbg', out = [];
    DATA_REQS.forEach(function (r) { if (r.missing(data)) out.push(reqItem(r)); });
    BB.predict.MODELS.filter(function (m) { return m.kind === 'offline'; }).forEach(function (m) {
      var st = BB.predict.offline.status(m.id), name = OFFLINE_NAME[m.id] || m.label, active = m.id === id, sev = active ? 'blocker' : 'degraded';
      var use = m.id === 'arima' ? BB.t('MRR forecast falls back to sBG') : BB.t('model unavailable, sBG is used');
      if (st.status === 'no_file') out.push(reqItem({ key: 'offline_' + m.id, fields: [m.file], label: BB.t('Model file {name} not loaded ({file})', { name: name, file: m.file }), needed_for: [m.id === 'arima' ? BB.t('ARIMA MRR forecast') : BB.t('{name} model forecast', { name: name })], needed: use, severity: sev }));
      else if (st.status === 'error') out.push(reqItem({ key: 'offline_' + m.id, fields: [m.file], label: BB.t('Model file {name} is corrupt ({file})', { name: name, file: m.file }), needed_for: [BB.t('{name} model forecast', { name: name })], needed: use, severity: sev }));
      else if (st.status === 'stale') out.push(reqItem({ key: 'offline_' + m.id, fields: [m.file, 'generated_at', 'data_hash'], label: BB.t('Model file {name} is stale ({detail})', { name: name, detail: m.file + (st.ageDays !== null ? ', ' + BB.plural(Math.round(st.ageDays), 'day|days') : '') + (st.staleReason === 'dataset changed' ? ', ' + BB.t('dataset changed') : '') }), needed_for: [BB.t('up-to-date {name} forecast', { name: name })], needed: BB.t('its forecast may not match the current data, rebuild the file'), severity: 'degraded' }));
    });
    var fit = BB.predict.fit(data, id), seen = {}, thin = [];
    (opts.segKeys || []).forEach(function (k) {
      if (seen[k]) return; seen[k] = true; var f = fit.segments[k]; if (!f) return;
      var n = sumNum(f.obs); if (f.curveFrom !== k && n < MIN_SEG) thin.push({ key: k, n: n });
    });
    thin.sort(function (a, b) { return b.n - a.n; });
    thin.slice(0, 3).forEach(function (t) { out.push(reqItem({ key: 'thin_' + t.key, fields: ['obs[k].n (' + t.key + ')'], label: BB.t('Too few observations for segment {seg} ({n})', { seg: segLabel(t.key), n: BB.plural(t.n, 'renewal|renewals') }), needed_for: ['own retention curve'], needed: 'forecast taken from the segment one level up', severity: 'degraded' })); });
    if (thin.length > 3) out.push(reqItem({ key: 'thin_more', fields: ['obs[k].n'], label: BB.t('{n} more with fewer than {min} renewals', { n: BB.plural(thin.length - 3, 'segment|segments'), min: MIN_SEG }), needed_for: ['own retention curve'], needed: 'forecast taken from the segment one level up', severity: 'degraded' }));
    var maxAge = 0; data.users.forEach(function (u) { if (u._trial) maxAge = Math.max(maxAge, (data.now - u.signup_ts) / DAY); });
    var hs = [90, 180, 360], first = null; for (var i = 0; i < hs.length; i++) if (maxAge < hs[i]) { first = hs[i]; break; }
    if (first !== null) { var rest = hs.filter(function (h) { return h >= first; }); out.push(reqItem({ key: 'immature_' + first, fields: ['users.signup_ts', 'now'], label: BB.t('No cohorts older than D{n}', { n: first }), needed_for: rest.map(function (h) { return BB.t('pROAS D{n} backtest', { n: h }); }), needed: BB.t('pROAS {list} is fully model-based, no backtest possible', { list: rest.map(function (h) { return 'D' + h; }).join('/') }), severity: 'degraded' })); }
    return out;
  };

  /** 3.4 Agreement across models on one row. opts as cohort (+ model list via opts.models). → {base, rows:[{id, label, kind, p90, p180, d90, d180, converged}], spread, agree, verdict, consensus:{p90, p180}, extremes} */
  BB.predict.agreement = function (row, opts) {
    opts = opts || {};
    var data = opts.data || _cache || BB.load(); if (data._filtered) data = data.raw;
    var ids = opts.models || BB.predict.MODELS.map(function (m) { return m.id; }), base = null, rows = [];
    ids.forEach(function (id) {
      var m = MODEL_BY_ID[id]; if (!m) return;
      if (m.kind === 'offline' && (m.scope || !BB.predict.offline.usable(id))) return;
      var fit = BB.predict.fit(data, id), all = fit.segments.all, conv = !!(all && all.curveFrom === 'all' && all.diag && all.diag.converged);
      if (id !== 'sbg' && m.kind === 'js' && !conv) { rows.push({ id: id, label: m.label, kind: m.kind, converged: false, p90: null, p180: null, d90: null, d180: null }); return; }
      var p90 = BB.predict.cohort(row, Object.assign({}, opts, { offset: 90, model: id })), p180 = BB.predict.cohort(row, Object.assign({}, opts, { offset: 180, model: id }));
      var r = { id: id, label: m.label, kind: m.kind, converged: conv, p90: p90, p180: p180, d90: null, d180: null };
      if (id === 'sbg') base = r; rows.push(r);
    });
    if (!base) return { base: null, rows: rows, spread: null, agree: null, verdict: BB.t('No base model'), consensus: null, extremes: null };
    var ok = rows.filter(function (r) { return r.p180 && r.p180.roas !== null; });
    ok.forEach(function (r) { r.d90 = base.p90.roas ? r.p90.roas / base.p90.roas - 1 : null; r.d180 = base.p180.roas ? r.p180.roas / base.p180.roas - 1 : null; });
    var vals = ok.map(function (r) { return r.p180.roas; }), mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    var spread = base.p180.roas ? (mx - mn) / base.p180.roas : null, agree = spread !== null && spread <= 0.15;
    var hiR = ok.filter(function (r) { return r.p180.roas === mx; })[0], loR = ok.filter(function (r) { return r.p180.roas === mn; })[0];
    var med = function (arr) { return median(arr.slice()); };
    var consensus = ok.length ? { p90: { roas: med(ok.map(function (r) { return r.p90.roas; })), mid: med(ok.map(function (r) { return r.p90.mid; })) }, p180: { roas: med(ok.map(function (r) { return r.p180.roas; })), mid: med(ok.map(function (r) { return r.p180.mid; })) }, n: ok.length } : null;
    var verdict;
    if (spread === null) verdict = BB.t('No data to compare models');
    else if (agree) verdict = BB.t('Models agree: pROAS D180 spread {pct} % ({n}).', { pct: Math.round(spread * 100), n: BB.plural(ok.length, 'model|models') });
    else verdict = BB.t('Models diverge by {pct} % at D180: {hi} most optimistic, {lo} most pessimistic.', { pct: Math.round(spread * 100), hi: hiR ? hiR.label : '—', lo: loR ? loR.label : '—' });
    return { base: base, rows: rows, spread: spread, agree: agree, verdict: verdict, consensus: consensus, extremes: { hi: hiR ? hiR.id : null, lo: loR ? loR.id : null } };
  };

  /** 3.3 Hold-out + in-sample summary for one model. → {model, holdout:{d3:{mape,bias,n,coverage80}, d7}, insample:{d3:{mape,bias,n}, d7}, cutoffDays, targetDay} */
  BB.predict.holdout = function (data, modelId, opts) {
    opts = opts || {};
    var tgt = +(opts.targetDay || 30), cd = +(opts.cutoffDays || 60), st = opts.state || {}, out = { model: modelId, holdout: {}, insample: {}, cutoffDays: cd, targetDay: tgt };
    [3, 7].forEach(function (sig) {
      var h = BB.predict.backtest({ data: data, state: st, signalDay: sig, targetDay: tgt, model: modelId, holdout: true, cutoffDays: cd });
      var i = BB.predict.backtest({ data: data, state: st, signalDay: sig, targetDay: tgt, model: modelId });
      out.holdout['d' + sig] = { mape: h.overall.mape, bias: h.overall.bias, n: h.overall.n, coverage80: h.overall.coverage80 };
      out.insample['d' + sig] = { mape: i.overall.mape, bias: i.overall.bias, n: i.overall.n };
      out.model = h.model; out.trainUntil = h.trainUntil; out.testFrom = h.testFrom; out.cutoff = h.cutoff; out.testDays = h.testDays; out.empty = h.empty; out.inSample = h.inSample;
    });
    return out;
  };

  /** Full validation for one model. opts: {row (agreement), state, segKeys, holdout:true, agreement:true}
   *  → {model, effective, input, fit, missing, holdout?, agreement?, status:'ok'|'warn'|'fail'|'no_file'|'stale'|'error', degraded, inputLevel, fitLevel} */
  BB.predict.validate = function (data, modelId, opts) {
    opts = opts || {};
    if (data._filtered) data = data.raw;
    var id = modelId && MODEL_BY_ID[modelId] ? modelId : 'sbg', m = MODEL_BY_ID[id];
    var out = { model: id, effective: BB.predict.fit(data, id).model, input: BB.predict.inputChecks(data), fit: BB.predict.fitChecks(data, id), missing: BB.predict.missing(data, id, opts) };
    out.inputLevel = worstLevel(out.input); out.fitLevel = worstLevel(out.fit);
    if (m.kind === 'offline') { var st = BB.predict.offline.status(id).status; out.status = st === 'ok' ? (out.fitLevel === 'fail' ? 'fail' : out.fitLevel) : st; }
    else out.status = out.fitLevel;
    out.degraded = out.status === 'fail' || out.status === 'no_file' || out.status === 'error' || out.status === 'stale' || (m.kind === 'offline' && out.effective !== id && !m.scope);
    if (opts.holdout) out.holdout = BB.predict.holdout(data, id, { state: opts.state, targetDay: opts.targetDay, cutoffDays: opts.cutoffDays });
    if (opts.row) out.agreement = BB.predict.agreement(opts.row, { data: data, money: opts.state && opts.state.money, signalDay: opts.state && opts.state.signalDay, payer: opts.state && opts.state.payer, scenario: opts.scenario });
    return out;
  };

  /* ───────────────────────── User flow graph (BB.flow) ───────────────────────── */
  BB.FLOW_STAGES = [
    { id: 'source', label: 'Source', label_ru: 'Источник' }, { id: 'landing', label: 'Landing', label_ru: 'Лендинг' }, { id: 'signup', label: 'Signup', label_ru: 'Регистрация' }, { id: 'onboarding', label: 'Onboarding A/B', label_ru: 'Онбординг A/B' },
    { id: 'paywall', label: 'Paywall A/B', label_ru: 'Пейвол A/B' }, { id: 'checkout', label: 'Checkout', label_ru: 'Чекаут' }, { id: 'trial', label: 'Trial', label_ru: 'Триал' }, { id: 'qualified', label: 'Qualified trial', label_ru: 'Квалиф. триал' }, { id: 'payment', label: 'Payment', label_ru: 'Оплата' },
    { id: 'outcome', label: 'Outcome D30', label_ru: 'Итог D30' }, { id: 'loss', label: 'Losses', label_ru: 'Потери' }
  ];
  function median(arr) { if (!arr.length) return null; arr.sort(function (a, b) { return a - b; }); var m = arr.length >> 1; return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2; }
  /* Per-user facts used by the flow graph. */
  function userFacts(u, ix, now, basis, payerMode) {
    var a = anchorOf(u, basis), t = u._trial, cs = ix.chargesByUser.get(u.user_id) || [], rs = ix.refundsByUser.get(u.user_id) || [], ds = ix.disputesByUser.get(u.user_id) || [];
    var F = { u: u, viewed: !!u.paywall_viewed_ts, checkout: !!u.checkout_ts, checkoutError: !!u.checkout_error, trial: !!t, qualified: !!(t && t.qualified), payer: false, firstOkTs: null, cardFailed: false, insufficient: false,
      refund: rs.length > 0, dispute: ds.length > 0, rev_gross: 0, rev_net: 0, outcome: null };
    var failed1 = false, ok1 = false, i, c;
    for (i = 0; i < cs.length; i++) {
      c = cs[i];
      if (c.status === 'succeeded') { F.rev_gross += c.amount_usd; F.rev_net += c.amount_usd - c.fee_usd; if (BB.isPayerCharge(c, payerMode)) { F.payer = true; if (F.firstOkTs === null) F.firstOkTs = c.ts; } if (c.type === 'rebill' && c.n === 1) ok1 = true; }
      else if (c.type === 'rebill' && c.n === 1) { failed1 = true; if (c.decline_code === 'insufficient_funds') F.insufficient = true; }
    }
    for (i = 0; i < rs.length; i++) F.rev_net -= rs[i].amount_usd;
    for (i = 0; i < ds.length; i++) F.rev_net -= ds[i].amount_usd + ds[i].fee_usd;
    if (t && !t.cancelled_ts && !ok1 && failed1 && trialEndOf(t) <= now) F.cardFailed = true;
    if (F.payer && a !== null) {
      var d30 = a + 30 * DAY;
      if (d30 > now) F.outcome = 'pending';
      else { F.outcome = 'churn'; for (i = 0; i < cs.length; i++) { c = cs[i]; if (c.status === 'succeeded' && (c.type === 'rebill' || c.type === 'renewal') && c.ts <= d30 && d30 < c.ts + periodOf(c.plan) * DAY) { F.outcome = 'active'; break; } } }
    }
    return F;
  }
  function flowCore(f, mode, money, withTrend) {
    var ix = f.index, now = f.now, basis = f.basis, payerMode = f.state && f.state.payer;
    var facts = f.users.map(function (u) { return userFacts(u, ix, now, basis, payerMode); });
    if (mode === 'trials') facts = facts.filter(function (x) { return x.trial; });
    if (mode === 'payers') facts = facts.filter(function (x) { return x.payer; });
    var spendByC = groupMap(f.spend, function (r) { return r.campaign_id; });
    var totalSpend = sum(f.spend, function (r) { return r.spend_usd; });
    var nodes = [], nodeById = {}, edges = [], edgeById = {};
    function node(id, stage, label, extra) {
      var n = nodeById[id]; if (n) return n;
      n = Object.assign({ id: id, stage: stage, label: label, users: 0, set: [], rev_gross: 0, rev_net: 0, spend: null, views: null }, extra || {});
      nodes.push(n); nodeById[id] = n; return n;
    }
    function addUser(n, F) { n.users++; n.set.push(F); n.rev_gross += F.rev_gross; n.rev_net += F.rev_net; }
    function edge(from, to, F, hours) {
      var id = from + '→' + to, e = edgeById[id];
      if (!e) { e = { id: id, from: from, to: to, users: 0, rate: null, medianHours: null, revDownstream: 0, _h: [] }; edges.push(e); edgeById[id] = e; }
      e.users++; if (F) { e.revDownstream += money === 'net' ? F.rev_net : F.rev_gross; } if (hours !== undefined && hours !== null) e._h.push(hours);
      return e;
    }
    // source + landing nodes (views from spend; organic measured by signups)
    var campaigns = new Map();
    spendByC.forEach(function (rows, cid) { campaigns.set(cid, { id: cid, label: rows[0].campaign, market: rows[0].market, views: sum(rows, function (r) { return r.landing_views; }), spend: sum(rows, function (r) { return r.spend_usd; }) }); });
    facts.forEach(function (F) { var u = F.u; if (!campaigns.has(u.campaign_id)) campaigns.set(u.campaign_id, { id: u.campaign_id, label: u.campaign, market: u.market, views: 0, spend: 0, organic: u.campaign_id === 'organic' }); });
    var byCamp = groupMap(facts, function (F) { return F.u.campaign_id; });
    var landViews = {}, entry = 0;
    campaigns.forEach(function (c) {
      var us = byCamp.get(c.id) || [], views = c.organic ? us.length : c.views;
      var camp = f.index.campaignById.get(c.id), chId = (camp && camp.channel) || (us[0] ? us[0].u.channel : 'organic'), CH = BB.CHANNEL_BY_ID[chId];
      var n = node('src:' + c.id, 'source', c.label, { market: c.market, spend: c.spend, views: views, organic: !!c.organic, channel: chId, channelLabel: CH ? BB.lbl(CH) : chId, color: CH ? CH.color : null });
      n.users = views; entry += views; n.rev_gross = sum(us, function (F) { return F.rev_gross; }); n.rev_net = sum(us, function (F) { return F.rev_net; }); n.set = us;
      // landing views distributed by the landing shares of this campaign's signups
      var byL = groupMap(us, function (F) { return F.u.landing || 'default'; });
      if (!us.length && views > 0) { landViews['default'] = (landViews['default'] || 0) + views; var e0 = edge('src:' + c.id, 'land:default', null); e0.users += views - 1; }
      byL.forEach(function (lus, l) { var v = us.length ? views * lus.length / us.length : 0; landViews[l] = (landViews[l] || 0) + v; var e = edge('src:' + c.id, 'land:' + l, null); e.users += v - 1; e.revDownstream += sum(lus, function (F) { return money === 'net' ? F.rev_net : F.rev_gross; }); });
    });
    var byLand = groupMap(facts, function (F) { return F.u.landing || 'default'; });
    Object.keys(landViews).forEach(function (l) {
      var n = node('land:' + l, 'landing', l, { views: landViews[l] }), us = byLand.get(l) || [];
      n.users = landViews[l]; n.set = us; n.rev_gross = sum(us, function (F) { return F.rev_gross; }); n.rev_net = sum(us, function (F) { return F.rev_net; });
    });
    // user-based stages
    var S = node('signup', 'signup', BB.t('Signup')), T = node('trial', 'trial', BB.t('Trial')), Q = node('qualified', 'qualified', BB.t('Qualified')), PAY = node('pay', 'payment', payerMode === 'sub' ? BB.t('1st rebill') : BB.t('Payment'));
    node('onb:A', 'onboarding', BB.t('Onboarding A'), { variantTag: 'A' }); node('onb:B', 'onboarding', BB.t('Onboarding B'), { variantTag: 'B' });
    var PW_LABEL = {}, PW_TAG = {}; BB.PAYWALLS.forEach(function (w) { PW_LABEL[w.id] = BB.lbl(w); if (w.variant) PW_TAG[w.id] = w.variant; }); // labels and A/B tags from the paywall catalogue
    var ACT = node('active30', 'outcome', BB.t('Active D30')), CH = node('churn', 'outcome', BB.t('Churned by D30')), PEND = node('pending30', 'outcome', BB.t('Not yet D30'));
    var LC = node('loss_card', 'loss', BB.t('Card declined'), { loss: true, insufficient: 0 }), LR = node('loss_refund', 'loss', BB.t('Refund'), { loss: true }), LD = node('loss_dispute', 'loss', BB.t('Dispute'), { loss: true }), LDR = node('loss_drop', 'loss', BB.t('Drop-off'), { loss: true });
    var CO = node('checkout', 'checkout', BB.t('Checkout started')), LCO = node('loss_checkout', 'loss', BB.t('Checkout error'), { loss: true, byPsp: {} });
    facts.forEach(function (F) {
      var u = F.u, land = 'land:' + (u.landing || 'default');
      addUser(S, F); edge(land, 'signup', F, 0);
      var onb = 'onb:' + (u.onboarding || 'A'); addUser(nodeById[onb], F); edge('signup', onb, F, 0);
      if (!F.viewed) { edge('signup', 'loss_drop', F); addUser(LDR, F); return; }
      var pw = 'pw:' + u.paywall, PWN = node(pw, 'paywall', PW_LABEL[u.paywall] || u.paywall, { variantTag: PW_TAG[u.paywall] || null });
      addUser(PWN, F); edge(onb, pw, F, (u.paywall_viewed_ts - u.signup_ts) / HOUR);
      if (!F.checkout) { edge(pw, 'loss_drop', F); addUser(LDR, F); return; }
      addUser(CO, F); edge(pw, 'checkout', F, (u.checkout_ts - u.paywall_viewed_ts) / HOUR);
      if (!F.trial) {
        if (F.checkoutError) { addUser(LCO, F); var pk = (u.checkout_error && u.checkout_error.psp) || 'stripe'; LCO.byPsp[pk] = (LCO.byPsp[pk] || 0) + 1; edge('checkout', 'loss_checkout', F); }
        else { edge('checkout', 'loss_drop', F); addUser(LDR, F); }
        return;
      }
      var pl = 'plan:' + u.plan, PLN = node(pl, 'paywall', u.plan, { sub: true, parent: pw }); addUser(PLN, F);
      addUser(T, F); edge('checkout', 'trial', F, (u._trial.ts - u.checkout_ts) / HOUR);
      if (!F.qualified) { edge('trial', 'loss_drop', F); addUser(LDR, F); return; }
      addUser(Q, F); edge('trial', 'qualified', F, 20 / 60);
      if (F.cardFailed) { addUser(LC, F); if (F.insufficient) LC.insufficient++; edge('qualified', 'loss_card', F); return; }
      if (!F.payer) { if (u._trial.cancelled_ts || trialEndOf(u._trial) <= now) { edge('qualified', 'loss_drop', F); addUser(LDR, F); } return; } // else pending trial
      addUser(PAY, F); edge('qualified', 'pay', F, (F.firstOkTs - u._trial.ts) / HOUR);
      var pmId = 'psp:' + (u.payment_method || 'card'), PMN = node(pmId, 'payment', (u.psp === 'paypal' ? 'PayPal' : 'Stripe · ' + (BB.lbl(BB.PAYMENT_METHODS.find(function (m) { return m.id === (u.payment_method || 'card'); })) || u.payment_method || BB.t('card'))), { sub: true, parent: 'pay', psp: u.psp, payment_method: u.payment_method }); addUser(PMN, F);
      if (F.refund) { addUser(LR, F); edge('pay', 'loss_refund', F); }
      if (F.dispute) { addUser(LD, F); edge('pay', 'loss_dispute', F); }
      var out = F.outcome === 'active' ? ACT : F.outcome === 'churn' ? CH : PEND; addUser(out, F); edge('pay', out.id, F);
    });
    // finalize nodes
    var stageTot = {}; nodes.forEach(function (n) { if (!n.sub) stageTot[n.stage] = (stageTot[n.stage] || 0) + n.users; });
    var single = campaigns.size === 1 && !campaigns.values().next().value.organic;
    nodes.forEach(function (n) {
      n.pctOfStage = ratio(n.users, stageTot[n.stage]); n.pctOfEntry = ratio(n.users, entry);
      var rev = money === 'net' ? n.rev_net : n.rev_gross;
      n.ltv_gross = ratio(n.rev_gross, n.users); n.ltv_net = ratio(n.rev_net, n.users); n.ltv = money === 'net' ? n.ltv_net : n.ltv_gross; n.arpu = ratio(rev, n.users); n.rev = rev;
      n.payers = n.set.filter(function (F) { return F.payer; }).length; n.arppu = ratio(rev, n.payers);
      n.roas = n.stage === 'source' ? ratio(rev, n.spend) : (single ? ratio(rev, totalSpend) : null);
      if (n.id === 'loss_card') n.insufficientShare = ratio(n.insufficient, n.users);
      n.trend = null;
    });
    edges.forEach(function (e) { var from = nodeById[e.from]; e.rate = from && from.users > 0 ? Math.min(1, e.users / from.users) : null; e.medianHours = median(e._h); delete e._h; });
    var payers = PAY.users, rev = money === 'net' ? S.rev_net : S.rev_gross;
    var kpis = { entry: entry, signups: S.users, trials: T.users, qualified: Q.users, payers: payers, checkouts: CO.users, checkoutErrors: LCO.users, signupToTrial: ratio(T.users, S.users), trialToPay: ratio(payers, T.users),
      checkoutToTrial: ratio(T.users, CO.users), checkoutErrorRate: ratio(LCO.users, CO.users), entryToPay: ratio(payers, entry), ltvPerEntry: ratio(rev, entry), rev: rev, spend: totalSpend, roas: ratio(rev, totalSpend) };
    // channel groups of the source column (lane colour + campaign pills inside)
    var chMap = new Map();
    nodes.forEach(function (n) { if (n.stage !== 'source') return; var g = chMap.get(n.channel); if (!g) { var C = BB.CHANNEL_BY_ID[n.channel]; g = { channel: n.channel, label: C ? BB.lbl(C) : n.channel, color: C ? C.color : null, users: 0, spend: 0, rev: 0, campaigns: [] }; chMap.set(n.channel, g); } g.users += n.users; g.spend += n.spend || 0; g.rev += n.rev || 0; g.campaigns.push(n.id); });
    var channels = Array.from(chMap.values()).map(function (g) { g.roas = ratio(g.rev, g.spend); g.pctOfEntry = ratio(g.users, entry); return g; }).sort(function (a, b) { return b.users - a.users; });
    return { stages: BB.FLOW_STAGES, nodes: nodes, edges: edges, kpis: kpis, nodeById: nodeById, mode: mode, money: money, payer: payerMode === 'sub' ? 'sub' : 'any', channels: channels };
  }
  /** {data, state, mode:'users'|'trials'|'payers', baseNode?, lanes?} → graph {stages, nodes, edges, kpis, lanes?, range}.
   *  Node user sets are kept in node.set (array of facts) for drill-downs; strip before serialising. */
  BB.flow = function (o) {
    var st = o.state || {}, mode = o.mode || st.mode || 'users', money = st.money || 'gross';
    var f = BB.filter(o.data, st), g = flowCore(f, mode, money);
    // trend vs compare period (users per node)
    if ((st.compare || 'prev') !== 'none') {
      var cr = BB.state.compareRange(f.range), pst = Object.assign({}, st, { preset: 'custom', from: isoDate(cr.from), to: isoDate(cr.to) });
      var pf = BB.filter(f.raw, pst); pf.range = cr; pf.users = pf.users.filter(function (u) { var a = anchorOf(u, pf.basis); return a >= cr.from && a <= cr.to; });
      var pg = flowCore(pf, mode, money);
      g.nodes.forEach(function (n) { var p = pg.nodeById[n.id]; n.trend = p && p.users > 0 ? n.users / p.users - 1 : null; n.prevUsers = p ? p.users : 0; });
      g.compareRange = cr;
    }
    var base = o.baseNode || st.base;
    if (base && g.nodeById[base]) {
      var B = g.nodeById[base], bset = new Set(B.set.map(function (F) { return F.u.user_id; }));
      g.nodes.forEach(function (n) { var inter = n.set.filter(function (F) { return bset.has(F.u.user_id); }).length; n.pctOfBase = B.set.length ? inter / B.set.length : null; });
      g.baseNode = base;
    }
    g.range = f.range;
    var lanesDim = o.lanes || st.groupBy;
    if (lanesDim && !o._noLanes) {
      var byV = groupMap(f.users, function (u) { return BB.dimValue(u, lanesDim); });
      var vals = Array.from(byV.entries()).sort(function (a, b) { return b[1].length - a[1].length; }).slice(0, o.maxLanes || 6);
      g.lanes = vals.map(function (e) {
        var fl = Object.assign({}, st.filters || {}); fl[lanesDim] = [e[0]];
        var lst = Object.assign({}, st, { filters: fl, groupBy: null });
        var lg = BB.flow({ data: f.raw, state: lst, mode: mode, baseNode: base, _noLanes: true });
        return { key: e[0], label: e[0], users: e[1].length, graph: lg };
      });
      g.lanesDim = lanesDim;
    }
    return g;
  };

  /** Flat table of a flow graph → [{stage, stageLabel, node, label, variantTag, users, pctOfStage, pctOfEntry, conversionIn, ltv_gross, ltv_net, arpu, roas, trend}] */
  BB.flowTable = function (g) {
    var order = {}; BB.FLOW_STAGES.forEach(function (s, i) { order[s.id] = i; });
    var inUsers = {}, inFrom = {};
    g.edges.forEach(function (e) { inUsers[e.to] = (inUsers[e.to] || 0) + e.users; var fr = g.nodeById ? g.nodeById[e.from] : null; inFrom[e.to] = (inFrom[e.to] || 0) + (fr ? fr.users : 0); });
    var stageLabel = {}; BB.FLOW_STAGES.forEach(function (s) { stageLabel[s.id] = BB.lbl(s); });
    return g.nodes.slice().sort(function (a, b) { return order[a.stage] - order[b.stage] || b.users - a.users; }).map(function (n) {
      return { stage: n.stage, stageLabel: stageLabel[n.stage], node: n.id, label: n.label + (n.sub ? ' ' + BB.t('(plan)') : ''), variantTag: n.variantTag || null, sub: !!n.sub, users: n.users,
        pctOfStage: n.pctOfStage, pctOfEntry: n.pctOfEntry, conversionIn: inFrom[n.id] ? Math.min(1, inUsers[n.id] / inFrom[n.id]) : null,
        ltv_gross: n.ltv_gross, ltv_net: n.ltv_net, ltv: n.ltv, arpu: n.arpu, roas: n.roas, trend: n.trend };
    });
  };

  /* ───────────────────────── A/B testing ───────────────────────── */
  function gammaSample(rnd, shape) { // Marsaglia–Tsang, shape ≥ 1 handled via boost
    if (shape < 1) return gammaSample(rnd, shape + 1) * Math.pow(rnd(), 1 / shape);
    var d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      var x, v, u1 = rnd(), u2 = rnd();
      x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; if (v <= 0) continue; v = v * v * v;
      var u = rnd(); if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  function betaSample(rnd, a, b) { var x = gammaSample(rnd, a), y = gammaSample(rnd, b); return x / (x + y); }
  /** Probability to beat. rows = [{variant, n, k}] (rate: Beta-Binomial) or [{variant, values:[...]}] (mean, e.g. LTV: bootstrap).
   *  metric is informational ('rate'|'ltv'|metric key); the row shape decides the method. → [{variant, value, lo, hi, probBeat, n}] (80 % intervals) */
  BB.abTest = function (rows, metric, opts) {
    opts = opts || {}; var sims = opts.sims || 3000, rnd = mulberry32(opts.seed || 7), isRate = rows.length && rows[0].values === undefined;
    var draws = rows.map(function (r) {
      var out = new Array(sims), i, j;
      if (isRate) { for (i = 0; i < sims; i++) out[i] = betaSample(rnd, (r.k || 0) + 1, Math.max(0, (r.n || 0) - (r.k || 0)) + 1); }
      else { var v = r.values || [], L = v.length; for (i = 0; i < sims; i++) { var s = 0; for (j = 0; j < L; j++) s += v[Math.floor(rnd() * L)]; out[i] = L ? s / L : 0; } }
      return out;
    });
    var wins = rows.map(function () { return 0; });
    for (var i = 0; i < sims; i++) { var best = 0; for (var r = 1; r < rows.length; r++) if (draws[r][i] > draws[best][i]) best = r; wins[best]++; }
    return rows.map(function (r, idx) {
      var d = draws[idx].slice().sort(function (a, b) { return a - b; });
      var value = isRate ? ratio(r.k, r.n) : (r.values && r.values.length ? sum(r.values) / r.values.length : null);
      return { variant: r.variant, metric: metric || (isRate ? 'rate' : 'mean'), value: value, lo: d[Math.floor(sims * 0.1)], hi: d[Math.floor(sims * 0.9)], probBeat: rows.length > 1 ? wins[idx] / sims : null, n: isRate ? r.n : (r.values || []).length };
    });
  };
  /** Live experiments summary for the A/B strip. {data, state} → [{experiment, label, variants:[{variant, users, trials, signupToTrial, trialsEnded, firstRebillOk, trialToPay, payers, ltv7, ltv30, rev, roas, probBeat:{signupToTrial, trialToPay, ltv}}]}] */
  BB.abTests = function (o) {
    var f = BB.filter(o.data, o.state), st = o.state || {}, money = st.money || 'gross', now = f.now, ix = f.index;
    var exps = [{ experiment: 'onboarding', label: BB.t('Onboarding'), valueOf: function (u) { return u.onboarding; } },
      { experiment: 'paywall', label: BB.t('Paywall'), valueOf: function (u) { return u.experiments && u.experiments.paywall; } }];
    var sb = null;
    return exps.map(function (ex) {
      var byV = groupMap(f.users.filter(function (u) { return ex.valueOf(u); }), ex.valueOf);
      var dim = ex.experiment === 'onboarding' ? 'onboarding' : null;
      var alloc = dim ? spendBySlice(f, dim, null) : BB.allocSpend({ spend: f.spend, users: joinedUsers(f), sliceOf: function (u) { return u.experiments && u.experiments.paywall; } });
      var variants = Array.from(byV.keys()).sort().map(function (v) {
        var us = byV.get(v), r = buildRow({ key: v, label: v, users: us, spendAgg: alloc.map.get(v), offsets: [7, 30], basis: f.basis, now: now, index: ix, money: money, cohortEnd: f.range.to, spendAllocated: true, payer: st.payer });
        var ltv = us.map(function (u) { var F = userFacts(u, ix, now, f.basis, st.payer); return money === 'net' ? F.rev_net : F.rev_gross; });
        var o30 = r.byOffset[30], o7 = r.byOffset[7];
        return { variant: v, users: r.signups, trials: r.trials, signupToTrial: ratio(r.trials, r.signups), trialsEnded: o30.trialsEnded, firstRebillOk: o30.firstRebillOk, trialToPay: ratio(o30.firstRebillOk, o30.trialsEnded),
          payers: r.payers, ltv7: BB.metric(r, 'arpu', 7, money), ltv30: BB.metric(r, 'arpu', 30, money), rev: sum(ltv), spend: r.spend, roas: ratio(sum(ltv), r.spend), _ltv: ltv, probBeat: {} };
      });
      if (variants.length > 1) {
        var a = BB.abTest(variants.map(function (v) { return { variant: v.variant, n: v.users, k: v.trials }; }), 'signupToTrial');
        var b = BB.abTest(variants.map(function (v) { return { variant: v.variant, n: v.trialsEnded, k: v.firstRebillOk }; }), 'trialToPay');
        var c = BB.abTest(variants.map(function (v) { return { variant: v.variant, values: v._ltv }; }), 'ltv', { sims: 1000 });
        variants.forEach(function (v, i) { v.probBeat = { signupToTrial: a[i].probBeat, trialToPay: b[i].probBeat, ltv: c[i].probBeat }; v.ltvLo = c[i].lo; v.ltvHi = c[i].hi; });
      }
      variants.forEach(function (v) { delete v._ltv; });
      return { experiment: ex.experiment, label: ex.label, variants: variants };
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BB;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
