/*
 * search.js — find works, or find a person.
 *
 * "Concise, and does not make things up" is the whole brief, so this tab has
 * no prose layer at all. It shows catalogue records: title, authors, year,
 * venue, citation count, and the abstract the publisher deposited. Nothing is
 * summarised, because a summary is where invention gets in, and because a
 * researcher reading twenty abstracts does not want twenty paraphrases of
 * them.
 *
 * Finding a person is two steps on purpose — see analysis/people.js.
 */
import { el, mount, sheet, tag, toast, clip, empty, figure, table } from '../ui.js';
import { getState, addSources } from '../store.js';
import { searchOpenAlex, searchCrossref } from '../analysis/verify.js';
import { findPeople, worksByAuthor, profile } from '../analysis/people.js';

const S = {
  mode: 'works',
  q: '',
  fromYear: '',
  busy: null,
  works: null,
  people: null,
  person: null,
  personWorks: null,
  picked: new Set()
};

export default function render(root, ctx) {
  mount(root,
    el('h1', { text: 'Find' }),
    el('p', { class: 'lede', text: 'Catalogue records, shown as they come. Nothing on this tab is written by a model, so nothing on it can be invented.' }),

    sheet(null,
      el('div', { class: 'row', style: 'margin-bottom:14px' },
        el('div', { class: 'seg' },
          el('button', { 'aria-pressed': String(S.mode === 'works'), text: 'Works', onClick: () => { S.mode = 'works'; render(root, ctx); } }),
          el('button', { 'aria-pressed': String(S.mode === 'people'), text: 'A person', onClick: () => { S.mode = 'people'; render(root, ctx); } })
        )
      ),
      el('form', { class: 'row', onSubmit: (e) => { e.preventDefault(); run(root, ctx); } },
        el('input', { id: 'find-q', style: 'max-width:420px', value: S.q,
          placeholder: S.mode === 'works' ? 'modernist fiction and empire' : 'e.g. Azade Seyhan',
          onInput: (e) => { S.q = e.target.value; } }),
        S.mode === 'works'
          ? el('input', { style: 'max-width:110px', type: 'number', placeholder: 'from year', value: S.fromYear,
              onInput: (e) => { S.fromYear = e.target.value; } })
          : null,
        el('button', { class: 'solid', type: 'submit', disabled: Boolean(S.busy), text: 'Search' }),
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null
      ),
      el('p', { class: 'note', style: 'margin-top:10px', text: 'OpenAlex and Crossref. Only the words you type are sent. Add a contact address in Settings and the catalogues answer faster.' })
    ),

    S.mode === 'people' ? peopleResults(root, ctx) : workResults(root, ctx)
  );
}

/* ----------------------------------------------------------------- works */

function workResults(root, ctx) {
  if (!S.works) return null;
  const { works, total, source } = S.works;
  if (!works.length) return sheet(null, empty('Nothing came back', 'Try broader words, or drop the year filter.'));
  return sheet(null,
    el('div', { class: 'row', style: 'margin-bottom:16px' },
      el('div', { class: 'note', text: `${works.length} shown of ${total.toLocaleString()} matching in ${source}.` }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'sm', text: `Keep ${S.picked.size || 'selected'}`, disabled: !S.picked.size, onClick: () => keep(root, ctx, works) })
    ),
    works.map((w, i) => workItem(w, i, root, ctx))
  );
}

function workItem(w, i, root, ctx) {
  const on = S.picked.has(i);
  return el('div', { class: 'item' },
    el('div', { class: 'head' },
      el('span', { text: w.year || 'n.d.' }),
      w.venue || w.container ? el('span', { text: clip(w.venue || w.container, 48) }) : null,
      Number.isFinite(w.citedBy) ? el('span', { text: `${w.citedBy} citations` }) : null,
      w.openAccess ? tag('open access') : null
    ),
    el('div', { class: 'title', text: w.title }),
    el('div', { class: 'meta', style: 'margin-bottom:6px', text: (w.authors || []).slice(0, 6).join(', ') || '—' }),
    w.abstract ? el('div', { class: 'body', style: 'font-size:14px', text: clip(w.abstract, 460) }) : el('div', { class: 'note', text: 'No abstract deposited.' }),
    el('div', { class: 'row tight', style: 'margin-top:8px' },
      el('button', { class: 'sm', 'aria-pressed': String(on), text: on ? 'Selected' : 'Select',
        onClick: () => { on ? S.picked.delete(i) : S.picked.add(i); render(root, ctx); } }),
      w.url ? el('a', { href: w.url, target: '_blank', rel: 'noopener', class: 'note', text: 'open ↗' }) : null
    )
  );
}

function keep(root, ctx, works) {
  const chosen = [...S.picked].map((i) => works[i]).filter(Boolean);
  const made = addSources(chosen.map((w) => ({
    title: w.title, authors: w.authors, year: w.year, venue: w.venue || w.container,
    doi: w.doi, url: w.url, abstract: w.abstract, concepts: w.concepts
  })));
  S.picked.clear();
  toast(`${made.length} added to the library${made.length < chosen.length ? `, ${chosen.length - made.length} already there` : ''}.`);
  render(root, ctx);
}

/* ---------------------------------------------------------------- people */

function peopleResults(root, ctx) {
  if (S.person) return personSheet(root, ctx);
  if (!S.people) return null;
  if (!S.people.length) return sheet(null, empty('No one by that name', 'Try the surname alone, or a different spelling.'));
  return sheet('Which one',
    el('p', { class: 'note', style: 'margin-bottom:16px', text: 'A name is not an identifier. Pick the person and their works are fetched by id, so what comes back is theirs rather than everything that mentions the name.' }),
    S.people.map((p) => el('div', { class: 'item' },
      el('div', { class: 'head' },
        el('span', { text: `${p.works} works` }),
        el('span', { text: `${p.cited.toLocaleString()} citations` }),
        p.firstYear ? el('span', { text: `since ${p.firstYear}` }) : null,
        p.orcid ? tag('ORCID') : null
      ),
      el('div', { class: 'title', text: p.name }),
      p.affiliation ? el('div', { class: 'meta', text: p.affiliation }) : null,
      p.topics.length ? el('div', { class: 'meta', text: p.topics.join(' · ') }) : null,
      el('div', { style: 'margin-top:8px' },
        el('button', { class: 'sm', text: 'Show their work', onClick: () => openPerson(p, root, ctx) }))
    ))
  );
}

function personSheet(root, ctx) {
  const p = S.person;
  const pw = S.personWorks;
  if (!pw) return sheet(null, el('div', { class: 'note' }, el('span', { class: 'spin' }), ' Fetching…'));
  const prof = profile(pw.works);
  return el('div', {},
    sheet(null,
      el('div', { class: 'row' },
        el('button', { class: 'bare sm', text: '← other matches', onClick: () => { S.person = null; S.personWorks = null; render(root, ctx); } })
      ),
      el('h1', { style: 'margin-top:10px', text: p.name }),
      p.affiliation ? el('p', { class: 'lede', style: 'margin-bottom:16px', text: p.affiliation }) : null,
      el('div', { class: 'figures' },
        figure('works indexed', pw.total.toLocaleString(), `${pw.works.length} fetched`),
        figure('citations', p.cited.toLocaleString()),
        figure('active', prof.span ? `${prof.span[0]}–${prof.span[1]}` : '—', 'in what was fetched'),
        figure('open access', prof.openAccess, `of ${pw.works.length}`)
      ),
      prof.venues.length ? el('div', { style: 'margin-bottom:12px' },
        el('h2', { text: 'Publishes in' }),
        el('div', { class: 'row tight' }, prof.venues.map((v) => tag(`${clip(v.name, 40)} · ${v.count}`)))) : null,
      prof.coauthors.length ? el('div', {},
        el('h2', { text: 'Writes with' }),
        el('div', { class: 'row tight' }, prof.coauthors.filter((c) => c.name !== p.name).map((c) => tag(`${c.name} · ${c.count}`)))) : null
    ),
    sheet('Works',
      el('div', { class: 'row', style: 'margin-bottom:14px' },
        el('div', { class: 'note', text: 'Most cited first.' }),
        el('div', { class: 'spacer' }),
        el('button', { class: 'sm', text: `Keep ${S.picked.size || 'selected'}`, disabled: !S.picked.size, onClick: () => keep(root, ctx, pw.works) })),
      pw.works.map((w, i) => workItem(w, i, root, ctx))
    )
  );
}

async function openPerson(p, root, ctx) {
  S.person = p;
  S.personWorks = null;
  S.picked.clear();
  render(root, ctx);
  try {
    S.personWorks = await worksByAuthor(p.id);
  } catch (err) {
    toast(err.message);
    S.person = null;
  }
  render(root, ctx);
}

/* ------------------------------------------------------------------- run */

async function run(root, ctx) {
  const q = S.q.trim();
  if (q.length < 2) { toast('Type something to search for.'); return; }
  S.busy = 'Searching…';
  S.picked.clear();
  S.person = null;
  render(root, ctx);
  try {
    if (S.mode === 'people') {
      S.people = await findPeople(q);
    } else {
      const fromYear = S.fromYear ? Number(S.fromYear) : null;
      const [oa, cr] = await Promise.allSettled([
        searchOpenAlex(q, { perPage: 25, fromYear }),
        searchCrossref(q, { rows: 10, fromYear })
      ]);
      if (oa.status === 'fulfilled') {
        /* Crossref fills gaps where OpenAlex has no abstract; duplicates by
           DOI are dropped rather than shown twice. */
        const seen = new Set(oa.value.works.map((w) => (w.doi || w.title).toLowerCase()));
        const extra = cr.status === 'fulfilled'
          ? cr.value.works.filter((w) => !seen.has((w.doi || w.title).toLowerCase()))
          : [];
        S.works = { works: [...oa.value.works, ...extra], total: oa.value.total, source: extra.length ? 'OpenAlex and Crossref' : 'OpenAlex' };
      } else if (cr.status === 'fulfilled') {
        S.works = { ...cr.value, source: 'Crossref (OpenAlex did not answer)' };
      } else {
        throw new Error(oa.reason ? oa.reason.message : 'Neither catalogue answered.');
      }
    }
  } catch (err) {
    toast(err.message);
  }
  S.busy = null;
  render(root, ctx);
}
