/*
 * people.js — find a person, then find what they wrote.
 *
 * Searching works by an author's name and hoping is unreliable: OpenAlex has
 * several thousand people called Li Wang, and a plain works search on a name
 * returns anything that mentions it, including papers that merely cite them.
 * So this is two steps. Resolve the NAME to candidate author records first,
 * showing enough to tell them apart — institution, field, how much they have
 * published — and only then fetch that person's works by their id.
 *
 * The second step is exact. The first is a guess, and is labelled as one.
 */
const AUTHORS = 'https://api.openalex.org/authors';
const WORKS = 'https://api.openalex.org/works';

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

/** Candidate people for a typed name, most-published first. */
export async function findPeople(name, { signal, perPage = 10 } = {}) {
  const params = withMail(new URLSearchParams({ search: String(name || '').trim(), 'per-page': String(perPage) }));
  const res = await fetch(`${AUTHORS}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'OpenAlex');
  const data = await res.json();
  return (data.results || []).map((a) => ({
    id: a.id,
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
    firstYear: (a.counts_by_year || []).map((c) => c.year).sort()[0] || null
  }));
}

/** Everything OpenAlex has for one resolved author id. */
export async function worksByAuthor(authorId, { signal, perPage = 50, sort = 'cited_by_count:desc' } = {}) {
  const params = withMail(new URLSearchParams({
    filter: `author.id:${String(authorId).replace('https://openalex.org/', '')}`,
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
  const params = withMail(new URLSearchParams({
    search: String(name || '').trim(),
    'per-page': String(perPage),
    sort: 'relevance_score:desc'
  }));
  const res = await fetch(`${WORKS}?${params}`, { signal });
  if (!res.ok) throw await catalogueError(res, 'OpenAlex');
  const data = await res.json();
  const wanted = String(name || '').trim().toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return {
    total: data.meta ? data.meta.count : 0,
    works: (data.results || []).map((w) => {
      const authors = (w.authorships || []).map((x) => (x.author || {}).display_name).filter(Boolean);
      /* Whether the name is on the by-line or only in the text, said plainly
         rather than left for the reader to spot. */
      const byline = authors.some((a) => {
        const low = a.toLowerCase();
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
