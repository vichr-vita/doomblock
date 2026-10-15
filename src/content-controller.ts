import {
  reasonNames,
  type Classification,
  type PageItem,
  type PageState,
  type PublicState,
  type Settings,
  type Video,
} from './model';
import {
  blockReason,
  isFilteredPage,
  localDecision,
  matchingHideFilters,
  preferencesKey,
} from './policy';
import { readVideo, videoCards } from './youtube';

export type PageCommand = 'snapshot' | 'review' | 'retry' | 'showUnchecked';
export interface ContentBridge {
  getState(): Promise<PublicState>;
  classify(video: Video): Promise<Classification>;
  override(video: Video, action: 'allow' | 'block'): Promise<void>;
  allowChannel(video: Video): Promise<void>;
  subscribe(listener: () => void): () => void;
  listen(handler: (command: PageCommand) => PageState): () => void;
}
interface Entry {
  card: Element;
  host: HTMLElement;
  root: ShadowRoot;
  video: Video;
  fingerprint: string;
  classification?: Classification;
  error?: string;
  inFlight: boolean;
  visible: boolean;
  revealed: boolean;
}

const pageCss = `
.db-card[data-db-state="blocked"],.db-card[data-db-state="checking"],.db-card[data-db-state="error"]{position:relative!important;min-width:0!important}
.db-card[data-db-state="blocked"]>:not([data-db-ui]),.db-card[data-db-state="checking"]>:not([data-db-ui]),.db-card[data-db-state="error"]>:not([data-db-ui]){display:none!important}
[data-db-ui]{display:block;min-width:0;width:100%}
`;
const shadowCss = `
:host{display:block;min-width:0;color:#fff;background:#000;font:13px/1.5 system-ui,sans-serif;color-scheme:dark;box-sizing:border-box}
*{box-sizing:border-box}.placeholder{min-height:112px;padding:16px;border-top:1px solid #555;overflow-wrap:anywhere}.label{font-weight:650}p{margin:0 0 8px}.reason{margin-bottom:12px}button{font:inherit;color:#fff;background:#000;border:1px solid #777;padding:6px 9px;cursor:pointer;min-height:34px;max-width:100%;white-space:normal;overflow-wrap:anywhere}button:focus-visible{outline:2px solid #fff;outline-offset:3px}.actions{display:flex;gap:8px;flex-wrap:wrap}.allowed{padding:4px 0}.allowed button{border:0;font-size:11px;padding:2px 5px;min-height:26px;text-decoration:underline;text-underline-offset:3px}.error{margin-top:8px}.review-title{font-size:14px}
`;

/** Owns card lifecycle and restores YouTube when paused, navigating, or disposed. */
export async function startContent(bridge: ContentBridge) {
  let state = await bridge.getState();
  let disposed = false;
  let scheduled = false;
  let reviewing = false;
  let showUnchecked = false;
  let currentUrl = location.href;
  const entries = new Map<Element, Entry>();
  const style = document.createElement('style');
  style.textContent = pageCss;
  (document.head ?? document.documentElement).append(style);

  function active(settings: Settings = state.settings) {
    return (
      settings.enabled &&
      settings.consent &&
      isFilteredPage(location.href, settings)
    );
  }

  function item(entry: Entry): PageItem {
    const local = localDecision(entry.video, state.settings);
    const classification = local ?? entry.classification;
    const reason =
      classification?.status === 'scored'
        ? blockReason(classification.scores, state.settings)
        : undefined;
    const blocked =
      !entry.revealed &&
      (classification?.status === 'blocked' || Boolean(reason));
    return {
      video: entry.video,
      status: blocked
        ? 'blocked'
        : classification || entry.revealed || showUnchecked
          ? 'allowed'
          : entry.error
            ? 'error'
            : 'checking',
      ...(reason ? { reason } : {}),
      ...(classification?.status === 'scored'
        ? { scores: classification.scores }
        : {}),
      ...(entry.error ? { error: entry.error } : {}),
    };
  }

  function snapshot(): PageState {
    return {
      kind: 'doomblock:page',
      active: active(),
      items: [...entries.values()]
        .filter((entry) => entry.card.isConnected)
        .map(item),
    };
  }

  function button(label: string, action: () => Promise<void> | void) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void Promise.resolve(action()).catch(() => {
        element.textContent = 'Could not save. Try again.';
      });
    });
    return element;
  }

  function render(entry: Entry) {
    if (entries.get(entry.card) !== entry) return;
    const result = item(entry);
    const conceal =
      result.status === 'blocked' ||
      ((result.status === 'checking' || result.status === 'error') &&
        state.settings.concealPending &&
        !showUnchecked);
    entry.card.classList.add('db-card');
    entry.card.setAttribute(
      'data-db-state',
      conceal ? result.status : 'allowed',
    );
    const css = document.createElement('style');
    css.textContent = shadowCss;
    const body = document.createElement('div');
    body.className = conceal ? 'placeholder' : 'allowed';
    if (!conceal) {
      body.append(
        button('Hide with Doomblock', async () => {
          await bridge.override(entry.video, 'block');
          entry.revealed = false;
          applyState(await bridge.getState());
          render(entry);
        }),
      );
    } else {
      const label = document.createElement('p');
      label.className = 'label';
      label.textContent =
        result.status === 'checking'
          ? 'Checking video'
          : result.status === 'error'
            ? 'Video unchecked'
            : 'Doomblock hid a video';
      body.append(label);
      if (result.status === 'blocked') {
        const reason = document.createElement('p');
        reason.className = 'reason';
        const matches =
          result.reason === 'custom' && result.scores
            ? matchingHideFilters(result.scores, state.settings)
            : [];
        const explanation = matches.length
          ? `Matched ${matches.length === 1 ? 'filter' : 'filters'} ${matches.map((filter) => `"${filter}"`).join(', ')}`
          : result.reason
            ? reasonNames[result.reason]
            : 'Hidden by you';
        reason.textContent = `Reason: ${explanation}`;
        body.append(reason);
      }
      if (entry.error && result.status === 'error') {
        const error = document.createElement('p');
        error.textContent = entry.error;
        body.append(error);
      }
      if (reviewing && result.status === 'blocked') {
        const title = document.createElement('p');
        title.className = 'review-title';
        title.textContent = entry.video.title;
        body.append(title);
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        button('Show video', async () => {
          // Showing a card is immediate, even if saving the correction fails.
          entry.revealed = true;
          render(entry);
          await bridge.override(entry.video, 'allow');
          applyState(await bridge.getState());
          entry.revealed = false;
          render(entry);
        }),
      );
      if (entry.video.channelId && result.status === 'blocked') {
        actions.append(
          button('Always allow channel', async () => {
            await bridge.allowChannel(entry.video);
            applyState(await bridge.getState());
            for (const other of entries.values()) render(other);
          }),
        );
      }
      if (result.status === 'error')
        actions.append(
          button('Try again', () => {
            entry.error = undefined;
            void process(entry);
          }),
        );
      body.append(actions);
    }
    entry.root.replaceChildren(css, body);
  }

  async function process(entry: Entry) {
    if (
      entry.inFlight ||
      entry.classification ||
      !active() ||
      !entry.visible ||
      entry.revealed ||
      showUnchecked
    )
      return;
    const local = localDecision(entry.video, state.settings);
    if (local) {
      render(entry);
      return;
    }
    entry.inFlight = true;
    entry.error = undefined;
    render(entry);
    try {
      const result = await bridge.classify(entry.video);
      if (entries.get(entry.card) !== entry || !active() || disposed) return;
      entry.classification = result;
    } catch (error) {
      entry.error =
        error instanceof Error
          ? error.message
          : 'Could not check this video. Try again.';
    } finally {
      entry.inFlight = false;
      if (entries.get(entry.card) === entry && active() && !disposed)
        render(entry);
    }
  }

  const intersection = new IntersectionObserver(
    (observations) => {
      for (const observation of observations) {
        const entry = entries.get(observation.target);
        if (!entry) continue;
        entry.visible = observation.isIntersecting;
        if (entry.visible && !entry.error) void process(entry);
      }
    },
    { rootMargin: '600px' },
  );

  function remove(entry: Entry) {
    intersection.unobserve(entry.card);
    entry.card.classList.remove('db-card');
    entry.card.removeAttribute('data-db-state');
    entry.host.remove();
    entries.delete(entry.card);
  }

  function applyState(next: PublicState) {
    if (disposed) return;
    if (preferencesKey(state.settings) !== preferencesKey(next.settings)) {
      // Recreate entries so in-flight results cannot apply an older preference.
      for (const entry of entries.values()) remove(entry);
      showUnchecked = false;
    }
    state = next;
    scan();
  }

  function scan() {
    if (disposed) return;
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      reviewing = false;
      showUnchecked = false;
      for (const entry of entries.values()) remove(entry);
    }
    if (!active()) {
      for (const entry of entries.values()) remove(entry);
      return;
    }
    for (const entry of entries.values()) {
      if (!entry.card.isConnected) remove(entry);
    }
    const candidates = videoCards(document, location.href);
    const live = new Set(candidates);
    for (const entry of entries.values())
      if (!live.has(entry.card)) remove(entry);
    for (const card of candidates) {
      const video = readVideo(card);
      const old = entries.get(card);
      if (!video) {
        if (old) remove(old);
        continue;
      }
      const fingerprint = JSON.stringify(video);
      if (old?.fingerprint === fingerprint) continue;
      if (old) remove(old);
      const host = document.createElement('div');
      host.setAttribute('data-db-ui', '');
      const entry: Entry = {
        card,
        host,
        root: host.attachShadow({ mode: 'open' }),
        video,
        fingerprint,
        inFlight: false,
        visible: false,
        revealed: false,
      };
      entries.set(card, entry);
      card.append(host);
      render(entry);
      intersection.observe(card);
    }
  }

  function scheduleScan() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan();
    });
  }
  const mutation = new MutationObserver(scheduleScan);
  mutation.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'title'],
  });
  document.addEventListener('yt-navigate-finish', scheduleScan);
  window.addEventListener('popstate', scheduleScan);
  const unsubscribe = bridge.subscribe(() => {
    void bridge
      .getState()
      .then((next) => {
        if (disposed) return;
        applyState(next);
        for (const entry of entries.values()) {
          render(entry);
          if (!entry.error) void process(entry);
        }
      })
      .catch(() => {
        /* Preserve the last known policy if storage is temporarily unavailable. */
      });
  });
  const unlisten = bridge.listen((command) => {
    if (command === 'review') {
      reviewing = !reviewing;
      for (const entry of entries.values()) render(entry);
      if (reviewing)
        [...entries.values()]
          .find((entry) => item(entry).status === 'blocked')
          ?.card.scrollIntoView({ block: 'center' });
    }
    if (command === 'showUnchecked') {
      showUnchecked = true;
      for (const entry of entries.values()) render(entry);
    }
    if (command === 'retry') {
      for (const entry of entries.values()) {
        entry.error = undefined;
        void process(entry);
      }
    }
    return snapshot();
  });
  scan();
  return () => {
    disposed = true;
    mutation.disconnect();
    intersection.disconnect();
    unsubscribe();
    unlisten();
    document.removeEventListener('yt-navigate-finish', scheduleScan);
    window.removeEventListener('popstate', scheduleScan);
    for (const entry of entries.values()) remove(entry);
    style.remove();
  };
}
