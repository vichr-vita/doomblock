import { chromium, expect, test, type CDPSession } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { browser } from 'wxt/browser';
import { defaultSettings } from '../../src/model';

interface PopupLayout {
  width: number;
  scrollWidth: number;
  popupWidth: number;
  ready: boolean;
  clipped: string[];
}

// Native action popups do not appear in Playwright's context.pages(). Inspect
// the actual autosized popup through its DevTools target instead of a new tab.
async function popupLayout(cdp: CDPSession, sessionId: string) {
  const response = new Promise<PopupLayout>((resolve, reject) => {
    const receive = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message) as {
        id?: number;
        error?: { message: string };
        result?: { result: { value: PopupLayout } };
      };
      if (message.id !== 1) return;
      cdp.off('Target.receivedMessageFromTarget', receive);
      if (message.error) reject(new Error(message.error.message));
      else if (message.result) resolve(message.result.result.value);
      else reject(new Error('No popup layout returned'));
    };
    cdp.on('Target.receivedMessageFromTarget', receive);
  });
  await cdp.send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          popupWidth: document.querySelector('.popup')?.getBoundingClientRect().width,
          ready: !!document.querySelector('.toggle'),
          clipped: [...document.querySelectorAll('h1, button, p, .row > span')]
            .filter(element => {
              const box = element.getBoundingClientRect();
              return box.left < 0 || box.right > innerWidth ||
                element.scrollWidth > element.clientWidth + 1;
            })
            .map(element => element.textContent)
        })`,
        returnByValue: true,
      },
    }),
  });
  return response;
}

test('native Chrome popup opens at a readable width on every open', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'doomblock-chrome-'));
  const extension = path.resolve(
    process.env.DOOMBLOCK_CHROME_EXTENSION ?? '.output/chrome-mv3',
  );
  const context = await chromium.launchPersistentContext(directory, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const cdp = await context.newCDPSession(context.pages()[0]!);
    const popupUrl = new URL('popup.html', worker.url()).href;
    for (const configured of [false, true, true]) {
      await worker.evaluate(
        async (settings) => {
          const { chrome } = globalThis as typeof globalThis & {
            chrome: typeof browser;
          };
          await chrome.storage.local.set({
            config: { settings, apiKey: settings.consent ? 'fixture-key' : '' },
          });
          await chrome.action.openPopup();
        },
        { ...defaultSettings, consent: configured, enabled: configured },
      );
      let targetId: string | undefined;
      await expect
        .poll(async () => {
          const { targetInfos } = await cdp.send('Target.getTargets');
          targetId = targetInfos.find(
            (target) => target.url === popupUrl,
          )?.targetId;
          return targetId;
        })
        .toBeTruthy();
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId: targetId!,
        flatten: false,
      });
      await expect
        .poll(() => popupLayout(cdp, sessionId))
        .toMatchObject({ popupWidth: 360, ready: true, clipped: [] });
      // Chrome can impose a wider native viewport on Linux.
      const layout = await popupLayout(cdp, sessionId);
      expect(layout.width).toBeGreaterThanOrEqual(360);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      await cdp.send('Target.closeTarget', { targetId: targetId! });
    }
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
