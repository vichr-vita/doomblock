import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import {
  defaultSettings,
  type PublicState,
  type PageState,
} from '../../src/model';
import type { UiBridge } from '../../src/ui/bridge';

const params = new URLSearchParams(location.search);
const setup = params.has('setup');
const title = 'A very long video title '.repeat(16);
const channelId = `/@${'VeryLongChannelName'.repeat(15)}`;
let state: PublicState = {
  settings: {
    ...defaultSettings,
    enabled: !setup,
    consent: !setup,
    allowedChannels: setup
      ? {}
      : { [channelId]: 'LongUnbrokenChannelName'.repeat(18) },
  },
  hasKey: !setup,
};
let page: PageState = {
  kind: 'doomblock:page',
  active: true,
  items: [
    {
      video: { id: 'abcdefghijk', title, channel: 'Example', channelId },
      status: 'blocked',
      reason: 'doom',
    },
    {
      video: {
        id: '12345678901',
        title: 'Another hidden video',
        channel: 'Another channel',
        channelId: '/@another',
      },
      status: 'blocked',
      reason: 'outrage',
    },
    ...(params.has('error')
      ? [
          {
            video: { id: 'error000001', title, channel: 'Example', channelId },
            status: 'error' as const,
            error:
              'TypeSafe could not be reached. Check your connection, then try again.',
          },
        ]
      : []),
  ],
};
const listeners = new Set<() => void>();
const bridge: UiBridge = {
  async getState() {
    return state;
  },
  async save(settings, apiKey) {
    state = {
      settings,
      hasKey: apiKey === undefined ? state.hasKey : apiKey.length > 0,
    };
    for (const listener of listeners) listener();
    return state;
  },
  async clearCache() {},
  async page(command) {
    if (command === 'showUnchecked')
      page = {
        ...page,
        items: page.items.map((item) =>
          item.status === 'error' ? { ...item, status: 'allowed' } : item,
        ),
      };
    return page;
  },
  async override(video) {
    page = {
      ...page,
      items: page.items.map((item) =>
        item.video.id === video.id ? { ...item, status: 'allowed' } : item,
      ),
    };
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  openSettings() {
    location.href = '/tests/browser/ui.html?view=settings&setup';
  },
};
createRoot(document.getElementById('root')!).render(
  <App
    bridge={bridge}
    view={params.get('view') === 'settings' ? 'settings' : 'popup'}
  />,
);
