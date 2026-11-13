# LinkedIn post (draft for review)

Suggested media: `docs/media/demo.mp4` (native video) or `docs/media/social-preview.png`. Post the links as written; LinkedIn shows the preview card from the page meta.

---

I'm open-sourcing Web-to-Web BI Board, a dashboard for subscription businesses that sell on the web.

If you buy traffic on Facebook, Google or TikTok and sell weekly or monthly subscriptions through a web paywall, the money comes back slowly: a trial today, a first rebill a few days later, renewals for months. Ad managers show you the spend. They don't show you when a cohort pays back.

This board does. It has four pages:

• Cohorts: ROAS from D0 to D360, payback day, MRR, paid retention, churn and billing health by channel.
• Predictions: sBG-based forecasts of ROAS and LTV per trial with intervals, a max CPT calculator, what-if sliders, model comparison and a backtest.
• Real-time: today's spend pace, CPT, ROAS D0, checkout and payment provider status, alerts and a live event feed.
• User flow: a funnel map from the ad to the paywall, trial and payment, with every place where users drop.

It's a static site: no backend, no build step, MIT license. The live demo runs on synthetic data for a fictional app. To use it on real numbers, export your spend, signups, trials and payments into one JSON file; the data contract is in the repo.

Who it's for: growth and UA leads, founders and analysts at web-to-web subscription apps who want payback numbers they can check.

Live demo: https://ua5er.github.io/web2web-bi-board/
Code: https://github.com/ua5er/web2web-bi-board

Want it running on your data? Message me on Telegram: https://t.me/ua5er

#subscriptions #useracquisition #growthmarketing #analytics #opensource
