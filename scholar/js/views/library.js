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
    type: 'file', multiple: true, accept: '.txt,.md,.pdf,.docx,.ris,.bib,.bibtex,.txt',
    onChange: async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      let ok = 0;
      let refs = 0;
      for (const f of files) {
        try {
          /*
           * An export first, a document second.
           *
           * A .ris or .bib file is a list of references, not a source to
           * read, and treating one as a document would put the whole export
           * into the library as a single garbled "source". The sniff is on
           * the content rather than the extension, because JSTOR hands out
           * RIS files named .txt.
           */
          const made = await readBibliography(f);
          if (made !== null) { refs += made; continue; }

          const { extractText } = await import('../io/files.js');
          const { text } = await extractText(f);
          if (!text || text.trim().length < 200) throw new Error('too little text');
          addSource({ title: f.name.replace(/\.[^.]+$/, ''), text, abstract: text.slice(0, 1200) });
          ok++;
        } catch (err) {
          toast(`${f.name}: ${err.message}`);
        }
      }
      if (ok) toast(`${ok} source(s) added.`);
      if (refs) toast(`${refs} reference(s) added from the export.`);
      render(root, ctx);
    }
  });
  return el('div', {},
    el('p', { class: 'note', text: 'PDF, Word, plain text or Markdown for the sources themselves. The full text is kept in this browser and never sent anywhere unless you ask a model to read it.' }),
    el('p', { class: 'note', text: 'Also RIS and BibTeX. That is the way in from JSTOR, Project MUSE, Scopus and the MLA Bibliography, which cannot be searched from here: export the records you want from those databases and drop the file here, and they join everything else.' }),
    input
  );
}

/*
 * Read a reference export, or return null if the file is not one.
 *
 * Null rather than an exception, because "this is a PDF" is the ordinary
 * case and not a failure worth reporting to anyone.
 */
async function readBibliography(file) {
  if (file.size > 8 * 1024 * 1024) return null;

  /*
   * Never sniff a binary file.
   *
   * A PDF is a container of compressed streams, and those streams contain
   * arbitrary bytes — including, often enough, something shaped like
   * `@Font{`. Reading one as text and testing it for BibTeX matched by
   * chance, and a real PDF was rejected with "no complete entries could be
   * read from it" instead of being read as the document it is.
   *
   * So the sniff only runs on files that could plausibly be an export: by
   * extension first, and then on the bytes, because JSTOR hands out RIS
   * files named .txt and a mislabelled binary must still be caught.
   */
  const name = (file.name || '').toLowerCase();
  const plausible = /\.(ris|bib|bibtex|txt|text|enw|nbib)$/.test(name)
    || /^(text\/plain|application\/x-research-info-systems|application\/x-bibtex)$/.test(file.type || '');
  if (!plausible) return null;

  let text;
  try { text = await file.text(); } catch { return null; }
  /* A NUL byte, or a lot of unprintable ones, means this is not text at all
     whatever it is called. */
  const head = text.slice(0, 4000);
  if (head.includes('\u0000')) return null;
  const junk = (head.match(/[\u0001-\u0008\u000e-\u001f\ufffd]/g) || []).length;
  if (junk > head.length * 0.02) return null;

  const { looksLikeRis, looksLikeBibtex, parseBibliography } = await import('../io/bibliography.js');
  if (!looksLikeRis(text) && !looksLikeBibtex(text)) return null;

  let records;
  try {
    ({ records } = parseBibliography(text));
  } catch {
    /* It looked like an export and was not one. Hand it back to the document
       reader rather than refusing the file: a wrong guess here must cost
       nothing. */
    return null;
  }
  if (!records.length) return null;

  const made = addSources(records.map((r) => ({
    title: r.title,
    authors: r.authors,
    year: r.year ? Number(r.year) : null,
    venue: r.container || r.publisher,
    doi: r.doi,
    url: r.url,
    abstract: r.abstract,
    concepts: r.concepts
  })));
  /* addSources drops anything already held, so the difference is worth
     saying: importing the same export twice should be harmless and visibly
     so, not silently a no-op. */
  if (made.length < records.length) {
    toast(`${records.length - made.length} of them were already in the library.`);
  }
  return made.length;
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
