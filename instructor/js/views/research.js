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
  el, mount, chip, toast, int, num, banner, field, emptyState, escapeHtml
} from '../ui.js';
import { getState } from '../store.js';
import { searchOpenAlex, searchCrossref, formatReference, setContactEmail } from '../analysis/verify.js';
import { reviewThesis, isConfigured as aiReady } from '../analysis/ai.js';
import { downloadText } from '../io/files.js';

const S = {
  tab: 'papers',
  query: '',
  fromYear: '',
  openAccessOnly: false,
  results: { papers: null, doi: null },
  busy: null,
  chat: [],
  chatDraft: '',
  saved: []
};

const TABS = [
  { id: 'papers', label: 'Papers & books', hint: 'OpenAlex — 250M works, including monographs and chapters' },
  { id: 'doi', label: 'Journal articles', hint: 'Crossref — publisher-deposited records with a DOI' },
  { id: 'ask', label: 'Ask a model', hint: 'A conversation, not a catalogue. Verify anything it names.' },
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

    S.tab === 'ask' ? askPanel(root, ctx)
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

    results
      ? el('div', {},
          el('p', { class: 'hint', text: `${int(results.total)} match${results.total === 1 ? '' : 'es'} in ${results.source}; showing ${results.works.length}.` }),
          results.works.length
            ? results.works.map((w) => workCard(w, root, ctx))
            : emptyState('Nothing found', 'Try fewer or more general terms. A monograph may be in the other catalogue instead.')
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
    toast(err.message, 'error');
  }
  S.busy = null;
  renderResearch(root, ctx);
  const box = document.getElementById('research-q');
  if (box) box.value = S.query;
}

/* ------------------------------------------------------------------ chat */

function askPanel(root, ctx) {
  const settings = getState().settings;
  if (!aiReady(settings)) {
    return el('div', { class: 'card' },
      emptyState('No model configured',
        'This panel talks to whichever model you set up in Settings — a local one, so nothing leaves the machine, or the Claude API.',
        el('button', { class: 'primary', text: 'Open settings', onClick: () => ctx.go('settings') }))
    );
  }

  const local = settings.ai.provider === 'local';

  return el('div', {},
    el('div', { class: local ? 'banner privacy' : 'banner warn' },
      local
        ? `Answers come from your local model at ${settings.ai.endpoint}. Nothing in this conversation leaves the computer.`
        : `This conversation is sent to ${settings.ai.model} at Anthropic. Do not paste student work here.`
    ),
    el('div', { class: 'card' },
      S.chat.length
        ? el('div', { style: 'max-height:52vh;overflow-y:auto;margin-bottom:12px' },
            S.chat.map((m) => el('div', {
              style: `margin-bottom:12px;padding:10px 13px;border-radius:8px;background:${m.role === 'user' ? 'var(--accent-soft)' : 'var(--surface-2)'}`
            },
              el('div', { class: 'hint', style: 'margin-bottom:4px', text: m.role === 'user' ? 'You' : 'Model' }),
              el('div', { style: 'white-space:pre-wrap;font-size:14px', text: m.content })
            ))
          )
        : el('p', { class: 'hint', text: 'Ask about a field, a debate, or where to start reading. The model has no access to your students’ work and cannot search the catalogues — for records, use the other two tabs.' }),
      S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null,
      el('textarea', {
        id: 'research-chat',
        placeholder: 'e.g. What are the main positions in the debate about modernist form and empire?',
        style: 'min-height:80px',
        value: S.chatDraft,
        onKeyDown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(root, ctx); }
      }),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { class: 'primary', disabled: Boolean(S.busy), text: 'Send', onClick: () => send(root, ctx) }),
        el('span', { class: 'hint', text: 'Ctrl/⌘ + Enter' }),
        el('div', { class: 'spacer' }),
        S.chat.length ? el('button', { class: 'ghost sm', text: 'Clear', onClick: () => { S.chat = []; renderResearch(root, ctx); } }) : null
      ),
      el('p', { class: 'hint', style: 'margin-top:10px', text: 'A model will invent plausible references. Anything it names should be checked in the Papers or Journal articles tab before you pass it to a student.' })
    )
  );
}

async function send(root, ctx) {
  const box = document.getElementById('research-chat');
  const text = box.value.trim();
  if (!text) return;
  S.chat.push({ role: 'user', content: text });
  S.chatDraft = '';
  S.busy = 'Waiting for the model…';
  renderResearch(root, ctx);

  try {
    const history = S.chat.map((m) => `${m.role === 'user' ? 'Question' : 'Answer'}: ${m.content}`).join('\n\n');
    const reply = await askModel(history, getState().settings);
    S.chat.push({ role: 'assistant', content: reply });
  } catch (err) {
    S.chat.push({ role: 'assistant', content: `Could not get an answer: ${err.message}` });
  }
  S.busy = null;
  renderResearch(root, ctx);
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
      body: JSON.stringify({ model: ai.model || 'llama3.1', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] })
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
