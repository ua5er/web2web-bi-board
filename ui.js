/* Web-to-Web BI Board — UI kit (BB.ui). Vanilla ES2020, no deps except Chart.js (optional, loaded by the page).
   Extends window.BB; never reassigns it. */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const ui = (BB.ui = BB.ui || {});
  /* i18n: core.js (BB.t / BB.plural / BB.lbl) is loaded before ui.js in the browser; guard for the rare case it is not */
  const T = (s, v) => (typeof BB.t === 'function' ? BB.t(s, v) : s);
  const L = (o, f) => (typeof BB.lbl === 'function' ? BB.lbl(o, f) : (o && (o.label || o.label_ru)) || '');
  const P = (n, forms, o) => (typeof BB.plural === 'function' ? BB.plural(n, forms, o) : n + ' ' + forms.split('|')[n === 1 ? 0 : 1]);

  /* ------------------------------------------------------------------ helpers */
  const isNode = (x) => x instanceof Node;
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs && typeof attrs === 'object' && !isNode(attrs) && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in node && typeof node[k] !== 'object' && k !== 'style' && !k.startsWith('aria') && k !== 'list' && k !== 'form') { try { node[k] = v === true ? true : v; } catch (e) { node.setAttribute(k, v); } }
        else node.setAttribute(k, v === true ? '' : v);
      }
    } else if (attrs != null) children.unshift(attrs);
    append(node, children);
    return node;
  }
  function append(node, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.append(isNode(c) ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  const svg = (d, extra = '') => { const t = document.createElement('template'); t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`; return t.content.firstChild; };
  const ICON = {
    chev: '<path d="m9 6 6 6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>', cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    csv: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    cohorts: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    realtime: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', predict: '<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>',
    sort: '<path d="M12 5v14m0 0-5-5m5 5 5-5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    check: '<path d="m5 12 5 5L20 7"/>', flow: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 11c4 0 5-4.5 9-4.5M7.5 13c4 0 5 4.5 9 4.5"/>',
    pin: '<path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/>',
    fit: '<path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    /* brand / contact icons (stroke style of the kit; shapes after Feather, MIT) */
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
    telegram: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
    github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.3 6.4-1.5 6.4-7a5.4 5.4 0 0 0-1.5-3.8 5.1 5.1 0 0 0-.1-3.8S18.7.6 16 2.5a13.4 13.4 0 0 0-7 0C6.3.6 5.1 1 5.1 1a5.1 5.1 0 0 0-.1 3.8 5.4 5.4 0 0 0-1.5 3.8c0 5.4 3.3 6.6 6.4 7a3.4 3.4 0 0 0-.9 2.5V22"/>',
    site: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  };
  const icon = (name, cls) => { const s = svg(ICON[name] || ''); if (cls) s.setAttribute('class', cls); return s; };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const isNum = (x) => typeof x === 'number' && isFinite(x);

  /* ------------------------------------------------------------------ format fallback */
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const localFmt = {
    usd: (v) => (isNum(v) ? (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 100 ? nf0.format(Math.abs(v)) : nf2.format(Math.abs(v))) : '—'),
    usd2: (v) => (isNum(v) ? (v < 0 ? '−' : '') + '$' + nf2.format(Math.abs(v)) : '—'),
    pct: (v) => (isNum(v) ? nf1.format(v * 100) + '%' : '—'),
    x: (v) => (isNum(v) ? v.toFixed(2) + 'x' : '—'),
    int: (v) => (isNum(v) ? nf0.format(v) : '—'),
    days: (v) => (isNum(v) ? 'D' + Math.round(v) : '—'),
    num: (v) => (isNum(v) ? (Number.isInteger(v) ? nf0.format(v) : nf1.format(v)) : '—'),
    compact: (v) => (isNum(v) ? (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : nf0.format(v)) : '—'),
    delta: (v) => (isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v) * 100) + '%' : '—'),
  };
  function fmt(kind, v) {
    if (typeof kind === 'function') return kind(v);
    const f = BB.fmt && typeof BB.fmt === 'object' && typeof BB.fmt[kind] === 'function' ? BB.fmt[kind] : localFmt[kind] || localFmt.num;
    return f(v);
  }

  /* ------------------------------------------------------------------ theme */
  const themeListeners = new Set();
  function getTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('bb-theme', t); } catch (e) { /* private mode */ }
    themeListeners.forEach((fn) => { try { fn(t); } catch (e) { console.error(e); } });
  }
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem('bb-theme'); } catch (e) { /* ignore */ }
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  }
  initTheme();
  const onTheme = (fn) => { themeListeners.add(fn); return () => themeListeners.delete(fn); };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (window.matchMedia) {
    try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) themeListeners.forEach((fn) => fn(getTheme())); }); } catch (e) { /* old */ }
  }

  /* ------------------------------------------------------------------ state fallback */
  const PAGE_FILES = { cohorts: 'index.html', realtime: 'realtime.html', predict: 'predict.html', flow: 'flow.html' };
  const pageKey = (p) => (p === 'index' || p === 'index.html' || p == null ? 'cohorts' : String(p).replace(/\.html$/, ''));
  function stateLink(page) {
    const key = pageKey(page);
    const f = BB.state && typeof BB.state.link === 'function' ? BB.state.link(key) : null;
    return f || `./${PAGE_FILES[key] || key + '.html'}`;
  }

  /* ------------------------------------------------------------------ shell */
  const NAV = [
    { id: 'cohorts', label: T('Cohorts'), icon: 'cohorts' },
    { id: 'realtime', label: 'Real-time', icon: 'realtime' },
    { id: 'predict', label: T('Predictions'), icon: 'predict' },
    { id: 'flow', label: T('User flow'), icon: 'flow' },
  ];
  /* Source badge wording: "Mock data · seed 42 · 04:57 UTC" → "Demo data · updated 04:57 UTC" (RU via the dictionary; seed goes to the title attribute).
     Accepts the legacy Russian badge text of JSON files (data.meta.label_ru) as input too. */
  const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function sourceText(txt) {
    let t = String(txt || ''), seed = null;
    const demo = T('Demo data');
    t = t.replace(/\s*·?\s*seed\s*(\d+)/i, (m, x) => { seed = x; return ''; }).replace(/mock data|demo data|\u0434\u0435\u043c\u043e-\u0434\u0430\u043d\u043d\u044b\u0435/gi, demo);
    t = t.replace(new RegExp(escRe(demo) + '\\s*·\\s*' + escRe(demo), 'i'), demo);
    t = t.replace(/·\s*(?:updated|\u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u043e)?\s*(\d{1,2}:\d{2}(?:\s*UTC)?)/i, (m, time) => '· ' + T('updated {time}', { time })).replace(/\s+/g, ' ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
    return { text: t, title: seed ? 'seed ' + seed : null };
  }
  /* ------------------------------------------------------------------ scope panel (rail foot): project · source · ad account + "remember selection" pin
     State keys project / channel / account (BB.state); persistence rules live in BB.scope (hash > saved > default). The panel repaints on every state change,
     so the toolbar channel control, the flow chips and the rail stay in sync. */
  function scopePanel(page, data) {
    const d = data || (BB.load ? BB.load() : null);
    const st = () => (BB.state && BB.state.read ? BB.state.read(page) : {});
    const present = new Set(); (d && d.spend || []).forEach((r) => present.add(r.channel)); (d && d.users || []).forEach((u) => present.add(u.channel));
    const sources = [{ id: 'all', label: T('All') }].concat(CHANNELS().filter((c) => !present.size || present.has(c.id)));
    const accounts = [{ id: 'all', label: T('All') }].concat((BB.accounts ? BB.accounts(d) : []).map((a) => ({ id: a.id, label: L(a) })));
    const projects = (BB.PROJECTS || [{ id: 'demo', label: 'Demo app' }]).map((p) => ({ id: p.id, label: L(p) }));
    const cur = st();
    /* a remembered account that is not in this dataset → All (and forget it) */
    if (cur.account && cur.account !== 'all' && !accounts.some((a) => String(a.id) === String(cur.account))) { BB.state.write({ account: null }); BB.scope && BB.scope.save({ account: null }); }
    const sc = () => (BB.scope ? BB.scope.get() : { remember: false });
    const pin = el('button', { class: 'bb-pin', type: 'button', role: 'switch' });
    const paintPin = () => { const on = !!sc().remember; pin.setAttribute('aria-checked', String(on)); pin.classList.toggle('on', on); pin.title = on ? T('Selection is remembered on this device') : T('Remember selection'); pin.setAttribute('aria-label', T('Remember selection')); };
    pin.append(icon('pin'));
    pin.addEventListener('click', () => {
      const on = !sc().remember;
      BB.scope.setRemember(on);
      if (on) { const s = st(); BB.scope.save({ project: s.project, channel: s.channel, account: s.account }); toast(T('Selection will be remembered'), 'good'); }
      else toast(T('Selection is no longer remembered'));
      paintPin();
    });
    paintPin();
    const row = (label, ctl) => el('div', { class: 'bb-scope-row' }, el('label', {}, label), ctl.el);
    const sets = []; // every rendered trio (rail + open popover) repaints together
    const buildRows = () => {
      const s = st();
      const sProject = select(projects, s.project || projects[0].id, (v) => BB.state.write({ project: v }), { label: T('Project') });
      if (projects.length < 2) { sProject.select.disabled = true; sProject.el.title = T('More projects later'); }
      const sSource = select(sources, s.channel || 'all', (v) => BB.state.write({ channel: v }), { label: T('Source') });
      const sAccount = select(accounts, s.account || 'all', (v) => BB.state.write({ account: v }), { label: T('Account') });
      const trio = { sProject, sSource, sAccount };
      sets.push(trio);
      return { el: el('div', { class: 'bb-scope-body' }, row(T('Project'), sProject), row(T('Source'), sSource), row(T('Account'), sAccount)), trio };
    };
    const head = () => el('div', { class: 'bb-scope-head' }, el('span', {}, T('Scope')), pin);
    const root = el('div', { class: 'bb-scope', role: 'group', 'aria-label': T('Scope') }, head(), buildRows().el);
    /* mobile: one button with a dot when anything is narrowed; opens the same rows in a popover */
    const btn = el('button', { class: 'bb-scope-btn', type: 'button', title: T('Scope'), 'aria-label': T('Scope'), 'aria-expanded': 'false' }, icon('filter'), el('span', { class: 'dot' }));
    btn.addEventListener('click', () => {
      const built = buildRows();
      popover(btn, () => el('div', { class: 'bb-scope-pop' }, el('div', { class: 'bb-scope-head' }, el('span', {}, T('Scope')), el('span', { class: 'bb-pin-slot' })), built.el), { onClose: () => { const i = sets.indexOf(built.trio); if (i >= 0) sets.splice(i, 1); root.prepend(head()); } });
      const slot = document.querySelector('.bb-scope-pop .bb-pin-slot'); if (slot) { root.querySelector('.bb-scope-head') && root.querySelector('.bb-scope-head').remove(); slot.replaceWith(pin); }
    });
    const paint = () => {
      const s = st();
      sets.forEach((t) => { t.sSource.set(s.channel || 'all'); t.sAccount.set(s.account || 'all'); t.sProject.set(s.project || projects[0].id); });
      btn.classList.toggle('narrowed', !!((s.channel && s.channel !== 'all') || (s.account && s.account !== 'all')));
    };
    if (BB.state && BB.state.onChange) BB.state.onChange(paint);
    /* a hash that carries the scope counts as the last selection (remember on) */
    if (BB.scope) BB.scope.save({ project: cur.project, channel: cur.channel, account: cur.account });
    paint();
    return { el: root, btn, paint, sources, accounts };
  }
  /* ------------------------------------------------------------------ brand (board.config.js)
     Logo and favicon = the author's GitHub avatar (https://github.com/<github>.png?size=128), loaded live; initials monogram when it fails.
     Contact links (Telegram, LinkedIn, GitHub, site) come from the same config; nothing else is linked. */
  const BRAND_DEFAULT = { title: 'Web-to-Web BI Board', tagline: '', version: '1.0.0', stage: 'MVP', author: 'Vlad Yasinski', github: 'ua5er', telegram: 'ua5er', linkedin: 'https://www.linkedin.com/in/vlad-yasinski-ua5er/', site: 'https://www.roimobi.com', telegramUrl: '', siteUrl: '' };
  const brand = Object.assign({}, BRAND_DEFAULT, window.BOARD_CONFIG || {});
  const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'BB';
  const avatarUrl = () => (brand.github ? `https://github.com/${encodeURIComponent(brand.github)}.png?size=128` : null);
  const hostOf = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  brand.versionLabel = 'v' + brand.version + (brand.stage ? ' ' + brand.stage : '');
  brand.links = [
    brand.telegram ? { id: 'telegram', label: 'Telegram', text: 't.me/' + brand.telegram, href: brand.telegramUrl || ('https://t.me/' + brand.telegram) } : null,
    brand.linkedin ? { id: 'linkedin', label: 'LinkedIn', text: 'LinkedIn', detail: String(brand.linkedin).replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').replace(/\/$/, ''), href: brand.linkedin } : null,
    brand.github ? { id: 'github', label: 'GitHub', text: 'github.com/' + brand.github, href: 'https://github.com/' + brand.github } : null,
    brand.site ? { id: 'site', label: T('Website'), text: hostOf(brand.site), href: brand.siteUrl || brand.site } : null,
  ].filter(Boolean);
  const pageTitle = (t) => (t ? t + ' · ' : '') + brand.title;
  /* the static English <title> of each page is written for search; other languages get "<page> · <title>" */
  const applyTitle = (t) => { if (BB.lang && BB.lang !== 'en') document.title = pageTitle(t); };
  /* avatar: <img> of the GitHub avatar; on error the author's initials on the accent gradient */
  function avatar(size = 28, cls = '') {
    const box = el('span', { class: 'bb-avatar' + (cls ? ' ' + cls : ''), style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
    const mono = () => { clear(box); box.classList.add('mono'); box.append(el('span', { style: { fontSize: Math.round(size * 0.38) + 'px' } }, initials(brand.author))); };
    const url = avatarUrl();
    if (!url) { mono(); return box; }
    const img = el('img', { src: url, alt: '', width: size, height: size, decoding: 'async', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', mono, { once: true });
    box.append(img);
    return box;
  }
  /* favicon: initials monogram right away (no network), swapped for the avatar once it has loaded */
  function setFavicon() {
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#5e6ad2"/><text x="32" y="41" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="600" fill="#fff">${esc(initials(brand.author))}</text></svg>`;
    document.querySelectorAll('link[rel~="icon"]').forEach((n) => n.remove());
    const link = el('link', { rel: 'icon', type: 'image/svg+xml', href: 'data:image/svg+xml,' + encodeURIComponent(svgIcon) });
    document.head.append(link);
    const url = avatarUrl(); if (!url) return;
    const probe = new Image(); probe.referrerPolicy = 'no-referrer';
    probe.onload = () => { link.removeAttribute('type'); link.href = url; };
    probe.src = url;
  }
  const extLink = (l, cls, body) => el('a', { class: cls, href: l.href, target: '_blank', rel: 'noopener', title: l.label === l.text ? l.label : `${l.label} · ${l.text}`, dataset: { link: l.id } }, body);
  function contactCard() {
    return el('div', { class: 'bb-contact' },
      el('div', { class: 'bb-contact-head' }, avatar(40),
        el('div', { class: 'grow' }, el('div', { class: 'bb-contact-name' }, brand.author), el('div', { class: 'caption' }, T('Author of {title}', { title: brand.title })))),
      el('p', { class: 'bb-contact-pitch' }, T('Built by {author}. Want this board on your data? Message me on Telegram.', { author: brand.author })),
      el('div', { class: 'bb-contact-links' }, brand.links.map((l) => extLink(l, 'bb-contact-link' + (l.id === 'telegram' ? ' primary' : ''), [icon(l.id), el('span', { class: 'k' }, l.label), el('span', { class: 'v mono' }, l.id === 'telegram' ? T('Message me') : l.detail || l.text)]))));
  }
  function contactButton() {
    const b = el('button', { class: 'btn sm bb-contact-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: T('Contact the author') },
      icon('chat'), el('span', { class: 'lbl' }, T('Contact the author')));
    b.addEventListener('click', () => popover(b, () => contactCard(), { align: 'right', width: 320, class: 'bb-contact-pop' }));
    return b;
  }
  function footer() {
    const tg = brand.links.find((l) => l.id === 'telegram');
    return el('footer', { class: 'bb-footer' },
      el('div', { class: 'bb-footer-main' }, avatar(34),
        el('div', { class: 'bb-footer-txt' },
          el('div', { class: 'bb-footer-title' }, brand.title, el('span', { class: 'bb-ver' }, brand.versionLabel)),
          el('div', { class: 'bb-footer-pitch' }, T('Built by {author}.', { author: brand.author }) + ' ' + T('Want this board on your data?') + ' ',
            tg ? extLink(tg, 'bb-footer-cta', T('Message me on Telegram')) : null, tg ? '.' : null))),
      el('nav', { class: 'bb-footer-links', 'aria-label': T('Contact the author') }, brand.links.map((l) => extLink(l, '', [icon(l.id), el('span', {}, l.text)]))),
      el('div', { class: 'bb-footer-fine' }, T('Demo data is synthetic: every product, campaign, user and payment is invented.') + ' · ' + T('MIT License')));
  }

  function shell(activePage, opts = {}) {
    const { title = '', subtitle = '', sourceBadge = T('Demo data'), live = false, mount = document.body } = opts;
    const themeBtn = el('button', { class: 'bb-theme', type: 'button', title: T('Toggle theme'), 'aria-label': T('Toggle theme') });
    const paintTheme = () => { clear(themeBtn); const t = getTheme(); themeBtn.append(el('span', {}, T(t === 'dark' ? 'Dark theme' : 'Light theme')), icon(t === 'dark' ? 'moon' : 'sun')); };
    paintTheme(); onTheme(paintTheme);
    themeBtn.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'));

    const active = pageKey(activePage);
    const scope = scopePanel(active, opts.data);
    const src0 = sourceText(sourceBadge);
    const sourceEl = el('div', { class: 'bb-source', title: src0.title }, el('span', { class: 'live-dot' + (live ? '' : ' off') }), el('span', { class: 'src-txt' }, src0.text));
    const rail = el('aside', { class: 'bb-rail' },
      el('a', { class: 'bb-logo', href: stateLink('cohorts'), dataset: { page: 'cohorts' }, title: brand.title + ' · ' + T('by {author}', { author: brand.author }) }, avatar(28, 'mark'),
        el('span', { class: 'txt' }, el('span', { class: 'name' }, brand.title), el('span', { class: 'by' }, T('by {author}', { author: brand.author })))),
      el('nav', { class: 'bb-nav', 'aria-label': T('Sections') }, NAV.map((n) => el('a', { href: stateLink(n.id), dataset: { page: n.id }, 'aria-current': n.id === active ? 'page' : null }, icon(n.icon), n.label))),
      el('div', { class: 'bb-rail-foot' }, scope.el, scope.btn, sourceEl, themeBtn));
    /* rail links carry the current hash: refresh them whenever the state changes */
    const refreshLinks = () => rail.querySelectorAll('a[data-page]').forEach((a) => a.setAttribute('href', stateLink(a.dataset.page)));
    if (BB.state && typeof BB.state.onChange === 'function') BB.state.onChange(refreshLinks); else window.addEventListener('hashchange', refreshLinks);

    const titleEl = el('h1', { class: 'bb-title' }, title);
    const subEl = el('p', { class: 'bb-subtitle' }, subtitle);
    const headActions = el('div', { class: 'row head-actions' });
    /* language toggle (EN base · RU): persisted in localStorage 'bb-lang' (+ hash lang= when present); switching reloads the page */
    const langEl = el('div', { class: 'bb-lang', role: 'group', 'aria-label': 'Language' }, (BB.LANGS || [{ id: 'en', label: 'EN', name: 'English' }]).map((l) =>
      el('button', { type: 'button', class: l.id === BB.lang ? 'on' : '', 'aria-pressed': String(l.id === BB.lang), title: l.name, lang: l.id, onClick: () => { if (l.id !== BB.lang) BB.setLang(l.id); } }, l.label)));
    const toolbarSlot = el('div', { class: 'bb-toolbar-slot' });
    const content = el('div', { class: 'bb-content' });
    const main = el('main', { class: 'bb-main', id: 'main' }, toolbarSlot, el('header', { class: 'bb-head' }, el('div', {}, titleEl, subEl), el('div', { class: 'bb-head-right' }, headActions, contactButton(), langEl)), content, footer());
    setFavicon();
    if (title) applyTitle(T(title));
    const app = el('div', { class: 'bb-app' }, rail, main);
    mount.append(el('a', { class: 'skip-link', href: '#main' }, T('Skip to content')), app);
    if (!document.querySelector('meta[name="color-scheme"]')) document.head.append(el('meta', { name: 'color-scheme', content: 'dark light' }));
    if (!document.querySelector('.toasts')) document.body.append(el('div', { class: 'toasts' }));
    return {
      app, rail, main: content, content, toolbarSlot, headActions, langEl, scope,
      setTitle: (t) => { titleEl.textContent = t; },
      setSubtitle: (s) => { if (isNode(s)) { clear(subEl); subEl.append(s); } else subEl.textContent = s; },
      setSource: (txt, isLive) => { const n = sourceText(txt); sourceEl.querySelector('.src-txt').textContent = n.text; if (n.title) sourceEl.title = n.title; if (isLive != null) sourceEl.querySelector('.live-dot').classList.toggle('off', !isLive); },
    };
  }

  /* ------------------------------------------------------------------ primitives */
  const norm = (o) => (typeof o === 'object' && o !== null ? o : { id: o, label: String(o) });
  function segmented(options, value, onChange, opts = {}) {
    /* one-of-N choice → radiogroup: buttons are role=radio with aria-checked, only the chosen one is in the tab order, arrows move the choice */
    const root = el('div', { class: 'seg' + (opts.class ? ' ' + opts.class : ''), role: 'radiogroup', 'aria-label': opts.label || null });
    let cur = value;
    const paint = () => { const bs = [...root.querySelectorAll('button')]; const any = bs.some((b) => b.dataset.id === String(cur)); bs.forEach((b, i) => { const on = b.dataset.id === String(cur); b.setAttribute('aria-checked', String(on)); b.tabIndex = on || (!any && i === 0) ? 0 : -1; }); };
    const choose = (id, focus) => { if (String(cur) === String(id)) return; cur = id; paint(); if (focus) { const b = root.querySelector(`button[data-id="${String(id).replace(/"/g, '\\"')}"]`); b && b.focus(); } onChange && onChange(id); };
    root.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      const bs = [...root.querySelectorAll('button:not(:disabled)')]; if (!bs.length) return;
      let i = bs.findIndex((b) => b.dataset.id === String(cur)); if (i < 0) i = 0;
      if (e.key === 'Home') i = 0; else if (e.key === 'End') i = bs.length - 1; else i = (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length;
      e.preventDefault(); choose(bs[i].dataset.id, true);
    });
    const render = (opts2) => {
      clear(root);
      opts2.map(norm).forEach((o) => root.append(el('button', { type: 'button', role: 'radio', dataset: { id: o.id }, disabled: o.disabled, title: o.title || null, onClick: () => choose(o.id, false) }, o.color ? el('span', { class: 'dot-c', 'aria-hidden': 'true', style: { background: o.color } }) : null, o.label)));
      paint();
    };
    render(options);
    return { el: root, get value() { return cur; }, set(v) { cur = v; paint(); }, setOptions(o, v) { if (v !== undefined) cur = v; render(o); } };
  }
  function select(options, value, onChange, opts = {}) {
    const sel = el('select', { 'aria-label': opts.label || opts.prefix || null });
    const wrap = el('div', { class: 'select' + (opts.prefix ? ' has-pre' : '') });
    if (opts.prefix) wrap.append(el('span', { class: 'pre' }, opts.prefix));
    wrap.append(sel);
    let curOpts = options;
    const render = (o) => { clear(sel); curOpts = o; o.map(norm).forEach((x) => sel.append(el('option', { value: x.id, disabled: x.disabled }, x.label))); };
    /* width = longest option (so no option text is ever cut) + prefix + chevron; re-measured once web fonts are in */
    const size = () => { const pre = wrap.querySelector('.pre'); const pw = pre ? pre.offsetWidth + 14 : 10; if (pre) wrap.style.setProperty('--pre-w', pw + 'px'); const mw = Math.max(0, ...curOpts.map(norm).map((x) => textW(String(x.label)))); sel.style.width = Math.ceil(mw + pw + 30) + 'px'; };
    render(options);
    sel.value = value == null ? '' : String(value);
    sel.addEventListener('change', () => onChange && onChange(sel.value === '' ? null : coerce(sel.value, curOpts)));
    requestAnimationFrame(size); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (wrap.isConnected) size(); });
    return { el: wrap, select: sel, get value() { return sel.value; }, set(v) { sel.value = v == null ? '' : String(v); }, setOptions(o, v) { render(o); if (v !== undefined) sel.value = v == null ? '' : String(v); size(); } };
  }
  let measureCtx = null;
  const textW = (txt, font) => { if (!measureCtx) { measureCtx = document.createElement('canvas').getContext('2d'); } measureCtx.font = font || ('500 12px ' + (cssVar('--font') || 'Inter, sans-serif')); return measureCtx.measureText(txt).width; };
  const coerce = (v, options) => { const o = (options || []).map(norm).find((x) => String(x.id) === v); return o ? o.id : v; };

  function toggle(label, checked, onChange) {
    const b = el('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(!!checked) }, el('span', { class: 'sw' }), el('span', {}, label));
    b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange && onChange(v); });
    return { el: b, get value() { return b.getAttribute('aria-checked') === 'true'; }, set(v) { b.setAttribute('aria-checked', String(!!v)); } };
  }

  function chip({ k, v, label, onRemove, kind }) {
    const c = el('span', { class: 'chip' + (kind ? ' ' + kind : '') });
    if (label != null) c.append(el('span', { class: 'v' }, label));
    else { if (k != null) c.append(el('span', { class: 'k' }, k + ':')); c.append(el('span', { class: 'v', title: v }, v)); }
    if (onRemove) c.append(el('button', { class: 'x', type: 'button', 'aria-label': T('Remove'), onClick: onRemove }, '×'));
    return c;
  }
  function badge(text, kind, opts = {}) { return el('span', { class: 'badge' + (kind ? ' ' + kind : '') + (opts.mono ? ' mono' : ''), title: opts.title || null }, text); }

  /* popover: anchored to element, closes on outside click / Esc; one at a time */
  let openPop = null;
  function popover(anchor, build, opts = {}) {
    if (openPop) { const same = openPop.anchor === anchor; openPop.close(); if (same && !opts.force) return null; }
    const pop = el('div', { class: 'popover' + (opts.class ? ' ' + opts.class : ''), role: 'dialog' });
    if (opts.width) pop.style.width = opts.width + 'px';
    const api = { el: pop, anchor, close, position };
    const content = build(api);
    if (content) append(pop, [content]);
    document.body.append(pop);
    anchor.setAttribute && anchor.setAttribute('aria-expanded', 'true');
    function position() {
      const r = anchor.getBoundingClientRect(); const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let left = opts.align === 'right' ? r.right - pw : r.left; left = clamp(left, 8, window.innerWidth - pw - 8);
      let top = r.bottom + 6; if (top + ph > window.innerHeight - 8 && r.top - ph - 6 > 8) top = r.top - ph - 6;
      pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
    }
    position();
    const onDoc = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { close(); anchor.focus && anchor.focus(); } };
    setTimeout(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); window.addEventListener('resize', position); window.addEventListener('scroll', position, true); }, 0);
    function close() {
      if (!pop.isConnected) return; pop.remove(); openPop = null;
      anchor.setAttribute && anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      opts.onClose && opts.onClose();
    }
    openPop = api;
    const first = pop.querySelector('input,button,[tabindex]'); if (first && opts.focus !== false) first.focus({ preventScroll: true });
    return api;
  }

  /* multiSelect: checklist with optional search + counts. options:[{v,label,count}] value:[v] */
  function multiSelect({ options = [], value = [], onChange, search = true, placeholder = T('Search…'), maxHeight, footer = true }) {
    const sel = new Set(value.map(String));
    const root = el('div', { class: 'ms' });
    const list = el('div', { class: 'pbody', role: 'listbox', 'aria-multiselectable': 'true' });
    if (maxHeight) { list.style.maxHeight = maxHeight + 'px'; list.style.overflow = 'auto'; }
    let q = '';
    const input = el('input', { class: 'input search', type: 'search', placeholder, 'aria-label': placeholder });
    input.addEventListener('input', () => { q = input.value.trim().toLowerCase(); render(); });
    if (search && options.length > 6) root.append(el('div', { class: 'srch' }, input));
    const emit = () => onChange && onChange(options.filter((o) => sel.has(String(o.v))).map((o) => o.v));
    function render() {
      clear(list);
      const shown = options.filter((o) => !q || String(o.label ?? o.v).toLowerCase().includes(q) || String(o.v).toLowerCase().includes(q));
      if (!shown.length) list.append(el('div', { class: 'empty' }, T('Nothing found')));
      shown.forEach((o) => {
        const on = sel.has(String(o.v));
        const b = el('button', { class: 'opt', type: 'button', role: 'option', 'aria-checked': String(on), 'aria-selected': String(on) },
          el('span', { class: 'cb' }), el('span', { class: 'lab', title: o.label ?? o.v }, o.label ?? o.v), o.count != null ? el('span', { class: 'cnt' }, fmt('int', o.count)) : null);
        b.addEventListener('click', () => { if (on) sel.delete(String(o.v)); else sel.add(String(o.v)); render(); emit(); });
        list.append(b);
      });
    }
    render();
    const foot = el('div', { class: 'pfoot' },
      el('button', { class: 'btn ghost sm', type: 'button', onClick: () => { options.forEach((o) => sel.add(String(o.v))); render(); emit(); } }, T('Select all')),
      el('button', { class: 'btn ghost sm', type: 'button', onClick: () => { sel.clear(); render(); emit(); } }, T('Reset')));
    root.append(list); if (footer) root.append(foot);
    return { el: root, get value() { return options.filter((o) => sel.has(String(o.v))).map((o) => o.v); }, set(v) { sel.clear(); (v || []).forEach((x) => sel.add(String(x))); render(); } };
  }

  /* toast */
  function toast(msg, kind = '', ms = 3200) {
    let host = document.querySelector('.toasts'); if (!host) { host = el('div', { class: 'toasts' }); document.body.append(host); }
    const t = el('div', { class: 'toast ' + kind, role: 'status' }, kind === 'good' ? el('span', { class: 'status-dot good' }) : kind === 'bad' ? el('span', { class: 'status-dot bad' }) : null, el('span', {}, msg));
    host.append(t);
    const kill = () => { t.classList.add('hide'); setTimeout(() => t.remove(), 220); };
    const id = setTimeout(kill, ms); t.addEventListener('click', () => { clearTimeout(id); kill(); });
    return t;
  }

  /* hover card (singleton) */
  let hc = null, hcTimer = null;
  function hoverCard() { if (!hc) { hc = el('div', { class: 'hovercard', role: 'tooltip' }); document.body.append(hc); } return hc; }
  function showHover(html, x, y) {
    const h = hoverCard(); if (isNode(html)) { clear(h); h.append(html); } else h.innerHTML = html;
    h.classList.add('show'); moveHover(x, y);
  }
  function moveHover(x, y) {
    if (!hc) return; const w = hc.offsetWidth, hgt = hc.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 10;
    if (top + hgt > window.innerHeight - 8) top = y - hgt - 10;
    hc.style.left = Math.max(4, left) + 'px'; hc.style.top = Math.max(4, top) + 'px';
  }
  function hideHover() { if (hc) hc.classList.remove('show'); }
  /* global [data-tip] support: data-tip="text" or data-tip-html */
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) return;
    clearTimeout(hcTimer);
    hcTimer = setTimeout(() => showHover(t.dataset.tipHtml ? t.dataset.tip : esc(t.dataset.tip).replace(/\n/g, '<br>'), e.clientX, e.clientY), 120);
    const out = () => { clearTimeout(hcTimer); hideHover(); t.removeEventListener('mouseleave', out); };
    t.addEventListener('mouseleave', out);
  });
  document.addEventListener('mousemove', (e) => { if (hc && hc.classList.contains('show')) moveHover(e.clientX, e.clientY); }, { passive: true });
  /* tip html builder: {title, formula, kv:[[k,v]...], note} */
  function tipHtml({ title, formula, kv, note }) {
    return `${title ? `<div class="t">${esc(title)}</div>` : ''}${formula ? `<div class="f">${esc(formula)}</div>` : ''}${kv && kv.length ? `<div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>` : ''}${note ? `<div class="caption" style="margin-top:4px">${esc(note)}</div>` : ''}`;
  }

  /* ------------------------------------------------------------------ KPI */
  function sparkSvg(data, w = 72, h = 22) {
    const d = (data || []).filter(isNum); if (d.length < 2) return null;
    const min = Math.min(...d), max = Math.max(...d), span = max - min || 1;
    const pts = d.map((v, i) => [(i / (d.length - 1)) * (w - 2) + 1, h - 2 - ((v - min) / span) * (h - 4)]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = path + ` L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
    const s = svg('', ''); s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('class', 'spark'); s.removeAttribute('stroke'); s.removeAttribute('fill');
    s.innerHTML = `<path class="area" d="${area}"/><path d="${path}"/><circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="1.8"/>`;
    return s;
  }
  /* {label, value, delta (fraction, e.g. 0.12), dir (+1 higher better / -1), spark:[...], hint, interval:'[0.9x–1.3x]', fmt, group, deltaLabel} */
  function kpiCard(c) {
    const card = el('div', { class: 'kpi' });
    const hint = c.hint || c.formula || (c.metric && BB.METRIC_BY_KEY && BB.METRIC_BY_KEY[c.metric] ? L(BB.METRIC_BY_KEY[c.metric], 'formula') : null); // formula in the hover card
    /* title may wrap to 2 lines (clamped); the `group` tag is a small pill on its own line under it (full text, never cut) */
    card.append(el('div', { class: 'label' }, el('span', { class: 'lbl', title: typeof c.label === 'string' && c.label.length > 28 ? c.label : null }, c.label), hint ? el('span', { class: 'hint', 'data-tip': hint }, icon('info', 'i')) : null));
    if (c.group) card.append(el('span', { class: 'group', title: c.groupTitle || null }, c.group));
    const valTxt = c.fmt ? fmt(c.fmt, c.value) : c.value == null ? '—' : String(c.value);
    card.append(el('div', { class: 'value' + (String(valTxt).length > 9 ? ' sm' : ''), title: c.title || null }, valTxt));
    const foot = el('div', { class: 'foot' });
    let good = null;
    const NA = T(BB.COMPARE_NA || 'no full period to compare with'), CAP = BB.DELTA_CAP || 5;
    if (c.delta === 'na') foot.append(el('span', { class: 'delta flat', 'data-tip': NA }, '—', c.interval ? el('span', { class: 'interval' }, ' ' + c.interval) : null));
    else if (isNum(c.delta)) {
      const dir = c.dir == null ? 1 : c.dir; const sign = Math.sign(c.delta) * dir;
      good = c.delta === 0 || dir === 0 ? null : sign > 0; // dir 0 = neutral metric (spend): grey arrow, no judgement
      const cls = c.delta === 0 ? 'flat' : dir === 0 ? 'flat neutral' : good ? 'good' : 'bad';
      const capped = Math.abs(c.delta) > CAP; // > ±500 % → "> 500%" (a mostly-empty compare window looks broken otherwise)
      foot.append(el('span', { class: 'delta ' + cls, title: (c.deltaLabel || T('vs previous period')) + (capped ? ' · ' + localFmt.delta(c.delta) : '') }, c.delta === 0 ? '→' : c.delta > 0 ? '▲' : '▼', ' ', capped ? '> 500%' : localFmt.pct(Math.abs(c.delta)), c.interval ? el('span', { class: 'interval' }, ' ' + c.interval) : null));
    } else if (c.interval) foot.append(el('span', { class: 'delta flat' }, el('span', { class: 'interval' }, c.interval)));
    else if (c.sub) foot.append(el('span', { class: 'delta flat' }, c.sub));
    else foot.append(el('span'));
    const sp = sparkSvg(c.spark); if (sp) foot.append(sp);
    if (good === true) card.classList.add('good-trend'); if (good === false) card.classList.add('bad-trend');
    card.append(foot);
    /* comparison basis is visible, not only in the title attribute (KPI skill: a delta without its basis is unreadable) */
    if ((c.delta != null || c.basis) && c.basis !== false) card.append(el('div', { class: 'basis' }, c.basis || c.deltaLabel || T('vs previous period')));
    return card;
  }
  /* kpiRow(container, cards, {cols:6|4, max}) — 6 per row at ≥1200 (4 when cols:4); cards beyond `max` (default = cols) collapse behind «N more».
     The expanded/collapsed choice is kept on the container (dataset.kpiOpen) so a refetch re-render does not shift the layout. */
  function kpiRow(container, cards, opts = {}) {
    clear(container); container.classList.add('kpi-row');
    const cols = opts.cols || 6; container.dataset.cols = String(cols); container.style.setProperty('--kpi-cols', String(cols));
    const max = opts.max == null ? cols : opts.max;
    const open = container.dataset.kpiOpen === '1';
    const nodes = cards.map((c) => (isNode(c) ? c : kpiCard(c)));
    nodes.forEach((n, i) => { if (i >= max) { n.classList.add('overflow'); n.hidden = !open; } container.append(n); });
    if (nodes.length > max) {
      const hiddenN = nodes.length - max;
      const btn = el('button', { class: 'kpi-more', type: 'button', 'aria-expanded': String(open) }, open ? T('Hide') : T('{n} more', { n: hiddenN }));
      btn.addEventListener('click', () => { const o = container.dataset.kpiOpen !== '1'; container.dataset.kpiOpen = o ? '1' : '0'; nodes.forEach((n, i) => { if (i >= max) n.hidden = !o; }); btn.textContent = o ? T('Hide') : T('{n} more', { n: hiddenN }); btn.setAttribute('aria-expanded', String(o)); });
      container.append(btn);
    }
    return container;
  }

  /* ------------------------------------------------------------------ card */
  function card(container, { title, caption, actions, body, foot, collapsible, collapsed, cls } = {}) {
    const root = el('section', { class: 'card' + (cls ? ' ' + cls : '') + (collapsible ? ' collapsible' : '') });
    if (collapsible) root.dataset.collapsed = String(!!collapsed);
    const titleEl = el('h2', { class: 'card-title' }, el('span', { class: 'ttl', title: typeof title === 'string' ? title : null }, title), caption ? el('span', { class: 'caption' }, caption) : null);
    const actEl = el('div', { class: 'card-actions' }, actions || []);
    const head = el('div', { class: 'card-head' }, titleEl, actEl);
    const bodyEl = el('div', { class: 'card-body' + (body && body.flush ? ' flush' : '') });
    const b = body && body.flush ? body.node : body;
    if (typeof b === 'function') b(bodyEl); else if (isNode(b)) bodyEl.append(b); else if (typeof b === 'string') bodyEl.innerHTML = b;
    root.append(head, bodyEl);
    let footEl = null; if (foot) { footEl = el('div', { class: 'card-foot' }, foot); root.append(footEl); }
    if (collapsible) head.addEventListener('click', (e) => { if (e.target.closest('.card-actions')) return; root.dataset.collapsed = String(root.dataset.collapsed !== 'true'); });
    if (container) container.append(root);
    return { el: root, body: bodyEl, head, actions: actEl, foot: footEl, setTitle: (t) => { titleEl.firstChild.textContent = t; titleEl.firstChild.title = t; }, setCaption: (c) => { let s = titleEl.querySelector('.caption'); if (!s) { s = el('span', { class: 'caption' }); titleEl.append(s); } s.textContent = c; }, setFoot: (f) => { if (!footEl) { footEl = el('div', { class: 'card-foot' }); root.append(footEl); } clear(footEl); append(footEl, [f]); } };
  }

  /* ------------------------------------------------------------------ table */
  const cellV = (x) => (x != null && typeof x === 'object' ? x.v : x);
  function table(container, cfg) {
    let state = Object.assign({ columns: [], rows: [], total: null, sort: null, pinTotal: true, emptyText: T('No data'), maxHeight: null }, cfg);
    const expanded = new Set(state.expanded || []);
    const wrap = el('div', { class: 'tbl-wrap', tabindex: '0', role: 'region', 'aria-label': state.ariaLabel || T('Table, scrollable') }); // keyboard-scrollable
    const tbl = el('table', { class: 'tbl' });
    wrap.append(tbl);
    clear(container).append(wrap);
    container.classList.add('tbl-host');
    wrap.addEventListener('scroll', () => wrap.classList.toggle('scrolled-x', wrap.scrollLeft > 0), { passive: true });

    const colFmt = (col, raw, row) => {
      const v = cellV(raw);
      if (col.render) { const r = col.render(row, col, raw); return r; }
      if (v == null || v === '') return null;
      return col.fmt ? fmt(col.fmt, v) : isNum(v) ? localFmt.num(v) : String(v);
    };
    const getRaw = (row, col) => (typeof col.get === 'function' ? col.get(row) : row[col.key]);

    function heatScale(col, rows) {
      if (!col.heatmap) return null;
      const vals = rows.map((r) => cellV(getRaw(r, col))).filter(isNum);
      if (!vals.length) return null;
      let min = Math.min(...vals), max = Math.max(...vals);
      if (col.heatmapRange) { min = col.heatmapRange[0]; max = col.heatmapRange[1]; }
      return { min, max };
    }
    function applyHeat(td, col, raw, row, scale) {
      const v = cellV(raw); if (!isNum(v)) return;
      if (typeof col.heatmap === 'function') {
        const r = col.heatmap(v, row, col, scale); if (!r) return;
        if (typeof r === 'string') { td.classList.add('hm', r); td.style.setProperty('--hm', '0.35'); return; }
        td.classList.add('hm', r.kind || 'accent'); td.style.setProperty('--hm', String(clamp(r.alpha ?? 0.3, 0, 0.85)));
        return;
      }
      if (!scale) return;
      const span = scale.max - scale.min;
      let t = span > 0 ? (v - scale.min) / span : 0.5;
      const dir = col.dir ?? 1; if (dir < 0) t = 1 - t;
      let kind = col.heatmap === true ? 'accent' : col.heatmap;
      td.classList.add('hm', kind);
      td.style.setProperty('--hm', (0.06 + t * 0.5).toFixed(3));
    }

    function sortRows(rows) {
      const s = state.sort; if (!s || !s.key || state.onSort) return rows;
      const col = state.columns.find((c) => c.key === s.key); if (!col) return rows;
      const dir = s.dir === 'asc' ? 1 : -1;
      return rows.slice().sort((a, b) => {
        const va = cellV(getRaw(a, col)), vb = cellV(getRaw(b, col));
        if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
        if (isNum(va) && isNum(vb)) return (va - vb) * dir;
        return String(va).localeCompare(String(vb), BB.lang || 'en') * dir;
      });
    }

    function render() {
      clear(tbl);
      const cols = state.columns.filter((c) => !c.hidden);
      wrap.classList.toggle('has-max', !!state.maxHeight); if (state.maxHeight) wrap.style.setProperty('--tbl-max', typeof state.maxHeight === 'number' ? state.maxHeight + 'px' : state.maxHeight);
      const stickyIdx = cols.findIndex((c) => c.sticky); const firstSticky = stickyIdx >= 0 ? stickyIdx : 0;
      const colgroup = el('colgroup'); cols.forEach((c) => colgroup.append(el('col', { style: c.width ? { width: typeof c.width === 'number' ? c.width + 'px' : c.width, minWidth: typeof c.width === 'number' ? c.width + 'px' : c.width } : null })));
      tbl.append(colgroup);
      /* head */
      const trh = el('tr');
      cols.forEach((c, i) => {
        const sorted = state.sort && state.sort.key === c.key;
        const align = c.align || (i === 0 ? 'left' : 'right');
        const mk = c.metric || (BB.METRIC_BY_KEY && BB.METRIC_BY_KEY[c.key] ? c.key : null);
        const th = el('th', { class: [align, c.sortable !== false ? 'sortable' : '', i === firstSticky ? 'sticky-col' : '', c.thClass || ''].filter(Boolean).join(' '), scope: 'col', 'aria-sort': sorted ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : null, 'data-tip': c.tip || (mk ? L(BB.METRIC_BY_KEY[mk], 'formula') : null), tabindex: c.sortable !== false ? 0 : null },
          el('span', { class: 'th-in' }, c.sortable !== false && align === 'right' ? icon('down', 'arrow') : null, c.label, c.sortable !== false && align !== 'right' ? icon('down', 'arrow') : null));
        if (c.sortable !== false) {
          const go = () => {
            const dir = sorted && state.sort.dir === 'desc' ? 'asc' : sorted && state.sort.dir === 'asc' ? null : 'desc';
            state.sort = dir ? { key: c.key, dir } : null;
            if (state.onSort) state.onSort(state.sort); else render();
          };
          th.addEventListener('click', go); th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        }
        trh.append(th);
      });
      tbl.append(el('thead', {}, trh));
      const tbody = el('tbody'); tbl.append(tbody);
      const rows = sortRows(state.rows || []);
      const scales = cols.map((c) => heatScale(c, rows));
      if (state.total) tbody.append(makeRow(state.total, cols, scales, { total: true, pinned: state.pinTotal !== false, depth: 0 }));
      if (!rows.length) { tbody.append(el('tr', {}, el('td', { colspan: cols.length, class: 'tbl-empty left', style: { fontFamily: 'var(--font)' } }, state.emptyText))); return; }
      addRows(rows, 0, null, null, tbody, cols, scales);
    }
    /* recursive expandable rows: any level may be a group (expandable.isGroup) with expandable.children(row) */
    const isGroupRow = (r) => !!(state.expandable && state.expandable.isGroup && state.expandable.isGroup(r));
    const kidsOf = (r) => (state.expandable && state.expandable.children ? state.expandable.children(r) || [] : []);
    function addRows(list, depth, parentKey, parent, tbody, cols, scales) {
      list.forEach((r, i) => {
        const key = rowKey(r, i, parentKey), group = isGroupRow(r);
        tbody.append(makeRow(r, cols, scales, { group, index: i, depth, key, child: depth > 0, parent }));
        if (group && expanded.has(key)) addRows(kidsOf(r), depth + 1, key, r, tbody, cols, scales);
      });
    }
    /* key = row.key | row.id | index; nested rows are keyed by their path so equal child keys under different parents do not collide */
    const rowKey = (r, i, parentKey) => { const own = String(r.key != null ? r.key : r.id != null ? r.id : 'i' + i); return parentKey == null ? own : parentKey + '/' + own; };
    function makeRow(r, cols, scales, o) {
      const depth = o.depth || 0;
      const tr = el('tr', { class: [o.total ? 'total' + (o.pinned ? ' pinned' : '') : '', o.group ? 'group' : '', o.child ? 'child depth-' + depth : '', r.sub === true && !o.total ? 'sub' : '', state.rowClass ? state.rowClass(r, o) || '' : ''].filter(Boolean).join(' ') || null });
      if (depth) { tr.dataset.depth = String(depth); tr.style.setProperty('--depth', String(depth)); }
      const clickable = (!o.total && state.onRowClick) || o.group;
      if (clickable) { tr.classList.add('clickable'); tr.tabIndex = 0; }
      if (o.group) tr.setAttribute('aria-expanded', String(expanded.has(o.key)));
      const stickyIdx = cols.findIndex((c) => c.sticky); const firstSticky = stickyIdx >= 0 ? stickyIdx : 0;
      cols.forEach((c, i) => {
        const raw = getRaw(r, c);
        const v = cellV(raw);
        const align = c.align || (i === 0 ? 'left' : 'right');
        const td = el('td', { class: [align, i === firstSticky ? 'sticky-col' : '', (i === 0 || c.text) ? 'txt' : '', c.tdClass || ''].filter(Boolean).join(' ') || null });
        if (c.width) { td.style.width = typeof c.width === 'number' ? c.width + 'px' : c.width; td.style.minWidth = td.style.width; }
        const out = colFmt(c, raw, r);
        if (o.group && i === 0) td.append(el('span', { class: 'exp', 'aria-hidden': 'true' }, icon('chev')));
        if (raw != null && typeof raw === 'object' && raw.mature === false && !raw.predicted) {
          td.classList.add('immature'); td.setAttribute('aria-label', T('Cohort not mature yet')); td.textContent = '';
        } else if (raw != null && typeof raw === 'object' && raw.predicted) {
          td.classList.add('predicted'); if (raw.mature === false) td.classList.add('immature');
          td.append(el('span', { class: 'pv' }, out == null ? '—' : out));
          if (!c.heatmap || c.heatmapPredicted !== false) applyHeat(td, c, raw, r, scales[i]);
        } else {
          if (out == null) { td.classList.add('empty'); td.textContent = '—'; }
          else if (isNode(out)) td.append(out); else if (typeof out === 'string' && out.startsWith('<')) td.innerHTML = out; else td.append(String(out));
          if (!o.total || state.heatTotal) applyHeat(td, c, raw, r, scales[i]);
          if (raw != null && typeof raw === 'object' && raw.over) td.classList.add('over');
        }
        if (raw != null && typeof raw === 'object' && raw.cls) td.classList.add(raw.cls);
        if (r.sub && typeof r.sub !== 'boolean' && i === 0 && !o.total) td.append(el('span', { class: 'sub' }, r.sub)); // boolean sub → row class only
        /* hover card: explicit tip → page cellTip → formula of the metric the column maps to (col.metric || col.key in BB.METRICS) */
        const mkey = c.metric || (BB.METRIC_BY_KEY && BB.METRIC_BY_KEY[c.key] ? c.key : null);
        if (state.cellTip || (raw && typeof raw === 'object' && raw.tip) || mkey) {
          td.addEventListener('mouseenter', (e) => {
            let h = raw && raw.tip ? raw.tip : state.cellTip ? state.cellTip(r, c, raw) : null;
            if (!h && mkey) h = metricTip(mkey, { kv: [[T('Value'), out == null ? '—' : isNode(out) ? out.textContent : String(out)]] });
            if (h) showHover(typeof h === 'object' && !isNode(h) ? tipHtml(h) : h, e.clientX, e.clientY);
          });
          td.addEventListener('mouseleave', hideHover);
        }
        tr.append(td);
      });
      if (clickable) {
        const act = () => {
          if (o.group) { const k = o.key; if (expanded.has(k)) expanded.delete(k); else expanded.add(k); render(); state.onExpand && state.onExpand(r, expanded.has(k)); }
          if (state.onRowClick) state.onRowClick(r, o);
        };
        tr.addEventListener('click', (e) => { if (e.target.closest('a,button,input')) return; act(); });
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const sib = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling; if (sib && sib.tabIndex >= 0) sib.focus(); } });
      }
      return tr;
    }
    render();
    /* CSV: immature cells export empty; with cfg.csvBasis a trailing `basis` column says `predicted` when any exported cell of the row is a forecast (those values carry a `~` prefix), else `actual` */
    const toCsv = () => {
      const cols = state.columns.filter((c) => !c.hidden);
      const line = (r) => { let pred = false; const cells = cols.map((c) => { const raw = getRaw(r, c); const v = cellV(raw); if (raw && typeof raw === 'object' && raw.mature === false && !raw.predicted) return ''; const isP = !!(raw && typeof raw === 'object' && raw.predicted && v != null); if (isP) pred = true; return csvCell(v == null ? '' : isP ? '~' + v : isNum(v) ? v : String(v)); }); if (state.csvBasis) cells.push(pred ? 'predicted' : 'actual'); return cells.join(','); };
      const out = [cols.map((c) => csvCell(c.label)).concat(state.csvBasis ? ['basis'] : []).join(',')];
      if (state.total) out.push(line(state.total));
      const walk = (list, parentKey) => list.forEach((r, i) => { out.push(line(r)); const k = rowKey(r, i, parentKey); if (isGroupRow(r) && expanded.has(k)) walk(kidsOf(r), k); });
      walk(sortRows(state.rows || []), null);
      return out.join('\n');
    };
    const expandWalk = (list, parentKey) => list.forEach((r, i) => { if (isGroupRow(r)) { const k = rowKey(r, i, parentKey); expanded.add(k); expandWalk(kidsOf(r), k); } });
    return { el: wrap, table: tbl, update(patch) { state = Object.assign(state, patch); render(); }, render, toCsv, get state() { return state; }, expandAll() { expandWalk(state.rows || [], null); render(); }, collapseAll() { expanded.clear(); render(); } };
  }
  const csvCell = (v) => { const s = String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function downloadCsv(name, csv) {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name.endsWith('.csv') ? name : name + '.csv' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ------------------------------------------------------------------ charts */
  /* Categorical palette (dataviz skill, validated with validate_palette.js for both surfaces): 8 fixed slots, theme-stepped.
     1 blue · 2 orange · 3 aqua · 4 yellow · 5 magenta · 6 green · 7 violet · 8 red.  Never cycle past 8: use ordinal() or group into "Other". */
  const PAL = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  };
  const PALETTE = PAL.dark; // legacy alias (dark stepping); prefer palette(i), which follows the live theme
  const curPal = () => PAL[getTheme() === 'light' ? 'light' : 'dark'];
  const palette = (i) => (i == null ? curPal().slice() : curPal()[((i % 8) + 8) % 8]);
  /* Status colours are reserved: never a series. Pages read them via statusColor('good'|'warn'|'serious'|'bad'). */
  const STATUS = { good: '#0ca30c', warn: '#fab219', serious: '#ec835a', bad: '#d03b3b' };
  const statusColor = (k) => cssVar('--' + k) || STATUS[k] || STATUS.bad;
  /* Sequential ramp (slot-1 blue, steps 100…700). ordinal(i, n): one hue, light→dark for a *sequence* (cohorts, stages, day buckets). */
  const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
  const ORD_MAX = 5; // the ramp carries ≤ 5 distinguishable steps on both surfaces (ΔL ≥ 0.06, validate_palette.js --ordinal): longer sequences share shades
  function ordinal(i, n) {
    n = Math.max(1, n || 1); if (n > ORD_MAX) { i = Math.floor(Math.min(i, n - 1) * ORD_MAX / n); n = ORD_MAX; }
    const t = n === 1 ? 1 : Math.min(1, Math.max(0, i / (n - 1)));
    if (getTheme() === 'light') return SEQ[3 + Math.round(t * 9)];       // 250 → 700 (first step must still read on white)
    return SEQ[10 - Math.round(t * 10)];                                   // 600 → 100 (later = lighter = more prominent on dark)
  }
  const seqColor = (t) => ordinal(Math.round(Math.min(1, Math.max(0, t)) * 100), 101);
  /* entityColor(ns, key): colour follows the entity, not its rank — the same key gets the same slot for the page's lifetime (also across filters). */
  const entityRegistry = new Map();
  function entitySlot(ns, key) {
    let m = entityRegistry.get(ns); if (!m) { m = new Map(); entityRegistry.set(ns, m); }
    if (!m.has(key)) m.set(key, m.size);
    return m.get(key);
  }
  const entityColor = (ns, key) => palette(entitySlot(ns, key));
  /* channels: fixed slots used identically everywhere (toolbar dots, table dots, flow tags, charts) */
  const CHANNEL_SLOT = { facebook: 0, google: 2, tiktok: 1, web2web: 6, organic: 5 };
  const channelColor = (id) => (CHANNEL_SLOT[id] != null ? palette(CHANNEL_SLOT[id]) : entityColor('channel', id));
  (BB.CHANNELS || []).forEach((c) => { try { Object.defineProperty(c, 'color', { get: () => channelColor(c.id), enumerable: true, configurable: true }); } catch (e) { /* frozen */ } });

  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const slotOf = (hex) => { if (typeof hex !== 'string') return -1; const h = hex.toLowerCase(); let i = PAL.light.indexOf(h); if (i < 0) i = PAL.dark.indexOf(h); return i; };
  const reduceMotion = () => { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const charts = new Set();
  function chartTheme() {
    return { fg3: cssVar('--fg-3') || '#8a8f98', fg2: cssVar('--fg-2') || '#d0d6e0', fg: cssVar('--fg') || '#fff', line: cssVar('--line') || '#232427', bg1: cssVar('--bg-1') || '#0f1011', bg3: cssVar('--bg-3') || '#1c1d1f', line2: cssVar('--line-2') || '#2e3034', font: cssVar('--font') || 'Inter, sans-serif', mono: cssVar('--mono') || 'JetBrains Mono, monospace' };
  }
  function themeOptions(opts, t, nDatasets) {
    opts = opts || {};
    const scales = opts.scales || {};
    for (const k of Object.keys(scales)) {
      const s = scales[k]; const isX = k.startsWith('x');
      s.grid = Object.assign({ color: t.line, drawTicks: false, display: !isX }, s.grid || {}, { color: t.line }); // hairline solid grid: y only
      s.border = Object.assign({ display: false }, s.border || {}); s.ticks = Object.assign({ color: t.fg3, font: { family: t.mono, size: 11 }, maxRotation: 0, autoSkip: true, padding: 6 }, s.ticks || {}, { color: t.fg3 });
      if (s.title) s.title.color = t.fg3;
    }
    opts.plugins = opts.plugins || {};
    const legendWanted = opts.plugins.legend && opts.plugins.legend.display != null ? opts.plugins.legend.display : (nDatasets == null ? true : nDatasets >= 2); // legend only when ≥2 series
    opts.plugins.legend = Object.assign({ position: 'bottom', align: 'start', labels: {} }, opts.plugins.legend || {}, { display: legendWanted });
    opts.plugins.legend.labels = Object.assign({ color: t.fg3, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'rectRounded', padding: 12, font: { family: t.font, size: 11 } }, opts.plugins.legend.labels || {}, { color: t.fg3 });
    opts.plugins.tooltip = Object.assign({ backgroundColor: t.bg3, borderColor: t.line2, borderWidth: 1, titleColor: t.fg, bodyColor: t.fg2, padding: 8, cornerRadius: 6, boxPadding: 4, titleFont: { family: t.font, size: 11, weight: '600' }, bodyFont: { family: t.mono, size: 11 }, usePointStyle: true, boxWidth: 6, boxHeight: 6 }, opts.plugins.tooltip || {}, { backgroundColor: t.bg3, borderColor: t.line2, titleColor: t.fg, bodyColor: t.fg2 });
    return opts;
  }
  /* hover layer for line charts: a hairline crosshair at the active index (tooltip is index-mode, so every series is listed) */
  const crosshairPlugin = {
    id: 'bbCrosshair',
    afterDraw(ch) {
      const act = ch.tooltip && ch.tooltip.getActiveElements ? ch.tooltip.getActiveElements() : [];
      if (!act.length || !ch.scales.x) return;
      const x = act[0].element.x; const ca = ch.chartArea; const ctx = ch.ctx;
      ctx.save(); ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.lineWidth = 1; ctx.strokeStyle = cssVar('--line-2') || '#2e3034'; ctx.stroke(); ctx.restore();
    },
  };
  function styleDatasets(config, t) {
    const stacked = !!(config.options.scales && Object.values(config.options.scales).some((s) => s && s.stacked));
    (config.data && config.data.datasets || []).forEach((ds, i) => {
      /* colour: explicit (hex) → keep but remember its slot so re-theme can re-step it; none → slot i (never past 8) */
      if (ds._nmSlot == null) { const sl = slotOf(ds.borderColor || ds._color); ds._nmSlot = sl >= 0 ? sl : (ds.borderColor || ds._color ? null : i % 8); }
      const color = ds._nmSlot != null ? palette(ds._nmSlot) : (ds._nmOrd ? ordinal(ds._nmOrd[0], ds._nmOrd[1]) : (ds.borderColor || ds._color || palette(i)));
      const restyle = ds._color !== color; ds._color = color;
      const isHex = typeof color === 'string' && color.startsWith('#');
      const kind = ds.type || config.type;
      if (kind === 'line') {
        if (restyle || !ds.borderColor) ds.borderColor = color; ds.borderWidth = ds.borderWidth ?? 2; ds.pointRadius = ds.pointRadius ?? 0; ds.pointHoverRadius = ds.pointHoverRadius ?? 3; ds.tension = ds.tension ?? 0.3;
        if (restyle || !ds.pointBackgroundColor) ds.pointBackgroundColor = color;
        if (ds.fill && (ds.backgroundColor == null || ds._autoBg)) { ds.backgroundColor = hexA(isHex ? color : palette(i), 0.1); ds._autoBg = true; }
      } else if (kind === 'bar') {
        if (restyle || !ds.backgroundColor) ds.backgroundColor = color;
        ds.maxBarThickness = ds.maxBarThickness ?? 24;
        if (stacked) { ds.borderColor = t.bg1; ds.borderWidth = ds.borderWidth ?? 2; ds.borderRadius = ds.borderRadius ?? 4; } // 2px surface gap between segments, rounded only at the stack end
        else { ds.borderRadius = ds.borderRadius ?? 4; ds.borderWidth = ds.borderWidth ?? 0; ds.categoryPercentage = ds.categoryPercentage ?? 0.7; ds.barPercentage = ds.barPercentage ?? 0.9; }
      } else { if (restyle || !ds.backgroundColor) ds.backgroundColor = (config.data.labels || []).map((_, j) => palette(j)); ds.borderWidth = ds.borderWidth ?? 0; }
    });
  }
  function chart(canvas, config) {
    if (!window.Chart) { console.warn('Chart.js not loaded'); return null; }
    const t = chartTheme();
    const C = window.Chart;
    C.defaults.font.family = t.font; C.defaults.font.size = 11; C.defaults.color = t.fg3;
    config = config || {}; config.options = config.options || {};
    config.options.responsive = config.options.responsive ?? true; config.options.maintainAspectRatio = config.options.maintainAspectRatio ?? false;
    config.options.animation = reduceMotion() ? false : (config.options.animation ?? { duration: 250 });
    config.options.interaction = Object.assign({ mode: 'index', intersect: false }, config.options.interaction || {});
    config.options.scales = config.options.scales || { x: {}, y: {} };
    const nds = (config.data && config.data.datasets || []).length;
    if (config.options.plugins && config.options.plugins.legend && config.options.plugins.legend.display != null) config.options._nmLegend = config.options.plugins.legend.display;
    themeOptions(config.options, t, nds);
    styleDatasets(config, t);
    const anyLine = config.type === 'line' || (config.data && config.data.datasets || []).some((d) => d.type === 'line');
    if (anyLine) { config.plugins = (config.plugins || []).concat(crosshairPlugin); config.options.interaction.mode = config.options.interaction.mode || 'index'; }
    const inst = new C(canvas, config);
    charts.add(inst);
    /* Re-theme: write theme colours into the chart's *plain* config (inst.config.options / data.datasets — never the resolved proxies)
       and let Chart.js re-resolve on update(). Palette slots are re-stepped for the new surface. Pages may set inst._nmRetheme = null. */
    inst._nmRetheme = () => {
      try {
        const t2 = chartTheme(); C.defaults.color = t2.fg3;
        const plain = inst.config && inst.config.options; if (!plain || plain._proxy) return;
        if (plain._nmLegend != null) { plain.plugins = plain.plugins || {}; plain.plugins.legend = plain.plugins.legend || {}; plain.plugins.legend.display = plain._nmLegend; }
        themeOptions(plain, t2, (inst.config.data.datasets || []).length); styleDatasets(inst.config, t2); inst.update('none');
      } catch (e) { console.warn('BB.ui.chart: re-theme failed', e); }
    };
    const origDestroy = inst.destroy.bind(inst); inst.destroy = () => { charts.delete(inst); origDestroy(); };
    return inst;
  }
  onTheme(() => charts.forEach((c) => c._nmRetheme && c._nmRetheme()));

  /* chartStack(host, [cfgA, cfgB], {heights:[3,2], axisWidth:52}): two small charts sharing an x axis instead of a dual-axis chart.
     The top chart hides its x ticks; both y axes are forced to the same width so the x positions line up; hover is mirrored. */
  function chartStack(host, cfgs, { heights, axisWidth = 52 } = {}) {
    clear(host); host.classList.add('chart-stack');
    const canvases = cfgs.map((cfg, i) => {
      const wrap = el('div', { class: 'chart-stack-item', style: { flex: String(heights && heights[i] != null ? heights[i] : 1) + ' 1 0' } });
      const cv = el('canvas', { role: 'img', 'aria-label': cfg.ariaLabel || null }); wrap.append(cv); host.append(wrap); return cv;
    });
    const insts = cfgs.map((cfg, i) => {
      delete cfg.ariaLabel;
      cfg.options = cfg.options || {}; cfg.options.scales = cfg.options.scales || { x: {}, y: {} };
      const x = cfg.options.scales.x = cfg.options.scales.x || {}; const y = cfg.options.scales.y = cfg.options.scales.y || {};
      if (i < cfgs.length - 1) { x.ticks = Object.assign({}, x.ticks || {}, { display: false }); x.grid = Object.assign({}, x.grid || {}, { display: false }); }
      y.afterFit = (sc) => { sc.width = axisWidth; };
      cfg.options.layout = Object.assign({ padding: { right: 8 } }, cfg.options.layout || {});
      return chart(canvases[i], cfg);
    });
    /* mirror hover between the stacked charts */
    insts.forEach((a, ai) => {
      if (!a) return;
      canvases[ai].addEventListener('mousemove', (ev) => {
        const pts = a.getElementsAtEventForMode(ev, 'index', { intersect: false }, true);
        insts.forEach((b, bi) => {
          if (bi === ai || !b) return;
          if (!pts.length) { b.setActiveElements([]); b.tooltip.setActiveElements([], { x: 0, y: 0 }); b.update('none'); return; }
          const idx = pts[0].index; const els = b.data.datasets.map((_, d) => ({ datasetIndex: d, index: idx })).filter((e) => b.getDatasetMeta(e.datasetIndex).data[idx]);
          b.setActiveElements(els); b.tooltip.setActiveElements(els, { x: ev.offsetX, y: 0 }); b.update('none');
        });
      });
      canvases[ai].addEventListener('mouseleave', () => insts.forEach((b, bi) => { if (bi !== ai && b) { b.setActiveElements([]); b.tooltip.setActiveElements([], { x: 0, y: 0 }); b.update('none'); } }));
    });
    return { charts: insts, el: host, destroy: () => insts.forEach((c) => c && c.destroy()) };
  }

  /* Table view for a chart card (dataviz: "every chart has a table"). viewToggle(cardApi, getCharts, {fmt, maxHeight}) adds a
     Chart | Table radiogroup to the card actions; the table is derived from the live chart(s): x label + one column per dataset. */
  function chartTableData(instances, { fmt: f = 'num', labelHeader = '', xFmt } = {}) {
    const list = (Array.isArray(instances) ? instances : [instances]).filter(Boolean);
    const sets = list.flatMap((ch) => (ch.data.datasets || []).filter((ds) => !ds._band && !ds._ref && ds.borderColor !== 'transparent'));
    const xy = sets.some((ds) => (ds.data || []).some((v) => v != null && typeof v === 'object' && 'x' in v));
    let labels = (list[0] && list[0].data.labels) || [];
    if (xy) { const xs = new Set(); sets.forEach((ds) => (ds.data || []).forEach((v) => { if (v && typeof v === 'object') xs.add(v.x); })); labels = [...xs].sort((a, b) => a - b); }
    const columns = [{ key: '_x', label: labelHeader, align: 'left', sortable: false }];
    const rows = labels.map((l) => ({ _x: xFmt ? xFmt(l) : String(Array.isArray(l) ? l.join(' ') : l) }));
    sets.forEach((ds, k) => {
      const key = 'd' + k;
      columns.push({ key, label: ds.label || key, fmt: ds._nmFmt || f, sortable: false });
      if (xy) { const m = new Map(); (ds.data || []).forEach((v) => { if (v && typeof v === 'object') m.set(v.x, v.y ?? v.v); }); rows.forEach((r, i) => { r[key] = m.has(labels[i]) ? m.get(labels[i]) : null; }); }
      else rows.forEach((r, i) => { const v = ds.data[i]; r[key] = v != null && typeof v === 'object' ? (v.y ?? v.v) : v; });
    });
    return { columns, rows };
  }
  function viewToggle(cardApi, getCharts, opts = {}) {
    const body = cardApi.body; let tblHost = null, mode = 'chart';
    const apply = () => {
      const isT = mode === 'table';
      const targets = opts.targets ? (typeof opts.targets === 'function' ? opts.targets() : opts.targets) : [...body.children];
      targets.forEach((n) => { if (n && n !== tblHost) n.hidden = isT; });
      if (!opts.targets) body.classList.toggle('chart-table-mode', isT);
      if (isT) {
        if (!tblHost || !tblHost.isConnected) { tblHost = el('div', { class: 'chart-table' }); const t0 = opts.targets && targets[0] && targets[0].parentNode ? targets[0] : null; if (t0) t0.parentNode.insertBefore(tblHost, t0.nextSibling); else body.append(tblHost); }
        const d = chartTableData(typeof getCharts === 'function' ? getCharts() : getCharts, opts);
        table(tblHost, Object.assign({ columns: d.columns, rows: d.rows, maxHeight: opts.maxHeight || 320, sort: null, ariaLabel: T('Chart data') }, opts.table || {}));
      } else if (tblHost) { tblHost.remove(); }
      charts.forEach((c) => { try { if (!isT && body.contains(c.canvas)) c.resize(); } catch (e) { /* detached */ } });
    };
    const seg = segmented([{ id: 'chart', label: T('Chart') }, { id: 'table', label: T('Table') }], mode, (v) => { mode = v; apply(); }, { label: T('View'), class: 'sm view' });
    cardApi.actions.append(seg.el);
    return { el: seg.el, get mode() { return mode; }, refresh: () => { if (mode === 'table') apply(); } };
  }

  /* ------------------------------------------------------------------ grid heatmap (geo × hour) */
  function heatmap(container, { rows = [], cols = [], value, fmt: f = 'int', colorScale = 'seq', tip, emptyText = '·', corner = '' }) {
    const grid = el('div', { class: 'hmap', style: { gridTemplateColumns: `minmax(64px,auto) repeat(${cols.length}, minmax(22px,1fr))` } });
    const vals = []; const matrix = rows.map((r) => cols.map((c) => { const v = value(r, c); if (isNum(v)) vals.push(v); return v; }));
    const min = Math.min(...vals), max = Math.max(...vals);
    grid.append(el('div', { class: 'hc', style: { justifyContent: 'flex-end', paddingRight: '8px' } }, corner));
    cols.forEach((c) => grid.append(el('div', { class: 'hc' }, norm(c).label)));
    rows.forEach((r, i) => {
      const rn = norm(r); grid.append(el('div', { class: 'hl', title: rn.label }, rn.label));
      cols.forEach((c, j) => {
        const v = matrix[i][j];
        const cell = el('div', { class: 'hm' });
        if (!isNum(v)) { cell.classList.add('empty'); cell.textContent = emptyText; }
        else {
          let kind = colorScale, alpha;
          if (typeof colorScale === 'function') { const o = colorScale(v, min, max) || {}; kind = o.kind || 'seq'; alpha = o.alpha ?? 0.3; }
          else { const t = max > min ? (v - min) / (max - min) : 0.5; alpha = 0.08 + t * 0.62; }
          cell.classList.add(kind); cell.style.setProperty('--hm', alpha.toFixed(3));
          cell.textContent = fmt(f, v);
        }
        const tipText = tip ? tip(r, c, v) : `${rn.label} · ${norm(c).label}: ${isNum(v) ? fmt(f, v) : '—'}`;
        cell.addEventListener('mouseenter', (e) => showHover(typeof tipText === 'object' ? tipHtml(tipText) : esc(tipText), e.clientX, e.clientY)); cell.addEventListener('mouseleave', hideHover);
        grid.append(cell);
      });
    });
    const wrap = el('div', { class: 'hmap-wrap', tabindex: '0', role: 'region', 'aria-label': T('Heatmap, scrollable') }, grid);
    clear(container).append(wrap);
    return { el: wrap, update: (cfg) => heatmap(container, Object.assign({ rows, cols, value, fmt: f, colorScale, tip }, cfg)) };
  }

  /* ------------------------------------------------------------------ alerts / feed */
  /* alerts: [{severity:'bad'|'warn'|'good'|'info', title, chip, desc, value, sub, onClick}] */
  function alertList(container, alerts, { emptyText = T('No signals') } = {}) {
    const root = el('div', { class: 'alerts' });
    const order = { bad: 0, warn: 1, info: 2, good: 3 };
    const list = (alerts || []).slice().sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
    if (!list.length) root.append(emptyState(null, emptyText, { icon: 'check' }));
    list.forEach((a) => {
      const item = el('div', { class: 'alert ' + (a.severity || ''), role: a.onClick ? 'button' : null, tabindex: a.onClick ? 0 : null },
        el('span', { class: 'bar' }),
        el('div', { class: 'grow' }, el('div', { class: 'at' }, a.title, a.chip ? badge(a.chip, a.severity) : null), a.desc ? el('div', { class: 'ad', title: a.desc }, a.desc) : null),
        el('div', { class: 'am' }, a.value != null ? a.value : '', a.sub ? el('small', {}, a.sub) : null));
      if (a.onClick) { item.style.cursor = 'pointer'; item.addEventListener('click', () => a.onClick(a)); item.addEventListener('keydown', (e) => { if (e.key === 'Enter') a.onClick(a); }); }
      root.append(item);
    });
    clear(container).append(root);
    return { el: root, update: (al) => alertList(container, al, { emptyText }) };
  }
  const relTime = (ts, now = Date.now()) => { const s = Math.max(0, Math.round((now - +new Date(ts)) / 1000)); if (s < 60) return T('just now'); const m = Math.round(s / 60); if (m < 60) return T('{n} min ago', { n: m }); const h = Math.round(m / 60); if (h < 48) return T('{t} ago', { t: P(h, 'hour|hours') }); return T('{t} ago', { t: P(Math.round(h / 24), 'day|days') }); };
  const FEED_ICON = { trial: '◔', qualified: '✓', charge_ok: '$', charge_fail: '!', refund: '↩', dispute: '⚑', pack: '▣', renewal: '↻' };
  const FEED_KIND = { trial: 'info', qualified: 'accent', charge_ok: 'good', charge_fail: 'bad', refund: 'warn', dispute: 'bad', pack: 'good', renewal: 'good' };
  /* events: [{type, title, flag, plan, amount, desc, ts, kind, isNew}] */
  function feed(container, events, { max = 50, now } = {}) {
    const root = el('div', { class: 'feed', tabindex: '0', role: 'region', 'aria-label': T('Live feed, scrollable') });
    (events || []).slice(0, max).forEach((e) => {
      const kind = e.kind || FEED_KIND[e.type] || '';
      root.append(el('div', { class: 'feed-item ' + kind + (e.isNew ? ' new' : '') },
        el('span', { class: 'ico', 'aria-hidden': 'true' }, e.icon || FEED_ICON[e.type] || '•'),
        el('div', { class: 'grow', style: { minWidth: 0 } }, el('div', { class: 'ft' }, e.flag ? el('span', { class: 'flag' }, e.flag) : null, el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, e.title), e.plan ? el('span', { class: 'plan' }, e.plan) : null), e.desc ? el('div', { class: 'fd', title: e.desc }, e.desc) : null),
        el('div', { class: 'fa' + (kind ? ' ' + kind : '') }, e.amount != null ? (isNum(e.amount) ? fmt('usd2', e.amount) : e.amount) : '', el('small', {}, e.ts ? relTime(e.ts, now) : ''))));
    });
    if (!(events || []).length) root.append(el('div', { class: 'tbl-empty' }, T('No events yet')));
    clear(container).append(root);
    return { el: root, update: (ev, o) => feed(container, ev, Object.assign({ max, now }, o)) };
  }

  /* ------------------------------------------------------------------ toolbar */
  const DEFAULT_PRESETS = [{ id: 'today', label: T('Today') }, { id: 'yesterday', label: T('Yesterday') }, { id: '7d', label: T('7d') }, { id: '14d', label: T('14d') }, { id: '30d', label: T('30d') }, { id: '90d', label: T('90d') }, { id: 'all', label: T('All time') }];
  const STEP_LABELS = { hour: T('Hour'), day: T('Day'), week: T('Week'), month: T('Month') };
  const BASIS = [{ id: 'signup', label: T('by signup') }, { id: 'trial', label: T('by trial') }];
  const MONEY = [{ id: 'gross', label: 'Gross' }, { id: 'net', label: 'Net' }];
  const COMPARE = [{ id: 'prev', label: T('previous period') }, { id: 'none', label: T('none') }];
  const CHANNELS = () => (BB.CHANNELS || [{ id: 'facebook', label: 'Facebook' }, { id: 'google', label: 'Google' }, { id: 'tiktok', label: 'TikTok' }, { id: 'web2web', label: 'Web2Web' }, { id: 'organic', label: 'Organic' }]).map((c) => ({ id: c.id, label: L(c), color: c.color }));
  const DEVICES = [{ id: 'all', label: T('All') }, { id: 'mobile', label: 'Mobile' }, { id: 'desktop', label: 'Desktop' }];
  const PAYER = () => (BB.PAYER_MODES || [{ id: 'any', label: 'Payers: any payment' }, { id: 'sub', label: 'Payers: subscription' }]).map((p) => ({ id: p.id, label: L(p), title: T(p.id === 'any' ? '≥ 1 successful payment > $0 (intro, rebill, renewal, pack)' : '≥ 1 successful rebill / renewal (intro and packs excluded)') }));
  /* saved views: [{name, page, hash}] in localStorage (try/catch everywhere) */
  const VIEWS_KEY = 'bb-views';
  const savedViews = {
    list(page) { let v = []; try { v = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]'); } catch (e) { v = []; } return Array.isArray(v) ? v.filter((x) => x && x.name && (!page || !x.page || x.page === page)) : []; },
    save(name, page, hash) { const v = savedViews.list().filter((x) => !(x.name === name && (x.page || null) === (page || null))); v.push({ name, page: page || null, hash: hash != null ? hash : (location.hash || '').replace(/^#/, ''), ts: Date.now() }); try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } return v; },
    remove(name, page) { const v = savedViews.list().filter((x) => !(x.name === name && (!page || !x.page || x.page === page))); try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } return v; },
    get(name, page) { return savedViews.list(page).find((x) => x.name === name) || null; },
    apply(view) { if (!view) return false; const h = '#' + (view.hash || ''); if (location.hash !== h) location.hash = h; else window.dispatchEvent(new HashChangeEvent('hashchange')); return true; },
  };
  /* toolbar config: see the call sites in the board scripts */
  function toolbar(config, onChange) {
    let cfg = config || {};
    const root = el('div', { class: 'bb-toolbar', role: 'toolbar' });
    const row1 = el('div', { class: 'bb-toolbar-row' }); const row2 = el('div', { class: 'bb-toolbar-row' }); const row3 = el('div', { class: 'bb-toolbar-row' }); const chips = el('div', { class: 'bb-chips' });
    root.append(row1, row2, row3, chips);
    const emit = (patch) => onChange && onChange(patch);
    let refs = {};
    const sep = () => el('span', { class: 'sep', 'aria-hidden': 'true' });

    function render() {
      clear(row1); clear(row2); clear(row3); refs = {};
      /* row 1: presets · dates · step · basis · Gross/Net */
      if (cfg.range !== false && (cfg.presets || cfg.range)) {
        const presets = (cfg.presets || DEFAULT_PRESETS).map(norm);
        const range = Object.assign({ preset: '30d', from: '', to: '' }, cfg.range || {});
        refs.presets = segmented(presets, range.preset, (id) => emit({ range: { preset: id, from: null, to: null } }), { label: T('Period') });
        const from = el('input', { class: 'input date', type: 'date', value: range.from || '', 'aria-label': T('Start date'), max: range.max || null });
        const to = el('input', { class: 'input date', type: 'date', value: range.to || '', 'aria-label': T('End date'), max: range.max || null });
        const custom = () => { if (from.value && to.value) { refs.presets.set('custom'); emit({ range: { preset: 'custom', from: from.value, to: to.value } }); } };
        from.addEventListener('change', custom); to.addEventListener('change', custom);
        row1.append(refs.presets.el, from, el('span', { class: 'caption' }, '—'), to);
      }
      if (cfg.step) {
        const opts = (cfg.step.options || ['day', 'week', 'month']).map((s) => ({ id: s, label: STEP_LABELS[s] || s }));
        refs.step = segmented(opts, cfg.step.value, (v) => emit({ step: v }), { label: T('Step') });
        row1.append(sep(), refs.step.el);
      }
      if (cfg.channel) { // v2: Channel — first-class segmented filter (All / Facebook / Google / TikTok / Web2Web / Organic), patch {channel}
        const opts = [{ id: 'all', label: T('All') }].concat(cfg.channel.options ? cfg.channel.options.map(norm) : CHANNELS());
        refs.channel = segmented(opts, cfg.channel.value || 'all', (v) => emit({ channel: v }), { label: T('Channel'), class: 'channel' }); row2.append(refs.channel.el);
      }
      if (cfg.device) { refs.device = segmented(cfg.device.options ? cfg.device.options.map(norm) : DEVICES, cfg.device.value || 'all', (v) => emit({ device: v }), { label: T('Device') }); row2.append(...(row2.children.length ? [sep()] : []), refs.device.el); }
      if (cfg.basis) { refs.basis = segmented(BASIS, cfg.basis.value || cfg.basis, (v) => emit({ basis: v }), { label: T('Cohort basis') }); row1.append(sep(), refs.basis.el); }
      if (cfg.money) { refs.money = segmented(MONEY, cfg.money.value || cfg.money, (v) => emit({ money: v }), { label: 'Gross / Net' }); row1.append(sep(), refs.money.el); }
      if (cfg.payer) { refs.payer = segmented(PAYER(), cfg.payer.value || 'any', (v) => emit({ payer: v }), { label: T('Payer definition') }); row2.append(...(row2.children.length ? [sep()] : []), refs.payer.el); }
      if (cfg.currency) { // v2: Currency USD / local (label of the local currency when known, e.g. 'MXN')
        const loc = cfg.currency.localLabel || 'Local';
        refs.currency = segmented([{ id: 'usd', label: 'USD' }, { id: 'local', label: loc, title: T('Local currency of the slice (≥ 90% of users), else USD') }], cfg.currency.value || 'usd', (v) => emit({ currency: v }), { label: T('Currency') }); row2.append(...(row2.children.length ? [sep()] : []), refs.currency.el);
      }
      if (cfg.compare) {
        const copts = COMPARE.concat(cfg.compare.channels ? (cfg.compare.channels === true ? CHANNELS() : cfg.compare.channels.map(norm)).map((c) => ({ id: 'channel:' + c.id, label: T('same cohort: {channel}', { channel: c.label }) })) : []);
        refs.compare = select(copts, cfg.compare.value || cfg.compare, (v) => emit({ compare: v }), { prefix: T('Compare with') }); row3.append(refs.compare.el);
      }
      if (cfg.views) { // v2: saved views (name + hash) in localStorage
        const page = cfg.views.page || null, cur = cfg.views.value || '';
        const build = () => [{ id: '', label: cur ? T('View: {name}', { name: cur }) : T('Saved views…') }].concat(savedViews.list(page).map((v) => ({ id: v.name, label: v.name })), [{ id: '__save', label: '＋ ' + T('Save view…') }, { id: '__del', label: '− ' + T('Delete view…') }]);
        refs.views = select(build(), '', (v) => {
          if (v === '__save') { const name = (window.prompt(T('View name'), cur || '') || '').trim(); if (name) { savedViews.save(name, page); toast(T('View saved: {name}', { name }), 'good'); emit({ view: name }); } }
          else if (v === '__del') { const names = savedViews.list(page).map((x) => x.name); const name = (window.prompt(T('Delete view ({names})', { names: names.join(', ') }), cur || names[0] || '') || '').trim(); if (name && names.includes(name)) { savedViews.remove(name, page); toast(T('View deleted: {name}', { name })); if (name === cur) emit({ view: null }); } }
          else if (v) { const vw = savedViews.get(v, page); if (vw) { savedViews.apply(vw); emit({ view: v }); } }
          refs.views.setOptions(build(), '');
        }, { prefix: T('View') });
        refs.views.el.classList.add('views'); row3.append(refs.views.el);
      }
      /* row 3: compare · view · group-by · metric · extra · (spacer) · filters · columns · csv */
      if (cfg.groupBy) {
        const dims = [{ id: '', label: T('none') }].concat((cfg.groupBy.dims || []).map(norm));
        refs.groupBy = select(dims, cfg.groupBy.value || '', (v) => emit({ groupBy: v || null }), { prefix: T('Group by') });
        row3.append(refs.groupBy.el);
      }
      if (cfg.metric) { refs.metric = select(cfg.metric.options || [], cfg.metric.value, (v) => emit({ metric: v }), { prefix: T('Metric') }); row3.append(refs.metric.el); }
      (cfg.extra || []).forEach((x) => {
        if (x.type === 'toggle') { const t = toggle(x.label, !!x.value, (v) => emit({ [x.id]: v })); refs[x.id] = t; row3.append(t.el); }
        else if (x.type === 'number') { const inp = el('input', { class: 'input num', type: 'number', inputmode: 'decimal', value: x.value ?? '', min: x.min ?? null, max: x.max ?? null, step: x.step ?? null, 'aria-label': x.label }); inp.addEventListener('change', () => emit({ [x.id]: inp.value === '' ? null : Number(inp.value) })); row3.append(el('label', { class: 'inline' }, x.label), inp); refs[x.id] = { el: inp, set: (v) => (inp.value = v) }; }
        else if (x.type === 'segmented') { const s = segmented(x.options || [], x.value, (v) => emit({ [x.id]: v }), { label: x.label }); refs[x.id] = s; row3.append(x.label ? el('label', { class: 'inline' }, x.label) : null, s.el); }
        else { const s = select(x.options || [], x.value, (v) => emit({ [x.id]: v }), { prefix: x.label }); refs[x.id] = s; row3.append(s.el); }
      });
      row3.append(el('span', { class: 'spacer' }));
      if (cfg.filters) {
        const active = countFilters(cfg.filters.value);
        const b = el('button', { class: 'btn' + (active ? ' active' : ''), type: 'button', 'aria-haspopup': 'dialog' }, icon('filter'), T('Filters'), active ? el('span', { class: 'count' }, active) : null);
        b.addEventListener('click', () => openFilters(b)); refs.filtersBtn = b; row3.append(b);
      }
      if (cfg.offsets) {
        const b = el('button', { class: 'btn', type: 'button', 'aria-haspopup': 'dialog' }, icon('cols'), cfg.offsets.label || T('Metrics'));
        b.addEventListener('click', () => columnPicker(b, { all: cfg.offsets.all || [], value: cfg.offsets.value || [], default: cfg.offsets.default, presets: cfg.offsets.presets, title: cfg.offsets.title || T('Offset columns'), caption: T('D-days') }, (v) => emit({ offsets: v }))); row3.append(b);
      }
      if (cfg.columns) { // v2: generic column picker with presets, patch {columns:[ids]}
        const b = el('button', { class: 'btn', type: 'button', 'aria-haspopup': 'dialog' }, icon('cols'), cfg.columns.label || T('Columns'));
        b.addEventListener('click', () => columnPicker(b, { all: cfg.columns.all || [], value: cfg.columns.value || [], default: cfg.columns.default, presets: cfg.columns.presets, title: cfg.columns.title || T('Columns'), caption: cfg.columns.caption || '' }, (v) => emit({ columns: v }))); row3.append(b);
      }
      if (cfg.csv) row3.append(el('button', { class: 'btn', type: 'button', title: T('Export CSV (as shown)'), onClick: () => cfg.csv() }, icon('csv'), 'CSV'));
      [row1, row2, row3].forEach((r) => { const real = [...r.children].filter((x) => !x.classList.contains('spacer') && !x.classList.contains('sep')); r.classList.toggle('hidden', !real.length); });
      renderChips();
    }
    const countFilters = (v) => Object.values(v || {}).reduce((n, arr) => n + (arr && arr.length ? 1 : 0), 0);
    function renderChips() {
      clear(chips); if (!cfg.filters) return;
      const val = cfg.filters.value || {}; const dims = cfg.filters.dims || [];
      let any = false;
      for (const d of dims) {
        const arr = val[d.id]; if (!arr || !arr.length) continue; any = true;
        const labels = arr.map((v) => { const o = (d.values || []).find((x) => String(x.v) === String(v)); return o ? o.label ?? o.v : v; });
        chips.append(chip({ k: d.label, v: labels.length > 3 ? labels.slice(0, 3).join(', ') + ` +${labels.length - 3}` : labels.join(', '), onRemove: () => { const nv = Object.assign({}, val); delete nv[d.id]; emit({ filters: nv }); } }));
      }
      if (any) chips.append(el('button', { class: 'chip clear', type: 'button', onClick: () => emit({ filters: {} }) }, T('Clear all')));
    }
    function openFilters(anchor) {
      popover(anchor, (api) => {
        const dims = cfg.filters.dims || []; const val = JSON.parse(JSON.stringify(cfg.filters.value || {}));
        const openDims = new Set(Object.keys(val).filter((k) => val[k] && val[k].length));
        const body = el('div', { class: 'pbody' });
        const q = el('input', { class: 'input search', type: 'search', placeholder: T('Find dimension or value…'), 'aria-label': T('Find dimension or value…') });
        q.addEventListener('input', paint);
        function paint() {
          clear(body); const s = q.value.trim().toLowerCase();
          dims.forEach((d) => {
            const matchDim = !s || d.label.toLowerCase().includes(s);
            const matchVals = s ? (d.values || []).filter((x) => String(x.label ?? x.v).toLowerCase().includes(s)) : null;
            if (!matchDim && !(matchVals && matchVals.length)) return;
            const n = (val[d.id] || []).length; const open = openDims.has(d.id) || (!!s && matchVals && matchVals.length && !matchDim);
            const head = el('button', { class: 'opt dimhead', type: 'button', 'aria-expanded': String(!!open) }, icon('chev', 'chev'), el('span', { class: 'lab' }, d.label), n ? el('span', { class: 'cnt' }, T('{n} selected', { n })) : el('span', { class: 'cnt' }, (d.values || []).length));
            head.addEventListener('click', () => { if (openDims.has(d.id)) openDims.delete(d.id); else openDims.add(d.id); paint(); });
            body.append(head);
            if (open) {
              const ms = multiSelect({ options: s && !matchDim ? matchVals : d.values || [], value: val[d.id] || [], search: (d.values || []).length > 8 && !s, maxHeight: 200, footer: false, onChange: (v) => { if (v.length) val[d.id] = v; else delete val[d.id]; } });
              ms.el.classList.add('ms-indent'); body.append(ms.el);
            }
          });
          if (!body.children.length) body.append(el('div', { class: 'empty' }, T('Nothing found')));
        }
        paint();
        const foot = el('div', { class: 'pfoot' },
          el('button', { class: 'btn ghost sm', type: 'button', onClick: () => { emit({ filters: {} }); api.close(); } }, T('Reset')),
          el('button', { class: 'btn primary sm', type: 'button', onClick: () => { emit({ filters: val }); api.close(); } }, T('Apply')));
        return [el('div', { class: 'ph' }, T('Filters'), el('span', { class: 'caption' }, T('multi-select, respects other filters'))), el('div', { class: 'srch' }, q), body, foot];
      }, { width: 340, align: 'right' });
    }
    render();
    return { el: root, update(patch) { cfg = Object.assign({}, cfg, patch); render(); }, get config() { return cfg; }, refs: () => refs };
  }


  /* column picker popover (offsets or any column ids) with presets. spec = {all:[id|{id,label}], value:[ids], default:[ids], presets:[{id,label,value:[ids]}], title, caption}; onChange(ids) on Apply (ids in `all` order) */
  function columnPicker(anchor, spec, onChange) {
    return popover(anchor, (api) => {
      const all = (spec.all || []).map((o) => (typeof o === 'number' ? { id: o, label: 'D' + o } : norm(o))); const cur = new Set((spec.value || []).map(String));
      const body = el('div', { class: 'cols' });
      const paint = () => { clear(body); all.forEach((o) => { const on = cur.has(String(o.id)); const b = el('button', { class: 'opt', type: 'button', role: 'checkbox', 'aria-checked': String(on) }, el('span', { class: 'cb' }), el('span', { class: 'lab', title: o.label }, o.label)); b.addEventListener('click', () => { if (on) cur.delete(String(o.id)); else cur.add(String(o.id)); paint(); paintPresets(); }); body.append(b); }); };
      const presetsEl = el('div', { class: 'presets' });
      const paintPresets = () => { clear(presetsEl); (spec.presets || []).forEach((p) => { const ids = (p.value || p.metrics || p.offsets || []).map(String); const active = ids.length === cur.size && ids.every((x) => cur.has(x)); presetsEl.append(el('button', { class: 'chip' + (active ? ' accent' : ''), type: 'button', title: ids.join(', '), onClick: () => { cur.clear(); ids.forEach((x) => cur.add(x)); paint(); paintPresets(); } }, L(p) || p.id)); }); };
      paint(); paintPresets();
      return [el('div', { class: 'ph' }, spec.title || T('Columns'), el('span', { class: 'caption' }, spec.caption || '')), (spec.presets && spec.presets.length) ? presetsEl : null, body,
        el('div', { class: 'pfoot' }, el('button', { class: 'btn ghost sm', type: 'button', onClick: () => { cur.clear(); (spec.default || all.map((o) => o.id)).forEach((o) => cur.add(String(o))); paint(); paintPresets(); } }, T('Default')),
          el('button', { class: 'btn primary sm', type: 'button', onClick: () => { onChange && onChange(all.filter((o) => cur.has(String(o.id))).map((o) => o.id)); api.close(); } }, T('Apply')))];
    }, { width: 260, align: 'right' });
  }
  /* "Columns" button for a table: toggles `hidden` on its columns in place. {presets:[{id,label,value:[keys]}], label, exclude:[keys], default:[keys]} */
  function tableColumnsButton(tbl, opts = {}) {
    const b = el('button', { class: 'btn sm', type: 'button', 'aria-haspopup': 'dialog' }, icon('cols'), opts.label || T('Columns'));
    b.addEventListener('click', () => {
      const cols = tbl.state.columns.filter((c) => !(opts.exclude || []).includes(c.key) && !c.sticky && !c.alwaysVisible);
      columnPicker(b, { all: cols.map((c) => ({ id: c.key, label: typeof c.label === 'string' ? c.label : c.key })), value: cols.filter((c) => !c.hidden).map((c) => c.key), default: opts.default || cols.map((c) => c.key), presets: opts.presets, title: opts.title || T('Table columns') },
        (keys) => { const set = new Set(keys.map(String)); cols.forEach((c) => { c.hidden = !set.has(String(c.key)); }); tbl.render(); opts.onChange && opts.onChange(keys); });
    });
    return b;
  }
  /* empty state: replaces the container's content with a muted centred message (default: thin slice). Returns the element. */
  function emptyState(container, text, opts = {}) {
    const n = el('div', { class: 'empty-state' + (opts.cls ? ' ' + opts.cls : ''), role: 'status' }, el('div', { class: 'es-t' }, icon(opts.icon || 'info', 'es-i'), text || T('Not enough data')), opts.sub ? el('div', { class: 'caption' }, opts.sub) : null);
    if (container) clear(container).append(n);
    return n;
  }
  const isThin = (n) => isNum(n) && n < (BB.MIN_USERS || 30);
  /* formula hover for a metric key (BB.METRICS): → tipObj | null */
  const metricTip = (key, extra = {}) => { const m = BB.METRIC_BY_KEY && BB.METRIC_BY_KEY[key]; return m ? Object.assign({ title: L(m), formula: L(m, 'formula') }, extra) : null; };

  /* ------------------------------------------------------------------ flow graph (SVG funnel map) */
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') n.setAttribute('class', v); else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v); else n.setAttribute(k, v); } append(n, kids); return n; };
  const FLOW = { W: 170, H: 64, GAPX: 56, GAPY: 10, LOSSGAP: 28, HEAD: 30, LANEGAP: 36, PAD: 16, MINW: 140, MINH: 53 };
  /* graph = {stages:[{id,label}], nodes:[{id,stage,label,variantTag,users,pctOfStage,pctOfEntry,ltv (or ltv_gross/ltv_net),arpu,roas,trend,loss}], edges:[{from,to,users,rate,medianHours,revDownstream}],
              lanes?:[{key,label,nodes,edges}] or [{key,label,graph:{nodes,edges}}] (BB.flow output accepted as is)} */
  function flowGraph(container, graph, opts = {}) {
    const o = Object.assign({ height: 540, nodeTip: null, edgeTip: null, onNode: null, onEdge: null, baseNode: null, money: 'gross', fitOnUpdate: true, zoomMount: null }, opts);
    const ltvOf = (n) => (isNum(n.ltv) ? n.ltv : o.money === 'net' ? n.ltv_net : n.ltv_gross);
    const collapsed = new Set();
    const withStages = (gr) => (gr && !gr.stages && BB.FLOW_STAGES ? Object.assign({}, gr, { stages: BB.FLOW_STAGES }) : gr);
    let g = withStages(graph), layout = null, view = { x: 0, y: 0, w: 1000, h: 600 }, first = true;
    const root = el('div', { class: 'flow' , style: { height: (typeof o.height === 'number' ? o.height + 'px' : o.height) } });
    const svgEl = sv('svg', { class: 'flow-svg', role: 'img', 'aria-label': T('Funnel map') });
    const defs = sv('defs'); const gEdges = sv('g', { class: 'edges' }); const gNodes = sv('g', { class: 'nodes' }); const gHead = sv('g', { class: 'heads' }); const gLanes = sv('g', { class: 'lanes' });
    svgEl.append(defs, gLanes, gEdges, gNodes, gHead);
    const ctl = el('div', { class: 'flow-ctl' },
      el('button', { class: 'btn icon sm', type: 'button', title: T('Zoom in'), onClick: () => zoomBy(1.25) }, icon('plus')),
      el('button', { class: 'btn icon sm', type: 'button', title: T('Zoom out'), onClick: () => zoomBy(0.8) }, icon('minus')),
      el('button', { class: 'btn sm', type: 'button', title: T('Fit to view'), onClick: () => fit(true) }, icon('fit'), T('Fit')));
    const hint = el('div', { class: 'flow-hint caption' }, T('Wheel: zoom · drag: pan · click a column head: collapse'));
    root.append(svgEl);
    /* zoom controls: in the page's mount (card header) when given, else bottom-right inside the canvas (never over the stage heads) */
    if (o.zoomMount && isNode(o.zoomMount)) { ctl.classList.add('inline'); o.zoomMount.append(ctl); } else root.append(ctl);
    clear(container).append(root, hint);

    const stageColor = (i) => ordinal(i, (g && g.stages || []).length || 10); // stages are ordered → one-hue ramp, never a cycled categorical palette
    const num = (v) => (isNum(v) ? localFmt.int(v) : '—');
    /* word-wrap an SVG label into ≤ maxLines lines of `width` user units (title font 11px ≈ 6 px/char), ellipsis on the last one */
    const TF = '600 12px ' + (cssVar('--font') || 'Inter, sans-serif'); // single-line titles render at 12px, two-line ones at 11px: measure at 12 (safe)
    const wrapLabel = (label, width, maxLines) => {
      const words = label.split(/\s+/).filter(Boolean), lines = []; let cur = '';
      const fits = (txt) => textW(txt, TF) <= width;
      const cut = (txt) => { let t = txt; while (t.length > 1 && !fits(t + '…')) t = t.slice(0, -1); return t.replace(/[\s·,.-]+$/, '') + '…'; };
      for (const w of words) {
        const next = cur ? cur + ' ' + w : w;
        if (fits(next)) { cur = next; continue; }
        if (lines.length === maxLines - 1) return lines.concat(cut(next));   // last line: ellipsis
        if (cur) lines.push(cur); cur = w;
        if (lines.length === maxLines - 1 && !fits(w)) return lines.concat(cut(w));
      }
      if (cur) lines.push(cur);
      return lines;
    };

    function buildLane(nodes, edges) {
      /* collapse stages */
      const stages = g.stages || [];
      const stageIdx = Object.fromEntries(stages.map((s, i) => [s.id, i]));
      let ns = nodes.slice(), es = edges.slice();
      for (const sid of collapsed) {
        const inStage = ns.filter((n) => n.stage === sid); if (!inStage.length) continue;
        const ids = new Set(inStage.map((n) => n.id)); const agg = { id: '__col_' + sid, stage: sid, label: (stages.find((s) => s.id === sid) || {}).label || sid, users: inStage.filter((n) => !n.loss).reduce((a, n) => a + (n.users || 0), 0), collapsed: true, count: inStage.length, ltv: null, pctOfStage: 1 };
        agg.pctOfEntry = inStage.filter((n) => !n.loss).reduce((a, n) => a + (n.pctOfEntry || 0), 0) || null;
        ns = ns.filter((n) => !ids.has(n.id)); ns.push(agg);
        const map = new Map();
        es.forEach((e) => { const f = ids.has(e.from) ? agg.id : e.from, t = ids.has(e.to) ? agg.id : e.to; if (f === t) return; const k = f + '→' + t; const cur = map.get(k) || { from: f, to: t, users: 0, _rateNum: 0, _rateDen: 0, revDownstream: 0, medianHours: e.medianHours }; cur.users += e.users || 0; cur.revDownstream += e.revDownstream || 0; if (isNum(e.rate) && isNum(e.users)) { cur._rateNum += e.users; cur._rateDen += e.users / Math.max(e.rate, 1e-9); } map.set(k, cur); });
        es = [...map.values()].map((e) => { e.rate = e._rateDen ? Math.min(1, e._rateNum / e._rateDen) : null; return e; });
      }
      /* positions */
      const byStage = stages.map(() => ({ main: [], loss: [] }));
      ns.forEach((n) => { const i = stageIdx[n.stage]; if (i == null) return; (n.loss ? byStage[i].loss : byStage[i].main).push(n); });
      byStage.forEach((b) => { b.main.sort((a, c) => (c.users || 0) - (a.users || 0)); b.loss.sort((a, c) => (c.users || 0) - (a.users || 0)); });
      const colH = byStage.map((b) => b.main.length * (FLOW.H + FLOW.GAPY) + (b.loss.length ? FLOW.LOSSGAP + b.loss.length * (FLOW.H + FLOW.GAPY) : 0));
      const laneH = Math.max(...colH, FLOW.H);
      const pos = new Map();
      byStage.forEach((b, i) => {
        const x = FLOW.PAD + i * (FLOW.W + FLOW.GAPX); let y = FLOW.HEAD + 8;
        b.main.forEach((n) => { pos.set(n.id, { x, y, n }); y += FLOW.H + FLOW.GAPY; });
        if (b.loss.length) { y = FLOW.HEAD + 8 + laneH - b.loss.length * (FLOW.H + FLOW.GAPY) + FLOW.GAPY; b.loss.forEach((n) => { pos.set(n.id, { x, y, n }); y += FLOW.H + FLOW.GAPY; }); }
      });
      return { nodes: ns, edges: es.filter((e) => pos.has(e.from) && pos.has(e.to)), pos, height: FLOW.HEAD + 8 + laneH, stageIdx };
    }
    function doLayout() {
      const lanes = g.lanes && g.lanes.length ? g.lanes : [{ key: null, label: null, nodes: g.nodes || [], edges: g.edges || [] }];
      let yOff = 0; const out = [];
      lanes.forEach((l) => { const src = l.graph || l; /* {key,label,graph:{nodes,edges}} (BB.flow) or {nodes,edges} */ const L = buildLane(src.nodes || [], src.edges || []); L.lane = l; L.yOff = yOff; yOff += L.height + (lanes.length > 1 ? FLOW.LANEGAP : 0); out.push(L); });
      layout = { lanes: out, width: FLOW.PAD * 2 + (g.stages || []).length * (FLOW.W + FLOW.GAPX) - FLOW.GAPX, height: Math.max(yOff, 100), maxUsers: Math.max(1, ...out.flatMap((L) => L.edges.map((e) => e.users || 0))) };
    }
        const edgePath = (a, b) => {
      const x1 = a.x + FLOW.W, y1 = a.y + FLOW.H / 2, x2 = b.x, y2 = b.y + FLOW.H / 2; const dx = Math.max(40, (x2 - x1) / 2);
      const P = [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]];
      const at = (t) => { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; };
      return { d: `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, at };
    };
    function draw() {
      clear(gEdges); clear(gNodes); clear(gHead); clear(gLanes);
      const stages = g.stages || [];
      layout.lanes.forEach((L, li) => {
        const Y = L.yOff;
        if (L.lane.label) gLanes.append(sv('text', { x: FLOW.PAD, y: Y + 12, class: 'lane-label' }, L.lane.label), sv('line', { x1: FLOW.PAD, x2: layout.width - FLOW.PAD, y1: Y + 18, y2: Y + 18, class: 'lane-line' }));
        /* column heads (first lane only, sticky-ish: drawn per lane top) */
        stages.forEach((s, i) => {
          const x = FLOW.PAD + i * (FLOW.W + FLOW.GAPX); const total = L.nodes.filter((n) => n.stage === s.id && !n.loss).reduce((a, n) => a + (n.users || 0), 0);
          const hg = sv('g', { class: 'col-head' + (collapsed.has(s.id) ? ' collapsed' : ''), transform: `translate(${x},${Y + (L.lane.label ? 22 : 0)})`, role: 'button', tabindex: 0, 'aria-label': T('Column {name}: {action}', { name: s.label, action: T(collapsed.has(s.id) ? 'expand' : 'collapse') }) });
          hg.append(sv('rect', { x: 0, y: 0, width: FLOW.W, height: 22, rx: 4, class: 'col-head-bg' }), sv('circle', { cx: 10, cy: 11, r: 3, fill: stageColor(i) }), sv('text', { x: 19, y: 15, class: 'col-title' }, s.label), sv('text', { x: FLOW.W - 8, y: 15, class: 'col-total mono', 'text-anchor': 'end' }, num(total)));
          const tog = () => { if (collapsed.has(s.id)) collapsed.delete(s.id); else collapsed.add(s.id); relayout(false); };
          hg.addEventListener('click', tog); hg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
          gHead.append(hg);
        });
        const laneTop = Y + (L.lane.label ? 22 : 0);
        /* edges — rate chips are spread along the curve so fan-in / fan-out chips do not stack; a 100 % pass-through edge
           (single outgoing edge of its node) gets a quiet chip shown only on hover / highlight */
        const outDeg = new Map(), inList = new Map(), outList = new Map();
        L.edges.forEach((e) => { outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1); (inList.get(e.to) || inList.set(e.to, []).get(e.to)).push(e); (outList.get(e.from) || outList.set(e.from, []).get(e.from)).push(e); });
        const sortY = (arr) => arr.slice().sort((p, q) => ((L.pos.get(p.from) || {}).y || 0) - ((L.pos.get(q.from) || {}).y || 0) || ((L.pos.get(p.to) || {}).y || 0) - ((L.pos.get(q.to) || {}).y || 0));
        const chipT = (e) => {
          const fanIn = inList.get(e.to) || [], fanOut = outList.get(e.from) || [];
          if (fanIn.length <= 3 && fanOut.length <= 3) return 0.5; // ≤ 3 edges: the row offset of the pills keeps mid-edge chips apart
          if (fanIn.length >= fanOut.length) { const arr = sortY(fanIn), i = arr.indexOf(e); return 0.18 + 0.3 * (i / (arr.length - 1)); } // converging edges: chip near the sources
          const arr = sortY(fanOut), i = arr.indexOf(e); return 0.52 + 0.3 * (i / (arr.length - 1)); // fan-out: chip near the targets
        };
        L.edges.forEach((e) => {
          const a = L.pos.get(e.from), b = L.pos.get(e.to); if (!a || !b) return;
          const { d, at } = edgePath({ x: a.x, y: a.y + laneTop }, { x: b.x, y: b.y + laneTop });
          const [mx, my] = at(chipT(e));
          const quiet = isNum(e.rate) && e.rate >= 0.995 && (outDeg.get(e.from) || 0) <= 1;
          const w = 1.5 + 16 * Math.sqrt((e.users || 0) / layout.maxUsers);
          const si = L.stageIdx[a.n.stage]; const loss = b.n.loss;
          const col = loss ? cssVar('--fg-4') || '#62666d' : stageColor(si);
          const ge = sv('g', { class: 'edge' + (loss ? ' loss' : '') + (quiet ? ' quiet' : ''), tabindex: 0, role: o.onEdge ? 'button' : null });
          ge.append(sv('path', { d, class: 'edge-hit', 'stroke-width': Math.max(w, 12) }), sv('path', { d, class: 'edge-line', stroke: col, 'stroke-width': w.toFixed(2) }));
          if (isNum(e.rate)) {
            const label = localFmt.pct(e.rate); const lw = label.length * 6.6 + 12;
            ge.append(sv('rect', { x: mx - lw / 2, y: my - 9, width: lw, height: 18, rx: 9, class: 'edge-chip' }), sv('text', { x: mx, y: my + 3.5, 'text-anchor': 'middle', class: 'edge-chip-txt mono' }, label));
          }
          const tip = () => o.edgeTip ? o.edgeTip(e, a.n, b.n) : tipHtml({ title: `${a.n.label} → ${b.n.label}`, kv: [[T('Conversion'), isNum(e.rate) ? localFmt.pct(e.rate) : '—'], [T('Users'), num(e.users)], [T('Median time'), isNum(e.medianHours) ? (e.medianHours < 48 ? T('{n} h', { n: e.medianHours.toFixed(1) }) : T('{n} d', { n: (e.medianHours / 24).toFixed(1) })) : '—'], [T('Downstream revenue'), isNum(e.revDownstream) ? localFmt.usd(e.revDownstream) : '—']] });
          ge.addEventListener('mouseenter', (ev) => { ge.classList.add('hover'); showHover(tip(), ev.clientX, ev.clientY); }); ge.addEventListener('mouseleave', () => { ge.classList.remove('hover'); hideHover(); });
          if (o.onEdge) { ge.addEventListener('click', (ev) => { ev.stopPropagation(); o.onEdge(e, a.n, b.n); }); ge.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') o.onEdge(e, a.n, b.n); }); }
          gEdges.append(ge);
        });
        /* nodes */
        L.pos.forEach(({ x, y, n }) => {
          const si = L.stageIdx[n.stage]; const color = stageColor(si);
          const isBase = o.baseNode && n.id === o.baseNode;
          const gn = sv('g', { class: 'node' + (n.loss ? ' loss' : '') + (isBase ? ' base' : '') + (n.collapsed ? ' collapsed' : ''), transform: `translate(${x},${y + laneTop})`, tabindex: 0, role: o.onNode ? 'button' : null, 'data-id': n.id });
          gn.style.setProperty('--nc', color);
          gn.append(sv('rect', { x: 0, y: 0, width: FLOW.W, height: FLOW.H, rx: 8, class: 'node-bg' }), sv('rect', { x: 0, y: 8, width: 3, height: FLOW.H - 16, rx: 1.5, fill: n.loss ? 'var(--fg-4)' : color, class: 'node-bar' }));
          /* top-right corner, right to left: variant tag · "base" chip · trend; the title wraps to ≤ 2 lines in the space left */
          let right = FLOW.W - 8; const hasTrend = isNum(n.trend) && n.trend !== 0;
          if (n.variantTag) { gn.append(sv('rect', { x: right - 18, y: 6, width: 18, height: 15, rx: 4, class: 'node-tag-bg' }), sv('text', { x: right - 9, y: 17, 'text-anchor': 'middle', class: 'node-tag' }, n.variantTag)); right -= 22; }
          if (isBase) { gn.append(sv('rect', { x: right - 34, y: 6, width: 34, height: 14, rx: 7, class: 'node-base-bg' }), sv('text', { x: right - 17, y: 16.5, 'text-anchor': 'middle', class: 'node-base' }, T('base'))); right -= 38; }
          if (hasTrend) gn.append(sv('text', { x: FLOW.W - 8, y: FLOW.H - 23, 'text-anchor': 'end', class: 'node-trend mono ' + (n.trend > 0 ? 'good' : 'bad') }, (n.trend > 0 ? '▲' : '▼') + localFmt.pct(Math.abs(n.trend))));
          const lines = wrapLabel(String(n.label), right - 11, 2);
          const t = sv('text', { x: 11, y: lines.length > 1 ? 15 : 18, class: 'node-title' + (lines.length > 1 ? ' two' : '') });
          lines.forEach((ln, i) => t.append(sv('tspan', { x: 11, dy: i ? 12 : 0 }, ln))); gn.append(t);
          if (lines.join(' ') !== String(n.label)) t.append(sv('title', {}, n.label));
          const l2 = num(n.users) + (isNum(n.pctOfStage) ? '  ·  ' + localFmt.pct(n.pctOfStage) : '');
          gn.append(sv('text', { x: 11, y: FLOW.H - 23, class: 'node-num mono' }, n.collapsed ? `${num(n.users)}  ·  ${P(n.count, 'node|nodes')}` : l2));
          const ltv = ltvOf(n);
          /* third line: the page may hand a ready string (n.pillSub, e.g. "pLTV $6.40 · pROAS 0.84x") and flag it as a forecast (n.pillPredicted → italic); default = LTV to date · ROAS / % of entry */
          const l3 = n.collapsed ? T('collapsed — click the head') : typeof n.pillSub === 'string' ? n.pillSub : [isNum(ltv) ? 'LTV ' + localFmt.usd2(ltv) : null, isNum(n.roas) ? 'ROAS ' + localFmt.x(n.roas) : isNum(n.pctOfEntry) ? T('{pct} of entry', { pct: localFmt.pct(n.pctOfEntry) }) : null].filter(Boolean).join('  ·  ');
          gn.append(sv('text', { x: 11, y: FLOW.H - 9, class: 'node-sub mono' + (!n.collapsed && n.pillPredicted ? ' predicted' : '') }, l3));
          const tip = () => o.nodeTip ? o.nodeTip(n) : tipHtml({ title: n.label, kv: [[T('Users'), num(n.users)], [T('% of column'), isNum(n.pctOfStage) ? localFmt.pct(n.pctOfStage) : '—'], [T('% of entry'), isNum(n.pctOfEntry) ? localFmt.pct(n.pctOfEntry) : '—'], ['LTV', isNum(ltv) ? localFmt.usd2(ltv) : '—'], ['ARPU', isNum(n.arpu) ? localFmt.usd2(n.arpu) : '—'], ['ROAS', isNum(n.roas) ? localFmt.x(n.roas) : '—']], note: o.onNode ? T('Click: details / set as base') : null });
          gn.addEventListener('mouseenter', (ev) => { highlight(n.id, true); showHover(tip(), ev.clientX, ev.clientY); }); gn.addEventListener('mouseleave', () => { highlight(n.id, false); hideHover(); });
          if (o.onNode) { gn.addEventListener('click', (ev) => { ev.stopPropagation(); if (n.collapsed) return; o.onNode(n); }); gn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') o.onNode(n); }); }
          gNodes.append(gn);
        });
      });
      if (first) requestAnimationFrame(() => gNodes.classList.add('ready'));
    }
    function highlight(id, on) {
      gEdges.querySelectorAll('.edge').forEach((e) => e.classList.remove('dim', 'lit'));
      if (!on) return;
      const idx = [];
      layout.lanes.forEach((L) => L.edges.forEach((e) => { idx.push(e.from === id || e.to === id); }));
      gEdges.querySelectorAll('.edge').forEach((e, i) => e.classList.add(idx[i] ? 'lit' : 'dim'));
    }
    /* viewport */
    const applyView = () => svgEl.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    /* Fit the whole map into the canvas, but never shrink pills below FLOW.MINW×MINH on screen: when the canvas is too narrow for
       all columns at that size the view is left-anchored and the rest is reached by pan / wheel (same on phones). */
    function fit(animate) {
      const cw = root.clientWidth || 800, ch = root.clientHeight || 500; const ar = cw / ch;
      let w = layout.width + FLOW.PAD, h = layout.height + FLOW.PAD;
      if (w / h > ar) h = w / ar; else w = h * ar;
      const maxW = cw * FLOW.W / FLOW.MINW, maxH = ch * FLOW.H / FLOW.MINH; // view size at which a pill is exactly MINW×MINH px
      let panned = false;
      if (w > maxW || h > maxH) { panned = true; w = Math.min(maxW, maxH * ar); h = w / ar; }
      view = { x: panned ? -FLOW.PAD / 2 : -(w - layout.width) / 2, y: panned ? -FLOW.PAD / 2 : -(h - layout.height) / 2 - 4, w, h };
      root.classList.toggle('panned', panned);
      svgEl.classList.toggle('anim', !!animate); applyView(); if (animate) setTimeout(() => svgEl.classList.remove('anim'), 260);
    }
    function zoomBy(f, cx, cy) {
      const r = svgEl.getBoundingClientRect(); const px = cx == null ? 0.5 : (cx - r.left) / r.width, py = cy == null ? 0.5 : (cy - r.top) / r.height;
      const nw = clamp(view.w / f, 300, 8000), nh = view.h * (nw / view.w);
      view.x += (view.w - nw) * px; view.y += (view.h - nh) * py; view.w = nw; view.h = nh; applyView();
    }
    svgEl.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
    /* pan: pointer capture only once the pointer has moved > 4 px, so plain clicks reach nodes / edges / column heads;
       a click that ends a real drag is swallowed. */
    let drag = null, justDragged = false;
    svgEl.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId, active: false }; });
    svgEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.active) { if (Math.hypot(dx, dy) <= 4) return; drag.active = true; svgEl.classList.add('dragging'); try { svgEl.setPointerCapture(drag.id); } catch (err) { /* no capture */ } }
      const r = svgEl.getBoundingClientRect(); const k = view.w / r.width; view.x = drag.vx - dx * k; view.y = drag.vy - dy * k; applyView();
    });
    const endDrag = () => { if (drag && drag.active) { svgEl.classList.remove('dragging'); try { svgEl.releasePointerCapture(drag.id); } catch (err) { /* ignore */ } justDragged = true; setTimeout(() => { justDragged = false; }, 0); } drag = null; };
    svgEl.addEventListener('pointerup', endDrag); svgEl.addEventListener('pointercancel', endDrag);
    svgEl.addEventListener('click', (e) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
    /* pinch */
    let pinch = null;
    svgEl.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    svgEl.addEventListener('touchmove', (e) => { if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); zoomBy(d / pinch, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2); pinch = d; } }, { passive: true });
    svgEl.addEventListener('touchend', () => { pinch = null; });
    function relayout(refit) { const t0 = performance.now(); doLayout(); draw(); if (refit || first) fit(!first); first = false; root.dataset.renderMs = (performance.now() - t0).toFixed(1); }
    relayout(true);
    let ro = null; if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (!drag) fit(false); }); ro.observe(root); }
    return {
      el: root, svg: svgEl, fit: () => fit(true), zoom: zoomBy,
      update(graph2, opts2) { if (opts2) Object.assign(o, opts2); if (graph2) g = withStages(graph2); gNodes.classList.add('ready'); relayout(o.fitOnUpdate); },
      setBase(id) { o.baseNode = id; draw(); },
      collapse(stageId, on) { if (on === false) collapsed.delete(stageId); else collapsed.add(stageId); relayout(false); },
      get layout() { return layout; }, get renderMs() { return Number(root.dataset.renderMs); }, destroy() { ro && ro.disconnect(); root.remove(); hint.remove(); if (o.zoomMount) ctl.remove(); },
    };
  }

  /* ------------------------------------------------------------------ side panel (right drawer) */
  let openPanel = null;
  function sidePanel({ title, caption, body, onClose, width } = {}) {
    if (openPanel) openPanel.close();
    const bodyEl = el('div', { class: 'panel-body' });
    if (typeof body === 'function') body(bodyEl); else if (isNode(body)) bodyEl.append(body); else if (typeof body === 'string') bodyEl.innerHTML = body;
    const titleEl = el('h2', { class: 'card-title' }, el('span', { class: 'ttl' }, title || ''), caption ? el('span', { class: 'caption' }, caption) : null);
    const panel = el('aside', { class: 'panel', role: 'dialog', 'aria-label': title || T('Details') },
      el('div', { class: 'panel-head' }, titleEl, el('button', { class: 'btn icon ghost', type: 'button', 'aria-label': T('Close'), onClick: () => api.close() }, icon('x'))), bodyEl);
    if (width) panel.style.width = width + 'px';
    const backdrop = el('div', { class: 'panel-backdrop', onClick: () => api.close() });
    document.body.append(backdrop, panel);
    requestAnimationFrame(() => { panel.classList.add('open'); backdrop.classList.add('open'); });
    const onKey = (e) => { if (e.key === 'Escape') api.close(); };
    document.addEventListener('keydown', onKey);
    const api = {
      el: panel, body: bodyEl,
      setTitle(t, c) { titleEl.firstChild.textContent = t; if (c != null) { let s = titleEl.querySelector('.caption'); if (!s) { s = el('span', { class: 'caption' }); titleEl.append(s); } s.textContent = c; } },
      setBody(b) { clear(bodyEl); if (typeof b === 'function') b(bodyEl); else if (isNode(b)) bodyEl.append(b); else bodyEl.innerHTML = b; },
      close() { if (!panel.isConnected) return; panel.classList.remove('open'); backdrop.classList.remove('open'); document.removeEventListener('keydown', onKey); setTimeout(() => { panel.remove(); backdrop.remove(); }, 200); if (openPanel === api) openPanel = null; onClose && onClose(); },
    };
    openPanel = api;
    const f = panel.querySelector('.btn'); f && f.focus({ preventScroll: true });
    return api;
  }

  /* ------------------------------------------------------------------ funnel bars */
  /* steps: [{label, value, fmt?, sub?}] — bar width = value / first; step conversion shown on the right */
  function funnelBars(container, steps, { fmt: f = 'int', color } = {}) {
    const root = el('div', { class: 'funnel' });
    const first = steps.length ? steps[0].value : 0;
    steps.forEach((s, i) => {
      const pct = first > 0 ? s.value / first : 0; const prev = i > 0 ? steps[i - 1].value : null; const conv = prev > 0 ? s.value / prev : null;
      root.append(el('div', { class: 'fstep' },
        el('div', { class: 'fl' }, el('span', { class: 'fname' }, s.label), s.sub ? el('span', { class: 'caption' }, s.sub) : null),
        el('div', { class: 'fbar' }, el('div', { class: 'fill', style: { width: (pct * 100).toFixed(2) + '%', background: color || s.color || ordinal(i, steps.length) } }), el('span', { class: 'fval mono' }, fmt(s.fmt || f, s.value))),
        el('div', { class: 'fr mono' }, el('span', { class: 'fpct', title: T('% of entry') }, localFmt.pct(pct)), conv != null ? el('span', { class: 'fconv', title: T('conversion from previous step') }, '→ ' + localFmt.pct(conv)) : el('span', { class: 'fconv dim' }, T('entry')))));
    });
    clear(container).append(root);
    return { el: root, update: (st, o2) => funnelBars(container, st, Object.assign({ fmt: f, color }, o2)) };
  }

  /* ------------------------------------------------------------------ boot: data pointer → loading state → page, or an error card */
  /** Runs the page once the dataset is ready (BB.ready()). Mock source: synchronous, identical to the old boot. URL source: a small loading state
   *  while the file is fetched / validated, then the page; on failure a readable error card with the validation list and a way back to the demo. */
  function boot(renderPage) {
    const src = BB.dataSource();
    const p = BB.boot();
    let loader = null;
    {
      document.documentElement.classList.add('bb-booting');
      loader = el('div', { class: 'bb-boot', role: 'status', 'aria-live': 'polite' }, el('span', { class: 'spinner' }), el('span', {}, T('Loading data…') + ' ', el('code', {}, src.url)));
      document.body.append(loader);
    }
    const done = () => { if (loader) loader.remove(); document.documentElement.classList.remove('bb-booting'); };
    return p.then((data) => { done(); return renderPage(data); }, (err) => { done(); bootError(err, src); console.warn('BB.boot: ' + (err && err.message || err), err && err.validation || ''); return null; });
  }
  function demoHref() { const u = new URL(location.href); u.searchParams.delete('data'); return u.pathname + u.search + u.hash; }
  function bootError(err, src) {
    const v = err && err.validation, code = err && err.code;
    const why = code === 'http' && err.status === 404 ? T('File not found (404). The path is relative to the page.')
      : code === 'http' ? T('Server returned {status}.', { status: err.status }) : code === 'network' ? T('Request failed: server unreachable or CORS blocked. file:// does not work, use a static server.')
      : code === 'parse' ? T('Not valid JSON.') : code === 'validation' ? T('File loaded but failed structure checks.') : (err && err.message) || T('Unknown error.');
    const how = { query: T('?data= URL parameter'), global: 'window.BB_DATA_URL', attr: T('data-src attribute on <script src="./core.js">') }[src.kind] || src.kind;
    const list = (items, sev) => items.map((e) => ({ severity: sev, title: e.text || e.text_ru, desc: e.examples && e.examples.length ? T('Examples: {list}', { list: e.examples.join('; ') }) : null, value: e.table || '' }));
    const body = el('div', { class: 'bb-boot-err-body' },
      el('p', {}, el('b', {}, T('Source') + ': '), el('code', {}, src.url), el('span', { class: 'muted' }, ' · ' + how)),
      el('p', {}, why),
      err && err.message && code !== 'validation' ? el('p', { class: 'muted mono' }, err.message) : null);
    const alerts = el('div', { class: 'bb-boot-err-list' });
    if (v && (v.errors.length || v.warnings.length)) alertList(alerts, list(v.errors, 'bad').concat(list(v.warnings, 'warn')));
    const actions = el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
      el('a', { class: 'btn primary', href: demoHref() }, T('Open demo data')),
      el('button', { class: 'btn', type: 'button', onClick: () => location.reload() }, T('Retry')),
      el('a', { class: 'btn ghost', href: BB.DEFAULT_DATA_URL || './data/demo.json', target: '_blank', rel: 'noopener', title: 'data/demo.json' }, T('Demo file')));
    const c = card(null, { title: T('Data load failed'), caption: T('board not started'), cls: 'bb-boot-err', body: el('div', {}, body, alerts, actions, el('p', { class: 'caption', style: { marginTop: '12px' } }, T('Format: README.md, docs/DATA_CONTRACT.md · check a file: BB.adapters.validate(json)'))) });
    document.body.append(el('div', { class: 'bb-boot-err-host' }, c.el));
    return c;
  }

  /* ------------------------------------------------------------------ global LTV tile + model badges (shared by the four boards) */
  /* Hash key ltvH ∈ {30, 60, 90, 180, 360} (default 90): horizon of the "LTV D{H} / trial" KPI tile on every board. */
  const LTV_H = [30, 60, 90, 180, 360];
  function ltvHorizon(st) { const v = +((st || {}).ltvH); return LTV_H.includes(v) ? v : 90; }
  const ltvCache = new WeakMap(); // data → Map(key → prediction); a reloaded dataset starts a new cache
  function ltvPredict(data, row, key, opts) {
    let m = ltvCache.get(data); if (!m) { m = new Map(); ltvCache.set(data, m); }
    const k = key + '|' + (BB.predict.hashCfg ? BB.predict.hashCfg().key : '');
    if (!m.has(k)) m.set(k, BB.predict.cohort(row, opts));
    return m.get(k);
  }
  /* ltvKpi({data, total, st, sliceKey, cmpTotal?, cmpKey?, deltaLabel?, cur?, scenario?, extra?}) → KPI card node:
     value = BB.predict.cohort(total, {offset: ltvH, money, model}).mid / p.trials (matured slice on an actual cell), gross/net by the board toggle,
     independent of the payer toggle and of signalDay; italic + 80 % interval + "N % observed" when predicted, plain when fully actual;
     "Not enough data" below BB.MIN_USERS trials; cached per slice key | ltvH | model | money. The tile carries the ltvH selector. */
  function ltvKpi(o) {
    const data = o.data, total = o.total, st = o.st || {}, money = st.money === 'net' ? 'net' : 'gross', H = ltvHorizon(st);
    const model = BB.predict.modelOf ? BB.predict.modelOf({ model: st.model }) : 'sbg', mdl = BB.predict.MODEL_BY_ID && BB.predict.MODEL_BY_ID[model];
    const mLabel = mdl ? L(mdl).replace(/ \(.*\)$/, '') : model;
    const fmtMoney = (v) => (o.cur && o.cur.code !== 'USD' ? BB.fmt.money(v, o.cur) : BB.fmt.usd2(v));
    const trials = total ? total.trials : 0, thin = !total || trials < (BB.MIN_USERS || 30);
    const base = { offset: H, money, data, model, scenario: o.scenario || null, signalDay: 'all' };
    const key = [o.sliceKey || total.key || '', H, model, money, o.scenario ? JSON.stringify(o.scenario) : ''].join('|');
    const p = thin ? null : ltvPredict(data, total, key, base);
    const ltv = p && p.trials ? p.mid / p.trials : null, predicted = !!(p && p.basis === 'predicted');
    const cpt = total && total.trials ? total.spend / total.trials : null, head = ltv != null && cpt ? ltv / cpt : null;
    const c = { label: T('LTV D{h} / trial', { h: H }), value: ltv == null ? null : fmtMoney(ltv), basis: false };
    c.hint = T('Forecast revenue to D{h} of the period\'s trial users / trials (matured slice when the cell is actual) — compare with CPT. Gross / net per the toolbar; independent of the payer definition and of signal mode. Italic — forecast, brackets — 80 % interval, «observed» — share of the value already received. Model: {m}; «prior» — share of the retention curve that comes from the benchmark prior.', { h: H, m: mdl ? L(mdl) : model });
    if (thin) c.sub = T('Not enough data');
    else {
      if (predicted) {
        c.interval = `[${fmtMoney(p.lo / p.trials)} – ${fmtMoney(p.hi / p.trials)}]`;
        c.group = T('{pct} % observed', { pct: p.mid > 0 ? Math.round(p.observed / p.mid * 100) : 0 }) + (p.priorShare > 0 ? ' · ' + T('prior {pct} %', { pct: Math.round(p.priorShare * 100) }) : '');
      } else c.group = T('actual');
      const bits = [`pROAS D${H} ${BB.fmt.x(p.roas)}`, head != null ? `LTV/CPT ${BB.fmt.x(head)}` : null, money, mLabel].filter(Boolean);
      if (o.extra) bits.push(o.extra);
      c.basis = bits.join(' · ');
      if (o.cmpTotal && o.cmpTotal.trials >= (BB.MIN_USERS || 30)) {
        const q = ltvPredict(data, o.cmpTotal, [o.cmpKey || 'cmp', H, model, money, o.scenario ? JSON.stringify(o.scenario) : ''].join('|'), base);
        const prevLtv = q.trials ? q.mid / q.trials : null;
        c.delta = o.cmpValid === false ? 'na' : BB.fmt.rel(ltv, prevLtv); c.dir = 1; c.deltaLabel = o.deltaLabel || T('vs previous period');
      }
    }
    const card = kpiCard(c);
    if (predicted) { card.classList.add('predicted'); card.querySelector('.value').classList.add('pv'); }
    /* horizon selector: writes ltvH to the hash (90 = default, key removed) */
    const sel = el('select', { class: 'kpi-sel', 'aria-label': T('LTV horizon'), title: T('LTV horizon (hash key ltvH)') }, LTV_H.map((h) => el('option', { value: String(h), selected: h === H }, 'D' + h)));
    sel.addEventListener('change', () => BB.state.write({ ltvH: +sel.value === 90 ? null : sel.value }));
    sel.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.label').append(sel);
    return card;
  }
  /* Header badges for the global model levers: "model: <label>" when model ≠ sbg (links to the Predict board on other boards),
     "prior: <id>" / "prior weight ×N" / "p1 half-life N d" when the hash keys prior / pm / p1hl are not at their defaults. */
  function modelBadges(opts = {}) {
    const wrap = el('span', { class: 'row', style: { gap: '6px' } });
    const update = () => {
      clear(wrap);
      const st = BB.state.read ? BB.state.read() : {}, model = BB.predict.modelOf ? BB.predict.modelOf({ model: st.model }) : 'sbg', m = BB.predict.MODEL_BY_ID[model];
      if (model !== 'sbg' && m) {
        const title = T('Active retention model: {m} (hash key model); sBG — base', { m: L(m) });
        wrap.append(opts.link ? el('a', { class: 'badge accent', href: BB.state.link('predict'), title }, T('model: {m}', { m: L(m).replace(/ \(.*\)$/, '') })) : badge(T('model: {m}', { m: L(m).replace(/ \(.*\)$/, '') }), 'accent', { title }));
      }
      const cfg = BB.predict.hashCfg ? BB.predict.hashCfg() : null, dflt = BB.predict.vlad ? BB.predict.vlad.cfg : {};
      if (cfg && cfg.prior !== (dflt.prior || 'research')) wrap.append(badge(T('prior: {p}', { p: cfg.prior }), 'warn', { title: T('Benchmark prior of the Vlad models (hash key prior); default research') }));
      if (cfg && cfg.pm !== 1) wrap.append(badge(T('prior weight ×{n}', { n: cfg.pm }), 'warn', { title: T('Multiplier of the prior weights m (hash key pm); 0 = plain sBG') }));
      if (cfg && cfg.p1hl !== +(dflt.halfLifeDays || 45)) wrap.append(badge(cfg.p1hl > 0 ? T('p1 half-life {n} d', { n: cfg.p1hl }) : T('p1 unweighted'), 'warn', { title: T('Half-life of the recency weights of the trial-to-paid rate (hash key p1hl); 0 = all-time rate') }));
    };
    update();
    return { el: wrap, update };
  }

  /* ------------------------------------------------------------------ export */
  Object.assign(ui, {
    boot, bootError, brand, avatar, pageTitle, applyTitle, contactCard,
    el, append, esc, clear, icon, fmt, localFmt, palette, PALETTE, PAL, hexA, ordinal, seqColor, entityColor, entitySlot, channelColor, statusColor, CHANNEL_SLOT,
    getTheme, setTheme, onTheme, cssVar,
    shell, toolbar, segmented, select, toggle, multiSelect, popover, chip, badge, toast,
    kpiCard, kpiRow, card, table, chart, chartStack, chartTableData, viewToggle, heatmap, alertList, feed, downloadCsv,
    showHover, hideHover, tipHtml, relTime, sparkSvg,
    flowGraph, sidePanel, funnelBars,
    columnPicker, tableColumnsButton, emptyState, isThin, metricTip, savedViews,
    ltvKpi, ltvHorizon, modelBadges, LTV_H,
  });
})();
