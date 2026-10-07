import { getState, setState, subscribe, removeFromCatalog, DEFAULTS } from '../state.js';
import { getKnownTheme, ensureCustomTheme, isThemeLoaded, isDarkTheme } from '../themes.js';
import { fuzzyScore } from './search.js';
import {
  createRemoveButton, makeSearchBox, syncTabStops, scrollIntoContainerView,
  bindPillKeys, firstVisiblePill,
} from './pill.js';
import { removeCustomTheme } from './uploaders.js';

async function extractSwatches(themeName) {
  try {
    const theme = await getKnownTheme(themeName);
    const colors = [];
    const seen = new Set();
    const rules = theme.tokenColors || theme.settings || [];
    for (const rule of rules) {
      const fg = rule.settings?.foreground;
      if (fg && !seen.has(fg)) {
        colors.push(fg);
        seen.add(fg);
      }
      if (colors.length >= 6) break;
    }
    return colors;
  } catch {
    return [];
  }
}

// State is captured per-mount in this closure (no module singleton).
// `themes` lists the ids that are always present (Shiki built-ins + repo
// themes); custom pills arrive later through addCustomThemePill.
export function mountThemesSidebar({ container, themes }) {
  const ul = document.createElement('ul');
  ul.setAttribute('role', 'listbox');
  ul.setAttribute('aria-label', 'Themes');

  const pills = new Map(); // id → li
  const pillEls = () => [...pills.values()];
  const selectedEl = () => pills.get(getState().theme) || null;
  let searchQuery = '';

  function applyFilter() {
    for (const [id, pill] of pills) {
      pill.hidden = !!searchQuery && fuzzyScore(searchQuery, id) <= 0;
    }
    syncTabStops(pillEls(), selectedEl());
  }

  function removeTheme(id) {
    const pill = pills.get(id);
    if (pill) { pill.remove(); pills.delete(id); }
    removeCustomTheme(id);
    removeFromCatalog('themes', id);
    if (getState().theme === id) {
      const fallback = pills.has(DEFAULTS.theme) ? DEFAULTS.theme : [...pills.keys()][0];
      if (fallback) setState({ theme: fallback });
    } else {
      syncTabStops(pillEls(), selectedEl());
    }
  }

  function createThemePill(id, isCustom) {
    if (pills.has(id)) return;

    const li = document.createElement('li');
    li.className = 'pill pill-theme';
    li.setAttribute('role', 'option');
    // Initial selected state matters for pills added after mount (restored
    // custom themes): the subscriber only re-runs on the next state change.
    li.setAttribute('aria-selected', id === getState().theme ? 'true' : 'false');
    li.dataset.id = id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pill-name';
    nameSpan.textContent = id;
    li.appendChild(nameSpan);

    const pillMeta = document.createElement('div');
    pillMeta.className = 'pill-meta';

    const badge = document.createElement('span');
    badge.className = isCustom ? 'badge-custom' : 'badge-builtin';
    badge.textContent = '...';
    pillMeta.appendChild(badge);

    const swatchStrip = document.createElement('div');
    swatchStrip.className = 'swatch-strip';
    swatchStrip.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 6; i++) {
      const span = document.createElement('span');
      span.style.backgroundColor = 'transparent';
      swatchStrip.appendChild(span);
    }
    pillMeta.appendChild(swatchStrip);

    // Custom uploads (custom- prefix, stored in vmuse:custom-themes) are removable.
    let removeBtn = null;
    if (isCustom) {
      removeBtn = createRemoveButton(
        `Remove custom theme "${id}"?`,
        `Remove ${id}`,
        () => removeTheme(id),
      );
      pillMeta.appendChild(removeBtn);
    }

    li.appendChild(pillMeta);

    ul.appendChild(li);
    pills.set(id, li);

    const select = () => setState({ theme: id });
    li.addEventListener('click', select);
    bindPillKeys(li, {
      onSelect: select,
      onRemove: removeBtn ? () => removeBtn.click() : null,
    });

    // Load theme data asynchronously
    (async () => {
      try {
        if (!isThemeLoaded(id)) {
          await ensureCustomTheme(id);
        }
        const dark = await isDarkTheme(id);
        badge.textContent = dark ? 'DARK' : 'LIGHT';

        const swatches = await extractSwatches(id);
        const spans = swatchStrip.querySelectorAll('span');
        swatches.forEach((color, i) => {
          if (spans[i]) spans[i].style.backgroundColor = color;
        });
      } catch (err) {
        badge.className = 'badge-error';
        badge.textContent = 'ERR';
      }
    })();
  }

  function addCustomThemePill(id) {
    // Re-upload with the same id: rebuild the pill so the DARK/LIGHT badge and
    // swatches reflect the new theme JSON instead of the stale one.
    const existing = pills.get(id);
    if (existing) { existing.remove(); pills.delete(id); }
    createThemePill(id, true);

    // Insert at correct alphabetical position among all pills
    const pill = pills.get(id);
    const sortedIds = [...pills.keys()].sort((a, b) => a.localeCompare(b));
    const idx = sortedIds.indexOf(id);
    if (idx < sortedIds.length - 1) {
      const afterPill = pills.get(sortedIds[idx + 1]);
      ul.insertBefore(pill, afterPill);
    }

    applyFilter();
  }

  const search = makeSearchBox({
    placeholder: 'Search themes…',
    label: 'Search themes',
    onQuery: (q) => { searchQuery = q; applyFilter(); },
    onArrowDown: () => firstVisiblePill(ul)?.focus(),
  });
  container.appendChild(search.wrap);
  container.appendChild(ul);

  for (const id of [...themes].sort((a, b) => a.localeCompare(b))) {
    createThemePill(id, false);
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'sidebar-add-btn';
  addButton.id = 'add-theme-btn';
  const addThemeIcon = document.createElement('span');
  addThemeIcon.className = 'add-btn-icon';
  addThemeIcon.textContent = '+';
  addThemeIcon.setAttribute('aria-hidden', 'true');
  addButton.append(addThemeIcon, document.createTextNode('Add theme'));

  const addWrap = document.createElement('div');
  addWrap.className = 'sidebar-add-wrap';
  addWrap.appendChild(addButton);
  container.appendChild(addWrap);

  let lastSelected = null;
  subscribe((state) => {
    for (const [id, pill] of pills.entries()) {
      pill.setAttribute('aria-selected', state.theme === id ? 'true' : 'false');
    }
    const sel = pills.get(state.theme) || null;
    syncTabStops(pillEls(), sel);
    if (sel && sel !== lastSelected) scrollIntoContainerView(container, sel);
    lastSelected = sel;
  });

  return { addCustomThemePill };
}
