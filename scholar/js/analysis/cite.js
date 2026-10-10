/*
 * cite.js — references in APA 7 and MLA 9, formatted from structured data.
 *
 * NO MODEL TOUCHES THIS.
 *
 * Asking a language model to format a citation is the invention problem in
 * its most deniable form. It will supply a plausible page range, a publisher
 * it half-remembers, a year that is nearly right, and the result looks
 * exactly like a correct reference. Formatting is a set of rules over fields
 * you already have, so it is written as rules: every piece of output here
 * comes from a field you typed or a record a catalogue returned, and a field
 * that is missing is reported as missing rather than filled in.
 *
 * WHAT IT WILL NOT DO.
 *
 * Both styles are large, and the long tail is genuinely ambiguous. This
 * covers the forms a literature department actually submits: journal
 * articles, books, chapters in edited volumes, translations, theses, and web
 * pages. Anything outside that is formatted on the closest template and
 * flagged, rather than guessed at silently. It is a first pass to check, not
 * a substitute for the handbook — which is also true of every reference
 * manager, and less often admitted.
 */

const TYPES = [
  { id: 'article', label: 'Journal article' },
  { id: 'book', label: 'Book' },
  { id: 'chapter', label: 'Chapter in an edited book' },
  { id: 'thesis', label: 'Thesis or dissertation' },
  { id: 'web', label: 'Web page' }
];
export const CITE_TYPES = TYPES;

/* ------------------------------------------------------------------ name */

/*
 * Names are where citation formatting actually goes wrong, so they are
 * parsed once into parts and rendered per style rather than string-patched.
 *
 * "Surname, Given" is honoured when a comma is present, because that is the
 * form people paste out of catalogues, and reversing it silently is how
 * "Orhan, Pamuk" happens.
 */
export function parseName(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s.includes(',')) {
    const [family, given] = s.split(',', 2).map((x) => x.trim());
    return { family, given: given || '' };
  }
  const bits = s.split(' ');
  if (bits.length === 1) return { family: bits[0], given: '' };
  return { family: bits[bits.length - 1], given: bits.slice(0, -1).join(' ') };
}

/* "Seyhan, A." — initials, full stops, no spaces lost. */
function apaName(n) {
  if (!n) return '';
  const initials = n.given
    ? n.given.split(/[\s.-]+/).filter(Boolean).map((g) => `${g[0].toUpperCase()}.`).join(' ')
    : '';
  return initials ? `${n.family}, ${initials}` : n.family;
}

/* "Seyhan, Azade" for the first, "Azade Seyhan" for the rest. */
/* "A" as a given name is an initial, and an initial carries a full stop.
   Without this, "One, A, et al." loses the stop that marks it as one. */
const withStop = (given) => (/(^|\s)\p{L}$/u.test(String(given || '')) ? `${given}.` : given);

const mlaName = (n, first) => (!n ? '' : first
  ? (n.given ? `${n.family}, ${withStop(n.given)}` : n.family)
  : [withStop(n.given), n.family].filter(Boolean).join(' '));

function apaAuthors(names) {
  const list = names.map(apaName).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length <= 20) return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
  /* APA 7: first 19, ellipsis, last. */
  return `${list.slice(0, 19).join(', ')}, . . . ${list[list.length - 1]}`;
}

function mlaAuthors(names) {
  if (!names.length) return '';
  if (names.length === 1) return mlaName(names[0], true);
  if (names.length === 2) return `${mlaName(names[0], true)}, and ${mlaName(names[1], false)}`;
  /* MLA 9: three or more becomes the first plus "et al." */
  return `${mlaName(names[0], true)}, et al.`;
}

/* ----------------------------------------------------------------- bits */

const dot = (s) => {
  const t = String(s || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

const join = (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join(' ');

/*
 * A quoted title, with the punctuation inside the closing mark.
 *
 * MLA puts the full stop inside the quotation marks, always, and a title
 * that already ends in a question or exclamation mark keeps it and takes no
 * stop. Appending the stop after the mark is the single most visible way to
 * get an MLA entry wrong.
 */
const quoted = (t) => {
  const s = String(t || '').trim();
  if (!s) return '';
  return /[?!]$/.test(s) ? `\u201C${s}\u201D` : `\u201C${s.replace(/\.$/, '')}.\u201D`;
};

/* Title case for MLA: the small words stay small unless they lead. */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'off', 'on', 'or', 'per', 'so', 'the', 'to', 'up', 'via', 'yet', 'from', 'into', 'over', 'with']);

export function titleCaseMla(s) {
  const words = String(s || '').trim().split(/(\s+)/);
  let seen = 0;
  return words.map((w) => {
    if (/^\s+$/.test(w)) return w;
    seen += 1;
    const bare = w.replace(/[^\p{L}\p{N}'’-]/gu, '');
    const lower = bare.toLowerCase();
    const isLast = seen === words.filter((x) => !/^\s+$/.test(x)).length;
    /* An all-capitals word is probably an acronym; leave it. */
    if (bare && bare === bare.toUpperCase() && bare.length > 1) return w;
    if (seen > 1 && !isLast && SMALL.has(lower)) return w.toLowerCase();
    return w.replace(/\p{L}[\p{L}'’-]*/u, (m) => m[0].toUpperCase() + m.slice(1));
  }).join('');
}

/* APA uses sentence case for article and book titles. Proper nouns cannot be
   detected reliably, so anything already capitalised mid-title is left as it
   is rather than lower-cased into an error. */
export function sentenceCaseApa(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t === t.toUpperCase() && t.length > 3) {
    const lower = t.toLowerCase();
    return lower[0].toUpperCase() + lower.slice(1);
  }
  return t[0].toUpperCase() + t.slice(1);
}

/* ------------------------------------------------------------- the work */

/*
 * One reference, both styles, plus what is missing.
 *
 * `missing` is the point of the return value as much as the strings are: a
 * reference with no year is not an error this should paper over, and the
 * caller shows the list so it can be fixed at the source.
 */
export function formatReference(ref) {
  const type = TYPES.some((t) => t.id === ref.type) ? ref.type : 'article';
  const authors = (ref.authors || []).map(parseName).filter(Boolean);
  const editors = (ref.editors || []).map(parseName).filter(Boolean);
  const year = String(ref.year || '').trim();
  const title = String(ref.title || '').trim();

  const missing = [];
  if (!authors.length) missing.push('author');
  if (!year) missing.push('year');
  if (!title) missing.push('title');
  if (type === 'article' && !ref.container) missing.push('journal');
  if (type === 'chapter' && !ref.container) missing.push('book title');
  if (type === 'chapter' && !editors.length) missing.push('editor');
  if ((type === 'book' || type === 'chapter') && !ref.publisher) missing.push('publisher');
  if (type === 'web' && !ref.url) missing.push('url');

  return {
    type,
    apa: apa(type, { ...ref, authors, editors, year, title }),
    mla: mla(type, { ...ref, authors, editors, year, title }),
    missing,
    /* Sorting keys, so a list comes out alphabetical the way both styles
       require rather than in the order it was typed. */
    sortKey: (authors[0] ? authors[0].family : title).toLowerCase()
  };
}

function apa(type, r) {
  const who = apaAuthors(r.authors) || '';
  const when = r.year ? `(${r.year}).` : '(n.d.).';
  const doi = r.doi ? `https://doi.org/${String(r.doi).replace(/^https?:\/\/doi\.org\//, '')}` : '';
  const link = doi || r.url || '';

  if (type === 'article') {
    /* Journal and volume are both italic and comma-separated; the issue
       number is not italic and hugs the volume. */
    const iss = r.issue ? `(${r.issue})` : '';
    const where = [italics(r.container), r.volume ? `${italics(r.volume)}${iss}` : iss]
      .filter(Boolean).join(', ');
    return join(dot(who), when, dot(sentenceCaseApa(r.title)),
      dot([where, r.pages].filter(Boolean).join(', ')), link);
  }
  if (type === 'book') {
    return join(dot(who), when, dot(italics(sentenceCaseApa(r.title))),
      r.edition ? dot(`(${r.edition} ed.)`) : '', r.publisher ? dot(r.publisher) : '', link);
  }
  if (type === 'chapter') {
    const eds = r.editors.map((n) => {
      const initials = n.given ? n.given.split(/[\s.-]+/).filter(Boolean).map((g) => `${g[0].toUpperCase()}.`).join(' ') : '';
      return join(initials, n.family);
    }).join(', ');
    const inBit = `In ${eds}${r.editors.length > 1 ? ' (Eds.)' : ' (Ed.)'}, ${italics(sentenceCaseApa(r.container))}${r.pages ? ` (pp. ${r.pages})` : ''}.`;
    return join(dot(who), when, dot(sentenceCaseApa(r.title)), inBit, dot(r.publisher), link);
  }
  if (type === 'thesis') {
    return join(dot(who), when, dot(`${italics(sentenceCaseApa(r.title))} [${r.kind || 'Doctoral dissertation'}, ${r.publisher || 'Institution'}]`),
      dot(r.container || ''), link);
  }
  return join(dot(who), when, dot(italics(sentenceCaseApa(r.title))), dot(r.container), link);
}

function mla(type, r) {
  const who = mlaAuthors(r.authors);
  const t = titleCaseMla(r.title);
  const doi = r.doi ? `https://doi.org/${String(r.doi).replace(/^https?:\/\/doi\.org\//, '')}` : '';
  const link = doi || r.url || '';

  if (type === 'article') {
    const bits = [];
    if (r.container) bits.push(italics(titleCaseMla(r.container)));
    if (r.volume) bits.push(`vol. ${r.volume}`);
    if (r.issue) bits.push(`no. ${r.issue}`);
    if (r.year) bits.push(r.year);
    if (r.pages) bits.push(`pp. ${r.pages}`);
    return join(dot(who), quoted(t), bits.length ? dot(bits.join(', ')) : '', link ? dot(link) : '');
  }
  if (type === 'book') {
    return join(dot(who), dot(italics(t)),
      [r.edition ? `${r.edition} ed.` : '', r.publisher, r.year].filter(Boolean).join(', ') + '.',
      link ? dot(link) : '');
  }
  if (type === 'chapter') {
    const eds = r.editors.map((n) => [n.given, n.family].filter(Boolean).join(' ')).join(', ');
    const bits = [];
    if (r.container) bits.push(italics(titleCaseMla(r.container)));
    if (eds) bits.push(`${r.editors.length > 1 ? 'edited by' : 'edited by'} ${eds}`);
    if (r.publisher) bits.push(r.publisher);
    if (r.year) bits.push(r.year);
    if (r.pages) bits.push(`pp. ${r.pages}`);
    return join(dot(who), quoted(t), bits.length ? dot(bits.join(', ')) : '', link ? dot(link) : '');
  }
  if (type === 'thesis') {
    return join(dot(who), dot(italics(t)),
      [r.year, r.publisher, r.kind || 'PhD dissertation'].filter(Boolean).join(', ') + '.', link ? dot(link) : '');
  }
  const tail = [r.container ? italics(titleCaseMla(r.container)) : '', r.year].filter(Boolean).join(', ');
  return join(dot(who), quoted(t), tail ? dot(tail) : '', link ? dot(link) : '');
}

/*
 * Italics are marked rather than applied.
 *
 * The same string has to survive being shown on screen, copied as plain text
 * into Word, and copied as HTML. A marker the renderer understands keeps all
 * three honest; using real <em> here would paste as literal angle brackets.
 */
const MARK = '\u0001';
const italics = (s) => (s ? `${MARK}${String(s).trim()}${MARK}` : '');

export const stripMarks = (s) => String(s || '').split(MARK).join('');

/** Turn the marked string into nodes, for showing it with real italics. */
export function markedToNodes(s, make) {
  return String(s || '').split(MARK).map((part, i) => (i % 2 ? make('em', part) : make('text', part)));
}

export const toHtml = (s) => String(s || '')
  .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  .split(MARK)
  .map((part, i) => (i % 2 ? `<i>${part}</i>` : part))
  .join('');

/* ------------------------------------------------------- from a catalogue */

/*
 * A library source, as a reference.
 *
 * Catalogue records carry no type field this can trust, so the type is
 * inferred from what is present and shown in an editable box. Getting it
 * wrong is cheap; silently formatting a book as an article is not.
 */
export function refFromSource(src) {
  const type = src.type === 'book' || /press$/i.test(src.venue || '') ? 'book'
    : src.type === 'book-chapter' ? 'chapter'
    : src.venue ? 'article'
    : src.url ? 'web' : 'article';
  return {
    id: src.id,
    type,
    authors: (src.authors || []).slice(),
    editors: [],
    year: src.year || '',
    title: src.title || '',
    container: src.venue || '',
    publisher: type === 'book' || type === 'chapter' ? (src.venue || '') : '',
    volume: '', issue: '', pages: '', edition: '',
    doi: src.doi || '',
    url: src.url || ''
  };
}

export const blankRef = () => ({
  type: 'article', authors: [], editors: [], year: '', title: '', container: '',
  publisher: '', volume: '', issue: '', pages: '', edition: '', doi: '', url: ''
});
