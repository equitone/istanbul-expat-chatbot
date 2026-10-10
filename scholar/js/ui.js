/* ui.js — DOM helpers. No framework; this app is a few hundred nodes. */

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list' && typeof v !== 'object') node[k] = v;
    else node.setAttribute(k, v);
  }
  add(node, kids);
  return node;
}

function add(node, kids) {
  kids.flat(4).forEach((k) => {
    if (k === null || k === undefined || k === false) return;
    node.append(k instanceof Node ? k : document.createTextNode(String(k)));
  });
}

/* One swap, never an empty intermediate state — the mistake that threw the
   scroll position around in the other app. */
export function mount(node, ...kids) {
  const frag = [];
  kids.flat(4).forEach((k) => {
    if (k === null || k === undefined || k === false) return;
    frag.push(k instanceof Node ? k : document.createTextNode(String(k)));
  });
  node.replaceChildren(...frag);
  return node;
}

export const field = (label, control, hint) =>
  el('label', { class: 'field' }, el('span', { text: label }), control,
    hint ? el('div', { class: 'note', style: 'margin-top:4px', text: hint }) : null);

export const tag = (text, kind = '') => el('span', { class: `tag${kind ? ` ${kind}` : ''}`, text });

export const figure = (k, n, s) =>
  el('div', { class: 'figure' }, el('span', { class: 'n', text: String(n) }),
    el('span', { class: 'k', text: k }), s ? el('span', { class: 's', text: s }) : null);

export function table(headers, rows) {
  return el('table', {},
    el('thead', {}, el('tr', {}, headers.map((h) =>
      el('th', { class: typeof h === 'object' && h.n ? 'n' : '', text: typeof h === 'object' ? h.label : h })))),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => (c instanceof Node && c.tagName === 'TD') ? c : el('td', {}, c))))));
}

export const sheet = (title, ...kids) =>
  el('section', { class: 'sheet' }, title ? el('h2', { text: title }) : null, ...kids);

export const empty = (title, body, action) =>
  el('div', { class: 'empty' }, el('h3', { text: title }), el('p', { style: 'margin:0 auto', text: body }),
    action ? el('div', { style: 'margin-top:18px' }, action) : null);

export function toast(message, ms = 4200) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = el('div', { class: 'toast', text: message });
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
export const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
