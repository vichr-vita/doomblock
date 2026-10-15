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

test('filters subscriptions independently and restores cards when switched off', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await openFixture(page, 'feed/subscriptions');
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ filterHome: false }),
  );
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  await expect(page.locator('#shorts-card')).not.toHaveAttribute(
    'data-db-state',
  );
  await expect(page.locator('#sidebar-card')).not.toHaveAttribute(
    'data-db-state',
  );
  await page.evaluate(() => {
    const copy = document
      .querySelector('#doom-card')!
      .cloneNode(true) as HTMLElement;
    copy.id = 'subscription-card';
    copy.querySelector('[data-db-ui]')?.remove();
    copy.querySelector('a')!.href =
      'https://www.youtube.com/watch?v=newvideo001';
    copy.querySelector('h3')!.textContent = 'FINISHED'.repeat(60);
    copy.querySelector('a[href*="/@"]')!.textContent = 'LongChannelName'.repeat(
      40,
    );
    document.querySelector('#contents')!.append(copy);
  });
  await expect(page.locator('#subscription-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  expect(
    await page.evaluate(() => {
      const card = document.querySelector('#subscription-card')!;
      const controls = card
        .querySelector('[data-db-ui]')!
        .shadowRoot!.querySelectorAll('button');
      return (
        document.documentElement.scrollWidth <= innerWidth &&
        [...controls].every((control) => {
          const box = control.getBoundingClientRect();
          return (
            box.left >= 0 &&
            box.right <= innerWidth &&
            control.scrollWidth <= control.clientWidth
          );
        })
      );
    }),
  ).toBe(true);
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ filterSubscriptions: false }),
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

for (const renderer of ['ytd-grid-video-renderer', 'ytd-video-renderer']) {
  test(`filters the subscriptions ${renderer} layout after SPA navigation`, async ({
    page,
  }) => {
    await openFixture(page);
    await page.evaluate((tag) => {
      window.doomblockFixture.navigate('/feed/subscriptions');
      const grid = document.querySelector('ytd-rich-grid-renderer')!;
      const list = document.createElement('ytd-section-list-renderer');
      list.append(...grid.childNodes);
      grid.replaceWith(list);
      for (const card of list.querySelectorAll('ytd-rich-item-renderer')) {
        const replacement = document.createElement(tag);
        replacement.id = card.id;
        card.querySelector('[data-db-ui]')?.remove();
        replacement.append(...card.childNodes);
        card.replaceWith(replacement);
      }
    }, renderer);
    await expect(page.locator('#doom-card')).toHaveAttribute(
      'data-db-state',
      'blocked',
    );
    await expect(page.locator('#history-card')).toHaveAttribute(
      'data-db-state',
      'allowed',
    );
    await expect(page.locator('#history-card [data-db-ui]')).toHaveCount(1);
    await expect(page.locator('#shorts-card')).not.toHaveAttribute(
      'data-db-state',
    );
    await page.evaluate(() => {
      document.querySelector('#doom-card #video-title')!.textContent =
        'The engineering behind nuclear reactors';
    });
    await expect(page.locator('#doom-card')).toHaveAttribute(
      'data-db-state',
      'allowed',
    );
  });
}

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

test('clearing corrections reapplies cached scores in both directions', async ({
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
  const before = await page.evaluate(
    () => window.doomblockFixture.calls.length,
  );
  await page
    .locator('#doom-card')
    .getByRole('button', { name: 'Show video', exact: true })
    .click();
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  await page
    .locator('#history-card')
    .getByRole('button', { name: 'Hide with Doomblock' })
    .click();
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ overrides: {} }),
  );
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  expect(await page.evaluate(() => window.doomblockFixture.calls.length)).toBe(
    before,
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

test('custom preferences recheck open cards and keep exceptions override hide matches', async ({
  page,
}) => {
  await openFixture(page);
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ hideTopics: 'Roman' }),
  );
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  await expect(
    page
      .locator('#history-card')
      .getByText('Doomblock hid a video · Your filters'),
  ).toBeVisible();
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ keepTopics: 'History' }),
  );
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ hideTopics: '', keepTopics: '' }),
  );
  await expect(page.locator('#history-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'blocked',
  );
  const before = await page.evaluate(
    () => window.doomblockFixture.calls.length,
  );
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({
      builtInFilters: {
        doom: false,
        outrage: true,
        curiosity: true,
        clickbait: true,
      },
    }),
  );
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  expect(await page.evaluate(() => window.doomblockFixture.calls.length)).toBe(
    before,
  );
});

test('discards results from preferences changed during a request', async ({
  page,
}) => {
  await openFixture(page, '?slow');
  await expect
    .poll(() => page.evaluate(() => window.doomblockFixture.calls.length))
    .toBe(2);
  await page.evaluate(() =>
    window.doomblockFixture.setSettings({ keepTopics: 'FINISHED' }),
  );
  await expect
    .poll(() => page.evaluate(() => window.doomblockFixture.calls.length))
    .toBe(4);
  await expect(page.locator('#doom-card')).toHaveAttribute(
    'data-db-state',
    'allowed',
  );
  const snapshot = await page.evaluate(() =>
    window.doomblockFixture.snapshot(),
  );
  expect(
    snapshot.items.find((item) => item.video.id === 'abcdefghijk')?.scores
      ?.customKeep,
  ).toBe(0.98);
});
