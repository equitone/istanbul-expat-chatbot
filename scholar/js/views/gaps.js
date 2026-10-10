/*
 * gaps.js — where YOUR sources are thin.
 *
 * The request was gaps "in already written articles", which is the honest
 * version of the idea: not a claim about everything ever published, but a
 * cross-tabulation of the set you have actually read. The counting is the
 * same engine the instructor app uses; the corpus is your library.
 *
 * The model, if there is one, reads the counted holes and writes the
 * questions. It is never asked what the gaps are.
 */
import { el, mount, sheet, tag, toast, clip, empty, figure, table } from '../ui.js';
import { getState } from '../store.js';
import { coverageMap, findHoles, findThin, buildGapPrompt, validateGaps, AXES } from '../analysis/gaps.js';
import { ask, isConfigured } from '../ai.js';

const S = { statement: '', result: null, busy: null };

export default function render(root, ctx) {
  const s = getState();
  const usable = s.sources.filter((x) => (x.abstract || x.text || '').length > 40);

  mount(root,
    el('h1', { text: 'Gaps' }),
    el('p', { class: 'lede', text: 'Every source in your library is placed on four axes — framework, period, method, region — and the crossings where two well-represented areas never meet are counted. Those are the holes in what you have read.' }),

    usable.length < 6
      ? empty('Not enough to cross-tabulate',
          `${usable.length} source(s) carry enough text to place. Two margins cannot be populated from that, and a hole found in five papers is a fact about the five papers. Add more and come back.`,
          el('button', { class: 'solid', text: 'Add sources', onClick: () => ctx.go('library') }))
      : el('div', {},
          sheet(null,
            el('label', { class: 'field' },
              el('span', { text: 'Your claim, if you have one (optional)' }),
              el('textarea', { id: 'gaps-claim', rows: 2, value: S.statement,
                placeholder: 'Leave empty to map the library as a whole.',
                onChange: (e) => { S.statement = e.target.value; } })),
            el('div', { class: 'row' },
              el('button', { id: 'gaps-run', class: 'solid', disabled: Boolean(S.busy),
                text: `Map ${usable.length} sources`, onClick: () => run(root, ctx, usable) }),
              isConfigured(s.settings)
                ? el('span', { class: 'note', text: 'A model will read the crossings afterwards.' })
                : el('span', { class: 'note' }, 'No model set up — you get the counted crossings without the write-up. ',
                    el('a', { href: '#settings', onClick: (e) => { e.preventDefault(); ctx.go('settings'); }, text: 'Add one' })),
              S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null
            )
          ),
          S.result ? results(S.result, root, ctx) : null
        )
  );
}

function results(r, root, ctx) {
  const c = r.map.coverage;
  return el('div', {},
    sheet('What this is based on',
      el('div', { class: 'figures' },
        figure('sources mapped', c.works),
        figure('with an abstract', c.withAbstract, c.withAbstract < c.works * 0.6 ? 'thin — placement is less certain' : ''),
        figure('placed on an axis', c.works - c.unplaced, c.unplaced ? `${c.unplaced} carried no marker` : 'all of them'),
        figure('years', c.earliest ? `${c.earliest}–${c.latest}` : '—')
      ),
      el('p', { class: 'note', text: `Everything below means “nothing in these ${c.works} sources”. It is not a claim about the discipline. A hole here may simply be a hole in your reading, which is a useful thing to find out, and may equally be filled by monographs or by scholarship in a language your catalogue searches did not cover.` })
    ),

    r.gaps && r.gaps.length
      ? sheet('Questions these holes imply',
          r.note ? el('p', { class: 'note', style: 'margin-bottom:14px', text: r.note }) : null,
          r.dropped
            ? el('div', { class: 'item loose', style: 'margin-bottom:16px' },
                el('div', { class: 'head' }, el('span', { text: 'discarded' })),
                el('div', { class: 'body', text: `${r.dropped} suggestion(s) were dropped before you saw them: they cited a source that is not in your library, or carried no question. A model that invents a citation has told you something about the rest of its answer.` }))
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
        el('p', { class: 'note', style: 'margin-bottom:12px', text: 'Both sides well represented in your library, nothing on both. Counted.' }),
        r.holes.length
          ? table(['Crossing', { label: 'one', n: true }, { label: 'other', n: true }],
              r.holes.slice(0, 12).map((h) => [
                el('td', { class: 'wrap' },
                  el('div', { style: 'font-family:var(--serif);font-size:15px', text: `${h.labels[0]} × ${h.labels[1]}` }),
                  el('div', { class: 'meta', text: `${h.axisLabels[0]} × ${h.axisLabels[1]}` })),
                el('td', { class: 'n', text: String(h.counts[0]) }),
                el('td', { class: 'n', text: String(h.counts[1]) })
              ]))
          : el('p', { class: 'note', text: 'No crossing had both sides populated enough to mean anything. The library is probably narrow — add sources from further out.' })
      ),
      sheet('Barely occupied',
        el('p', { class: 'note', style: 'margin-bottom:12px', text: 'One or two sources on the crossing. Often the better opening: someone thought it worth doing and there is something to argue with.' }),
        r.thin.length
          ? r.thin.slice(0, 6).map((t) => el('div', { class: 'item' },
              el('div', { class: 'head' }, el('span', { text: `${t.cell} source${t.cell === 1 ? '' : 's'}` })),
              el('div', { class: 'title', style: 'font-size:15px', text: `${t.labels[0]} × ${t.labels[1]}` }),
              el('div', { class: 'meta', text: t.works.map((w) => `${w.title}${w.year ? ` (${w.year})` : ''}`).join(' · ') })))
          : el('p', { class: 'note', text: 'Nothing sitting on exactly one or two.' })
      )
    ),

    sheet('How your library is distributed',
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

async function run(root, ctx, usable) {
  const s = getState();
  S.busy = 'Placing your sources…';
  S.result = null;
  render(root, ctx);

  /* gaps.js expects {title, abstract, concepts, year}; the library already
     matches, with the full text standing in for a missing abstract. */
  const works = usable.map((x) => ({
    title: x.title,
    abstract: x.abstract || x.text.slice(0, 1500),
    concepts: x.concepts,
    year: x.year,
    authors: x.authors
  }));

  try {
    const map = coverageMap(works);
    const holes = findHoles(map);
    const thin = findThin(map);
    S.result = { map, holes, thin, works, gaps: [], dropped: 0, note: '' };
    render(root, ctx);

    if (!isConfigured(s.settings) || !holes.length) { S.busy = null; render(root, ctx); return; }

    S.busy = 'Reading the crossings…';
    render(root, ctx);
    const prompt = buildGapPrompt({ statement: S.statement, query: S.statement || 'this library', map, holes, thin, works });
    const parsed = await ask(prompt, s.settings);
    const checked = validateGaps(parsed, works);
    S.result = { ...S.result, ...checked };
  } catch (err) {
    toast(err.message);
  }
  S.busy = null;
  render(root, ctx);
}
