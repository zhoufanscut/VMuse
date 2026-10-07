// vmuse/preview — preview block renderer with race-condition guard.
//
// CSS-only fast path: the main.js subscriber detects when only `size` and/or
// `ligatures` changed (font/theme/lang/italic unchanged) and calls
// applyPreviewStyle() — a pure style update — instead of re-invoking
// renderPreview() and re-tokenizing.

import { highlight, ensureCustomTheme, ensureCommentStyleTheme, getKnownTheme, isDarkTheme } from './themes.js';
import { loadWebFont } from './fonts.js';
import { loadSample } from './languages.js';

let renderToken = 0;

export async function renderPreview({ font, theme, lang, langManifest, size, ligatures, italic, container, builtinThemes }) {
  const token = ++renderToken;
  // The manifest id (e.g. "csharp") is not always Shiki's language id. Use the
  // declared shikiLang when present; fall back to the id for the common case.
  const shikiLang = langManifest?.shikiLang || lang;

  applyFontStyles({ container, font, size, ligatures });

  // Start the web-font download without blocking the visible switch: the
  // family is already applied, so installed fonts update instantly and the
  // browser swaps a web font in by itself once it decodes. Nothing is
  // re-applied afterwards — a callback that re-applied the render-time size
  // used to clobber slider changes made while the font was still loading.
  loadWebFont(font);

  // Load custom theme if needed (built-in themes are already in Shiki at bootstrap)
  if (builtinThemes && !builtinThemes.has(theme)) {
    try { await ensureCustomTheme(theme); } catch (e) { console.error(e); }
  }

  let renderTheme = theme;
  try {
    renderTheme = await ensureCommentStyleTheme(theme, italic);
  } catch (e) {
    console.error(e);
  }

  // Resolve the page chrome (theme background + light/dark mode) now, but
  // apply it only after the race guard below: a stale render must not repaint
  // the chrome of a theme the user has already moved away from.
  let chrome = null;
  try {
    const [themeObj, dark] = await Promise.all([getKnownTheme(theme), isDarkTheme(theme)]);
    chrome = { bg: themeObj?.bg || '#1a1a2e', dark };
  } catch { /* keep the current chrome */ }

  let code;
  try {
    code = await loadSample(langManifest);
  } catch (e) {
    console.error(e);
    code = `// Sample unavailable — could not load ${langManifest?.sample || 'the sample file'}`;
  }

  let html;
  try {
    html = await highlight(code, shikiLang, renderTheme);
  } catch (e) {
    // Fallback: plain <pre> with banner — font still applies
    console.error(e);
    html = `<div class="preview-error">⚠ syntax highlighting unavailable</div><pre>${escapeHtml(code)}</pre>`;
  }

  // Race-condition guard: bail if a newer render has started
  if (token !== renderToken) return;

  if (chrome) {
    document.documentElement.style.setProperty('--theme-bg', chrome.bg);
    document.documentElement.dataset.theme = chrome.dark ? 'dark' : 'light';
  }

  container.innerHTML = html;
  applyFontStyles({ container, font, size, ligatures });
}

function previewTargets(container) {
  return [
    container,
    container.querySelector('.shiki'),
    container.querySelector('.shiki code'),
    container.querySelector('pre'),
    container.querySelector('code'),
  ].filter(Boolean);
}

function applyFontStyles({ container, font, size, ligatures }) {
  if (!container || !font) return;
  for (const target of previewTargets(container)) {
    target.style.fontFamily = font.stack;
  }
  applyPreviewStyle(container, { size, ligatures });
}

// CSS-only fast path: size and ligatures need no re-highlight.
export function applyPreviewStyle(container, { size, ligatures }) {
  if (!container) return;
  for (const target of previewTargets(container)) {
    target.style.fontSize = size + 'px';
  }
  container.classList.toggle('no-liga', !ligatures);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
