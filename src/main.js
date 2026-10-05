// muse/main — boot orchestrator

import { getState, setState, subscribe, setCatalog, extendCatalog } from './state.js';
import { getHighlighter, getKnownTheme } from './themes.js';
import { fetchJson } from './util.js';
import {
  loadFontManifests, detectInstalledFonts, restoreFoundFonts, persistFoundFont,
  readStoredCustomFonts,
} from './fonts.js';
import { loadLanguageManifests } from './languages.js';
import { renderPreview, applyPreviewStyle } from './preview.js';
import { mountFontsSidebar } from './ui/sidebar-fonts.js';
import { mountThemesSidebar } from './ui/sidebar-themes.js';
import { mountControls } from './ui/controls.js';
import { mountUploaders, restoreCustom, getRuntimeTheme, readStoredCustomThemes } from './ui/uploaders.js';
import { showExportDialog } from './ui/export.js';

function failBoot(message) {
  const overlay = document.getElementById('boot-overlay');
  if (overlay) {
    overlay.textContent = `Failed to start: ${message}`;
    overlay.classList.add('is-error');
  }
}

try {
  // Fetch the built-in theme list once and hand it to the highlighter; later
  // no-arg getHighlighter() calls reuse the cached promise.
  const builtinThemeIds = await fetchJson('./data/themes/_builtin.json');
  if (!Array.isArray(builtinThemeIds) || !builtinThemeIds.every(s => typeof s === 'string')) {
    throw new Error('data/themes/_builtin.json must be an array of theme names');
  }
  const builtinThemes = new Set(builtinThemeIds);

  // Start Shiki (module + theme bundles from esm.sh) alongside the catalog
  // fetches: nothing below needs the highlighter until the sidebars mount. The
  // no-op catch only keeps an index-fetch failure from also surfacing this
  // promise as "unhandled"; it is awaited (and its error reported) below.
  const highlighterReady = getHighlighter(builtinThemeIds);
  highlighterReady.catch(() => {});
  // The installed-font probe is async (local() font loads) and independent of
  // everything else; it never rejects.
  const installedFontsReady = detectInstalledFonts();

  const index = await fetchJson('./data/_index.json', { cache: 'no-store' });
  if (!index || typeof index !== 'object' ||
      !['fonts', 'themes', 'languages'].every(k => Array.isArray(index[k]) && index[k].every(id => typeof id === 'string'))) {
    throw new Error('data/_index.json is malformed — run `node scripts/rebuild-index.mjs`');
  }

  const [fontManifests, langManifests] = await Promise.all([
    loadFontManifests(index.fonts),
    loadLanguageManifests(index.languages),
  ]);
  if (langManifests.length === 0) {
    throw new Error('no language manifests could be loaded (see console)');
  }

  await highlighterReady;

  const installedFonts = await installedFontsReady;
  const manifestIds = new Set(fontManifests.map(f => f.id));
  const foundFonts = restoreFoundFonts();
  for (const f of foundFonts) {
    // A found font is only "user-added" (removable) when no shipped source
    // already covers its id: not auto-detected from the hardcoded probe list,
    // and not a repo manifest. A shipped match supplies its own non-removable
    // pill and reappears on reload regardless, so a removable found-shadow would
    // both violate "shipped fonts stay" and be pointless to delete.
    if (installedFonts.some(inst => inst.id === f.id) || manifestIds.has(f.id)) continue;
    installedFonts.push({ ...f, userAdded: true });
  }
  const allFonts = [...installedFonts, ...fontManifests];

  function rememberFont(font) {
    if (!font) return font;
    const idx = allFonts.findIndex(f => f.id === font.id);
    if (idx >= 0) allFonts[idx] = font; // re-upload: refresh the stored spec
    else allFonts.push(font);
    return font;
  }

  // Both uploader callbacks: register the id with the state catalog first, or
  // setState validation would bounce the new selection to defaults. `fresh`
  // marks an upload the user just made in a dialog (vs. a boot-time restore):
  // it is selected right away. A re-upload of the *selected* asset needs the
  // same self-setState to force a re-render — the pill and the catalog entry
  // already exist, so nothing else would trigger one (setState notifies
  // subscribers even when the value is unchanged).
  // Found fonts never carry a custom- id (checkFontByName maps an installed
  // "Custom …" to found-custom-…), so a custom- id is always a dialog upload.
  function onFontAdded(font, { fresh = false } = {}) {
    if (font.userAdded && !font.id.startsWith('custom-')) {
      // The Installed tab can name a font Muse already lists (a repo font or an
      // auto-detected one). Don't shadow that pill or persist a duplicate.
      const shipped = allFonts.find(f => f.id === font.id && !f.userAdded);
      if (shipped) {
        if (fresh) setState({ font: shipped.id });
        return;
      }
      if (fresh) persistFoundFont(font);
    }
    extendCatalog('fonts', font.id);
    fontsSidebar.addCustomFontPill(rememberFont(font));
    if (fresh || getState().font === font.id) setState({ font: font.id });
  }
  function onThemeAdded({ id }, { fresh = false } = {}) {
    extendCatalog('themes', id);
    themesSidebar.addCustomThemePill(id);
    if (fresh || getState().theme === id) setState({ theme: id });
  }

  // Read runtime-uploaded ids from localStorage BEFORE setCatalog validates state.
  // Otherwise, state.theme / state.font pointing to a runtime asset gets clobbered
  // to DEFAULTS before restoreCustom has a chance to register them. The readers
  // validate entries, so an id only lands in the catalog if restoreCustom will
  // actually register it.
  const runtimeFontIds = readStoredCustomFonts().map(f => f.id);
  const runtimeThemeIds = readStoredCustomThemes().map(t => t.id);

  setCatalog({
    fonts: [
      ...fontManifests.map(f => f.id),
      ...installedFonts.map(f => f.id),
      ...runtimeFontIds,
    ],
    themes: [...builtinThemeIds, ...index.themes, ...runtimeThemeIds],
    languages: langManifests.map(l => l.id),
  });

  const sidebarFonts = document.querySelector('.sidebar-fonts');
  const sidebarThemes = document.querySelector('.sidebar-themes');
  const controlsBar = document.querySelector('.controls-bar');
  const langTabs = document.querySelector('.lang-tabs');
  const previewPane = document.querySelector('.preview-pane');

  const fontsSidebar = mountFontsSidebar({ container: sidebarFonts, manifests: fontManifests, installedFonts });

  const themesSidebar = mountThemesSidebar({
    container: sidebarThemes,
    themes: [...builtinThemeIds, ...index.themes],
  });

  mountControls({
    controlsBar,
    langTabsContainer: langTabs,
    langManifests,
    previewId: previewPane.id,
    onExport: () => showExportDialog({
      font: currentFontManifest(),
      state: getState(),
      resolveThemeJson,
    }),
  });

  mountUploaders({
    addFontBtn: document.getElementById('add-font-btn'),
    addThemeBtn: document.getElementById('add-theme-btn'),
    onFontAdded,
    onThemeAdded,
  });

  await restoreCustom({ onFontAdded, onThemeAdded });

  function currentLangManifest() {
    const state = getState();
    return langManifests.find(m => m.id === state.lang) || langManifests[0];
  }

  function currentFontManifest() {
    const state = getState();
    return allFonts.find(f => f.id === state.font) || allFonts[0];
  }

  // Best available source for a theme's JSON: a runtime upload, the original
  // repo file (highest fidelity), or Shiki's normalized built-in.
  async function resolveThemeJson(id) {
    const runtime = getRuntimeTheme(id);
    if (runtime) return runtime;
    if (index.themes.includes(id)) {
      try { return await fetchJson(`./data/themes/${id}.json`); } catch (e) { console.error(e); }
    }
    return getKnownTheme(id);
  }

  let booted = false;
  let prev = null;
  let inFlight = 0;

  subscribe(async (s) => {
    // CSS-only fast path: when nothing but size/ligatures changed and no full
    // render is in flight, restyle the existing DOM instead of re-tokenizing.
    // A render in flight finishes by applying its own captured size, so any
    // change made meanwhile must go through a full render that supersedes it.
    if (booted && inFlight === 0 && prev &&
        s.font === prev.font && s.theme === prev.theme &&
        s.lang === prev.lang && s.italic === prev.italic &&
        (s.size !== prev.size || s.ligatures !== prev.ligatures)) {
      applyPreviewStyle(previewPane, s);
      prev = s;
      return;
    }
    prev = s;

    inFlight++;
    try {
      await renderPreview({
        font: currentFontManifest(),
        theme: s.theme,
        lang: s.lang,
        langManifest: currentLangManifest(),
        size: s.size,
        ligatures: s.ligatures,
        italic: s.italic,
        container: previewPane,
        builtinThemes,
      });
    } catch (e) {
      // renderPreview degrades internally; anything that still escapes is a
      // bug worth seeing. Before boot it would otherwise leave the overlay
      // spinning forever.
      console.error(e);
      if (!booted) failBoot(e.message);
      return;
    } finally {
      inFlight--;
    }

    if (!booted) {
      booted = true;
      document.getElementById('boot-overlay')?.remove();
    }
  });
} catch (e) {
  console.error(e);
  failBoot(e.message);
}
