# Doomblock

Doomblock filters YouTube recommendations that use fear, outrage, disturbing curiosity, or manipulative clickbait to attract attention. By default, serious criticism, negative facts, and uncomfortable subjects should remain visible. You can customize which topics and styles to hide or keep.

It is a self-contained browser extension for Firefox 142+ and Firefox-based Zen. You supply a TypeSafe API key. The extension calls Jev directly, with no backend to run.

## Install in Zen or Firefox

The initial build is unsigned. You can load it temporarily for personal testing. It is not published on Mozilla Add-ons.

1. Download the Firefox ZIP from [Releases](https://github.com/vichr-vita/doomblock/releases) and extract it, or build it from source below.
2. Open `about:debugging#/runtime/this-firefox` in Zen or Firefox.
3. Select **Load Temporary Add-on** and choose the extracted `manifest.json`. For a source build, choose `.output/firefox-mv3/manifest.json`.
4. Open Doomblock from the browser's extensions menu, then select **Settings**.
5. Paste your [TypeSafe API key](https://console.typesafe.ai), accept the title and channel transmission disclosure, select **Enable filtering**, and save.
6. Open YouTube Home, or reload an existing YouTube tab.

Temporary add-ons unload when the browser restarts. A persistent install requires a [Mozilla-signed build](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/). Signing can use Mozilla's unlisted distribution channel without a public store listing.

## Use the filter

- **Home and suggested videos:** Doomblock checks regular video cards, including cards added during scrolling. Search results, subscriptions, channel pages, and Shorts stay unfiltered.
- **Your filters:** In Settings, enter topics or styles under **Hide videos about**, one preference per line. For example, `Celebrity gossip` or `Crypto price predictions`. Add **Keep exceptions**, such as `Historical documentaries`, to allow matches even when a hide topic or built-in filter matches. You can switch each built-in filter off separately. Save to apply changes to open YouTube tabs. **Reset filters** clears both fields and restores all built-in filters when you save.
- **Sensitivity:** Gentle blocks scores of at least 0.94, Balanced at least 0.85, and Strict at least 0.70 in any category. Scores come from the model. These initial thresholds are not calibrated accuracy guarantees.
- **Show video:** Reveal a hidden or unchecked card and save an allow correction for that video.
- **Always allow channel:** Allow future recommendations with the same channel link. Explicit video corrections take priority.
- **Hide with Doomblock:** Hide an allowed video and remember your correction.
- **Review hidden:** Open the popup's list of hidden videos. Titles stay concealed until you select **Inspect title**.
- **Pause:** Switch filtering off in the popup to restore cards immediately.

The extension normally conceals previews until their scores arrive. If a request fails, those previews stay concealed with an error and recovery actions. You can retry, show a single video, or show all unchecked videos for the current visit. Turn concealment off in Settings if you prefer previews to remain visible while checking.

Only cards near the viewport generate new API requests. Up to three requests run concurrently. The extension retries temporary failures twice, then briefly pauses new requests after errors. Changing sensitivity reuses scores already in the cache.

Keep exceptions use the same sensitivity threshold as hide matches. Explicit video corrections take priority, followed by allowed channels, keep exceptions, then hide rules. Preferences can describe topics as well as how titles attract attention. Decisions use only the title and channel name, so a preference that requires watching the video may not match. Each preference field allows up to 2,000 characters. Changing either field triggers fresh checks; switching built-in filters or sensitivity reuses existing scores. Existing installations retain their settings and start with empty preference fields and all built-in filters enabled.

## Privacy and costs

Classification sends a video's **title and channel name**, along with any **custom filter preferences**, directly to `https://api.typesafe.ai/v1/systemone`, authenticated with your key. It does not send video IDs, thumbnails, YouTube cookies, your search terms, or watch history. TypeSafe bills usage to your account.

Your API key is stored in extension-local browser storage without encryption. It is never included in the source, sent to a developer service, or returned to the content script. The extension has no analytics. See [PRIVACY.md](PRIVACY.md) for permissions and data retention.

## Build and develop

Use Node.js 22+ and pnpm 12.5.1.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm zip
```

The unpacked Firefox extension is in `.output/firefox-mv3`. `pnpm zip` creates the Firefox ZIP and a source ZIP in `.output`.

```sh
pnpm dev             # WXT development session in an isolated Firefox profile
pnpm build:chrome    # Optional Chromium build
pnpm preview:ui      # Test fixture host, not a server needed by the extension
```

WXT's development launcher needs Firefox installed. To use Zen, configure its executable path with WXT's [browser startup options](https://wxt.dev/guide/essentials/config/browser-startup.html), or load the Firefox build manually as described above. Do not point automated development or tests at your everyday browser profile.

## Verify changes

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e
pnpm build
pnpm lint:extension
pnpm format:check
```

CI runs unit tests, production builds, Mozilla validation, and Playwright checks in Chromium, Firefox, and WebKit. The browser fixtures cover both supported card layouts, SPA navigation, reused elements, errors, corrections, and populated UI at 320px, 375px, and 768px. They use synthetic scores and never spend TypeSafe credits. They do not measure real classification accuracy.

On macOS versions affected by [Playwright's Firefox app-data issue](https://github.com/microsoft/playwright/issues/42768), `DOOMBLOCK_FIREFOX_EXECUTABLE` can point to an isolated test-browser launcher. Linux CI uses Playwright's standard Firefox.

Mozilla's linter may flag React DOM's bundled `innerHTML` implementation. Doomblock does not use `dangerouslySetInnerHTML` or insert titles as HTML.

## Implementation

WXT, Vite, strict TypeScript, React, Tailwind, and Effect 4. Effect handles API requests, validated schemas, typed failures, timeouts, retries, and serialized storage writes.

- `src/classifier.ts` defines the TypeSafe contract and questions. The model is pinned to `jev-1.13.0`.
- `src/policy.ts` applies local thresholds and corrections.
- `src/content-controller.ts` manages card lifecycle and page restoration.
- `entrypoints/background.ts` owns API credentials, request concurrency, and caching.
- `src/ui` contains the compact popup and settings.

Scores expire after seven days. The cache holds up to 500 videos, keyed by model, question version, custom preferences, and metadata. Corrections are local rules. They do not retrain Jev. Full descriptions and thumbnails are outside the initial version. YouTube can change its markup, and decisions based only on titles and channel names can be wrong.

Report bugs and proposed improvements in [GitHub Issues](https://github.com/vichr-vita/doomblock/issues). Include the page type and steps to reproduce; never include your API key.

## License

[MIT](LICENSE).
