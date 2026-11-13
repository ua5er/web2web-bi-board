# GitHub settings for the release

What to set on `github.com/ua5er/web2web-bi-board` after the first push, mostly with `gh`. Nothing here is applied automatically.

## Repository description (315 characters)

```
Open-source BI dashboard for subscription web funnels (web-to-web): cohort ROAS and payback from D0 to D360, sBG LTV and ROAS predictions, max CPT and what-if scenarios, real-time ad spend monitoring and a funnel map for Facebook, Google, TikTok and Web2Web traffic. Static site, no backend, runs on your JSON data.
```

## Homepage

```
https://ua5er.github.io/web2web-bi-board/
```

## Topics (20)

```
bi-dashboard, cohort-analysis, roas, ltv, ltv-prediction, subscription-analytics, marketing-analytics, growth-analytics, unit-economics, user-acquisition, facebook-ads, google-ads, tiktok-ads, web2web, web-funnel, open-source-bi, dashboard, data-visualization, chartjs, static-site
```

## Commands

```bash
REPO=ua5er/web2web-bi-board

gh repo edit $REPO \
  --description "Open-source BI dashboard for subscription web funnels (web-to-web): cohort ROAS and payback from D0 to D360, sBG LTV and ROAS predictions, max CPT and what-if scenarios, real-time ad spend monitoring and a funnel map for Facebook, Google, TikTok and Web2Web traffic. Static site, no backend, runs on your JSON data." \
  --homepage "https://ua5er.github.io/web2web-bi-board/" \
  --add-topic bi-dashboard,cohort-analysis,roas,ltv,ltv-prediction,subscription-analytics,marketing-analytics,growth-analytics,unit-economics,user-acquisition \
  --add-topic facebook-ads,google-ads,tiktok-ads,web2web,web-funnel,open-source-bi,dashboard,data-visualization,chartjs,static-site \
  --enable-issues --enable-wiki=false

# GitHub Pages from the repository root of main
gh api -X POST repos/$REPO/pages -f "source[branch]=main" -f "source[path]=/"
# (if Pages already exists: gh api -X PUT repos/$REPO/pages -f "source[branch]=main" -f "source[path]=/")

# Release
git tag -a v1.0.0 -m "Web-to-Web BI Board v1.0.0 (MVP)"
git push origin v1.0.0
gh release create v1.0.0 --repo $REPO --title "v1.0.0 (MVP): Web-to-Web BI Board" --notes-file docs/release-notes.md docs/media/demo.mp4
```

The release notes below are also saved as `docs/release-notes.md`.

**Social preview image:** there is no API for it. Upload `docs/media/social-preview.png` (1280 × 640) in **Settings → General → Social preview**.

## Release title

```
v1.0.0 (MVP): Web-to-Web BI Board
```

## Release notes

```markdown
First public release of Web-to-Web BI Board: an open-source BI dashboard for subscription web funnels (web-to-web). Static site, no backend, MIT license.

**Live demo:** https://ua5er.github.io/web2web-bi-board/ (synthetic data for a fictional "Demo app")

### What's inside

- **Cohorts:** ROAS from D0 to D360 and payback day, MRR movement, paid retention by plan or channel, churn reasons, breakdowns and billing health.
- **Predictions:** pROAS and LTV per trial with 80 % intervals from an sBG renewal model per segment, max CPT calculator, what-if scenarios, plan mix, budget allocator, MRR forecast, model comparison and a hold-out backtest.
- **Real-time:** spend pace against yesterday, CPT, ROAS D0, checkout funnel, payment provider status, rule-based signals, geo by hour and a live event feed.
- **User flow:** funnel map from source and landing to paywall, checkout, trial, payment, outcomes and losses, with A/B test results.
- One JSON data contract (docs/DATA_CONTRACT.md) with validation, a deterministic demo data generator, dark and light themes, mobile layout, English and Russian UI.

### Not included yet

Data connectors for Meta, Google Ads, TikTok, Stripe and Amplitude (see the roadmap).

Built by Vlad Yasinski. Want this board on your data? Message me on Telegram: https://t.me/ua5er
```

## Search and AI visibility checklist

- **Pages meta** is in place on every page: unique title and description, canonical URL, Open Graph and Twitter card with the social preview, JSON-LD (`SoftwareApplication` + `SoftwareSourceCode`, `WebSite`, `Person`, `WebPage`).
- **robots.txt and llms.txt**: crawlers read `robots.txt` only at the host root (`https://ua5er.github.io/robots.txt`), which belongs to the `ua5er/ua5er.github.io` repository, not to this project site. The copy in this repo documents the intent and becomes effective if the board moves to its own domain. To reference the sitemap from the host root, add `Sitemap: https://ua5er.github.io/web2web-bi-board/sitemap.xml` to the `ua5er.github.io` repository's `robots.txt` (if that repository exists). `llms.txt` is served at `https://ua5er.github.io/web2web-bi-board/llms.txt`.
- **Sitemap**: submit `https://ua5er.github.io/web2web-bi-board/sitemap.xml` in Google Search Console (URL-prefix property `https://ua5er.github.io/web2web-bi-board/`) and Bing Webmaster Tools.
- **IndexNow**: the key file is at the repository root, so for this project site pass its location explicitly:

  ```bash
  curl -s -X POST "https://api.indexnow.org/indexnow" -H "Content-Type: application/json; charset=utf-8" -d '{
    "host": "ua5er.github.io",
    "key": "e698973e97af2788c56b3c7cb027cf96",
    "keyLocation": "https://ua5er.github.io/web2web-bi-board/e698973e97af2788c56b3c7cb027cf96.txt",
    "urlList": [
      "https://ua5er.github.io/web2web-bi-board/",
      "https://ua5er.github.io/web2web-bi-board/predict.html",
      "https://ua5er.github.io/web2web-bi-board/realtime.html",
      "https://ua5er.github.io/web2web-bi-board/flow.html",
      "https://ua5er.github.io/web2web-bi-board/llms.txt"
    ]}'
  ```

  Some IndexNow engines only accept keys at the host root; if the ping is rejected for that reason, place the same key file in the `ua5er.github.io` repository root as well.
- **Cite this repository** appears automatically from `CITATION.cff`.
- **Links in**: link the repo and the live demo from the GitHub profile README, roimobi.com and the LinkedIn post (`docs/LINKEDIN_POST.md`).
