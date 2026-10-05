// muse/state — selection store with localStorage persistence, URL hash sync, and pub/sub

import { STATE_KEY as KEY } from './keys.js';

export const DEFAULTS = Object.freeze({
  font: 'jetbrains-mono',
  theme: 'one-dark-pro',
  lang: 'python',
  size: 14,
  ligatures: true,
  italic: true,
});

// The slider's integer range; every size that reaches state is clamped to it.
const SIZE_MIN = 10;
const SIZE_MAX = 22;

const subs = new Set();

let catalog = null;

// null for anything that isn't a usable size (size=foo, size=, true, {}).
function clampSize(v) {
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
  } else if (typeof v !== 'number') {
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, n)));
}

function parseHash(hash) {
  if (!hash || hash === '#') return null;
  const p = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const out = {};
  for (const [k, v] of p) {
    if (k === 'size') {
      // Guard against a mangled/hand-edited hash: ignore empty/non-numeric
      // values; clamp + round the rest to the slider's integer range.
      const size = clampSize(v);
      if (size != null) out.size = size;
    }
    else if (k === 'liga') out.ligatures = v === '1';
    else if (k === 'italic') out.italic = v === '1';
    // Only known keys: anything else in a hand-edited hash would otherwise
    // leak into state and get persisted to localStorage forever.
    else if (k === 'font' || k === 'theme' || k === 'lang') out[k] = v;
  }
  return out;
}

// Known keys with sane types only. Junk persisted by older versions of
// muse:state (unknown keys, `size: "abc"`, `size: 9999`, `italic: "no"`) would
// otherwise reach the slider and the preview, or be re-persisted forever.
function normalize(s) {
  const out = { ...DEFAULTS };
  for (const k of ['font', 'theme', 'lang']) {
    if (typeof s[k] === 'string' && s[k]) out[k] = s[k];
  }
  const size = clampSize(s.size);
  if (size != null) out.size = size;
  if (typeof s.ligatures === 'boolean') out.ligatures = s.ligatures;
  if (typeof s.italic === 'boolean') out.italic = s.italic;
  return out;
}

let hashRetryTimer = null;

function writeHash(s) {
  const p = new URLSearchParams({
    font: s.font,
    theme: s.theme,
    lang: s.lang,
    size: String(s.size),
    liga: s.ligatures ? '1' : '0',
    italic: s.italic ? '1' : '0',
  });
  const next = '#' + p.toString();
  if (location.hash === next) return;
  try {
    history.replaceState(null, '', next);
  } catch (e) {
    // Safari throws a SecurityError after 100 replaceState calls in 30 s (a
    // long slider drag gets there). Never let that break the subscriber
    // notification that follows; retry once the throttle window has passed so
    // a copied URL isn't left stale.
    console.error(e);
    if (!hashRetryTimer) {
      hashRetryTimer = setTimeout(() => {
        hashRetryTimer = null;
        writeHash(state);
      }, 2000);
    }
  }
}

function load() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {}
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
  return normalize({ ...DEFAULTS, ...stored, ...(parseHash(location.hash) || {}) });
}

// Captured before any write so we can tell a genuine first visit (no saved
// prefs) from a return visit that happens to land on a hashless URL.
let hadStoredState = false;
try { hadStoredState = localStorage.getItem(KEY) != null; } catch {}

let state = load();

// Fall back to the default only when the catalog actually has it; otherwise
// (say python.json failed to load) take the first entry, so state never names
// an id the UI can't show. An empty list keeps the default.
function fallback(list, d) {
  return list.includes(d) ? d : (list[0] ?? d);
}

function validateAgainstCatalog(s) {
  if (!catalog) return s;
  const patched = { ...s };
  for (const [kind, key, label] of [
    ['fonts', 'font', 'font'],
    ['themes', 'theme', 'theme'],
    ['languages', 'lang', 'language'],
  ]) {
    const list = catalog[kind];
    if (!list || list.includes(patched[key])) continue;
    const next = fallback(list, DEFAULTS[key]);
    console.error(`muse: unknown ${label} "${patched[key]}", falling back to "${next}"`);
    patched[key] = next;
  }
  return patched;
}

let persistTimer = null;

function persistNow() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) { console.error(e); }
  writeHash(state);
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 200);
}

// Subscribers get a snapshot, like getState(): the live object is never handed
// out, so no subscriber can mutate the store or observe a later patch early.
function notify() {
  const snapshot = { ...state };
  for (const fn of subs) fn(snapshot);
}

export function setCatalog(c) {
  catalog = c;
  state = validateAgainstCatalog(state);

  if (!hadStoredState && (!location.hash || location.hash === '#')) {
    if (c.fonts && c.fonts.length > 0) {
      state.font = c.fonts[Math.floor(Math.random() * c.fonts.length)];
    }
    if (c.themes && c.themes.length > 0) {
      state.theme = c.themes[Math.floor(Math.random() * c.themes.length)];
    }
  }

  persistNow();
  notify();
}

// Runtime uploads/removals happen after boot; keep the catalog in sync so
// setState validation doesn't bounce freshly added ids back to defaults.
export function extendCatalog(kind, id) {
  if (!catalog || !catalog[kind] || catalog[kind].includes(id)) return;
  catalog[kind].push(id);
}

export function removeFromCatalog(kind, id) {
  if (!catalog || !catalog[kind]) return;
  const i = catalog[kind].indexOf(id);
  if (i >= 0) catalog[kind].splice(i, 1);
}

export function getState() {
  return { ...state };
}

export function setState(patch) {
  state = validateAgainstCatalog(normalize({ ...state, ...patch }));
  // Size fires rapidly during slider drags — debounce its persistence. Every
  // other change persists immediately so a copied URL hash is never stale.
  if (Object.keys(patch).length === 1 && 'size' in patch) schedulePersist();
  else persistNow();
  notify();
}

export function subscribe(fn) {
  subs.add(fn);
  fn({ ...state });
  return () => subs.delete(fn);
}

// Apply live hash edits (pasting a shared #hash into an open tab, or a link
// targeting this tab) without a reload. Our own writes go through
// history.replaceState, which never fires hashchange — no feedback loop.
// A hash that changes nothing (empty, unknown keys only, or a subset matching
// the current selection) still gets the full canonical hash written back, so
// a copied link always carries the whole setup.
window.addEventListener('hashchange', () => {
  const fromHash = parseHash(location.hash);
  const changed = fromHash && Object.keys(fromHash).some(k => fromHash[k] !== state[k]);
  if (changed) setState(fromHash);
  else writeHash(state);
});
