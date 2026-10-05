// muse/themes — the Shiki highlighter and every theme registered with it.

import { fetchJson } from './util.js';

const SHIKI_URL = 'https://esm.sh/shiki@4.5.0';

// Start downloading Shiki immediately, but through a dynamic import so a CDN
// failure rejects a promise the boot orchestrator can catch. A static import
// would fail module linking before main.js ever ran, leaving the boot overlay
// stuck on "Loading highlighter…" with nothing but a console error. The no-op
// catch only stops the browser reporting an unhandled rejection; bootstrap()
// still awaits (and surfaces) the real error.
const shikiModule = import(SHIKI_URL);
shikiModule.catch(() => {});

let highlighterPromise = null;
const langLoads = new Map();      // shikiLang → load promise (in flight or settled)
const themeLoads = new Map();     // repo theme id → in-flight ensureCustomTheme promise
const loadedThemes = new Set();   // ids + comment-style variant names registered with Shiki
const rawTypes = new Map();       // repo/runtime id → the `type` the raw JSON declared (may be undefined)
const variantGen = new Map();     // runtime id → number of re-uploads (see loadRuntimeTheme)

// Every scope the comment-style variants restyle. Exported so the VS Code
// export can apply the same list: themes style comment sub-scopes on their
// own, and a rule on plain `comment` would lose to them.
export const COMMENT_STYLE_SCOPES = [
  'comment',
  'comment.line',
  'comment.line.double-slash',
  'comment.line.number-sign',
  'comment.block',
  'comment.block.documentation',
  'punctuation.definition.comment',
];

async function bootstrap(builtinThemes) {
  const { createHighlighter, createJavaScriptRegexEngine, bundledThemes } = await shikiModule;
  // createHighlighter rejects as a whole on a single unknown name, so one typo
  // in _builtin.json would stop the app from starting. Drop unknown names in
  // place: the caller's array is the list it hands to the catalog and the
  // themes sidebar once the highlighter is ready, so they stay in sync.
  const dropped = builtinThemes.filter(name => !Object.hasOwn(bundledThemes, name));
  if (dropped.length) {
    console.error(`data/themes/_builtin.json: not a Shiki built-in theme, skipped: ${dropped.join(', ')}`);
    const kept = builtinThemes.filter(name => Object.hasOwn(bundledThemes, name));
    builtinThemes.splice(0, builtinThemes.length, ...kept);
  }
  // The JavaScript regex engine converts TextMate grammars to native RegExp, so
  // no Oniguruma WASM is fetched or compiled (the CSP has no
  // 'wasm-unsafe-eval'). Passing `engine` keeps Shiki from ever importing its
  // default Oniguruma engine's WASM. Strict mode (the default) throws on a
  // pattern it cannot convert instead of silently mis-highlighting.
  const h = await createHighlighter({
    themes: builtinThemes,
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  for (const name of builtinThemes) loadedThemes.add(name);
  return h;
}

// The boot orchestrator passes the built-in theme list on the first call;
// every later no-arg call reuses the cached promise. Names Shiki doesn't
// bundle are removed from that array (in place) before the promise resolves.
export function getHighlighter(builtinThemes) {
  if (!highlighterPromise) {
    if (!Array.isArray(builtinThemes)) {
      throw new Error('getHighlighter: the built-in theme list is required on the first call');
    }
    highlighterPromise = bootstrap(builtinThemes);
  }
  return highlighterPromise;
}

// Loads are keyed by id so concurrent callers (the preview and a sidebar pill
// asking for the same theme, two quick renders of a new language) share one
// fetch + registration instead of doing it twice.
export function ensureLang(shikiLang) {
  if (!langLoads.has(shikiLang)) {
    const p = (async () => {
      const h = await getHighlighter();
      await h.loadLanguage(shikiLang);
    })();
    p.catch(() => langLoads.delete(shikiLang));
    langLoads.set(shikiLang, p);
  }
  return langLoads.get(shikiLang);
}

// Register a repo or runtime theme JSON with Shiki under its canonical id.
async function registerTheme(id, raw) {
  const h = await getHighlighter();
  // CRITICAL: the filename stem / upload slug is canonical. Override the
  // embedded "name" so URL state, localStorage, and Shiki all agree on the same
  // id. Clone first: Shiki's normalizeTheme copies only the top level, then
  // reuses the caller's tokenColors array as `settings`, unshifts a global
  // rule into it, and rewrites non-hex editor/terminal colors in the shared
  // `colors` object, which would corrupt the caller's persisted/exported
  // object.
  await h.loadTheme(structuredClone({ ...raw, name: id }));
  rawTypes.set(id, raw.type);
  loadedThemes.add(id);
}

// Repo themes (data/themes/<id>.json), fetched on demand.
export function ensureCustomTheme(id) {
  if (loadedThemes.has(id)) return Promise.resolve();
  if (!themeLoads.has(id)) {
    const p = (async () => {
      const raw = await fetchJson(`./data/themes/${id}.json`);
      await registerTheme(id, raw);
    })();
    p.finally(() => themeLoads.delete(id)).catch(() => {});
    themeLoads.set(id, p);
  }
  return themeLoads.get(id);
}

// Runtime (uploaded) themes: register, or replace on re-upload.
export async function loadRuntimeTheme(id, raw) {
  const replacing = loadedThemes.has(id);
  await registerTheme(id, raw);
  if (!replacing) return;
  // Shiki caches the active theme by *name* (setTheme skips re-registration
  // when the name is unchanged), so rebuilding a comment-style variant under
  // its old name would keep tokenizing with the stale TextMate theme while the
  // <pre> background came from the new one. Bump the generation so the next
  // render builds variants under fresh names.
  variantGen.set(id, (variantGen.get(id) || 0) + 1);
}

function variantName(id, italic) {
  const gen = variantGen.get(id) || 0;
  return `${id}__muse-comments-${italic ? 'italic' : 'normal'}${gen ? `-${gen}` : ''}`;
}

export async function ensureCommentStyleTheme(id, italic) {
  const variant = variantName(id, italic);
  if (loadedThemes.has(variant)) return variant;

  if (!loadedThemes.has(id)) {
    await ensureCustomTheme(id);
  }

  const base = await getKnownTheme(id);
  const theme = withCommentStyle(base, variant, italic);
  const h = await getHighlighter();
  await h.loadTheme(theme);
  loadedThemes.add(variant);
  return variant;
}

function withCommentStyle(base, name, italic) {
  const theme = { ...base, name };
  const commentRule = {
    scope: COMMENT_STYLE_SCOPES,
    settings: { fontStyle: italic ? 'italic' : '' },
  };

  if (Array.isArray(base.tokenColors)) {
    theme.tokenColors = cloneThemeRules(base.tokenColors).concat(commentRule);
  }
  if (Array.isArray(base.settings)) {
    theme.settings = cloneThemeRules(base.settings).concat(commentRule);
  }
  if (!Array.isArray(theme.tokenColors) && !Array.isArray(theme.settings)) {
    theme.tokenColors = [commentRule];
  }

  return theme;
}

function cloneThemeRules(rules) {
  return rules.map(rule => ({
    ...rule,
    settings: rule.settings ? { ...rule.settings } : rule.settings,
  }));
}

export async function highlight(code, lang, theme) {
  await ensureLang(lang);
  // Caller is responsible for awaiting ensureCustomTheme(theme) when theme is custom.
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang, theme });
}

// Shiki's normalized theme object; throws if `name` was never registered.
export async function getKnownTheme(name) {
  const h = await getHighlighter();
  return h.getTheme(name);
}

export function isThemeLoaded(id) { return loadedThemes.has(id); }

// Perceived-luminance check on a hex color (#rgb, #rgba, #rrggbb, #rrggbbaa).
// Anything unparsable counts as dark, the app's own chrome.
export function isDarkColor(hex) {
  if (typeof hex !== 'string') return true;
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return true;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// Whether a registered theme is dark. Shiki's normalizeTheme stamps
// `type: "dark"` on any theme that omits it, so for repo/runtime JSON the
// declared type is trusted only when the raw file actually declared one;
// otherwise the editor background decides. Built-ins always declare a type.
export async function isDarkTheme(id) {
  const theme = await getKnownTheme(id);
  if (!theme) return true;
  if (!rawTypes.has(id)) return theme.type !== 'light';
  const declared = rawTypes.get(id);
  if (declared === 'light' || declared === 'dark') return declared === 'dark';
  return isDarkColor(theme.bg);
}
