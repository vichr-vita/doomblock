import { describe, expect, it } from 'vitest';
import { blockReason, isFilteredPage, localDecision } from '../../src/policy';
import { defaultSettings, categories } from '../../src/model';

const settings = { ...defaultSettings, enabled: true, consent: true };
const video = {
  id: 'abcdefghijk',
  title: 'Why the economy is slowing',
  channel: 'Analysis',
  channelId: '/@analysis',
};

describe('negative engagement policy', () => {
  it('allows serious information when manipulation scores are low', () => {
    expect(
      blockReason(
        { doom: 0.2, outrage: 0.1, curiosity: 0.1, clickbait: 0.2 },
        settings,
      ),
    ).toBeUndefined();
  });
  it('uses the strongest qualifying category and changes sensitivity locally', () => {
    const scores = { doom: 0.9, outrage: 0.8, curiosity: 0.2, clickbait: 0.3 };
    expect(
      blockReason(scores, { ...settings, sensitivity: 'gentle' }),
    ).toBeUndefined();
    expect(blockReason(scores, settings)).toBe('doom');
    expect(
      blockReason(
        { ...scores, outrage: 0.95 },
        { ...settings, sensitivity: 'strict' },
      ),
    ).toBe('outrage');
  });
  it('lets keep exceptions override custom hide matches and built-in filters', () => {
    const scores = {
      doom: 0.99,
      outrage: 0.95,
      curiosity: 0.1,
      clickbait: 0.1,
      customHide: 0.98,
      customKeep: 0.96,
    };
    const preferences = {
      ...settings,
      hideTopics: 'Crime',
      keepTopics: 'History',
    };
    expect(blockReason(scores, preferences)).toBeUndefined();
    expect(blockReason({ ...scores, customKeep: 0.1 }, preferences)).toBe(
      'custom',
    );
    expect(blockReason(scores, { ...preferences, keepTopics: '' })).toBe(
      'custom',
    );
    expect(
      blockReason(scores, {
        ...settings,
        builtInFilters: { ...settings.builtInFilters, doom: false },
      }),
    ).toBe('outrage');
  });
  it('applies sensitivity to custom matches', () => {
    const scores = {
      doom: 0.1,
      outrage: 0.1,
      curiosity: 0.1,
      clickbait: 0.1,
      customHide: 0.9,
    };
    const preferences = { ...settings, hideTopics: 'Gossip' };
    expect(blockReason(scores, preferences)).toBe('custom');
    expect(
      blockReason(scores, { ...preferences, sensitivity: 'gentle' }),
    ).toBeUndefined();
  });
  it.each(categories)(
    'can disable %s without disabling other categories',
    (category) => {
      const scores = {
        doom: 0,
        outrage: 0,
        curiosity: 0,
        clickbait: 0,
        [category]: 1,
      };
      expect(blockReason(scores, settings)).toBe(category);
      expect(
        blockReason(scores, {
          ...settings,
          builtInFilters: { ...settings.builtInFilters, [category]: false },
        }),
      ).toBeUndefined();
    },
  );
  it('skips classification when no hide filters are active while honoring video corrections', () => {
    const preferences = {
      ...settings,
      builtInFilters: {
        doom: false,
        outrage: false,
        curiosity: false,
        clickbait: false,
      },
      keepTopics: 'History',
    };
    expect(localDecision(video, preferences)).toEqual({ status: 'allowed' });
    expect(
      localDecision(video, { ...preferences, hideTopics: 'Gossip' }),
    ).toBeUndefined();
    expect(
      localDecision(video, {
        ...preferences,
        overrides: { [video.id]: 'block' },
      }),
    ).toEqual({ status: 'blocked' });
  });
  it('gives explicit video corrections priority over channel rules', () => {
    expect(
      localDecision(video, {
        ...settings,
        allowedChannels: { '/@analysis': 'Analysis' },
        overrides: { abcdefghijk: 'block' },
      }),
    ).toEqual({ status: 'blocked' });
    expect(
      localDecision(video, {
        ...settings,
        overrides: { abcdefghijk: 'allow' },
      }),
    ).toEqual({ status: 'allowed' });
  });
  it('does not classify when disabled or consent is revoked', () => {
    expect(localDecision(video, defaultSettings)).toEqual({
      status: 'allowed',
    });
    expect(localDecision(video, { ...settings, consent: false })).toEqual({
      status: 'allowed',
    });
  });
  it('does not match allowed channels by a spoofable display name', () => {
    expect(
      localDecision(
        { ...video, channelId: '/@other' },
        { ...settings, allowedChannels: { '/@analysis': 'Analysis' } },
      ),
    ).toBeUndefined();
  });
  it.each([
    '/results?search_query=crisis',
    '/feed/subscriptions',
    '/@history',
    '/shorts/abcdefghijk',
  ])('keeps intentional navigation unfiltered: %s', (path) => {
    expect(isFilteredPage(`https://www.youtube.com${path}`, settings)).toBe(
      false,
    );
  });
  it('honors separate Home and Suggested switches', () => {
    expect(isFilteredPage('https://www.youtube.com/', settings)).toBe(true);
    expect(
      isFilteredPage('https://www.youtube.com/watch?v=abcdefghijk', settings),
    ).toBe(true);
    expect(
      isFilteredPage('https://www.youtube.com/', {
        ...settings,
        filterHome: false,
      }),
    ).toBe(false);
    expect(
      isFilteredPage('https://www.youtube.com/watch?v=abcdefghijk', {
        ...settings,
        filterSuggested: false,
      }),
    ).toBe(false);
  });
});
