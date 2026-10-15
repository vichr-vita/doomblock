# Privacy

Doomblock is a self-contained extension. The project operates no server and receives no user data.

## What leaves your browser

After you save your TypeSafe API key, accept transmission, and enable filtering, the extension sends the titles and channel names of supported recommendations to TypeSafe. It authenticates those requests with your API key. Requests go directly to `https://api.typesafe.ai/v1/systemone` with cookies omitted and no referrer. Like any HTTPS service, TypeSafe also receives network connection information, including your IP address.

Video IDs, channel links, thumbnails, descriptions, cookies, search terms, account details, and watch history are not part of classification requests. The extension does not inspect deliberate search results, subscriptions, channel pages, or Shorts. There is no analytics, advertising, telemetry, or remote executable code.

TypeSafe's processing and retention are governed by its [legal documents](https://docs.typesafe.ai/legal). The MIT license covers Doomblock's code, not TypeSafe's service.

## What stays in your browser

- The API key, stored without encryption in extension-local browser storage.
- Your filtering settings and transmission consent.
- Allowed channel links and names, and video allow/block corrections.
- Classification scores and hashed metadata keys. Cached scores expire after seven days and the cache holds at most 500 entries.

These values are not synchronized through Firefox Sync. The background script uses the API key; content scripts receive only key-presence status and filtering settings. The project does not supply or embed a shared API key.

Expired scores are ignored on reads and removed when subsequent cache writes prune the cache. Settings lets you clear cached scores, reset video corrections, remove channel allowances, or remove the key. Removing the key also disables filtering and revokes the extension's saved transmission consent. Pausing stops new classifications; an already-sent request cannot be recalled. Browser removal of the extension removes its associated local data according to browser behavior.

## Permissions

- **storage:** Saves the local settings, API key, corrections, and bounded cache.
- **Access to `www.youtube.com`:** Reads supported recommendation cards and conceals or restores them.
- **Access to `api.typesafe.ai`:** Makes direct, authenticated classification requests from the background script.

The Firefox manifest declares website content and authentication information transmission. Filtering starts disabled and requires the separate settings opt-in. Host access must remain enabled in the browser's extension permissions for filtering to work.

## Questions

Use [GitHub Issues](https://github.com/vichr-vita/doomblock/issues) for questions or reports. Do not include API keys or private browsing data.
