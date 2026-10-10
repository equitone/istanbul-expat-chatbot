/*
 * people.js — find a person, then find what they wrote.
 *
 * TWO STEPS, ON PURPOSE. Searching works by an author's name and hoping is
 * unreliable: OpenAlex has several thousand people called Li Wang, and a
 * plain works search on a name returns anything that mentions it, including
 * papers that merely cite them. So the name resolves to candidate author
 * records first, with enough detail to tell them apart, and only then are
 * that person's works fetched by id. The second step is exact. The first is
 * a guess, and is labelled as one.
 *
 * WHY ONE SEARCH MISSES PEOPLE, AND WHAT IS DONE ABOUT IT.
 *
 * A single query against the author index finds a fraction of who is there,
 * and the gaps fall hardest on exactly the scholars this app is for.
 *
 *   Spelling. "İşçi" and "Isci" are different strings. A record deposited by
 *   a publisher that stripped the diacritics will not match a search typed
 *   with them, or the reverse. Every search therefore runs in both forms.
 *
 *   Split records. OpenAlex disambiguates automatically, and gets it wrong
 *   in both directions. One person routinely appears as two or three
 *   records — "Günseli Sönmez İşçi" with two works and "Günseli İşçi" with
 *   one — each looking like a thin career. Records whose names are
 *   compatible are grouped into one candidate and their works fetched from
 *   every id at once.
 *
 *   Missing records. An author record exists only once OpenAlex has matched
 *   someone across several indexed works. Early-career researchers, and
 *   anyone publishing mainly in books or in national journals, have none at
 *   all. So the by-line of the works themselves is searched too, and
 *   Crossref is asked separately, because it holds what publishers
 *   deposited rather than what OpenAlex inferred.
 *
 *   Given names. A middle name, a maiden name, an initial: all of them make
 *   the full string miss. When the full name finds little, the surname is
 *   searched on its own.
 *
 * None of this makes the search complete, and the tab says so. Monographs
 * and Turkish-language scholarship are thin in both catalogues, and no
 * amount of querying invents what was never indexed.
 */
import { nameKey } from '../turkish.js';
import { searchExtras } from './catalogues.js';

const AUTHORS = 'https://api.openalex.org/authors';
const WORKS = 'https://api.openalex.org/works';
const CROSSREF = 'https://api.crossref.org/works';

let contact = '';
export const setContactEmail = (email) => { contact = String(email || '').trim(); };

const withMail = (params) => { if (contact) params.set('mailto', contact); return params; };

/*
 * What the catalogue actually said.
 *
 * `OpenAlex returned 403` is useless on its own: 403 is the answer to an
 * unknown or malformed query parameter, and the body names the parameter.
 * Discarding it turns a one-line fix into guesswork.
 */
async function catalogueError(res, who) {
  let detail = '';
  try {
    const body = await res.text();
    try { const j = JSON.parse(body); detail = j.message || j.error || ''; }
    catch { detail = body.slice(0, 200); }
  } catch { /* nothing readable */ }
  return new Error(`${who} returned ${res.status}${detail ? `: ${detail.trim()}` : '.'}`);
}

function rebuildAbstract(inverted) {
  if (!inverted) return '';
  const slots = [];
  for (const [word, positions] of Object.entries(inverted)) {
    positions.forEach((p) => { slots[p] = word; });
  }
  return slots.join(' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------- name handling */

/*
 * The spellings one name can be filed under.
 *
 * Diacritics are stripped to give the ASCII form a publisher may have
 * deposited. `ı` and `İ` need naming explicitly: dotless i does not
 * decompose at all, and capital dotted I decomposes to I plus a combining
 * mark, so neither survives the usual accent-stripping intact.
 */
export function nameVariants(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return [];
  const out = new Set([s]);
  const ascii = s
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (ascii !== s) out.add(ascii);
  return [...out];
}

/** The last word of a name, which for Turkish records is the surname. */
export const surnameOf = (raw) => {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

/*
 * Could these two records be the same person?
 *
 * True when the shorter name's parts are all present in the longer one and
 * the surnames agree. That is the shape the real cases take: a middle name
 * or a maiden name present in one record and absent from the other
 * ("Günseli İşçi" against "Günseli Sönmez İşçi"), or an initial standing in
 * for a given name.
 *
 * It is deliberately not clever. Merging two people who merely share a
 * surname would be worse than leaving one person split, because a split is
 * visible on screen and a bad merge is not — so the surname must match in
 * full, and a lone initial only matches a given name beginning with it.
 */
export function compatibleNames(a, b) {
  const pa = nameKey(a).split(' ').filter(Boolean);
  const pb = nameKey(b).split(' ').filter(Boolean);
  if (!pa.length || !pb.length) return false;
  if (pa[pa.length - 1] !== pb[pb.length - 1]) return false;

  const [short, long] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  return short.every((part) => long.some((other) =>
    other === part
    || (part.length === 1 && other.startsWith(part))
    || (other.length === 1 && part.startsWith(other))));
}

/* ----------------------------------------------------------- the search */

const toCandidate = (a) => ({
  id: a.id,
  ids: [a.id],
  name: a.display_name || '',
  alternatives: (a.display_name_alternatives || []).slice(0, 4),
  orcid: a.orcid ? String(a.orcid).replace('https://orcid.org/', '') : null,
  works: a.works_count || 0,
  cited: a.cited_by_count || 0,
  /* OpenAlex replaced `last_known_institution` with a plural array. Both
     shapes are read, because a record fetched from a cache may be either
     and an affiliation is most of what tells two people of one name apart. */
  affiliation: (a.last_known_institutions || [])[0]?.display_name
    || a.last_known_institution?.display_name
    || (a.affiliations || [])[0]?.institution?.display_name || '',
  topics: (a.topics || a.x_concepts || []).slice(0, 4).map((c) => c.display_name).filter(Boolean),
  firstYear: (a.counts_by_year || []).map((c) => c.year).sort()[0] || null,
  merged: 1
});

async function authorPage(query, { signal, perPage }) {
  const params = withMail(new URLSearchParams({ search: query, 'per-page': String(perPage) }));
  const res = await fetch(`${AUTHORS}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'OpenAlex');
  const data = await res.json();
  return (data.results || []).map(toCandidate);
}

/*
 * Fold records that are plainly the same person into one candidate.
 *
 * The longest name wins as the display name, because it is the one carrying
 * the middle or maiden name and is therefore the more complete record. Work
 * and citation counts are summed, since each OpenAlex record counts only
 * what it was given; the group reports how many records it stands for so
 * nobody reads a summed figure as a single catalogue claim.
 */
function mergeCandidates(list) {
  const groups = [];
  for (const c of list) {
    const hit = groups.find((g) => g.ids.includes(c.id) || compatibleNames(g.name, c.name));
    if (!hit) { groups.push({ ...c }); continue; }
    if (hit.ids.includes(c.id)) continue;
    hit.ids.push(c.id);
    hit.merged += 1;
    hit.works += c.works;
    hit.cited += c.cited;
    hit.orcid = hit.orcid || c.orcid;
    hit.affiliation = hit.affiliation || c.affiliation;
    hit.topics = [...new Set([...hit.topics, ...c.topics])].slice(0, 5);
    hit.firstYear = [hit.firstYear, c.firstYear].filter(Boolean).sort()[0] || null;
    if (c.name.length > hit.name.length) {
      hit.alternatives = [...new Set([hit.name, ...hit.alternatives, ...c.alternatives])].slice(0, 4);
      hit.name = c.name;
    } else {
      hit.alternatives = [...new Set([...hit.alternatives, c.name, ...c.alternatives])].slice(0, 4);
    }
  }
  return groups;
}

/*
 * Order by who was asked for.
 *
 * Sorting on output alone puts the most prolific stranger who shares a
 * surname at the top — a mechanical engineer with thirty papers above the
 * literary scholar actually being looked for. Candidates whose name is
 * compatible with what was typed come first, then those that at least
 * contain every word of it, and only then is prolificacy a tiebreak.
 */
function rankByQuery(groups, typed) {
  const want = nameKey(typed).split(' ').filter(Boolean);
  const score = (g) => {
    if (compatibleNames(g.name, typed)) return 0;
    const names = [g.name, ...(g.alternatives || [])].map(nameKey);
    if (names.some((n) => compatibleNames(n, typed))) return 0;
    const key = nameKey(g.name);
    if (want.every((w) => key.includes(w))) return 1;
    return 2;
  };
  return groups.sort((a, b) => score(a) - score(b) || b.works - a.works);
}

/*
 * Candidate people for a typed name.
 *
 * Returns {people, tried, note} rather than a bare list: what was searched
 * for is part of the answer, because a user who sees three results needs to
 * know whether that was one query or five.
 */
export async function findPeople(name, { signal, perPage = 25 } = {}) {
  const typed = String(name || '').trim();
  if (!typed) return { people: [], tried: [], note: '' };

  /* An ORCID iD is an identifier, not a name: no guessing required. */
  const orcid = typed.match(/\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/i);
  if (orcid) {
    const found = await byOrcid(orcid[1], { signal });
    return {
      people: found ? [found] : [],
      tried: [`ORCID ${orcid[1]}`],
      note: found
        ? 'Resolved from the ORCID iD, so this is the right person with no guessing.'
        : `No OpenAlex record carries ORCID ${orcid[1]}. The iD may be valid and simply unlinked to any indexed work.`
    };
  }

  const tried = [];
  const seen = new Set();
  const all = [];
  const run = async (q) => {
    /*
     * Deduped on the literal string, not the folded key.
     *
     * "Günseli İşçi" and "Gunseli Isci" fold to the same key — that is what
     * the folding is for — but they are different strings to the catalogue,
     * and searching only one of them is precisely the failure the variants
     * exist to fix. Folding here would have silently thrown away the second
     * query and left the feature doing nothing.
     */
    const key = q.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    tried.push(q);
    all.push(...await authorPage(q, { signal, perPage }));
  };

  for (const v of nameVariants(typed)) await run(v);

  /*
   * Still thin? Try the surname alone.
   *
   * This is where a middle name, a maiden name or an initial recorded
   * differently from how it was typed stops hiding the person. It widens the
   * result set, which is the right trade when the alternative is an empty
   * page, and the grouping below keeps it readable.
   */
  const grouped = mergeCandidates(all);
  if (grouped.length < 5) {
    for (const v of nameVariants(surnameOf(typed))) await run(v);
  }

  const people = rankByQuery(mergeCandidates(all), typed);
  const split = people.filter((p) => p.merged > 1).length;
  const loose = people.filter((p) => !compatibleNames(p.name, typed)).length;
  return {
    people,
    tried,
    note: [
      `Searched ${tried.length} spelling${tried.length === 1 ? '' : 's'}: ${tried.join(', ')}.`,
      split ? `${split} candidate${split === 1 ? '' : 's'} below ${split === 1 ? 'is' : 'are'} more than one catalogue record folded together — OpenAlex had split the same person, and the works are fetched from all of them.` : '',
      loose ? `The last ${loose} share the surname but not the full name; they are kept in case the given name is recorded differently from how you typed it.` : ''
    ].filter(Boolean).join(' ')
  };
}

/* An ORCID iD resolves to exactly one person, through OpenAlex, with no key. */
export async function byOrcid(id, { signal } = {}) {
  const clean = String(id).trim().replace(/^https?:\/\/orcid\.org\//, '');
  const params = withMail(new URLSearchParams({ filter: `orcid:${clean}`, 'per-page': '5' }));
  const res = await fetch(`${AUTHORS}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'OpenAlex');
  const data = await res.json();
  const list = (data.results || []).map(toCandidate);
  if (!list.length) return null;
  const merged = mergeCandidates(list);
  return merged[0];
}

/*
 * Everything OpenAlex has for a resolved person.
 *
 * Takes one id or several, because a person folded back together from split
 * records has several. OpenAlex's author filter accepts a pipe-separated
 * list as OR, so this stays one request however many records the person was
 * scattered across.
 */
export async function worksByAuthor(authorId, { signal, perPage = 100, sort = 'cited_by_count:desc' } = {}) {
  const ids = (Array.isArray(authorId) ? authorId : [authorId])
    .map((x) => String(x).replace('https://openalex.org/', ''))
    .filter(Boolean);
  const params = withMail(new URLSearchParams({
    filter: `author.id:${ids.join('|')}`,
    'per-page': String(perPage),
    sort
  }));
  const res = await fetch(`${WORKS}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'OpenAlex');
  const data = await res.json();
  return {
    total: data.meta ? data.meta.count : 0,
    works: (data.results || []).map((w) => ({
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
      concepts: (w.concepts || []).slice(0, 5).map((c) => c.display_name)
    }))
  };
}

/** A short, factual profile from the works themselves — no prose, no model. */
export function profile(works) {
  const years = works.map((w) => w.year).filter(Boolean).sort();
  const venues = new Map();
  const coauthors = new Map();
  works.forEach((w) => {
    if (w.venue) venues.set(w.venue, (venues.get(w.venue) || 0) + 1);
    w.authors.slice(0, 8).forEach((a) => coauthors.set(a, (coauthors.get(a) || 0) + 1));
  });
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    span: years.length ? [years[0], years[years.length - 1]] : null,
    venues: top(venues, 5).map(([k, v]) => ({ name: k, count: v })),
    coauthors: top(coauthors, 6).map(([k, v]) => ({ name: k, count: v })),
    openAccess: works.filter((w) => w.openAccess).length,
    mostCited: [...works].sort((a, b) => b.citedBy - a.citedBy)[0] || null
  };
}

/*
 * When no author record matches the name.
 *
 * OpenAlex only has an author record for someone it has disambiguated, which
 * takes a few indexed works. A new researcher, or someone publishing mostly
 * in books or in a language the catalogues cover thinly, will have none, and
 * the two-step lookup then correctly finds nobody. This is the loose fallback
 * and is labelled as one: a plain text search, so it returns anything that
 * mentions the name, the person's own work and work that merely cites them
 * alike. It answers "is there anything at all under this name", which is the
 * question someone asks after an empty result.
 */
export async function worksMentioningName(name, { signal, perPage = 25 } = {}) {
  const [oa, cr, ex] = await Promise.allSettled([
    openalexMentions(name, { signal, perPage }),
    crossrefByAuthor(name, { signal, rows: perPage }),
    /* The same supplementary indexes the topic search uses. A person whose
       work is in a national journal or in books is exactly who the big two
       miss, so this is where they most often turn up. */
    searchExtras(name, { signal, limit: perPage })
  ]);
  if (oa.status === 'rejected' && cr.status === 'rejected' && ex.status === 'rejected') throw oa.reason;

  const base = oa.status === 'fulfilled' ? oa.value : { total: 0, works: [] };
  const fromCr = cr.status === 'fulfilled' ? cr.value : [];
  const fromEx = ex.status === 'fulfilled' ? ex.value : { works: [], status: [] };

  /* A name on the by-line, folded so spelling does not decide it. */
  const wanted = nameKey(name).split(' ').filter((w) => w.length > 2);
  const onByline = (authors) => (authors || []).some((a) => {
    const k = nameKey(a);
    return wanted.every((part) => k.includes(part));
  });

  const seen = new Set(base.works.map((w) => String(w.doi || w.title).toLowerCase()));
  const added = [];
  for (const w of [...fromCr, ...fromEx.works]) {
    const key = String(w.doi || w.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push({ ...w, byline: w.byline !== undefined ? w.byline : onByline(w.authors) });
  }

  const answered = (fromEx.status || []).filter((x) => x.ok && x.count);
  return {
    total: base.total + added.length,
    fromCrossref: fromCr.length,
    fromExtras: fromEx.status || [],
    catalogues: [
      oa.status === 'fulfilled' ? 'OpenAlex' : '',
      cr.status === 'fulfilled' ? 'Crossref' : '',
      ...answered.map((a) => a.label)
    ].filter(Boolean).join(', ') || 'no catalogue',
    works: [...base.works, ...added].sort((a, b) => Number(b.byline) - Number(a.byline) || b.citedBy - a.citedBy)
  };
}

/*
 * Crossref, asked for an author directly.
 *
 * `query.author` searches the deposited by-line rather than the full text,
 * so it finds work by someone OpenAlex has never built an author record
 * for — which is the whole reason this path exists. Chapters and edited
 * volumes in particular reach Crossref and not OpenAlex.
 */
async function crossrefByAuthor(name, { signal, rows = 25 } = {}) {
  const params = withMail(new URLSearchParams({
    'query.author': String(name || '').trim(),
    rows: String(rows),
    select: 'DOI,title,author,issued,container-title,type,URL,abstract,is-referenced-by-count'
  }));
  const res = await fetch(`${CROSSREF}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'Crossref');
  const data = await res.json();
  const wanted = nameKey(name).split(' ').filter((w) => w.length > 2);
  return (data.message.items || []).map((it) => {
    const authors = (it.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
    return {
      source: 'crossref',
      id: it.DOI,
      title: (it.title || [])[0] || '',
      authors,
      byline: authors.some((a) => { const k = nameKey(a); return wanted.every((part) => k.includes(part)); }),
      year: ((it.issued || {})['date-parts'] || [[null]])[0][0] || null,
      venue: (it['container-title'] || [])[0] || '',
      doi: it.DOI || null,
      url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : null),
      citedBy: it['is-referenced-by-count'] || 0,
      openAccess: false,
      abstract: String(it.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      concepts: []
    };
  }).filter((w) => w.title);
}

async function openalexMentions(name, { signal, perPage = 25 } = {}) {
  const params = withMail(new URLSearchParams({
    search: String(name || '').trim(),
    'per-page': String(perPage),
    sort: 'relevance_score:desc'
  }));
  const res = await fetch(`${WORKS}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'OpenAlex');
  const data = await res.json();
  /* Folded, so "İşçi" on the by-line matches "Isci" typed, and the reverse. */
  const wanted = nameKey(name).split(' ').filter((w) => w.length > 2);
  return {
    total: data.meta ? data.meta.count : 0,
    works: (data.results || []).map((w) => {
      const authors = (w.authorships || []).map((x) => (x.author || {}).display_name).filter(Boolean);
      /* Whether the name is on the by-line or only in the text, said plainly
         rather than left for the reader to spot. */
      const byline = authors.some((a) => {
        const low = nameKey(a);
        return wanted.every((part) => low.includes(part));
      });
      return {
        source: 'openalex',
        id: w.id,
        title: w.display_name || '',
        authors,
        byline,
        year: w.publication_year || null,
        venue: ((w.primary_location || {}).source || {}).display_name || '',
        doi: w.doi ? String(w.doi).replace('https://doi.org/', '') : null,
        url: w.doi || w.id || null,
        citedBy: w.cited_by_count || 0,
        openAccess: Boolean((w.open_access || {}).is_oa),
        abstract: rebuildAbstract(w.abstract_inverted_index),
        concepts: (w.concepts || []).slice(0, 5).map((c) => c.display_name)
      };
    }).sort((a, b) => Number(b.byline) - Number(a.byline) || b.citedBy - a.citedBy)
  };
}
