/*
 * gaps.js — holes in the published record, or in your own reading.
 *
 * It used to do only the second. You had to collect sources by hand before it
 * would say anything, and on a fresh install it answered "not enough to
 * cross-tabulate", which is true and useless. The caution behind that was
 * right — a model asked "what are the gaps in X" invents fluent, unfalsifiable
 * holes and sometimes cites work that does not exist — but the cure was
 * wrong. The fix is to retrieve a real corpus, not to refuse to look.
 *
 * So the default now searches the catalogues: a few hundred real records for
 * a field you name, cross-tabulated the same way. Every work behind every
 * count has a DOI you can open. The model still never answers "what are the
 * gaps"; it is handed counted crossings and asked what question each implies,
 * and anything it says that names a work not in the retrieved set is
 * discarded before you see it.
 *
 * The honest limit, carried on every result: this is a sample of an indexed
 * catalogue, not the literature. "Nothing in these 400 works does this" is
 * the only claim it can make.
 */
import { el, mount, sheet, tag, toast, clip, empty, figure, table } from '../ui.js';
import { getState, addSources } from '../store.js';
import { coverageMap, findHoles, findThin, buildGapPrompt, validateGaps, AXES } from '../analysis/gaps.js';
import { gatherCorpus } from '../analysis/gather.js';
import { ask, isConfigured } from '../ai.js';

const S = {
  scope: 'record',    /* 'record' = the catalogues, 'library' = what you hold */
  query: '',
  statement: '',
  fromYear: '',
  depth: 300,
  result: null,
  corpus: null,
  busy: null,
  error: null
};

export default function render(root, ctx) {
  const s = getState();
  const usable = s.sources.filter((x) => (x.abstract || x.text || '').length > 40);

  mount(root,
    el('h1', { text: 'Gaps' }),
    el('p', { class: 'lede', text: 'Works are placed on four axes — framework, period, method, region — and the crossings where two well-represented areas never meet are counted. Search the catalogues for a field, or map only what you have collected.' }),

    sheet(null,
      el('div', { class: 'row', style: 'margin-bottom:16px' },
        el('div', { class: 'seg' },
          el('button', { 'aria-pressed': String(S.scope === 'record'), text: 'The published record',
            onClick: () => { S.scope = 'record'; S.result = null; S.error = null; render(root, ctx); } }),
          el('button', { 'aria-pressed': String(S.scope === 'library'), text: `My library (${usable.length})`,
            onClick: () => { S.scope = 'library'; S.result = null; S.error = null; render(root, ctx); } })
        )
      ),
      S.scope === 'record' ? recordControls(root, ctx) : libraryControls(root, ctx, usable)
    ),

    S.error ? errorSheet(root, ctx) : null,
    S.result ? results(S.result, root, ctx) : null
  );
}

function recordControls(root, ctx) {
  const s = getState();
  return el('div', {},
    el('form', { onSubmit: (e) => { e.preventDefault(); runRecord(root, ctx); } },
      el('label', { class: 'field' },
        el('span', { text: 'The field to map' }),
        el('input', { id: 'gaps-q', value: S.query,
          placeholder: 'Turkish novel translation reception',
          onInput: (e) => { S.query = e.target.value; } })),
      el('div', { class: 'cols' },
        el('label', { class: 'field' },
          el('span', { text: 'Published since (optional)' }),
          el('input', { type: 'number', value: S.fromYear, placeholder: 'e.g. 1990',
            onInput: (e) => { S.fromYear = e.target.value; } })),
        el('label', { class: 'field' },
          el('span', { text: 'How many works to examine' }),
          el('select', { onChange: (e) => { S.depth = Number(e.target.value); } },
            el('option', { value: '200', selected: S.depth === 200, text: '200 — quick' }),
            el('option', { value: '300', selected: S.depth === 300, text: '300 — usual' }),
            el('option', { value: '600', selected: S.depth === 600, text: '600 — thorough, slower' })))),
      el('label', { class: 'field' },
        el('span', { text: 'Your claim, if you have one (optional)' }),
        el('textarea', { id: 'gaps-claim', rows: 2, value: S.statement,
          placeholder: 'Leave empty to map the field as a whole.',
          onInput: (e) => { S.statement = e.target.value; } })),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { id: 'gaps-run', class: 'solid', type: 'submit', disabled: Boolean(S.busy),
          text: 'Search and map' }),
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null)
    ),
    el('p', { class: 'note', style: 'margin-top:12px' },
      'Real catalogue records from OpenAlex and Crossref, fetched now. Only the words you type are sent. ',
      isConfigured(s.settings)
        ? 'A model reads the counted crossings afterwards and may not mention any work that was not retrieved.'
        : el('span', {}, 'No model set up, so you get the counted crossings without the write-up. ',
            el('a', { href: '#settings', onClick: (e) => { e.preventDefault(); ctx.go('settings'); }, text: 'Add one' })))
  );
}

function libraryControls(root, ctx, usable) {
  const s = getState();
  if (usable.length < 6) {
    return empty('Not enough collected to cross-tabulate',
      `${usable.length} source(s) carry enough text to place. A hole found in five papers is a fact about the five papers. Search the published record instead, or add sources.`,
      el('div', { class: 'row' },
        el('button', { class: 'solid', text: 'Search the record', onClick: () => { S.scope = 'record'; render(root, ctx); } }),
        el('button', { class: 'sm', text: 'Add sources', onClick: () => ctx.go('library') })));
  }
  return el('div', {},
    el('label', { class: 'field' },
      el('span', { text: 'Your claim, if you have one (optional)' }),
      el('textarea', { id: 'gaps-claim', rows: 2, value: S.statement,
        placeholder: 'Leave empty to map the library as a whole.',
        onInput: (e) => { S.statement = e.target.value; } })),
    el('div', { class: 'row' },
      el('button', { id: 'gaps-run', class: 'solid', disabled: Boolean(S.busy),
        text: `Map ${usable.length} collected sources`, onClick: () => runLibrary(root, ctx, usable) }),
      S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null),
    el('p', { class: 'note', style: 'margin-top:10px', text: 'This maps only what you hold, so a hole here is a hole in your reading. Useful to know, and a different question from what the field has covered.' })
  );
}

function errorSheet(root, ctx) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return sheet(null,
    el('div', { class: 'item loose' },
      el('div', { class: 'title', text: offline ? 'This computer is offline' : 'The catalogue did not answer' }),
      el('div', { class: 'body', style: 'margin-top:4px', text: offline
        ? 'Mapping the published record needs a connection. Mapping your own library does not.'
        : 'Nothing was mapped because the retrieval failed, not because the field is empty.' }),
      el('pre', { class: 'why', text: S.error }),
      el('div', { class: 'row tight', style: 'margin-top:10px' },
        el('button', { class: 'sm', text: 'Try again', onClick: () => runRecord(root, ctx) }),
        el('button', { class: 'bare sm', text: 'Map my library instead', onClick: () => { S.scope = 'library'; S.error = null; render(root, ctx); } }))
    )
  );
}

function results(r, root, ctx) {
  const c = r.map.coverage;
  const fromRecord = Boolean(r.corpus);
  return el('div', {},
    sheet('What this is based on',
      el('div', { class: 'figures' },
        figure(fromRecord ? 'works examined' : 'sources mapped', c.works),
        figure('with an abstract', c.withAbstract, c.withAbstract < c.works * 0.6 ? 'thin — placement is less certain' : ''),
        figure('placed on an axis', c.works - c.unplaced, c.unplaced ? `${c.unplaced} carried no marker` : 'all of them'),
        figure('years', c.earliest ? `${c.earliest}–${c.latest}` : '—')
      ),
      fromRecord
        ? el('div', {},
            el('p', { class: 'note', text: r.corpus.note }),
            el('p', { class: 'note', style: 'margin-top:6px', text: `Everything below means “nothing in these ${c.works} works”. It is a statement about a sample of an indexed catalogue, never about the discipline.` }),
            el('div', { class: 'row tight', style: 'margin-top:10px' },
              el('button', { class: 'sm', text: `Keep all ${r.corpus.placeable.length} in my library`,
                onClick: () => {
                  const made = addSources(r.corpus.placeable);
                  toast(`${made.length} added${made.length < r.corpus.placeable.length ? `, ${r.corpus.placeable.length - made.length} already there` : ''}.`);
                } })))
        : el('p', { class: 'note', text: `Everything below means “nothing in these ${c.works} sources”. A hole here may simply be a hole in your reading, which is a useful thing to find out.` })
    ),

    r.gaps && r.gaps.length
      ? sheet('Questions these holes imply',
          r.note ? el('p', { class: 'note', style: 'margin-bottom:14px', text: r.note }) : null,
          r.dropped
            ? el('div', { class: 'item loose', style: 'margin-bottom:16px' },
                el('div', { class: 'head' }, el('span', { text: 'discarded' })),
                el('div', { class: 'body', text: `${r.dropped} suggestion(s) were dropped before you saw them: they cited a work that was not retrieved, or carried no question. A model that invents a citation has told you something about the rest of its answer.` }))
            : null,
          r.gaps.map((g) => el('div', { class: 'item said' },
            el('div', { class: 'head' },
              el('span', { text: g.kind === 'opportunity' ? 'opportunity' : g.kind === 'harder' ? 'harder than it looks' : 'probably a category error' }),
              g.scale ? el('span', { text: g.scale }) : null),
            el('div', { class: 'title', text: g.question }),
            g.why ? el('div', { class: 'body', text: g.why }) : null,
            g.needs ? el('div', { class: 'meta', style: 'margin-top:5px', text: `Would need: ${g.needs}` }) : null,
            g.caveat ? el('div', { class: 'meta', style: 'font-style:italic', text: g.caveat }) : null,
            g.works.length ? el('div', { class: 'row tight', style: 'margin-top:8px' },
              g.works.map((w) => tag(clip(w.title, 54)))) : null
          )))
      : null,

    el('div', { class: 'cols' },
      sheet('Empty crossings',
        el('p', { class: 'note', style: 'margin-bottom:12px', text: 'Both sides well represented, nothing on both. Counted.' }),
        r.holes.length
          ? table(['Crossing', { label: 'one', n: true }, { label: 'other', n: true }],
              r.holes.slice(0, 12).map((h) => [
                el('td', { class: 'wrap' },
                  el('div', { style: 'font-family:var(--serif);font-size:15px', text: `${h.labels[0]} × ${h.labels[1]}` }),
                  el('div', { class: 'meta', text: `${h.axisLabels[0]} × ${h.axisLabels[1]}` })),
                el('td', { class: 'n', text: String(h.counts[0]) }),
                el('td', { class: 'n', text: String(h.counts[1]) })
              ]))
          : el('p', { class: 'note', text: 'No crossing had both sides populated enough to mean anything. Either the query is too narrow, or the field really does cluster in one corner. Try broader words, or examine more works.' })
      ),
      sheet('Barely occupied',
        el('p', { class: 'note', style: 'margin-bottom:12px', text: 'One or two works on the crossing. Often the better opening: someone thought it worth doing and there is something to argue with.' }),
        r.thin.length
          ? r.thin.slice(0, 6).map((t) => el('div', { class: 'item' },
              el('div', { class: 'head' }, el('span', { text: `${t.cell} work${t.cell === 1 ? '' : 's'}` })),
              el('div', { class: 'title', style: 'font-size:15px', text: `${t.labels[0]} × ${t.labels[1]}` }),
              el('div', { class: 'meta', text: t.works.map((w) => `${w.title}${w.year ? ` (${w.year})` : ''}`).join(' · ') })))
          : el('p', { class: 'note', text: 'Nothing sitting on exactly one or two.' })
      )
    ),

    sheet('How the works are distributed',
      el('p', { class: 'note', style: 'margin-bottom:14px', text: 'The margins the crossings are computed from. If an axis looks wrong, the holes built on it are wrong too. This is the working.' }),
      AXES.map((a) => {
        const m = r.map.marginals[a.id];
        if (!m.length) return null;
        return el('div', { style: 'margin-bottom:12px' },
          el('h2', { style: 'margin-bottom:6px', text: a.label }),
          el('div', { class: 'row tight' }, m.map((x) => tag(`${x.label} · ${x.count}`, x.count >= 3 ? 'firm' : ''))));
      })
    )
  );
}

/* ------------------------------------------------------------------ runs */

async function runRecord(root, ctx) {
  const s = getState();
  if (S.query.trim().length < 3) { toast('Name the field first.'); return; }
  S.busy = 'Searching the catalogues…';
  S.result = null;
  S.error = null;
  render(root, ctx);

  try {
    const corpus = await gatherCorpus(S.query, {
      want: S.depth,
      fromYear: S.fromYear ? Number(S.fromYear) : null,
      onProgress: ({ fetched, total, stage }) => {
        S.busy = stage === 'Crossref'
          ? 'Topping up from Crossref…'
          : `Fetched ${fetched.toLocaleString()} of ${total.toLocaleString()} matches…`;
        render(root, ctx);
      }
    });
    if (corpus.placeable.length < 6) {
      S.error = `Only ${corpus.placeable.length} of the ${corpus.fetched} works retrieved carry an abstract, which is not enough to cross-tabulate. ${corpus.total.toLocaleString()} works matched, so the field is not empty — the catalogues just hold little text for it. Try broader words, or a field where journal articles dominate.`;
      S.busy = null;
      render(root, ctx);
      return;
    }
    await analyse(corpus.placeable, corpus, root, ctx);
  } catch (err) {
    S.error = String(err.message || err);
  }
  S.busy = null;
  render(root, ctx);
}

async function runLibrary(root, ctx, usable) {
  S.busy = 'Placing your sources…';
  S.result = null;
  S.error = null;
  render(root, ctx);

  /* gaps.js expects {title, abstract, concepts, year}; the library already
     matches, with the full text standing in for a missing abstract. */
  const works = usable.map((x) => ({
    title: x.title,
    abstract: x.abstract || x.text.slice(0, 1500),
    concepts: x.concepts,
    year: x.year,
    authors: x.authors,
    doi: x.doi,
    url: x.url
  }));
  try {
    await analyse(works, null, root, ctx);
  } catch (err) {
    S.error = String(err.message || err);
  }
  S.busy = null;
  render(root, ctx);
}

/* The counting, then — only if a model is set up — the reading of it. */
async function analyse(works, corpus, root, ctx) {
  const s = getState();
  S.busy = 'Cross-tabulating…';
  render(root, ctx);

  const map = coverageMap(works);
  const holes = findHoles(map);
  const thin = findThin(map);
  S.result = { map, holes, thin, works, corpus, gaps: [], dropped: 0, note: '' };
  render(root, ctx);

  if (!isConfigured(s.settings) || !holes.length) return;

  S.busy = 'Reading the crossings…';
  render(root, ctx);
  const prompt = buildGapPrompt({
    statement: S.statement,
    query: corpus ? corpus.query : (S.statement || 'this library'),
    map, holes, thin, works
  });
  const parsed = await ask(prompt, s.settings);
  const checked = validateGaps(parsed, works);
  S.result = { ...S.result, ...checked };
}
