import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: structuredClone(memory.data[key]),
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          await Promise.resolve();
          Object.assign(memory.data, structuredClone(value));
        }),
      },
    },
  },
}));
import {
  CACHE_LIMIT,
  CACHE_TTL,
  cachedScores,
  clearCache,
  pruneCache,
  publicState,
  readSettings,
  saveScores,
  updateSettings,
} from '../../src/storage';
import { defaultSettings, PREFERENCE_LIMIT } from '../../src/model';

const scores = { doom: 0.9, outrage: 0.2, curiosity: 0.1, clickbait: 0.8 };
beforeEach(() => {
  memory.data = {};
});

describe('local data', () => {
  it('starts disabled and never returns the API key to content scripts', async () => {
    expect((await Effect.runPromise(readSettings)).settings.enabled).toBe(
      false,
    );
    await Effect.runPromise(
      updateSettings(() => defaultSettings, 'private-key'),
    );
    expect(await Effect.runPromise(publicState)).toEqual({
      settings: defaultSettings,
      hasKey: true,
    });
  });
  it('requires both a key and consent before enabling', async () => {
    await expect(
      Effect.runPromise(
        updateSettings((settings) => ({ ...settings, enabled: true })),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        updateSettings(
          (settings) => ({ ...settings, enabled: true, consent: true }),
          'key',
        ),
      ),
    ).resolves.toMatchObject({ hasKey: true });
  });
  it('loads old settings with default filters while preserving the key and corrections', async () => {
    const legacy = Object.fromEntries(
      Object.entries(defaultSettings).filter(
        ([key]) =>
          !['hideTopics', 'keepTopics', 'builtInFilters'].includes(key),
      ),
    );
    const settings = {
      ...legacy,
      enabled: true,
      consent: true,
      overrides: { abcdefghijk: 'allow' },
      allowedChannels: { '/@history': 'History' },
    };
    memory.data.config = { settings, apiKey: 'existing-key' };
    expect(await Effect.runPromise(readSettings)).toEqual({
      apiKey: 'existing-key',
      settings: { ...defaultSettings, ...settings },
    });
    await Effect.runPromise(
      updateSettings((current) => ({
        ...current,
        hideTopics: 'Gossip',
        keepTopics: 'History',
        builtInFilters: { ...current.builtInFilters, doom: false },
      })),
    );
    expect(await Effect.runPromise(readSettings)).toMatchObject({
      apiKey: 'existing-key',
      settings: {
        hideTopics: 'Gossip',
        keepTopics: 'History',
        builtInFilters: { doom: false },
        overrides: settings.overrides,
      },
    });
  });
  it('rejects invalid stored preferences instead of silently resetting settings', async () => {
    memory.data.config = {
      settings: {
        ...defaultSettings,
        hideTopics: 'x'.repeat(PREFERENCE_LIMIT + 1),
      },
      apiKey: 'key',
    };
    await expect(Effect.runPromise(readSettings)).rejects.toMatchObject({
      code: 'storage',
    });
  });
  it('serializes concurrent corrections and cache writes without losing entries', async () => {
    await Promise.all(
      ['first', 'second', 'third'].map((id) =>
        Effect.runPromise(
          updateSettings((settings) => ({
            ...settings,
            overrides: { ...settings.overrides, [id]: 'allow' },
          })),
        ),
      ),
    );
    expect(
      Object.keys((await Effect.runPromise(readSettings)).settings.overrides),
    ).toHaveLength(3);
    await Promise.all(
      ['a', 'b', 'c'].map((key) => Effect.runPromise(saveScores(key, scores))),
    );
    expect(await Effect.runPromise(cachedScores('a'))).toEqual(scores);
    expect(await Effect.runPromise(cachedScores('c'))).toEqual(scores);
    await Effect.runPromise(clearCache);
    expect(await Effect.runPromise(cachedScores('a'))).toBeUndefined();
  });
  it('expires old scores and bounds the persistent cache', () => {
    const now = Date.now();
    const cache = Object.fromEntries(
      Array.from({ length: 600 }, (_, i) => [
        String(i),
        { scores, createdAt: now - i },
      ]),
    );
    cache.expired = { scores, createdAt: now - CACHE_TTL - 1 };
    const pruned = pruneCache(cache, now);
    expect(Object.keys(pruned)).toHaveLength(CACHE_LIMIT);
    expect(pruned.expired).toBeUndefined();
    expect(pruned['599']).toBeUndefined();
    expect(pruned['0']).toBeDefined();
  });
});
