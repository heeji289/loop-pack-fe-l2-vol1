import { chromium } from '@playwright/test';

const shots = [
  {
    url: 'https://github.com/heeji289/loop-pack-fe-l2-vol1/pull/35',
    out: '/tmp/red-evidence/01-comment-fail.png',
    // 봇 코멘트 본문만 잘라 찍는다.
    locator: '.js-comment-container:has-text("Quality CI: FAIL")',
  },
  {
    url: 'https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34518767357',
    out: '/tmp/red-evidence/02-summary-fail.png',
    locator: null,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

for (const { url, out, locator } of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  if (locator) {
    const target = page.locator(locator).first();
    await target.waitFor({ timeout: 20_000 });
    await target.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: true });
  }
  console.log('saved', out);
}

await browser.close();
