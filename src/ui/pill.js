// vmuse/ui/pill — helpers shared by the font and theme sidebars: the remove "×",
// the search box, roving tab stops, and keyboard navigation between pills.

// Small "×" used to delete a user-added pill (hover/focus-revealed on pointer
// devices, always shown on touch — see .pill-remove in style.css). It is not a
// Tab stop: keyboard users remove a pill with Delete/Backspace (bindPillKeys).
export function createRemoveButton(confirmMsg, ariaLabel, onRemove) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pill-remove';
  btn.textContent = '×';
  btn.title = 'Remove';
  btn.setAttribute('aria-label', ariaLabel);
  btn.tabIndex = -1;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(confirmMsg)) onRemove();
  });
  return btn;
}

// Pills are hidden by search filtering via the `hidden` attribute.
const isVisible = (el) => !el.hidden;

export function nextVisiblePill(el) {
  for (let n = el.nextElementSibling; n; n = n.nextElementSibling) {
    if (n.classList.contains('pill') && isVisible(n)) return n;
  }
  return null;
}

export function prevVisiblePill(el) {
  for (let p = el.previousElementSibling; p; p = p.previousElementSibling) {
    if (p.classList.contains('pill') && isVisible(p)) return p;
  }
  return null;
}

export function firstVisiblePill(list) {
  if (!list) return null;
  for (const el of list.children) {
    if (el.classList.contains('pill') && isVisible(el)) return el;
  }
  return null;
}

export function lastVisiblePill(list) {
  if (!list) return null;
  for (let i = list.children.length - 1; i >= 0; i--) {
    const el = list.children[i];
    if (el.classList.contains('pill') && isVisible(el)) return el;
  }
  return null;
}

// Roving tabindex: exactly one pill per list is a Tab stop — the selected one
// when visible, else the first visible — so a keyboard user crosses a list of
// 50 pills with a single Tab press and Arrow keys move within it.
export function syncTabStops(pills, selected) {
  const visible = pills.filter(isVisible);
  const stop = selected && visible.includes(selected) ? selected : visible[0] || null;
  for (const el of pills) el.tabIndex = el === stop ? 0 : -1;
}

// Scroll only the sidebar's own scrollport. Element.scrollIntoView() would also
// scroll the window, which yanks the stacked mobile layout around on boot.
export function scrollIntoContainerView(container, el) {
  if (!container || !el || el.hidden) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < c.top) container.scrollTop -= (c.top - r.top) + 8;
  else if (r.bottom > c.bottom) container.scrollTop += (r.bottom - c.bottom) + 8;
}

// Enter/Space select, Arrow Up/Down + Home/End move between visible pills, and
// Delete/Backspace remove a removable pill (same confirm as the "×" button).
export function bindPillKeys(li, { onSelect, onRemove }) {
  if (onRemove) li.setAttribute('aria-keyshortcuts', 'Delete');
  li.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let handled = true;
    switch (e.key) {
      case 'Enter':
      case ' ':
        onSelect();
        break;
      case 'ArrowDown':
        nextVisiblePill(li)?.focus();
        break;
      case 'ArrowUp':
        prevVisiblePill(li)?.focus();
        break;
      case 'Home':
        firstVisiblePill(li.parentElement)?.focus();
        break;
      case 'End':
        lastVisiblePill(li.parentElement)?.focus();
        break;
      case 'Delete':
      case 'Backspace':
        if (onRemove) onRemove();
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  });
}

// The sidebar search field with its clear "×". Escape clears a non-empty query,
// ArrowDown hands focus to the list.
export function makeSearchBox({ placeholder, label, onQuery, onArrowDown }) {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-search-wrap';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'sidebar-search';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', label);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'sidebar-search-clear';
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.tabIndex = -1;
  clearBtn.textContent = '×';

  const emit = () => {
    const q = input.value.trim();
    wrap.classList.toggle('has-value', q.length > 0);
    onQuery(q);
  };

  input.addEventListener('input', emit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      emit();
    } else if (e.key === 'ArrowDown' && onArrowDown) {
      e.preventDefault();
      onArrowDown();
    }
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    emit();
    input.focus();
  });

  wrap.append(input, clearBtn);
  return { wrap, input };
}
