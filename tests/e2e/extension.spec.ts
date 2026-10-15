import { expect, firefox, test } from '@playwright/test';
import { createServer } from 'node:net';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultSettings } from '../../src/model';

test('packaged Firefox scripts classify, cache, and persist corrections', async () => {
  test.setTimeout(60_000);
  const directory = await mkdtemp(path.join(tmpdir(), 'doomblock-extension-'));
  const extension = path.join(directory, 'addon');
  await cp(path.resolve('.output/firefox-mv3'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    background: { scripts: string[] };
  };
  manifest.background.scripts.unshift('fixture.js');
  await writeFile(manifestPath, JSON.stringify(manifest));
  // A fixture script seeds settings and replaces fetch in the test copy only.
  // Firefox extension pages are not supported Playwright page targets. The
  // production background and content scripts run unmodified in this test.
  const config = {
    settings: {
      ...defaultSettings,
      enabled: true,
      consent: true,
      hideTopics: 'Roman Empire',
      keepTopics: 'History',
    },
    apiKey: 'fixture-only-key',
  };
  await writeFile(
    path.join(extension, 'fixture.js'),
    `
    browser.storage.local.set({ config: ${JSON.stringify(config)} });
    let requestCount = 0;
    globalThis.fetch = async (url, options) => {
      if (url !== 'https://api.typesafe.ai/v1/systemone') throw new Error('Unexpected destination');
      if (++requestCount > 2) throw new Error('Cache did not prevent another API call');
      const request = JSON.parse(options.body);
      if (Object.keys(request.state).sort().join(',') !== 'channel,title') throw new Error('Unexpected transmitted fields');
      if (options.headers.Authorization !== 'Bearer fixture-only-key') throw new Error('API key not applied');
      if (!request.questions.customHide.criteria.true.includes('Roman Empire') || !request.questions.customKeep.criteria.true.includes('History')) throw new Error('Preferences not transmitted');
      const doom = request.state.title.includes('FINISHED') ? 0.97 : 0.1;
      return Response.json({ model: 'jev-1.13.0', answers: {
        doom: { type: 'noul', noul: doom }, outrage: { type: 'noul', noul: 0.1 },
        curiosity: { type: 'noul', noul: 0.1 }, clickbait: { type: 'noul', noul: 0.1 },
        customHide: { type: 'noul', noul: 0.98 },
        customKeep: { type: 'noul', noul: request.state.channel.includes('History') ? 0.98 : 0.1 }
      } });
    };
  `,
  );
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (!address || typeof address === 'string')
    throw new Error('No test debugger port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  const context = await firefox.launchPersistentContext(
    path.join(directory, 'profile'),
    {
      headless: true,
      executablePath: process.env.DOOMBLOCK_FIREFOX_EXECUTABLE,
      args: ['--start-debugger-server', String(port)],
      firefoxUserPrefs: {
        'devtools.debugger.remote-enabled': true,
        'devtools.debugger.prompt-connection': false,
      },
    },
  );
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(10_000);
  let disconnect: (() => void) | undefined;
  try {
    const youtube = context.pages()[0] ?? (await context.newPage());
    await youtube.goto('about:blank');
    const moduleUrl = new URL(
      './lib/firefox/remote.js',
      import.meta.resolve('web-ext'),
    ).href;
    const remoteModule = (await import(moduleUrl)) as {
      connect(port: number): Promise<{
        installTemporaryAddon(
          directory: string,
          openDevTools: boolean,
        ): Promise<unknown>;
        getInstalledAddon(id: string): Promise<unknown>;
        disconnect(): void;
      }>;
    };
    const remote = await remoteModule.connect(port);
    disconnect = () => remote.disconnect();
    await remote.installTemporaryAddon(extension, false);
    expect(
      await remote.getInstalledAddon('doomblock@vichr-vita.github.io'),
    ).toMatchObject({ backgroundScriptStatus: 'RUNNING', warnings: [] });
    const html = (
      await readFile(
        new URL('../browser/youtube.html', import.meta.url),
        'utf8',
      )
    ).replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
    await context.route('https://www.youtube.com/**', (route) =>
      route.fulfill({ body: html, contentType: 'text/html' }),
    );
    await youtube.goto('https://www.youtube.com/');
    await expect(youtube.locator('#doom-card')).toHaveAttribute(
      'data-db-state',
      'blocked',
    );
    await expect(youtube.locator('#history-card')).toHaveAttribute(
      'data-db-state',
      'allowed',
    );
    await youtube.reload();
    await expect(youtube.locator('#doom-card')).toHaveAttribute(
      'data-db-state',
      'blocked',
    );
    await expect(youtube.locator('#history-card')).toHaveAttribute(
      'data-db-state',
      'allowed',
    );
    await youtube
      .locator('#doom-card')
      .getByRole('button', { name: 'Show video', exact: true })
      .click();
    await expect(youtube.locator('#doom-card .preview')).toBeVisible();
    await youtube.reload();
    await expect(youtube.locator('#doom-card')).toHaveAttribute(
      'data-db-state',
      'allowed',
    );
    await expect(youtube.locator('#doom-card .preview')).toBeVisible();
  } finally {
    disconnect?.();
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
