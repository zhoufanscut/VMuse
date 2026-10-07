import { fetchJson } from './util.js';
import { CUSTOM_FONTS_KEY, FOUND_FONTS_KEY } from './keys.js';

const LOCAL_FONTS = [
  // macOS system
  { id: 'menlo', name: 'Menlo' },
  { id: 'monaco', name: 'Monaco' },
  { id: 'sf-mono', name: 'SF Mono' },
  // Windows system
  { id: 'consolas', name: 'Consolas' },
  { id: 'courier-new', name: 'Courier New' },
  // Linux system
  { id: 'dejavu-sans-mono', name: 'DejaVu Sans Mono' },
  { id: 'liberation-mono', name: 'Liberation Mono' },
  // Common on multiple platforms
  { id: 'andale-mono', name: 'Andale Mono' },
  { id: 'pt-mono', name: 'PT Mono' },
  // Popular manually-installed coding fonts
  { id: 'jetbrains-mono', name: 'JetBrains Mono' },
  { id: 'fira-code', name: 'Fira Code' },
  { id: 'cascadia-code', name: 'Cascadia Code' },
  { id: 'cascadia-mono', name: 'Cascadia Mono' },
  { id: 'source-code-pro', name: 'Source Code Pro' },
  { id: 'hack', name: 'Hack' },
  { id: 'iosevka', name: 'Iosevka' },
  { id: 'ubuntu-mono', name: 'Ubuntu Mono' },
  { id: 'inconsolata', name: 'Inconsolata' },
  { id: 'droid-sans-mono', name: 'Droid Sans Mono' },
  { id: 'noto-sans-mono', name: 'Noto Sans Mono' },
  { id: 'roboto-mono', name: 'Roboto Mono' },
  { id: 'ibm-plex-mono', name: 'IBM Plex Mono' },
  { id: 'anonymous-pro', name: 'Anonymous Pro' },
  { id: 'victor-mono', name: 'Victor Mono' },
  { id: 'fantasque-sans-mono', name: 'Fantasque Sans Mono' },
  { id: 'monoid', name: 'Monoid' },
  { id: 'fira-mono', name: 'Fira Mono' },
  { id: 'cousine', name: 'Cousine' },
  { id: 'oxygen-mono', name: 'Oxygen Mono' },
  { id: 'space-mono', name: 'Space Mono' },
  { id: 'cutive-mono', name: 'Cutive Mono' },
  { id: 'nova-mono', name: 'Nova Mono' },
  { id: 'overpass-mono', name: 'Overpass Mono' },
  { id: 'share-tech-mono', name: 'Share Tech Mono' },
  { id: 'major-mono-display', name: 'Major Mono Display' },
  // Premium / niche coding fonts
  { id: 'input-mono', name: 'Input Mono' },
  { id: 'dank-mono', name: 'Dank Mono' },
  { id: 'operator-mono', name: 'Operator Mono' },
  // CJK monospace
  { id: 'sarasa-mono-sc', name: 'Sarasa Mono SC' },
  { id: 'lxgw-wenkai-mono', name: 'LXGW WenKai Mono' },
  { id: 'maple-mono', name: 'Maple Mono' },
];

const stylesheetPromises = new Map();
const fontPromises = new Map();
const fontFaceStyles = new Map(); // font id → <style> holding its pasted @font-face rules
const fontStylesheets = new Map(); // font id → the CSS URL it loads from
const installedSpecs = new Map(); // custom font id → the spec installFont last applied

// Quote a family name for CSS (font-family stacks, ctx.font, document.fonts.load).
// An unescaped quote in a name would make the whole declaration invalid, which
// the CSSOM silently drops.
function cssFamily(name) {
  return `'${String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function fontStack(name) {
  return `${cssFamily(name)}, monospace`;
}

// Id derivation for fonts that predate `custom-` prefixes / stored ids.
export function legacyFontId(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, '-');
}

function findStylesheet(cssUrl) {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(link => link.getAttribute('href') === cssUrl || link.href === cssUrl);
}

// NOTE: a CSS URL loads as a full stylesheet, so unlike the @font-face paste
// path (sanitizeFontFace) it may carry rules beyond @font-face. That is
// deliberate: the URL never leaves the device, `connect-src` rules out a
// fetch-and-sanitize, and the only page it can restyle is the pasting user's.
function ensureStylesheet(cssUrl) {
  if (!cssUrl) return Promise.resolve(true);
  if (stylesheetPromises.has(cssUrl)) return stylesheetPromises.get(cssUrl);

  let link = findStylesheet(cssUrl);
  const promise = new Promise((resolve) => {
    const markReady = () => {
      link.dataset.vmuseFontStylesheetReady = 'true';
      resolve(true);
    };
    const markFailed = () => {
      stylesheetPromises.delete(cssUrl);
      // Drop the dead <link>: its error event has already fired, so a retry
      // must inject a fresh element — re-listening on this one never settles.
      link.remove();
      resolve(false);
    };

    if (link?.dataset.vmuseFontStylesheetReady === 'true' || link?.sheet) {
      markReady();
      return;
    }

    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
    }

    link.addEventListener('load', markReady, { once: true });
    link.addEventListener('error', markFailed, { once: true });

    if (!link.isConnected) document.head.appendChild(link);
  });

  stylesheetPromises.set(cssUrl, promise);
  return promise;
}

// Does any tracked font still load `cssUrl`?
function stylesheetInUse(cssUrl) {
  for (const url of fontStylesheets.values()) {
    if (url === cssUrl) return true;
  }
  return false;
}

// Drop a font id's web source (its pasted <style>, or its CSS <link> unless
// another font still loads that URL), so a removed or re-uploaded font can't
// keep an old face live until reload.
function releaseFontSources(id) {
  fontFaceStyles.get(id)?.remove();
  fontFaceStyles.delete(id);

  const cssUrl = fontStylesheets.get(id);
  fontStylesheets.delete(id);
  if (!cssUrl || stylesheetInUse(cssUrl)) return;
  const link = findStylesheet(cssUrl);
  // A <link> removed mid-load fires neither load nor error, which would hang
  // its pending promise; failing it settles that promise and removes the link.
  if (link && link.dataset.vmuseFontStylesheetReady !== 'true') link.dispatchEvent(new Event('error'));
  link?.remove();
  stylesheetPromises.delete(cssUrl);
  for (const key of fontPromises.keys()) {
    if (key.startsWith(`url:${cssUrl}::`)) fontPromises.delete(key);
  }
}

// Font loading requires TWO waits when injecting a new stylesheet:
// 1. Wait for the CSS <link> to load — @font-face must be registered before
//    document.fonts.load() can find and wait for the font.
// 2. Then wait for the font file itself to be decoded. The second wait is the
//    important readiness signal; link load only means the @font-face CSS arrived.
export async function loadWebFont(font) {
  if (!font?.name) return false;

  // Key by source, not just name: an installed "Foo" and a pasted @font-face
  // "Foo" must not share a cached result, and re-pasting a *changed*
  // @font-face under the same display name must bypass the old entry.
  const key = font.cssUrl ? `url:${font.cssUrl}::${font.name}`
    : font.fontFaceCss ? `css:${font.fontFaceCss}::${font.name}`
    : `local::${font.name}`;
  if (fontPromises.has(key)) return fontPromises.get(key);

  // Count a repo font as a user of its stylesheet, so removing an upload with
  // the same URL leaves the repo font's <link> in place. Custom fonts are
  // tracked by installFont, which owns their (possibly re-uploaded) source.
  if (font.cssUrl && font.id && !fontStylesheets.has(font.id)) {
    fontStylesheets.set(font.id, font.cssUrl);
  }

  const promise = (async () => {
    if (font.cssUrl) {
      const cssReady = await ensureStylesheet(font.cssUrl);
      if (!cssReady) {
        fontPromises.delete(key);
        return false;
      }
    }

    // document.fonts.load waits for the actual decoded font, unlike <link> load.
    // It resolves with the faces that matched — empty means no @font-face matched
    // the name (e.g. display name ≠ family in the CSS). System fonts legitimately
    // match nothing, so only web-sourced fonts require a match.
    const faces = await document.fonts.load(`16px ${cssFamily(font.name)}`);
    const ok = (font.cssUrl || font.fontFaceCss) ? faces.length > 0 : true;
    // A name mismatch can be fixed by re-uploading under the same display
    // name — don't pin the failure for the whole session.
    if (!ok) fontPromises.delete(key);
    return ok;
  })().catch(() => {
    fontPromises.delete(key);
    return false;
  });

  fontPromises.set(key, promise);
  return promise;
}

// Canvas trick: compare 16px serif baseline against 16px <candidate>, serif.
// If widths match, the candidate font is NOT installed. The canvas also sees
// web fonts loaded into this page, so it can only answer for a name with no
// web source loaded — prefer isFontInstalled for a real OS-install check.
let probeCtx = null;
export function isFontAvailable(fontName) {
  if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
  const ctx = probeCtx;
  const testStr = 'abcdefghijklmnopqrstuvwxyz0123456789';
  ctx.font = '16px serif';
  const fallbackWidth = ctx.measureText(testStr).width;
  ctx.font = `16px ${cssFamily(fontName)}, serif`;
  return ctx.measureText(testStr).width !== fallbackWidth;
}

// Is `fontName` installed on this OS? A FontFace built from local() sources
// only ever matches OS fonts, never the page's own @font-face faces, so a web
// font loaded for the preview can't pass for an install. local() matches a
// face's full or PostScript name, not its family name, so the regular face's
// usual spellings are tried too ("Menlo Regular", "Menlo-Regular"). A font
// whose regular face is named otherwise ("Foo Book") falls back to the canvas
// check, which is safe only while no web face of that family is on the page.
let probeSeq = 0;
export async function isFontInstalled(fontName) {
  const name = String(fontName).trim();
  if (!name) return false;
  const compact = name.replace(/\s+/g, '');
  const candidates = [...new Set([name, `${name} Regular`, `${compact}-Regular`, compact])];
  const src = candidates.map(c => `local(${cssFamily(c)})`).join(', ');
  try {
    // Never added to document.fonts, so the probe can't affect rendering.
    await new FontFace(`vmuse-probe-${++probeSeq}`, src).load();
    return true;
  } catch {
    const lower = name.toLowerCase();
    const hasWebFace = [...document.fonts].some(
      f => f.family.replace(/^["']|["']$/g, '').toLowerCase() === lower,
    );
    return !hasWebFace && isFontAvailable(name);
  }
}

function isFontManifest(m) {
  return !!m && typeof m === 'object'
    && typeof m.id === 'string' && m.id
    && typeof m.name === 'string' && m.name
    && typeof m.stack === 'string' && m.stack
    && (m.cssUrl == null || typeof m.cssUrl === 'string');
}

// Manifests are fetched in parallel. A missing/malformed one is dropped with a
// console.error — it must never take the whole app down.
export async function loadFontManifests(ids) {
  const settled = await Promise.allSettled(
    ids.map(id => fetchJson(`./data/fonts/${id}.json`)),
  );
  const results = [];
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(r.reason);
    } else if (!isFontManifest(r.value)) {
      console.error(`vmuse: ignoring malformed manifest data/fonts/${ids[i]}.json`);
    } else {
      results.push(r.value);
    }
  });
  return results;
}

export async function detectInstalledFonts() {
  const found = await Promise.all(LOCAL_FONTS.map(f => isFontInstalled(f.name)));
  return LOCAL_FONTS
    .filter((_, i) => found[i])
    .map((f) => ({ ...f, stack: fontStack(f.name), cssUrl: null, installed: true }));
}

// Keep ONLY @font-face rules from pasted CSS. Constructable stylesheets ignore
// @import, and every non-@font-face rule (selectors, background hacks) is dropped,
// so a paste can't smuggle tracking or layout CSS into the page. '' = nothing valid.
export function sanitizeFontFace(css) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return Array.from(sheet.cssRules)
      .filter((r) => r instanceof CSSFontFaceRule)
      .map((r) => r.cssText)
      .join('\n');
  } catch {
    return '';
  }
}

export function installFont(spec) {
  if (!spec || typeof spec.name !== 'string' || !spec.name.trim()) {
    throw new Error('font spec needs a name');
  }
  const id = spec.id || legacyFontId(spec.name);

  // Replace, don't pile up: a re-upload under the same id must not leave the
  // old source (pasted rules or CSS URL) competing with the new one.
  // An unchanged URL keeps its <link>, so the face doesn't blink out meanwhile.
  if (!spec.cssUrl || fontStylesheets.get(id) !== spec.cssUrl) releaseFontSources(id);

  if (spec.cssUrl) {
    // Inject via ensureStylesheet so load/error listeners attach at birth: a
    // bare <link> that failed would hang later loadWebFont calls forever.
    fontStylesheets.set(id, spec.cssUrl);
    ensureStylesheet(spec.cssUrl);
  } else if (spec.fontFaceCss) {
    const style = document.createElement('style');
    style.textContent = spec.fontFaceCss;
    document.head.appendChild(style);
    fontFaceStyles.set(id, style);
  }

  const font = {
    id,
    name: spec.name,
    stack: fontStack(spec.name),
    cssUrl: spec.cssUrl || null,
    fontFaceCss: spec.fontFaceCss || null,
    installed: !!spec.installed,
  };
  installedSpecs.set(id, font);
  return font;
}

// The spec installFont last applied for `id` (a restored or uploaded font), so
// a failed re-upload can put the working one back.
export function getInstalledFont(id) {
  return installedSpecs.get(id) || null;
}

// Undo installFont for `id` in this page only; localStorage is untouched.
export function uninstallFont(id) {
  releaseFontSources(id);
  installedSpecs.delete(id);
}

function readJsonArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

// Validated specs from vmuse:custom-fonts. Malformed entries are dropped with a
// console.error instead of aborting the whole restore; entries stored before
// ids were persisted get the legacy name-derived id.
export function readStoredCustomFonts() {
  const out = [];
  for (const entry of readJsonArray(CUSTOM_FONTS_KEY)) {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name.trim()) {
      console.error('vmuse: dropping malformed stored font', entry);
      continue;
    }
    const id = typeof entry.id === 'string' && entry.id ? entry.id : legacyFontId(entry.name);
    out.push({ ...entry, id });
  }
  return out;
}

// Persist an installed font (installFont's result) to vmuse:custom-fonts. The
// upload dialog calls it only after loadWebFont confirmed the font works, so a
// broken upload never replaces a working one in storage. Returns false when
// localStorage refused the write.
export function saveCustomFont(fontObject) {
  try {
    const existing = readStoredCustomFonts();
    // Replace on re-upload (same id) so the stored spec can't go stale.
    const idx = existing.findIndex(f => f.id === fontObject.id);
    if (idx >= 0) existing[idx] = fontObject;
    else existing.push(fontObject);
    localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(existing));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function removeCustomFont(id) {
  uninstallFont(id);
  try {
    const existing = readJsonArray(CUSTOM_FONTS_KEY);
    localStorage.setItem(
      CUSTOM_FONTS_KEY,
      JSON.stringify(existing.filter(f => f?.id !== id)),
    );
  } catch (e) {
    console.error(e);
  }
}

// Probe only — persisting is a separate step (persistFoundFont) so that
// checking a name in the dialog and then cancelling leaves nothing behind.
// Resolves to null when the font is not installed.
export async function checkFontByName(fontName) {
  if (!fontName || typeof fontName !== 'string') return null;
  const trimmed = fontName.trim();
  if (!trimmed) return null;

  if (!(await isFontInstalled(trimmed))) return null;

  // `custom-` ids belong to dialog uploads (vmuse:custom-fonts). An installed
  // "Custom Mono" must not land there: it would skip persisting, shadow an
  // upload's pill, and removing it would delete the stored upload.
  let id = legacyFontId(trimmed);
  if (id.startsWith('custom-')) id = `found-${id}`;

  return {
    id,
    name: trimmed,
    stack: fontStack(trimmed),
    cssUrl: null,
    installed: true,
  };
}

export function persistFoundFont(font) {
  try {
    const existing = readJsonArray(FOUND_FONTS_KEY);
    if (!existing.find(f => f?.id === font.id)) {
      existing.push({ id: font.id, name: font.name, stack: font.stack, cssUrl: null, installed: true });
      localStorage.setItem(FOUND_FONTS_KEY, JSON.stringify(existing));
    }
  } catch (e) {
    console.error(e);
  }
}

export function restoreFoundFonts() {
  return readJsonArray(FOUND_FONTS_KEY)
    .filter(f => f && typeof f.id === 'string' && f.id && typeof f.name === 'string' && f.name)
    .map(f => ({ id: f.id, name: f.name, stack: fontStack(f.name), cssUrl: null, installed: true }));
}

export function removeFoundFont(id) {
  try {
    const existing = readJsonArray(FOUND_FONTS_KEY);
    localStorage.setItem(
      FOUND_FONTS_KEY,
      JSON.stringify(existing.filter(f => f?.id !== id)),
    );
  } catch (e) {
    console.error(e);
  }
}
