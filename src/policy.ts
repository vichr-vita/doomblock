import {
  categories,
  type Classification,
  type Scores,
  type Settings,
  type Video,
} from './model';

const thresholds = { gentle: 0.94, balanced: 0.85, strict: 0.7 } as const;

export type Preferences = Pick<Settings, 'hideTopics' | 'keepTopics'>;

/** Only changes to classification instructions require fresh scores. */
export function preferencesKey(settings: Preferences): string {
  return JSON.stringify([
    settings.hideTopics.trim(),
    settings.keepTopics.trim(),
  ]);
}

/** Keep exceptions precede hide rules; thresholds and built-in switches stay local. */
export function blockReason(scores: Scores, settings: Settings) {
  const threshold = thresholds[settings.sensitivity];
  if (settings.keepTopics.trim() && (scores.customKeep ?? 0) >= threshold)
    return undefined;
  if (settings.hideTopics.trim() && (scores.customHide ?? 0) >= threshold)
    return 'custom' as const;
  return [...categories]
    .sort((a, b) => scores[b] - scores[a])
    .find(
      (category) =>
        settings.builtInFilters[category] && scores[category] >= threshold,
    );
}

export function localDecision(
  video: Video,
  settings: Settings,
): Classification | undefined {
  if (!settings.enabled || !settings.consent) return { status: 'allowed' };
  const override = settings.overrides[video.id];
  if (override === 'allow') return { status: 'allowed' };
  if (override === 'block') return { status: 'blocked' };
  if (
    video.channelId &&
    Object.hasOwn(settings.allowedChannels, video.channelId)
  ) {
    return { status: 'allowed' };
  }
  if (
    !settings.hideTopics.trim() &&
    !categories.some((category) => settings.builtInFilters[category])
  )
    return { status: 'allowed' };
  return undefined;
}

export function isFilteredPage(url: string, settings: Settings): boolean {
  const { pathname } = new URL(url);
  return (
    (pathname === '/' && settings.filterHome) ||
    (pathname === '/watch' && settings.filterSuggested)
  );
}
