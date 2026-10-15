import { describe, expect, it } from 'vitest';
import { blockReason, isFilteredPage, localDecision } from '../../src/policy';
import { defaultSettings } from '../../src/model';

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
        'balanced',
      ),
    ).toBeUndefined();
  });
  it('uses the strongest qualifying category and changes sensitivity locally', () => {
    const scores = { doom: 0.9, outrage: 0.8, curiosity: 0.2, clickbait: 0.3 };
    expect(blockReason(scores, 'gentle')).toBeUndefined();
    expect(blockReason(scores, 'balanced')).toBe('doom');
    expect(blockReason({ ...scores, outrage: 0.95 }, 'strict')).toBe('outrage');
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
