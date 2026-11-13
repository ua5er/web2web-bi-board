#!/usr/bin/env python3
"""Web-to-Web BI Board: README media (screenshots, demo video, social preview).

Optional dev tool, not needed to run the board. Requires Python Playwright with a local Chrome
(`pip install playwright`), ffmpeg for the video step, and a static server on the repo root:

    npx serve -l 8793 .            # or: python3 -m http.server 8793
    python3 tools/capture_media.py shots   [--base http://127.0.0.1:8793/]
    python3 tools/capture_media.py video   [--base ...]   # docs/media/demo.mp4 + demo.gif (needs ffmpeg)
    python3 tools/capture_media.py social  [--base ...]   # docs/media/social-preview.png (1280x640)

Everything shown is the synthetic demo dataset (data/demo.json).
"""
import argparse
import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'docs' / 'media'
COHORTS_HASH = 'preset=all&step=month&offsets=0,7,30,60,90,180,270,360&cols=spend,trials,cpt,cpp'

# a visible cursor for recordings (headless video has none)
CURSOR_JS = """
(() => {
  const add = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div'); c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
      'background:rgba(255,255,255,.85);box-shadow:0 0 0 2px rgba(113,112,255,.9),0 2px 8px rgba(0,0,0,.5);z-index:2147483647;' +
      'pointer-events:none;transition:transform .08s ease;transform:translate(-100px,-100px)';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    addEventListener('mousedown', () => { c.style.background = 'rgba(113,112,255,.95)'; }, true);
    addEventListener('mouseup', () => { c.style.background = 'rgba(255,255,255,.85)'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
})();
"""


def prefs(theme='dark', lang='en'):
    return 'try{localStorage.setItem("bb-theme","%s");localStorage.setItem("bb-lang","%s")}catch(e){}' % (theme, lang)


async def new_ctx(pw_browser, width, height, theme='dark', scale=1, mobile=False, video_dir=None):
    kw = dict(viewport={'width': width, 'height': height}, device_scale_factor=scale, is_mobile=mobile, has_touch=mobile,
              color_scheme='dark' if theme == 'dark' else 'light')
    if video_dir:
        kw.update(record_video_dir=str(video_dir), record_video_size={'width': width, 'height': height})
    ctx = await pw_browser.new_context(**kw)
    await ctx.add_init_script(prefs(theme))
    return ctx


async def open_page(ctx, base, path, wait=1800):
    p = await ctx.new_page()
    await p.goto(base + path, wait_until='networkidle')
    await p.wait_for_timeout(wait)
    return p


async def scroll_to(p, selector_text, offset=-90):
    """Scroll so that the card whose title contains selector_text sits near the top."""
    await p.evaluate("""([t, off]) => { const h = [...document.querySelectorAll('.card-title, .card-head, h2, h3')].find(e => e.textContent.includes(t));
      if (h) { const y = h.getBoundingClientRect().top + scrollY + off; scrollTo(0, Math.max(0, y)); } }""", [selector_text, offset])
    await p.wait_for_timeout(700)


def save_png(page_png, out):
    from PIL import Image
    im = Image.open(page_png).convert('RGB')
    im.save(out, optimize=True)


async def shots(base):
    MEDIA.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        ctx = await new_ctx(b, 1440, 900, 'dark')
        plan = [
            ('cohorts.png', 'index.html#' + COHORTS_HASH, None),
            ('cohorts-charts.png', 'index.html#' + COHORTS_HASH, 'ROAS curves by cohort'),
            ('predictions.png', 'predict.html', None),
            ('predictions-whatif.png', 'predict.html', 'Plan mix'),
            ('realtime.png', 'realtime.html', None),
            ('user-flow.png', 'flow.html', 'Funnel map'),
        ]
        ctx2 = await new_ctx(b, 1440, 900, 'dark', scale=2)
        for name, path, card in plan:
            p = await open_page(ctx2 if name == 'user-flow.png' else ctx, base, path)
            if card:
                await scroll_to(p, card, -24)
            if name == 'user-flow.png':  # zoom the funnel map out so that source → loss → revenue fits the frame
                out_btn = p.get_by_role('button', name='Zoom out')
                for _ in range(2):
                    if await out_btn.count():
                        await out_btn.first.click(); await p.wait_for_timeout(400)
                # pan so that the source column sits at the left edge of the map and the columns start near its top
                d = await p.evaluate("""() => { const h = document.querySelector('g.col-head'), svg = document.querySelector('svg.flow-svg'); if (!h || !svg) return null;
                  const a = h.getBoundingClientRect(), b = svg.getBoundingClientRect(); return [a.left - b.left - 14, a.top - b.top - 14, b.left + b.width / 2, b.top + b.height / 2]; }""")
                if d:
                    await p.mouse.move(d[2], d[3]); await p.mouse.down(); await p.mouse.move(d[2] - d[0], d[3] - d[1], steps=10); await p.mouse.up()
                await p.wait_for_timeout(600)
            tmp = MEDIA / ('_' + name)
            await p.screenshot(path=str(tmp))
            save_png(tmp, MEDIA / name); tmp.unlink()
            await p.close()
            print('shot', name)
        await ctx.close(); await ctx2.close()
        # light theme
        ctx = await new_ctx(b, 1440, 900, 'light')
        p = await open_page(ctx, base, 'index.html#' + COHORTS_HASH)
        tmp = MEDIA / '_light.png'; await p.screenshot(path=str(tmp)); save_png(tmp, MEDIA / 'cohorts-light.png'); tmp.unlink()
        await ctx.close(); print('shot cohorts-light.png')
        # mobile (390x844 at 2x)
        ctx = await new_ctx(b, 390, 844, 'dark', scale=2, mobile=True)
        p = await open_page(ctx, base, 'realtime.html')
        await p.evaluate("() => { const t = document.querySelector('.bb-head'); if (t) scrollTo(0, t.getBoundingClientRect().top + scrollY - 52); }")
        await p.wait_for_timeout(600)
        tmp = MEDIA / '_mobile.png'; await p.screenshot(path=str(tmp)); save_png(tmp, MEDIA / 'mobile.png'); tmp.unlink()
        await ctx.close(); print('shot mobile.png')
        await b.close()


async def glide(p, x0, y0, x1, y1, steps=24, pause=0):
    for i in range(1, steps + 1):
        await p.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
        await p.wait_for_timeout(16)
    if pause:
        await p.wait_for_timeout(pause)


async def smooth_scroll(p, dy, steps=30):
    for _ in range(steps):
        await p.mouse.wheel(0, dy / steps)
        await p.wait_for_timeout(22)
    await p.wait_for_timeout(350)


async def center_of(p, locator):
    box = await locator.bounding_box()
    return (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2) if box else None


async def video(base):
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg not found')
    MEDIA.mkdir(parents=True, exist_ok=True)
    W, H = 1280, 800
    tmpdir = Path(tempfile.mkdtemp(prefix='bb-video-'))
    try:
        await _record(base, W, H, tmpdir)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


async def _record(base, W, H, tmpdir):
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        ctx = await new_ctx(b, W, H, 'dark')
        await ctx.add_init_script(CURSOR_JS)
        p = await ctx.new_page()
        # frames come from the DevTools screencast (JPEG + timestamp); the system ffmpeg turns them into a constant-rate video
        frames = []
        cdp = await ctx.new_cdp_session(p)
        async def on_frame(ev):
            n = len(frames); path = tmpdir / ('f%05d.jpg' % n)
            import base64
            path.write_bytes(base64.b64decode(ev['data']))
            frames.append((path, ev['metadata']['timestamp']))
            try:
                await cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception:
                pass
        cdp.on('Page.screencastFrame', lambda ev: asyncio.ensure_future(on_frame(ev)))
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 80, 'maxWidth': W, 'maxHeight': H, 'everyNthFrame': 1})
        # 1. Cohorts: ROAS D0..D360 table, then the curves chart
        await p.goto(base + 'index.html#' + COHORTS_HASH, wait_until='networkidle'); await p.wait_for_timeout(1400)
        await glide(p, 640, 420, 980, 600, pause=500)
        await smooth_scroll(p, 520)
        await glide(p, 980, 300, 1150, 300, pause=300)
        await smooth_scroll(p, 420)
        chart = p.locator('.card', has_text='ROAS curves by cohort').locator('canvas').first
        c = await center_of(p, chart)
        if c:
            await glide(p, 900, 600, c[0] - 160, c[1], pause=200)
            await glide(p, c[0] - 160, c[1], c[0] + 170, c[1] - 30, steps=40, pause=700)
        # 2. Predictions: forecast, then the what-if sliders
        nav = p.locator('.bb-nav a[data-page=predict]'); c = await center_of(p, nav)
        await glide(p, 700, 400, c[0], c[1], pause=150); await nav.click()
        await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(1600)
        await glide(p, c[0], c[1], 760, 300, pause=500)
        card = p.locator('.card', has_text='What-if').first
        await card.scroll_into_view_if_needed(); await p.wait_for_timeout(200)
        await p.evaluate("() => { const c = [...document.querySelectorAll('.card')].find(e => /What-if/.test(e.textContent) && e.querySelector('input[type=range]')); if (c) scrollTo({ top: c.getBoundingClientRect().top + scrollY - 120, behavior: 'instant' }); }")
        await p.wait_for_timeout(700)
        sliders = card.locator('input[type=range]')
        for i, frac in ((0, 0.82), (1, 0.25)):
            s = sliders.nth(i); box = await s.bounding_box()
            if not box:
                continue
            x0 = box['x'] + box['width'] * (0.5 if i < 2 else 0.1); y = box['y'] + box['height'] / 2
            await glide(p, x0 - 60, y - 40, x0, y, pause=200)
            await p.mouse.down()
            await glide(p, x0, y, box['x'] + box['width'] * frac, y, steps=40)
            await p.mouse.up(); await p.wait_for_timeout(900)
        await p.wait_for_timeout(700)
        # 3. Real-time
        nav = p.locator('.bb-nav a[data-page=realtime]'); c = await center_of(p, nav)
        await glide(p, 700, 500, c[0], c[1], pause=150); await nav.click()
        await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(900)
        today = p.get_by_role('radio', name='Today', exact=True)
        if await today.count():
            ct = await center_of(p, today.first); await glide(p, c[0], c[1], ct[0], ct[1], pause=120); await today.first.click(); await p.wait_for_timeout(500); c = ct
        hour = p.get_by_role('radio', name='Hour', exact=True)
        if await hour.count():
            ch = await center_of(p, hour.first); await glide(p, c[0], c[1], ch[0], ch[1], pause=120); await hour.first.click(); await p.wait_for_timeout(1100); c = ch
        pace = p.locator('.card', has_text='Day pace').locator('canvas')
        c2 = await center_of(p, pace.first) if await pace.count() else None
        if c2:
            await glide(p, c[0], c[1], c2[0] - 300, c2[1] - 40, pause=150)
            await glide(p, c2[0] - 300, c2[1] - 40, c2[0] + 330, c2[1] - 60, steps=46, pause=500)
        await smooth_scroll(p, 640)
        await p.wait_for_timeout(300)
        # 4. User flow
        await p.evaluate('scrollTo(0, 0)'); await p.wait_for_timeout(200)
        nav = p.locator('.bb-nav a[data-page=flow]'); c = await center_of(p, nav)
        await glide(p, 700, 400, c[0], c[1], pause=150); await nav.click()
        await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(900)
        week = p.get_by_role('radio', name='7d', exact=True)
        if await week.count():
            cw = await center_of(p, week.first); await glide(p, c[0], c[1], cw[0], cw[1], pause=120); await week.first.click(); await p.wait_for_timeout(500); c = cw
        day = p.get_by_role('radio', name='Day', exact=True)
        if await day.count():
            cd = await center_of(p, day.first); await glide(p, c[0], c[1], cd[0], cd[1], pause=120); await day.first.click(); await p.wait_for_timeout(1000); c = cd
        fit = p.get_by_role('button', name='Fit')
        if await fit.count():
            c3 = await center_of(p, fit.first)
            await glide(p, c[0], c[1], c3[0], c3[1], pause=150); await fit.first.click(); await p.wait_for_timeout(900)
        await glide(p, 760, 300, 1180, 160, steps=20)  # off the map: the wheel over the map zooms it instead of scrolling the page
        await smooth_scroll(p, 300)
        await glide(p, 1180, 160, 520, 520, steps=28, pause=400)
        # 5. Contact the author
        await p.evaluate('scrollTo(0, 0)'); await p.wait_for_timeout(250)
        btn = p.locator('.bb-contact-btn'); c4 = await center_of(p, btn)
        await glide(p, 520, 520, c4[0], c4[1], pause=200); await btn.click(); await p.wait_for_timeout(1800)
        print('recorded', len(frames), 'frames', file=sys.stderr, flush=True)
        for step in (lambda: cdp.send('Page.stopScreencast'), lambda: b.close()):  # the screencast can keep the page busy: never wait on it for long
            try:
                await asyncio.wait_for(step(), timeout=8)
            except Exception:
                pass
    # concat list with real frame durations
    lst = tmpdir / 'frames.txt'
    with lst.open('w') as fh:
        for i, (path, ts) in enumerate(frames):
            dur = (frames[i + 1][1] - ts) if i + 1 < len(frames) else 1.5
            fh.write("file '%s'\nduration %.4f\n" % (path.name, max(0.001, min(dur, 3.0))))
        fh.write("file '%s'\n" % frames[-1][0].name)
    webm = tmpdir / 'raw.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-vf', 'fps=30,scale=%d:%d:flags=lanczos,format=yuv420p' % (W, H),
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-an', str(webm)], check=True, cwd=str(tmpdir))
    mp4, gif, pal = MEDIA / 'demo.mp4', MEDIA / 'demo.gif', tmpdir / 'pal.png'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(webm), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
                    '-movflags', '+faststart', '-an', str(mp4)], check=True)
    gfilter = 'fps=7,scale=760:-1:flags=lanczos'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(webm), '-vf', gfilter + ',palettegen=max_colors=96:stats_mode=diff', str(pal)], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(webm), '-i', str(pal), '-lavfi', gfilter + ' [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
                    '-loop', '0', str(gif)], check=True)
    for f in (mp4, gif):
        print(f.name, round(f.stat().st_size / 1048576, 2), 'MB')


SOCIAL_HTML = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
*{box-sizing:border-box;margin:0}
body{width:1280px;height:640px;overflow:hidden;background:#08090a;font-family:Inter,system-ui,sans-serif;color:#f7f8f8;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(900px 520px at 88% 30%,rgba(113,112,255,.22),transparent 60%),radial-gradient(700px 500px at 0% 100%,rgba(57,135,229,.12),transparent 60%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:40px 40px;mask-image:linear-gradient(90deg,#000 30%,transparent 75%)}
.left{position:absolute;left:72px;top:72px;width:560px}
.brand{display:flex;align-items:center;gap:14px}
.brand img,.brand .mono{width:56px;height:56px;border-radius:50%;box-shadow:0 0 0 2px #2e3034}
.brand .mono{display:grid;place-items:center;background:linear-gradient(135deg,#7170ff,#3987e5);font-weight:600;font-size:22px}
.ver{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:500;color:#d0d6e0;border:1px solid #2e3034;border-radius:999px;padding:5px 12px;background:#0f1011}
h1{font-size:60px;line-height:1.02;letter-spacing:-.035em;font-weight:700;margin-top:34px}
h1 span{background:linear-gradient(90deg,#a7a6ff,#7170ff 55%,#3987e5);-webkit-background-clip:text;background-clip:text;color:transparent}
.tag{font-size:21px;line-height:1.45;color:#b8bec9;margin-top:22px;max-width:540px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px}
.chip{font-size:14px;font-weight:500;color:#d0d6e0;border:1px solid #2e3034;background:#0f1011;border-radius:8px;padding:7px 11px}
.foot{position:absolute;left:72px;bottom:56px;display:flex;align-items:center;gap:22px;font-size:17px;color:#8a8f98}
.foot b{color:#f7f8f8;font-weight:600}
.foot .gh{font-family:'JetBrains Mono',monospace;font-size:16px;color:#d0d6e0}
.shot{position:absolute;left:676px;top:64px;width:860px;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px #2e3034,0 40px 80px rgba(0,0,0,.6);transform:perspective(1600px) rotateY(-9deg) rotateX(2deg);transform-origin:left center}
.shot img{display:block;width:100%}
.fade{position:absolute;right:0;top:0;bottom:0;width:120px;background:linear-gradient(90deg,transparent,#08090a)}
</style></head><body><div class="glow"></div><div class="grid"></div>
<div class="shot"><img src="SHOT"></div><div class="fade"></div>
<div class="left">
 <div class="brand"><img src="https://github.com/GITHUB.png?size=128" onerror="this.outerHTML='<div class=mono>INITIALS</div>'"><span class="ver">v1.0 MVP</span></div>
 <h1>Web-to-Web<br><span>BI Board</span></h1>
 <p class="tag">Cohort payback, predictions, real-time and funnel for subscription web funnels.</p>
 <div class="chips"><span class="chip">ROAS D0 to D360</span><span class="chip">sBG forecasts</span><span class="chip">Real-time</span><span class="chip">User flow</span></div>
</div>
<div class="foot"><span>by <b>AUTHOR</b></span><span class="gh">github.com/GITHUB</span></div>
</body></html>"""


async def social(base):
    sys.path.insert(0, str(ROOT))
    cfg = {'author': 'Vlad Yasinski', 'github': 'ua5er'}
    MEDIA.mkdir(parents=True, exist_ok=True)
    src = MEDIA / 'cohorts.png'
    if not src.exists():
        sys.exit('run "shots" first (needs docs/media/cohorts.png)')
    initials = ''.join(w[0] for w in cfg['author'].split()[:2]).upper()
    html = SOCIAL_HTML.replace('SHOT', src.as_uri()).replace('GITHUB', cfg['github']).replace('AUTHOR', cfg['author']).replace('INITIALS', initials)
    tmp = Path(tempfile.mkdtemp(prefix='bb-social-')); page = tmp / 'social.html'; page.write_text(html, encoding='utf-8')
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        ctx = await b.new_context(viewport={'width': 1280, 'height': 640}, device_scale_factor=1)
        p = await ctx.new_page()
        await p.goto(page.as_uri(), wait_until='networkidle'); await p.wait_for_timeout(800)
        out = tmp / 'social.png'
        await p.screenshot(path=str(out))
        await b.close()
    save_png(out, MEDIA / 'social-preview.png')
    shutil.rmtree(tmp, ignore_errors=True)
    print('social-preview.png', round((MEDIA / 'social-preview.png').stat().st_size / 1024), 'KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('what', choices=['shots', 'video', 'social', 'all'])
    ap.add_argument('--base', default=os.environ.get('BB_BASE', 'http://127.0.0.1:8793/'))
    a = ap.parse_args()
    base = a.base if a.base.endswith('/') else a.base + '/'
    if a.what in ('shots', 'all'):
        asyncio.run(shots(base))
    if a.what in ('social', 'all'):
        asyncio.run(social(base))
    if a.what in ('video', 'all'):
        asyncio.run(video(base))


if __name__ == '__main__':
    main()
