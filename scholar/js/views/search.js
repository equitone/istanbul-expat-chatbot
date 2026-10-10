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
import { findPeople, worksByAuthor, profile, worksMentioningName } from '../analysis/people.js';

const S = {
  mode: 'works',
  q: '',
  fromYear: '',
  busy: null,
  works: null,
  people: null,
  person: null,
  personWorks: null,
  loose: null,
  peopleNote: '',
  error: null,
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
          placeholder: S.mode === 'works' ? 'modernist fiction and empire' : 'Günseli İşçi, or an ORCID iD',
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

    errorSheet(root, ctx),
    S.mode === 'people' ? peopleResults(root, ctx) : workResults(root, ctx)
  );
}

/*
 * A search that failed has to say so where the results would have been.
 *
 * It used to raise a toast and nothing else, so a few seconds later the tab
 * looked exactly like a search that had never been run: no results, no
 * explanation, nothing to act on. Whatever the catalogue said is kept on
 * screen instead, because that text names the problem and the alternative is
 * the user guessing.
 */
function errorSheet(root, ctx) {
  const e = S.error;
  if (!e) return null;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return sheet(null,
    el('div', { class: 'item loose' },
      el('div', { class: 'title', text: offline ? 'This computer is offline' : 'The catalogue did not answer' }),
      el('div', { class: 'body', style: 'margin-top:4px', text: offline
        ? 'Nothing can be searched without a connection. Everything else in the app works offline; this tab does not.'
        : 'Nothing was found because the search itself failed, not because there is nothing to find.' }),
      el('pre', { class: 'why', text: e.message }),
      e.url ? el('div', { class: 'note', style: 'margin-top:6px' },
        'Tried: ', el('a', { href: e.url, target: '_blank', rel: 'noopener', text: e.url })) : null,
      el('div', { class: 'row tight', style: 'margin-top:10px' },
        el('button', { class: 'sm', text: 'Try again', onClick: () => run(root, ctx) }))
    )
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
  if (!S.people.length) return el('div', {},
    sheet(null, empty('No one by that name in the author index',
      'OpenAlex lists a person only once it has matched them across several indexed works. Someone early in their career, or publishing mainly in books, often has no entry even though their work is there.')),
    looseResults(root, ctx)
  );
  return sheet('Which one',
    el('p', { class: 'note', style: 'margin-bottom:6px', text: 'A name is not an identifier. Pick the person and their works are fetched by id, so what comes back is theirs rather than everything that mentions the name.' }),
    S.peopleNote ? el('p', { class: 'note', style: 'margin-bottom:16px', text: S.peopleNote }) : null,
    S.people.map((p) => el('div', { class: 'item' },
      el('div', { class: 'head' },
        el('span', { text: `${p.works} works` }),
        el('span', { text: `${p.cited.toLocaleString()} citations` }),
        p.firstYear ? el('span', { text: `since ${p.firstYear}` }) : null,
        p.orcid ? tag('ORCID') : null,
        /* Say when a candidate is several catalogue records folded together,
           because the summed counts below it are otherwise unexplained. */
        p.merged > 1 ? tag(`${p.merged} records folded`, 'firm') : null
      ),
      el('div', { class: 'title', text: p.name }),
      p.affiliation ? el('div', { class: 'meta', text: p.affiliation }) : null,
      p.alternatives && p.alternatives.length
        ? el('div', { class: 'meta', text: `also filed as ${p.alternatives.join(', ')}` }) : null,
      p.topics.length ? el('div', { class: 'meta', text: p.topics.join(' · ') }) : null,
      el('div', { class: 'row tight', style: 'margin-top:8px' },
        el('button', { class: 'sm', text: 'Show their work', onClick: () => openPerson(p, root, ctx) }),
        p.orcid ? el('a', { href: `https://orcid.org/${p.orcid}`, target: '_blank', rel: 'noopener',
          class: 'note', text: `orcid.org/${p.orcid} ↗` }) : null)
    )),
    el('p', { class: 'note', style: 'margin-top:16px', text: 'Not here? Paste their ORCID iD in the box above and it resolves to exactly one person. Failing that, try the surname on its own: a middle or maiden name recorded in one catalogue and not the other is the usual reason someone is missing.' })
  );
}

/*
 * The loose fallback, kept visually separate and labelled, because it is a
 * different kind of answer: a text match on a name, not a resolved person.
 * Work that merely cites them comes back too, so the by-line is marked rather
 * than implied.
 */
function looseResults(root, ctx) {
  if (!S.loose) return null;
  if (!S.loose.works.length) return sheet(null, empty('Nothing under that name either',
    'No indexed work mentions it. Try the surname alone, or the spelling used on the publication.'));
  const onByline = S.loose.works.filter((w) => w.byline).length;
  return sheet('Anything under that name',
    el('p', { class: 'note', style: 'margin-bottom:14px',
      text: `Searched by name rather than resolved to a person, in ${S.loose.catalogues || 'the catalogues'}: ${S.loose.works.length} shown of ${S.loose.total.toLocaleString()}, ${onByline} with the name on the by-line${S.loose.fromCrossref ? `, ${S.loose.fromCrossref} of them from Crossref alone` : ''}. The rest cite it or merely mention it.` }),
    S.loose.works.map((w, i) => el('div', { class: 'item' },
      el('div', { class: 'head' },
        el('span', { text: w.year || 'n.d.' }),
        w.venue ? el('span', { text: clip(w.venue, 44) }) : null,
        el('span', { text: `${w.citedBy} citations` }),
        w.byline ? tag('on the by-line') : tag('mentions only')
      ),
      el('div', { class: 'title', text: w.title }),
      el('div', { class: 'meta', style: 'margin-bottom:6px', text: (w.authors || []).slice(0, 6).join(', ') || '—' }),
      w.abstract ? el('div', { class: 'body', style: 'font-size:14px', text: clip(w.abstract, 320) }) : null,
      el('div', { class: 'row tight', style: 'margin-top:8px' },
        el('button', { class: 'sm', 'aria-pressed': String(S.picked.has(`l${i}`)),
          text: S.picked.has(`l${i}`) ? 'Selected' : 'Select',
          onClick: () => { S.picked.has(`l${i}`) ? S.picked.delete(`l${i}`) : S.picked.add(`l${i}`); render(root, ctx); } }),
        w.url ? el('a', { href: w.url, target: '_blank', rel: 'noopener', class: 'note', text: 'open ↗' }) : null)
    )),
    el('div', { class: 'row', style: 'margin-top:14px' },
      el('div', { class: 'spacer' }),
      el('button', { class: 'sm', text: `Keep ${S.picked.size || 'selected'}`, disabled: !S.picked.size,
        onClick: () => {
          const chosen = [...S.picked].filter((k) => String(k).startsWith('l')).map((k) => S.loose.works[Number(String(k).slice(1))]).filter(Boolean);
          const made = addSources(chosen);
          S.picked.clear();
          toast(`${made.length} added to the library${made.length < chosen.length ? `, ${chosen.length - made.length} already there` : ''}.`);
          render(root, ctx);
        } }))
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
    S.personWorks = await worksByAuthor(p.ids || p.id);
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
  S.loose = null;
  S.error = null;
  render(root, ctx);
  try {
    if (S.mode === 'people') {
      const found = await findPeople(q);
      S.people = found.people;
      S.peopleNote = found.note;
      /*
       * No author record is not the same as nothing published. OpenAlex only
       * creates one once it has disambiguated someone across a few indexed
       * works, so an early-career researcher, or anyone publishing mostly in
       * books, has none. Rather than stopping at "no one by that name", the
       * looser text search runs too and is shown underneath, labelled.
       */
      if (!S.people.length) S.loose = await worksMentioningName(q);
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
        /* Both failed. Report the first catalogue's reason: two stacked
           messages say no more than one and read like a wall. */
        throw oa.reason || cr.reason || new Error('Neither catalogue answered.');
      }
    }
  } catch (err) {
    S.error = { message: friendly(err) };
    if (S.mode === 'people') { S.people = null; S.loose = null; } else { S.works = null; }
  }
  S.busy = null;
  render(root, ctx);
}

/*
 * A browser reports every network failure as the same bare "Failed to fetch",
 * which tells the user nothing about whether to check their wifi, wait, or
 * tell me the app is broken. The catalogue's own words are kept when there
 * are any.
 */
function friendly(err) {
  const m = String((err && err.message) || err || 'Unknown error');
  if (/failed to fetch|networkerror|load failed/i.test(m)) {
    return 'The request never reached the catalogue. That is usually no internet connection, a network that blocks it, or the catalogue being down. (Browser reported: ' + m + ')';
  }
  if (/\b429\b/.test(m)) return m + ' — too many requests in a short time. Wait a minute, and add a contact address in Settings: it puts you in the catalogue\'s faster pool.';
  if (/\b403\b/.test(m)) return m + ' — the catalogue rejected the request itself, not the words you searched for.';
  return m;
}
