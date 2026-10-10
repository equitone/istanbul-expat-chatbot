/*
 * catalogues.js — everywhere this app can look, and everywhere it cannot.
 *
 * THE THING TO BE CLEAR ABOUT FIRST.
 *
 * JSTOR, Project MUSE and Scopus cannot be searched from here. Not because
 * nobody wrote the code: they publish no interface a web page is allowed to
 * call. JSTOR and MUSE have no public search API at all, and Scopus's needs
 * an Elsevier key tied to a subscribing institution's network and refuses
 * browser requests by design. The same is true of the MLA International
 * Bibliography, which is licensed through EBSCO or ProQuest.
 *
 * So this file does two different things and never confuses them.
 *
 *   FETCHED. Catalogues with a free, keyless interface a browser may call.
 *   Their records come back into the app, get counted, and feed the gap map
 *   and the citation checks like any other.
 *
 *   HANDED OFF. The subscription databases. The app builds the exact search
 *   for each one and opens it in a tab, where your university login already
 *   works. It cannot read the results, so it does not claim to. Export them
 *   from there as RIS or BibTeX and the Library will take the file.
 *
 * Writing a fake Scopus search that silently returned nothing would be worse
 * than this in every way, and would be invisible — which is the failure this
 * whole application is built against.
 *
 * WHY THE FETCHED LIST IS LONGER THAN IT WAS.
 *
 * One index is never enough, and the advice in the field is to use three to
 * five because single-database searching manufactures false gaps. OpenAlex
 * and Crossref between them still miss most monographs and a great deal of
 * non-English scholarship, which for a Turkish literature department is not
 * a footnote. So: DOAJ, which indexes open-access journals including many
 * national ones the big two skip; Semantic Scholar, whose index is built
 * differently and catches different things; and OpenLibrary, which is about
 * books, and books are where literary scholarship actually lives.
 */
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

const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------ fetchable */

/*
 * DOAJ — the Directory of Open Access Journals.
 *
 * Here for coverage the others lack: national and regional journals,
 * including Turkish ones, that OpenAlex indexes thinly and Scopus largely
 * ignores. Everything in it is open access, so a hit is a hit you can read.
 */
async function searchDoaj(query, { signal, limit = 50 } = {}) {
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${Math.min(100, limit)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw await catalogueError(res, 'DOAJ');
  const data = await res.json();
  return (data.results || []).map((r) => {
    const b = r.bibjson || {};
    const doi = (b.identifier || []).find((i) => i.type === 'doi');
    const link = (b.link || []).find((l) => l.type === 'fulltext');
    return {
      source: 'doaj',
      id: r.id,
      title: clean(b.title),
      authors: (b.author || []).map((a) => clean(a.name)).filter(Boolean),
      year: Number(b.year) || null,
      venue: clean((b.journal || {}).title),
      doi: doi ? doi.id : null,
      url: link ? link.url : (doi ? `https://doi.org/${doi.id}` : null),
      citedBy: 0,
      openAccess: true,
      abstract: clean(b.abstract),
      concepts: (b.keywords || []).slice(0, 6).map(clean).filter(Boolean)
    };
  }).filter((w) => w.title);
}

/*
 * Semantic Scholar.
 *
 * A separately built index, so it fails differently from OpenAlex rather
 * than failing the same way twice. No key for occasional use, though it
 * rate-limits hard, which is why one failure here never fails a search.
 */
async function searchSemanticScholar(query, { signal, limit = 50 } = {}) {
  const fields = 'title,authors,year,abstract,venue,externalIds,citationCount,openAccessPdf,publicationTypes';
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.min(100, limit)}&fields=${fields}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw await catalogueError(res, 'Semantic Scholar');
  const data = await res.json();
  return (data.data || []).map((w) => ({
    source: 'semanticscholar',
    id: w.paperId,
    title: clean(w.title),
    authors: (w.authors || []).map((a) => clean(a.name)).filter(Boolean),
    year: w.year || null,
    venue: clean(w.venue),
    doi: (w.externalIds || {}).DOI || null,
    url: (w.openAccessPdf || {}).url
      || ((w.externalIds || {}).DOI ? `https://doi.org/${w.externalIds.DOI}` : null),
    citedBy: w.citationCount || 0,
    openAccess: Boolean(w.openAccessPdf),
    abstract: clean(w.abstract),
    concepts: (w.publicationTypes || []).map(clean).filter(Boolean)
  })).filter((w) => w.title);
}

/*
 * OpenLibrary — books.
 *
 * The single largest hole in the other catalogues. Literary scholarship is
 * published as monographs and edited collections, and an index of journal
 * articles will tell you a field is empty when it has a shelf of books in
 * it. These records carry no abstract, so they cannot be placed on the gap
 * map; they are listed, countable, and keepable, and the coverage figures
 * say as much rather than quietly treating a book as unplaceable noise.
 */
async function searchOpenLibrary(query, { signal, limit = 40 } = {}) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(100, limit)}`
    + '&fields=key,title,author_name,first_publish_year,publisher,subject,isbn,language';
  const res = await fetch(url, { signal });
  if (!res.ok) throw await catalogueError(res, 'OpenLibrary');
  const data = await res.json();
  return (data.docs || []).map((d) => ({
    source: 'openlibrary',
    id: d.key,
    title: clean(d.title),
    authors: (d.author_name || []).slice(0, 6).map(clean),
    year: d.first_publish_year || null,
    venue: clean((d.publisher || [])[0]),
    type: 'book',
    doi: null,
    url: d.key ? `https://openlibrary.org${d.key}` : null,
    citedBy: 0,
    openAccess: false,
    /* No abstracts in this index. Said plainly rather than faked from the
       subject headings, which would put invented text into the gap map. */
    abstract: '',
    concepts: (d.subject || []).slice(0, 6).map(clean)
  })).filter((w) => w.title);
}

export const FETCHABLE = [
  { id: 'openalex', label: 'OpenAlex', about: '250M works, all fields. The backbone.', always: true },
  { id: 'crossref', label: 'Crossref', about: 'What publishers deposited: chapters and edited volumes.', always: true },
  { id: 'doaj', label: 'DOAJ', about: 'Open-access journals, including national ones the big indexes skip.', run: searchDoaj },
  { id: 'semanticscholar', label: 'Semantic Scholar', about: 'A separately built index, so it misses different things.', run: searchSemanticScholar },
  { id: 'openlibrary', label: 'OpenLibrary', about: 'Books. Where literary scholarship actually lives.', run: searchOpenLibrary, noAbstracts: true }
];

/*
 * Run the extra catalogues and report each one's fate.
 *
 * Settled rather than raced, and never throwing: these are supplements, and
 * a rate-limited Semantic Scholar must not cost you the DOAJ results. What
 * answered and what did not is returned so the page can say so, because a
 * catalogue that silently returned nothing looks exactly like a catalogue
 * with nothing in it.
 */
export async function searchExtras(query, { signal, limit = 50, only = null } = {}) {
  const chosen = FETCHABLE.filter((c) => c.run && (!only || only.includes(c.id)));
  const settled = await Promise.allSettled(chosen.map((c) => c.run(query, { signal, limit })));
  const works = [];
  const status = [];
  chosen.forEach((c, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      works.push(...r.value);
      status.push({ id: c.id, label: c.label, ok: true, count: r.value.length });
    } else {
      status.push({ id: c.id, label: c.label, ok: false, reason: String(r.reason && r.reason.message || r.reason) });
    }
  });
  return { works, status };
}

/* ------------------------------------------------------------ handed off */

/*
 * The subscription databases, as links.
 *
 * Each builds the search you typed into that database's own URL format and
 * opens it in a tab, where your institutional login already applies. The app
 * never sees the results; you export them and bring them back.
 *
 * These URL formats are the ones the sites use publicly and they do change.
 * If one lands on a front page instead of a result list, the query shape has
 * moved and it needs updating — not a reason to distrust the records.
 */
export const HANDOFF = [
  {
    id: 'mla',
    label: 'MLA International Bibliography',
    about: 'The core subject index for literature, 1925 to now: journals, monographs, essay collections, dissertations. Licensed through EBSCO or ProQuest, so the link goes through your library.',
    note: 'If the link asks who you are, search your library catalogue for "MLA International Bibliography" and go in from there.',
    url: (q) => `https://www.ebsco.com/products/research-databases/mla-international-bibliography?query=${encodeURIComponent(q)}`
  },
  {
    id: 'jstor',
    label: 'JSTOR',
    about: 'Deep back-runs of literary journals, and book chapters. Full text, which the open catalogues do not have.',
    url: (q) => `https://www.jstor.org/action/doBasicSearch?Query=${encodeURIComponent(q)}`
  },
  {
    id: 'muse',
    label: 'Project MUSE',
    about: 'Current humanities journals and university-press books, where JSTOR is stronger on the back-run.',
    url: (q) => `https://muse.jhu.edu/search?action=search&query=content:${encodeURIComponent(q)}:and&limit=available_yes`
  },
  {
    id: 'scopus',
    label: 'Scopus',
    about: 'Broader than Web of Science for the humanities and indexes about 400,000 books, though its citation data starts only in 1996.',
    url: (q) => `https://www.scopus.com/results/results.uri?st1=${encodeURIComponent(q)}&sid=&sot=b&sdt=b`
  },
  {
    id: 'proquest',
    label: 'ProQuest Dissertations',
    about: 'What students have already written. A thesis on your exact subject is the fastest way to find out a gap is not one.',
    url: (q) => `https://www.proquest.com/results/?q=${encodeURIComponent(q)}`
  },
  {
    id: 'scholar',
    label: 'Google Scholar',
    about: 'Broad and free, opaque about what it covers. Useful for the "Cited by" trail, not for establishing that something is absent.',
    url: (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`
  },
  {
    id: 'yoktez',
    label: 'YÖK Ulusal Tez Merkezi',
    about: 'Every thesis submitted in Turkey. Not indexed by any of the above, and for work on Turkish literature often the most relevant thing there is.',
    url: () => 'https://tez.yok.gov.tr/UlusalTezMerkezi/',
    manual: true
  },
  {
    id: 'dergipark',
    label: 'DergiPark',
    about: 'Turkish academic journals. Largely invisible to the international indexes.',
    url: (q) => `https://dergipark.org.tr/en/search?q=${encodeURIComponent(q)}&section=articles`
  }
];
