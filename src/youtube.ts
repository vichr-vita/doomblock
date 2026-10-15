import type { Video } from './model';

const cardSelector =
  'ytd-rich-item-renderer, ytd-compact-video-renderer, yt-lockup-view-model';

/** YouTube recycles card elements. Read their metadata again after DOM changes. */
export function readVideo(card: Element): Video | undefined {
  const links = [...card.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const watch = links.find((link) => {
    const url = new URL(link.href, location.href);
    return (
      url.origin === 'https://www.youtube.com' &&
      url.pathname === '/watch' &&
      /^[\w-]{11}$/.test(url.searchParams.get('v') ?? '')
    );
  });
  if (!watch) return;
  const titleElement = card.querySelector<HTMLElement>(
    '#video-title, .yt-lockup-metadata-view-model__title, h3',
  );
  const title = (
    titleElement?.getAttribute('title') ||
    titleElement?.textContent ||
    watch.getAttribute('title') ||
    watch.textContent ||
    ''
  )
    .trim()
    .slice(0, 500);
  if (!title) return;
  const channelLinks = links.filter((link) => {
    const url = new URL(link.href, location.href);
    return (
      url.origin === 'https://www.youtube.com' &&
      /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.test(url.pathname)
    );
  });
  const channel =
    channelLinks.find((link) => link.textContent?.trim()) ?? channelLinks[0];
  const channelPath = channel
    ? new URL(channel.href, location.href).pathname.replace(/\/$/, '')
    : '';
  return {
    id: new URL(watch.href, location.href).searchParams.get('v')!,
    title,
    channel: (channel?.textContent ?? '').trim().slice(0, 500),
    channelId: channelPath.startsWith('/@')
      ? channelPath.toLowerCase()
      : channelPath,
  };
}

export function videoCards(document: Document, url: string): Element[] {
  const watchPage = new URL(url).pathname === '/watch';
  return [...document.querySelectorAll(cardSelector)].filter((card) => {
    if (card.parentElement?.closest(cardSelector)) return false;
    if (watchPage)
      return Boolean(
        card.closest('#related, ytd-watch-next-secondary-results-renderer'),
      );
    return Boolean(card.closest('ytd-rich-grid-renderer, #contents'));
  });
}
