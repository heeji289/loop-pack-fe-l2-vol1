import { chromium } from '@playwright/test';

const shots = [
  { url: 'https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34518767357/job/103010802029', out: '/tmp/red-evidence/02-job-fail.png' },
  { url: 'https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34519214029/job/103012259073', out: '/tmp/red-evidence/04-job-pass.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });

for (const { url, out } of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('text=Complete job').first().waitFor({ timeout: 20_000 });
  await page.screenshot({ path: out, fullPage: true });
  console.log('saved', out);
}

await browser.close();
