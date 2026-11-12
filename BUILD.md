# Cavesson site — build and serve notes

Static files only. There is no build step and no server. The live site is
served by nginx from the iMac homelab; previews deploy as a static directory
to Cloudflare Pages (project `cavesson`, `cavesson.pages.dev`).

## Serve locally

From the repo root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/ (landing) and http://localhost:8000/prototype.html
(the interactive Vault dashboard). Any static file server works; pages must be
served over HTTP, not `file://`, because UI SDK loads as ES modules.

## UI SDK

The interface is built with UI SDK (`@ui-sdk/web`, web components) for its
behaviors: keyboard navigation, focus, selection, dismissal, popups, and ARIA.
The runtime is vendored, not loaded from a CDN:

- `assets/ui-sdk/web.js` + `assets/ui-sdk/web/` — prebuilt browser output from
  the published `@ui-sdk/web` package, copied verbatim. `web.js` defines each
  element the first time its tag appears.
- `web.css` (the package's default look) is deliberately NOT vendored:
  Cavesson styles its own components with its own tokens.
- Custom primitives import behaviors from `assets/ui-sdk/web/core.js`.

To regenerate the vendor directory after a version bump:

```sh
npm install
npm run vendor:ui-sdk
```

`npm install` also provides the component docs the builders read
(`node_modules/@ui-sdk/web/docs/llms.txt`, then one page per component) and
the test runner. `node_modules/` is git-ignored; the vendor directory is
committed so both deploy targets work with zero build.

## Tests

```sh
npm test
```

Vitest + jsdom. Wiring tests assert the dashboard's behavior (gate verdicts,
queue actions, append-only receipts) and the landing's navigation. ARIA
pattern checks (`@ui-sdk/core/testing`) cover custom primitives. Anything
with popups, layout, or focus moving between fields is also checked in a
real browser before a preview ships.

## Deploy

Preview (this branch): direct upload of the repo root to Cloudflare Pages
project `cavesson` via the legacy-cloudflare deploy script. The preview URL
is `https://cavesson.pages.dev` (a per-deployment URL is returned). The
custom domain is unbound from the Pages project, so a preview deploy cannot
touch `cavesson.dvaughnhouse.com`.

Live: NEVER deploy a preview branch to the iMac tree (`~/sites/cavesson`).
Live promotion is a separate decision by D'Vaughn.
