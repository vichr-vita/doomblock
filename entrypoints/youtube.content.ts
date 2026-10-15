import { Schema } from 'effect';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { startContent } from '../src/content-controller';
import { send } from '../src/messaging';

const Command = Schema.Struct({
  kind: Schema.Literal('doomblock:command'),
  command: Schema.Literals(['snapshot', 'review', 'retry', 'showUnchecked']),
});

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  async main(ctx) {
    const stop = await startContent({
      async getState() {
        const result = await send({ kind: 'settings' });
        if (!result.ok) throw new Error(result.message);
        if (!('state' in result))
          throw new Error('Settings unavailable. Reload the extension.');
        return result.state;
      },
      async classify(video) {
        const result = await send({ kind: 'classify', video });
        if (!result.ok) throw new Error(result.message);
        if (!('classification' in result))
          throw new Error('Video could not be checked.');
        return result.classification;
      },
      async override(video, action) {
        const result = await send({ kind: 'override', video, action });
        if (!result.ok) throw new Error(result.message);
      },
      async allowChannel(video) {
        const result = await send({ kind: 'allowChannel', video });
        if (!result.ok) throw new Error(result.message);
      },
      subscribe(listener) {
        const onChange = (changes: Record<string, unknown>, area: string) => {
          if (area === 'local' && 'config' in changes) listener();
        };
        browser.storage.onChanged.addListener(onChange);
        return () => browser.storage.onChanged.removeListener(onChange);
      },
      listen(handler) {
        const listener = (raw: unknown, sender: { id?: string }) => {
          if (sender.id !== browser.runtime.id || !Schema.is(Command)(raw))
            return;
          return Promise.resolve(handler(raw.command));
        };
        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
      },
    });
    if (ctx.isInvalid) stop();
    else ctx.onInvalidated(stop);
  },
});
