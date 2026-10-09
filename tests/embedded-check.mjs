// Run against `COOKIE_EMBEDDED=true COOKIE_SECURE=true npm start`.
// Two synthetic HTTPS origins are routed to the local application, exercising
// real browser cookie partitioning without needing external DNS or certificates.
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({
  args: ['--no-sandbox', '--test-third-party-cookie-phaseout'],
});
let emittedPartitionedCookie = false;
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('https://preview-parent.test/**', async (route) => {
  await route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body style="margin:0"><iframe title="Observation Coach preview" src="https://coach.test/" style="width:100%;height:100vh;border:0"></iframe></body></html>',
  });
});
await context.route('https://coach.test/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const headers = await req.allHeaders();
  headers['x-forwarded-host'] = 'coach.test';
  delete headers.host;
  delete headers['content-length'];
  const response = await fetch('http://localhost:3000' + url.pathname + url.search, {
    method: req.method(),
    headers,
    body: req.postDataBuffer(),
    redirect: 'manual',
  });
  const outputHeaders = Object.fromEntries(response.headers.entries());
  if (outputHeaders['set-cookie']?.includes('Partitioned')) emittedPartitionedCookie = true;
  delete outputHeaders['content-encoding'];
  delete outputHeaders['content-length'];
  delete outputHeaders['transfer-encoding'];
  await route.fulfill({
    status: response.status,
    headers: outputHeaders,
    body: Buffer.from(await response.arrayBuffer()),
  });
});
try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('https://preview-parent.test/');
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Try the guided demo' }).click();
  await expect(frame.getByRole('heading', { name: 'Make room for noticing.' })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === 'observation_session');
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe('None');
  expect(emittedPartitionedCookie).toBe(true);
  await frame.getByRole('button', { name: 'Find my first detail' }).click();
  await expect(frame.getByRole('heading', { name: 'The quietly overlooked' })).toBeVisible();
  await frame.getByRole('button', { name: 'Your account and settings' }).click();
  await frame.getByRole('button', { name: 'Leave the demo' }).click();
  await expect(frame.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  expect((await context.cookies()).some((c) => c.name === 'observation_session')).toBe(false);
  expect(errors).toEqual([]);
  console.log(
    'PASS: cross-site iframe demo login, protected practice, secure SameSite=None cookie, Partitioned header, and logout.',
  );
} finally {
  await context.close();
  await browser.close();
}
