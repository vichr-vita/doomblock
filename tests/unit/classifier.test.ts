import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { API_URL, MODEL, cacheKey, classifyVideo } from '../../src/classifier';

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
      classifyVideo(video, 'test-key', fetcher),
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
      classifyVideo(video, 'test-key', fetcher).pipe(
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
      Effect.runPromise(classifyVideo(video, 'key', fetcher)),
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
        classifyVideo(video, 'key', fetcher).pipe(
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
  it('invalidates cached scores when metadata changes', async () => {
    expect(await cacheKey(video)).not.toBe(
      await cacheKey({ ...video, title: 'A new title' }),
    );
    expect(await cacheKey(video)).toBe(await cacheKey({ ...video }));
  });
});
