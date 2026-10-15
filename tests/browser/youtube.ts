import { startContent, type ContentBridge } from '../../src/content-controller';
import {
  PageSnapshot,
  defaultSettings,
  type PageState,
  type PublicState,
  type Settings,
} from '../../src/model';
import { Schema } from 'effect';
import { hideFilters } from '../../src/policy';

declare global {
  interface Window {
    doomblockFixture: {
      ready: boolean;
      calls: string[];
      snapshot(): PageState;
      setSettings(update: Partial<Settings>): void;
      navigate(path: string): void;
      failRequests(value: boolean): void;
      retry(): void;
      dispose(): void;
    };
  }
}
let state: PublicState = {
  settings: { ...defaultSettings, enabled: true, consent: true },
  hasKey: true,
};
let failure = new URLSearchParams(location.search).has('error');
let handler: Parameters<ContentBridge['listen']>[0] = () => ({
  kind: 'doomblock:page',
  active: false,
  items: [],
});
const listeners = new Set<() => void>();
const calls: string[] = [];
function changed() {
  for (const listener of listeners) listener();
}
window.doomblockFixture = {
  ready: false,
  calls,
  snapshot: () => handler('snapshot'),
  setSettings(update) {
    state = { ...state, settings: { ...state.settings, ...update } };
    changed();
  },
  navigate(path) {
    history.pushState({}, '', path);
    document.dispatchEvent(new Event('yt-navigate-finish'));
  },
  failRequests(value) {
    failure = value;
  },
  retry() {
    handler('retry');
  },
  dispose() {},
};
const stop = await startContent({
  async getState() {
    return state;
  },
  async classify(video) {
    const preferences = state.settings;
    calls.push(video.id);
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        new URLSearchParams(location.search).has('slow') ? 500 : 100,
      ),
    );
    if (failure)
      throw new Error(
        'TypeSafe could not be reached. Check your connection, then try again.',
      );
    const doom = video.title.includes('FINISHED') ? 0.97 : 0.1;
    const matches = (preference: string) =>
      `${video.title} ${video.channel}`
        .toLowerCase()
        .includes(preference.trim().toLowerCase())
        ? 0.98
        : 0.1;
    const customHideScores = hideFilters(preferences).map(matches);
    return {
      status: 'scored',
      scores: {
        doom,
        outrage: 0.1,
        curiosity: 0.1,
        clickbait: 0.2,
        ...(customHideScores.length
          ? { customHide: Math.max(...customHideScores), customHideScores }
          : {}),
        ...(preferences.keepTopics.trim()
          ? { customKeep: matches(preferences.keepTopics) }
          : {}),
      },
    };
  },
  async override(video, action) {
    state = {
      ...state,
      settings: {
        ...state.settings,
        overrides: { ...state.settings.overrides, [video.id]: action },
      },
    };
    changed();
  },
  async allowChannel(video) {
    state = {
      ...state,
      settings: {
        ...state.settings,
        allowedChannels: {
          ...state.settings.allowedChannels,
          [video.channelId]: video.channel,
        },
      },
    };
    changed();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  listen(listener) {
    handler = (command) =>
      Schema.decodeUnknownSync(PageSnapshot)(listener(command));
    return () => {};
  },
});
window.doomblockFixture.ready = true;
window.doomblockFixture.dispose = stop;
