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
  const params = withMail(new URLSearchParams({ search: String(name || '').trim(), per_page: String(perPage) }));
  const res = await fetch(`${AUTHORS}?${params}`, { signal });
  if (!res.ok) throw new Error(`OpenAlex returned ${res.status} for the author search.`);
  const data = await res.json();
  return (data.results || []).map((a) => ({
    id: a.id,
    name: a.display_name || '',
    alternatives: (a.display_name_alternatives || []).slice(0, 4),
    orcid: a.orcid ? String(a.orcid).replace('https://orcid.org/', '') : null,
    works: a.works_count || 0,
    cited: a.cited_by_count || 0,
    affiliation: (a.last_known_institution || {}).display_name
      || ((a.affiliations || [])[0] || {}).institution?.display_name || '',
    topics: (a.topics || a.x_concepts || []).slice(0, 4).map((c) => c.display_name).filter(Boolean),
    firstYear: (a.counts_by_year || []).map((c) => c.year).sort()[0] || null
  }));
}

/** Everything OpenAlex has for one resolved author id. */
export async function worksByAuthor(authorId, { signal, perPage = 50, sort = 'cited_by_count:desc' } = {}) {
  const params = withMail(new URLSearchParams({
    filter: `author.id:${String(authorId).replace('https://openalex.org/', '')}`,
    per_page: String(perPage),
    sort
  }));
  const res = await fetch(`${WORKS}?${params}`, { signal });
  if (!res.ok) throw new Error(`OpenAlex returned ${res.status} for that author's works.`);
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
