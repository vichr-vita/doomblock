import {
  categories,
  type Category,
  type Classification,
  type Scores,
  type Settings,
  type Video,
} from './model';

const thresholds = { gentle: 0.94, balanced: 0.85, strict: 0.7 } as const;

/** Score thresholds stay local so changing sensitivity never needs a new API call. */
export function blockReason(
  scores: Scores,
  sensitivity: Settings['sensitivity'],
): Category | undefined {
  return [...categories]
    .sort((a, b) => scores[b] - scores[a])
    .find((category) => scores[category] >= thresholds[sensitivity]);
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
  return undefined;
}

export function isFilteredPage(url: string, settings: Settings): boolean {
  const { pathname } = new URL(url);
  return (
    (pathname === '/' && settings.filterHome) ||
    (pathname === '/watch' && settings.filterSuggested)
  );
}
