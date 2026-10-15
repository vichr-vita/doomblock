import { useEffect, useState, type ReactNode } from 'react';
import {
  categories,
  categoryNames,
  defaultFilters,
  PREFERENCE_LIMIT,
  reasonNames,
  type PageState,
  type PublicState,
  type Settings,
} from '../model';
import type { UiBridge } from './bridge';
import './style.css';

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Could not complete the action. Try again.';
}

export function App({
  bridge,
  view,
}: {
  bridge: UiBridge;
  view: 'popup' | 'settings';
}) {
  const [state, setState] = useState<PublicState>();
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void bridge
        .getState()
        .then((next) => {
          if (mounted) setState(next);
        })
        .catch((cause: unknown) => {
          if (mounted) setError(message(cause));
        });
    };
    refresh();
    const unsubscribe = bridge.subscribe(refresh);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [bridge]);
  async function save(settings: Settings, apiKey?: string) {
    setError('');
    try {
      setState(await bridge.save(settings, apiKey));
    } catch (cause) {
      setError(message(cause));
      throw cause;
    }
  }
  return (
    <main className={view === 'popup' ? 'popup' : 'settings'}>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {state ? (
        view === 'popup' ? (
          <Popup state={state} save={save} bridge={bridge} onError={setError} />
        ) : (
          <SettingsPage
            state={state}
            save={save}
            bridge={bridge}
            onError={setError}
          />
        )
      ) : (
        <>
          <h1>doomblock</h1>
          <p role="status">Loading settings</p>
        </>
      )}
    </main>
  );
}

interface PanelProps {
  state: PublicState;
  save(settings: Settings, apiKey?: string): Promise<void>;
  bridge: UiBridge;
  onError(error: string): void;
}

function Popup({ state, save, bridge, onError }: PanelProps) {
  const [page, setPage] = useState<PageState>();
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void bridge
        .page('snapshot')
        .then((next) => {
          if (mounted) setPage(next);
        })
        .catch((cause: unknown) => {
          if (mounted) onError(message(cause));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [bridge, onError]);
  const hidden = page?.items.filter((item) => item.status === 'blocked') ?? [];
  const unchecked = page?.items.filter((item) => item.status === 'error') ?? [];
  const checking =
    page?.items.filter((item) => item.status === 'checking').length ?? 0;
  const settings = state.settings;
  const ready = state.hasKey && settings.consent;
  async function update(next: Settings) {
    setBusy(true);
    try {
      await save(next);
    } catch {
      /* App displays the save error. */
    } finally {
      setBusy(false);
    }
  }
  async function command(action: 'retry' | 'showUnchecked') {
    try {
      setPage(await bridge.page(action));
    } catch (cause) {
      onError(message(cause));
    }
  }
  return (
    <>
      <header className="bar">
        <h1>doomblock</h1>
        <button className="text-button" onClick={() => bridge.openSettings()}>
          Settings
        </button>
      </header>
      <div className="row">
        <span>YouTube filtering</span>
        <button
          className="toggle"
          aria-pressed={settings.enabled}
          disabled={busy}
          onClick={() =>
            ready
              ? void update({ ...settings, enabled: !settings.enabled })
              : bridge.openSettings()
          }
        >
          <span
            className={
              settings.enabled ? 'toggle-mark selected' : 'toggle-mark'
            }
            aria-hidden="true"
          >
            {settings.enabled ? '✓' : ''}
          </span>
          {settings.enabled ? 'On' : 'Off'}
        </button>
      </div>
      {!ready ? (
        <section className="section">
          <h2>Set up filtering</h2>
          <p>Add your TypeSafe API key to start.</p>
          <button
            className="primary mt-4"
            onClick={() => bridge.openSettings()}
          >
            Open settings
          </button>
        </section>
      ) : (
        <>
          <section className="section">
            <p className="big-number">{hidden.length}</p>
            <p>videos hidden on this page</p>
            {!page ? (
              <p className="hint">
                Open YouTube Home or a video page. Reload tabs opened before
                installation.
              </p>
            ) : !page.active ? (
              <p className="hint">
                {settings.enabled
                  ? 'This page is unfiltered.'
                  : 'Filtering is paused.'}
              </p>
            ) : checking ? (
              <p className="hint" role="status">
                Checking {checking} videos
              </p>
            ) : null}
          </section>
          <section className="section">
            <h2>Sensitivity</h2>
            <div className="presets" role="group" aria-label="Sensitivity">
              {(['gentle', 'balanced', 'strict'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={settings.sensitivity === value}
                  disabled={busy}
                  onClick={() =>
                    void update({ ...settings, sensitivity: value })
                  }
                >
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <p className="hint">
              {settings.sensitivity === 'gentle'
                ? 'Hide only the clearest matches.'
                : settings.sensitivity === 'strict'
                  ? 'Hide subtler matches, too.'
                  : 'Hide clear matches.'}
            </p>
          </section>
          <div className="rule">
            {categories.map((category) => (
              <div className="count-row" key={category}>
                <span>{categoryNames[category]}</span>
                <span>
                  {hidden.filter((item) => item.reason === category).length}
                </span>
              </div>
            ))}
            {settings.hideTopics.trim() ? (
              <div className="count-row">
                <span>Your filters</span>
                <span>
                  {hidden.filter((item) => item.reason === 'custom').length}
                </span>
              </div>
            ) : null}
            {hidden.some((item) => !item.reason) ? (
              <div className="count-row">
                <span>Hidden by you</span>
                <span>{hidden.filter((item) => !item.reason).length}</span>
              </div>
            ) : null}
          </div>
          <button
            className="text-button"
            onClick={() => bridge.openSettings('filters')}
          >
            Edit your filters
          </button>
          {unchecked.length ? (
            <section className="error">
              <h2>{unchecked.length} videos unchecked</h2>
              <p>{unchecked[0]?.error}</p>
              <div className="actions">
                <button onClick={() => void command('retry')}>Try again</button>
                <button onClick={() => void command('showUnchecked')}>
                  Show unchecked
                </button>
              </div>
            </section>
          ) : null}
          <footer className="footer-row">
            <button
              disabled={!hidden.length}
              aria-expanded={reviewing}
              onClick={() => setReviewing(!reviewing)}
            >
              Review {hidden.length} hidden
            </button>
            <span>
              {!settings.enabled
                ? 'Paused'
                : unchecked.length
                  ? 'Check connection'
                  : checking
                    ? 'Checking'
                    : 'Ready'}
            </span>
          </footer>
          {reviewing ? (
            <section className="review" aria-label="Hidden videos">
              <h2>Hidden videos</h2>
              {hidden.map((item) => (
                <article className="review-item" key={item.video.id}>
                  <p>
                    {item.reason ? reasonNames[item.reason] : 'Hidden by you'}
                  </p>
                  <details>
                    <summary>Inspect title</summary>
                    <p>{item.video.title}</p>
                    <p className="hint">{item.video.channel}</p>
                  </details>
                  <button
                    onClick={() => {
                      void bridge
                        .override(item.video, 'allow')
                        .then(() => bridge.page('snapshot'))
                        .then(setPage)
                        .catch((cause: unknown) => onError(message(cause)));
                    }}
                  >
                    Show video
                  </button>
                </article>
              ))}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  checked: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label className="check-row">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function SettingsPage({ state, save, bridge, onError }: PanelProps) {
  const [draft, setDraft] = useState(state.settings);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setDraft(state.settings);
  }, [state.settings]);
  function change(update: Partial<Settings>) {
    setDraft((current) => ({ ...current, ...update }));
    setNotice('');
  }
  async function submit() {
    setBusy(true);
    setNotice('');
    try {
      await save(draft, apiKey.trim() || undefined);
      setApiKey('');
      setNotice('Settings saved. Filters apply to open YouTube tabs.');
    } catch {
      /* App displays the save error. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="bar">
        <h1>doomblock</h1>
        <span>Settings</span>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <section className="section">
          <h2>TypeSafe API key</h2>
          <p>
            Video titles, channel names, and your filter preferences go directly
            to TypeSafe for classification. Your key, cached scores, and
            corrections stay in this browser.
          </p>
          <p className="hint">
            No thumbnails, video IDs, cookies, search terms, or watch history
            are sent. No developer server or analytics.
          </p>
          <label className="field-label" htmlFor="api-key">
            {state.hasKey ? 'Replace saved API key' : 'API key'}
          </label>
          <input
            id="api-key"
            className="field"
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setNotice('');
            }}
            placeholder={
              state.hasKey
                ? 'A key is saved. Leave blank to keep it.'
                : 'Paste your TypeSafe API key'
            }
            autoComplete="off"
            spellCheck={false}
            maxLength={1000}
          />
          <p className="hint">
            <a
              href="https://console.typesafe.ai"
              target="_blank"
              rel="noreferrer"
            >
              Get a key from TypeSafe
            </a>
            . API usage is billed to your TypeSafe account. The key is stored
            locally, without encryption.
          </p>
          <Checkbox
            label="I agree to send video titles, channel names, and my filter preferences to TypeSafe."
            checked={draft.consent}
            onChange={(consent) =>
              change({ consent, enabled: consent ? draft.enabled : false })
            }
          />
          <Checkbox
            label="Enable filtering"
            checked={draft.enabled}
            disabled={!draft.consent || (!state.hasKey && !apiKey.trim())}
            onChange={(enabled) => change({ enabled })}
          />
        </section>
        <section className="section" id="filters">
          <h2>Your filters</h2>
          <label className="field-label" htmlFor="hide-topics">
            Hide videos about
          </label>
          <textarea
            id="hide-topics"
            className="field"
            rows={4}
            value={draft.hideTopics}
            maxLength={PREFERENCE_LIMIT}
            placeholder={
              'Celebrity gossip\nCrypto price predictions\nViolent crime'
            }
            aria-describedby="hide-topics-hint"
            onChange={(event) => change({ hideTopics: event.target.value })}
          />
          <p className="hint" id="hide-topics-hint">
            Use your own words. Add one preference per line.
          </p>
          <label className="field-label" htmlFor="keep-topics">
            Keep exceptions
          </label>
          <textarea
            id="keep-topics"
            className="field"
            rows={4}
            value={draft.keepTopics}
            maxLength={PREFERENCE_LIMIT}
            placeholder={'Cybersecurity explainers\nHistorical documentaries'}
            aria-describedby="keep-topics-hint"
            onChange={(event) => change({ keepTopics: event.target.value })}
          />
          <p className="hint" id="keep-topics-hint">
            These exceptions take priority over your hide topics and the
            built-in filters. Saved video corrections and allowed channels still
            take priority.
          </p>
          <fieldset className="filter-options">
            <legend>Also hide</legend>
            {categories.map((category) => (
              <Checkbox
                key={category}
                label={categoryNames[category]}
                checked={draft.builtInFilters[category]}
                onChange={(enabled) =>
                  change({
                    builtInFilters: {
                      ...draft.builtInFilters,
                      [category]: enabled,
                    },
                  })
                }
              />
            ))}
          </fieldset>
          <p className="hint">
            Your preferences go to TypeSafe with video titles and channel names.
            Decisions use only those details. Each field allows up to{' '}
            {PREFERENCE_LIMIT.toLocaleString('en-US')} characters.
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              change({
                hideTopics: '',
                keepTopics: '',
                builtInFilters: defaultFilters,
              })
            }
          >
            Reset filters
          </button>
        </section>
        <section className="section">
          <h2>Where to filter</h2>
          <Checkbox
            label="YouTube Home"
            checked={draft.filterHome}
            onChange={(filterHome) => change({ filterHome })}
          />
          <Checkbox
            label="Suggested videos beside the player"
            checked={draft.filterSuggested}
            onChange={(filterSuggested) => change({ filterSuggested })}
          />
          <p className="hint">
            Search results, subscriptions, channels, and Shorts stay unfiltered.
          </p>
        </section>
        <section className="section">
          <h2>While checking</h2>
          <Checkbox
            label="Conceal previews until classification finishes"
            checked={draft.concealPending}
            onChange={(concealPending) => change({ concealPending })}
          />
          <p className="hint">
            If TypeSafe is unavailable, concealed previews stay hidden. You can
            show them or retry from the popup.
          </p>
        </section>
        <section className="section">
          <h2>Sensitivity</h2>
          <div className="presets" role="group" aria-label="Sensitivity">
            {(['gentle', 'balanced', 'strict'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={draft.sensitivity === value}
                onClick={() => change({ sensitivity: value })}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <p className="hint">
            These starting thresholds have not been calibrated against your
            preferences.
          </p>
        </section>
        <section className="section">
          <h2>Allowed channels</h2>
          {Object.entries(draft.allowedChannels).length ? (
            Object.entries(draft.allowedChannels).map(([id, name]) => (
              <div className="list-row" key={id}>
                <div>
                  <p>{name || id}</p>
                  <p className="hint">{id}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${name || id}`}
                  onClick={() => {
                    const allowedChannels = { ...draft.allowedChannels };
                    delete allowedChannels[id];
                    change({ allowedChannels });
                  }}
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p>
              No channels allowed yet. Use “Always allow channel” on a hidden
              video.
            </p>
          )}
        </section>
        <section className="section">
          <h2>Local data</h2>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                change({ overrides: {} });
              }}
            >
              Reset {Object.keys(draft.overrides).length} video corrections
            </button>
            <button
              type="button"
              onClick={() => {
                void bridge
                  .clearCache()
                  .then(() => setNotice('Cached scores cleared.'))
                  .catch((cause: unknown) => onError(message(cause)));
              }}
            >
              Clear cached scores
            </button>
            {state.hasKey ? (
              <button
                type="button"
                onClick={() => {
                  setBusy(true);
                  void save({ ...draft, enabled: false, consent: false }, '')
                    .then(() => {
                      setApiKey('');
                      setNotice('API key removed. Filtering is off.');
                    })
                    .catch(() => {})
                    .finally(() => setBusy(false));
                }}
              >
                Remove API key
              </button>
            ) : null}
          </div>
          <p className="hint">
            Scores expire after 7 days. The cache holds up to 500 videos. Video
            corrections take priority over allowed channels.
          </p>
        </section>
        <div className="save-row">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Saving' : 'Save settings'}
          </button>
          {notice ? <p role="status">{notice}</p> : null}
        </div>
      </form>
    </>
  );
}
