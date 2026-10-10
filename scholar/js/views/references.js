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
import { getState, activeSources } from '../store.js';
import { formatReference, refFromSource, blankRef, stripMarks, toHtml, CITE_TYPES } from '../analysis/cite.js';
import { auditStyle, STYLES as AUDIT_STYLES, CHECKS, DEFAULT_STYLE } from '../analysis/style-audit.js';
import { buildDocument } from '../analysis/text.js';

const S = {
  style: 'apa',
  refs: [],          /* working list, not stored: a bibliography is a draft */
  editing: null,
  pasting: false,
  pasted: '',
  /* ---- the audit half: a document of yours, checked against one style --- */
  auditStyle: DEFAULT_STYLE,
  auditText: '',
  auditFile: '',
  auditBusy: null,
  audit: null,
  ran: new Set()     /* which of the three checks were asked for */
};

export default function render(root, ctx) {
  const s = getState();
  const done = S.refs.map((r) => ({ ref: r, out: formatReference(r) }))
    .sort((a, b) => a.out.sortKey.localeCompare(b.out.sortKey));
  const incomplete = done.filter((d) => d.out.missing.length).length;

  mount(root,
    el('h1', { text: 'References' }),
    el('p', { class: 'lede', text: 'Two halves. Build a reference from its fields, in APA 7 or MLA 9, with nothing written by a model and anything missing named as missing. Or open a draft you have written and check its citations against APA 7, MLA 8 or MLA 9.' }),

    sheet('Build a reference',
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
        activeSources().length
          ? el('button', { id: 'ref-lib', class: 'sm', text: `Take the ${activeSources().length} ticked in my library`,
              onClick: () => { fromLibrary(activeSources()); render(root, ctx); } })
          : null,
        S.refs.length ? el('button', { class: 'bare sm', text: 'Clear the list',
          onClick: () => { S.refs = []; render(root, ctx); } }) : null)
    ),

    auditSheet(root, ctx),
    auditResults(root, ctx),

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

/* ====================================================================== *
 * Checking a document against a style.
 *
 * Separate from the formatter above, and deliberately so: that half builds
 * a reference out of fields you supply, this half reads a draft you already
 * wrote and says where it departs from the style you are working to.
 *
 * Three checks, because they are three different jobs done at three
 * different moments: the citations in the prose, the list at the back, and
 * the punctuation inside both. Each runs on its own so a chapter full of
 * citation slips does not bury one bad entry.
 *
 * Nothing is rewritten. Every finding says what is wrong and which manual
 * says so, and the fixing is yours.
 * ====================================================================== */

function auditSheet(root, ctx) {
  const st = AUDIT_STYLES.find((x) => x.id === S.auditStyle) || AUDIT_STYLES[0];
  return sheet('Check a draft against a style',
    el('p', { class: 'note', style: 'margin-bottom:14px', text: 'Open a chapter or an article and it is read here, in this browser. Nothing is uploaded and nothing is changed: each check says what departs from the style and names the manual it comes from.' }),

    el('div', { class: 'styles', style: 'margin-bottom:16px' },
      AUDIT_STYLES.map((x) => el('button', {
        class: `style-pick ${x.tone}`, 'aria-pressed': String(S.auditStyle === x.id),
        onClick: () => { S.auditStyle = x.id; S.audit = null; render(root, ctx); }
      },
      el('span', { class: 'name', text: x.label }),
      el('span', { class: 'what', text: x.about })))),

    el('div', { class: 'row', style: 'margin-bottom:12px' },
      el('input', { id: 'audit-file', type: 'file',
        accept: '.txt,.md,.markdown,.pdf,.docx,.rtf,.html,.htm',
        onChange: (e) => readDraft(e.target.files[0], root, ctx) }),
      S.auditBusy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.auditBusy}`) : null),

    S.auditFile
      ? el('p', { class: 'note', text: `Read from ${S.auditFile}: ${S.auditText.split(/\s+/).filter(Boolean).length.toLocaleString()} words.` })
      : null,

    el('div', { class: 'checks', style: 'margin-top:4px' },
      CHECKS.map((c) => el('button', {
        class: `check-run ${c.tone}`, disabled: !S.auditText || Boolean(S.auditBusy),
        onClick: () => runCheck(c.id, root, ctx)
      },
      el('span', { class: 'name', text: c.label }),
      el('span', { class: 'what', text: c.about })))),

    el('p', { class: 'note', style: 'margin-top:14px', text: `Rules from ${st.manual}. No copy of the APA or MLA manuals ships with this app, so these findings name the manual and the rule rather than a chapter, and only patterns the style is unambiguous about are checked. For MLA, the eighth and ninth editions agree on the entry types a literature department submits; where a finding differs between them the tab will show it.` })
  );
}

async function readDraft(file, root, ctx) {
  if (!file) return;
  S.auditBusy = `Reading ${file.name}\u2026`;
  S.audit = null;
  render(root, ctx);
  try {
    const { extractText } = await import('../io/files.js');
    const { text } = await extractText(file);
    if (!text || text.trim().length < 40) throw new Error('almost no text came out of it');
    S.auditText = text;
    S.auditFile = file.name;
  } catch (err) {
    toast(`Could not read it: ${err.message}`);
  }
  S.auditBusy = null;
  render(root, ctx);
}

function runCheck(id, root, ctx) {
  const doc = buildDocument(S.auditText);
  S.ran = new Set([id]);
  S.audit = auditStyle(doc, { style: S.auditStyle, checks: [id] });
  S.audit.check = CHECKS.find((c) => c.id === id);
  render(root, ctx);
}

/*
 * The findings.
 *
 * An empty result is given its own wording per check, because "no findings"
 * means something different each time and a single blank panel would let a
 * check that found nothing to look at pass for a clean bill of health.
 */
function auditResults(root, ctx) {
  const r = S.audit;
  if (!r) return null;
  const c = r.check;
  const st = AUDIT_STYLES.find((x) => x.id === r.style);

  if (!r.issues.length) {
    let why = `Nothing in your ${c.label.toLowerCase()} departs from ${st.label}.`;
    if (c.id === 'citations' && !r.citationsFound) {
      why = 'No in-text citation in a form this recognises was found at all, so nothing was checked. Parenthetical and narrative citations are what it looks for.';
    } else if (c.id === 'entries' && !r.list) {
      why = 'No reference list was found. It is located by its heading \u2014 References, Works Cited or Bibliography on a line of its own \u2014 so nothing was checked.';
    }
    return sheet(null, el('div', { class: `audit-head ${c.tone}` },
      el('strong', { text: c.label }), ' \u2014 ', st.label),
      empty('Nothing to report', why));
  }

  const bySeverity = { high: 0, medium: 0, low: 0 };
  r.issues.forEach((i) => { bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1; });

  return sheet(null,
    el('div', { class: `audit-head ${c.tone}` },
      el('strong', { text: c.label }), ' \u2014 ', st.label, ' \u2014 ',
      `${r.issues.length} finding${r.issues.length === 1 ? '' : 's'}`),
    el('div', { class: 'row tight', style: 'margin:10px 0 16px' },
      bySeverity.high ? tag(`${bySeverity.high} clearly wrong`, 'firm') : null,
      bySeverity.medium ? tag(`${bySeverity.medium} to look at`) : null,
      bySeverity.low ? tag(`${bySeverity.low} minor`) : null,
      r.list ? tag(`${r.list.count} entries in the list`) : null,
      c.id === 'citations' ? tag(`${r.citationsFound} citations seen`) : null),
    el('div', {}, r.issues.map((i) => el('div', { class: `finding sev-${i.severity}` },
      el('div', { class: 'head' },
        el('span', { class: 'mono', text: i.rule }),
        el('span', { class: 'sev', text: i.severity })),
      el('div', { class: 'excerpt', text: i.excerpt }),
      el('div', { class: 'body', text: i.message }),
      el('div', { class: 'source', text: `${i.says} \u2014 ${i.source}` })))),
    el('p', { class: 'note', style: 'margin-top:14px', text: 'Nothing above has been changed in your file. Fix them in your own document; this never rewrites a citation, because a citation silently corrected is a citation nobody checked.' })
  );
}

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
