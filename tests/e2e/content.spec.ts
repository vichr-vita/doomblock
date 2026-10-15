import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

async function openFixture(page: Page, query = '') {
  await page.route(`http://127.0.0.1:4173/${query}`, (route) =>
    route.fulfill({
      path: fileURLToPath(new URL('../browser/youtube.html', import.meta.url)),
      contentType: 'text/html',
    }),
  );
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.doomblockFixture?.ready);
}

test('filters Home, handles both card layouts, and leaves Shorts alone', async ({
  page,
}) => {
  await openFixture(page);
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  await expect(page.locator('#doom-card .preview')).toBeHidden();
  await expect(page.locator('#shorts-card .preview')).toBeVisible();
  expect(await page.locator('#history-card [data-db-ui]').count()).toBe(1);
  await page
    .locator('#doom-card')
    .getByRole('button', { name: 'Show video', exact: true })
    .click();
  await expect(page.locator('#doom-card .preview')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.doomblockFixture.calls.filter((id) => id === 'history0001')
          .length,
    ),
  ).toBe(1);
});

test('rechecks recycled cards and newly appended recommendations', async ({
  page,
}) => {
  await openFixture(page);
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await page.evaluate(() => {
    const title = document.querySelector('#doom-card #video-title')!;
    title.textContent = 'The engineering behind nuclear reactors';
    const contents = document.querySelector('#contents')!;
    const copy = document
      .querySelector('#doom-card')!
      .cloneNode(true) as HTMLElement;
    copy.id = 'new-card';
    copy.querySelector('[data-db-ui]')?.remove();
    copy
      .querySelector('a')!
      .setAttribute('href', 'https://www.youtube.com/watch?v=newvideo001');
    copy.querySelector('h3')!.textContent = 'WE ARE FINISHED';
    contents.append(copy);
  });
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  await expect(page.locator('#new-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
});

test('SPA navigation restores search and limits watch filtering to the sidebar', async ({
  page,
}) => {
  await openFixture(page);
  await expect(page.locator('#doom-card .preview')).toBeHidden();
  await page.evaluate(() =>
    window.doomblockFixture.navigate('/results?search_query=crisis'),
  );
  await expect(page.locator('[data-db-ui]')).toHaveCount(0);
  await expect(page.locator('#doom-card .preview')).toBeVisible();
  await page.evaluate(() =>
    window.doomblockFixture.navigate('/watch?v=playing0001'),
  );
  await expect(page.locator('#sidebar-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await expect(page.locator('#doom-card')).not.toHaveAttribute('data-db-state');
});

test('pause restores all cards and channel allowances persist across new cards', async ({
  page,
}) => {
  await openFixture(page);
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await page
    .locator('#doom-card')
    .getByRole('button', { name: 'Always allow channel' })
    .click();
  await expect(page.locator('#doom-card .preview')).toBeVisible();
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ enabled: false }),
  );
  await expect(page.locator('[data-db-ui]')).toHaveCount(0);
  await expect(page.locator('#sidebar-card .preview')).toBeVisible();
});

test('failure keeps previews concealed, allows revealing, and recovers on retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await openFixture(page, '?error');
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'error',
  );
  await expect(page.locator('#doom-card .preview')).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator('#doom-card')
    .getByRole('button', { name: 'Show video', exact: true })
    .click();
  await expect(page.locator('#doom-card .preview')).toBeVisible();
  await page.evaluate(() => {
    window.doomblockFixture.failRequests(false);
    window.doomblockFixture.retry();
  });
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
});

test('sensitivity uses existing scores without reclassification and dispose restores DOM', async ({
  page,
}) => {
  await openFixture(page);
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  const before = await page.evaluate(
    () => window.doomblockFixture.calls.length,
  );
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ sensitivity: 'strict' }),
  );
  expect(await page.evaluate(() => window.doomblockFixture.calls.length)).toBe(
    before,
  );
  await page.evaluate(() => window.doomblockFixture.dispose());
  await expect(page.locator('[data-db-ui]')).toHaveCount(0);
  await expect(page.locator('#doom-card .preview')).toBeVisible();
});
