import { test, expect, type Frame, type Page } from '@playwright/test';
import { BRIDGE_SCRIPT } from '../src/lib/kioskBridge';

// S23 remote scroll: a phone-sized mirror (A) leads, a smartboard-sized kiosk (B) follows through the bridge.
// Real layout is needed (anchors, sticky bars, inner scroll boxes), so this runs in a browser, not jsdom.
const para = Array.from({ length: 60 }, (_, i) => `<p id="p${i}">Paragraph ${i} ${'lorem ipsum dolor '.repeat(12)}</p>`).join('');
const pages: Record<string, string> = {
  plain: `<body>${para}</body>`,
  'sticky header': `<body><header style="position:sticky;top:0;background:#eee;height:50px">Menu</header>${para}</body>`,
  'inner scroll box': `<body style="margin:0"><main style="height:100vh;overflow:auto">${para}</main></body>`,
};

async function setup(page: Page, html: string): Promise<[Frame, Frame]> {
  await page.setViewportSize({ width: 1700, height: 900 });
  await page.setContent(`<iframe id="A" style="width:390px;height:700px" sandbox="allow-scripts"></iframe>
<iframe id="B" style="width:1280px;height:800px" sandbox="allow-scripts"></iframe>
<script>
  window.ready = 0;
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'ios-bridge') return;
    if (d.ev === 'ready') { ready++; return; }
    if (d.ev === 'scroll' && e.source === A.contentWindow) {
      const { type, dir, ev, ...rest } = d;
      B.contentWindow.postMessage({ type: 'ios-bridge', dir: 'down', op: 'scroll', ...rest }, '*');
    }
  });
</script>`);
  const src = html.replace('<body', `<head>${BRIDGE_SCRIPT}</head><body`);
  await page.evaluate((s) => {
    (document.getElementById('A') as HTMLIFrameElement).srcdoc = s;
    (document.getElementById('B') as HTMLIFrameElement).srcdoc = s;
  }, src);
  await page.waitForFunction(() => (window as unknown as { ready: number }).ready >= 2);
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  return [frames[0], frames[1]];
}

/** The paragraph at the top of the scroll area (the probe steps over margins between paragraphs). */
const topParagraph = (f: Frame) =>
  f.evaluate(() => {
    const m = document.querySelector('main');
    const y = (m && m.scrollHeight > m.clientHeight ? m.getBoundingClientRect().top : 0) + 2;
    for (let d = 0; d < 80; d += 4) {
      const p = document.elementsFromPoint(innerWidth / 3, y + d).find((e) => e.tagName === 'P');
      if (p) return p.id;
    }
    return null;
  });

for (const [name, html] of Object.entries(pages)) {
  test(`remote scroll follows on a ${name} page`, async ({ page }) => {
    const [a, b] = await setup(page, html);
    await a.evaluate(() => {
      const m = document.querySelector('main');
      if (m && m.scrollHeight > m.clientHeight) m.scrollTop = m.scrollHeight * 0.5;
      else window.scrollTo(0, document.documentElement.scrollHeight * 0.5);
    });
    const want = await topParagraph(a);
    expect(want).toMatch(/^p[1-9]\d$/);
    await expect.poll(() => topParagraph(b)).toBe(want);
  });
}
