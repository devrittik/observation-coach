import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('guided demo: observation, refresh-safe draft, follow-up, progress and history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Hydration mismatches surface as console warnings; treat them as failures here.
  page.on('console', (msg) => {
    if (/hydrat/i.test(msg.text())) errors.push(msg.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the guided demo' }).click();
  await expect(page).toHaveURL(/\/session/);
  await expect(page.getByText('A 60-second look around the product.')).toBeVisible();
  await page.getByRole('button', { name: 'Find my first detail' }).click();
  await expect(page.getByRole('heading', { name: 'The quietly overlooked' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'I’m ready to look around' }).click();
  await expect(page).toHaveURL(/\/outside/);
  await expect(page.locator('.site-header')).toHaveCount(0);
  await expect(page.locator('.site-footer')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'I’m back' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m back' }).click();
  await expect(page.getByRole('heading', { name: 'What did you actually notice?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reflect with my coach' })).toBeDisabled();
  await page.getByRole('button', { name: 'Try a sample observation' }).click();
  const draft = await page.getByLabel('Your observation', { exact: true }).inputValue();
  await page.reload();
  await expect(page.getByLabel('Your observation', { exact: true })).toHaveValue(draft);
  await page.getByRole('button', { name: 'Reflect with my coach' }).click();
  await expect(
    page.getByText('Which detail would you watch to find out whether it changes over time?'),
  ).toBeVisible();
  await page
    .getByLabel('What comes to mind?')
    .fill('I would watch the dark patch as the sunlight moves across the bark.');
  await page.getByRole('button', { name: 'Finish this reflection' }).click();
  await expect(
    page.getByRole('heading', { name: 'A small detail. A little more awareness.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'See your growing skills' }).click();
  await expect(page.getByRole('heading', { name: 'Growth, without the grind.' })).toBeVisible();
  await expect(page.locator('.stat-number')).toHaveText('1');
  await expect(page.getByRole('progressbar', { name: 'Comparison', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '6',
  );
  await page.getByRole('link', { name: 'Field notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The quietly overlooked' })).toBeVisible();
  await page.getByRole('link', { name: 'Revisit', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A small detail. A little more awareness.' }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile layout has no overflow; duration selection and protected navigation work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '20 min', exact: true }).click();
  await expect(page.getByRole('button', { name: '20 min', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Let’s begin' }).click();
  await expect(page).toHaveURL(/register\?duration=20/);
  await expect(page.getByRole('heading', { name: 'A fresh way to see.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/progress');
  await expect(page).toHaveURL(/\/login/);
});

test('registration, logout, login, wrong password, and account deletion through the UI', async ({
  page,
}) => {
  const email = `ui-${Date.now()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('What should we call you?').fill('Nora');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a-long-test-password');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/session/);
  await page.getByRole('button', { name: 'Your account and settings' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-long-password');
  await page.getByRole('button', { name: 'Welcome back' }).click();
  await expect(page.locator('.error-message')).toContainText('not correct');
  await page.getByLabel('Password', { exact: true }).fill('a-long-test-password');
  await page.getByRole('button', { name: 'Welcome back' }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.getByRole('button', { name: 'Your account and settings' }).click();
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete everything' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('API isolation, invalid input, CSRF, and idempotent completion', async ({
  playwright,
  baseURL,
}) => {
  const headers = { Origin: baseURL! };
  const a = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers });
  const b = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers });
  const anon = await playwright.request.newContext({ baseURL });
  const email = `api-${Date.now()}@example.test`;
  try {
    expect((await anon.post('/api/sessions', { data: { duration: 5 } })).status()).toBe(403);
    expect((await a.post('/api/sessions', { data: { duration: 5 } })).status()).toBe(401);
    expect(
      (
        await a.post('/api/auth/register', { data: { name: 'Asha', email, password: 'short' } })
      ).status(),
    ).toBe(400);
    const registered = await a.post('/api/auth/register', {
      data: { name: 'Asha', email, password: 'a-very-long-password' },
    });
    expect(registered.status()).toBe(201);
    expect(registered.headers()['set-cookie']).toContain('HttpOnly');
    expect(registered.headers()['set-cookie']).toContain('SameSite=lax');
    expect((await b.post('/api/auth/demo', { data: {} })).ok()).toBeTruthy();
    expect((await a.post('/api/sessions', { data: { duration: 7 } })).status()).toBe(400);
    const s = (await (await a.post('/api/sessions', { data: { duration: 10 } })).json()).session;
    expect(
      (await (await a.post('/api/sessions', { data: { duration: 5 } })).json()).session.id,
    ).toBe(s.id);
    expect((await b.get(`/api/sessions/${s.id}`)).status()).toBe(404);
    expect((await b.post(`/api/sessions/${s.id}/outside`, { data: {} })).status()).toBe(404);
    expect(
      (
        await a.post(`/api/sessions/${s.id}/reflect`, {
          data: { observation: 'This is premature' },
        })
      ).status(),
    ).toBe(409);
    await a.post(`/api/sessions/${s.id}/outside`, { data: {} });
    await a.post(`/api/sessions/${s.id}/return`, { data: {} });
    for (const observation of ['', ' ', 'a'.repeat(5001)])
      expect(
        (await a.post(`/api/sessions/${s.id}/reflect`, { data: { observation } })).status(),
      ).toBe(400);
    const reflected = await a.post(`/api/sessions/${s.id}/reflect`, {
      data: { observation: 'I noticed rough bark, darker than the other tree.' },
    });
    expect(reflected.ok()).toBeTruthy();
    expect(
      (await a.post(`/api/sessions/${s.id}/complete`, { data: { followup: '' } })).status(),
    ).toBe(400);
    const completed = await a.post(`/api/sessions/${s.id}/complete`, {
      data: { followup: 'The darker side was facing away from the sun.' },
    });
    expect(completed.ok()).toBeTruthy();
    await a.post(`/api/sessions/${s.id}/complete`, { data: { followup: 'Duplicate request' } });
    const own = await (await a.get('/api/bootstrap')).json();
    const other = await (await b.get('/api/bootstrap')).json();
    expect(own.progress.total).toBe(1);
    expect(other.progress.total).toBe(0);
    expect(other.sessions).toHaveLength(0);
    const evil = await a.post('/api/auth/logout', {
      data: {},
      headers: { Origin: 'https://not-this-app.example' },
    });
    expect(evil.status()).toBe(403);
    await a.post('/api/auth/logout', { data: {} });
    expect((await a.get(`/api/sessions/${s.id}`)).status()).toBe(401);
    const loggedIn = await a.post('/api/auth/login', {
      data: { email, password: 'a-very-long-password' },
    });
    expect(loggedIn.status()).toBe(200);
    expect((await (await a.get('/api/bootstrap')).json()).progress.total).toBe(1);
  } finally {
    await a.delete('/api/account');
    await b.delete('/api/account');
    await a.dispose();
    await b.dispose();
    await anon.dispose();
  }
});

test('public screens need no external assets and pass automated accessibility checks', async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === new URL(baseURL!).origin) await route.continue();
    else {
      external.push(route.request().url());
      await route.abort();
    }
  });
  for (const path of ['/', '/register', '/settings']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.fonts.check('16px "DM Sans"'))).toBe(true);
  }
  expect(external).toEqual([]);
});
