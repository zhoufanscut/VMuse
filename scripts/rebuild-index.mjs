// Validates every asset under data/ and (unless --check) regenerates
// data/_index.json. Zero dependencies (only node:fs, node:path, node:url);
// Node 18+, CI runs 24. Paths resolve against the repo root, so it can be run
// from any working directory.

import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTheme } from '../src/theme-validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const errors = [];

// Ids are filename stems that end up in URL hashes, localStorage, and Shiki's
// registry: lowercase ASCII letters/digits/hyphens keep all of those simple.
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const HTTPS_RE = /^https:\/\/\S+$/;

const abs = (p) => resolve(ROOT, p);

function listIds(dir) {
  return readdirSync(abs(`data/${dir}`))
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => f.replace(/\.json$/, ''))
    .sort();
}

// Reads a JSON file that must hold an object (or an array when `array` is
// set). A file containing `null`, a number, or a string is valid JSON but
// used to slip through validation and crash the app at boot.
function readJSON(path, { array = false } = {}) {
  let value;
  try { value = JSON.parse(readFileSync(abs(path), 'utf8')); }
  catch (e) { errors.push(`${path}: invalid JSON — ${e.message}`); return null; }
  const ok = array ? Array.isArray(value) : (!!value && typeof value === 'object' && !Array.isArray(value));
  if (!ok) {
    errors.push(`${path}: must be a JSON ${array ? 'array' : 'object'}`);
    return null;
  }
  return value;
}

// The app calls string methods on these (sorting by name, building CSS
// stacks), so "present" is not enough — a number or "" would take the whole
// site down with "Failed to start".
function needStrings(obj, fields, where) {
  for (const f of fields) {
    if (typeof obj[f] !== 'string' || obj[f].trim() === '') {
      errors.push(`${where}: "${f}" must be a non-empty string`);
    }
  }
}

function optionalHttps(obj, field, where) {
  if (obj[field] == null) return;
  if (typeof obj[field] !== 'string' || !HTTPS_RE.test(obj[field])) {
    errors.push(`${where}: "${field}" must be an https:// URL`);
  }
}

function checkId(id, path) {
  // Ids starting with "custom-" are reserved for runtime uploads (the UI even
  // treats custom- pills as removable) — committed files must not use it.
  if (id.startsWith('custom-')) {
    errors.push(`${path}: the "custom-" id prefix is reserved for runtime uploads`);
  }
  if (!ID_RE.test(id)) {
    errors.push(`${path}: id must match ${ID_RE} (lowercase letters, digits, hyphens)`);
  }
}

for (const id of listIds('fonts')) {
  const path = `data/fonts/${id}.json`;
  checkId(id, path);
  const obj = readJSON(path); if (!obj) continue;
  needStrings(obj, ['id', 'name', 'stack'], path);
  if (obj.id !== id) errors.push(`${path}: id "${obj.id}" must match filename`);
  optionalHttps(obj, 'cssUrl', path);
  optionalHttps(obj, 'credits', path);
}

for (const id of listIds('languages')) {
  const path = `data/languages/${id}.json`;
  checkId(id, path);
  const obj = readJSON(path); if (!obj) continue;
  needStrings(obj, ['id', 'label', 'shikiLang', 'sample', 'summary'], path);
  if (obj.id !== id) errors.push(`${path}: id "${obj.id}" must match filename`);
  // The loader prepends "./" at fetch time, so the manifest stores a plain
  // "data/samples/<file>.txt" path — no "./" prefix, no subdirectories, no
  // ".." escapes (existsSync alone would accept those).
  if (typeof obj.sample === 'string') {
    if (!/^data\/samples\/[^/]+\.txt$/.test(obj.sample)) {
      errors.push(`${path}: sample must be "data/samples/<file>.txt" (no "./" prefix, no subdirectories)`);
    } else if (!existsSync(abs(obj.sample))) {
      errors.push(`${path}: sample "${obj.sample}" not found`);
    }
  }
}

const builtin = readJSON('data/themes/_builtin.json', { array: true });
if (Array.isArray(builtin) && !builtin.every(s => typeof s === 'string')) {
  errors.push('data/themes/_builtin.json: must be an array of strings');
}

for (const id of listIds('themes')) {
  const path = `data/themes/${id}.json`;
  checkId(id, path);
  // A repo theme id must not shadow a Shiki built-in: the sidebar merges both
  // lists and the app would try to fetch the file for the built-in name.
  if (Array.isArray(builtin) && builtin.includes(id)) {
    errors.push(`${path}: filename collides with built-in theme name "${id}"`);
  }
  const obj = readJSON(path); if (!obj) continue;
  // Same shape + hex-only color rule as runtime uploads (Shiki writes these
  // values into inline styles).
  const err = validateTheme(obj);
  if (err) errors.push(`${path}: ${err}`);
}

if (errors.length) {
  for (const e of errors) console.error('✗', e);
  process.exit(1);
}

const index = {
  fonts: listIds('fonts'),
  themes: listIds('themes'),
  languages: listIds('languages'),
};

if (CHECK) {
  console.log(`✓ data/ is valid: ${index.fonts.length} fonts, ${index.themes.length} themes, ${index.languages.length} languages`);
} else {
  writeFileSync(abs('data/_index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log('wrote data/_index.json');
}
