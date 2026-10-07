# VMuse

**Try it:** https://zhoufanscut.github.io/VMuse/

VMuse lets you preview a coding font, a color theme, and a programming language together, live in the browser. Pick a font, pick a theme, pick a language — and see how the three actually look as a set before you commit to them in your editor.

It's a toy I built for myself, because I kept agonizing over editor fonts and themes and wanted a quick way to try combinations without installing anything. If you find it fun or useful too, that makes me happy.

No build step, no `npm install`, no backend — just HTML, a handful of ES modules, and JSON files. Fonts stream from CDNs, themes render through [Shiki](https://shiki.style), and the whole thing deploys as static files on GitHub Pages.

## What you can do

- **Mix and match** — any font × theme × language combo, rendered instantly.
- **Land on a surprise** — your first visit picks a random font and theme, so you start somewhere you didn't expect. Your choices stick after that.
- **Use fonts you already have** — VMuse checks for ~40 common coding fonts on your machine and lists the ones it finds, no download needed.
- **Add your own font** — paste a CSS URL or an `@font-face` snippet in the *Add Font* dialog. Saved locally, just for you.
- **Add your own theme** — drop in any VSCode theme JSON. Also saved locally.
- **Tweak the details** — size, ligatures, italic comments.
- **Search the sidebars** — fuzzy filter the pills; arrow keys move between them, Delete removes one you added.
- **Share a link** — the URL captures your exact setup; send it and someone else sees the same thing. (Built-in fonts and themes travel; ones you added locally stay on your device.)
- **Export to VSCode** — the *Export* button hands you a ready-to-paste `settings.json` for the setup you landed on, plus the theme wrapped as a tiny extension.

## Add your own (and maybe send a PR)

Everything lives in `data/` as plain JSON. Adding something is just dropping in a file — you never touch shared code, so there's nothing to conflict with. If you make something nice, a PR is welcome but never expected (see [CONTRIBUTING.md](CONTRIBUTING.md)).

### A font — one file

`data/fonts/<id>.json`:

```json
{
  "id": "fira-code",
  "name": "Fira Code",
  "stack": "'Fira Code', monospace",
  "cssUrl": "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap",
  "credits": "https://github.com/tonsky/FiraCode"
}
```

The filename and the `id` field have to match — that's the canonical id used in URLs. Point `cssUrl` at a Google Fonts stylesheet (or a version-pinned CDN one) and ask for italic and bold too when the family has them: `family=X:ital,wght@0,400;0,700;1,400;1,700`. `cssUrl` and `credits` are optional (https URLs).

### A theme — one file

`data/themes/<id>.json` — any standard VSCode theme JSON (the kind with `colors` and `tokenColors`). The filename is the id; the `name` inside the file is just for display and can differ.

Shiki's built-in themes come for free (they're listed in `data/themes/_builtin.json`), so you only need a file for themes Shiki doesn't already ship. The ones committed here happen to be light themes — dark coverage comes from the built-ins.

### A language — two files

A manifest at `data/languages/<id>.json`:

```json
{
  "id": "python",
  "label": "Python",
  "shikiLang": "python",
  "sample": "data/samples/python.txt",
  "summary": "Async ETL pipeline with dataclasses, decorators, and context managers."
}
```

…and the sample code itself at `data/samples/<id>.txt`. `shikiLang` has to be a language [Shiki knows](https://shiki.style/languages) that its [JavaScript regex engine supports](https://shiki.style/references/engine-js-compat) (VMuse doesn't load Oniguruma). A good sample is a small, real program (roughly 50–100 lines) that shows off the language's syntax — not a pile of features glued together.

After adding any file, regenerate the catalog:

```bash
node scripts/rebuild-index.mjs
```

CI does this automatically on push, so in a PR you can skip it — it's just handy locally.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Any static server works; `file://` does **not** (the browser blocks `fetch()` for modules and data). Node 18+ if you want to run the rebuild script (CI uses 24).

## How it's built

`index.html` boots `src/main.js`, which wires up a small pub/sub store, the Shiki highlighter, font loading, and the UI. State syncs to both `localStorage` and the URL hash, and that's the whole thing.

If you want the wiring details — the invariants, the boot order, the gotchas I learned the hard way — they live in [AGENTS.md](AGENTS.md).

## Deploying

It's a static site, so GitHub Pages from the repo root just works. The one requirement is the empty `.nojekyll` file at the root, which stops Jekyll from eating the `_index.json` and `_builtin.json` files. Push to `main`, CI rebuilds the catalog, Pages redeploys.
