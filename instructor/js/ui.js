/* ui.js — small DOM helpers. No framework; the app is a few thousand nodes. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list' && typeof v !== 'object') node[k] = v;
    else node.setAttribute(k, v);
  });
  children.flat(3).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/*
 * Emptying a node while a change event is still unwinding used to throw
 * "The node to be removed is no longer a child of this node": committing an
 * inline edit blurs the input, the blur fires change, change writes to the
 * store, the store re-renders the view, and the tree the browser is midway
 * through is torn out underneath it. replaceChildren() empties the node in one
 * operation instead of walking a list that is being mutated.
 */
export function clear(node) {
  node.replaceChildren();
  return node;
}

export function mount(node, ...children) {
  clear(node);
  children.flat(3).filter(Boolean).forEach((c) => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return node;
}

/* ------------------------------------------------------------ formatting */

export function num(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export const int = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString() : '—');
export const pct = (v, digits = 0) => (Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(digits)}%` : '—');

export function plural(n, one, many) {
  return `${int(n)} ${n === 1 ? one : many || `${one}s`}`;
}

export function relTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 604800) return `${Math.round(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/* --------------------------------------------------------------- widgets */

export function stat(label, value, sub, tone) {
  return el('div', { class: `stat${tone ? ` ${tone}` : ''}` },
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: value }),
    sub ? el('div', { class: 'sub', text: sub }) : null
  );
}

export function chip(text, tone) {
  return el('span', { class: `chip${tone ? ` ${tone}` : ''}`, text });
}

export function meter(value, tone) {
  return el('div', { class: 'meter' },
    el('div', { class: `fill${tone ? ` ${tone}` : ''}`, style: `width:${Math.max(0, Math.min(1, value)) * 100}%` })
  );
}

export function barChart(items, { format = (d) => d.label } = {}) {
  const max = Math.max(1, ...items.map((d) => d.count));
  return el('div', {},
    el('div', { class: 'bars' },
      items.map((d) => el('div', { class: `bar${d.count ? '' : ' muted'}`, title: `${format(d)}: ${d.count}` },
        el('span', { class: 'n', text: d.count || '' }),
        el('div', { class: 'fill', style: `height:${(d.count / max) * 100}%` })
      ))
    ),
    el('div', { class: 'bar-labels' }, items.map((d) => el('span', { text: format(d) })))
  );
}

export function table(headers, rows, { footer, empty = 'Nothing here yet.' } = {}) {
  if (!rows.length) return el('div', { class: 'empty', text: empty });
  return el('div', { class: 'table-wrap' },
    el('table', {},
      el('thead', {}, el('tr', {}, headers.map((h) => {
        const label = typeof h === 'string' ? h : h.label;
        const cls = typeof h === 'object' && h.num ? 'num' : '';
        return el('th', { class: cls, text: label });
      }))),
      el('tbody', {}, rows.map((r) => (r instanceof Node ? r : el('tr', {}, r.map((c) => (c instanceof Node ? c : el('td', { text: c === null || c === undefined ? '—' : String(c) })))))) ),
      footer ? el('tfoot', {}, footer.map((r) => el('tr', {}, r.map((c) => (c instanceof Node ? c : el('td', { text: c ?? '' })))))) : null
    )
  );
}

export function field(label, input, hint) {
  return el('label', { class: 'field' },
    el('span', { text: label }),
    input,
    hint ? el('p', { class: 'hint', text: hint }) : null
  );
}

export function emptyState(title, body, action) {
  return el('div', { class: 'empty' },
    el('strong', { text: title }),
    el('div', { text: body }),
    action ? el('div', { style: 'margin-top:12px' }, action) : null
  );
}

export function banner(kind, text) {
  return el('div', { class: `banner ${kind}` }, text);
}

/* ---------------------------------------------------------------- toasts */

let toastHost = null;
export function toast(message, kind = '') {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const node = el('div', { class: `toast${kind ? ` ${kind}` : ''}`, text: message });
  toastHost.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .25s';
    setTimeout(() => node.remove(), 260);
  }, kind === 'error' ? 6500 : 3200);
}

/* --------------------------------------------------------------- dialogs */

export function dialog(title, body, actions = []) {
  const dlg = el('dialog', {},
    el('div', { class: 'dlg-head' }, el('h2', { text: title })),
    el('div', { class: 'dlg-body' }, body),
    el('div', { class: 'dlg-foot' }, actions)
  );
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}

export function confirmDialog(title, message, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const dlg = dialog(title, el('p', { text: message }), [
      el('button', { text: 'Cancel', onClick: () => { done(false); dlg.close(); } }),
      el('button', { class: 'danger', text: confirmLabel, onClick: () => { done(true); dlg.close(); } })
    ]);
    dlg.addEventListener('close', () => done(false));
  });
}

/* Escape text that will be interpolated into innerHTML. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/*
 * "Where did my course go?" is the predictable cost of scoping everything to
 * one academic year. When the only courses that exist are filed elsewhere,
 * say so and offer the jump, rather than showing the same blank slate that
 * means "you have not created anything yet".
 */
/* Takes the state and a callback rather than reaching for the store: ui.js is
   DOM helpers, and giving it app knowledge is how a helper file becomes a
   second copy of the application. */
export function otherYearsNotice(s, onJump) {
  const elsewhere = s.courses.filter((c) => c.academicYear !== s.settings.activeYear || c.archived);
  if (!elsewhere.length) return null;
  const years = [...new Set(elsewhere.map((c) => c.academicYear))].sort().reverse();
  return el('div', { class: 'banner info' },
    el('strong', { text: `${elsewhere.length} course(s) are filed under another year or archived.` }),
    el('div', { style: 'margin-top:6px' },
      `Showing ${s.settings.activeYear}. Also here: ${years.join(', ')}.`),
    el('div', { class: 'row', style: 'margin-top:8px' },
      years.filter((y) => y !== s.settings.activeYear).map((y) => el('button', {
        class: 'sm', text: `Switch to ${y}`, onClick: () => onJump(y)
      })))
  );
}
