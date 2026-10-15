import { expect, test, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const clipped = await page
    .locator('button, input, summary, .field, .review-item p, .list-row p')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const box = element.getBoundingClientRect();
          const nativeInput = element instanceof HTMLInputElement;
          return (
            box.width > 0 &&
            (box.left < -1 ||
              box.right > innerWidth + 1 ||
              (!nativeInput && element.scrollWidth > element.clientWidth + 1))
          );
        })
        .map((element) => element.textContent?.slice(0, 100)),
    );
  expect(clipped).toEqual([]);
}

for (const width of [320, 375, 768]) {
  test(`popup and open review fit ${width}px with long values and errors`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/browser/ui.html?error');
    await expect(page.getByText('videos hidden on this page')).toBeVisible();
    await page.getByRole('button', { name: 'Review 2 hidden' }).click();
    await page.getByText('Inspect title').first().click();
    await expect(
      page.getByText('A very long video title', { exact: false }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page
      .getByRole('button', { name: 'Show video', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Review 1 hidden' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Show unchecked', exact: true })
      .click();
    await expect(page.getByText('videos unchecked')).toHaveCount(0);
  });
  test(`populated settings fit ${width}px and save changes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/browser/ui.html?view=settings');
    await expect(
      page.getByRole('heading', { name: 'Allowed channels' }),
    ).toBeVisible();
    await page.getByLabel('Replace saved API key').fill('a'.repeat(300));
    await expectNoOverflow(page);
    await page
      .getByRole('checkbox', { name: 'YouTube Home', exact: true })
      .uncheck();
    await page
      .getByRole('button', { name: 'Save settings', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Settings saved');
  });
}

test('setup requires consent and a key before enabling', async ({ page }) => {
  await page.goto('/tests/browser/ui.html?view=settings&setup');
  const enable = page.getByRole('checkbox', { name: 'Enable filtering' });
  await expect(enable).toBeDisabled();
  await page.getByLabel('API key', { exact: true }).fill('test-only-key');
  await expect(enable).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I agree to send' }).check();
  await enable.check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved');
  await expect(page.getByLabel('Replace saved API key')).toHaveValue('');
});
