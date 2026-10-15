import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { API_URL, MODEL, cacheKey, classifyVideo } from '../../src/classifier';
import { defaultSettings } from '../../src/model';

const video = {
  id: 'abcdefghijk',
  title: 'EUROPE IS FINISHED',
  channel: 'Example',
  channelId: '/@example',
};
const response = {
  model: MODEL,
  answers: {
    doom: { type: 'noul', noul: 0.96 },
    outrage: { type: 'noul', noul: 0.1 },
    curiosity: { type: 'noul', noul: 0.8 },
    clickbait: { type: 'noul', noul: 0.9 },
  },
};

describe('TypeSafe client', () => {
  it('sends the documented request with only title and channel as state', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(response));
    const scores = await Effect.runPromise(
      classifyVideo(video, 'test-key', defaultSettings, fetcher),
    );
    expect(scores.doom).toBe(0.96);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe(API_URL);
    expect(options?.credentials).toBe('omit');
    expect(options?.referrerPolicy).toBe('no-referrer');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    const body: unknown = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      model: MODEL,
      state: { title: video.title, channel: video.channel },
    });
    expect(JSON.stringify(body)).not.toContain(video.id);
    expect(JSON.stringify(body)).not.toContain('test-key');
    expect(Object.keys((body as { questions: object }).questions)).toHaveLength(
      4,
    );
  });
  it('does not retry invalid credentials or expose the provider error body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('secret provider details', { status: 401 }),
      );
    const result = await Effect.runPromise(
      classifyVideo(video, 'test-key', defaultSettings, fetcher).pipe(
        Effect.match({
          onFailure: (error) => error.code,
          onSuccess: () => 'unexpected',
        }),
      ),
    );
    expect(result).toBe('auth');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries a temporary failure and returns validated scores', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json(response));
    await expect(
      Effect.runPromise(classifyVideo(video, 'key', defaultSettings, fetcher)),
    ).resolves.toMatchObject({ doom: 0.96 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    { answers: {} },
    {
      ...response,
      answers: { ...response.answers, doom: { type: 'noul', noul: 1.5 } },
    },
    {
      ...response,
      answers: { ...response.answers, doom: { type: 'noul', noul: '0.9' } },
    },
  ])(
    'rejects malformed scores instead of silently allowing a video',
    async (invalid) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(invalid));
      const result = await Effect.runPromise(
        classifyVideo(video, 'key', defaultSettings, fetcher).pipe(
          Effect.match({
            onFailure: (error) => error.code,
            onSuccess: () => 'unexpected',
          }),
        ),
      );
      expect(result).toBe('invalid_response');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('scores each distinct hide filter separately and preserves their order', async () => {
    const preferences = {
      hideTopics:
        ' Celebrity gossip\r\n\r\nCrypto predictions\nCelebrity gossip\nAI tutorials ',
      keepTopics: '',
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...response,
        answers: {
          ...response.answers,
          customHide: { type: 'noul', noul: 0.1 },
          customHide_1: { type: 'noul', noul: 0.98 },
          customHide_2: { type: 'noul', noul: 0.9 },
        },
      }),
    );
    await expect(
      Effect.runPromise(classifyVideo(video, 'key', preferences, fetcher)),
    ).resolves.toMatchObject({
      customHide: 0.98,
      customHideScores: [0.1, 0.98, 0.9],
    });
    const body: unknown = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body).toMatchObject({
      questions: {
        customHide: {
          criteria: { true: expect.stringContaining('"Celebrity gossip"') },
        },
        customHide_1: {
          criteria: { true: expect.stringContaining('"Crypto predictions"') },
        },
        customHide_2: {
          criteria: { true: expect.stringContaining('"AI tutorials"') },
        },
      },
    });
    expect(Object.keys((body as { questions: object }).questions)).toHaveLength(
      7,
    );
  });
  it.each([
    undefined,
    { type: 'noul', noul: 1.1 },
    { type: 'noul', noul: '0.9' },
  ])(
    'rejects a missing or invalid per-filter score even when another filter matches',
    async (secondAnswer) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          ...response,
          answers: {
            ...response.answers,
            customHide: { type: 'noul', noul: 0.98 },
            ...(secondAnswer ? { customHide_1: secondAnswer } : {}),
          },
        }),
      );
      await expect(
        Effect.runPromise(
          classifyVideo(
            video,
            'key',
            {
              hideTopics: 'Gossip\nCrypto',
              keepTopics: '',
            },
            fetcher,
          ),
        ),
      ).rejects.toMatchObject({ code: 'invalid_response' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('invalidates cached scores when metadata changes', async () => {
    expect(await cacheKey(video)).not.toBe(
      await cacheKey({ ...video, title: 'A new title' }),
    );
    expect(await cacheKey(video)).toBe(await cacheKey({ ...video }));
  });
  it('sends custom preferences as separate questions and validates their scores', async () => {
    const preferences = {
      hideTopics: 'Celebrity gossip',
      keepTopics: 'History documentaries',
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...response,
        answers: {
          ...response.answers,
          customHide: { type: 'noul', noul: 0.98 },
          customKeep: { type: 'noul', noul: 0.1 },
        },
      }),
    );
    await expect(
      Effect.runPromise(classifyVideo(video, 'key', preferences, fetcher)),
    ).resolves.toMatchObject({
      customHide: 0.98,
      customKeep: 0.1,
    });
    const body = String(fetcher.mock.calls[0]![1]?.body);
    expect(JSON.parse(body)).toMatchObject({
      state: { title: video.title, channel: video.channel },
      questions: {
        customHide: {
          type: 'noul',
          criteria: { true: expect.stringContaining(preferences.hideTopics) },
        },
        customKeep: {
          type: 'noul',
          criteria: { true: expect.stringContaining(preferences.keepTopics) },
        },
      },
    });
    expect(body).not.toContain(video.id);
  });
  it.each([
    { customHide: { type: 'noul', noul: 0.9 } },
    {
      customHide: { type: 'noul', noul: 0.9 },
      customKeep: { type: 'noul', noul: -0.1 },
    },
  ])(
    'rejects missing or invalid answers to custom questions',
    async (answers) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          ...response,
          answers: { ...response.answers, ...answers },
        }),
      );
      await expect(
        Effect.runPromise(
          classifyVideo(
            video,
            'key',
            {
              hideTopics: 'Gossip',
              keepTopics: 'History',
            },
            fetcher,
          ),
        ),
      ).rejects.toMatchObject({ code: 'invalid_response' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('invalidates scores for either preference but reuses them for local policy changes', async () => {
    const preferences = {
      ...defaultSettings,
      hideTopics: 'Gossip',
      keepTopics: 'History',
    };
    const key = await cacheKey(video, preferences);
    expect(key).not.toBe(
      await cacheKey(video, { ...preferences, hideTopics: 'Crypto' }),
    );
    expect(key).not.toBe(
      await cacheKey(video, { ...preferences, keepTopics: 'Science' }),
    );
    const localChanges = {
      ...preferences,
      hideTopics: '  Gossip\n',
      sensitivity: 'strict',
      builtInFilters: { ...defaultSettings.builtInFilters, doom: false },
    };
    expect(key).toBe(await cacheKey(video, localChanges));
  });
});
