import { getState, setState, subscribe, removeFromCatalog, DEFAULTS } from '../state.js';
import { loadWebFont, removeCustomFont, removeFoundFont } from '../fonts.js';
import { fuzzyScore } from './search.js';
import {
  createRemoveButton, makeSearchBox, syncTabStops, scrollIntoContainerView,
  bindPillKeys, firstVisiblePill,
} from './pill.js';

// A font renders from the OS only when it has no web source: cssUrl AND pasted
// @font-face both need load verification (and a "web" badge).
const isInstalledFont = (font) =>
  !!font && (font.installed || (!font.cssUrl && !font.fontFaceCss));

// State is captured per-mount in this closure (no module singleton) so a second
// sidebar could be mounted without clobbering the first.
export function mountFontsSidebar({ container, manifests, installedFonts }) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const allFonts = [...installedFonts.sort(byName), ...manifests.sort(byName)];

  const ul = document.createElement('ul');
  ul.setAttribute('role', 'listbox');
  ul.setAttribute('aria-label', 'Fonts');

  const entryMap = new Map(); // id → { li, statusBadge, font }
  const pillEls = () => [...entryMap.values()].map(e => e.li);
  const selectedEl = () => entryMap.get(getState().font)?.li || null;

  // Verify a web font (spinner → ✓ / "could not load") the first time its pill
  // scrolls into view, so fonts far down the list aren't all fetched at boot.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const rec = entryMap.get(entry.target.dataset.fontId);
      if (rec && !isInstalledFont(rec.font) && rec.statusBadge.dataset.state === 'idle') {
        verify(rec);
      }
      observer.unobserve(entry.target);
    }
  }, { root: container, rootMargin: '50px' });

  function verify(rec) {
    const { statusBadge, font } = rec;
    statusBadge.dataset.state = 'loading';
    statusBadge.hidden = false;
    statusBadge.className = 'spinner';
    statusBadge.textContent = '';
    loadWebFont(font).then(success => {
      if (entryMap.get(font.id) !== rec) return; // pill rebuilt or removed meanwhile
      statusBadge.dataset.state = success ? 'ok' : 'error';
      statusBadge.className = success ? 'badge-installed' : 'badge-error';
      statusBadge.textContent = success ? '✓' : 'could not load';
    });
  }

  let searchQuery = '';

  function applyFilter() {
    for (const { li, font } of entryMap.values()) {
      li.hidden = !!searchQuery &&
        fuzzyScore(searchQuery, font.name) <= 0 &&
        fuzzyScore(searchQuery, font.id) <= 0;
    }
    syncTabStops(pillEls(), selectedEl());
  }

  // DOM/list cleanup only — used by both true removal and re-upload rebuilds.
  function removePill(id) {
    const entry = entryMap.get(id);
    if (entry) {
      observer.unobserve(entry.li);
      entry.li.remove();
      entryMap.delete(id);
    }
    const idx = allFonts.findIndex(f => f.id === id);
    if (idx >= 0) allFonts.splice(idx, 1);
  }

  function removeFont(id) {
    removePill(id);
    // custom- uploads live in vmuse:custom-fonts, user-added installed fonts in
    // vmuse:found-fonts. Both removers are no-ops for an absent id, so calling
    // both also covers custom fonts stored before ids carried the prefix.
    removeCustomFont(id);
    removeFoundFont(id);
    removeFromCatalog('fonts', id);
    if (getState().font === id && allFonts[0]) {
      const fallback = allFonts.some(f => f.id === DEFAULTS.font) ? DEFAULTS.font : allFonts[0].id;
      setState({ font: fallback });
    } else {
      syncTabStops(pillEls(), selectedEl());
    }
  }

  function createFontPill(font) {
    if (entryMap.has(font.id)) return;
    if (!allFonts.some(f => f.id === font.id)) allFonts.push(font);

    const li = document.createElement('li');
    li.className = 'pill pill-font';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', font.id === getState().font ? 'true' : 'false');
    li.dataset.fontId = font.id;

    const topRow = document.createElement('div');
    topRow.className = 'pill-top';

    const name = document.createElement('span');
    name.className = 'pill-name';
    name.textContent = font.name;

    const badges = document.createElement('div');
    badges.className = 'pill-badges';

    const isInstalled = isInstalledFont(font);
    const typeBadge = document.createElement('span');
    typeBadge.className = isInstalled ? 'badge-installed' : 'badge-web';
    typeBadge.textContent = isInstalled ? 'installed' : 'web';

    const statusBadge = document.createElement('span');
    statusBadge.hidden = true;
    statusBadge.dataset.state = 'idle';

    badges.append(statusBadge, typeBadge);

    // Anything the user added is removable: custom- uploads (vmuse:custom-fonts)
    // and fonts added via the Installed tab (vmuse:found-fonts, flagged userAdded).
    // Repo fonts and auto-detected system fonts are not.
    let removeBtn = null;
    if (font.id.startsWith('custom-') || font.userAdded) {
      removeBtn = createRemoveButton(
        `Remove "${font.name}" from your fonts?`,
        `Remove ${font.name}`,
        () => removeFont(font.id),
      );
      badges.appendChild(removeBtn);
    }

    topRow.append(name, badges);

    const preview = document.createElement('div');
    preview.className = 'pill-preview';
    preview.style.fontFamily = font.stack;
    preview.textContent = font.name;

    li.append(topRow, preview);
    ul.appendChild(li);
    const rec = { li, statusBadge, font };
    entryMap.set(font.id, rec);
    observer.observe(li);

    const handleSelect = () => {
      setState({ font: font.id });
      // Re-verify on every pick so a transient CDN failure doesn't pin an
      // error badge for the session.
      if (!isInstalled) verify(rec);
    };

    li.addEventListener('click', handleSelect);
    bindPillKeys(li, {
      onSelect: handleSelect,
      onRemove: removeBtn ? () => removeBtn.click() : null,
    });
  }

  const search = makeSearchBox({
    placeholder: 'Search fonts…',
    label: 'Search fonts',
    onQuery: (q) => { searchQuery = q; applyFilter(); },
    onArrowDown: () => firstVisiblePill(ul)?.focus(),
  });
  container.appendChild(search.wrap);
  container.appendChild(ul);

  for (const font of allFonts) {
    createFontPill(font);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'sidebar-add-btn';
  addBtn.id = 'add-font-btn';
  const addIcon = document.createElement('span');
  addIcon.className = 'add-btn-icon';
  addIcon.textContent = '+';
  addIcon.setAttribute('aria-hidden', 'true');
  addBtn.append(addIcon, document.createTextNode('Add font'));

  const addWrap = document.createElement('div');
  addWrap.className = 'sidebar-add-wrap';
  addWrap.appendChild(addBtn);
  container.appendChild(addWrap);

  let lastSelected = null;
  subscribe((state) => {
    for (const [id, { li }] of entryMap) {
      li.setAttribute('aria-selected', id === state.font ? 'true' : 'false');
    }
    const sel = entryMap.get(state.font)?.li || null;
    syncTabStops(pillEls(), sel);
    // Only on a selection change: a size tweak must not yank a list the user
    // has scrolled away from the selected pill.
    if (sel && sel !== lastSelected) scrollIntoContainerView(container, sel);
    lastSelected = sel;
  });

  function addCustomFontPill(font) {
    // Re-upload with the same id: rebuild the pill so its closures (select
    // handler, badge verification) capture the fresh spec, not the old source.
    if (entryMap.has(font.id)) removePill(font.id);
    createFontPill(font);
    applyFilter();
  }

  return { addCustomFontPill };
}
