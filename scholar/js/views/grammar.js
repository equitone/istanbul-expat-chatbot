/*
 * grammar.js — plain grammar checking, nothing else.
 *
 * The same engine the Instructor Workbench runs over student submissions,
 * pointed at your own writing instead. Three layers, kept separate on screen
 * because they answer different questions:
 *
 *   Mistakes      agreement, articles, run-ons, tense, punctuation. Things
 *                 that are wrong.
 *   Typos         misspellings, doubled words, spacing, confusables.
 *   Style         passive voice, wordiness, informal register. Not errors,
 *                 and kept apart so six real faults are not buried under
 *                 forty suggestions.
 *
 * Every rule is tuned for precision over recall. A checker that flags correct
 * prose gets switched off after the second false alarm, so a rule that cannot
 * be narrowed enough is left out rather than shipped noisy.
 *
 * LanguageTool, if you have it, runs as a fourth pass and its findings are
 * merged in. It catches a wider range; these rules catch things it does not,
 * which is why both run rather than one replacing the other.
 *
 * Nothing here needs a model, and nothing here leaves this computer unless
 * you have pointed LanguageTool at a server yourself.
 */
import { el, mount, sheet, tag, toast, empty, figure } from '../ui.js';
import { getState } from '../store.js';
import { buildDocument } from '../analysis/text.js';
import { analyseGrammar } from '../analysis/grammar.js';
import { analyseMechanics } from '../analysis/mechanics.js';
import { analyseLearnerEnglish } from '../analysis/learner-english.js';
import { checkText, isConfigured as ltConfigured, merge } from '../analysis/languagetool.js';

const S = { text: '', result: null, busy: null, filter: 'all', lt: null };

const BUCKETS = [
  ['grammar', 'Mistakes', 'Wrong, not merely improvable.'],
  ['typo', 'Typos and spelling', 'Including doubled words and confusables.'],
  ['style', 'Style', 'Suggestions. Ignore freely; they are not errors.']
];

export default function render(root, ctx) {
  const s = getState();
  const words = S.text.trim() ? S.text.trim().split(/\s+/).length : 0;

  mount(root,
    el('h1', { text: 'Grammar' }),
    el('p', { class: 'lede', text: 'Paste anything and it is checked here, on this computer, with no model involved. Mistakes, typos and style are counted separately, because a style suggestion is not an error and should not sit in the same list as one.' }),

    sheet(null,
      el('label', { class: 'field' },
        el('span', { text: 'Your text' }),
        el('textarea', { id: 'gr-text', rows: 12, value: S.text,
          placeholder: 'Paste a paragraph, a chapter, an abstract, an email.',
          onInput: (e) => { S.text = e.target.value; } })),
      el('div', { class: 'row' },
        el('button', { id: 'gr-run', class: 'solid', disabled: Boolean(S.busy), text: 'Check it',
          onClick: () => run(root, ctx) }),
        el('span', { class: 'note', text: `${words.toLocaleString()} word${words === 1 ? '' : 's'}.` }),
        S.text ? el('button', { class: 'bare sm', text: 'Clear',
          onClick: () => { S.text = ''; S.result = null; render(root, ctx); } }) : null,
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null),
      el('p', { class: 'note', style: 'margin-top:10px', text: ltConfigured(s.settings)
        ? 'LanguageTool is set up and will run as well, widening what gets caught.'
        : 'Running the built-in rules only. LanguageTool can be added in Settings to catch more; it is optional and everything here works without it.' })
    ),

    S.result ? results(S.result, root, ctx) : null
  );
}

function results(r, root, ctx) {
  const counts = Object.fromEntries(BUCKETS.map(([id]) => [id, r.issues.filter((i) => i.category === id).length]));
  const real = counts.grammar + counts.typo;

  return el('div', {},
    sheet('What came back',
      el('div', { class: 'figures' },
        figure('mistakes', counts.grammar),
        figure('typos', counts.typo),
        figure('style notes', counts.style),
        figure('per 1000 words', r.words ? (real / r.words * 1000).toFixed(1) : '0', 'mistakes and typos'),
        figure('passive voice', `${Math.round(r.passiveRate * 100)}%`, 'of sentences'),
        /* Mixed British and American spelling in one document is the kind of
           thing a reader notices and a rule-by-rule list buries. */
        r.dialect.mixed
          ? figure('spelling', 'mixed', `${r.dialect.counts.UK} British, ${r.dialect.counts.US} American — ${r.dialect.offenders.slice(0, 3).join(', ')}`)
          : figure('spelling', r.dialect.dominant === 'UK' ? 'British' : r.dialect.dominant === 'US' ? 'American' : '—',
              r.dialect.total ? 'consistent' : 'nothing to tell from')
      ),
      r.ltNote ? el('p', { class: 'note', text: r.ltNote }) : null,
      !real && !counts.style
        ? el('p', { class: 'note', text: 'Nothing flagged. These rules are deliberately cautious, so this means nothing they test for is wrong, not that the writing is beyond improvement.' })
        : null
    ),

    real || counts.style
      ? sheet(null, el('div', { class: 'row' },
          el('div', { class: 'seg' },
            [['all', `Everything (${r.issues.length})`], ...BUCKETS.map(([id, label]) => [id, `${label} (${counts[id]})`])]
              .map(([id, label]) => el('button', {
                'aria-pressed': String(S.filter === id), text: label,
                onClick: () => { S.filter = id; render(root, ctx); } })))))
      : null,

    BUCKETS.filter(([id]) => S.filter === 'all' || S.filter === id).map(([id, label, blurb]) => {
      const list = r.issues.filter((i) => i.category === id);
      if (!list.length) return null;
      return sheet(label,
        el('p', { class: 'note', style: 'margin-bottom:14px', text: blurb }),
        list.map((i) => issueItem(i, r.text))
      );
    }),

    r.issues.length ? sheet(null,
      el('div', { class: 'row' },
        el('button', { class: 'sm', text: 'Copy the list', onClick: () => copyList(r) }),
        el('span', { class: 'note', text: 'Plain text, with the line each one is on.' }))) : null
  );
}

function issueItem(i, text) {
  /* Where it is, in words a person can use: a character offset is useless
     when you are looking at the paragraph in another window. */
  const before = text.slice(0, i.start);
  const line = before.split('\n').length;
  return el('div', { class: 'item' },
    el('div', { class: 'head' },
      el('span', { text: `line ${line}` }),
      i.severity ? tag(i.severity, i.severity === 'high' ? 'firm' : '') : null,
      i.rule ? el('span', { class: 'mono', text: i.rule }) : null),
    el('div', { class: 'quote', text: `…${text.slice(Math.max(0, i.start - 40), i.start)}⟦${i.excerpt}⟧${text.slice(i.end, i.end + 40)}…` }),
    el('div', { class: 'body', style: 'margin-top:6px', text: i.message }),
    i.suggestion ? el('div', { class: 'meta', style: 'margin-top:4px', text: `Suggested: ${i.suggestion}` }) : null
  );
}

function copyList(r) {
  const lines = r.issues.map((i) => {
    const line = r.text.slice(0, i.start).split('\n').length;
    return `line ${line} · ${i.category} · ${i.excerpt}\n    ${i.message}${i.suggestion ? `\n    suggested: ${i.suggestion}` : ''}`;
  });
  const out = `${r.issues.length} finding(s) in ${r.words} words\n\n${lines.join('\n\n')}\n`;
  navigator.clipboard.writeText(out)
    .then(() => toast('Copied.'))
    .catch(() => toast('This browser would not let the page copy. Select the text instead.'));
}

async function run(root, ctx) {
  const s = getState();
  const text = S.text.trim();
  if (text.length < 20) { toast('Paste a bit more than that.'); return; }

  S.busy = 'Checking…';
  S.result = null;
  render(root, ctx);

  const doc = buildDocument(text);
  /* Each analyser returns {issues, …}; the extras (dialect, passive rate) are
     taken where they are worth showing and otherwise left alone. */
  const g = analyseGrammar(doc);
  const m = analyseMechanics(doc);
  const l = analyseLearnerEnglish(doc);
  let issues = [...g.issues, ...m.issues, ...l.issues].sort((a, b) => a.start - b.start);
  let ltNote = '';

  if (ltConfigured(s.settings)) {
    S.busy = 'Asking LanguageTool…';
    render(root, ctx);
    try {
      const ext = await checkText(text, s.settings, {
        onProgress: ({ done, total }) => { S.busy = `LanguageTool, part ${done} of ${total}…`; render(root, ctx); }
      });
      const mine = issues.length;
      issues = merge(issues, ext.issues);
      ltNote = `LanguageTool checked all ${ext.chunks} part(s) in ${ext.language}: ${ext.issues.length} finding(s) from it, ${mine} from the built-in rules, ${mine + ext.issues.length - issues.length} dropped as duplicates.`;
    } catch (err) {
      /* Its absence must not look like a clean bill of health. */
      ltNote = `LanguageTool did not answer (${err.message}), so this is the built-in rules alone. They catch less.`;
    }
  }

  S.result = {
    text, issues, ltNote,
    words: text.split(/\s+/).length,
    dialect: m.dialect,
    passiveRate: g.metrics.passiveRate
  };
  S.busy = null;
  render(root, ctx);
}
