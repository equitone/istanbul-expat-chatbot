/*
 * grammar.js — plain grammar checking, nothing else.
 *
 * The same engine the Instructor Workbench runs over student submissions,
 * pointed at your own writing instead. Three buckets, kept separate on
 * screen because they are three different jobs, and split on what the fix
 * changes:
 *
 *   Grammar       a word is the wrong form, or one is missing. Agreement,
 *                 articles, plurals, prepositions.
 *   Punctuation   a mark or a space is wrong and no word needs to change.
 *                 Commas, quotes, brackets, dashes, spacing.
 *   Typos         the word itself is wrong. Misspellings, doubled words,
 *                 the homophone confusions.
 *
 * Only faults are listed. The shared rules also produce style findings —
 * passive voice, wordiness, sentence length — and this tab drops them: they
 * are matters of taste, and the Instructor Workbench is where a supervisor
 * marking someone else's draft can see them.
 *
 * Every rule is tuned for precision over recall. A checker that flags
 * correct prose gets switched off after the second false alarm, so a rule
 * that cannot be narrowed enough is left out rather than shipped noisy.
 *
 * LanguageTool, if you have it, runs as a further pass and its findings are
 * merged in. It catches a wider range; these rules catch things it does not,
 * which is why both run rather than one replacing the other.
 *
 * Nothing here needs a model, and nothing here leaves this computer unless
 * you have pointed LanguageTool at a server yourself.
 */
import { el, mount, sheet, tag, toast, empty, figure, escapeHtml } from '../ui.js';
import { getState, addWords } from '../store.js';
import { buildDocument } from '../analysis/text.js';
import { analyseGrammar } from '../analysis/grammar.js';
import { analyseMechanics } from '../analysis/mechanics.js';
import { analyseLearnerEnglish } from '../analysis/learner-english.js';
import { checkText, isConfigured as ltConfigured, merge } from '../analysis/languagetool.js';
import { buildSegments, dominantIssue } from '../analysis/segments.js';
import { analysePunctuation, STYLES as PUNCT_STYLES } from '../analysis/punctuation.js';
import { analyseSpelling, DIALECTS as SPELL_DIALECTS, isReady as dictReady } from '../analysis/spelling.js';
import { buildGrammarReport, openPrintable, downloadReport } from '../export/grammar-report.js';

const S = {
  text: '', result: null, busy: null, lt: null,
  /* Which categories are painted and listed. A set rather than one filter:
     looking at mistakes and typos together while style stays out of the way
     is the normal case, and a single-choice filter cannot express it. */
  /* Derived from BUCKETS rather than written out again: a fourth bucket
     added to the list and forgotten here is shown in the legend, counted in
     the figures, and painted nowhere — which is exactly what happened. */
  on: new Set(),
  focused: null,
  /* How the text got here: 'paste' or 'file'. The filename, when there is
     one, becomes the report's title, which beats "Grammar check" on a
     printout you are filing with a chapter. */
  via: 'paste',
  filename: ''
};

/*
 * Four buckets, split on what the fix changes.
 *
 * Punctuation and spelling used to share one, and they are not the same
 * job: someone hunting a comma problem and someone hunting a misspelling
 * read past each other's findings. The dividing line is in segments.js,
 * where both apps read it from, so the two cannot drift apart.
 */
const BUCKETS = [
  ['grammar', 'Grammatical mistakes', 'A word is the wrong form, or one is missing. Agreement, articles, plurals, prepositions.'],
  ['punctuation', 'Punctuation', 'A mark or a space is wrong, and no word needs to change. Commas, quotes, brackets, dashes.'],
  ['typo', 'Typos', 'The wrong word, or the right one mistyped. Misspellings, doubled words, its/it\u2019s.']
];

/*
 * Style findings are computed and then dropped.
 *
 * The rules still run — the Instructor Workbench shows them, and they share
 * this code — but this tab lists only things that are wrong. Passive voice,
 * wordiness and sentence length are matters of taste, and the tab reads
 * better without a third of its findings being opinions.
 *
 * The passive-voice share went with them. It was defensible as a count
 * rather than a verdict, but a percentage on a page of errors reads as a
 * score however it is labelled, and passive voice is normal in academic
 * prose — particularly in a methods section, where it is the right choice.
 */
const SHOWN = new Set(BUCKETS.map(([id]) => id));

/* Everything on, the first time the view runs. */
if (!S.on.size) BUCKETS.forEach(([id]) => S.on.add(id));

export default function render(root, ctx) {
  const s = getState();
  const words = S.text.trim() ? S.text.trim().split(/\s+/).length : 0;

  mount(root,
    el('h1', { text: 'Grammar' }),
    el('p', { class: 'lede', text: 'Paste text or open a file, and it is checked here, on this computer, with no model involved. Grammar, punctuation and typos are counted separately, because they are three different jobs. Only things that are wrong are listed; no suggestions.' }),

    sheet(null,
      el('div', { class: 'row', style: 'margin-bottom:14px' },
        el('div', { class: 'seg' },
          el('button', { 'aria-pressed': String(S.via === 'paste'), text: 'Paste text',
            onClick: () => { S.via = 'paste'; render(root, ctx); } }),
          el('button', { 'aria-pressed': String(S.via === 'file'), text: 'From a file',
            onClick: () => { S.via = 'file'; render(root, ctx); } })),
        S.filename ? el('span', { class: 'note', text: `Read from ${S.filename}.` }) : null),

      S.via === 'file' ? fileInput(root, ctx) : null,

      el('label', { class: 'field' },
        el('span', { text: S.via === 'file' ? 'What was read, which you can edit before checking' : 'Your text' }),
        el('textarea', { id: 'gr-text', rows: 8, value: S.text,
          placeholder: S.via === 'file'
            ? 'Choose a file above and its text appears here.'
            : 'Paste a paragraph, a chapter, an abstract, an email.',
          onInput: (e) => { S.text = e.target.value; S.filename = ''; } })),
      el('div', { class: 'row' },
        el('button', { id: 'gr-run', class: 'solid', disabled: Boolean(S.busy), text: 'Check it',
          onClick: () => run(root, ctx) }),
        el('span', { class: 'note', text: `${words.toLocaleString()} word${words === 1 ? '' : 's'}.` }),
        S.text ? el('button', { class: 'bare sm', text: 'Clear',
          onClick: () => { S.text = ''; S.filename = ''; S.result = null; render(root, ctx); } }) : null,
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null),
      el('div', { class: 'note', style: 'margin-top:10px' }, ...whereItRuns(s.settings, ctx))
    ),

    S.result ? results(S.result, root, ctx) : null
  );
  /* After mount, so the reader node exists to write into. */
  if (S.result) paintReader(S.result);
}

/*
 * A chapter is a file, not a paste.
 *
 * Pasting forty pages out of Word is awkward and loses the paragraph breaks
 * the sentence rules depend on, so PDF, Word, text and Markdown are read
 * directly — the same extractor the Library uses. The text lands in the box
 * rather than going straight to the checker, because an extracted PDF often
 * carries a running header on every page and you want to see that before it
 * becomes forty findings.
 *
 * It is read in this browser. Nothing is uploaded.
 */
function fileInput(root, ctx) {
  return el('div', { style: 'margin-bottom:14px' },
    el('input', {
      id: 'gr-file', type: 'file', accept: '.txt,.md,.markdown,.pdf,.docx,.rtf,.html,.htm',
      onChange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        S.busy = `Reading ${f.name}…`;
        render(root, ctx);
        try {
          const { extractText } = await import('../io/files.js');
          const { text } = await extractText(f);
          if (!text || text.trim().length < 20) throw new Error('almost no text came out of it');
          S.text = text;
          S.filename = f.name;
          S.result = null;
          toast(`${text.trim().split(/\s+/).length.toLocaleString()} words read. Check it over, then press Check it.`);
        } catch (err) {
          toast(`${f.name}: ${err.message}`);
        }
        S.busy = null;
        render(root, ctx);
      }
    }),
    el('p', { class: 'note', style: 'margin-top:6px', text: 'PDF, Word, RTF, plain text or Markdown. Read in this browser; nothing is uploaded. A PDF often brings its running headers with it, so look over what comes out before checking.' })
  );
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
    return [
      'Nothing you paste here leaves this computer. The rules run in this page, there is no model involved, and no request is made. ',
      el('a', { href: '#settings', onClick: (e) => { e.preventDefault(); ctx.go('settings'); },
        text: 'LanguageTool catches more and can be run on this computer too' }),
      el('span', { text: ', so adding it need not change that.' })
    ];
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
  const real = r.issues.length;
  const shown = r.issues.filter((i) => S.on.has(i.category));

  return el('div', {},
    sheet('What came back',
      el('div', { class: 'figures' },
        figure('grammar', counts.grammar),
        figure('punctuation', counts.punctuation),
        figure('typos', counts.typo),
        figure('per 1000 words', r.words ? (real / r.words * 1000).toFixed(1) : '0'),
        /* Mixed British and American spelling in one document is the kind of
           thing a reader notices and a rule-by-rule list buries. */
        r.dialect.mixed
          ? figure('spelling', 'mixed', `${r.dialect.counts.UK} British, ${r.dialect.counts.US} American — ${r.dialect.offenders.slice(0, 3).join(', ')}`)
          : figure('spelling', r.dialect.dominant === 'UK' ? 'British' : r.dialect.dominant === 'US' ? 'American' : '—',
              r.dialect.total ? 'consistent' : 'nothing to tell from')
      ),
      el('p', { class: 'note', text: `Punctuation checked against ${(PUNCT_STYLES.find((x) => x.id === r.punctuationStyle) || {}).label || r.punctuationStyle} rules, from The Best Punctuation Book, Period. Change the style in Settings; the four disagree in real places, and a rule from the wrong one would tell you to break your own.` }),
      spellingNote(r, root, ctx),
      r.ltNote ? el('p', { class: 'note', text: r.ltNote }) : null,
      !real
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
    i.suggestion ? el('div', { class: 'meta', style: 'margin-top:4px', text: `Suggested: ${i.suggestion}` }) : null,
    /* Where the rule comes from, on the finding rather than in a footnote:
       a disagreement should be settleable by opening the book. */
    i.source ? el('div', { class: 'note source', style: 'margin-top:4px', text: i.source }) : null
  );
}

function reportTitle() {
  if (S.filename) return S.filename.replace(/\.[^.]+$/, '');
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

/*
 * What the spelling check rests on, and what it decided to leave alone.
 *
 * Two things have to be on screen for this to be trustworthy. First, which
 * dictionary — a spelling claim with no named dictionary behind it is the
 * thing this replaced. Second, the words it treated as the writer's own, so
 * nobody has to wonder whether silence meant "correct" or "given up on".
 *
 * And if the dictionary did not load, that is said instead of nothing.
 * Spelling quietly going unchecked looks exactly like spelling being right.
 */
function spellingNote(r, root, ctx) {
  const sp = r.spelling;
  if (!sp) return null;
  if (!sp.ran) {
    return el('div', { class: 'verdict bad', role: 'status' },
      el('strong', { text: 'Spelling was not checked.' }), ' ',
      `The dictionary did not load (${sp.reason}). Everything else on this page ran; spelling alone is missing, and no news here is not good news.`);
  }
  const label = (SPELL_DIALECTS.find((d) => d.id === sp.dialect) || {}).label || sp.dialect;
  const own = sp.ownWords || [];
  return el('div', {},
    el('p', { class: 'note', text: `Spelling checked with Hunspell against the SCOWL ${label} dictionary \u2014 the same files LibreOffice and Firefox use, held beside the app. Change which one in Settings.` }),
    own.length
      ? el('p', { class: 'note' },
          `Used more than twice and not in the dictionary, so taken as your own vocabulary rather than reported: ${own.join(', ')}. `,
          el('button', { class: 'sm', text: own.length === 1 ? 'Add it to my dictionary' : 'Add them to my dictionary',
            onClick: () => { addWords(own); toast(`${own.length} word(s) added to your dictionary.`); run(root, ctx); } }))
      : null
  );
}

async function run(root, ctx) {
  const s = getState();
  const text = S.text.trim();
  if (text.length < 20) { toast('Paste a bit more than that.'); return; }

  S.busy = 'Checking…';
  S.result = null;
  render(root, ctx);

  const doc = buildDocument(text);
  /* Each analyser returns {issues, …}; the extras (dialect) are
     taken where they are worth showing and otherwise left alone. */
  const g = analyseGrammar(doc);
  const m = analyseMechanics(doc);
  const l = analyseLearnerEnglish(doc);
  /* Punctuation is checked against one named reference, per the style set
     in Settings, and every finding carries its chapter. */
  const punct = analysePunctuation(doc, { style: s.settings.punctuationStyle });

  /*
   * Spelling comes from the dictionary, not from a list.
   *
   * The dictionary has to be parsed the first time, which takes about a
   * tenth of a second, so this says what it is doing rather than appearing
   * to hang. mechanics.js still carries the old hand-written table of 246
   * misspellings for the instructor app, which checks synchronously; here
   * its findings are dropped, because the dictionary is a superset of them
   * and two authorities for one word is how a finding gets reported twice.
   */
  const dialect = s.settings.spellDialect || SPELL_DIALECTS[0].id;
  if (!dictReady(dialect)) {
    S.busy = 'Loading the dictionary\u2026';
    render(root, ctx);
  }
  const sp = await analyseSpelling(doc, {
    dialect,
    personal: s.settings.personalWords || []
  });

  const fromRules = [...g.issues, ...m.issues, ...l.issues]
    .filter((i) => i.rule !== 'misspelling');
  const rulesAndPunct = [...fromRules, ...punct.issues];

  /*
   * A word the rules already explained is not also an unknown word.
   *
   * "literatures" is in the dictionary's bad books and in lexicons.js as an
   * uncountable noun, so it came back twice: once saying the word does not
   * exist and once explaining that literature has no plural. The second is
   * the better finding, so anything the dictionary flags over a span another
   * analyser has already covered is dropped.
   */
  const covered = (i) => rulesAndPunct.some((o) =>
    i.start < o.end && o.start < i.end
    /* Only a finding about the same word counts. Without this, a
       sentence-length finding swallows every unknown word inside it: one
       resumptive-pronoun spanning a clause was quietly eating "seperate". */
    && (o.end - o.start) <= (i.end - i.start) + 6);
  let issues = [...rulesAndPunct, ...sp.issues.filter((i) => !covered(i))]
    .filter((i) => SHOWN.has(i.category))
    .sort((a, b) => a.start - b.start);
  let ltNote = '';

  if (ltConfigured(s.settings)) {
    S.busy = 'Asking LanguageTool…';
    render(root, ctx);
    try {
      const ext = await checkText(text, s.settings, {
        onProgress: ({ done, total }) => { S.busy = `LanguageTool, part ${done} of ${total}…`; render(root, ctx); }
      });
      const mine = issues.length;
      issues = merge(issues, ext.issues.filter((i) => SHOWN.has(i.category)));
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
    punctuationStyle: punct.style,
    spelling: sp
  };
  S.busy = null;
  render(root, ctx);

  /*
   * Put the two panes under the header.
   *
   * They are sticky, but sticky only engages once the page has scrolled to
   * them; on the first check they sit below a tall input box and run past
   * the bottom of the window, which is what made the two columns look
   * mismatched. Scrolling here is not a surprise — it immediately follows
   * pressing Check it, which is exactly when the results are what you want
   * to be looking at.
   */
  const layout = root.querySelector('.reader-layout');
  if (layout) {
    const bar = Math.round(document.querySelector('header.bar')?.getBoundingClientRect().height || 52);
    const y = window.scrollY + layout.getBoundingClientRect().top - bar - 18;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
}
