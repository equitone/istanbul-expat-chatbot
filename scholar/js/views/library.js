/*
 * library.js — the sources you actually hold.
 *
 * Every other tab reads from here. That is deliberate: a gap map over "the
 * literature" means nothing, while a gap map over the forty papers you have
 * collected is a statement about a real set you can point at. The app always
 * says which set it used and how big it was.
 */
import { el, mount, sheet, field, table, tag, toast, clip, empty, figure } from '../ui.js';
import { getState, addSource, addSources, updateSource, removeSource, setSourceActive, setAllActive } from '../store.js';

const S = { query: '', paste: false, sort: 'added', only: 'all' };

export default function render(root, ctx) {
  const s = getState();
  const q = S.query.trim().toLowerCase();
  const on = (x) => x.active !== false;
  const live = s.sources.filter(on);
  const shown = s.sources
    .filter((x) => !q || `${x.title} ${x.authors.join(' ')} ${x.venue} ${x.year}`.toLowerCase().includes(q))
    .filter((x) => S.only === 'all' || (S.only === 'on' ? on(x) : !on(x)))
    .sort((a, b) => (S.sort === 'year' ? (b.year || 0) - (a.year || 0)
      : S.sort === 'title' ? a.title.localeCompare(b.title)
      : new Date(b.addedAt) - new Date(a.addedAt)));

  /* Counted over what is in use, not over everything held: these figures are
     what the other tabs will actually read, and a count that includes
     switched-off books would misdescribe every result downstream. */
  const withText = live.filter((x) => x.text.length > 400).length;
  const withAbstract = live.filter((x) => x.abstract.length > 60).length;
  const off = s.sources.length - live.length;

  mount(root,
    el('h1', { text: 'Library' }),
    el('p', { class: 'lede', text: 'The sources you hold. Tick a source and the rest of the app reads it; untick it and nothing will, though it stays here. Everything else says how large the set it used was, so a finding about “the literature” is always a finding about something you can point at.' }),

    s.sources.length ? el('div', { class: 'figures' },
      figure('in use', live.length, off ? `${off} switched off` : 'everything you hold'),
      figure('with abstract', withAbstract, withAbstract < live.length ? `${live.length - withAbstract} without` : 'all of them'),
      figure('with full text', withText, withText ? '' : 'abstracts only'),
      figure('years', yearSpan(live))
    ) : null,

    sheet('Add',
      el('div', { class: 'row', style: 'margin-bottom:14px' },
        el('div', { class: 'seg' },
          el('button', { 'aria-pressed': String(!S.paste), text: 'From a file', onClick: () => { S.paste = false; render(root, ctx); } }),
          el('button', { 'aria-pressed': String(S.paste), text: 'Paste one', onClick: () => { S.paste = true; render(root, ctx); } })
        ),
        el('div', { class: 'spacer' }),
        el('button', { class: 'sm', text: 'Search the catalogues instead', onClick: () => ctx.go('search') })
      ),
      S.paste ? pasteForm(root, ctx) : fileForm(root, ctx)
    ),

    s.sources.length
      ? sheet(null,
          el('div', { class: 'row', style: 'margin-bottom:14px' },
            el('input', { style: 'max-width:280px', placeholder: 'Filter by title, author, venue…', value: S.query,
              onInput: (e) => { S.query = e.target.value; render(root, ctx); } }),
            el('div', { class: 'spacer' }),
            el('select', { onChange: (e) => { S.only = e.target.value; render(root, ctx); } },
              [['all', 'All of them'], ['on', 'In use'], ['off', 'Switched off']].map(([v, l]) =>
                el('option', { value: v, selected: S.only === v, text: l }))),
            el('div', { class: 'seg' },
              ['added', 'year', 'title'].map((k) => el('button', {
                'aria-pressed': String(S.sort === k), text: k, onClick: () => { S.sort = k; render(root, ctx); }
              })))
          ),
          el('div', { class: 'row', style: 'margin-bottom:12px' },
            el('div', { class: 'note', text: `${shown.length} shown. ${live.length} of ${s.sources.length} in use.` }),
            el('div', { class: 'spacer' }),
            /* Bulk actions apply to what is on screen, not to everything
               held: with a filter typed, "use these" plainly means the ones
               you filtered to, and doing otherwise is a nasty surprise. */
            el('button', { class: 'bare sm', text: shown.length === s.sources.length ? 'Use all' : `Use these ${shown.length}`,
              onClick: () => { setAllActive(true, shown.map((x) => x.id)); } }),
            el('button', { class: 'bare sm', text: shown.length === s.sources.length ? 'Use none' : `Switch these ${shown.length} off`,
              onClick: () => { setAllActive(false, shown.map((x) => x.id)); } })),
          table([{ label: 'Use', n: true }, 'Source', 'Year', { label: 'Text', n: true }, ''],
            shown.map((x) => [
              el('td', { class: 'n' }, el('input', {
                type: 'checkbox', checked: on(x), style: 'width:auto',
                'aria-label': `Use ${x.title}`,
                onChange: (e) => setSourceActive(x.id, e.target.checked) })),
              el('td', { class: `wrap${on(x) ? '' : ' muted'}` },
                el('div', { style: 'font-family:var(--serif);font-size:16px', text: x.title }),
                el('div', { class: 'meta', text: [x.authors.slice(0, 3).join(', '), x.venue].filter(Boolean).join(' · ') || '—' })),
              String(x.year || '—'),
              el('td', { class: 'n' }, x.text.length > 400 ? tag('full', 'firm') : x.abstract.length > 60 ? tag('abstract') : tag('title only')),
              el('td', {}, el('button', { class: 'bare sm', text: 'Remove', onClick: () => { removeSource(x.id); toast('Removed.'); } }))
            ]))
        )
      : empty('Nothing here yet',
          'Add a PDF or a text file, paste a reference, or search the catalogues and keep what is useful.',
          el('button', { class: 'solid', text: 'Search the catalogues', onClick: () => ctx.go('search') }))
  );
}

function yearSpan(sources) {
  const y = sources.map((x) => x.year).filter(Boolean).sort();
  if (!y.length) return '—';
  return y[0] === y[y.length - 1] ? String(y[0]) : `${y[0]}–${y[y.length - 1]}`;
}

function fileForm(root, ctx) {
  const input = el('input', {
    type: 'file', multiple: true, accept: '.txt,.md,.pdf,.docx',
    onChange: async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      const { extractText } = await import('../io/files.js');
      let ok = 0;
      for (const f of files) {
        try {
          const { text } = await extractText(f);
          if (!text || text.trim().length < 200) throw new Error('too little text');
          addSource({ title: f.name.replace(/\.[^.]+$/, ''), text, abstract: text.slice(0, 1200) });
          ok++;
        } catch (err) {
          toast(`${f.name}: ${err.message}`);
        }
      }
      if (ok) toast(`${ok} source(s) added.`);
      render(root, ctx);
    }
  });
  return el('div', {},
    el('p', { class: 'note', text: 'PDF, Word, plain text or Markdown. The full text is kept in this browser and never sent anywhere unless you ask a model to read it.' }),
    input
  );
}

function pasteForm(root, ctx) {
  const form = el('form', { onSubmit: (e) => e.preventDefault() },
    el('div', { class: 'cols' },
      field('Title', el('input', { name: 'title', required: true })),
      field('Authors', el('input', { name: 'authors', placeholder: 'Comma separated' })),
      field('Year', el('input', { name: 'year', type: 'number', min: '1400', max: '2200' })),
      field('Venue', el('input', { name: 'venue' }))
    ),
    field('Abstract or notes', el('textarea', { name: 'abstract', rows: 4 }),
      'The coverage map and the gap finder read this. A paper with no abstract still counts, but it can only be placed by its title.')
  );
  return el('div', {}, form,
    el('button', { class: 'solid', text: 'Add to library', onClick: () => {
      const d = Object.fromEntries(new FormData(form));
      if (!String(d.title || '').trim()) { toast('A title is required.'); return; }
      addSource({
        title: d.title,
        authors: String(d.authors || '').split(',').map((x) => x.trim()).filter(Boolean),
        year: d.year ? Number(d.year) : null,
        venue: d.venue,
        abstract: d.abstract
      });
      form.reset();
      toast('Added.');
      render(root, ctx);
    } }));
}
