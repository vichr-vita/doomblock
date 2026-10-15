import { browser } from 'wxt/browser';
import { Schema } from 'effect';
import { send } from '../messaging';
import {
  PageSnapshot,
  type Video,
  type PublicState,
  type PageState,
  type Settings,
} from '../model';
import type { PageCommand } from '../content-controller';

export interface UiBridge {
  getState(): Promise<PublicState>;
  save(settings: Settings, apiKey?: string): Promise<PublicState>;
  clearCache(): Promise<void>;
  page(command: PageCommand): Promise<PageState | undefined>;
  override(video: Video, action: 'allow' | 'block'): Promise<void>;
  subscribe(listener: () => void): () => void;
  openSettings(): void;
}

export const extensionBridge: UiBridge = {
  async getState() {
    const result = await send({ kind: 'settings' });
    if (!result.ok) throw new Error(result.message);
    if (!('state' in result))
      throw new Error('Settings unavailable. Reload the extension.');
    return result.state;
  },
  async save(settings, apiKey) {
    const result = await send({
      kind: 'save',
      settings,
      ...(apiKey === undefined ? {} : { apiKey }),
    });
    if (!result.ok) throw new Error(result.message);
    if (!('state' in result)) throw new Error('Settings could not be saved.');
    return result.state;
  },
  async clearCache() {
    const result = await send({ kind: 'clearCache' });
    if (!result.ok) throw new Error(result.message);
  },
  async page(command) {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) return;
    try {
      const result: unknown = await browser.tabs.sendMessage(tab.id, {
        kind: 'doomblock:command',
        command,
      });
      if (!Schema.is(PageSnapshot)(result)) return;
      return {
        kind: 'doomblock:page',
        active: result.active,
        items: [...result.items],
      };
    } catch {
      return undefined;
    }
  },
  async override(video, action) {
    const result = await send({ kind: 'override', video, action });
    if (!result.ok) throw new Error(result.message);
  },
  subscribe(listener) {
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'config' in changes) listener();
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  },
  openSettings() {
    void browser.runtime.openOptionsPage();
  },
};
