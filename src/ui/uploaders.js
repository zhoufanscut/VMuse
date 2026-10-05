import {
  installFont, uninstallFont, getInstalledFont, saveCustomFont, loadWebFont,
  checkFontByName, sanitizeFontFace, readStoredCustomFonts,
} from '../fonts.js';
import { loadRuntimeTheme } from '../themes.js';
import { validateTheme } from '../theme-validate.mjs';
import { CUSTOM_THEMES_KEY } from '../keys.js';
import { createDialog, svgIcon } from './dialog.js';

// Larger files are almost certainly not a theme, and would blow the
// localStorage quota anyway.
const MAX_THEME_FILE_BYTES = 2 * 1024 * 1024;
// Longer names are never real font names, and would stretch every pill and
// confirm() prompt they appear in.
const MAX_FONT_NAME = 100;
// How long the font dialog waits for an upload to load before giving up.
const FONT_LOAD_TIMEOUT_MS = 15000;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Stable id for a runtime upload: "custom-" plus a lowercase slug. The prefix
// keeps a name like "JetBrains Mono" from shadowing the repo `jetbrains-mono`.
// Unicode letters/digits survive (a CJK name isn't reduced to nothing); a name
// with no letters or digits at all gets a short hash, so no two uploads ever
// collapse onto a bare "custom-" id. Non-string names never get here (theme
// JSON is validated first, font names come from text inputs).
export function slugify(name) {
  const text = typeof name === 'string' ? name : '';
  let slug = text.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = text.trim() ? `x${hash(text)}` : 'unnamed';
  return 'custom-' + slug;
}

// A labelled input/textarea field. Returns the wrapper, the control, and the
// label head row (so callers can append an example button to it).
function makeField({ label, placeholder = '', multiline = false, rows = 5 }) {
  const wrap = document.createElement('label');
  wrap.className = 'field';

  const head = document.createElement('div');
  head.className = 'field-head';
  const span = document.createElement('span');
  span.textContent = label;
  head.appendChild(span);

  const control = document.createElement(multiline ? 'textarea' : 'input');
  if (multiline) control.rows = rows;
  else control.type = 'text';
  control.placeholder = placeholder;

  wrap.append(head, control);
  return { wrap, control, head };
}

function addExampleButton(head, fill) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dialog-example-btn';
  btn.textContent = 'Use example';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    fill();
  });
  head.appendChild(btn);
}

function makePanel(id) {
  const panel = document.createElement('div');
  panel.className = 'dialog-panel';
  panel.id = `${id}-panel`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `${id}-tab`);
  return panel;
}

function makeStatus() {
  const status = document.createElement('div');
  status.className = 'dialog-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const set = (msg, kind) => {
    status.className = 'dialog-status' + (kind ? ' is-' + kind : '');
    status.textContent = msg || '';
  };
  return { status, setStatus: set };
}

// A minimal but valid VSCode theme used by the theme dialog's "Use example".
const EXAMPLE_THEME_JSON = JSON.stringify({
  name: 'Example Midnight',
  type: 'dark',
  colors: {
    'editor.background': '#11131a',
    'editor.foreground': '#e6e6e6',
  },
  tokenColors: [
    { scope: 'comment', settings: { foreground: '#6b7280', fontStyle: 'italic' } },
    { scope: 'keyword', settings: { foreground: '#c792ea' } },
    { scope: 'string', settings: { foreground: '#c3e88d' } },
    { scope: 'function', settings: { foreground: '#82aaff' } },
  ],
}, null, 2);

let fontDialogSeq = 0;

function showFontDialog({ onFontAdded, onStatus }) {
  const { dialog, title, body, footer } = createDialog();
  title.textContent = 'Add Custom Font';
  const { status, setStatus } = makeStatus();

  const prefix = `muse-font-dialog-${++fontDialogSeq}`;
  const TABS = [
    { id: 'url', label: 'From URL' },
    { id: 'fontface', label: 'Paste @font-face' },
    { id: 'installed', label: 'Installed' },
  ];

  // ── From URL ──────────────────────────────────────────────
  const urlPanel = makePanel(`${prefix}-url`);
  const urlField = makeField({
    label: 'Font CSS URL',
    placeholder: 'https://fonts.googleapis.com/css2?family=Example&display=swap',
  });
  const urlName = makeField({ label: 'Display name', placeholder: 'My Font' });
  // Examples use fonts Muse doesn't ship, so they add a pill rather than a
  // second copy of a repo font.
  addExampleButton(urlField.head, () => {
    urlField.control.value = 'https://fonts.googleapis.com/css2?family=Red+Hat+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap';
    urlName.control.value = 'Red Hat Mono';
    setStatus('', null);
  });
  urlPanel.append(urlField.wrap, urlName.wrap);

  // ── Paste @font-face ──────────────────────────────────────
  const ffPanel = makePanel(`${prefix}-fontface`);
  const ffField = makeField({
    label: '@font-face CSS',
    placeholder: '@font-face {\n  font-family: "My Font";\n  src: url("https://.../my-font.woff2") format("woff2");\n}',
    multiline: true,
    rows: 6,
  });
  const ffName = makeField({ label: 'Display name', placeholder: 'My Font' });
  addExampleButton(ffField.head, () => {
    ffField.control.value = '@font-face {\n  font-family: "Martian Mono";\n  font-weight: 400;\n  font-style: normal;\n  src: url("https://cdn.jsdelivr.net/npm/@fontsource/martian-mono@5.3.0/files/martian-mono-latin-400-normal.woff2") format("woff2");\n}';
    ffName.control.value = 'Martian Mono';
    setStatus('', null);
  });
  ffPanel.append(ffField.wrap, ffName.wrap);

  // ── Already installed ─────────────────────────────────────
  const instPanel = makePanel(`${prefix}-installed`);
  const instField = makeField({ label: 'Font name', placeholder: 'e.g. Fira Code, JetBrains Mono' });
  const instActions = document.createElement('div');
  instActions.className = 'field-actions';
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'btn-secondary';
  checkBtn.textContent = 'Check';
  const addFoundBtn = document.createElement('button');
  addFoundBtn.type = 'button';
  addFoundBtn.className = 'btn-primary';
  addFoundBtn.textContent = 'Add this font';
  addFoundBtn.hidden = true;
  instActions.append(checkBtn, addFoundBtn);
  instPanel.append(instField.wrap, instActions);

  let foundFont = null;
  let checkSeq = 0;
  const runCheck = async () => {
    const seq = ++checkSeq;
    const name = instField.control.value.trim();
    addFoundBtn.hidden = true;
    foundFont = null;
    if (!name || name.length > MAX_FONT_NAME) {
      setStatus(name ? `Font name is too long (${MAX_FONT_NAME} characters max).` : 'Enter a font name to check.', 'error');
      return;
    }
    // Probe only: nothing is persisted until "Add this font".
    setStatus('Checking…', null);
    const font = await checkFontByName(name);
    // A newer check (or a tab switch) superseded this one.
    if (seq !== checkSeq) return;
    if (font) {
      setStatus(`"${font.name}" is installed on this system.`, 'success');
      addFoundBtn.hidden = false;
      foundFont = font;
      addFoundBtn.focus();
    } else {
      setStatus(`"${name}" was not found on this system.`, 'error');
      addFoundBtn.hidden = true;
      foundFont = null;
    }
  };
  checkBtn.addEventListener('click', runCheck);
  instField.control.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runCheck(); }
  });
  addFoundBtn.addEventListener('click', () => {
    if (!foundFont) return;
    onFontAdded?.({ ...foundFont, userAdded: true }, { fresh: true });
    dialog.close();
  });

  const panels = { url: urlPanel, fontface: ffPanel, installed: instPanel };

  // ── Footer ────────────────────────────────────────────────
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.close());

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Add font';
  footer.append(cancelBtn, submitBtn);

  // ── Segmented control ─────────────────────────────────────
  const segments = document.createElement('div');
  segments.className = 'dialog-segments';
  segments.setAttribute('role', 'tablist');
  segments.setAttribute('aria-label', 'Font source');
  const segBtns = {};

  let active = null;
  const activate = (id) => {
    if (id === active) return;
    active = id;
    for (const t of TABS) {
      const selected = t.id === id;
      segBtns[t.id].setAttribute('aria-selected', selected ? 'true' : 'false');
      segBtns[t.id].tabIndex = selected ? 0 : -1;
      panels[t.id].hidden = !selected;
    }
    // The Installed panel manages its own Check → "Add this font" two-step.
    submitBtn.hidden = id === 'installed';
    addFoundBtn.hidden = true;
    foundFont = null;
    checkSeq++;
    setStatus('', null);
  };

  TABS.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dialog-segment';
    b.id = `${prefix}-${t.id}-tab`;
    b.textContent = t.label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('aria-controls', `${prefix}-${t.id}-panel`);
    b.addEventListener('click', () => activate(t.id));
    b.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = TABS[(i + dir + TABS.length) % TABS.length];
      activate(next.id);
      segBtns[next.id].focus();
    });
    segBtns[t.id] = b;
    segments.appendChild(b);
  });

  // Esc would close the dialog mid-check; hold it until the check settles.
  let busy = false;
  dialog.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });

  // Install the font, then save and select it only once it actually loads. On
  // failure the id goes back to what it was: an earlier working upload with
  // the same id is re-installed and stays in storage untouched.
  const finishAdd = async (spec, failHint) => {
    spec.id = slugify(spec.name);
    const previous = getInstalledFont(spec.id);
    let font;
    try {
      font = installFont(spec);
    } catch (e) {
      setStatus('Failed to register font: ' + e.message, 'error');
      return;
    }

    // Undo only our own install: by the time this runs, a later attempt may
    // have installed something else under the same id.
    const revert = () => {
      if (getInstalledFont(spec.id) !== font) return;
      if (previous) installFont(previous);
      else uninstallFont(spec.id);
    };
    // Closed mid-load (header ×, backdrop, or a repeated Esc that Chrome lets
    // through) is a cancel. Revert right away, not when the load settles: the
    // user can reopen the dialog and re-add the same id meanwhile, and a late
    // revert would tear down that newer attempt's source.
    let abandoned = false;
    const onClose = () => { abandoned = true; revert(); };
    dialog.addEventListener('close', onClose, { once: true });

    busy = true;
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    setStatus('Loading font…', null);
    let timer;
    const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve(false), FONT_LOAD_TIMEOUT_MS); });
    const ok = await Promise.race([loadWebFont(font), timedOut]);
    clearTimeout(timer);
    busy = false;
    dialog.removeEventListener('close', onClose);
    if (abandoned) return;

    if (!ok) {
      revert();
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      setStatus(`Could not load "${spec.name}". ${failHint}`, 'error');
      return;
    }

    const persisted = saveCustomFont(font);
    onFontAdded?.({ ...font, userAdded: true }, { fresh: true });
    setStatus(persisted ? 'Font added ✓' : 'Font added for this session (could not save to local storage).', 'success');
    const closeTimer = setTimeout(() => {
      dialog.close();
      if (persisted) {
        onStatus?.('Custom fonts are stored locally and will fall back to defaults if this URL is shared to another device.');
      }
    }, 900);
    // Cancel the deferred close+toast if the user dismisses the dialog first.
    dialog.addEventListener('close', () => clearTimeout(closeTimer), { once: true });
  };

  submitBtn.addEventListener('click', () => {
    if (active === 'url') {
      const url = urlField.control.value.trim();
      const name = urlName.control.value.trim();
      if (!url) return setStatus('Please enter a font CSS URL.', 'error');
      if (!/^https:\/\//i.test(url)) return setStatus('Font URL must start with https://', 'error');
      if (!name) return setStatus('Please enter a display name.', 'error');
      if (name.length > MAX_FONT_NAME) return setStatus(`Display name is too long (${MAX_FONT_NAME} characters max).`, 'error');
      finishAdd({ name, cssUrl: url },
        'Check that the URL points to a CSS stylesheet (not a .woff2 file) and that the display name matches the font-family in that CSS.');
    } else if (active === 'fontface') {
      const css = ffField.control.value.trim();
      const name = ffName.control.value.trim();
      if (!css) return setStatus('Please paste an @font-face rule.', 'error');
      const safe = sanitizeFontFace(css);
      if (!safe) return setStatus('No usable @font-face rule found in the pasted CSS.', 'error');
      if (!name) return setStatus('Please enter a display name.', 'error');
      if (name.length > MAX_FONT_NAME) return setStatus(`Display name is too long (${MAX_FONT_NAME} characters max).`, 'error');
      finishAdd({ name, fontFaceCss: safe },
        'Check that the src URL works and allows cross-origin use, and that the display name matches the font-family in the CSS.');
    }
  });

  body.append(segments, urlPanel, ffPanel, instPanel, status);
  activate('url');

  document.body.appendChild(dialog);
  dialog.showModal();
  urlField.control.focus();

  dialog.addEventListener('close', () => dialog.remove());
}

function showThemeDialog({ onThemeAdded, onStatus }) {
  const { dialog, title, body, footer } = createDialog();
  title.textContent = 'Add Custom Theme';
  const { status, setStatus } = makeStatus();

  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZone.setAttribute('role', 'button');
  dropZone.tabIndex = 0;
  const dropIcon = document.createElement('div');
  dropIcon.className = 'drop-zone-icon';
  dropIcon.appendChild(svgIcon(['M12 3v12', 'M7.5 10.5 12 15l4.5-4.5', 'M5 20h14'], 30));
  const dropText = document.createElement('div');
  dropText.textContent = 'Drop a .json theme file here, or click to browse';
  dropZone.append(dropIcon, dropText);
  body.appendChild(dropZone);

  const jsonField = makeField({ label: 'Theme JSON', placeholder: 'Paste VSCode theme JSON here…', multiline: true, rows: 8 });
  const jsonInput = jsonField.control;
  addExampleButton(jsonField.head, () => {
    jsonInput.value = EXAMPLE_THEME_JSON;
    setStatus('', null);
  });
  body.appendChild(jsonField.wrap);

  // The last dropped/browsed file, so a theme with no `name` can be named after
  // it — but only while the textarea still holds that file's text.
  let loadedFile = null;
  const readFile = (file) => {
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      setStatus('Only .json files are accepted.', 'error');
      return;
    }
    if (file.size > MAX_THEME_FILE_BYTES) {
      setStatus('That file is too large to be a theme (limit 2 MB).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      jsonInput.value = reader.result;
      loadedFile = { stem: file.name.replace(/\.json$/i, ''), text: jsonInput.value.trim() };
      setStatus('', null);
    };
    reader.onerror = () => setStatus('Failed to read file.', 'error');
    reader.readAsText(file);
  };

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    readFile(e.dataTransfer?.files?.[0]);
  });
  const browse = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => readFile(input.files?.[0]));
    input.click();
  };
  dropZone.addEventListener('click', browse);
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.close());

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Add theme';
  submitBtn.addEventListener('click', () => {
    const json = jsonInput.value.trim();
    if (!json) return setStatus('Please paste or drop a theme JSON file.', 'error');

    let theme;
    try {
      theme = JSON.parse(json);
    } catch (e) {
      return setStatus('Invalid JSON: ' + e.message, 'error');
    }
    const err = validateTheme(theme);
    if (err) return setStatus('Theme rejected — ' + err, 'error');

    // Name the id after the theme, else its file, else its content: two unnamed
    // themes must not both become custom-unnamed and silently replace each other.
    const hasName = typeof theme.name === 'string' && theme.name.trim();
    const label = hasName ? theme.name
      : loadedFile?.text === json ? loadedFile.stem
      : `theme-${hash(JSON.stringify(theme))}`;
    const id = slugify(label);

    // Same id is the re-upload path (edit a theme, upload it again), so it
    // replaces — but only after asking when the content actually differs.
    const current = runtimeThemes.get(id);
    if (current && JSON.stringify(current) !== JSON.stringify({ ...theme, name: id }) &&
        !confirm(`You already have a custom theme "${label}". Replace it?`)) {
      return setStatus('Not added. Change the theme\'s "name" to keep both.', 'error');
    }

    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    // Register with Shiki first; only a theme that actually loaded is
    // persisted, so a failure can't leave a dead entry in localStorage.
    loadRuntimeTheme(id, theme).then(() => {
      const persisted = storeCustomTheme(id, theme);
      onThemeAdded?.({ id, name: label, type: theme.type || 'dark' }, { fresh: true });
      setStatus(persisted ? 'Theme added ✓' : 'Theme added for this session (could not save to local storage).', 'success');
      const closeTimer = setTimeout(() => {
        dialog.close();
        if (persisted) {
          onStatus?.('Custom themes are stored locally and will fall back to defaults if this URL is shared to another device.');
        }
      }, 900);
      // Cancel the deferred close+toast if the user dismisses the dialog first.
      dialog.addEventListener('close', () => clearTimeout(closeTimer), { once: true });
    }).catch(e => {
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      setStatus('Failed to load theme: ' + e.message, 'error');
    });
  });
  footer.append(cancelBtn, submitBtn);

  body.appendChild(status);

  document.body.appendChild(dialog);
  dialog.showModal();
  jsonInput.focus();

  dialog.addEventListener('close', () => dialog.remove());
}

export function mountUploaders({ addFontBtn, addThemeBtn, onFontAdded, onThemeAdded }) {
  let statusEl = null;
  let hideTimer = null;

  function ensureStatusEl() {
    if (statusEl) return;
    statusEl = document.createElement('div');
    statusEl.className = 'upload-status';
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(statusEl);
  }

  function onStatus(msg) {
    ensureStatusEl();
    statusEl.textContent = msg;
    statusEl.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { statusEl.hidden = true; }, 6000);
  }

  addFontBtn?.addEventListener('click', () => {
    if (document.querySelector('.upload-dialog')) return; // one dialog at a time
    showFontDialog({ onFontAdded, onStatus });
  });

  addThemeBtn?.addEventListener('click', () => {
    if (document.querySelector('.upload-dialog')) return; // one dialog at a time
    showThemeDialog({ onThemeAdded, onStatus });
  });
}

// Live copies of the runtime themes (id → theme JSON with name: id), the
// in-memory layer over the persisted muse:custom-themes entries.
const runtimeThemes = new Map();

function storeCustomTheme(id, theme) {
  const themeObj = { ...theme, name: id };
  runtimeThemes.set(id, themeObj);
  try {
    const existing = readStoredCustomThemes();
    // Replace on re-upload (same id) so the stored theme can't go stale.
    const idx = existing.findIndex(t => t.id === id);
    if (idx >= 0) existing[idx] = { id, theme: themeObj };
    else existing.push({ id, theme: themeObj });
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(existing));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// Validated {id, theme} entries from muse:custom-themes. Malformed entries and
// themes that would fail today's color validation (stored before it existed)
// are dropped with a console.error rather than aborting the whole restore.
export function readStoredCustomThemes() {
  let entries = [];
  try {
    entries = JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '[]');
  } catch (e) {
    console.error(e);
  }
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const entry of entries) {
    const id = entry?.id;
    const theme = entry?.theme;
    if (typeof id !== 'string' || !id || !theme || typeof theme !== 'object') {
      console.error('muse: dropping malformed stored theme', entry);
      continue;
    }
    const err = validateTheme(theme);
    if (err) {
      console.error(`muse: dropping stored theme "${id}" — ${err}`);
      continue;
    }
    out.push({ id, theme });
  }
  return out;
}

export function getRuntimeTheme(id) {
  return runtimeThemes.get(id);
}

export function removeCustomTheme(id) {
  runtimeThemes.delete(id);
  try {
    const existing = readStoredCustomThemes();
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(existing.filter(t => t.id !== id)));
  } catch (e) {
    console.error(e);
  }
}

// Re-register everything persisted by earlier sessions. Each entry restores on
// its own so one bad font or theme can't block the rest.
export async function restoreCustom({ onFontAdded, onThemeAdded }) {
  for (const spec of readStoredCustomFonts()) {
    try {
      // Everything in muse:custom-fonts is user-added and removable, including
      // entries stored before ids carried the custom- prefix.
      onFontAdded?.({ ...installFont(spec), userAdded: true });
    } catch (e) { console.error(e); }
  }

  for (const { id, theme } of readStoredCustomThemes()) {
    try {
      runtimeThemes.set(id, { ...theme, name: id });
      await loadRuntimeTheme(id, theme);
      onThemeAdded?.({ id, name: theme.name || id, type: theme.type || 'dark' });
    } catch (e) { console.error(e); }
  }
}
