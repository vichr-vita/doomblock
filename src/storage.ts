import { Effect, Schema, Semaphore } from 'effect';
import { browser } from 'wxt/browser';
import { Cache, Settings, defaultSettings, type PublicState } from './model';
import { FilterError } from './classifier';

const lock = Semaphore.makeUnsafe(1);
export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
export const CACHE_LIMIT = 500;
const SettingsRecord = Schema.Struct({
  settings: Settings,
  apiKey: Schema.String,
});
const read = (key: string) =>
  Effect.tryPromise({
    try: () => browser.storage.local.get(key),
    catch: () => new FilterError({ code: 'storage', retryable: false }),
  });
const write = (value: Record<string, unknown>) =>
  Effect.tryPromise({
    try: () => browser.storage.local.set(value),
    catch: () => new FilterError({ code: 'storage', retryable: false }),
  });

export const readSettings = Effect.gen(function* () {
  const data = yield* read('config');
  if (!data.config) return { settings: defaultSettings, apiKey: '' };
  return yield* Schema.decodeUnknownEffect(SettingsRecord)(data.config).pipe(
    Effect.mapError(
      () => new FilterError({ code: 'storage', retryable: false }),
    ),
  );
});

export const publicState = readSettings.pipe(
  Effect.map(({ settings, apiKey }): PublicState => ({
    settings,
    hasKey: apiKey.length > 0,
  })),
);

export function updateSettings(
  change: (settings: Settings) => Settings,
  apiKey?: string,
) {
  return lock.withPermit(
    Effect.gen(function* () {
      const current = yield* readSettings;
      const settings = change(current.settings);
      const key = apiKey === undefined ? current.apiKey : apiKey.trim();
      if (settings.enabled && (!key || !settings.consent)) {
        return yield* Effect.fail(
          new FilterError({ code: 'setup', retryable: false }),
        );
      }
      yield* write({ config: { settings, apiKey: key } });
      return { settings, hasKey: key.length > 0 } satisfies PublicState;
    }),
  );
}

export function pruneCache(cache: Cache, now = Date.now()): Cache {
  return Object.fromEntries(
    Object.entries(cache)
      .filter(([, entry]) => now - entry.createdAt < CACHE_TTL)
      .sort(([, a], [, b]) => b.createdAt - a.createdAt)
      .slice(0, CACHE_LIMIT),
  );
}

const readCache = Effect.gen(function* () {
  const data = yield* read('cache');
  if (!data.cache) return {} satisfies Cache;
  return yield* Schema.decodeUnknownEffect(Cache)(data.cache).pipe(
    Effect.mapError(
      () => new FilterError({ code: 'storage', retryable: false }),
    ),
  );
});

export function cachedScores(key: string) {
  return readCache.pipe(
    Effect.map((cache) => {
      const entry = cache[key];
      return entry && Date.now() - entry.createdAt < CACHE_TTL
        ? entry.scores
        : undefined;
    }),
  );
}

export function saveScores(key: string, scores: Cache[string]['scores']) {
  return lock.withPermit(
    Effect.gen(function* () {
      const cache = yield* readCache;
      yield* write({
        cache: pruneCache({
          ...cache,
          [key]: { scores, createdAt: Date.now() },
        }),
      });
    }),
  );
}

export const clearCache = lock.withPermit(write({ cache: {} }));
