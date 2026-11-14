/* Cookieless, anonymous analytics for the hosted demo only (ua5er.github.io).
 * No SDK, no cookies, no localStorage, no fingerprint, no person profile. It sends page views and contact clicks to PostHog (EU).
 * It does nothing on any other host (so self-hosted copies of the board send nothing), and nothing when
 * Do Not Track or Global Privacy Control is on. */
(function () {
  'use strict';
  var HOST = 'ua5er.github.io';
  var SITE = 'bi-board-demo';
  var KEY = 'phc_CG97e9YEXGXENgp3za52XwctotC7ffY5W42dTeK62UUw'; // public project key
  var ENDPOINT = 'https://eu.i.posthog.com/i/v0/e/';
  var nav = navigator;
  if (location.hostname !== HOST) return;
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return;

  var PAGES = { '': 'cohorts', 'index.html': 'cohorts', 'realtime.html': 'realtime', 'predict.html': 'predict', 'flow.html': 'flow' };
  var file = location.pathname.split('/').pop();
  var page = PAGES[file] || file || 'cohorts';

  function send(event, props) {
    try {
      var p = { $process_person_profile: false, $lib: 'bi-board-analytics', site: SITE, page: page, $current_url: location.origin + location.pathname, $pathname: location.pathname };
      for (var k in props) p[k] = props[k];
      var body = JSON.stringify({ api_key: KEY, event: event, distinct_id: 'anon', properties: p });
      if (nav.sendBeacon && nav.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) { /* analytics must never break the page */ }
  }

  send('$pageview', { path: location.pathname });

  function placement(a) {
    if (a.closest('.bb-contact-pop, .bb-contact')) return 'popover';
    if (a.closest('.bb-footer-cta')) return 'cta';
    if (a.closest('.bb-footer')) return 'footer';
    if (a.closest('.bb-head')) return 'header';
    return 'readme-link-on-page';
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[data-link]');
    if (!a) return;
    var ch = a.getAttribute('data-link');
    if (['telegram', 'linkedin', 'github', 'site'].indexOf(ch) < 0) return;
    send('contact_click', { channel: ch, placement: placement(a) });
  }, true);

  /* demo_interaction: once per page load, on the first filter change, page switch or what-if slider move */
  var interacted = false;
  function interaction(kind) { if (interacted) return; interacted = true; send('demo_interaction', { kind: kind }); }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('.bb-nav a')) return interaction('page');
    if (t.closest('.bb-contact-pop')) return;
    var b = t.closest('button');
    if (b && b.closest('.seg, .bb-chips, .popover') && !b.hasAttribute('aria-haspopup')) interaction('filter');
  }, true);
  document.addEventListener('input', function (e) {
    var t = e.target; if (t && t.tagName === 'INPUT' && t.type === 'range') interaction('slider');
  }, true);
  document.addEventListener('change', function (e) {
    var t = e.target; if (t && t.tagName === 'SELECT' && t.closest('.bb-main')) interaction('filter');
  }, true);
})();
