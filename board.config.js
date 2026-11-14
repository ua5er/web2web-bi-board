/* Web-to-Web BI Board: branding and contact links.
 * Edit this file to rebrand the board. Every page reads it before the UI starts.
 * Logo and favicon: the GitHub avatar of `github` (https://github.com/<github>.png), loaded live, so the board logo follows
 * avatar changes. If the avatar cannot be loaded, the initials of `author` are shown instead. */
window.BOARD_CONFIG = {
  title: 'Web-to-Web BI Board',
  tagline: 'Web-to-Web BI Board System: cohort payback, predictions, real-time and funnel for subscription web funnels',
  version: '1.0.0',
  stage: 'MVP',
  author: 'Vlad Yasinski',
  github: 'ua5er',
  telegram: 'ua5er',                      // visible handle (t.me/<telegram>)
  telegramUrl: 'https://www.roimobi.com/tg?src=bi-board-demo', // where the Telegram links go (counted redirect to t.me/ua5er); empty = https://t.me/<telegram>
  linkedin: 'https://www.linkedin.com/in/vlad-yasinski-ua5er/',
  site: 'https://www.roimobi.com',
  siteUrl: 'https://www.roimobi.com/?utm_source=bi-board-demo&utm_medium=demo&utm_campaign=web2web-bi-board', // link target of the website link; empty = `site`
};
