# GLOSSARY.md

The core vocabulary of the Muse codebase — enough to read the source and `AGENTS.md`
without getting lost. For the architecture, boot order, and the do-not-break rules, go to
[AGENTS.md](AGENTS.md).

**Mental model.** Muse renders one **preview**: a chosen **font** × **theme** ×
**language**, highlighted by [Shiki](https://shiki.style). Everything selectable is an
**asset** with a stable **id**, sourced either from the repo (`data/*.json`, listed in the
**catalog**) or uploaded at runtime (kept in `localStorage`). A pub/sub **state store** holds
the selection, mirrors it to `localStorage` **and** the **URL hash**, and notifies subscribers
that re-render. That's the whole app.

---

## Core

- **Asset** — anything selectable: a **font**, **theme**, or **language**. Each has a unique
  **id** and shows up as a **pill**.
- **Font / Theme / Language** — the three asset kinds. A theme is **VSCode theme JSON**
  (`colors` + `tokenColors`). A language pairs a manifest with a **sample** code file.
- **Preview** — the rendered code block in the center pane (`renderPreview()` in
  `src/preview.js`). The app's single visual output.

## Identity & data

- **id / canonical id / filename stem** — the one identifier for an asset: the JSON
  **filename stem === the `id` field inside it**, and that id is what lives in the URL hash,
  `localStorage`, and Shiki's registry. `rebuild-index.mjs` enforces the match.
- **Manifest** — the small JSON describing a font or language. Font: `id`, `name`, `stack`,
  optional `cssUrl`/`credits`. Language: `id`, `label`, `shikiLang`,
  `sample`, `summary`. (Themes have no manifest — the theme JSON *is* the asset.)
- **catalog** — the in-memory set of valid ids (`{fonts, themes, languages}`) in `state.js`.
  Every `setState` validates against it; an unknown id falls back to the default (or the
  first catalog entry if the default is missing) with a `console.error`. Runtime
  adds/removes must keep it in sync (`extendCatalog`/`removeFromCatalog`) or a freshly
  uploaded selection bounces back to default.
- **`data/_index.json`** — the catalog **on disk**: the auto-generated list of *repo* asset
  ids, fetched at boot. **Never hand-edit** — `rebuild-index.mjs` / CI regenerate it.

## Where an asset comes from

- **Repo asset** — backed by a committed `data/` file, listed in `_index.json`, travels in
  shared URLs.
- **Runtime asset** — uploaded in-browser, persisted in `localStorage` **only**. A shared URL
  pointing at one falls back to defaults on another device.
- **Built-in theme** — a theme Shiki ships (names in `data/themes/_builtin.json`); available
  with no repo file. A name Shiki doesn't bundle is dropped at boot with a `console.error`. The
  committed repo themes are currently light themes Shiki doesn't ship.
- **Installed / found font** — a font already on the visitor's machine: either auto-detected
  from the `LOCAL_FONTS` list or *found* by the user typing its name. `isFontInstalled`
  (`fonts.js`) checks with a `local()`-only `FontFace` (canvas fallback only when no web face of that
  family is loaded), so web fonts never count. No download
  needed. Found ids keep the real name, except `custom-…` becomes `found-custom-…`.
- **Custom font / theme** — a runtime upload (URL, `@font-face`, or theme JSON). Its id gets a
  **`custom-` prefix** (`slugify()` in `ui/uploaders.js`) so it can't shadow a repo id — repo
  files must never use that prefix (CI rejects them). For themes there are two layers: the
  persisted *custom theme* vs its live in-memory *runtime theme* (`runtimeThemes` /
  `getRuntimeTheme`), registered with Shiki via `loadRuntimeTheme` in `themes.js`.

## State

- **State store** — the pub/sub store in `src/state.js`: `getState` (read a copy), `setState`
  (write + persist + notify), `subscribe` (fires immediately, then on change). Defaults:
  `jetbrains-mono` / `one-dark-pro` / `python`.
- **State precedence** — `URL hash > localStorage > defaults`. On load the hash wins; on
  change, `localStorage` **and** the hash update together.
- **URL hash** — the shareable serialization of the setup. The app writes it via
  `history.replaceState` (no feedback loop); a pasted hash applies live via `hashchange`.
- **localStorage keys** — `muse:state` (selection), `muse:custom-fonts`, `muse:custom-themes`,
  `muse:found-fonts`. All JSON; corrupt data falls back to defaults rather than crashing.

## Rendering

- **Highlighter** — the Shiki instance (`src/themes.js`), created once and reused via the
  cached `getHighlighter()` promise. Loaded from `esm.sh` through a dynamic `import()` so a CDN
  failure surfaces as "Failed to start".
- **Comment-style variant** — the per-theme copy Shiki actually renders with
  (`<id>__muse-comments-italic` / `-normal`, plus a generation suffix after a re-upload), built
  by `ensureCommentStyleTheme` so the "Italic comments" toggle wins over the theme's own rule.
- **Theme name override** — before handing a custom theme to Shiki, do `{ ...raw, name: id }`
  so Shiki, the hash, and `localStorage` agree on the canonical id. **Critical invariant.**
- **Render token / race guard** — `renderToken` in `preview.js`: each render grabs a token and
  bails if a newer one started, so out-of-order async renders never paint.

## UI

- **Pill** — a selectable chip: a font/theme in a **sidebar** (fonts left, themes right) or a
  language in the **lang tabs**. Custom pills are removable (the "×", or Delete on the focused
  pill); `search.js` scores the fuzzy filter and `ui/pill.js` holds the shared pill helpers
  (remove button, search box, roving tabindex — one Tab stop per list — and Arrow/Home/End
  navigation).
- **Uploader dialog** — the *Add Font* / *Add Theme* modals that create runtime assets. Theme
  JSON is checked by `validateTheme()` (`src/theme-validate.mjs`): hex-only colors block CSS
  injection through Shiki's inline styles, and each `tokenColors` rule must be an object with a
  string or string-array `scope`. The same function validates committed repo themes
  in CI.
- **Export** — turns the current setup into a paste-ready VS Code `settings.json` plus the theme
  wrapped as a tiny extension (`ui/export.js`), installed with "Developer: Install Extension
  from Location…". Its comment override uses the same `COMMENT_STYLE_SCOPES` as the preview.

## Build & deploy

- **No-build-step** — plain HTML + vanilla ES modules + JSON. No bundler/tests/linter; Shiki
  loads at runtime from `esm.sh`. Deployed as GitHub Pages from the repo root.
- **`rebuild-index.mjs`** — the only script: validates every asset (ids, required string
  fields, https URLs, sample paths, theme colors) and regenerates `_index.json`. `--check`
  validates without writing (PR CI). Node 18+ (CI runs 24), zero deps, runnable from any
  directory.
- **`.nojekyll`** — the empty root file that stops Jekyll dropping `_`-prefixed files
  (`_index.json`, `_builtin.json`). Without it the app won't boot.

---

*Words live here; the "do not break this" rules live in [AGENTS.md](AGENTS.md) under
**Critical invariants**.*
