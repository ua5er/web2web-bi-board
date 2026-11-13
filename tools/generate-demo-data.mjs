#!/usr/bin/env node
/* Web-to-Web BI Board: deterministic demo-data generator (no dependencies).
 *
 *   node tools/generate-demo-data.mjs [--seed 7] [--from 2025-09-01] [--now 2026-10-21T20:24:00Z] [--out data/demo.json] [--rows]
 *
 * Writes a synthetic dataset for a fictional subscription web funnel ("Demo app") in exactly the JSON contract the board reads
 * (docs/DATA_CONTRACT.md), plus data/status.json. Same seed and options → byte-identical output.
 *
 * Everything here is invented: products, prices, campaigns, partners, users, payments. The curves are shaped to look plausible
 * (paid traffic growing over ~14 months, sBG-shaped renewal retention, involuntary churn from card declines, refunds, disputes),
 * not to describe any real business.
 *
 * Big tables (users, trials, charges, spend, events) are written in the compact columnar form {columns, rows}; pass --rows to get
 * plain arrays of row objects instead (about twice as large, same content).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ───────────── options ───────────── */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const SEED = +opt('seed', 7);
const FROM = opt('from', '2025-09-01');
const NOW = Date.parse(opt('now', '2026-10-21T20:24:00Z'));
const OUT = resolve(ROOT, opt('out', 'data/demo.json'));
const AS_ROWS = argv.includes('--rows');
const HOURLY_DAYS = 8;           // spend rows are hourly for the last N days (Real-time), daily (hour 0) before that
const SPEND_SCALE = 0.85;        // overall budget multiplier

const DAY = 86400000, HOUR = 3600000, MIN = 60000;

/* ───────────── deterministic randomness ───────────── */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function weighted(pairs) { let tot = 0; for (const p of pairs) tot += p[1]; let x = rnd() * tot; for (const p of pairs) { x -= p[1]; if (x < 0) return p[0]; } return pairs[pairs.length - 1][0]; }
function poisson(lambda) { const f = Math.floor(lambda), frac = lambda - f; const n = f + (rnd() < frac ? 1 : 0); const jitter = Math.round((rnd() - 0.5) * Math.sqrt(lambda) * 1.4); return Math.max(0, n + jitter); }
function gamma(shape) { if (shape < 1) return gamma(shape + 1) * Math.pow(rnd(), 1 / shape); const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { const u1 = rnd() || 1e-12, u2 = rnd(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rnd(); if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } }
function beta(a, b) { const x = gamma(a), y = gamma(b); return x / (x + y); }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r2 = (x) => Math.round(x * 100) / 100;
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const isoDate = (ts) => { const d = new Date(ts); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); };
const startOfDay = (ts) => Math.floor(ts / DAY) * DAY;
const parseDate = (s) => Date.parse(s + 'T00:00:00Z');

/* ───────────── catalogue (fictional "Demo app") ───────────── */
const AB_START = '2026-08-17'; // paywall v2 A/B test starts
const PAYWALLS = [
  { id: 'pw_classic', label: 'Classic paywall', label_ru: 'Классический пейвол', from: FROM, to: null, variant: 'A' },
  { id: 'pw_v2', label: 'Paywall v2', label_ru: 'Пейвол v2', from: AB_START, to: null, variant: 'B' },
];
const PLANS = [
  { id: 'wk_3d_149', paywall: 'pw_classic', label: 'Weekly · 3-day trial for $1.49', label_ru: 'Неделя · 3 дня за $1.49', trialDays: 3, intro: 1.49, price: 7.99, period: 'week', periodDays: 7, from: FROM, to: null },
  { id: 'mo_7d_499', paywall: 'pw_classic', label: 'Monthly · 7-day trial for $4.99', label_ru: 'Месяц · 7 дней за $4.99', trialDays: 7, intro: 4.99, price: 29.99, period: 'month', periodDays: 30, from: FROM, to: null },
  { id: 'wk_free_3d', paywall: 'pw_v2', label: 'Weekly · 3-day free trial', label_ru: 'Неделя · 3 дня бесплатно', trialDays: 3, intro: 0, price: 7.99, period: 'week', periodDays: 7, from: AB_START, to: null },
  { id: 'mo_3d_249', paywall: 'pw_v2', label: 'Monthly · 3-day trial for $2.49', label_ru: 'Месяц · 3 дня за $2.49', trialDays: 3, intro: 2.49, price: 27.99, period: 'month', periodDays: 30, from: AB_START, to: null },
];
const PLAN = Object.fromEntries(PLANS.map((p) => [p.id, p]));
const PLAN_MIX = { pw_classic: [['wk_3d_149', 70], ['mo_7d_499', 30]], pw_v2: [['wk_free_3d', 62], ['mo_3d_249', 38]] };
/* sBG renewal retention per plan period: each payer draws a churn probability θ ~ Beta(α, β) and survives each renewal with 1 − θ */
const SBG = { week: { a: 1.7, b: 3.9 }, month: { a: 1.8, b: 4.6 } };

/* ───────────── geography & channels ───────────── */
const MARKETS = {
  NA: { countries: [['US', 82], ['CA', 18]], utc: -5, cpm: 14.6, from: FROM },
  EU: { countries: [['GB', 32], ['DE', 26], ['FR', 18], ['NL', 12], ['SE', 12]], utc: 1, cpm: 9.5, from: FROM },
  APAC: { countries: [['AU', 55], ['JP', 20], ['SG', 15], ['NZ', 10]], utc: 9, cpm: 10.7, from: '2026-02-01' },
};
const CPM_F = { US: 1.25, CA: 1.0, GB: 1.1, DE: 1.0, FR: 0.9, NL: 1.0, SE: 0.95, AU: 1.1, JP: 1.15, SG: 0.95, NZ: 0.9 };
const TIER_F = { T1: 1.0, T2: 0.9, other: 0.85 };
const CURRENCY_OF = { GB: 'GBP', DE: 'EUR', FR: 'EUR', NL: 'EUR' };
const FX = { USD: 1, EUR: 0.92, GBP: 0.79 };
const CONV_COUNTRIES = { GB: 1, DE: 1, FR: 1, NL: 1, SE: 1 }; // non-USD presentment → +1 % FX fee
const LANG_OF = { DE: 'de', FR: 'fr', NL: 'nl', SE: 'sv', JP: 'ja' };
const T1 = { US: 1, GB: 1, CA: 1, AU: 1, DE: 1, FR: 1, NL: 1, SE: 1, NZ: 1 }, T2 = { JP: 1, SG: 1 };
const tierOf = (c) => (T1[c] ? 'T1' : T2[c] ? 'T2' : 'other');
const CHANNEL_SHARE = { facebook: 0.56, google: 0.2, tiktok: 0.14, web2web: 0.1 };
/* channel economics vs the Facebook baseline: CPM, CTR, landing → signup, paywall → trial, trial → pay, in-app webview share, desktop share */
const CH_ECON = {
  facebook: { cpmF: 1.0, ctrF: 1.0, srF: 1.0, trF: 1.0, payF: 1.0, webview: 0.72, desktop: 0.1 },
  google: { cpmF: 5.8, ctrF: 3.0, srF: 1.45, trF: 1.2, payF: 1.06, webview: 0, desktop: 0.34 },
  tiktok: { cpmF: 0.5, ctrF: 1.1, srF: 0.65, trF: 0.82, payF: 0.74, webview: 0.8, desktop: 0.02 },
  web2web: { cpmF: 1.15, ctrF: 1.5, srF: 1.1, trF: 0.95, payF: 0.92, webview: 0, desktop: 0.24 },
  organic: { cpmF: 1, ctrF: 1, srF: 1, trF: 1.1, payF: 1.08, webview: 0.08, desktop: 0.28 },
};
const CREATIVE_F = { UGC: 1.15, PRODUCT_DEMO: 1.0, BEFORE_AFTER: 1.1, MEME: 0.9, STATIC_OFFER: 0.95, TUTORIAL: 1.05, SEARCH_GENERIC: 1.0, SEARCH_BRAND: 1.3, ARTICLE: 1.0, NEWSLETTER: 0.95 };
const PARTNERS = { 'Partner A': { cpa: 22 }, 'Partner B': { cpa: 17 } };
const ACCOUNTS = { 'FB-DEMO-1': 'Facebook · Demo account 1', 'FB-DEMO-2': 'Facebook · Demo account 2', 'G-DEMO-1': 'Google · Demo account', 'TT-DEMO-1': 'TikTok · Demo account' };
const DECLINES = [['insufficient_funds', 72], ['do_not_honor', 10], ['card_declined', 9], ['expired_card', 5], ['authentication_required', 4]];

/* campaign ▸ ad set ▸ ad (creative); w = budget weight inside the channel; countries = top-N countries of the market */
const CAMPAIGNS = [
  { id: 'c_fb_na_adv', campaign: 'FB · NA · Advantage+ Broad', channel: 'facebook', market: 'NA', from: FROM, to: null, w: 1.0, account: 'FB-DEMO-1', landing: 'default', placement: 'feed', objective: 'conversions', opt_event: 'TrialQualified', adsets: [
    { id: 'as_fb_na_broad', adset: 'Broad 25-54', ads: [['fb_na_ugc_01', 'UGC'], ['fb_na_demo_02', 'PRODUCT_DEMO']] },
    { id: 'as_fb_na_lal', adset: 'Lookalike 1%', ads: [['fb_na_ba_03', 'BEFORE_AFTER']] }] },
  { id: 'c_fb_eu_adv', campaign: 'FB · EU · Advantage+', channel: 'facebook', market: 'EU', from: FROM, to: null, w: 0.9, account: 'FB-DEMO-1', landing: 'default', placement: 'feed', objective: 'conversions', opt_event: 'TrialPaidOrSub', adsets: [
    { id: 'as_fb_eu_broad', adset: 'Broad EU', ads: [['fb_eu_ugc_01', 'UGC'], ['fb_eu_static_02', 'STATIC_OFFER']] }] },
  { id: 'c_fb_na_int', campaign: 'FB · NA · Interests', channel: 'facebook', market: 'NA', from: '2025-11-03', to: '2026-05-31', w: 0.5, account: 'FB-DEMO-2', landing: 'quiz', placement: 'reels', objective: 'conversions', opt_event: 'TrialQualified', adsets: [
    { id: 'as_fb_na_int', adset: 'Interests · Productivity', ads: [['fb_na_meme_04', 'MEME']] }] },
  { id: 'c_fb_apac', campaign: 'FB · APAC · Broad', channel: 'facebook', market: 'APAC', from: '2026-02-01', to: null, w: 0.9, account: 'FB-DEMO-2', landing: 'default', placement: 'feed', objective: 'conversions', opt_event: 'TrialPaidOrSub', adsets: [
    { id: 'as_fb_apac', adset: 'Broad APAC', ads: [['fb_apac_ugc_01', 'UGC'], ['fb_apac_tut_02', 'TUTORIAL']] }] },
  { id: 'c_fb_na_test', campaign: 'FB · NA · Creative test', channel: 'facebook', market: 'NA', from: '2026-07-06', to: null, w: 0.5, account: 'FB-DEMO-1', landing: 'offer', placement: 'reels', objective: 'conversions', opt_event: 'TrialQualified', adsets: [
    { id: 'as_fb_na_test', adset: 'Test · Mixed', ads: [['fb_na_tut_05', 'TUTORIAL'], ['fb_na_meme_06', 'MEME']] }] },
  { id: 'c_g_search_na', campaign: 'G · Search · NA', channel: 'google', market: 'NA', from: '2025-10-13', to: null, w: 1.0, account: 'G-DEMO-1', landing: 'default', placement: 'search', objective: 'conversions', opt_event: 'TrialPaidOrSub', countries: 2, adsets: [
    { id: 'ag_na_generic', adset: 'AG · generic', ads: [['kw_na_generic_01', 'SEARCH_GENERIC']] },
    { id: 'ag_na_brand', adset: 'AG · brand', ads: [['kw_na_brand_01', 'SEARCH_BRAND']] }] },
  { id: 'c_g_pmax_eu', campaign: 'G · PMax · EU', channel: 'google', market: 'EU', from: '2026-01-12', to: null, w: 0.7, account: 'G-DEMO-1', landing: 'offer', placement: 'pmax', objective: 'conversions', opt_event: 'TrialQualified', countries: 3, adsets: [
    { id: 'ag_eu_pmax', adset: 'Asset group · EU', ads: [['asset_eu_01', 'PRODUCT_DEMO']] }] },
  { id: 'c_tt_na', campaign: 'TT · NA · Spark ads', channel: 'tiktok', market: 'NA', from: '2026-01-05', to: null, w: 1.0, account: 'TT-DEMO-1', landing: 'quiz', placement: 'in-feed', objective: 'conversions', opt_event: 'TrialQualified', countries: 2, adsets: [
    { id: 'tg_na_spark', adset: 'Spark · UGC', ads: [['tt_na_ugc_01', 'UGC'], ['tt_na_meme_02', 'MEME']] }] },
  { id: 'c_tt_eu', campaign: 'TT · EU · Broad', channel: 'tiktok', market: 'EU', from: '2026-04-06', to: null, w: 0.6, account: 'TT-DEMO-1', landing: 'default', placement: 'in-feed', objective: 'conversions', opt_event: 'TrialQualified', countries: 3, adsets: [
    { id: 'tg_eu_broad', adset: 'Broad EU', ads: [['tt_eu_ugc_01', 'UGC']] }] },
  { id: 'c_w2w_a', campaign: 'W2W · Partner A', channel: 'web2web', market: 'NA', from: '2026-03-02', to: null, w: 1.0, account: null, landing: 'default', placement: 'article', objective: 'cpa', partner: 'Partner A', cost_model: 'cpa', opt_event: 'TrialPaidOrSub', countries: 2, adsets: [
    { id: 'pa_article', adset: 'Article widget', ads: [['pa_widget_01', 'ARTICLE']] }] },
  { id: 'c_w2w_b', campaign: 'W2W · Partner B', channel: 'web2web', market: 'EU', from: '2026-06-01', to: null, w: 0.8, account: null, landing: 'offer', placement: 'newsletter', objective: 'cpa', partner: 'Partner B', cost_model: 'cpa', opt_event: 'TrialQualified', countries: 3, adsets: [
    { id: 'pb_newsletter', adset: 'Newsletter', ads: [['pb_nl_01', 'NEWSLETTER']] }] },
];
const costModelOf = (c) => c.cost_model || (c.channel === 'google' ? 'cpc' : 'cpm');
/* one simulated payment-provider incident: renewals due in the window fail far more often (the board censors them in predictions) */
const INCIDENTS = [{ from: '2026-04-14T06:00:00Z', to: '2026-04-15T02:00:00Z', reason: 'Simulated payment provider outage (demo)' }];
const INC = INCIDENTS.map((w) => ({ from: Date.parse(w.from), to: Date.parse(w.to) }));
const inIncident = (ts) => INC.some((w) => ts >= w.from && ts < w.to);

/* ───────────── output tables ───────────── */
const users = [], trials = [], charges = [], refunds = [], disputes = [], spend = [], events = [];
const ids = { u: 0, t: 0, c: 0, r: 0, d: 0 };
const startTs = parseDate(FROM), todayStart = startOfDay(NOW), totalDays = Math.round((todayStart - startTs) / DAY);

function pspFee(amount, cardCountry, psp) {
  let f;
  if (psp === 'paypal') f = amount * 0.0349 + 0.49;
  else { f = amount * 0.029 + 0.3; if (cardCountry !== 'US') f += amount * 0.015; }
  if (CONV_COUNTRIES[cardCountry]) f += amount * 0.01;
  return r2(f);
}
function ev(u, ts, name, props) { if (ts <= NOW) events.push({ user_id: u.user_id, ts: Math.round(ts), name, props: props || null }); }
const sec = (ms) => (ms === null || ms === undefined ? ms : Math.floor(ms / 1000)); // timestamps are written as UNIX seconds (the loader accepts seconds, ms or ISO)
const hourWeight = (h) => (h >= 18 ? 1.7 : h >= 12 ? 1.1 : h >= 7 ? 0.85 : 0.45); // local hour → traffic weight (evening peak)

/* per-ad stable quality multipliers (CTR, signup rate, trial rate) */
const adQ = {};
for (const c of CAMPAIGNS) for (const as of c.adsets) for (const [adId] of as.ads) adQ[adId] = { ctr: 0.8 + rnd() * 0.45, sr: 0.85 + rnd() * 0.3, tr: 0.88 + rnd() * 0.26 };

/* ───────────── monetisation of one user (trial → renewals) ───────────── */
function monetise(u, trialTs, paywall, planId) {
  const P = PLAN[planId], tier = tierOf(u.country), econ = CH_ECON[u.channel] || CH_ECON.organic, freeTrial = P.intro === 0;
  let pm = weighted([['card', 68], ['apple_pay', 16], ['google_pay', 8], ['paypal', 6], ['link', 2]]);
  if (pm === 'apple_pay' && u.os !== 'ios' && u.os !== 'macos') pm = 'card';
  if (pm === 'google_pay' && u.os !== 'android' && !(u.device_class === 'desktop' && u.browser === 'chrome')) pm = 'card';
  const wallet = pm === 'apple_pay' || pm === 'google_pay' || pm === 'link', psp = pm === 'paypal' ? 'paypal' : 'stripe';
  u.psp = psp; u.payment_method = pm;
  let funding = wallet ? weighted([['credit', 55], ['debit', 45]]) : weighted(freeTrial ? [['credit', 34], ['debit', 44], ['prepaid', 22]] : [['credit', 46], ['debit', 43], ['prepaid', 11]]);
  if (u.channel === 'tiktok' && funding === 'debit' && rnd() < 0.3) funding = 'prepaid';
  const cardCountry = rnd() < 0.94 ? u.country : weighted(MARKETS[u.market].countries);
  const fundingF = { credit: 1.15, debit: 1.0, prepaid: 0.55 }[funding], walletF = wallet ? 1.35 : 1, priceF = u.price_test === 'plus15' ? 1.15 : 1;
  const cur = u.locale_currency, fx = FX[cur] || 1;
  const t = { trial_id: 'tr_' + (++ids.t), user_id: u.user_id, ts: Math.round(trialTs), plan: planId, paywall, intro_amount_usd: P.intro, qualified: true, cancelled_ts: null };
  let flags = null, lastOk = null;

  function addCharge(ts, type, n, amount, attempt, pOk, plan) {
    if (inIncident(ts)) pOk *= 0.15;
    const ok = rnd() < pOk;
    let disc = 0, coupon = null;
    if (flags && flags.coupon && amount > 0) { coupon = 'DEMO20'; disc = r2(amount * 0.2); amount = r2(amount - disc); }
    const c = { charge_id: 'ch_' + (++ids.c), user_id: u.user_id, ts: Math.round(ts), type, plan: type === 'pack' ? null : plan, n, amount_usd: amount, status: ok ? 'succeeded' : 'failed', decline_code: null, attempt,
      card_country: cardCountry, card_funding: funding, fee_usd: ok ? pspFee(amount, cardCountry, psp) : 0, psp, payment_method: pm,
      currency: cur === 'USD' ? null : cur, amount_local: cur === 'USD' ? null : r2(amount * fx), fx_rate: cur === 'USD' ? null : fx,
      fx_fee_usd: ok && CONV_COUNTRIES[cardCountry] ? r2(amount * 0.01) : null, is_upgrade: flags && flags.upgrade ? true : null, is_winback: flags && flags.winback ? true : null, coupon, discount_usd: disc || null };
    if (!ok) c.decline_code = inIncident(ts) ? 'processing_error' : funding === 'prepaid' && rnd() < 0.85 ? 'insufficient_funds' : wallet && rnd() < 0.2 ? 'authentication_required' : weighted(DECLINES);
    charges.push(c);
    if (ok) flags = null;
    return c;
  }
  function sideFlows(c) { // refund / dispute after a successful charge (mostly early in the subscription); true → subscription stops
    const early = !(c.n >= 3);
    if (rnd() < (early ? 0.022 : 0.005)) {
      const lag = rnd() < 0.8 ? rnd() * 3 * DAY : 3 * DAY + rnd() * 20 * DAY;
      if (c.ts + lag <= NOW) { refunds.push({ refund_id: 'rf_' + (++ids.r), charge_id: c.charge_id, user_id: u.user_id, ts: Math.round(c.ts + lag), amount_usd: c.amount_usd }); return true; }
    } else if (rnd() < (early ? 0.0045 : 0.001)) {
      const lag = (10 + rnd() * 35) * DAY;
      if (c.ts + lag <= NOW) {
        const status = NOW - (c.ts + lag) > 14 * DAY ? (rnd() < 0.8 ? 'lost' : 'won') : 'open';
        disputes.push({ dispute_id: 'dp_' + (++ids.d), charge_id: c.charge_id, user_id: u.user_id, ts: Math.round(c.ts + lag), amount_usd: c.amount_usd, fee_usd: 15, reason: weighted([['fraudulent', 80], ['subscription_canceled', 14], ['product_not_received', 6]]), status });
        return true;
      }
    }
    return false;
  }

  if (P.intro > 0) { // paid intro at checkout; a decline here means no trial
    const ch = addCharge(trialTs, 'intro', 0, P.intro, 1, u.webview ? 0.93 : 0.965, planId);
    if (ch.status !== 'succeeded') { u.checkout_error = { psp, payment_method: pm, code: ch.decline_code }; ev(u, trialTs, 'checkout_error', u.checkout_error); return; }
    sideFlows(ch);
  }
  trials.push(t);
  u.plan = planId;
  ev(u, trialTs, 'trial_start');
  // cancel during the trial (20-minute qualification timer first)
  let cancelP = freeTrial ? 0.5 : P.period === 'month' ? 0.3 : 0.28;
  if (u.experiments.onboarding === 'B') cancelP *= 0.94;
  if (rnd() < cancelP) {
    const inTimer = rnd() < (freeTrial ? 0.24 : 0.3);
    t.cancelled_ts = Math.round(trialTs + (inTimer ? rnd() * 20 * MIN : 20 * MIN + rnd() * (P.trialDays * DAY - 20 * MIN)));
    t.qualified = !inTimer;
    if (t.cancelled_ts > NOW) { t.cancelled_ts = null; t.qualified = true; }
    return;
  }
  const trialEnd = trialTs + P.trialDays * DAY;
  if (trialEnd > NOW) return; // trial still running
  const pOk1 = clamp((freeTrial ? 0.56 : P.period === 'month' ? 0.68 : 0.76) * TIER_F[tier] * fundingF * walletF * econ.payF / priceF, 0.03, 0.97);
  const sb = SBG[P.period], tierB = { T1: 1.0, T2: 0.92, other: 0.85 }[tier] * (econ.payF > 1 ? 1.08 : econ.payF < 0.8 ? 0.85 : 1);
  const theta = beta(sb.a, sb.b * tierB); // this payer's per-renewal churn probability (heterogeneity → sBG retention curve)
  let k = 1, ts = trialEnd, CP = P, price = r2(P.price * priceF), winbackDue = false, wonBack = false, ch = null;
  while (ts <= NOW) {
    if (k === 1 && rnd() < 0.05) flags = { coupon: true };
    if (k > 1 && !winbackDue) {
      if (rnd() < theta) { // voluntary cancel before renewal k
        if (rnd() < 0.05) { const gap = (10 + rnd() * 30) * DAY; if (ts + gap > NOW) break; ts += gap; wonBack = true; winbackDue = true; continue; }
        break;
      }
      if (CP.period === 'week' && k >= 4 && rnd() < 0.025) { CP = paywall === 'pw_v2' ? PLAN.mo_3d_249 : PLAN.mo_7d_499; price = CP.price; flags = { upgrade: true }; }
    }
    winbackDue = false;
    if (wonBack) flags = Object.assign({}, flags || {}, { winback: true }); // every charge of the returning subscription is flagged is_winback
    const pOk = k === 1 ? pOk1 : funding === 'prepaid' ? 0.8 : wallet ? 0.97 : 0.94;
    let ok = false, a;
    for (a = 1; a <= 4 && ts + (a - 1) * DAY <= NOW; a++) { // dunning: up to 4 attempts, one day apart
      ch = addCharge(ts + (a - 1) * DAY, k === 1 ? 'rebill' : 'renewal', k, price, a, a === 1 ? pOk : k === 1 ? 0.05 : wallet ? 0.4 : 0.25, CP.id);
      if (ch.status === 'succeeded') { ok = true; break; }
    }
    if (!ok) break;
    lastOk = ch;
    if (sideFlows(ch)) break;
    k++; ts = ch.ts - (a - 1) * DAY + CP.periodDays * DAY;
  }
  if (lastOk && rnd() < (tier === 'T1' ? 0.07 : 0.045)) { // one-off add-on pack, mostly in the first week
    const pts = trialTs + (rnd() < 0.7 ? rnd() * 7 * DAY : 7 * DAY + rnd() * 30 * DAY);
    if (pts <= NOW) { flags = null; const pc = addCharge(pts, 'pack', 0, weighted([[4.99, 5], [9.99, 3], [14.99, 2]]), 1, 0.95, null); if (pc.status === 'succeeded') sideFlows(pc); }
  }
}

/* ───────────── one signup ───────────── */
function makeUser(ts, market, src, country) {
  const c = src ? src.campaign : null, channel = c ? c.channel : 'organic', econ = CH_ECON[channel];
  const day = isoDate(ts), abOn = day >= AB_START;
  const paywall = abOn ? (rnd() < 0.5 ? 'pw_classic' : 'pw_v2') : 'pw_classic';
  const ig = rnd() < 0.35;
  const dc = rnd() < econ.desktop ? 'desktop' : rnd() < 0.035 ? 'tablet' : 'mobile';
  let os = dc === 'desktop' ? weighted([['windows', 58], ['macos', 37], ['other', 5]]) : weighted([['ios', market === 'NA' ? 60 : market === 'APAC' ? 55 : 45], ['android', market === 'NA' ? 40 : market === 'APAC' ? 45 : 55]]);
  if (dc === 'tablet') os = rnd() < 0.72 ? 'ios' : 'android';
  let browser;
  if (dc === 'mobile' && rnd() < econ.webview) browser = channel === 'tiktok' ? 'tiktok_webview' : ig ? 'instagram_webview' : 'fb_webview';
  else if (os === 'ios') browser = rnd() < 0.8 ? 'safari' : 'chrome';
  else if (os === 'android') browser = rnd() < 0.9 ? 'chrome' : 'other';
  else browser = weighted([['chrome', 68], ['safari', os === 'macos' ? 60 : 2], ['other', 10]]);
  const webview = /webview/.test(browser);
  const clickId = channel === 'facebook' ? (rnd() < 0.9 ? 'fbclid' : 'none') : channel === 'google' ? (rnd() < 0.86 ? 'gclid' : 'none') : channel === 'tiktok' ? (rnd() < 0.85 ? 'ttclid' : 'none') : 'none';
  const u = {
    user_id: 'u' + (++ids.u), signup_ts: Math.round(ts), country, market, channel,
    campaign_id: c ? c.id : 'organic', campaign: c ? undefined : 'Organic', adset_id: c ? undefined : 'organic', adset: c ? undefined : 'Organic', ad_id: src ? src.ad : null, ad: c ? undefined : 'Organic',
    partner: c && c.partner ? c.partner : null,
    utm_source: channel === 'facebook' ? (ig ? 'instagram' : 'facebook') : channel === 'web2web' ? c.partner.toLowerCase().replace(/\s+/g, '_') : channel === 'organic' ? null : channel,
    utm_medium: channel === 'facebook' || channel === 'tiktok' ? 'paid_social' : channel === 'google' ? 'cpc' : channel === 'web2web' ? 'affiliate' : null,
    device: os === 'ios' ? 'ios' : os === 'android' ? 'android' : 'desktop', device_class: dc, os, browser,
    lang: LANG_OF[country] || 'en', has_email: rnd() < (webview ? 0.78 : 0.9), click_id_type: clickId, fbclid_present: clickId === 'fbclid' ? true : null,
    landing: c ? c.landing : weighted([['default', 75], ['quiz', 15], ['offer', 10]]), landing_variant: rnd() < 0.5 ? 'lp_a' : 'lp_b',
    price_test: paywall === 'pw_v2' ? (rnd() < 0.2 ? 'plus15' : 'base') : null, locale_currency: CURRENCY_OF[country] || 'USD',
    paywall, plan: null, experiments: abOn ? { onboarding: rnd() < 0.5 ? 'A' : 'B', paywall } : { onboarding: rnd() < 0.5 ? 'A' : 'B' },
    paywall_viewed_ts: null, checkout_ts: null, checkout_error: null, psp: null, payment_method: null, webview,
  };
  users.push(u);
  ev(u, ts, 'signup');
  if (rnd() < (u.experiments.onboarding === 'B' ? 0.76 : 0.7)) { // paywall view → checkout → trial
    const pv = ts + rnd() * 20 * MIN;
    if (pv > NOW) return;
    u.paywall_viewed_ts = Math.round(pv);
    ev(u, pv, 'paywall_view');
    const q = src ? adQ[src.ad].tr * (CREATIVE_F[src.creative] * 0.6 + 0.4) : 1.05;
    let pTrial = 0.42 * q * econ.trF * (u.experiments.onboarding === 'B' ? 1.08 : 1) * { T1: 1.0, T2: 0.92, other: 0.85 }[tierOf(country)];
    if (paywall === 'pw_v2') pTrial *= 1.22; // free / cheaper trial converts easier
    if (webview) pTrial *= 0.8;
    if (u.price_test === 'plus15') pTrial *= 0.92;
    let wants = rnd() < clamp(pTrial, 0.04, 0.85);
    if (!(wants || rnd() < 0.17)) return;
    const co = u.paywall_viewed_ts + rnd() * 8 * MIN;
    if (co > NOW) return;
    u.checkout_ts = Math.round(co);
    const pmGuess = weighted([['card', 72], ['apple_pay', os === 'ios' || os === 'macos' ? 16 : 0], ['google_pay', os === 'android' ? 8 : 0], ['paypal', 6], ['link', 2]]);
    const pspGuess = pmGuess === 'paypal' ? 'paypal' : 'stripe';
    ev(u, co, 'checkout_start', { psp: pspGuess, payment_method: pmGuess });
    if (wants) {
      if (rnd() < (webview ? 0.11 : 0.05)) { // checkout error; ~55 % retry and still start the trial
        u.checkout_error = { psp: pspGuess, payment_method: pmGuess, code: weighted([['card_declined', 45], ['authentication_required', 30], ['insufficient_funds', 15], ['expired_card', 10]]) };
        ev(u, co + rnd() * MIN, 'checkout_error', u.checkout_error);
        if (rnd() < 0.45) wants = false;
      }
      if (wants) { const tts = co + rnd() * 4 * MIN; if (tts <= NOW) monetise(u, tts, paywall, weighted(PLAN_MIX[paywall])); }
    } else if (rnd() < 0.3) {
      u.checkout_error = { psp: pspGuess, payment_method: pmGuess, code: weighted([['card_declined', 50], ['authentication_required', 35], ['insufficient_funds', 15]]) };
      ev(u, co + rnd() * MIN, 'checkout_error', u.checkout_error);
    }
  }
}

/* ───────────── day loop: budgets → spend rows → signups ───────────── */
const growth = (d) => { // daily budget (USD): launch, steady growth, a summer plateau, a strong last quarter
  const t = d / Math.max(1, totalDays);
  return SPEND_SCALE * (120 + 600 * Math.pow(t, 2.3) + 30 * Math.sin(t * Math.PI * 3.1));
};
for (let dayTs = startTs, d = 0; dayTs <= NOW; dayTs += DAY, d++) {
  const date = isoDate(dayTs), dow = new Date(dayTs).getUTCDay();
  const season = 1 + (dow === 0 || dow === 6 ? 0.07 : dow === 2 || dow === 3 ? -0.05 : 0.02) + (rnd() - 0.5) * 0.12;
  const total = growth(d) * season;
  const hourly = dayTs >= todayStart - (HOURLY_DAYS - 1) * DAY;
  const lastHour = dayTs === todayStart ? Math.floor((NOW - todayStart) / HOUR) : 23;
  const curFrac = dayTs === todayStart ? ((NOW - todayStart) % HOUR) / HOUR : 1;
  const live = CAMPAIGNS.filter((c) => date >= c.from && (!c.to || date <= c.to) && date >= MARKETS[c.market].from);
  const mkt = date >= MARKETS.APAC.from ? { NA: 0.5, EU: 0.34, APAC: 0.16 } : { NA: 0.58, EU: 0.42, APAC: 0 };
  const chLive = new Set(live.map((c) => c.channel)), chTot = [...chLive].reduce((s, ch) => s + CHANNEL_SHARE[ch], 0);
  const cW = {}; live.forEach((c) => { cW[c.channel] = (cW[c.channel] || 0) + c.w * mkt[c.market]; });
  const chMul = {}; chLive.forEach((ch) => { chMul[ch] = Math.exp((rnd() - 0.5) * 0.6); }); // daily budget moves per channel; CPM rises with the push (diminishing returns)
  for (const c of live) {
    const econ = CH_ECON[c.channel], M = MARKETS[c.market];
    const cSpend = total * (CHANNEL_SHARE[c.channel] / chTot) * (c.w * mkt[c.market]) / cW[c.channel] * chMul[c.channel];
    const nAds = c.adsets.reduce((s, as) => s + as.ads.length, 0);
    const hw = []; let hwSum = 0;
    for (let h = 0; h < 24; h++) { hw[h] = hourWeight((h + M.utc + 24) % 24) * (0.8 + rnd() * 0.4); hwSum += hw[h]; }
    const hwCum = []; { let acc = 0; for (let h = 0; h <= lastHour; h++) { acc += hw[h] * (h === lastHour ? curFrac : 1); hwCum[h] = acc; } }
    const dayFrac = hwCum[lastHour] / hwSum; // share of the day's budget already spent (today: up to "now")
    const cpm = M.cpm * (0.9 + rnd() * 0.2) * econ.cpmF * Math.pow(chMul[c.channel], 0.35);
    const cl = c.countries ? M.countries.slice(0, c.countries) : M.countries;
    const cw = cl.map((p) => [p[0], p[1] * (0.85 + rnd() * 0.3)]), cwSum = cw.reduce((s, p) => s + p[1], 0);
    for (const as of c.adsets) for (const [adId, creative] of as.ads) {
      const q = adQ[adId], src = { campaign: c, adset: as, ad: adId, creative };
      const adSpend = cSpend / nAds * (0.7 + rnd() * 0.6);
      const slots = hourly ? Array.from({ length: lastHour + 1 }, (_, h) => [h, hw[h] / hwSum * (h === lastHour ? curFrac : 1)]) : [[0, dayFrac]];
      for (const [h, share] of slots) {
        const sp = adSpend * share;
        if (sp < 0.01) continue;
        for (const [country, wC] of cw) {
          const spc = sp * wC / cwSum;
          if (spc < 0.03) continue;
          const impr = Math.round(spc / (cpm * (CPM_F[country] || 1)) * 1000);
          const clicks = poisson(impr * 0.0098 * q.ctr * econ.ctrF * (CREATIVE_F[creative] * 0.5 + 0.5));
          const link = Math.round(clicks * 0.92), land = Math.round(link * 0.78);
          const signups = poisson(land * 0.24 * q.sr * econ.srF);
          spend.push({ date, hour: h, campaign_id: c.id, ad_id: adId, country, spend_usd: r2(spc), impressions: impr, clicks, link_clicks: link, landing_views: land });
          for (let s = 0; s < signups; s++) {
            let ts;
            if (hourly) ts = dayTs + h * HOUR + rnd() * HOUR * (h === lastHour ? curFrac : 1);
            else { const x = rnd() * hwCum[lastHour]; let hh = 0; while (hh < lastHour && hwCum[hh] < x) hh++; ts = dayTs + hh * HOUR + rnd() * HOUR; }
            if (ts <= NOW) makeUser(ts, c.market, src, country);
          }
        }
      }
    }
  }
  // organic / untagged traffic (~3 % of signups, grows with brand awareness)
  const org = poisson(1 + 3 * d / Math.max(1, totalDays));
  for (let o = 0; o < org; o++) {
    const oh = Math.floor(rnd() * (lastHour + 1)), ots = dayTs + oh * HOUR + rnd() * HOUR * (oh === lastHour ? curFrac : 1);
    const market = weighted([['NA', 55], ['EU', 35], ['APAC', date >= MARKETS.APAC.from ? 10 : 0.001]]);
    if (ots <= NOW) makeUser(ots, market, null, weighted(MARKETS[market].countries));
  }
}

/* ───────────── assemble ───────────── */
const byTs = (a, b) => a.ts - b.ts;
users.sort((a, b) => a.signup_ts - b.signup_ts); trials.sort(byTs); charges.sort(byTs); refunds.sort(byTs); disputes.sort(byTs); events.sort(byTs);
users.forEach((u) => { delete u.webview; });
const campaigns = CAMPAIGNS.map((c) => ({ campaign_id: c.id, campaign: c.campaign, channel: c.channel, market: c.market, account: c.account, opt_event: c.opt_event, paywall_mode: 'random',
  partner: c.partner || null, cost_model: costModelOf(c), contracted_cpa: c.partner ? PARTNERS[c.partner].cpa : null, placement: c.placement, objective: c.objective, from: c.from, to: c.to }))
  .concat([{ campaign_id: 'organic', campaign: 'Organic', channel: 'organic', market: null, account: null, opt_event: null, paywall_mode: null, partner: null, cost_model: null, contracted_cpa: null, placement: null, objective: null, from: null, to: null }]);
const ads = [];
for (const c of CAMPAIGNS) for (const as of c.adsets) for (const [adId, creative] of as.ads) ads.push({ ad_id: adId, ad: adId, adset_id: as.id, adset: as.adset, creative, campaign_id: c.id });

function table(rows, columns) {
  if (AS_ROWS) return rows.map((r) => { const o = {}; for (const k of columns) if (r[k] !== null && r[k] !== undefined) o[k] = r[k]; return o; });
  return { columns, rows: rows.map((r) => columns.map((k) => (r[k] === undefined ? null : r[k]))) };
}
const meta = {
  source: 'demo', label: 'Demo data', label_ru: 'Демо-данные', product: 'Demo app', synthetic: true,
  note: 'Synthetic data generated by tools/generate-demo-data.mjs. Every product, campaign, partner, user and payment in this file is invented.',
  seed: SEED, from: FROM, to: isoDate(NOW), generated_at: new Date(NOW).toISOString(),
  accounts: Object.fromEntries(Object.entries(ACCOUNTS).map(([id, label]) => [id, { label }])),
};
const doc = {
  meta, now: new Date(NOW).toISOString(), plans: PLANS, paywalls: PAYWALLS, campaigns, ads, incidents: INCIDENTS,
  users: table(users.map((u) => Object.assign({}, u, { signup_ts: sec(u.signup_ts) })), ['user_id', 'signup_ts', 'country', 'market', 'channel', 'campaign_id', 'ad_id', 'utm_source', 'utm_medium', 'device_class', 'os', 'browser', 'lang', 'has_email', 'click_id_type', 'landing', 'landing_variant', 'price_test', 'locale_currency', 'paywall', 'plan', 'experiments']),
  trials: table(trials.map((t) => Object.assign({}, t, { ts: sec(t.ts), cancelled_ts: sec(t.cancelled_ts) })), ['trial_id', 'user_id', 'ts', 'plan', 'paywall', 'intro_amount_usd', 'qualified', 'cancelled_ts']),
  charges: table(charges.map((c) => Object.assign({}, c, { ts: sec(c.ts) })), ['charge_id', 'user_id', 'ts', 'type', 'plan', 'n', 'attempt', 'amount_usd', 'status', 'decline_code', 'fee_usd', 'payment_method', 'card_country', 'card_funding', 'currency', 'fx_fee_usd', 'is_upgrade', 'is_winback', 'coupon', 'discount_usd']),
  refunds: refunds.map((r) => Object.assign({}, r, { ts: sec(r.ts) })), disputes: disputes.map((x) => Object.assign({}, x, { ts: sec(x.ts) })),
  spend: table(spend, ['date', 'hour', 'campaign_id', 'ad_id', 'country', 'spend_usd', 'impressions', 'clicks', 'link_clicks', 'landing_views']),
  events: table(events.map((e) => Object.assign({}, e, { ts: sec(e.ts) })), ['user_id', 'ts', 'name', 'props']),
};
mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(doc);
writeFileSync(OUT, json);
const status = { run_at: new Date(NOW).toISOString(), ok: true, demo: true, stale: [], note: 'Demo status: the board ships with synthetic data, no live sources are connected.',
  sources: Object.fromEntries(['ads', 'analytics', 'payments', 'product_db'].map((k) => [k, { ok: true, stale: false, updated_at: new Date(NOW).toISOString(), error: null, note: 'demo' }])) };
writeFileSync(resolve(dirname(OUT), 'status.json'), JSON.stringify(status, null, 1) + '\n');
const spendTot = spend.reduce((s, r) => s + r.spend_usd, 0);
console.log(`demo data → ${OUT} (${(json.length / 1048576).toFixed(2)} MB): ${users.length} users, ${trials.length} trials, ${charges.length} charges, ${refunds.length} refunds, ${disputes.length} disputes, ${spend.length} spend rows ($${Math.round(spendTot).toLocaleString('en-US')}), ${events.length} events`);
