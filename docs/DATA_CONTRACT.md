# Data contract

Web-to-Web BI Board reads one JSON document. The demo file `data/demo.json` follows this contract, and so can yours: export your ad spend, signups, trials and payments into the same tables and every page computes cohorts, predictions, real-time views and the funnel map from them.

- [Loading your file](#loading-your-file)
- [Document shape](#document-shape)
- [Timestamps and money](#timestamps-and-money)
- [Tables](#tables): `users`, `trials`, `charges`, `refunds`, `disputes`, `spend`, `campaigns`, `ads`, `events`, `plans`, `paywalls`, `incidents`, `subscriptions`
- [Which page needs what](#which-page-needs-what)
- [Compact columnar form](#compact-columnar-form)
- [Validation](#validation)
- [Minimal example](#minimal-example)

Fields marked **required** must be present. Everything else is optional: a missing field gets a documented default, and the board says so in a data note instead of failing.

## Loading your file

The board looks for the data URL in this order:

1. `?data=<url>` in the page address, for example `index.html?data=./data/my-export.json`
2. `window.BB_DATA_URL` set by a script before `core.js`
3. the `data-src` attribute of the `core.js` script tag (the four HTML pages ship with `data-src="./data/demo.json"`)
4. `./data/demo.json`

The path is relative to the page. Serve the folder over HTTP (`file://` does not work because the browser blocks `fetch`). If the file cannot be loaded or fails validation, the page shows an error card with the reasons and a link back to the demo data.

## Document shape

```json
{
  "meta": { "label": "My app · export 2026-10-21", "from": "2025-09-01", "to": "2026-10-21", "generated_at": "2026-10-21T20:24:00Z" },
  "now": "2026-10-21T20:24:00Z",
  "plans": [], "paywalls": [], "campaigns": [], "ads": [], "incidents": [],
  "users": [], "trials": [], "charges": [], "refunds": [], "disputes": [], "spend": [], "events": []
}
```

| Key | Type | Meaning |
|---|---|---|
| `meta` | object | `label` (badge text in the left rail), `label_ru`, `from` / `to` (YYYY-MM-DD, the data window; `from` drives the "All time" range), `generated_at` (time), `accounts` (`{ "<account id>": { "label": "…" } }`, names for the Account selector). Any extra keys are kept and ignored. |
| `now` | time | The "as of" moment. "Today", maturity of cohort cells and every forecast are computed relative to it. Defaults to `meta.generated_at`, then to the browser clock. |
| `users` | table | **required**. One row per signup. |
| `trials`, `charges`, `refunds`, `disputes`, `spend` | table | Expected. A missing table is treated as empty and reported as a warning. |
| `campaigns`, `ads`, `events`, `plans`, `paywalls`, `incidents`, `subscriptions` | table | Optional lookups and extras, described below. |

## Timestamps and money

- **Times** (`*_ts`, `ts`, `from`/`to` of incidents) accept UNIX milliseconds, UNIX seconds (any number below 10^11 is read as seconds) or ISO 8601 strings. Everything is treated as UTC.
- **Dates** (`spend.date`, catalogue `from`/`to`) are `YYYY-MM-DD`. `spend.date` may also be an ISO datetime or milliseconds; the hour is then taken from it.
- **Money** is in USD (`*_usd`). Local currency is optional and only used by the "Local" currency toggle.

## Tables

### users (required)

One row per signup (the cohort member). Used by every page.

| Field | Type | Meaning |
|---|---|---|
| `user_id` | string | **required**. Unique id; every other table joins on it. |
| `signup_ts` | time | **required**. Signup moment; the cohort anchor when cohorts are "by signup". |
| `country` | string | ISO 3166-1 alpha-2. Drives the geo tier (T1, T2, LATAM, other), country breakdowns and the Real-time geo × hour grid. |
| `market` | string | Your market grouping (for example NA, EU). Inherited from the campaign when absent. |
| `channel` | string | `facebook`, `google`, `tiktok`, `web2web` or `organic`. When absent it is derived from `click_id_type`, `utm_source`, `partner` or `ad_id`. |
| `campaign_id` | string | Joins `campaigns` and `spend`. Use `organic` for unpaid traffic. |
| `ad_id` | string | Joins `ads` and `spend`. Signups of an ad on a date carry that ad's spend when a breakdown cannot be read from spend rows directly. |
| `campaign`, `adset_id`, `adset`, `ad`, `creative` | string | Names for the campaign ▸ ad set ▸ ad hierarchy. Inherited from `campaigns` / `ads` when absent. |
| `partner`, `placement`, `objective`, `cost_model`, `contracted_cpa` | string / number | Campaign attributes; inherited from `campaigns` when absent. `contracted_cpa` (USD) is the Web2Web partner's contract price. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` | string | Attribution dimensions for filters and breakdowns. |
| `device_class` | string | `mobile`, `desktop` or `tablet` (Device toggle). Defaults from `device`. |
| `os` | string | `ios`, `android`, `windows`, `macos`, `other`. |
| `device` | string | `ios`, `android` or `desktop`; derived from `os` when absent. |
| `browser` | string | For example `safari`, `chrome`, `instagram_webview`, `fb_webview`, `tiktok_webview`. In-app webviews feed the webview share chip. |
| `lang`, `region`, `locale_currency` | string | Extra dimensions. `locale_currency` (ISO 4217) enables the "Local" currency toggle when one currency covers 90 % of the slice. |
| `has_email` | boolean | Used with the click id for the EMQ proxy (Event Match Quality). Defaults to `false`. |
| `click_id_type` | string | `fbclid`, `gclid`, `ttclid`, … or `none` (attribution health). |
| `fbclid_present` | boolean | Derived from `click_id_type` when absent. |
| `landing`, `landing_variant`, `price_test` | string | Landing page, landing A/B variant, price test arm: breakdowns and the User flow landing column. |
| `experiments` | object | `{ "onboarding": "A" or "B", "paywall": "<paywall id>" }`: the A/B tests card and the onboarding column of the User flow. |
| `paywall`, `plan` | string | Paywall the user saw and plan they started (ids from the catalogue). |
| `paywall_viewed_ts`, `checkout_ts` | time | Funnel steps. Derived from `events` (`paywall_view`, `checkout_start`) when absent. |
| `checkout_error` | object | `{ "psp", "payment_method", "code" }`. Derived from the last `checkout_error` event when absent. |
| `psp`, `payment_method` | string | Derived from the user's first charge when absent. |

### trials

One row per started trial (subscription start). Used by all pages.

| Field | Type | Meaning |
|---|---|---|
| `trial_id` | string | **required**. Unique id. |
| `user_id` | string | **required**. |
| `ts` | time | **required**. Trial start; the cohort anchor when cohorts are "by trial". |
| `plan` | string | **required**. Plan id from `plans`. The plan sets trial length, period and price for forecasts. |
| `paywall` | string | Paywall id. |
| `intro_amount_usd` | number | Paid intro price (0 for a free trial). |
| `qualified` | boolean | Trial not cancelled within the first 20 minutes ("qualified trial"). |
| `cancelled_ts` | time | When the user cancelled during the trial, else null. |

### charges

One row per payment attempt. Used by all pages: revenue, payers, rebill and renewal outcomes, billing health and forecasts.

| Field | Type | Meaning |
|---|---|---|
| `charge_id` | string | **required**. Unique id. |
| `user_id` | string | **required**. |
| `ts` | time | **required**. Attempt time. |
| `type` | string | **required**. `intro` (paid trial at checkout), `rebill` (first payment after the trial), `renewal` (later periods) or `pack` (one-off add-on purchase). |
| `amount_usd` | number | **required**. Charged amount (after discount). |
| `status` | string | **required**. `succeeded` or `failed`; anything else counts as failed. |
| `n` | integer | Renewal index: 0 for intro and pack, 1 for the first rebill, 2, 3… for renewals. Retention curves and forecasts are built on it. |
| `attempt` | integer | Dunning attempt 1 to 4 for the same `n` (Billing health, recovery rate). |
| `plan` | string | Plan of the period charged (an upgrade switches it). |
| `decline_code` | string | For failed attempts: `insufficient_funds`, `card_declined`, `do_not_honor`, `expired_card`, `authentication_required`, … |
| `fee_usd` | number | Payment provider fee. When absent it is estimated: card 2.9 % + $0.30, +1.5 % for non-US cards, +1 % for non-USD presentment; PayPal 3.49 % + $0.49. |
| `psp` | string | `stripe`, `paypal` or `paddle`. Derived from `payment_method` when absent. |
| `payment_method` | string | `card`, `apple_pay`, `google_pay`, `paypal`, `link`. Defaults to `card`. |
| `card_country`, `card_funding` | string | Card issuing country and `credit` / `debit` / `prepaid` (billing health by card type). |
| `currency`, `amount_local`, `fx_rate`, `fx_fee_usd` | string / number | Presentment currency details. Default USD and 0. |
| `is_upgrade`, `is_winback` | boolean | Weekly to monthly upgrade; returning subscriber after a lapse (MRR movement, win-back rate). |
| `coupon`, `discount_usd` | string / number | Coupon code and discount amount (coupon share). |

### refunds

| Field | Type | Meaning |
|---|---|---|
| `refund_id` | string | Id. |
| `charge_id` | string | Refunded charge. |
| `user_id` | string | **required**. |
| `ts` | time | **required**. |
| `amount_usd` | number | **required**. Subtracted from net revenue; ends the subscription. |

### disputes

| Field | Type | Meaning |
|---|---|---|
| `dispute_id`, `charge_id` | string | Ids. |
| `user_id` | string | **required**. |
| `ts` | time | **required**. |
| `amount_usd` | number | **required**. Disputed amount. |
| `fee_usd` | number | Dispute fee, default 15. |
| `reason`, `status` | string | For example `fraudulent`; `open`, `won`, `lost`. Compared with the 0.75 % dispute threshold in Billing health. |

### spend

Ad spend rows. Hourly rows give the Real-time page an hourly pace; daily rows (`hour` 0) are enough for cohorts and forecasts.

| Field | Type | Meaning |
|---|---|---|
| `date` | date | **required**. `YYYY-MM-DD` (UTC). |
| `hour` | integer | 0 to 23 (UTC). Default 0. |
| `campaign_id` | string | **required**. |
| `ad_id` | string | **required**. |
| `spend_usd` | number | **required**. |
| `impressions`, `clicks`, `link_clicks`, `landing_views` | integer | Traffic counters (CTR, CPC, CPM, landing to signup, entry of the User flow). Default 0. |
| `country` | string | When present, geo CPT and ROAS use real spend; otherwise spend is allocated by signups and marked "≈ spend allocated". |
| `channel`, `market`, `account`, `campaign`, `adset_id`, `adset`, `ad`, `creative`, `platform_placement`, `objective`, `partner`, `cost_model`, `contracted_cpa` | string / number | Inherited from `campaigns` and `ads` when absent. |

### campaigns (optional lookup)

One row per campaign. When the table is absent it is built from `spend` and `users`.

| Field | Type | Meaning |
|---|---|---|
| `campaign_id` | string | **required**. |
| `campaign`, `channel`, `market`, `account` | string | Name, channel, market, ad account id. |
| `opt_event` | string | Optimisation event (`TrialQualified` or `TrialPaidOrSub`). Derived from a `_TQ` / `_TPS` suffix of the campaign name when absent. |
| `paywall_mode` | string | `pw1`, `pw2` or `random` (which paywall the campaign's traffic sees). |
| `partner`, `cost_model`, `contracted_cpa`, `placement`, `objective`, `from`, `to` | string / number | Web2Web partner, `cpm` / `cpc` / `cpa`, contract CPA, placement, objective, flight dates. |

### ads (optional lookup)

`{ ad_id, ad, adset_id, adset, creative, campaign_id }`. Lets `spend` rows and `users` carry only `ad_id` and `campaign_id`: names and the creative are filled from here. Existing fields are never overwritten.

### events (optional)

Product events used for the checkout funnel, funnel timings and the live feed.

| Field | Type | Meaning |
|---|---|---|
| `user_id` | string | **required**. |
| `ts` | time | **required**. |
| `name` | string | **required**. The board reads `signup`, `paywall_view`, `checkout_start`, `checkout_error`, `trial_start`. Other names are ignored. |
| `props` | object | `checkout_start`: `{ "psp", "payment_method" }`; `checkout_error`: `{ "psp", "payment_method", "code" }`. |

Without events the Real-time checkout funnel is empty; the User flow still works when `users.paywall_viewed_ts` and `users.checkout_ts` are filled.

### plans and paywalls (catalogue)

Your plan catalogue. When present, it replaces the built-in demo catalogue.

`plans`:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | **required**. Referenced by `trials.plan`, `charges.plan`, `users.plan`. |
| `paywall` | string | **required**. Paywall id. |
| `price` | number | **required**. Price per period, USD. |
| `trialDays` | number | **required**. Trial length in days (0 or more). |
| `intro` | number | Intro price, default 0. |
| `period` / `periodDays` | string / number | `week` (7) or `month` (30); either one is enough. MRR normalises weekly prices × 4.33. |
| `label`, `label_ru`, `from`, `to` | string | Display names and availability dates. |

`paywalls`: `{ id (required), label, label_ru, from, to, variant }`. `variant` is an optional A/B tag (`A`, `B`) shown on the User flow board.

Plans that appear in the data but not in the catalogue get a warning and a fallback (3-day trial, 7-day period, MRR 0).

### incidents (optional)

`{ from, to, reason }` time windows of billing or product outages. Renewals due inside a window are censored in the retention fits (not counted as churn evidence) and listed in the data checks.

### subscriptions (optional)

Normally derived from `trials` and `charges` (status, renewals, cancel reason, MRR per subscription). Provide it only if you need to override the derivation: `{ user_id, start_ts, plan, status, cancel_ts, cancel_reason, current_period_end, renewals, mrr_usd }`.

## Which page needs what

| Data | Cohorts | Predictions | Real-time | User flow |
|---|---|---|---|---|
| `users` | required | required | required | required |
| `trials` | trials, CPT, cancels | trial-to-paid rate, forecasts | trials today | trial stage |
| `charges` | revenue, ROAS, payers, MRR, retention, billing health | renewal curves (`n`, `status`), forecasts, backtest | revenue D0, payment provider status, live feed | payment stage, card declines |
| `refunds`, `disputes` | net revenue, churn reasons | net forecasts, refund and dispute rates | live feed | loss nodes |
| `spend` | spend, CPT, CAC, ROAS | max CPT, budget allocator | spend pace, CPT, alerts | entry (landing views), ROAS per source |
| `campaigns`, `ads` | hierarchy names | channel and segment keys | traffic tree | source column |
| `events` | not used | not used | checkout funnel, live feed | funnel timings (or the user fields) |
| `plans`, `paywalls` | MRR, paid retention by plan | trial length, period, price | forecast chips | paywall and plan nodes, A/B tags |
| `incidents` | not used | censoring in fits | not used | not used |

## Compact columnar form

Any table may be written as `{ "columns": [...], "rows": [[...], ...] }` instead of an array of objects. The loader expands it; `null` cells are treated as absent fields (so defaults and lookups apply). The demo file uses this form for its large tables, which keeps it about half the size. Run `node tools/generate-demo-data.mjs --rows` to see the same data as plain row objects.

```json
"refunds": { "columns": ["refund_id", "charge_id", "user_id", "ts", "amount_usd"],
             "rows": [["rf_1", "ch_42", "u17", 1767225600, 7.99]] }
```

## Validation

Open the browser console on any page and run:

```js
BB.adapters.validate(await (await fetch('./data/my-export.json')).json())
```

It returns `{ ok, errors, warnings }`. Errors (missing `users`, missing required columns, unparseable timestamps, empty ids, invalid catalogue) stop the load and are shown on the error card. Warnings (missing optional tables, unknown plan ids, rows that reference unknown users, no `hour` or `country` on spend, missing fees) are listed in the data notes of the Predictions page and in `BB.load().meta.validation`.

## Minimal example

The smallest useful file: one plan, one paid user with a trial and a first rebill, one spend row.

```json
{
  "now": "2026-10-21T12:00:00Z",
  "plans": [{ "id": "weekly", "paywall": "main", "price": 7.99, "trialDays": 3, "intro": 1.49, "period": "week" }],
  "paywalls": [{ "id": "main", "label": "Main paywall" }],
  "users": [{ "user_id": "u1", "signup_ts": "2026-10-01T10:00:00Z", "country": "US", "channel": "facebook", "campaign_id": "c1", "ad_id": "a1" }],
  "trials": [{ "trial_id": "t1", "user_id": "u1", "ts": "2026-10-01T10:05:00Z", "plan": "weekly", "qualified": true }],
  "charges": [
    { "charge_id": "ch1", "user_id": "u1", "ts": "2026-10-01T10:05:00Z", "type": "intro", "n": 0, "attempt": 1, "plan": "weekly", "amount_usd": 1.49, "status": "succeeded" },
    { "charge_id": "ch2", "user_id": "u1", "ts": "2026-10-04T10:05:00Z", "type": "rebill", "n": 1, "attempt": 1, "plan": "weekly", "amount_usd": 7.99, "status": "succeeded" }
  ],
  "refunds": [], "disputes": [],
  "spend": [{ "date": "2026-10-01", "hour": 10, "campaign_id": "c1", "ad_id": "a1", "country": "US", "spend_usd": 25, "impressions": 2000, "clicks": 30, "link_clicks": 28, "landing_views": 22 }]
}
```

Forecasts need volume: a segment needs about 30 renewals at risk before it gets its own curve, and rows with fewer than 10 trials show "Not enough data".
