// muse/theme-validate — shape and color validation for VS Code theme JSON.
//
// Shiki splats theme colors straight into inline style attributes, so a value
// like `red;background:url(...)` would CSS-inject. Real VS Code themes only ever
// use hex, so everything Shiki copies into a style attribute must be hex (or
// absent). Pure module with no DOM/Node dependencies: shared by the in-browser
// uploader and `scripts/rebuild-index.mjs`, so committed repo themes are held
// to the same rule as runtime uploads.

export const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Returns null when the theme is acceptable, otherwise a human-readable reason.
export function validateTheme(theme) {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return 'theme must be a JSON object';
  }
  if (!theme.colors && !theme.tokenColors && !theme.settings) {
    return 'missing colors, tokenColors, or settings — not a VS Code theme';
  }
  if (theme.type != null && theme.type !== 'light' && theme.type !== 'dark') {
    return `type: must be "light" or "dark", got ${JSON.stringify(theme.type)}`;
  }
  if (theme.name != null && typeof theme.name !== 'string') {
    return 'name: must be a string';
  }

  // Empty string is allowed: VS Code themes use it to clear an inherited color.
  const bad = (val, where) => {
    if (val == null) return null;
    if (typeof val !== 'string') return `${where}: must be a string`;
    if (val !== '' && !COLOR_RE.test(val)) return `${where}: invalid color "${val}"`;
    return null;
  };

  // fontStyle is a space-separated list of style words ('italic bold', or
  // 'normal'/'regular'/'' to clear — real themes use all of these). Shiki only
  // maps the tokens it knows (italic/bold/underline/strikethrough) into inline
  // styles and ignores the rest, so any purely alphabetic word is safe; reject
  // anything else (separators, urls) that could smuggle CSS.
  const badFontStyle = (val, where) => {
    if (val == null) return null;
    if (typeof val !== 'string') return `${where}: must be a string`;
    const trimmed = val.trim();
    if (trimmed === '') return null;
    for (const tok of trimmed.split(/\s+/)) {
      if (!/^[a-zA-Z]+$/.test(tok)) return `${where}: invalid fontStyle "${val}"`;
    }
    return null;
  };

  // Shiki copies these top-level values straight into the <pre> style attribute,
  // the same injection surface as colors.* — so they must be validated too.
  for (const key of ['bg', 'fg', 'background', 'foreground']) {
    const err = bad(theme[key], key);
    if (err) return err;
  }

  if (theme.colors && typeof theme.colors === 'object') {
    for (const [k, v] of Object.entries(theme.colors)) {
      const err = bad(v, `colors.${k}`);
      if (err) return err;
    }
  }

  // Shiki splices colorReplacements *values* into inline styles at render time
  // — the same injection surface as the colors above.
  if (theme.colorReplacements && typeof theme.colorReplacements === 'object') {
    for (const [k, v] of Object.entries(theme.colorReplacements)) {
      const err = bad(v, `colorReplacements.${k}`);
      if (err) return err;
    }
  }

  const checkRules = (rules, label) => {
    if (rules == null) return null;
    if (!Array.isArray(rules)) return `${label}: must be an array`;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const at = `${label}[${i}]`;
      // Shiki trusts the rule shape: a null rule or a non-string scope passes
      // loadTheme, then throws on every render (`scopes[j].trim`).
      if (!isPlainObject(rule)) return `${at}: must be an object`;
      const sc = rule.scope;
      if (sc != null && typeof sc !== 'string' &&
          !(Array.isArray(sc) && sc.every(x => typeof x === 'string'))) {
        return `${at}.scope: must be a string or an array of strings`;
      }
      const s = rule.settings;
      if (s == null) continue;
      if (!isPlainObject(s)) return `${at}.settings: must be an object`;
      const fg = bad(s.foreground, `${label}[${i}].settings.foreground`);
      if (fg) return fg;
      const bg = bad(s.background, `${label}[${i}].settings.background`);
      if (bg) return bg;
      const fs = badFontStyle(s.fontStyle, `${label}[${i}].settings.fontStyle`);
      if (fs) return fs;
    }
    return null;
  };

  return checkRules(theme.tokenColors, 'tokenColors')
      || checkRules(theme.settings, 'settings');
}
