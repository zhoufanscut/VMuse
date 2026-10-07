// Shared modal-dialog primitives used by the uploader and export dialogs.

const SVG_NS = 'http://www.w3.org/2000/svg';

let dialogSeq = 0;

// Build a stroke-based inline SVG icon (no external resource; CSP-safe).
export function svgIcon(paths, size = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  }
  return svg;
}

// A modal <dialog> with header (title + close), scrollable body, and footer.
// Closes on backdrop click. Caller appends content to body/footer and calls
// dialog.showModal(); remove-on-close is the caller's responsibility.
export function createDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'upload-dialog';

  const header = document.createElement('div');
  header.className = 'upload-dialog-header';

  const title = document.createElement('h2');
  title.id = `vmuse-dialog-title-${++dialogSeq}`;
  // Focusable (not tabbable) so a dialog can start keyboard focus at its title.
  title.tabIndex = -1;
  dialog.setAttribute('aria-labelledby', title.id);
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'upload-dialog-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', () => dialog.close());
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'upload-dialog-body';

  const footer = document.createElement('div');
  footer.className = 'upload-dialog-footer';

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);

  // Backdrop click closes — but only when the press *started* on the backdrop.
  // A drag that begins inside a textarea (selecting pasted JSON) and ends over
  // the backdrop dispatches `click` to the common ancestor, the dialog itself,
  // which used to discard the paste.
  let pressOnBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => {
    pressOnBackdrop = e.target === dialog;
  });
  dialog.addEventListener('click', (e) => {
    if (pressOnBackdrop && e.target === dialog) dialog.close();
    pressOnBackdrop = false;
  });

  // A file dropped anywhere in the dialog but a drop zone (e.g. on the JSON
  // textarea) must not navigate the tab to that file.
  for (const type of ['dragover', 'drop']) {
    dialog.addEventListener(type, (e) => e.preventDefault());
  }

  return { dialog, title, body, footer };
}
