/*
 * research.js — the one part of the app that is meant to be online.
 *
 * Everything else in the workbench works with the network unplugged, and
 * nothing here touches the stored grades or thesis texts. What goes out is
 * only what the instructor types into these boxes.
 *
 * Split by kind of search rather than merged into one box, because the three
 * answer different questions and have different coverage: OpenAlex indexes
 * works of every kind including monographs, Crossref indexes what publishers
 * deposited with a DOI, and the model answers in prose rather than records.
 */
import {
  el, mount, chip, toast, int, num, banner, field, emptyState, stat
} from '../ui.js';
import { getState } from '../store.js';
import { searchOpenAlex, searchCrossref, formatReference, setContactEmail, findPriorWork } from '../analysis/verify.js';
import { assessTopic } from '../analysis/topic.js';
import { reviewThesis, isConfigured as aiReady } from '../analysis/ai.js';
import { focusAiSetup } from './settings.js';
import { downloadText } from '../io/files.js';

const S = {
  tab: 'assess',
  query: '',
  fromYear: '',
  openAccessOnly: false,
  results: { papers: null, doi: null },
  topic: '',
  assessment: null,
  busy: null,
  chat: [],
  chatDraft: '',
  lastTotal: 0,
  saved: []
};

const TABS = [
  { id: 'assess', label: 'Is this topic worth it?', hint: 'Put a thesis statement in and see who is already standing on that ground — and where the room is' },
  { id: 'papers', label: 'Papers & books', hint: 'OpenAlex — 250M works, including monographs and chapters' },
  { id: 'doi', label: 'Journal articles', hint: 'Crossref — publisher-deposited records with a DOI' },
  { id: 'ask', label: 'Ask a question', hint: 'Ask in your own words. Answers come from the catalogues; add a model in Settings and it will write prose as well.' },
  { id: 'list', label: 'Saved list', hint: 'What you have kept from the searches above' }
];

export default function renderResearch(root, ctx) {
  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Research' }),
        el('p', { text: 'Look for sources without leaving the workbench. This tab is online; the rest of the app is not.' })
      ),
      el('div', { class: 'spacer' }),
      S.saved.length ? el('button', { text: `Export saved list (${S.saved.length})`, onClick: exportSaved }) : null
    ),

    banner('warn', 'Only what you type here leaves this computer. Your students’ names, marks and thesis texts are never sent by this tab — searches carry the query alone.'),

    el('div', { class: 'row', style: 'margin-bottom:6px' },
      TABS.map((t) => el('button', {
        class: S.tab === t.id ? 'primary sm' : 'sm',
        text: t.id === 'list' ? `${t.label} (${S.saved.length})` : t.label,
        onClick: () => { S.tab = t.id; renderResearch(root, ctx); }
      }))
    ),
    el('p', { class: 'hint', style: 'margin:0 0 14px', text: (TABS.find((t) => t.id === S.tab) || {}).hint }),

    S.tab === 'assess' ? assessPanel(root, ctx)
      : S.tab === 'ask' ? askPanel(root, ctx)
      : S.tab === 'list' ? savedPanel(root, ctx)
      : searchPanel(root, ctx)
  );
}

/* ------------------------------------------------------------- catalogues */

function searchPanel(root, ctx) {
  const key = S.tab;
  const results = S.results[key];

  const input = el('input', {
    id: 'research-q',
    value: S.query,
    placeholder: S.tab === 'papers' ? 'e.g. modernist fragmentation imperial decline' : 'e.g. translation reception Turkish periodicals',
    onKeyDown: (e) => { if (e.key === 'Enter') doSearch(root, ctx); }
  });

  return el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'row', style: 'align-items:flex-end' },
        el('div', { style: 'flex:1;min-width:240px' }, field('Search', input)),
        el('div', { style: 'width:130px' }, field('From year', el('input', {
          type: 'number', placeholder: 'any', value: S.fromYear,
          onChange: (e) => { S.fromYear = e.target.value; }
        }))),
        S.tab === 'papers'
          ? el('label', { class: 'inline', style: 'margin-bottom:12px' },
              el('input', { type: 'checkbox', checked: S.openAccessOnly, onChange: (e) => { S.openAccessOnly = e.target.checked; } }),
              el('span', { text: 'Free to read only' }))
          : null,
        el('button', { class: 'primary', style: 'margin-bottom:10px', disabled: Boolean(S.busy), text: 'Search', onClick: () => doSearch(root, ctx) })
      ),
      S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
    ),

    results && results.failed ? failureCard(results, root, ctx)
      : results
      ? el('div', {},
          el('p', { class: 'hint', text: `${int(results.total)} match${results.total === 1 ? '' : 'es'} in ${results.source}; showing ${results.works.length}.` }),
          results.works.length
            ? results.works.map((w) => workCard(w, root, ctx))
            : emptyState('Nothing found', `No record matched “${results.query || S.query}”. The search reached ${results.source} and it answered — there is simply nothing there. Try fewer or more general terms; a monograph may be in the other catalogue instead.`)
        )
      : emptyState('No search yet', 'Type a few terms above. Results can be saved to a reading list and copied as APA or MLA references.')
  );
}

function workCard(w, root, ctx) {
  const already = S.saved.some((x) => (x.doi && x.doi === w.doi) || x.title === w.title);
  return el('div', { class: 'finding', style: 'border-left-color:var(--cat-structure);cursor:default' },
    el('div', { class: 'top' },
      w.year ? chip(String(w.year)) : null,
      w.citedBy ? chip(`cited ${int(w.citedBy)}×`, w.citedBy > 200 ? 'accent' : '') : null,
      w.openAccess ? chip('free to read', 'good') : null,
      w.type ? chip(w.type) : null
    ),
    el('div', { style: 'font-weight:600;font-size:14px;margin-bottom:3px' },
      w.url ? el('a', { href: w.url, target: '_blank', rel: 'noopener', text: w.title || '(untitled)' }) : (w.title || '(untitled)')
    ),
    el('div', { class: 'hint', text: [w.authors.slice(0, 5).join(', '), w.container].filter(Boolean).join(' · ') }),
    w.abstract ? el('div', { class: 'msg', style: 'margin-top:6px;font-size:13px', text: clip(w.abstract, 340) }) : null,
    el('div', { class: 'row tight', style: 'margin-top:8px' },
      el('button', {
        class: 'sm', disabled: already, text: already ? 'saved' : 'Save to list',
        onClick: () => { S.saved.push(w); toast('Added to the reading list.', 'good'); renderResearch(root, ctx); }
      }),
      el('button', { class: 'sm', text: 'Copy APA', onClick: () => copy(formatReference(w, 'apa7')) }),
      el('button', { class: 'sm', text: 'Copy MLA', onClick: () => copy(formatReference(w, 'mla9')) }),
      w.doi ? el('a', { class: 'btn sm', style: 'padding:4px 9px;border:1px solid var(--border-strong);border-radius:5px;font-size:12px;text-decoration:none;color:inherit', href: `https://doi.org/${w.doi}`, target: '_blank', rel: 'noopener', text: 'Open DOI' }) : null
    )
  );
}

async function doSearch(root, ctx) {
  const q = document.getElementById('research-q').value.trim();
  if (q.length < 3) { toast('Give it a few more characters.', 'error'); return; }
  S.query = q;
  S.busy = 'Searching…';
  renderResearch(root, ctx);
  setContactEmail(getState().settings.contactEmail || '');
  try {
    const opts = { fromYear: S.fromYear ? Number(S.fromYear) : null };
    S.results[S.tab] = S.tab === 'papers'
      ? await searchOpenAlex(q, { ...opts, openAccessOnly: S.openAccessOnly })
      : await searchCrossref(q, opts);
  } catch (err) {
    /* A toast disappears, and the panel behind it still says "No search yet"
       — which is why a failed search looked exactly like one never run. The
       failure is kept and rendered instead. */
    S.results[S.tab] = { failed: describeFailure(err), query: q };
    toast(err.message, 'error');
  }
  S.busy = null;
  renderResearch(root, ctx);
  const box = document.getElementById('research-q');
  if (box) box.value = S.query;
}

/* ------------------------------------------------------------------ chat */

/*
 * Ask a question.
 *
 * This used to refuse to render at all without a model configured, which made
 * it a dead end for the only person it was built for: an instructor who has
 * not installed anything. It now always answers.
 *
 * With no model, the answer is the retrieval half of what a tool like
 * Perplexity does — the question is turned into a search, the catalogue is
 * queried, and what came back is reported with the sources attached. It does
 * not write prose and does not pretend to; every line is something a record
 * actually says. That is worth more to a supervisor than invented fluency,
 * and it is the half that cannot fabricate a reference.
 *
 * With a model configured, the model answers instead and the sources are
 * still fetched and shown beside it, so anything it names can be checked
 * against the record without leaving the page.
 */
function askPanel(root, ctx) {
  const settings = getState().settings;
  const ready = aiReady(settings);
  const local = ready && settings.ai.provider === 'local';

  return el('div', {},
    ready
      ? el('div', { class: local ? 'banner privacy' : 'banner warn' },
          local
            ? `A model at ${settings.ai.endpoint} writes the answer and the catalogues supply the sources. Nothing in this conversation leaves the computer.`
            : `This conversation is sent to ${settings.ai.model} at Anthropic. Do not paste student work here.`)
      : el('div', { class: 'banner info' },
          'No model is set up, so answers are assembled from the catalogues rather than written as prose — real records, with links. Adding a model in Settings makes it write as well.'),

    el('div', { class: 'card' },
      S.chat.length
        ? el('div', { id: 'chat-log', style: 'max-height:56vh;overflow-y:auto;margin-bottom:12px' },
            S.chat.map((m) => turnCard(m, root, ctx)))
        : el('p', { class: 'hint', text: 'Ask in your own words — “what is the debate about modernist form and empire?”, “who writes on translation and censorship in Turkey?”. The question is searched against 250 million works; your students’ writing is never part of it.' }),
      S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null,
      el('textarea', {
        id: 'research-chat',
        placeholder: 'e.g. What are the main positions in the debate about modernist form and empire?',
        style: 'min-height:80px',
        value: S.chatDraft,
        onKeyDown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(root, ctx); }
      }),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { class: 'primary', disabled: Boolean(S.busy), text: 'Ask', onClick: () => send(root, ctx) }),
        el('span', { class: 'hint', text: 'Ctrl/⌘ + Enter' }),
        el('div', { class: 'spacer' }),
        !ready ? el('button', { class: 'sm', text: 'Add a model for prose answers', onClick: () => { focusAiSetup(); ctx.go('settings'); } }) : null,
        S.chat.length ? el('button', { class: 'ghost sm', text: 'Clear', onClick: () => { S.chat = []; renderResearch(root, ctx); } }) : null
      ),
      el('p', { class: 'hint', style: 'margin-top:10px', text: ready
        ? 'A model will invent plausible references. Every source listed under an answer came from a catalogue and is real; anything the prose names that is not in that list has not been checked.'
        : 'Everything below an answer is a real record from OpenAlex. Nothing here is generated, so nothing here is invented.' })
    )
  );
}

/* One turn in the conversation: the question, the answer, and the records the
   answer rests on. */
function turnCard(m, root, ctx) {
  if (m.role === 'user') {
    return el('div', { style: 'margin-bottom:12px;padding:10px 13px;border-radius:8px;background:var(--accent-soft)' },
      el('div', { class: 'hint', style: 'margin-bottom:4px', text: 'You' }),
      el('div', { style: 'white-space:pre-wrap;font-size:14px', text: m.content })
    );
  }

  return el('div', { style: 'margin-bottom:14px' },
    el('div', { style: 'padding:10px 13px;border-radius:8px;background:var(--surface-2)' },
      el('div', { class: 'hint', style: 'margin-bottom:4px', text: m.source === 'model' ? 'Model' : 'From the catalogue' }),
      el('div', { style: 'white-space:pre-wrap;font-size:14px', text: m.content })
    ),
    m.works && m.works.length
      ? el('div', { style: 'margin-top:8px' },
          el('div', { class: 'hint', style: 'margin:0 0 6px', text: `${m.works.length} source${m.works.length === 1 ? '' : 's'} — real records, click a title to open it` }),
          m.works.map((w) => workCard(w, root, ctx))
        )
      : null
  );
}

async function send(root, ctx) {
  const box = document.getElementById('research-chat');
  const text = box.value.trim();
  if (!text) return;
  const settings = getState().settings;
  const ready = aiReady(settings);

  S.chat.push({ role: 'user', content: text });
  S.chatDraft = '';
  S.busy = ready ? 'Searching, then asking the model…' : 'Searching the catalogue…';
  renderResearch(root, ctx);
  setContactEmail(settings.contactEmail || '');

  /* The sources are fetched either way. With a model they are what its prose
     can be checked against; without one they are the answer. */
  let works = [];
  let searchError = null;
  try {
    const found = await searchOpenAlex(queryFromQuestion(text), { perPage: 8 });
    works = found.works;
    S.lastTotal = found.total;
  } catch (err) {
    searchError = describeFailure(err);
  }

  if (ready) {
    try {
      const history = S.chat.filter((m) => m.role === 'user' || m.source === 'model')
        .map((m) => `${m.role === 'user' ? 'Question' : 'Answer'}: ${m.content}`).join('\n\n');
      const grounding = works.length
        ? `\n\nThese records were found in a scholarly catalogue for this question. Prefer them over anything you recall, and say when you are going beyond them:\n${works.map((w) => `- ${w.title}${w.year ? ` (${w.year})` : ''}${w.authors ? ` — ${w.authors}` : ''}`).join('\n')}`
        : '';
      const reply = await askModel(history + grounding, settings);
      S.chat.push({ role: 'assistant', source: 'model', content: reply, works });
    } catch (err) {
      S.chat.push({ role: 'assistant', source: 'catalogue', works, content: `The model could not be reached: ${err.message}\n\n${summarise(text, works, searchError)}` });
    }
  } else {
    S.chat.push({ role: 'assistant', source: 'catalogue', works, content: summarise(text, works, searchError) });
  }

  S.busy = null;
  renderResearch(root, ctx);
}

/*
 * A question is not a query. "What is the debate about modernist form and
 * empire?" searched literally matches nothing useful, because the catalogue
 * indexes titles and abstracts, and no title contains "what is the debate
 * about". Strip the question down to its content words.
 */
export function queryFromQuestion(question) {
  const STOP = new Set(`what which who whom whose when where why how is are was were do does did can could would should
    the a an of in on at to for from by with about into over under between across and or but if then than that this these
    those there here it its i me my we our you your he she they there any some most more much many best good
    has have had been being be am get gets got
    tell show find give explain describe list write writes writing wrote written say says know think want need
    please anything anyone something publish publishes published publishing argue argues argued discuss discusses
    research paper papers article articles study studies book books work works literature field topic question debate
    main key major important recent new latest current`.split(/\s+/).filter(Boolean));
  const words = String(question)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  /* If stripping left nothing, the question was all scaffolding — search it
     as written rather than sending an empty query. */
  return words.length ? words.slice(0, 12).join(' ') : String(question).trim();
}

/*
 * What the catalogue found, in plain sentences. Every number here is counted
 * from the records listed underneath; nothing is inferred and nothing is
 * written that a reader cannot verify against that list.
 */
function summarise(question, works, failure) {
  if (failure) {
    return `${failure.headline}. ${failure.detail}`;
  }
  if (!works.length) {
    return `Nothing in OpenAlex matched that. The catalogue indexes titles, abstracts and metadata rather than full text, so a question phrased as a sentence often finds less than two or three keywords would. Try naming the specific terms.`;
  }

  const years = works.map((w) => Number(w.year)).filter((y) => Number.isFinite(y));
  const cited = [...works].sort((a, b) => (b.citedBy || 0) - (a.citedBy || 0));
  const open = works.filter((w) => w.openAccess).length;

  const lines = [];
  lines.push(`${S.lastTotal ? `${S.lastTotal.toLocaleString()} works match this in OpenAlex; the ${works.length} closest are below.` : `${works.length} works below.`}`);
  if (years.length) {
    lines.push(`They run from ${Math.min(...years)} to ${Math.max(...years)}.`);
  }
  if (cited[0] && cited[0].citedBy) {
    lines.push(`The most cited is “${cited[0].title}”${cited[0].year ? ` (${cited[0].year})` : ''} at ${cited[0].citedBy.toLocaleString()} citations — usually where to start.`);
  }
  if (open) lines.push(`${open} of them are free to read.`);

  const concepts = new Map();
  works.forEach((w) => (w.concepts || []).forEach((c) => concepts.set(c, (concepts.get(c) || 0) + 1)));
  const common = [...concepts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (common.length) {
    lines.push(`Most are filed under ${common.map(([c, n]) => `${c} (${n})`).join(', ')} — useful terms to search with next.`);
  }

  lines.push('');
  lines.push('This is what the catalogue holds, not a written answer. Set up a model in Settings if you want prose.');
  return lines.join('\n');
}

/*
 * Deliberately a separate call from the thesis reviewer: that one carries a
 * marking system prompt and a JSON contract, neither of which belongs in a
 * conversation about the literature.
 */
async function askModel(prompt, settings) {
  const ai = settings.ai || {};
  const system = 'You are helping a university instructor orient themselves in a scholarly literature. Be concrete about positions, debates and who holds them. When you name a work, say plainly that the instructor should verify it, because you may be misremembering a citation. Never invent a DOI.';

  if (ai.provider === 'local') {
    const base = String(ai.endpoint || '').replace(/\/+$/, '');
    const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(ai.apiKey ? { authorization: `Bearer ${ai.apiKey}` } : {}) },
      body: JSON.stringify({ model: ai.model || 'llama3.1:8b', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error(`The local model returned ${res.status}.`);
    const d = await res.json();
    return d.choices?.[0]?.message?.content?.trim() || '(no answer)';
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ai.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: ai.model || 'claude-opus-5',
      max_tokens: 4000,
      system,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`The API returned ${res.status}.`);
  const d = await res.json();
  if (d.stop_reason === 'refusal') throw new Error('The model declined to answer.');
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || '(no answer)';
}

/* ------------------------------------------------------------ saved list */

function savedPanel(root, ctx) {
  if (!S.saved.length) {
    return el('div', { class: 'card' }, emptyState('Nothing saved yet', 'Search in the first two tabs and press “Save to list” on anything worth keeping.'));
  }
  return el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      el('button', { class: 'sm', text: 'Copy all as APA', onClick: () => copy(S.saved.map((w) => formatReference(w, 'apa7')).sort().join('\n\n')) }),
      el('button', { class: 'sm', text: 'Copy all as MLA', onClick: () => copy(S.saved.map((w) => formatReference(w, 'mla9')).sort().join('\n\n')) }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'ghost sm', text: 'Clear list', onClick: () => { S.saved = []; renderResearch(root, ctx); } })
    ),
    S.saved.map((w, i) => el('div', { class: 'finding', style: 'border-left-color:var(--cat-structure)' },
      el('div', { class: 'quote', style: 'font-family:inherit;font-size:13px', text: formatReference(w, 'apa7') }),
      el('div', { class: 'row tight', style: 'margin-top:6px' },
        w.url ? el('a', { href: w.url, target: '_blank', rel: 'noopener', class: 'hint', text: 'open' }) : null,
        el('div', { class: 'spacer' }),
        el('button', { class: 'ghost sm', text: 'Remove', onClick: () => { S.saved.splice(i, 1); renderResearch(root, ctx); } })
      )
    ))
  );
}

function exportSaved() {
  const lines = [
    'READING LIST',
    `Compiled ${new Date().toLocaleDateString()}`,
    '', 'APA 7', '='.repeat(50), '',
    ...S.saved.map((w) => formatReference(w, 'apa7')).sort(),
    '', '', 'MLA 9', '='.repeat(50), '',
    ...S.saved.map((w) => formatReference(w, 'mla9')).sort()
  ];
  downloadText(lines.join('\n'), `reading-list-${new Date().toISOString().slice(0, 10)}.txt`);
  toast('Reading list downloaded.', 'good');
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied.', 'good');
  } catch {
    toast('The browser blocked the clipboard. Select the text and copy it by hand.', 'error');
  }
}

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));

/*
 * Why a search failed, in terms the instructor can act on.
 *
 * fetch() reports every network-level refusal as the same opaque TypeError —
 * offline, DNS, a blocked port, a corporate proxy and a CORS rejection are
 * indistinguishable from inside the page. So the message says which of those
 * it could be rather than pretending to know, and names the one check that
 * separates them.
 */
function describeFailure(err) {
  const msg = String((err && err.message) || err);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (offline) {
    return {
      headline: 'This computer is offline',
      detail: 'This is the one tab that needs the internet. Everything else in the workbench — marking, thesis analysis, the gradebook — keeps working without it.',
      fixes: ['Reconnect, then press Search again.']
    };
  }
  const status = msg.match(/returned (\d{3})/);
  if (status) {
    const code = Number(status[1]);
    if (code === 429) {
      return {
        headline: 'The catalogue asked you to slow down',
        detail: 'Both catalogues are free and rate-limited. Giving them a contact email moves you to their faster queue.',
        fixes: ['Wait a minute and search again.', 'Add a contact email in Settings — it is sent to the catalogue only, never to us.']
      };
    }
    if (code >= 500) {
      return { headline: `The catalogue is having trouble (${code})`, detail: 'This is their server, not your setup. It usually clears within a few minutes.', fixes: ['Try again shortly.', 'Try the other catalogue tab — they are independent services.'] };
    }
    return { headline: `The catalogue refused the request (${code})`, detail: 'The query reached the service and it declined to answer it.', fixes: ['Try simpler search terms.', 'Try the other catalogue tab.'] };
  }
  return {
    headline: 'Could not reach the catalogue',
    detail: 'The request never got an answer. A browser cannot tell apart a dropped connection, a firewall, a university proxy and a service that refuses cross-origin requests — they all arrive here identically.',
    fixes: [
      'Open api.openalex.org/works?search=test in a new tab. If that fails too, the block is on the network rather than in this app.',
      'If you are on a university or campus network, it may be filtering outbound API traffic — try a home connection or a phone hotspot.',
      'Everything except this tab works offline, so nothing else is affected.'
    ]
  };
}

function failureCard(results, root, ctx) {
  const f = results.failed;
  return el('div', { class: 'card', style: 'border-color:var(--high)' },
    el('h2', { text: f.headline }),
    el('p', { text: f.detail }),
    el('ul', { style: 'margin:8px 0 14px 18px;font-size:13px;color:var(--text-dim)' },
      f.fixes.map((x) => el('li', { style: 'margin-bottom:4px', text: x }))),
    el('button', { class: 'primary', text: 'Try again', onClick: () => (S.tab === 'assess' ? doAssess(root, ctx) : doSearch(root, ctx)) })
  );
}

/* ------------------------------------------------------- topic assessment */

/*
 * The question at the first supervision meeting is not "does this exist" but
 * "is there room here, and if not, where". This panel answers that one.
 *
 * The reading is computed from the works that come back — no model is asked
 * and none is needed — so every line of it can be checked against the list
 * printed underneath.
 */
const BAND_TONE = { crowded: 'high', occupied: 'medium', workable: 'good', clear: 'good', vague: 'medium', unknown: '' };

function assessPanel(root, ctx) {
  const box = el('textarea', {
    id: 'topic-statement',
    value: S.topic,
    style: 'min-height:88px',
    placeholder: 'Paste the thesis statement, or write the claim in one sentence.\n\ne.g. Fluent translation renders the translator invisible in Turkish literary magazines of the 1960s.'
  });

  const a = S.assessment;

  return el('div', {},
    el('div', { class: 'card' },
      field('The claim', box, 'A claim, not a subject. “Translation in Turkey” cannot be judged; “fluent translation made translators invisible in Turkish literary magazines” can.'),
      el('div', { class: 'row', style: 'align-items:flex-end' },
        el('div', { style: 'width:150px' }, field('Published since', el('input', {
          type: 'number', placeholder: 'any', value: S.fromYear,
          onChange: (e) => { S.fromYear = e.target.value; }
        }))),
        el('div', { class: 'spacer' }),
        el('button', { class: 'primary', style: 'margin-bottom:10px', disabled: Boolean(S.busy), text: 'Assess', onClick: () => doAssess(root, ctx) })
      ),
      S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
    ),

    a && a.failed ? failureCard(a, root, ctx) : null,

    a && !a.failed ? el('div', {},
      el('div', { class: 'card', style: `border-color:var(--${BAND_TONE[a.verdict.band] === 'high' ? 'high' : BAND_TONE[a.verdict.band] === 'good' ? 'good' : 'border'})` },
        el('div', { class: 'row', style: 'align-items:center;gap:8px' },
          chip(a.verdict.band, BAND_TONE[a.verdict.band]),
          el('h2', { style: 'margin:0', text: a.verdict.headline })
        ),
        el('p', { text: a.verdict.detail }),
        el('div', { class: 'grid cols-4', style: 'margin-top:10px' },
          stat('Same claim', int(a.counts.close), 'half their terms or more'),
          stat('Same area', int(a.counts.near), 'related, different claim'),
          stat('Examined', int(a.examined), `of ${int(a.total)} matches`),
          stat('Closest match', a.closest ? `${Math.round(a.closest.overlap * 100)}%` : '—', a.closest && a.closest.year ? String(a.closest.year) : '')
        )
      ),

      el('div', { class: 'card' },
        el('h2', { text: 'What to do about it' }),
        el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
          a.angles.map((x) => el('div', { class: 'finding', style: 'border-left-color:var(--cat-argument);cursor:default' },
            el('div', { style: 'font-weight:600;margin-bottom:3px', text: x.move }),
            el('div', { style: 'font-size:13px;color:var(--text-dim)', text: x.why })
          ))
        )
      ),

      (a.crowdedTerms.length || a.distinctiveTerms.length || a.adjacent.length)
        ? el('div', { class: 'card' },
            el('h2', { text: 'Where the words sit' }),
            a.crowdedTerms.length ? el('div', { style: 'margin-bottom:10px' },
              el('div', { class: 'hint', style: 'margin:0 0 4px', text: 'Already the field’s vocabulary — these appear in most of the works found' }),
              el('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px' },
                a.crowdedTerms.map((t) => chip(`${t.term} · ${t.count}/${a.examined}`, 'medium')))) : null,
            a.distinctiveTerms.length ? el('div', { style: 'margin-bottom:10px' },
              el('div', { class: 'hint', style: 'margin:0 0 4px', text: 'Yours — rare or absent in what came back, so this is where a contribution can come from' }),
              el('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px' },
                a.distinctiveTerms.map((t) => chip(`${t.term} · ${t.count}/${a.examined}`, 'good')))) : null,
            a.adjacent.length ? el('div', {},
              el('div', { class: 'hint', style: 'margin:0 0 4px', text: 'What this literature is filed under that the statement does not mention' }),
              el('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px' },
                a.adjacent.map((c) => chip(`${c.concept} · ${c.count}`, 'accent')))) : null
          )
        : null,

      el('div', { class: 'card' },
        el('h2', { text: `What is already out there (${a.works.length})` }),
        el('p', { class: 'hint', text: 'Ordered by how much of the claim each one shares. Save the ones worth reading — the list exports as APA or MLA.' }),
        a.works.length
          ? a.works.map((w) => workCard(w, root, ctx))
          : emptyState('Nothing came back', 'Broaden the wording and try again.')
      ),

      el('div', { class: 'card' },
        el('h2', { text: 'What this cannot tell you' }),
        el('p', { class: 'hint', text: a.caveat })
      )
    ) : null,

    !a ? emptyState('No assessment yet',
      'Put a claim in the box and press Assess. It searches the scholarly record, then reports who is already making that claim, which of your terms the field has taken, and where the room is.') : null
  );
}

async function doAssess(root, ctx) {
  const statement = document.getElementById('topic-statement').value.trim();
  if (statement.split(/\s+/).length < 5) { toast('Write the claim as a sentence — five words is not enough to place it.', 'error'); return; }
  S.topic = statement;
  S.busy = 'Searching the scholarly record…';
  S.assessment = null;
  renderResearch(root, ctx);
  setContactEmail(getState().settings.contactEmail || '');
  try {
    const prior = await findPriorWork(statement, {
      perPage: 25,
      fromYear: S.fromYear ? Number(S.fromYear) : null
    });
    S.assessment = {
      ...assessTopic(statement, prior.works, { total: prior.total, source: 'OpenAlex' }),
      works: prior.works
    };
  } catch (err) {
    S.assessment = { failed: describeFailure(err), query: statement };
    toast(err.message, 'error');
  }
  S.busy = null;
  renderResearch(root, ctx);
}
