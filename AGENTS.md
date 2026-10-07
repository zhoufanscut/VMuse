# AGENTS.md

> **New to the codebase?** Read [GLOSSARY.md](GLOSSARY.md) first — it defines the project's
> vocabulary (asset types, ids, catalog, state, the rendering pipeline). This file then layers
> on the architecture and the **critical invariants** those terms are bound by.

## Project type

VMuse is a **static, no-build-step web app** — plain HTML + vanilla ES modules + JSON data files. No `package.json`, no bundler, no transpiler, no test harness, no linter. Dependencies (Shiki) load at runtime from `esm.sh` CDN. Deployed as **GitHub Pages** from the repo root on `main`.

## Architecture

```
index.html  →  src/main.js (boot orchestrator)
                  ├── state.js           — pub/sub store, localStorage + URL hash sync
                  ├── themes.js          — Shiki highlighter (@4.5.0, esm.sh, JS regex engine), theme registry
                  ├── fonts.js           — CDN font loading, installed-font detection
                  ├── languages.js       — manifest + sample loading, caching
                  ├── preview.js         — render with race-condition guard
                  ├── theme-validate.mjs — theme shape + hex-only color validation (browser AND Node)
                  ├── keys.js            — the localStorage key names
                  ├── util.js            — fetch helpers (HTTP-error-checked JSON/text)
                  ├── style.css          — all styles
                  └── ui/
                      ├── sidebar-fonts.js   — fonts sidebar pills
                      ├── sidebar-themes.js  — themes sidebar pills
                      ├── controls.js        — size slider, ligatures, italic, lang tabs, Export button
                      ├── uploaders.js       — custom font/theme upload dialogs + runtime theme store
                      ├── export.js          — "Use this setup in VS Code" dialog
                      ├── dialog.js          — shared <dialog> chrome + inline SVG icons
                      ├── pill.js            — shared pill helpers: remove "×", search box, roving tabindex, keys
                      └── search.js          — fuzzy scoring

data/
  ├── _index.json          — auto-generated catalog (CI, never edit manually)
  ├── fonts/<id>.json      — font manifests
  ├── themes/<id>.json     — VSCode theme JSONs
  ├── themes/_builtin.json — Shiki built-in theme names
  ├── languages/<id>.json  — language manifests
  └── samples/<id>.txt     — sample code files
```

All imports use relative paths with `./` prefix. All `fetch()` calls use `./` prefix (required for GitHub Pages project sites).

`src/theme-validate.mjs` is the one module shared with Node (`scripts/rebuild-index.mjs` imports it). It uses the `.mjs` extension because there is no `package.json` to declare `"type": "module"`, and Node 18 (the minimum) would otherwise parse it as CommonJS. Keep it free of DOM and Node APIs.

The DOM order in `index.html` is header → language tabs → controls → preview → fonts sidebar → themes sidebar (the reading and Tab order); CSS grid areas place them visually. Don't reorder the markup to match the visual layout.

**`_index.json` vs `_builtin.json`**: `_index.json` only lists **repo** fonts/themes/languages by id. Shiki built-in theme names live separately in `data/themes/_builtin.json` (a string array) and are NOT in `_index.json`. The sidebar merges both lists at runtime. When adding a repo theme, ensure the id doesn't collide with any name in `_builtin.json`. CI only checks that `_builtin.json` is an array of strings; at boot, `getHighlighter` in `src/themes.js` drops names Shiki doesn't bundle (one `console.error`) from the array it is given, so a typo hides that theme instead of stopping the app from starting.

## Local dev

```bash
python3 -m http.server 8000        # serve on localhost:8000
node scripts/rebuild-index.mjs     # regenerate data/_index.json after data changes
node scripts/rebuild-index.mjs --check   # validate-only (no write); prints a ✓ summary on success
```

Node.js 18+ required (CI uses 24). The rebuild script uses only `node:fs`, `node:path`, and `node:url` — zero dependencies.

**Do NOT test with `file://`.** Browsers block `fetch()` for ES modules and data on file protocol.

**Manual verification only.** No test runner exists. Start the HTTP server, open the browser, check the console for errors. The boot overlay displays "Failed to start: …" in red if `_index.json` is missing or malformed.

## Data contribution rules

Adding content is conflict-free by design — you never edit shared files:

| Asset | Files needed | Where |
|-------|-------------|-------|
| Font | 1 file | `data/fonts/<id>.json` |
| Theme | 1 file | `data/themes/<id>.json` |
| Language | 2 files | `data/languages/<id>.json` + `data/samples/<id>.txt` |

**Filename stem = canonical id** — used in URL hash, localStorage, and Shiki theme registration. Font and language manifests carry an `id` field that **must** match the filename; theme JSON has no `id` (its embedded `name` is display-only). Ids are lowercase ASCII letters, digits, and hyphens (`rebuild-index.mjs --check` enforces this).

For PR contribution checklists (screenshot requirements, sample quality bar, etc.), see `CONTRIBUTING.md`.

## Critical invariants

These were learned through multiple bug-fix rounds. Violating any of them causes silent breakage.

### Theme name override
```js
// ALWAYS do this before passing a custom theme to Shiki:
const theme = { ...raw, name: id };
```
The filename stem is canonical. The theme's embedded `name` field is display-only and **may differ**. If you pass the raw `name` to Shiki, URL sharing breaks because localStorage stores the filename-stem id.

### Font loading
```js
// The readiness signal — waits for the font file to be decoded:
await document.fonts.load(`16px 'Font Name'`);
```
The `<link>` `load` event is only the *first* step (`ensureStylesheet` in `src/fonts.js` waits for it so the `@font-face` rules exist), never the readiness signal: it fires when the CSS arrives, not when the font is usable. Re-applying styles after the font loads is unnecessary (the browser swaps the face in itself) and was the source of a bug where the render-time size clobbered slider changes — don't add it back.

The Add Font dialog saves and selects a font only after `loadWebFont` succeeds (15 s timeout). A failed load — or closing the dialog while it loads — puts back the font that was installed under that id before (`installFont(previous)`, else `uninstallFont(id)`) and never touches `localStorage`, so an earlier working upload with the same id survives. Each font id's CSS URL is tracked: removing or re-uploading a URL font removes its `<link>` unless another font still uses that URL.

### State precedence
```
URL hash > localStorage > hardcoded defaults
```
On page load, hash overrides everything. When state changes, **both** `localStorage` and URL hash update simultaneously. `state.js` also listens for `hashchange`, so pasting a shared hash into an open tab applies live — unknown hash keys are ignored, invalid ids fall back to defaults (or to the first catalog entry when the default itself is missing). A `hashchange` that changes nothing (`#lang=go` while already on go, `#foo=bar`, `#`) rewrites the full hash, so a copied link always carries the whole setup. The app's own hash writes use `history.replaceState`, which never fires `hashchange` (no feedback loop).

### Page chrome follows the render guard
`renderPreview` in `src/preview.js` resolves the theme background / light-dark mode early but applies `--theme-bg` and `data-theme` only **after** the `renderToken` check, together with the HTML. Applying them before the guard let a stale render repaint the chrome of a theme the user had already left.

### Re-uploaded themes need new variant names
Shiki caches the active theme by name (`setTheme` is a no-op when the name is unchanged), so re-registering a comment-style variant under the same name keeps tokenizing with the old TextMate theme. `loadRuntimeTheme` in `src/themes.js` bumps a per-id generation that is baked into the variant name; never reuse a variant name after its base theme changed.

The variants restyle every scope in `COMMENT_STYLE_SCOPES` (exported from `src/themes.js`); the VS Code export writes its comment override with the same list, so the preview and the editor agree.

### `.nojekyll`
The root `.nojekyll` file (empty) is **required** for GitHub Pages. Without it, Jekyll drops files starting with `_` (like `_index.json` and `_builtin.json`), and the app fails to boot.

### `data/_index.json` is auto-generated
Never edit it manually. CI regenerates it on push to `main`. The rebuild script reads the filesystem and writes it. Manual edits will be clobbered.

### Index must exist at boot time
`src/main.js` fetches `data/_index.json` on app load. If this file is missing or invalid, the entire app fails with "Failed to start". When adding new assets, run `node scripts/rebuild-index.mjs` before testing.

### Runtime assets (localStorage) vs repo assets
Fonts/themes uploaded at runtime via the UI dialogs persist in `localStorage` **only**. They are NOT backed by repo JSON files. A shared URL referencing a runtime-only asset falls back to defaults on a different device.

**Boot sequence matters:** runtime asset IDs are read from `localStorage` in `src/main.js` *before* `setCatalog()` is called. This ensures `setCatalog()` knows about runtime-only IDs and doesn't clobber state pointing to them during validation. Rearranging this order breaks runtime asset restoration on page reload.

### Shiki version
Pinned to `https://esm.sh/shiki@4.5.0` in `src/themes.js`, loaded through a **dynamic** `import()` that starts at module evaluation. Keep it dynamic: a static import that fails (CDN down) aborts module linking before `main.js` runs, so the boot overlay could never show "Failed to start". Changing the version requires verifying that custom theme loading still works, the theme API hasn't changed (`loadTheme`, `getTheme`, `setTheme` caching by name), and all `shikiLang` values in language manifests are still valid. esm.sh resolves Shiki's own transitive dependencies (`oniguruma-to-es`, `oniguruma-parser`, …) by semver range at request time, so those are not fully pinned.

The highlighter runs the **JavaScript regex engine** (`createJavaScriptRegexEngine()`, a named export of the main entry), not Oniguruma: grammars are converted to native `RegExp`, so no WASM is fetched or compiled. Passing `engine` to `createHighlighter` is what keeps Shiki from importing its default Oniguruma WASM. The engine runs in strict mode (the default): a grammar pattern it cannot convert throws instead of silently mis-highlighting. Every `shikiLang` in the repo was checked against it — HTML byte-identical to Shiki 4.5.0's own Oniguruma output for all built-in themes and samples (output differs from 1.24.0 only through upstream grammar/theme updates). The first render of a large grammar is slower than with Oniguruma (C++ about 1.3 s vs 0.6 s, once per page load). A new language must work with the JS engine too (see `CONTRIBUTING.md`).

Shiki's `normalizeTheme` (in `@shikijs/primitive`) copies the theme's top level but still mutates nested data the caller owns: it reuses the caller's `tokenColors` array as `settings` and unshifts a global rule into it, and rewrites non-hex `editor.foreground`/`editor.background`/`terminal.ansi*` values in the shared `colors` object. It also stamps `type: "dark"` on the normalized copy when the theme omits `type`. `src/themes.js` therefore clones before `loadTheme` and remembers the raw `type` so `isDarkTheme()` can fall back to background luminance for undeclared themes. Use `isDarkTheme(id)` — never read `.type` off a normalized theme. A normalized theme has `settings` (no `tokenColors`), plus Shiki's `fg`, `bg`, `colorReplacements` and, for built-ins, `displayName`; the export strips those.

### Sample path convention
Language manifests store `sample` as a **relative path without `./` prefix** (e.g. `"sample": "data/samples/python.txt"`). The loader (`src/languages.js`) prepends `./` at fetch time. Never include `./` in the manifest's `sample` field — `rebuild-index.mjs --check` rejects anything that doesn't match `data/samples/<file>.txt`.

### Custom theme slug prefix
Runtime-uploaded themes get slugs prefixed with `custom-` (see `slugify()` in `src/ui/uploaders.js`). This distinguishes runtime-only themes from repo themes and prevents accidental filename collisions. Repo themes never use this prefix. Slugs keep Unicode letters/digits, and a name with none at all gets a short hash — no two uploads can collapse onto a bare `custom-` id. A theme without a `name` takes its id from the dropped file's name (while the textarea still holds that file's text), else `theme-<content hash>`. Uploading again under an existing id replaces it (that is how an edited theme is updated), but asks first when the content differs.

Uploaded theme JSON goes through `validateTheme()` (`src/theme-validate.mjs`) **before** registration — hex-only colors, and each `tokenColors` rule a plain object whose `scope` is absent, a string, or an array of strings and whose `settings`, if present, is an object — and a theme is persisted to `localStorage` only after Shiki accepted it. `readStoredCustomThemes()` re-validates on restore, so `main.js` puts an id in the catalog only when `restoreCustom` will actually register it.

### Custom font slug prefix
Runtime-uploaded fonts (URL or `@font-face` via the dialog) also get `custom-`-prefixed ids — `slugify()` computes the id in `src/ui/uploaders.js` and `installFont` honors `spec.id`. This stops a name like "JetBrains Mono" from shadowing the repo `jetbrains-mono` manifest. System/"found" fonts keep their **real** id (no prefix) so they map to the actually-installed font — except an installed name that would slug to `custom-…` ("Custom Mono"), which `checkFontByName` maps to `found-custom-…`. The installed check (`isFontInstalled` in `src/fonts.js`) loads a `FontFace` built only from `local()` sources, so web fonts the page already loaded never count as installed. If no `local()` spelling matches, it falls back to the canvas probe `isFontAvailable`, but only when no web face of that family is on the page. Repo fonts, themes, and languages never use this prefix — `rebuild-index.mjs --check` rejects committed `custom-*` files.

### Content-Security-Policy
`index.html` carries a CSP `<meta>`. `script-src` must keep `https://esm.sh` — Shiki, its grammars, and its themes all load from there through `import()`, and dropping it blocks the Shiki module, so the app shows "Failed to start". Because Shiki uses the JavaScript regex engine, the page needs neither `'wasm-unsafe-eval'` nor `https://esm.sh` in `connect-src` (it stays `'self'`); switching back to the Oniguruma engine would need both again. `style-src`/`font-src` allow any `https:` host so custom fonts from any CDN work; `style-src` needs `'unsafe-inline'` because Shiki emits inline styles. Update the directive list when introducing a new CDN.

### localStorage keys
```
vmuse:state          — current selection (font/theme/lang/size/ligatures/italic)
vmuse:custom-fonts   — array of user-uploaded font objects
vmuse:custom-themes  — array of {id, theme} for user-uploaded VSCode themes
vmuse:found-fonts    — array of fonts detected as installed on this device
```
The names live in `src/keys.js`; import them rather than retyping the strings. All values are JSON. Clearing a key or corrupting it triggers fallback to defaults — the app never crashes on bad localStorage: `vmuse:state` is normalized on load (types checked, `size` clamped to 10–22), and the readers for the other keys drop malformed entries one at a time instead of aborting the whole restore.

## CI

Single workflow: `.github/workflows/rebuild-index.yml`

- **On PR** (job `check`): runs `node scripts/rebuild-index.mjs --check` (validation-only) with a read-only token that is not kept in `.git/config`
- **On push to `main`** (job `rebuild`, the only one with `contents: write`): checks out the branch tip (not the pushed commit), validates + regenerates `data/_index.json` + auto-commits it. A concurrency group runs one at a time per branch.

Node 24; actions are pinned by commit SHA. The workflow only runs when something under `data/` (including a hand edit to `data/_index.json`, push only), the rebuild script, the shared validator, or the workflow itself changed (see its `paths` filter); a code-only push deploys as is. The bot's commit cannot loop: pushes made with `GITHUB_TOKEN` start no workflow runs. Pages deploys on every push to `main`, including the bot's auto-commit. No manual deploy step.

## What doesn't exist

- No tests (no jest, vitest, pytest, etc.)
- No linter (no eslint, prettier, biome)
- No type checker (no TS config)
- No pre-commit hooks
- No Docker/container setup
- No environment variables (purely static frontend)

Manual verification: start the HTTP server, open the browser, check the console for errors.

## State management pattern

Import `state.js` — it's a single pub/sub store:

```js
import { getState, setState, subscribe } from './state.js';

// Read (returns a copy, don't mutate)
const { font, theme, lang, size, ligatures, italic } = getState();

// Write (triggers all subscribers, updates localStorage + URL hash)
setState({ theme: 'dracula' });

// Subscribe (fires immediately, then on every change)
const unsub = subscribe((state) => { /* render */ });
```

Before `setCatalog()` is called during boot, `setState` does NOT validate against available assets. After boot, every `setState` validates: invalid font/theme/lang IDs trigger `console.error` and fall back to the default, or to the first catalog entry when the default is not in the catalog.

Because of that validation, runtime additions/removals must keep the catalog in sync via `extendCatalog('fonts'|'themes', id)` / `removeFromCatalog(...)` — `main.js` does this in its `onFontAdded`/`onThemeAdded` callbacks, the sidebars on pill removal. Selecting a freshly uploaded asset without extending the catalog bounces the selection back to defaults.

Both callbacks take `{ fresh: true }` from the dialogs (an upload the user just made: persist a found font, select the asset) and nothing from `restoreCustom` (boot-time restore: never change the selection). A found font whose id is already shipped (repo or auto-detected) is only selected, never duplicated.

Subscribers receive a **snapshot** (like `getState()`); `main.js` compares consecutive snapshots to take a CSS-only fast path for size/ligature changes when no full render is in flight.

**First-visit randomization**: On the very first visit (no `localStorage` state AND no URL hash), `setCatalog()` picks a random font and theme from the catalog. This is how each new visitor sees a different landing combination. On subsequent visits, the stored or hash-driven selection wins.
