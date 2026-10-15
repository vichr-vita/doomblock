import { Effect, Schema, Semaphore, type Result } from 'effect';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  Request,
  errorMessages,
  type Response,
  type Scores,
  type Video,
} from '../src/model';
import { classifyVideo, cacheKey, FilterError } from '../src/classifier';
import {
  cachedScores,
  clearCache,
  publicState,
  readSettings,
  saveScores,
  updateSettings,
} from '../src/storage';
import { localDecision } from '../src/policy';

export default defineBackground(() => {
  const network = Semaphore.makeUnsafe(3);
  const pending = new Map<
    string,
    Promise<Result.Result<Scores, FilterError>>
  >();
  let cooldown: { until: number; error: FilterError } | undefined;

  function scoresFor(video: Video, apiKey: string) {
    return Effect.gen(function* () {
      const key = yield* Effect.promise(() => cacheKey(video));
      const cached = yield* cachedScores(key);
      if (cached) return cached;
      const existing = pending.get(key);
      if (existing)
        return yield* Effect.fromResult(yield* Effect.promise(() => existing));
      const program = network.withPermit(
        Effect.gen(function* () {
          if (cooldown && cooldown.until > Date.now())
            return yield* Effect.fail(cooldown.error);
          const latest = yield* readSettings;
          if (
            !latest.settings.enabled ||
            !latest.settings.consent ||
            latest.apiKey !== apiKey
          ) {
            return yield* Effect.fail(
              new FilterError({ code: 'setup', retryable: false }),
            );
          }
          const result = yield* classifyVideo(video, apiKey).pipe(
            Effect.tapError((error) =>
              Effect.sync(() => {
                cooldown = {
                  until:
                    Date.now() + (error.code === 'auth' ? 300_000 : 30_000),
                  error,
                };
              }),
            ),
          );
          yield* saveScores(key, result);
          return result;
        }),
      );
      const promise = Effect.runPromise(Effect.result(program));
      pending.set(key, promise);
      try {
        return yield* Effect.fromResult(yield* Effect.promise(() => promise));
      } finally {
        pending.delete(key);
      }
    });
  }

  function handle(request: Request): Effect.Effect<Response, FilterError> {
    return Effect.gen(function* () {
      switch (request.kind) {
        case 'settings':
          return { ok: true, state: yield* publicState };
        case 'save': {
          const state = yield* updateSettings(
            () => request.settings,
            request.apiKey,
          );
          cooldown = undefined;
          return { ok: true, state };
        }
        case 'clearCache': {
          yield* clearCache;
          cooldown = undefined;
          return { ok: true, state: yield* publicState };
        }
        case 'override':
          return {
            ok: true,
            state: yield* updateSettings((settings) => {
              const overrides = { ...settings.overrides };
              if (request.action === 'reset')
                delete overrides[request.video.id];
              else overrides[request.video.id] = request.action;
              return { ...settings, overrides };
            }),
          };
        case 'allowChannel': {
          if (!request.video.channelId)
            return yield* Effect.fail(
              new FilterError({ code: 'invalid_request', retryable: false }),
            );
          return {
            ok: true,
            state: yield* updateSettings((settings) => ({
              ...settings,
              allowedChannels: {
                ...settings.allowedChannels,
                [request.video.channelId]: request.video.channel,
              },
            })),
          };
        }
        case 'classify': {
          const { settings, apiKey } = yield* readSettings;
          const local = localDecision(request.video, settings);
          if (local) return { ok: true, classification: local };
          if (!apiKey)
            return yield* Effect.fail(
              new FilterError({ code: 'setup', retryable: false }),
            );
          return {
            ok: true,
            classification: {
              status: 'scored',
              scores: yield* scoresFor(request.video, apiKey),
            },
          };
        }
      }
    });
  }

  browser.runtime.onMessage.addListener((raw: unknown, sender) => {
    // Only extension pages may change credentials, consent, or global settings.
    const ownPage = sender.url?.startsWith(browser.runtime.getURL('')) ?? false;
    const youtubePage =
      sender.url?.startsWith('https://www.youtube.com/') ?? false;
    if (sender.id !== browser.runtime.id || (!ownPage && !youtubePage)) return;
    return Effect.runPromise(
      Schema.decodeUnknownEffect(Request)(raw).pipe(
        Effect.mapError(
          () => new FilterError({ code: 'invalid_request', retryable: false }),
        ),
        Effect.flatMap((request) => {
          if (!ownPage && ['save', 'clearCache'].includes(request.kind)) {
            return Effect.fail(
              new FilterError({ code: 'invalid_request', retryable: false }),
            );
          }
          return handle(request);
        }),
        Effect.match({
          onSuccess: (response) => response,
          onFailure: (error): Response => ({
            ok: false,
            code: error.code,
            message: errorMessages[error.code],
          }),
        }),
      ),
    );
  });
});
