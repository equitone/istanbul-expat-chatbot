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
import { el, mount, sheet, tag, toast, empty, figure, escapeHtml } from '../ui.js';
import { getState } from '../store.js';
import { buildDocument } from '../analysis/text.js';
import { analyseGrammar } from '../analysis/grammar.js';
import { analyseMechanics } from '../analysis/mechanics.js';
import { analyseLearnerEnglish } from '../analysis/learner-english.js';
import { checkText, isConfigured as ltConfigured, merge } from '../analysis/languagetool.js';
import { buildSegments, dominantIssue } from '../analysis/segments.js';
import { buildGrammarReport, openPrintable, downloadReport } from '../export/grammar-report.js';

const S = {
  text: '', result: null, busy: null, lt: null,
  /* Which categories are painted and listed. A set rather than one filter:
     looking at mistakes and typos together while style stays out of the way
     is the normal case, and a single-choice filter cannot express it. */
  on: new Set(['grammar', 'typo', 'style']),
  focused: null
};

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
      el('div', { class: 'note', style: 'margin-top:10px' }, ...whereItRuns(s.settings, ctx))
    ),

    S.result ? results(S.result, root, ctx) : null
  );
  /* After mount, so the reader node exists to write into. */
  if (S.result) paintReader(S.result);
}

/*
 * Where the text goes, in the place it is being typed.
 *
 * "Is anything sent out of the computer" is the question a person actually
 * has when they paste an unpublished chapter into a box, and the answer
 * depends on one setting they may have changed weeks ago. So it is answered
 * here, specifically, naming the address — not with a general reassurance on
 * a different tab.
 */
function whereItRuns(settings, ctx) {
  if (!ltConfigured(settings)) {
    return ['Nothing you paste here leaves this computer. The rules run in this page, there is no model involved, and no request is made. LanguageTool can be added in Settings to catch more; it is optional.'];
  }
  const endpoint = String(settings.languageTool.endpoint || '');
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(endpoint);
  return local
    ? [`The built-in rules run in this page. LanguageTool also runs, at ${endpoint}, which is a server on this computer — so nothing you paste here leaves it either.`]
    : [
        el('strong', { text: 'Your text is sent to ' }),
        el('strong', { text: endpoint }),
        el('span', { text: ' when you press Check it. That is a server somewhere else, and it receives the whole passage. The built-in rules still run here and send nothing. ' }),
        el('a', { href: '#settings', onClick: (e) => { e.preventDefault(); ctx.go('settings'); },
          text: 'Switch LanguageTool off, or point it at one on this computer' })
      ];
}

function results(r, root, ctx) {
  const counts = Object.fromEntries(BUCKETS.map(([id]) => [id, r.issues.filter((i) => i.category === id).length]));
  const real = counts.grammar + counts.typo;
  const shown = r.issues.filter((i) => S.on.has(i.category));

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
        : null,
      el('div', { class: 'row', style: 'margin-top:14px' },
        el('div', { class: 'legend' },
          el('span', { class: 'legend-label', text: 'show' }),
          BUCKETS.map(([id, label]) => el('button', {
            class: `swatch-btn cat-${id}`,
            'aria-pressed': String(S.on.has(id)),
            onClick: () => { S.on.has(id) ? S.on.delete(id) : S.on.add(id); S.focused = null; render(root, ctx); }
          }, el('span', { class: `swatch cat-${id}` }), el('span', { text: `${label} ${counts[id]}` })))),
        el('div', { class: 'spacer' }),
        el('button', { class: 'sm', text: 'Save as PDF', onClick: () => printReport(r) }),
        el('button', { class: 'sm', text: 'Save the report', onClick: () => saveReport(r) }),
        el('button', { class: 'bare sm', text: 'Copy the list', onClick: () => copyList(r) }))
    ),

    /*
     * The text beside the findings, not under them.
     *
     * A list of line numbers is a list of places to go and look. Seeing the
     * passage with the fault in it is how you judge whether the rule is
     * right, which is the thing a cautious checker most needs you to do.
     */
    el('div', { class: 'reader-layout' },
      sheet(null,
        el('div', { class: 'note', style: 'margin-bottom:10px', text: 'Click anything underlined to find it in the list; click a finding to come back here.' }),
        el('div', { id: 'gr-reader', class: 'reader',
          onClick: (e) => {
            const m = e.target.closest('mark[data-issue]');
            if (m) focusFinding(Number(m.dataset.issue));
          } })),
      sheet(null,
        shown.length
          ? el('div', {}, shown.map((i) => issueItem(i, r.text, r.issues.indexOf(i))))
          : el('p', { class: 'note', text: S.on.size ? 'Nothing in the categories you are showing.' : 'Every category is hidden. Switch one back on above.' }))
    )
  );
}

/*
 * Paint the text.
 *
 * Written as HTML in one pass rather than built node by node: a chapter runs
 * to thousands of segments, and creating that many elements individually is
 * slow enough to be felt. Everything inserted is escaped first, and the only
 * markup is the <mark> this function writes.
 */
function paintReader(r) {
  const node = document.getElementById('gr-reader');
  if (!node) return;
  const active = r.issues.filter((i) => S.on.has(i.category));
  const segments = buildSegments(r.text, active);
  let out = '';
  segments.forEach((seg) => {
    const raw = escapeHtml(r.text.slice(seg.start, seg.end));
    if (!seg.issues.length) { out += raw; return; }
    const top = dominantIssue(seg.issues);
    const idx = r.issues.indexOf(top);
    const title = escapeHtml(seg.issues.map((x) => x.message).join('\n\n'));
    out += `<mark class="cat-${top.category} sev-${top.severity || 'medium'}" data-issue="${idx}" title="${title}">${raw}</mark>`;
  });
  node.innerHTML = out.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  if (S.focused !== null) highlight(S.focused);
}

/* Reader → list. */
function focusFinding(idx) {
  S.focused = idx;
  highlight(idx);
  const card = document.querySelector(`.finding[data-idx="${idx}"]`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* List → reader. */
function focusInText(idx) {
  S.focused = idx;
  highlight(idx);
  const m = document.querySelector(`#gr-reader mark[data-issue="${idx}"]`);
  if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  else toast('That one is in a category you have hidden.');
}

function highlight(idx) {
  document.querySelectorAll('#gr-reader mark.focus').forEach((m) => m.classList.remove('focus'));
  document.querySelectorAll('.finding.active').forEach((f) => f.classList.remove('active'));
  document.querySelectorAll(`#gr-reader mark[data-issue="${idx}"]`).forEach((m) => m.classList.add('focus'));
  const card = document.querySelector(`.finding[data-idx="${idx}"]`);
  if (card) card.classList.add('active');
}

function issueItem(i, text, idx) {
  /* Where it is, in words a person can use: a character offset is useless
     when you are looking at the paragraph in another window. */
  const line = text.slice(0, i.start).split('\n').length;
  return el('div', {
    class: `item finding cat-${i.category}`, 'data-idx': String(idx), tabindex: '0',
    onClick: () => focusInText(idx),
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusInText(idx); } }
  },
    el('div', { class: 'head' },
      el('span', { class: `swatch cat-${i.category}` }),
      el('span', { text: `line ${line}` }),
      i.severity ? tag(i.severity, i.severity === 'high' ? 'firm' : '') : null,
      i.rule ? el('span', { class: 'mono', text: i.rule }) : null),
    el('div', { class: 'quote', text: `…${text.slice(Math.max(0, i.start - 40), i.start)}\u27e6${i.excerpt}\u27e7${text.slice(i.end, i.end + 40)}…` }),
    el('div', { class: 'body', style: 'margin-top:6px', text: i.message }),
    i.suggestion ? el('div', { class: 'meta', style: 'margin-top:4px', text: `Suggested: ${i.suggestion}` }) : null
  );
}

function reportTitle() {
  const first = S.text.trim().split(/\n/)[0] || '';
  return first.length > 4 && first.length < 90 ? first.trim() : 'Grammar check';
}

function printReport(r) {
  const html = buildGrammarReport({ ...r, title: reportTitle() });
  if (!openPrintable(html)) {
    toast('The browser blocked the print window. Allow pop-ups for this page, or use “Save the report” and print the file.');
  }
}

function saveReport(r) {
  const html = buildGrammarReport({ ...r, title: reportTitle() });
  downloadReport(html, `grammar-${new Date().toISOString().slice(0, 10)}.html`);
  toast('Saved. Open it and print to PDF from there if you want one.');
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
