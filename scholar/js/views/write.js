/*
 * write.js — ideas, then an outline, then prose from your notes.
 *
 * The order matters and is enforced by the layout. You cannot expand a
 * section before you have written what you want it to do, because a tool that
 * will write a paragraph from a heading alone is a tool for producing text
 * you have not thought about, and that is the thing worth not building.
 *
 * Two guarantees on anything the model returns:
 *   every source it names is checked against your library, and
 *   the draft is run through the AI-tell check before you see it, with the
 *   result shown. A drafting tool that emits the patterns it tells you to
 *   remove is not worth having.
 */
import { el, mount, sheet, tag, toast, clip, empty, figure, field } from '../ui.js';
import { getState, saveDraft, uid } from '../store.js';
import { ask, isConfigured, ideasPrompt, draftPrompt, checkCitations } from '../ai.js';
import { findTells, readTells } from '../analysis/tells.js';
import { gatherCorpus } from '../analysis/gather.js';

const S = {
  stage: 'ideas',
  topic: '',
  position: '',
  ideas: null,
  dropped: 0,
  missing: '',
  question: '',
  sections: [],
  busy: null,
  expanded: {},
  /* Where the sources for the last run came from, so the page can say. */
  fetched: null,
  useRecord: true,
  /* The exact records the last run argued from; the draft stage reuses it. */
  sources: []
};

export default function render(root, ctx) {
  const s = getState();
  const ready = isConfigured(s.settings);
  mount(root,
    el('h1', { text: 'Write' }),
    el('p', { class: 'lede', text: 'Find the argument, lay out the sections, then expand each from your own notes. The argument stays yours; what the model supplies is sentences, and only where you have said what the section is for.' }),

    !ready
      ? el('div', { class: 'item loose', style: 'margin-bottom:28px' },
          el('div', { class: 'body', text: 'This tab needs a model. Everything else in the app works without one.' }),
          el('div', { style: 'margin-top:8px' }, el('button', { class: 'sm', text: 'Set one up', onClick: () => ctx.go('settings') })))
      : null,

    el('div', { class: 'row', style: 'margin-bottom:26px' },
      el('div', { class: 'seg' },
        [['ideas', '1 · Arguments'], ['outline', '2 · Outline'], ['draft', '3 · Draft']].map(([id, label]) =>
          el('button', { 'aria-pressed': String(S.stage === id), text: label, onClick: () => { S.stage = id; render(root, ctx); } })))),

    S.stage === 'ideas' ? ideasStage(root, ctx, ready)
      : S.stage === 'outline' ? outlineStage(root, ctx)
      : draftStage(root, ctx, ready)
  );
}

/* ---------------------------------------------------------- 1. arguments */

function ideasStage(root, ctx, ready) {
  const s = getState();
  return el('div', {},
    sheet('What are you arguing about',
      field('Topic', el('input', { id: 'write-topic', value: S.topic, placeholder: 'translation and the Turkish novel',
        onChange: (e) => { S.topic = e.target.value; } })),
      field('The position you want to take, if you have one',
        el('textarea', { id: 'write-position', rows: 2, value: S.position,
          placeholder: 'Leave empty and it will propose positions instead of testing yours.',
          onChange: (e) => { S.position = e.target.value; } })),
      el('label', { class: 'row', style: 'margin-bottom:12px' },
        el('input', { type: 'checkbox', checked: S.useRecord, style: 'width:auto',
          onChange: (e) => { S.useRecord = e.target.checked; render(root, ctx); } }),
        el('span', { text: 'Fetch real sources on this topic from the catalogues' })),
      el('div', { class: 'row' },
        el('button', { id: 'write-gen', class: 'solid', disabled: !ready || Boolean(S.busy), text: 'Find the strongest lines', onClick: () => genIdeas(root, ctx) }),
        el('span', { class: 'note', text: S.useRecord
          ? `Real catalogue records for the topic, plus the ${s.sources.length} source(s) you have collected. An argument it cannot tie to one of them is not offered.`
          : `From the ${s.sources.length} source(s) in your library only. An argument it cannot tie to one of them is not offered.` }),
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null)
    ),
    S.fetched ? sheet(null,
      el('div', { class: 'figures' },
        figure('sources argued from', S.fetched.used),
        figure('fetched for this topic', S.fetched.fromRecord, S.fetched.catalogue),
        figure('from your library', S.fetched.fromLibrary)),
      el('p', { class: 'note', text: S.fetched.note })) : null,
    S.ideas ? ideasResults(root, ctx) : null
  );
}

function ideasResults(root, ctx) {
  return el('div', {},
    S.dropped
      ? el('div', { class: 'item loose', style: 'margin-bottom:18px' },
          el('div', { class: 'body', text: `${S.dropped} suggestion(s) were dropped: they cited a source not in your library.` }))
      : null,
    sheet('Lines of argument',
      S.ideas.map((g, i) => el('div', { class: 'item said' },
        el('div', { class: 'head' },
          tag(g.strength === 'load-bearing' ? 'load-bearing' : 'needs more', g.strength === 'load-bearing' ? 'firm' : '')),
        el('div', { class: 'title', text: g.claim }),
        g.because ? el('div', { class: 'body', text: g.because }) : null,
        g.objection ? el('div', { class: 'body', style: 'margin-top:8px' },
          el('span', { class: 'meta', text: 'Objection — ' }), g.objection) : null,
        g.answer ? el('div', { class: 'body', style: 'margin-top:4px' },
          el('span', { class: 'meta', text: 'Answer — ' }), g.answer) : null,
        g.uses && g.uses.length ? el('div', { class: 'row tight', style: 'margin-top:8px' },
          g.uses.map((w) => tag(clip(w.title, 48)))) : null,
        el('div', { style: 'margin-top:10px' },
          el('button', { class: 'sm', text: 'Build an outline on this', onClick: () => startOutline(g, root, ctx) }))
      ))),
    S.missing ? el('p', { class: 'rule-note', text: `What would most strengthen the set: ${S.missing}` }) : null
  );
}

async function genIdeas(root, ctx) {
  const s = getState();
  const topic = S.topic.trim();
  if (topic.length < 3) { toast('Give it a topic first.'); return; }

  const mine = s.sources.filter((x) => (x.abstract || x.text).length > 40);
  S.busy = S.useRecord ? 'Searching the catalogues…' : 'Reading your sources…';
  S.ideas = null;
  S.fetched = null;
  render(root, ctx);

  try {
    /*
     * Retrieval first, so the model is arguing from the published record
     * rather than from whatever happens to be on the shelf. These are
     * catalogue records with DOIs, not anything a model produced, and the
     * citation check afterwards is run against exactly this set — so an
     * argument citing something that was not retrieved is still dropped.
     */
    let found = [];
    let catalogue = '';
    let note = '';
    if (S.useRecord) {
      const corpus = await gatherCorpus(topic, {
        want: 200,
        crossref: true,
        onProgress: ({ fetched, total, stage }) => {
          S.busy = stage === 'Crossref' ? 'Topping up from Crossref…'
            : `Fetched ${fetched.toLocaleString()} of ${total.toLocaleString()} matches…`;
          render(root, ctx);
        }
      });
      /* The most cited first: an argument is better made from work the field
         has had to respond to than from whatever sorted first. */
      found = corpus.placeable.slice().sort((a, b) => b.citedBy - a.citedBy);
      catalogue = corpus.catalogue;
      note = corpus.note;
    }

    /* Yours first, so your own reading is never crowded out by retrieval. */
    const seen = new Set();
    const sources = [...mine, ...found].filter((x) => {
      const key = String(x.doi || x.title || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 40);

    if (!sources.length) {
      toast(S.useRecord
        ? 'Nothing came back for that topic, and your library is empty, so there is nothing to argue from.'
        : 'Your library is empty. Tick the box above to fetch sources, or add some.');
      S.busy = null;
      render(root, ctx);
      return;
    }

    S.fetched = {
      used: sources.length,
      fromRecord: sources.filter((x) => !mine.includes(x)).length,
      fromLibrary: sources.filter((x) => mine.includes(x)).length,
      catalogue: catalogue || 'not searched',
      note: note || 'Your own library only; nothing was fetched.'
    };

    S.busy = 'Looking for the strongest lines…';
    render(root, ctx);
    const parsed = await ask(ideasPrompt({ topic, position: S.position.trim(), sources }), s.settings);
    const { kept, dropped } = checkCitations(parsed.arguments, sources, 'uses');
    S.ideas = kept;
    S.dropped = dropped;
    S.missing = String(parsed.missing || '');
    /* The outline stage cites by index into this set, so it has to be the
       same set the ideas were checked against. */
    S.sources = sources;
    if (!kept.length) toast('Nothing came back that was tied to a real source.');
  } catch (err) { toast(err.message); }
  S.busy = null;
  render(root, ctx);
}

/* ------------------------------------------------------------ 2. outline */

function startOutline(idea, root, ctx) {
  S.question = idea.claim;
  if (!S.sections.length) {
    S.sections = [
      { id: uid('sec'), heading: 'Introduction', intent: 'State the claim and why it is worth making.', notes: '' },
      { id: uid('sec'), heading: 'The case', intent: idea.because || '', notes: '' },
      { id: uid('sec'), heading: 'The objection', intent: idea.objection || '', notes: '' },
      { id: uid('sec'), heading: 'Conclusion', intent: 'What follows if the claim holds.', notes: '' }
    ];
  }
  S.stage = 'outline';
  render(root, ctx);
}

function outlineStage(root, ctx) {
  return el('div', {},
    sheet('The question the essay answers',
      el('textarea', { id: 'write-question', rows: 2, value: S.question,
        placeholder: 'One sentence. Every section is written against this.',
        onChange: (e) => { S.question = e.target.value; } })),
    sheet('Sections',
      el('p', { class: 'note', style: 'margin-bottom:16px', text: 'The notes are the important column. A section with no notes cannot be expanded — the argument has to come from you.' }),
      S.sections.map((sec, i) => el('div', { class: 'item' },
        el('div', { class: 'head' },
          el('span', { text: `§${i + 1}` }),
          el('div', { class: 'spacer' }),
          el('button', { class: 'bare sm', text: 'remove', onClick: () => { S.sections.splice(i, 1); render(root, ctx); } })),
        el('input', { value: sec.heading, placeholder: 'Heading', style: 'font-family:var(--serif);font-size:17px;border-color:transparent;padding-left:0',
          onChange: (e) => { sec.heading = e.target.value; } }),
        el('input', { value: sec.intent, placeholder: 'What this section has to do', style: 'border-color:transparent;padding-left:0;font-size:13px;color:var(--ink-faint)',
          onChange: (e) => { sec.intent = e.target.value; } }),
        el('textarea', { rows: 3, value: sec.notes, placeholder: 'Your notes: the argument, the evidence, the sentences you already know you want.',
          onChange: (e) => { sec.notes = e.target.value; } })
      )),
      el('button', { class: 'sm', text: '+ section', onClick: () => { S.sections.push({ id: uid('sec'), heading: '', intent: '', notes: '' }); render(root, ctx); } })
    ),
    el('div', { class: 'row' },
      el('button', { class: 'solid', text: 'Go to drafting', onClick: () => { S.stage = 'draft'; render(root, ctx); } }),
      el('button', { class: 'sm', text: 'Save outline', onClick: () => { saveDraft({ title: clip(S.question, 60) || 'Untitled', question: S.question, outline: S.sections }); toast('Saved.'); } }))
  );
}

/* -------------------------------------------------------------- 3. draft */

function draftStage(root, ctx, ready) {
  if (!S.sections.length) {
    return empty('No outline yet', 'Build one first. Drafting works section by section, from the notes you wrote.',
      el('button', { class: 'solid', text: 'Back to arguments', onClick: () => { S.stage = 'ideas'; render(root, ctx); } }));
  }
  return el('div', {},
    S.sections.map((sec, i) => {
      const out = S.expanded[sec.id];
      const hasNotes = String(sec.notes || '').trim().length > 20;
      return sheet(`§${i + 1} · ${sec.heading || 'untitled'}`,
        el('div', { class: 'row', style: 'margin-bottom:12px' },
          el('button', { class: 'sm', disabled: !ready || !hasNotes || Boolean(S.busy),
            text: out ? 'Expand again' : 'Expand from my notes', onClick: () => expand(sec, root, ctx) }),
          !hasNotes ? el('span', { class: 'note', text: 'Write notes for this section first.' }) : null,
          S.busy === sec.id ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ' Writing…') : null),
        out ? draftBody(out, sec, root, ctx) : null
      );
    }),
    el('div', { class: 'row' },
      el('button', { class: 'solid', text: 'Save draft', onClick: () => {
        saveDraft({ title: clip(S.question, 60) || 'Untitled', question: S.question, outline: S.sections,
          body: S.sections.map((x) => `## ${x.heading}\n\n${(S.expanded[x.id] || {}).prose || ''}`).join('\n\n') });
        toast('Saved to this browser.');
      } }),
      el('button', { class: 'sm', text: 'Copy all', onClick: async () => {
        const txt = S.sections.map((x) => `${x.heading}\n\n${(S.expanded[x.id] || {}).prose || ''}`).join('\n\n');
        try { await navigator.clipboard.writeText(txt); toast('Copied.'); } catch { toast('Could not reach the clipboard.'); }
      } }))
  );
}

function draftBody(out, sec, root, ctx) {
  const t = out.tells;
  return el('div', {},
    el('div', { class: 'reader', style: 'margin-bottom:14px' }, out.prose),
    el('div', { class: 'row', style: 'margin-bottom:10px' },
      tag(t.findings.length ? `${t.findings.length} flagged pattern(s)` : 'clean of the usual tells', t.findings.length ? '' : 'firm'),
      out.used && out.used.length ? tag(`cites ${out.used.length} of your sources`) : null,
      el('div', { class: 'spacer' }),
      el('button', { class: 'bare sm', text: 'copy section', onClick: async () => {
        try { await navigator.clipboard.writeText(out.prose); toast('Copied.'); } catch { toast('Could not reach the clipboard.'); }
      } })),
    t.findings.length
      ? el('div', { class: 'item loose' },
          el('div', { class: 'head' }, el('span', { text: 'its own prose check' })),
          el('div', { class: 'body', text: readTells(t) }),
          el('div', { class: 'row tight', style: 'margin-top:8px' }, t.findings.slice(0, 10).map((f) => tag(clip(f.excerpt, 30)))))
      : null,
    out.unsupported && out.unsupported.length
      ? el('div', { class: 'item' },
          el('div', { class: 'head' }, el('span', { text: 'it could not support' })),
          el('ul', { style: 'margin:0;padding-left:18px' }, out.unsupported.map((u) => el('li', { text: u }))))
      : null
  );
}

async function expand(sec, root, ctx) {
  const s = getState();
  /*
   * The same set the arguments were checked against, when there is one.
   * Expanding against a different set would let a citation that was verified
   * at the argument stage be reported as unsupported here, or the reverse,
   * which is worse: an invented source slipping through because the check ran
   * against a wider list than the prompt saw.
   */
  const sources = (S.sources && S.sources.length
    ? S.sources
    : s.sources.filter((x) => (x.abstract || x.text).length > 40)).slice(0, 25);
  S.busy = sec.id;
  render(root, ctx);
  try {
    const parsed = await ask(draftPrompt({ question: S.question, section: sec, notes: sec.notes, sources }), s.settings);
    const prose = String(parsed.prose || '').trim();
    if (!prose) throw new Error('The model returned no prose.');
    /* Check its own output before the writer ever reads it. */
    S.expanded[sec.id] = {
      prose,
      tells: findTells(prose),
      unsupported: Array.isArray(parsed.unsupported) ? parsed.unsupported.map(String) : [],
      used: Array.isArray(parsed.used) ? parsed.used : []
    };
  } catch (err) { toast(err.message); }
  S.busy = null;
  render(root, ctx);
}
