/*
 * verify.js — "deep research": does this cited source actually exist?
 *
 * This is the check Turnitin does not do, and the one that matters most now
 * that students draft with language models: a fabricated reference is
 * perfectly formatted, plausibly titled, attributed to a real scholar in the
 * right field, and simply does not exist. Style checkers pass it. Similarity
 * checkers pass it. Only a lookup against the scholarly record catches it.
 *
 * Sources, both free, both CORS-enabled, neither needing an API key:
 *   Crossref  (api.crossref.org)  — 165M+ DOI records, publisher-deposited.
 *   OpenAlex  (api.openalex.org)  — 250M+ works, includes books and chapters.
 *
 * This is the ONE part of the app that reaches the network, and only when the
 * instructor presses the button. Only the reference string is sent — never the
 * thesis text, never student names.
 *
 * A "not found" is not proof of fabrication: older books, non-English
 * monographs, local-press works, and archival material are legitimately absent
 * from both indexes. The UI must say so, and the status names reflect it.
 */

const CROSSREF = 'https://api.crossref.org/works';
const OPENALEX = 'https://api.openalex.org/works';

/* Identifying yourself gets Crossref's faster "polite" pool. Configurable. */
let contact = '';
export const setContactEmail = (email) => { contact = String(email || '').trim(); };

/* ------------------------------------------------------------ parsing */

/*
 * Pull structured fields out of a reference-list line. Deliberately tolerant:
 * a partial parse still gives a usable bibliographic query, and the lookup
 * itself is what decides whether the source is real.
 */
export function parseReference(raw) {
  const text = String(raw).replace(/\s+/g, ' ').trim();

  const doi = (text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i) || [])[0] || null;
  const year = (text.match(/\((\d{4})[a-z]?\)/) || [])[1] ||
               (text.match(/\b(1[5-9]\d{2}|20[0-4]\d)\b/) || [])[1] || null;

  /* Authors: everything before the year, or before the first sentence-final
     period that follows a surname-comma-initial pattern. */
  const beforeYear = year ? text.slice(0, text.indexOf(year)).replace(/\($/, '').trim() : text.slice(0, 90);
  const authors = beforeYear
    .replace(/[,.]$/, '')
    .split(/,\s*(?:and|&)\s*|\s+and\s+|\s*&\s*|;\s*/)
    .map((a) => a.trim())
    .filter((a) => a.length > 1 && /[A-Za-z]/.test(a))
    .slice(0, 6);
  const firstSurname = (authors[0] || '').split(',')[0].trim() || null;

  /* Title: quoted span (MLA article), or the run after the year (APA). */
  let title = (text.match(/["“]([^"”]{8,240})["”]/) || [])[1] || null;
  if (!title && year) {
    const after = text.slice(text.indexOf(year) + 4).replace(/^[).,\s]+/, '');
    title = (after.match(/^([^.]{8,240})\./) || [])[1] || after.slice(0, 160) || null;
  }
  if (!title) title = text.slice(0, 160);
  title = title.replace(/\s+/g, ' ').trim();

  return { raw: text, doi, year: year ? Number(year) : null, authors, firstSurname, title };
}

/* ------------------------------------------------------------ lookups */

export async function verifyReference(raw, { signal } = {}) {
  const ref = parseReference(raw);
  try {
    if (ref.doi) {
      const byDoi = await crossrefByDoi(ref.doi, signal);
      if (byDoi) {
        return finish(ref, byDoi, scoreMatch(ref, byDoi), 'doi');
      }
      return { ref, status: 'doi-not-found', score: 0, match: null, source: 'crossref',
        note: 'The DOI in this entry does not resolve. A wrong DOI on a real source is common; a DOI that resolves to nothing at all is a red flag.' };
    }

    const [cr, oa] = await Promise.all([
      crossrefSearch(ref, signal).catch(() => []),
      openAlexSearch(ref, signal).catch(() => [])
    ]);
    const candidates = [...cr, ...oa]
      .map((c) => ({ ...c, score: scoreMatch(ref, c) }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best || best.score < 0.35) {
      return { ref, status: 'not-found', score: best ? best.score : 0, match: null,
        candidates: candidates.slice(0, 3), source: 'crossref+openalex',
        note: 'No close match in Crossref or OpenAlex. Verify by hand before treating this as fabricated — pre-1990 books, non-English monographs and archival sources are often genuinely absent from both indexes.' };
    }
    return finish(ref, best, best.score, best.source);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return { ref, status: 'error', score: 0, match: null, note: `Lookup failed: ${err.message}` };
  }
}

function finish(ref, match, score, source) {
  const status = score >= 0.75 ? 'verified' : score >= 0.5 ? 'probable' : 'weak-match';
  const flags = [];
  if (match.year && ref.year && Math.abs(match.year - ref.year) > 1) {
    flags.push(`Year differs: the entry says ${ref.year}, the record says ${match.year}.`);
  }
  if (ref.firstSurname && match.authors.length &&
      !match.authors.some((a) => a.toLowerCase().includes(ref.firstSurname.toLowerCase()))) {
    flags.push(`First author differs: the entry says “${ref.firstSurname}”, the record lists ${match.authors.slice(0, 2).join(', ')}.`);
  }
  return { ref, status, score, match, source, flags };
}

async function crossrefByDoi(doi, signal) {
  const res = await fetch(`${CROSSREF}/${encodeURIComponent(doi)}${politeQuery('?')}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref returned ${res.status}`);
  const data = await res.json();
  return normaliseCrossref(data.message);
}

async function crossrefSearch(ref, signal) {
  const params = new URLSearchParams({ 'query.bibliographic': ref.raw.slice(0, 300), rows: '4', select: 'DOI,title,author,issued,container-title,type,URL' });
  if (contact) params.set('mailto', contact);
  const res = await fetch(`${CROSSREF}?${params}`, { signal });
  if (!res.ok) throw new Error(`Crossref returned ${res.status}`);
  const data = await res.json();
  return (data.message.items || []).map(normaliseCrossref);
}

async function openAlexSearch(ref, signal) {
  const params = new URLSearchParams({ search: (ref.title || ref.raw).slice(0, 200), per_page: '4' });
  if (contact) params.set('mailto', contact);
  const res = await fetch(`${OPENALEX}?${params}`, { signal });
  if (!res.ok) throw new Error(`OpenAlex returned ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(normaliseOpenAlex);
}

function normaliseCrossref(w) {
  if (!w) return null;
  return {
    source: 'crossref',
    title: (w.title || [])[0] || '',
    authors: (w.author || []).map((a) => [a.family, a.given].filter(Boolean).join(', ')).filter(Boolean),
    year: ((w.issued || {})['date-parts'] || [[]])[0][0] || null,
    container: (w['container-title'] || [])[0] || '',
    type: w.type || '',
    doi: w.DOI || null,
    url: w.URL || (w.DOI ? `https://doi.org/${w.DOI}` : null)
  };
}

function normaliseOpenAlex(w) {
  return {
    source: 'openalex',
    title: w.display_name || '',
    authors: (w.authorships || []).map((a) => (a.author || {}).display_name).filter(Boolean),
    year: w.publication_year || null,
    container: ((w.primary_location || {}).source || {}).display_name || '',
    type: w.type || '',
    doi: w.doi ? String(w.doi).replace('https://doi.org/', '') : null,
    url: w.doi || w.id || null
  };
}

/* --------------------------------------------------------- match scoring */

/* Title similarity dominates; author and year confirm. A record can share a
   title and still be the wrong edition, which is why flags are separate. */
function scoreMatch(ref, cand) {
  if (!cand) return 0;
  const t = titleSimilarity(ref.title || '', cand.title || '');
  let score = t * 0.7;
  if (ref.firstSurname && cand.authors.some((a) => a.toLowerCase().includes(ref.firstSurname.toLowerCase()))) score += 0.2;
  if (ref.year && cand.year && Math.abs(ref.year - cand.year) <= 1) score += 0.1;
  return Math.min(1, score);
}

function titleSimilarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter++; });
  return inter / Math.min(A.size, B.size); // containment, so subtitles do not punish
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'with', 'from', 'at', 'by', 'as', 'is', 'or']);
const tokens = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !STOP.has(w)) || []);

const politeQuery = (sep) => (contact ? `${sep}mailto=${encodeURIComponent(contact)}` : '');

/* ------------------------------------------------- prior-work / novelty */

/*
 * Given a thesis statement, find published work already occupying the same
 * ground — so the supervisor can tell the student to proceed, narrow, or
 * change direction BEFORE a year of writing.
 *
 * This searches titles and abstracts, so it answers "has this been published"
 * far better than "is this original". Absence of results is weak evidence.
 */
export async function findPriorWork(statement, { signal, perPage = 12, fromYear = null } = {}) {
  const query = keyphrase(statement);
  if (!query) throw new Error('Could not derive search terms from that statement.');

  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
    sort: 'relevance_score:desc'
  });
  if (fromYear) params.set('filter', `from_publication_date:${fromYear}-01-01`);
  if (contact) params.set('mailto', contact);

  const res = await fetch(`${OPENALEX}?${params}`, { signal });
  if (!res.ok) throw new Error(`OpenAlex returned ${res.status}`);
  const data = await res.json();

  const works = (data.results || []).map((w) => ({
    ...normaliseOpenAlex(w),
    citedBy: w.cited_by_count || 0,
    openAccess: Boolean((w.open_access || {}).is_oa),
    abstract: rebuildAbstract(w.abstract_inverted_index),
    concepts: (w.concepts || []).slice(0, 5).map((c) => c.display_name)
  }));

  /* Overlap against the student's own wording, so the supervisor can see
     which hits are genuinely the same argument rather than the same topic. */
  const stmtTokens = tokens(statement);
  works.forEach((w) => {
    w.overlap = titleSimilarity(statement, `${w.title} ${w.abstract || ''}`);
    w.sharedTerms = [...tokens(`${w.title} ${w.abstract || ''}`)].filter((t) => stmtTokens.has(t)).slice(0, 8);
  });
  works.sort((a, b) => b.overlap - a.overlap);

  const close = works.filter((w) => w.overlap >= 0.4).length;
  return {
    query,
    total: data.meta ? data.meta.count : works.length,
    works,
    verdict: close >= 3 ? 'crowded' : close >= 1 ? 'occupied' : 'clear',
    note: 'OpenAlex indexes titles, abstracts and metadata — not full text. A "clear" result means nothing closely matching was indexed, which is encouraging but not a novelty guarantee; a monograph or a non-English literature can still cover this ground.'
  };
}

/* Strip the thesis-statement scaffolding down to its content terms. */
function keyphrase(statement) {
  return String(statement)
    .replace(/\b(this|the)\s+(thesis|dissertation|paper|study|article|chapter|essay|research)\b/gi, ' ')
    .replace(/\b(argues?|contends?|claims?|examines?|explores?|investigates?|maintains?|aims? to|seeks? to|will|that|which)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 14)
    .join(' ');
}

/* OpenAlex stores abstracts as {word: [positions]}; put it back together. */
function rebuildAbstract(inverted) {
  if (!inverted) return null;
  const slots = [];
  Object.entries(inverted).forEach(([word, positions]) => positions.forEach((p) => { slots[p] = word; }));
  return slots.join(' ').replace(/\s+/g, ' ').trim().slice(0, 600) || null;
}


/* ------------------------------------------------------ literature search */

/*
 * Free-text search over the scholarly record, for the Research tab.
 *
 * Two catalogues, because they cover different things: OpenAlex indexes works
 * of all kinds including books and chapters, Crossref indexes what publishers
 * have deposited with a DOI. A humanities monograph is often in one and not
 * the other.
 */
export async function searchOpenAlex(query, { signal, perPage = 20, fromYear = null, openAccessOnly = false } = {}) {
  const params = new URLSearchParams({ search: query, per_page: String(perPage) });
  const filters = [];
  if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
  if (openAccessOnly) filters.push('is_oa:true');
  if (filters.length) params.set('filter', filters.join(','));
  if (contact) params.set('mailto', contact);

  const res = await fetch(`${OPENALEX}?${params}`, { signal });
  if (!res.ok) throw new Error(`OpenAlex returned ${res.status}.`);
  const data = await res.json();
  return {
    total: data.meta ? data.meta.count : 0,
    source: 'OpenAlex',
    works: (data.results || []).map((w) => ({
      ...normaliseOpenAlex(w),
      citedBy: w.cited_by_count || 0,
      openAccess: Boolean((w.open_access || {}).is_oa),
      pdfUrl: (w.best_oa_location || {}).pdf_url || null,
      abstract: rebuildAbstract(w.abstract_inverted_index),
      concepts: (w.concepts || []).slice(0, 4).map((c) => c.display_name)
    }))
  };
}

export async function searchCrossref(query, { signal, rows = 20, fromYear = null } = {}) {
  const params = new URLSearchParams({
    query,
    rows: String(rows),
    select: 'DOI,title,author,issued,container-title,type,URL,abstract,is-referenced-by-count'
  });
  if (fromYear) params.set('filter', `from-pub-date:${fromYear}-01-01`);
  if (contact) params.set('mailto', contact);

  const res = await fetch(`${CROSSREF}?${params}`, { signal });
  if (!res.ok) throw new Error(`Crossref returned ${res.status}.`);
  const data = await res.json();
  return {
    total: data.message['total-results'] || 0,
    source: 'Crossref',
    works: (data.message.items || []).map((w) => ({
      ...normaliseCrossref(w),
      citedBy: w['is-referenced-by-count'] || 0,
      openAccess: false,
      abstract: w.abstract ? String(w.abstract).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) : null,
      concepts: []
    }))
  };
}

/*
 * Format a search result as a reference entry, so a source found here can be
 * pasted straight into the reading list the instructor sends a student.
 */
export function formatReference(work, style = 'apa7') {
  const names = (work.authors || []).map(parseName).filter((n) => n.surname);
  const year = work.year || 'n.d.';
  const title = (work.title || '').replace(/\s+/g, ' ').trim();
  const where = (work.container || '').trim();
  const doi = work.doi ? ` https://doi.org/${work.doi}` : '';

  if (style === 'mla9') {
    /* MLA inverts only the first name, spells given names out, and uses
       "et al." from three authors. */
    const list = !names.length ? ''
      : names.length === 1 ? inverted(names[0])
      : names.length === 2 ? `${inverted(names[0])}, and ${natural(names[1])}`
      : `${inverted(names[0])}, et al`;
    return `${list}${list ? '. ' : ''}"${title}." ${where ? `${where}, ` : ''}${year}${doi ? `,${doi}` : ''}.`;
  }

  /* APA 7: surname and initials, comma-separated, ampersand before the last.
     Twenty-one or more authors elide the middle. */
  const apa = names.map(initialled);
  let list;
  if (!apa.length) list = '';
  else if (apa.length === 1) list = apa[0];
  else if (apa.length === 2) list = `${apa[0]}, & ${apa[1]}`;
  else if (apa.length <= 20) list = `${apa.slice(0, -1).join(', ')}, & ${apa[apa.length - 1]}`;
  else list = `${apa.slice(0, 19).join(', ')}, … ${apa[apa.length - 1]}`;

  return `${list}${list ? ' ' : ''}(${year}). ${title}.${where ? ` ${where}.` : ''}${doi}`;
}

/* Catalogues give either "Sontag, Susan" or "Susan Sontag"; normalise both. */
function parseName(raw) {
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return { surname: '', given: '' };
  if (s.includes(',')) {
    const [surname, ...rest] = s.split(',');
    return { surname: surname.trim(), given: rest.join(',').trim() };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { surname: parts[0], given: '' };
  return { surname: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
}

const initials = (given) => given.split(/[\s.]+/).filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).join(' ');
const initialled = (n) => (n.given ? `${n.surname}, ${initials(n.given)}` : n.surname);
const inverted = (n) => (n.given ? `${n.surname}, ${n.given}` : n.surname);
const natural = (n) => (n.given ? `${n.given} ${n.surname}` : n.surname);
