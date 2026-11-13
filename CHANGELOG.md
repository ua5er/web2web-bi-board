# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] (MVP) - 2026-11-13

First public release.

### Added

- **Cohorts** page: cohort table with ROAS from D0 to D360 and payback day (actual in mature cells, forecast in immature ones), KPI tiles, ROAS curves by cohort, rebills and churn, MRR movement, paid retention by plan or channel, breakdown matrix with drill-down, voluntary and involuntary churn, billing health.
- **Predictions** page: pROAS and LTV per trial from D30 to D360 with 80 % intervals (sBG renewal model per plan × geo tier × channel segment), payback forecast, max CPT calculator, what-if sliders, plan mix by paywall, budget allocator, MRR forecast, survival curves, model comparison (sBG, power, log, constant churn, Weibull, Kaplan–Meier and three benchmark-prior sBG variants) with data and fit checks, in-sample and hold-out backtest.
- **Real-time** page: spend pace against yesterday, CPT, ROAS D0, checkout funnel and errors, payment provider auth rate, device and attribution chips, traffic tree, editable alert rules, geo by hour, live event feed, auto-refresh.
- **User flow** page: funnel map from source and landing to paywall, checkout, trial, payment, outcomes and losses, lanes by channel, device or market, A/B test results.
- Shared toolbar on every page: date presets, step (hour, day, week, month), channel, device, cohort basis (signup or trial), gross or net revenue, payer definition, currency, compare period, group by, filters on 30+ dimensions, saved views, CSV export. State lives in the URL hash, so every view is a shareable link.
- JSON loader with validation (errors stop the load, warnings become data notes), compact columnar tables, `ads` and `campaigns` lookups, optional plan catalogue and incident windows. Documented in [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md).
- Deterministic synthetic demo dataset (`data/demo.json`, about 16k users over 14 months) from `tools/generate-demo-data.mjs`, a dependency-free Node script.
- Branding from `board.config.js`: the author's GitHub avatar as logo and favicon (initials fallback), a "Contact the author" button and a footer with contact links on every page.
- English UI with an optional Russian translation (EN / RU switch).
- Dark and light themes, responsive layout down to 390 px.
- GitHub Pages readiness: relative paths, `.nojekyll`, page meta (canonical, Open Graph, Twitter card, JSON-LD), `robots.txt`, `sitemap.xml`, `llms.txt`, `CITATION.cff`.
- Media: screenshots, demo GIF and MP4, social preview (`tools/capture_media.py`).

### Not included yet

- Live data connectors (Meta, Google Ads, TikTok, Stripe, Amplitude). See the roadmap in the README.

[1.0.0]: https://github.com/ua5er/web2web-bi-board/releases/tag/v1.0.0
