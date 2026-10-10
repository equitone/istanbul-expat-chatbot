/*
 * references.js — a reference list in APA 7 or MLA 9.
 *
 * Built from fields, by rules, with no model anywhere near it. A model asked
 * to format a citation will supply a plausible page range and a publisher it
 * half-remembers, and the output looks correct, which is the whole problem.
 * Everything here comes from something you typed or a record a catalogue
 * returned, and a field that is missing is listed as missing rather than
 * invented.
 *
 * Three ways in, because references arrive three ways: from the library you
 * have already built, pasted in bulk from a draft's bibliography, or typed.
 */
import { el, mount, sheet, tag, toast, clip, empty, figure } from '../ui.js';
import { getState } from '../store.js';
import { formatReference, refFromSource, blankRef, stripMarks, toHtml, CITE_TYPES } from '../analysis/cite.js';

const S = {
  style: 'apa',
  refs: [],          /* working list, not stored: a bibliography is a draft */
  editing: null,
  pasting: false,
  pasted: ''
};

export default function render(root, ctx) {
  const s = getState();
  const done = S.refs.map((r) => ({ ref: r, out: formatReference(r) }))
    .sort((a, b) => a.out.sortKey.localeCompare(b.out.sortKey));
  const incomplete = done.filter((d) => d.out.missing.length).length;

  mount(root,
    el('h1', { text: 'References' }),
    el('p', { class: 'lede', text: 'APA 7 or MLA 9, formatted from the fields rather than written by a model. Anything missing is named as missing, because a reference with an invented page range is worse than one with a hole in it.' }),

    sheet(null,
      el('div', { class: 'row', style: 'margin-bottom:16px' },
        el('div', { class: 'seg' },
          el('button', { 'aria-pressed': String(S.style === 'apa'), text: 'APA 7',
            onClick: () => { S.style = 'apa'; render(root, ctx); } }),
          el('button', { 'aria-pressed': String(S.style === 'mla'), text: 'MLA 9',
            onClick: () => { S.style = 'mla'; render(root, ctx); } }))),
      el('div', { class: 'row' },
        el('button', { id: 'ref-add', class: 'solid', text: 'Type one in',
          onClick: () => { S.editing = blankRef(); S.pasting = false; render(root, ctx); } }),
        el('button', { id: 'ref-paste', class: 'sm', text: 'Paste a list',
          onClick: () => { S.pasting = !S.pasting; S.editing = null; render(root, ctx); } }),
        s.sources.length
          ? el('button', { id: 'ref-lib', class: 'sm', text: `Take all ${s.sources.length} from my library`,
              onClick: () => { fromLibrary(s.sources); render(root, ctx); } })
          : null,
        S.refs.length ? el('button', { class: 'bare sm', text: 'Clear the list',
          onClick: () => { S.refs = []; render(root, ctx); } }) : null)
    ),

    S.pasting ? pasteBox(root, ctx) : null,
    S.editing ? sheet(null, refForm(root, ctx)) : null,

    S.refs.length
      ? el('div', {},
          sheet(null,
            el('div', { class: 'figures' },
              figure('references', S.refs.length),
              figure('complete', S.refs.length - incomplete),
              figure('missing something', incomplete, incomplete ? 'listed under each' : '')),
            el('div', { class: 'row tight', style: 'margin-top:12px' },
              el('button', { class: 'sm', text: 'Copy as plain text', onClick: () => copyPlain(done) }),
              el('button', { class: 'sm', text: 'Copy with italics', onClick: () => copyRich(done) }),
              el('span', { class: 'note', text: 'Plain text for anywhere; the second keeps the italics when pasted into Word or Docs.' }))),
          sheet(S.style === 'apa' ? 'Reference list' : 'Works Cited',
            el('div', { class: 'biblio' }, done.map((d) => entry(d, root, ctx))))
        )
      : sheet(null, empty('Nothing in the list yet',
          'Type one in, paste a bibliography, or pull in what you have collected.'))
  );
}

function entry(d, root, ctx) {
  const line = d.out[S.style];
  return el('div', { class: 'item' },
    el('p', { class: 'ref' }, ...marked(line)),
    d.out.missing.length
      ? el('div', { class: 'note', style: 'margin-top:4px', text: `Missing: ${d.out.missing.join(', ')}. Formatted around the hole, not over it.` })
      : null,
    el('div', { class: 'row tight', style: 'margin-top:6px' },
      tag((CITE_TYPES.find((t) => t.id === d.out.type) || {}).label || d.out.type),
      el('button', { class: 'bare sm', text: 'Edit', onClick: () => { S.editing = d.ref; render(root, ctx); } }),
      el('button', { class: 'bare sm', text: 'Remove',
        onClick: () => { S.refs = S.refs.filter((r) => r !== d.ref); render(root, ctx); } }))
  );
}

/* The marked string, rendered with real italics. */
const marked = (s) => String(s || '').split('\u0001')
  .map((part, i) => (i % 2 ? el('em', { text: part }) : document.createTextNode(part)));

/* ------------------------------------------------------------------ form */

function refForm(root, ctx) {
  const r = S.editing;
  const isNew = !S.refs.includes(r);
  const text = (key, label, placeholder) => el('label', { class: 'field' },
    el('span', { text: label }),
    el('input', { value: r[key] || '', placeholder: placeholder || '',
      onInput: (e) => { r[key] = e.target.value; refreshPreview(); } }));

  return el('form', { onSubmit: (e) => { e.preventDefault(); saveRef(root, ctx); } },
    el('h2', { text: isNew ? 'A reference' : 'Edit this reference' }),
    el('div', { class: 'cols' },
      el('label', { class: 'field' },
        el('span', { text: 'What kind' }),
        el('select', { onChange: (e) => { r.type = e.target.value; render(root, ctx); } },
          CITE_TYPES.map((t) => el('option', { value: t.id, selected: r.type === t.id, text: t.label })))),
      text('year', 'Year', '2001')),
    el('label', { class: 'field' },
      el('span', { text: 'Authors' }),
      el('input', { id: 'ref-authors', value: (r.authors || []).join('; '), placeholder: 'Azade Seyhan; Orhan Pamuk',
        onInput: (e) => { r.authors = splitNames(e.target.value); refreshPreview(); } }),
      'Separated by semicolons. “Surname, Given” is understood, and so is “Given Surname”.'),
    el('label', { class: 'field' },
      el('span', { text: 'Title' }),
      el('input', { id: 'ref-title', value: r.title, placeholder: 'Writing outside the nation',
        onInput: (e) => { r.title = e.target.value; refreshPreview(); } }),
      'Type it as it appears. APA lowers it to sentence case and MLA raises it to title case; neither touches a capital you put there deliberately.'),

    r.type === 'article' ? el('div', {},
      text('container', 'Journal', 'Comparative Literature'),
      el('div', { class: 'cols' }, text('volume', 'Volume', '53'), text('issue', 'Issue', '2')),
      text('pages', 'Pages', '101-120')) : null,

    r.type === 'book' ? el('div', {},
      el('div', { class: 'cols' }, text('publisher', 'Publisher', 'Princeton University Press'),
        text('edition', 'Edition, if not the first', '2nd'))) : null,

    r.type === 'chapter' ? el('div', {},
      text('container', 'Title of the book', 'The Cambridge companion to the novel'),
      el('label', { class: 'field' },
        el('span', { text: 'Editors' }),
        el('input', { value: (r.editors || []).join('; '), placeholder: 'Eric Bulson',
          onInput: (e) => { r.editors = splitNames(e.target.value); refreshPreview(); } })),
      el('div', { class: 'cols' }, text('publisher', 'Publisher'), text('pages', 'Pages', '55-70'))) : null,

    r.type === 'thesis' ? el('div', { class: 'cols' },
      text('publisher', 'University', 'Boğaziçi University'),
      text('kind', 'Kind', 'Doctoral dissertation')) : null,

    r.type === 'web' ? text('container', 'Site', 'The site it is on') : null,

    el('div', { class: 'cols' }, text('doi', 'DOI', '10.1234/abcd'), text('url', 'Link', 'https://…')),

    el('div', { class: 'row', style: 'margin-top:12px' },
      el('button', { class: 'solid', type: 'submit', text: isNew ? 'Add it' : 'Done' }),
      el('button', { class: 'bare sm', type: 'button', text: 'Cancel', onClick: () => { S.editing = null; render(root, ctx); } })),

    el('div', { id: 'ref-preview', class: 'verdict', style: 'margin-top:14px' }, ...previewKids(r))
  );
}

const previewKids = (r) => (r.title
  ? [el('strong', { text: 'As it will read: ' }), ...marked(formatReference(r)[S.style])]
  : [el('span', { class: 'note', text: 'It will read out here as you fill it in.' })]);

/*
 * Rewrite the preview line only.
 *
 * Re-rendering the whole view on each keystroke would replace the input the
 * browser is focused on, and the caret would jump to the end of the field or
 * out of it entirely. Only the one element that changed is touched.
 */
function refreshPreview() {
  const node = document.getElementById('ref-preview');
  if (node && S.editing) node.replaceChildren(...previewKids(S.editing));
}

const splitNames = (v) => String(v || '').split(';').map((x) => x.trim()).filter(Boolean);

function saveRef(root, ctx) {
  const r = S.editing;
  if (!r.title.trim()) { toast('It needs a title at least.'); return; }
  if (!S.refs.includes(r)) S.refs.push(r);
  S.editing = null;
  render(root, ctx);
}

/* ----------------------------------------------------------------- paste */

function pasteBox(root, ctx) {
  return sheet(null,
    el('label', { class: 'field' },
      el('span', { text: 'Paste references, one per line' }),
      el('textarea', { id: 'ref-paste-box', rows: 6, value: S.pasted,
        placeholder: 'Seyhan, Azade. Writing Outside the Nation. Princeton University Press, 2001.',
        onInput: (e) => { S.pasted = e.target.value; } })),
    el('div', { class: 'row' },
      el('button', { class: 'solid', text: 'Read them', onClick: () => readPasted(root, ctx) }),
      el('button', { class: 'bare sm', text: 'Cancel', onClick: () => { S.pasting = false; render(root, ctx); } })),
    el('p', { class: 'note', style: 'margin-top:10px', text: 'This pulls out what it can recognise — names, a year, a title, a DOI — and leaves the rest for you. It is a head start on typing, not a parser that understands every house style, and each one lands in the list marked with whatever it could not find.' })
  );
}

/*
 * Read a pasted line into fields.
 *
 * Deliberately shallow. A reference string is not a grammar, and a parser
 * that tries to be clever produces a confidently wrong record, which is
 * harder to spot than an obviously incomplete one. Four things are pulled
 * out with high confidence; everything else is left for the form.
 */
function parseLine(line) {
  const r = blankRef();
  const s = String(line).trim();
  if (!s) return null;

  const doi = s.match(/\b10\.\d{4,9}\/[^\s,;"'<>)\]]+/);
  if (doi) r.doi = doi[0].replace(/[.,;]$/, '');
  const url = s.match(/\bhttps?:\/\/[^\s,;"'<>)\]]+/);
  if (url && !/doi\.org/.test(url[0])) r.url = url[0].replace(/[.,;]$/, '');

  const year = s.match(/\((\d{4})\)/) || s.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  if (year) r.year = year[1];

  /* Authors: everything before the year or the first full stop that follows
     a surname-looking word. Anything less crude mis-splits a title. */
  const head = s.split(/\(\d{4}\)|\.\s/)[0];
  if (head && head.length < 160) {
    r.authors = head.split(/;|\sand\s|&/).map((x) => x.trim().replace(/[.,]$/, '')).filter((x) => x.length > 1 && /\p{L}/u.test(x));
  }

  /* A quoted segment is a title; otherwise the sentence after the year. */
  const q = s.match(/[“"]([^”"]{6,})[”"]/);
  if (q) { r.title = q[1].replace(/\.$/, ''); r.type = 'article'; }
  else {
    const after = s.split(/\(\d{4}\)\.?\s*/)[1] || s.split(/\.\s/).slice(1).join('. ');
    if (after) r.title = after.split(/\.\s|,\s(?=[A-Z][a-z]+\s(?:Press|University))/)[0].replace(/\.$/, '').trim();
  }
  /*
   * Article or book.
   *
   * A quoted title means an article or a chapter: the quotation marks are
   * doing exactly that job in both styles. Without them, and without any of
   * the markers a journal reference carries, a book is the better guess —
   * most of what gets pasted into a literature bibliography is one, and the
   * type is a single click to change.
   */
  const journalish = /\bvol\.|\bno\.\s*\d|\bpp?\.\s*\d|\b\d+\s*\(\d+\)/i.test(s);
  if (!q && !journalish) r.type = 'book';
  if (!r.title) r.title = clip(s, 120);
  return r;
}

function readPasted(root, ctx) {
  const lines = S.pasted.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 12);
  if (!lines.length) { toast('Nothing to read there.'); return; }
  const made = lines.map(parseLine).filter(Boolean);
  S.refs.push(...made);
  S.pasted = '';
  S.pasting = false;
  toast(`${made.length} read in. Check each one: the parser is deliberately shallow.`);
  render(root, ctx);
}

/* --------------------------------------------------------------- library */

function fromLibrary(sources) {
  const have = new Set(S.refs.map((r) => (r.doi || r.title || '').toLowerCase()));
  let added = 0;
  sources.forEach((src) => {
    const key = String(src.doi || src.title || '').toLowerCase();
    if (!key || have.has(key)) return;
    have.add(key);
    S.refs.push(refFromSource(src));
    added += 1;
  });
  toast(added ? `${added} brought in.` : 'They are all in the list already.');
}

/* ------------------------------------------------------------------ copy */

function copyPlain(done) {
  const out = done.map((d) => stripMarks(d.out[S.style])).join('\n\n');
  navigator.clipboard.writeText(out)
    .then(() => toast(`${done.length} reference(s) copied.`))
    .catch(() => toast('This browser would not let the page copy. Select the text instead.'));
}

/*
 * Rich copy, so the italics survive.
 *
 * A reference list pasted into Word with the titles in roman is wrong in
 * both styles, and re-italicising forty entries by hand is exactly the chore
 * this should remove.
 */
function copyRich(done) {
  const html = `<div>${done.map((d) => `<p>${toHtml(d.out[S.style])}</p>`).join('')}</div>`;
  const plain = done.map((d) => stripMarks(d.out[S.style])).join('\n\n');
  try {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' })
    });
    navigator.clipboard.write([item])
      .then(() => toast('Copied with the italics kept.'))
      .catch(() => copyPlain(done));
  } catch {
    /* Older browsers have no ClipboardItem; plain text is better than
       nothing and the user is told which they got. */
    copyPlain(done);
  }
}
