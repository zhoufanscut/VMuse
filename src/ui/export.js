// "Use this setup in VS Code" dialog — turns the current font/size/theme
// selection into copy-paste VS Code settings plus a downloadable theme +
// minimal extension scaffold. Local-only: blob download + clipboard, no network.

import { createDialog } from './dialog.js';
import { isFontAvailable } from '../fonts.js';
import { COMMENT_STYLE_SCOPES, isDarkTheme } from '../themes.js';

// Shiki's getTheme() decorates themes with runtime-only keys; drop them so the
// downloaded JSON is a clean VS Code theme. `displayName` is Shiki's too — the
// extension's label comes from package.json, not the theme file.
const DROP_KEYS = new Set(['bg', 'fg', 'colorReplacements', 'displayName']);

function buildSettingsSnippet(font, state, themeId) {
  const settings = {
    'editor.fontFamily': font.stack,
    'editor.fontSize': state.size,
    'editor.fontLigatures': !!state.ligatures,
  };
  // Muse always forces comment style (italic or upright) via a theme variant;
  // mirror that with an explicit override so "italic off" also wins over
  // themes whose comments are natively italic. Same scope list as the preview:
  // the `comments` shorthand only covers `comment`, which loses to a theme's
  // own `comment.line.double-slash` / `comment.block.documentation` rules.
  // Scoped to this theme's label (what our generated extension contributes)
  // so it can't bleed into the user's other VS Code themes.
  settings['editor.tokenColorCustomizations'] = {
    [`[${themeId}]`]: {
      textMateRules: [{
        scope: COMMENT_STYLE_SCOPES,
        settings: { fontStyle: state.italic ? 'italic' : '' },
      }],
    },
  };
  return JSON.stringify(settings, null, 2);
}

function buildPackageJson(themeId, dark) {
  const pkg = {
    name: `muse-${themeId}`,
    displayName: `${themeId} (Muse)`,
    // Without a publisher VS Code registers the extension as
    // "undefined_publisher.muse-…" and warns about it.
    publisher: 'muse',
    version: '1.0.0',
    engines: { vscode: '^1.0.0' },
    categories: ['Themes'],
    contributes: {
      themes: [{ label: themeId, uiTheme: dark ? 'vs-dark' : 'vs', path: `./${themeId}.json` }],
    },
  };
  return JSON.stringify(pkg, null, 2);
}

// Shiki's normalizeTheme swaps non-hex colors (one-light's "white",
// "inherit") for "#000000NN" placeholders and records the originals in
// `colorReplacements`, which it applies at render time. VS Code knows nothing
// of that map, so put the original values back before the key is dropped.
// Lookup mirrors Shiki's (lowercased key). Returns clones; never mutates.
function restoreColor(val, map) {
  if (typeof val !== 'string') return val;
  const orig = map[val.toLowerCase()];
  return typeof orig === 'string' ? orig : val;
}

function restoreRules(rules, map) {
  return rules.map(rule => {
    const s = rule?.settings;
    if (!s || typeof s !== 'object') return rule;
    const fg = restoreColor(s.foreground, map);
    const bg = restoreColor(s.background, map);
    if (fg === s.foreground && bg === s.background) return rule;
    const settings = { ...s };
    if (fg !== undefined) settings.foreground = fg;
    if (bg !== undefined) settings.background = bg;
    return { ...rule, settings };
  });
}

function cleanTheme(themeId, raw, dark) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (DROP_KEYS.has(k)) continue;
    out[k] = v;
  }
  // Shiki normalizes token rules into a `settings` array; VS Code's modern key
  // is `tokenColors`. Rename so built-in exports match the repo themes' shape.
  if (Array.isArray(out.settings) && !out.tokenColors) {
    out.tokenColors = out.settings;
    delete out.settings;
  }
  const map = raw?.colorReplacements;
  if (map && typeof map === 'object' && Object.keys(map).length) {
    if (Array.isArray(out.tokenColors)) out.tokenColors = restoreRules(out.tokenColors, map);
    if (Array.isArray(out.settings)) out.settings = restoreRules(out.settings, map);
    // normalizeTheme also replaces non-hex editor.* / terminal.ansi* colors.
    if (out.colors && typeof out.colors === 'object') {
      out.colors = Object.fromEntries(
        Object.entries(out.colors).map(([k, v]) => [k, restoreColor(v, map)]));
    }
  }
  // Output is serialized for download immediately; nested values are shared
  // read-only with the live theme object and must not be mutated.
  out.name = themeId; // keep name coherent with the filename + extension label
  // A raw theme that never declared its kind would be treated as dark by every
  // consumer; write down what Muse actually rendered it as.
  if (out.type !== 'light' && out.type !== 'dark') out.type = dark ? 'dark' : 'light';
  return out;
}

async function copyText(text, container) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    // Everything outside an open modal <dialog> is inert, so a textarea on
    // <body> can't be focused or selected and execCommand copies nothing.
    const prevFocus = document.activeElement;
    (container || document.body).appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    prevFocus?.focus?.(); // back to the Copy button, not the dialog's start
    return ok;
  } catch {
    return false;
  }
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setStatus(el, msg, kind) {
  el.className = 'dialog-status' + (kind ? ' is-' + kind : '');
  el.textContent = msg || '';
}

// Read-only code block with a Copy button pinned to the top-right.
function makeCodeBlock(text, label) {
  const wrap = document.createElement('div');
  wrap.className = 'export-code';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'export-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.setAttribute('aria-label', `Copy ${label}`);
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(text, copyBtn.closest('dialog'));
    copyBtn.textContent = ok ? 'Copied ✓' : 'Copy failed';
    copyBtn.classList.toggle('is-copied', ok);
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('is-copied');
    }, 1500);
  });

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = text;
  pre.appendChild(code);

  wrap.append(copyBtn, pre);
  return wrap;
}

function fontDownloadUrl(font) {
  // Repo manifests carry a homepage/source URL in `credits`; otherwise fall back
  // to a Google Fonts search, which covers most coding fonts.
  if (font.credits && /^https:\/\//i.test(font.credits)) return font.credits;
  return `https://fonts.google.com/?query=${encodeURIComponent(font.name)}`;
}

function buildFontNote(font) {
  const note = document.createElement('p');
  note.className = 'export-note';

  // A web source (CDN url or pasted @font-face) is loaded into this page for the
  // preview, so a canvas probe can't prove an OS install — which is what VS Code
  // needs. Only probe fonts with no web source; web fonts always prompt install.
  const hasWebSource = !!(font.cssUrl || font.fontFaceCss);
  const installed = !hasWebSource && isFontAvailable(font.name);

  if (installed) {
    note.classList.add('is-ok');
    note.textContent = `✓ ${font.name} is installed on this computer — VS Code can use it.`;
    return note;
  }

  note.append(hasWebSource
    ? `VS Code uses fonts installed on your computer (not the web preview), so install ${font.name} first — `
    : `${font.name} isn't installed on this computer — install it first: `);
  const a = document.createElement('a');
  a.href = fontDownloadUrl(font);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = `get ${font.name} →`;
  note.appendChild(a);
  return note;
}

function buildFontSection(font, state, themeId) {
  const section = document.createElement('section');
  section.className = 'export-section';

  const h = document.createElement('h3');
  h.className = 'export-section-title';
  h.textContent = '1. Font & size';
  section.appendChild(h);

  const desc = document.createElement('p');
  desc.className = 'export-note';
  desc.textContent = 'Add these to your VS Code settings.json:';
  section.appendChild(desc);

  section.appendChild(makeCodeBlock(buildSettingsSnippet(font, state, themeId), 'settings'));
  section.appendChild(buildFontNote(font));
  return section;
}

function buildSteps(themeId) {
  const ol = document.createElement('ol');
  ol.className = 'export-steps';
  // VS Code (1.74+) no longer picks up a folder copied by hand into
  // ~/.vscode/extensions, so register it with "Install Extension from
  // Location…" instead. That installs the folder in place: it has to stay.
  const steps = [
    `Make a folder you'll keep (e.g. muse-${themeId}) — VS Code loads the theme from it, so don't delete it later.`,
    `Save the downloaded ${themeId}.json and the package.json above into that folder.`,
    'In VS Code, open the Command Palette (Cmd/Ctrl+Shift+P), run "Developer: Install Extension from Location…", and pick the folder.',
    `Select the theme with Cmd/Ctrl+K Cmd/Ctrl+T → ${themeId}.`,
  ];
  for (const t of steps) {
    const li = document.createElement('li');
    li.textContent = t;
    ol.appendChild(li);
  }
  return ol;
}

function fillThemeSection(container, themeId, themeObj, dark, status) {
  const dlBtn = document.createElement('button');
  dlBtn.type = 'button';
  dlBtn.className = 'btn-secondary export-download-btn';
  dlBtn.textContent = `Download ${themeId}.json`;

  if (!themeObj) {
    dlBtn.disabled = true;
    const err = document.createElement('p');
    err.className = 'export-note';
    err.textContent = 'Could not load this theme for download.';
    container.append(dlBtn, err);
    return;
  }

  dlBtn.addEventListener('click', () => {
    downloadJson(`${themeId}.json`, cleanTheme(themeId, themeObj, dark));
    setStatus(status, `Downloaded ${themeId}.json ✓`, 'success');
  });
  container.appendChild(dlBtn);

  const desc = document.createElement('p');
  desc.className = 'export-note';
  desc.textContent = 'VS Code themes are extensions, so wrap it in a tiny one. Save this as package.json next to the theme:';
  container.appendChild(desc);

  container.appendChild(makeCodeBlock(buildPackageJson(themeId, dark), 'package.json'));
  container.appendChild(buildSteps(themeId));
}

// font: current font manifest ({ name, stack, credits? }). state: getState()
// snapshot. resolveThemeJson(id): async -> theme object (best available source).
export function showExportDialog({ font, state, resolveThemeJson }) {
  if (!font || !state) return;
  if (document.querySelector('.upload-dialog')) return; // one dialog at a time

  const themeId = state.theme;
  const { dialog, title, body, footer } = createDialog();
  title.textContent = 'Use this setup in VS Code';

  const intro = document.createElement('p');
  intro.className = 'export-intro';
  intro.textContent = `Recreate this look in VS Code: ${font.name} at ${state.size}px with the ${themeId} theme.`;
  body.appendChild(intro);

  body.appendChild(buildFontSection(font, state, themeId));

  const themeSection = document.createElement('section');
  themeSection.className = 'export-section';
  const t2 = document.createElement('h3');
  t2.className = 'export-section-title';
  t2.textContent = '2. Theme';
  const themeBody = document.createElement('div');
  themeBody.className = 'export-theme-body';
  themeBody.textContent = 'Preparing theme…';
  themeSection.append(t2, themeBody);
  body.appendChild(themeSection);

  const status = document.createElement('div');
  status.className = 'dialog-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.appendChild(status);

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'btn-primary';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => dialog.close());
  footer.appendChild(doneBtn);

  document.body.appendChild(dialog);
  dialog.showModal();
  // Start at the title so screen readers announce what opened and keyboard
  // users read top-down, instead of landing on the "×" close button.
  title.focus();
  dialog.addEventListener('close', () => dialog.remove());

  (async () => {
    let themeObj = null;
    let dark = true;
    try {
      [themeObj, dark] = await Promise.all([resolveThemeJson(themeId), isDarkTheme(themeId)]);
    } catch (e) {
      console.error(e);
    }
    themeBody.replaceChildren();
    fillThemeSection(themeBody, themeId, themeObj, dark, status);
  })();
}
