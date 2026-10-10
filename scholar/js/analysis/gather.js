/*
 * gather.js — pull a real corpus off the catalogues for a topic.
 *
 * WHY THIS EXISTS.
 *
 * The first version of this app would only reason over sources you had
 * collected by hand. That was the wrong trade. It was built to avoid the real
 * danger, which is a model inventing literature, but it avoided it by making
 * you do the retrieval yourself, so a gap analysis on an empty library said
 * "add more sources and come back" — true, useless, and not what anyone wants
 * from a research tool. A finding about the published record is the thing
 * being asked for.
 *
 * The guarantee is kept a different way. Every record here is a catalogue
 * record fetched from OpenAlex or Crossref, with a DOI or an OpenAlex id you
 * can open. Nothing is written by a model at this layer and nothing can be.
 * The model, later, is handed these records and told it may not mention a
 * work that is not among them. So the corpus grows by retrieval rather than
 * by hand, and still contains only things that exist.
 *
 * WHAT A SAMPLE IS AND IS NOT.
 *
 * This fetches a sample, not a literature. OpenAlex holds 250 million works;
 * a query returns the most relevant few hundred. Every result carries the
 * query, the number of matches, and the number actually examined, because
 * "nothing in the 400 most relevant works does this" and "nobody has done
 * this" are different statements and only the first is ever true here.
 *
 * Coverage is uneven in ways that matter for this department: journal
 * articles are indexed far better than monographs, and Turkish-language
 * scholarship is thin in both catalogues. A hole found here may be full of
 * books published in Istanbul. Every caller is expected to pass that on.
 */
const OPENALEX = 'https://api.openalex.org/works';
const CROSSREF = 'https://api.crossref.org/works';

let contact = '';
export const setContactEmail = (email) => { contact = String(email || '').trim(); };

const polite = (params) => { if (contact) params.set('mailto', contact); return params; };

async function catalogueError(res, who) {
  let detail = '';
  try {
    const body = await res.text();
    try { const j = JSON.parse(body); detail = j.message || j.error || ''; }
    catch { detail = body.slice(0, 200); }
  } catch { /* nothing readable */ }
  return new Error(`${who} returned ${res.status}${detail ? `: ${detail.trim()}` : '.'}`);
}

/* OpenAlex stores abstracts as {word: [positions]}; put it back together. */
function rebuildAbstract(inverted) {
  if (!inverted) return '';
  const slots = [];
  for (const [word, positions] of Object.entries(inverted)) {
    positions.forEach((p) => { slots[p] = word; });
  }
  return slots.join(' ').replace(/\s+/g, ' ').trim();
}

const normalise = (w) => ({
  source: 'openalex',
  id: w.id,
  title: w.display_name || '',
  authors: (w.authorships || []).map((x) => (x.author || {}).display_name).filter(Boolean),
  year: w.publication_year || null,
  venue: ((w.primary_location || {}).source || {}).display_name || '',
  type: w.type || '',
  doi: w.doi ? String(w.doi).replace('https://doi.org/', '') : null,
  url: w.doi || w.id || null,
  citedBy: w.cited_by_count || 0,
  openAccess: Boolean((w.open_access || {}).is_oa),
  abstract: rebuildAbstract(w.abstract_inverted_index),
  concepts: (w.concepts || []).slice(0, 6).map((c) => c.display_name).filter(Boolean)
});

/*
 * Fetch up to `want` works for a query, paging with a cursor.
 *
 * Cursor paging rather than page numbers because OpenAlex caps page*per-page
 * at 10,000 and a cursor has no such limit, and because a cursor cannot
 * silently return the same page twice when the index shifts underneath a
 * long read.
 */
export async function gatherWorks(query, {
  signal,
  want = 300,
  fromYear = null,
  toYear = null,
  openAccessOnly = false,
  onProgress = null
} = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) throw new Error('Type a few words describing the field first.');

  const perPage = Math.min(200, want);
  const filters = [];
  if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
  if (toYear) filters.push(`to_publication_date:${toYear}-12-31`);
  if (openAccessOnly) filters.push('is_oa:true');

  const works = [];
  const seen = new Set();
  let cursor = '*';
  let total = 0;
  let pages = 0;

  while (works.length < want && cursor && pages < 10) {
    const params = polite(new URLSearchParams({
      search: q,
      'per-page': String(perPage),
      cursor,
      sort: 'relevance_score:desc'
    }));
    if (filters.length) params.set('filter', filters.join(','));

    const res = await fetch(`${OPENALEX}?${params}`, { signal });
    if (!res.ok) throw await catalogueError(res, 'OpenAlex');
    const data = await res.json();

    total = data.meta ? data.meta.count : total;
    const batch = (data.results || []).map(normalise);
    for (const w of batch) {
      const key = (w.doi || w.title || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      works.push(w);
    }
    pages += 1;
    cursor = data.meta ? data.meta.next_cursor : null;
    if (onProgress) onProgress({ fetched: works.length, total });
    if (!batch.length) break;
  }

  const withAbstract = works.filter((w) => w.abstract.length > 40);
  return {
    query: q,
    catalogue: 'OpenAlex',
    total,
    fetched: works.length,
    works,
    /* Placement needs text. A record with only a title cannot be put on an
       axis, so the count that matters downstream is this one, and it is
       reported separately rather than folded into the total. */
    placeable: withAbstract,
    withAbstract: withAbstract.length,
    years: works.length
      ? [Math.min(...works.map((w) => w.year || 9999).filter((y) => y < 9999)),
         Math.max(...works.map((w) => w.year || 0))]
      : null,
    note: `${total.toLocaleString()} works match “${q}” in OpenAlex; the ${works.length} most relevant were examined, ${withAbstract.length} of them with enough text to place. Monographs are indexed far more thinly than articles, and Turkish-language scholarship thinly in both catalogues.`
  };
}

/*
 * Crossref as a second pass, for the humanities monograph problem.
 *
 * Publishers deposit chapters and edited volumes with Crossref that OpenAlex
 * either lacks or holds without an abstract. It is a top-up, not a
 * replacement: it is queried only with what the user typed and its records
 * are merged by DOI.
 */
export async function topUpFromCrossref(query, existing, { signal, rows = 100 } = {}) {
  const params = polite(new URLSearchParams({
    query: String(query || '').trim(),
    rows: String(rows),
    select: 'DOI,title,author,issued,container-title,type,URL,abstract,is-referenced-by-count'
  }));
  const res = await fetch(`${CROSSREF}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'Crossref');
  const data = await res.json();
  const have = new Set((existing || []).map((w) => (w.doi || w.title || '').toLowerCase()));

  const added = (data.message.items || []).map((it) => ({
    source: 'crossref',
    id: it.DOI,
    title: (it.title || [])[0] || '',
    authors: (it.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
    year: ((it.issued || {})['date-parts'] || [[null]])[0][0] || null,
    venue: (it['container-title'] || [])[0] || '',
    type: it.type || '',
    doi: it.DOI || null,
    url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : null),
    citedBy: it['is-referenced-by-count'] || 0,
    openAccess: false,
    /* Crossref abstracts arrive as JATS XML. */
    abstract: String(it.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    concepts: []
  })).filter((w) => w.title && !have.has((w.doi || w.title).toLowerCase()));

  return added;
}

/*
 * The whole retrieval, both catalogues, as one call.
 *
 * Crossref failing never fails the gather: it is the smaller contribution and
 * an outage there should not cost the user the OpenAlex results. What it did
 * or did not add is reported rather than passed over.
 */
export async function gatherCorpus(query, opts = {}) {
  const base = await gatherWorks(query, opts);
  let extra = [];
  let crossrefNote = '';
  if (opts.crossref !== false) {
    try {
      if (opts.onProgress) opts.onProgress({ fetched: base.fetched, total: base.total, stage: 'Crossref' });
      extra = await topUpFromCrossref(query, base.works, { signal: opts.signal });
    } catch (err) {
      crossrefNote = ` Crossref did not answer (${err.message}), so this is OpenAlex alone.`;
    }
  }
  const works = [...base.works, ...extra];
  const placeable = works.filter((w) => (w.abstract || '').length > 40);
  return {
    ...base,
    catalogue: extra.length ? 'OpenAlex and Crossref' : base.catalogue,
    works,
    fetched: works.length,
    placeable,
    withAbstract: placeable.length,
    fromCrossref: extra.length,
    /* Recomputed rather than appended to: the figures in the sentence have to
       be the figures on screen, and base.note was written before Crossref
       added anything. */
    note: `${base.total.toLocaleString()} works match “${base.query}” in OpenAlex; the ${base.fetched} most relevant were examined`
      + (extra.length ? `, and Crossref added ${extra.length} more it does not hold` : '')
      + `. ${placeable.length} of the ${works.length} carry enough text to place. `
      + 'Monographs are indexed far more thinly than articles, and Turkish-language scholarship thinly in both catalogues.'
      + crossrefNote
  };
}
