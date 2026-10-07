# Contributing

VMuse is a toy I built for fun, so please read this as "here's how, if you feel like it" rather than a process to follow. There's no roadmap and no obligation. If you add a font, theme, or language you like, I'd be glad to see a PR — and just as glad if you fork it and keep the changes to yourself.

The nice part of the data layout: every contribution is a new file in `data/`. You never edit shared files, so PRs basically can't conflict.

## The gist

**Font** — add `data/fonts/<id>.json`. Check that the `cssUrl` actually loads (try it in a private window), that the `id` matches the filename, and that the font is something you're allowed to share (a `credits` link is nice). On Google Fonts, ask for italic and bold when the family has them (`family=X:ital,wght@0,400;0,700;1,400;1,700&display=swap`); on other CDNs, pin a version (`@fontsource/x@5.3.0/…`).

**Theme** — add `data/themes/<id>.json`, any valid VSCode theme JSON with hex colors only (VMuse writes them into inline styles, so CI rejects anything else) and, ideally, a `"type": "light"` or `"dark"`. A screenshot in the PR helps me see what it looks like. The filename id shouldn't collide with a Shiki built-in theme name. Only add a theme whose license allows sharing it, and add its entry to [`data/themes/LICENSES.md`](data/themes/LICENSES.md) in the same PR: the upstream URL pinned to a commit, the copyright line, the license (full text, or a link for GPL-family ones), and whether you changed the file and how.

**Language** — add `data/languages/<id>.json` plus `data/samples/<id>.txt`. Keep the sample a small, self-contained, real-looking program (~50–100 lines) that tokenizes cleanly, and make `shikiLang` a real Shiki language id. VMuse highlights with Shiki's JavaScript regex engine (no Oniguruma), so the grammar must be supported there too: check it is listed as OK in Shiki's [JS engine compatibility table](https://shiki.style/references/engine-js-compat), then serve the site locally, pick your language, and make sure the preview renders with no errors in the browser console.

One small reserved-word note: ids starting with `custom-` belong to the in-browser uploader, so don't use that prefix for committed files.

## CI

You don't have to run anything — every PR runs `node scripts/rebuild-index.mjs --check` to make sure the files are shaped right, and the catalog regenerates itself once things land on `main`. If you'd rather check locally first:

```bash
node scripts/rebuild-index.mjs --check
```

That's it. Thanks for taking a look.
