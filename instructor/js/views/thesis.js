import {
  el, mount, clear, stat, chip, table, num, int, pct, toast, field,
  emptyState, banner, meter, confirmDialog, escapeHtml
} from '../ui.js';
import { getState, LEVEL_LABEL, saveThesis, loadThesisDocument, removeThesis } from '../store.js';
import { LEVELS as BLOOM_LEVELS } from '../analysis/bloom.js';
import { analyseThesis, buildSegments, dominantIssue, CATEGORY_META } from '../analysis/index.js';
import { compareAgainstCorpus, voiceConsistency, aiIndicators } from '../analysis/similarity.js';
import { verifyReference, findPriorWork, setContactEmail } from '../analysis/verify.js';
import { reviewThesis, toIssues, isConfigured, planReview } from '../analysis/ai.js';
import { checkText as ltCheck, isConfigured as ltReady, merge as ltMerge } from '../analysis/languagetool.js';
import { extractText, SUPPORTED, downloadText } from '../io/files.js';
import { openReportDialog } from './report-dialog.js';

/* View-local state: an analysed thesis survives store updates. */
const S = {
  text: '',
  filename: '',
  title: '',
  studentId: null,
  style: 'apa7',
  report: null,
  extras: {},          // aiReview, verification, priorWork, originality
  panel: 'findings',
  filters: null,
  severities: null,
  busy: null,
  savedId: null
};

export default function renderThesis(root, ctx) {
  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Thesis review' }),
        el('p', { text: 'Upload a thesis and it is parsed, marked up and scored entirely inside this browser. The reader below highlights every finding in place.' })
      ),
      el('div', { class: 'spacer' }),
      S.report ? el('button', { text: 'Start over', onClick: () => { reset(); renderThesis(root, ctx); } }) : null,
      S.report ? el('button', { class: 'primary', text: S.savedId ? 'Update saved review' : 'Save review', onClick: () => save(root, ctx) }) : null
    ),
    S.report ? analysed(root, ctx) : intake(root, ctx)
  );
}

function reset() {
  Object.assign(S, { text: '', filename: '', title: '', report: null, extras: {}, panel: 'findings', filters: null, severities: null, savedId: null });
}

/*
 * Hand a document straight to this view from elsewhere (Batch triage), so the
 * instructor does not re-open and re-parse a file the app has already read.
 * The analysis is redone here rather than passed in: this view owns the shape
 * of its own report, and a stale one from another tab would be a bug waiting.
 */
export function stageThesis({ text, filename = '', title = '', style = 'apa7', studentId = null }) {
  reset();
  Object.assign(S, {
    text,
    filename,
    title: title || filename,
    style,
    studentId,
    report: analyseThesis(text, { citationStyle: style })
  });
}

/* ------------------------------------------------------------- intake */

function intake(root, ctx) {
  const s = getState();
  const drop = el('div', { class: 'dropzone' },
    el('strong', { text: 'Drop a thesis here, or choose a file' }),
    el('p', { class: 'hint', text: `Word (.docx), PDF, RTF, HTML, Markdown or plain text. The file is read in this browser — it is not uploaded anywhere.` }),
    el('input', { type: 'file', id: 'thesis-file', accept: SUPPORTED, style: 'display:none', onChange: (e) => e.target.files[0] && ingest(e.target.files[0], root, ctx) }),
    el('button', { class: 'primary', text: 'Choose file', onClick: () => document.getElementById('thesis-file').click() })
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) ingest(f, root, ctx);
  });

  return el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'grid cols-3', style: 'margin-bottom:12px' },
        field('Student', el('select', { onChange: (e) => { S.studentId = e.target.value || null; } },
          el('option', { value: '', text: '— unassigned —' }),
          s.students.map((st) => el('option', { value: st.id, selected: st.id === S.studentId, text: `${st.name} (${LEVEL_LABEL[st.level]})` })))),
        field('Citation style', styleToggle(root, ctx), 'Switch at any time; the check re-runs.'),
        field('Title', el('input', { value: S.title, placeholder: 'optional', onChange: (e) => { S.title = e.target.value; } }))
      ),
      drop,
      S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Or paste the text' }),
      el('textarea', { id: 'thesis-paste', placeholder: 'Paste the thesis text here…', style: 'min-height:170px' }),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { class: 'primary', text: 'Analyse', onClick: () => {
          const v = document.getElementById('thesis-paste').value.trim();
          if (v.length < 200) { toast('Paste at least a few paragraphs.', 'error'); return; }
          S.text = v; S.filename = 'pasted text';
          run(root, ctx);
        } })
      )
    ),
    savedList(root, ctx)
  );
}

function styleToggle(root, ctx) {
  const wrap = el('div', { class: 'row tight' });
  [['apa7', 'APA 7'], ['mla9', 'MLA 9']].forEach(([id, label]) => {
    wrap.append(el('button', {
      class: S.style === id ? 'primary sm' : 'sm',
      text: label,
      onClick: () => {
        S.style = id;
        if (S.report) run(root, ctx, { keepExtras: true });
        else renderThesis(root, ctx);
      }
    }));
  });
  return wrap;
}

async function ingest(file, root, ctx) {
  S.busy = `Reading ${file.name}…`;
  renderThesis(root, ctx);
  try {
    const { text } = await extractText(file);
    if (!text || text.trim().length < 200) throw new Error('That file produced almost no text. If it is a scanned PDF it needs OCR first.');
    S.text = text;
    S.filename = file.name;
    if (!S.title) S.title = file.name.replace(/\.[^.]+$/, '');
    S.busy = null;
    run(root, ctx);
  } catch (err) {
    S.busy = null;
    toast(err.message, 'error');
    renderThesis(root, ctx);
  }
}

function run(root, ctx, { keepExtras = false } = {}) {
  S.busy = 'Analysing…';
  renderThesis(root, ctx);
  /* Let the browser paint the spinner before the synchronous analysis. */
  setTimeout(async () => {
    try {
      S.report = analyseThesis(S.text, { citationStyle: S.style });
      if (!keepExtras) S.extras = {};
      S.filters = null;
      S.severities = null;

      /* LanguageTool is a network round-trip to localhost, so it runs after
         the local pass rather than blocking it. A failure here must not lose
         the analysis that already succeeded. */
      const settings = getState().settings;
      if (ltReady(settings)) {
        S.busy = 'Checking grammar with LanguageTool…';
        renderThesis(root, ctx);
        try {
          const res = await ltCheck(S.text, settings, {
            onProgress: (i, n) => {
              if (n > 1) { S.busy = `LanguageTool: part ${i} of ${n}…`; renderThesis(root, ctx); }
            }
          });
          const before = S.report.issues.length;
          S.report.issues = ltMerge(S.report.issues, res.issues);
          S.report.languageTool = {
            findings: res.issues.length,
            language: res.language,
            replacedBuiltIn: before + res.issues.length - S.report.issues.length
          };
          recount(S.report);
        } catch (err) {
          S.extras.ltError = err.message;
          toast(err.message, 'error');
        }
      }

      S.busy = null;
      renderThesis(root, ctx);
    } catch (err) {
      S.busy = null;
      console.error(err);
      toast(`Analysis failed: ${err.message}`, 'error');
      renderThesis(root, ctx);
    }
  }, 20);
}

/* Counts drive the stat tiles and the filter labels, so they have to be
   recomputed after anything is merged into the issue list. */
function recount(report) {
  const by = (fn) => report.issues.filter(fn).length;
  report.counts = {
    total: report.issues.length,
    high: by((i) => i.severity === 'high'),
    medium: by((i) => i.severity === 'medium'),
    low: by((i) => i.severity === 'low'),
    typo: by((i) => i.category === 'typo'),
    grammar: by((i) => i.category === 'grammar'),
    style: by((i) => i.category === 'style'),
    argument: by((i) => i.category === 'argument'),
    structure: by((i) => i.category === 'structure'),
    citation: by((i) => i.category === 'citation')
  };
}

/* ------------------------------------------------------------ analysed */

function analysed(root, ctx) {
  const r = S.report;

  const panels = [
    ['findings', `Findings (${r.counts.total})`],
    ['bloom', 'Level of thinking'],
    ['argument', 'Claims & support'],
    ['citations', 'Citations'],
    ['originality', 'Originality'],
    ['research', 'Deep research'],
    ['overview', 'Readability']
  ];

  return el('div', {},
    el('div', { class: 'grid cols-4', style: 'margin-bottom:16px' },
      el('div', { class: 'stat' },
        el('div', { class: 'label', text: 'Where the thinking sits' }),
        el('div', { class: 'stress-dial' },
          el('div', { class: 'num', style: 'color:var(--cat-bloom)', text: r.bloom.dominant ? String(r.bloom.dominant.n) : '—' }),
          el('div', {},
            el('div', { style: 'font-weight:600', text: r.bloom.dominant ? r.bloom.dominant.label : 'Not classifiable' }),
            el('div', { class: 'sub', text: r.bloom.dominant ? `most of ${int(r.bloom.classifiedParagraphs)} paragraphs` : 'too little signposted prose' })
          )
        )
      ),
      stat('Findings', int(r.counts.total), `${r.counts.high} high · ${r.counts.medium} medium · ${r.counts.low} low`, r.counts.high > 12 ? 'high' : ''),
      stat('Length', int(r.structure.words), `${int(r.structure.paragraphs)} paragraphs · ~${r.structure.readingMinutes} min read`),
      stat('Beyond restating', pct(r.bloom.readingShare), `${int(r.bloom.readingParagraphs)} of ${int(r.bloom.classifiedParagraphs)} paragraphs analyse or judge`, r.bloom.readingShare >= 0.4 ? 'good' : r.bloom.classifiedParagraphs ? 'medium' : '')
    ),

    el('div', { class: 'row', style: 'margin-bottom:14px' },
      panels.map(([id, label]) => el('button', {
        class: S.panel === id ? 'primary sm' : 'sm',
        text: label,
        onClick: () => { S.panel = id; renderThesis(root, ctx); }
      })),
      el('div', { class: 'spacer' }),
      styleToggle(root, ctx),
      el('button', { class: 'sm', text: 'Report for student', title: 'Build a colour-marked PDF or HTML report to send back', onClick: () => openReportDialog(S.report, { title: S.title || S.filename, studentId: S.studentId }) }),
      el('button', { class: 'sm', text: 'Plain text', title: 'The findings as a text file, for your own notes', onClick: () => exportReport() })
    ),

    S.panel === 'findings' ? findingsPanel(root, ctx)
      : S.panel === 'bloom' ? bloomPanel(root, ctx)
      : S.panel === 'argument' ? argumentPanel()
      : S.panel === 'citations' ? citationsPanel(root, ctx)
      : S.panel === 'originality' ? originalityPanel(root, ctx)
      : S.panel === 'research' ? researchPanel(root, ctx)
      : overviewPanel()
  );
}

/* -------------------------------------------------------- findings panel */

function findingsPanel(root, ctx) {
  const r = S.report;
  const cats = [...new Set(r.issues.map((i) => i.category))]
    .sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 99) - (CATEGORY_ORDER.indexOf(b) + 99));

  if (!S.filters) S.filters = new Set(cats);
  /* Open on actual problems. Style notes are useful, but forty of them on top
     of six real errors is what makes the list look like noise. */
  if (!S.severities) S.severities = new Set(['high', 'medium']);

  const countBy = (fn) => r.issues.filter(fn).length;

  const toggle = (set, key, label, count, tint) =>
    el('button', {
      'aria-pressed': String(set.has(key)),
      style: tint ? `--tint:${tint}` : '',
      title: set.has(key) ? `Showing ${label}. Click to hide.` : `Hidden. Click to show ${label}.`,
      onClick: () => {
        if (set.has(key)) set.delete(key); else set.add(key);
        renderThesis(root, ctx);
      }
    },
      el('span', { class: 'swatch', style: tint ? `background:${tint}` : '' }),
      `${label} (${count})`
    );

  const severityRow = el('div', { class: 'legend' },
    el('span', { class: 'legend-label', text: 'Severity' }),
    toggle(S.severities, 'high', 'Errors', countBy((i) => i.severity === 'high'), 'var(--high)'),
    toggle(S.severities, 'medium', 'Warnings', countBy((i) => i.severity === 'medium'), 'var(--medium)'),
    toggle(S.severities, 'low', 'Suggestions', countBy((i) => i.severity === 'low'), 'var(--low)')
  );

  const categoryRow = el('div', { class: 'legend' },
    el('span', { class: 'legend-label', text: 'Type' }),
    cats.map((c) => {
      const meta = CATEGORY_META[c] || { label: c, colour: '#888' };
      return toggle(S.filters, c, meta.label, countBy((i) => i.category === c), meta.colour);
    }),
    el('button', {
      class: 'legend-reset',
      title: 'Show every finding, including style suggestions',
      onClick: () => {
        S.filters = new Set(cats);
        S.severities = new Set(['high', 'medium', 'low']);
        renderThesis(root, ctx);
      }
    }, 'Show everything')
  );

  const visible = r.issues.filter((i) => S.filters.has(i.category) && S.severities.has(i.severity));

  const reader = el('div', { class: 'reader', id: 'reader' });
  reader.innerHTML = renderHighlighted(r.text, visible);

  const findings = el('div', { class: 'findings' },
    visible.length
      ? visible.slice(0, 400).map((i, idx) => el('div', {
          class: `finding cat-${i.category}`,
          dataset: { idx: String(idx) },
          onClick: () => focusIssue(i, idx)
        },
          el('div', { class: 'top' },
            chip(i.severity === 'high' ? 'error' : i.severity === 'medium' ? 'warning' : 'suggestion', i.severity),
            chip((CATEGORY_META[i.category] || {}).label || i.category),
            i.source === 'languagetool' ? chip('LanguageTool', 'accent') : null,
            el('span', { class: 'rule', text: i.rule })
          ),
          i.excerpt ? el('div', { class: 'quote', text: clip(i.excerpt, 180) }) : null,
          el('div', { class: 'msg', text: i.message }),
          i.suggestion ? el('div', { class: 'fix', text: `→ ${i.suggestion}` }) : null
        ))
      : el('div', { class: 'empty' },
          el('strong', { text: 'Nothing matches these filters' }),
          el('div', { text: 'Every category or severity above is switched off. Use “Show everything” to bring them back.' })
        )
  );

  return el('div', {},
    severityRow,
    categoryRow,
    el('p', { class: 'hint', style: 'margin:0 0 10px', text:
      `Showing ${visible.length} of ${r.issues.length}. Errors are near-certain faults; warnings are likely ones; suggestions are matters of style, not mistakes.` }),
    r.languageTool
      ? el('p', { class: 'hint', style: 'margin:-4px 0 10px', text:
          `LanguageTool contributed ${r.languageTool.findings} finding(s) in ${r.languageTool.language}, replacing ${r.languageTool.replacedBuiltIn} built-in duplicate(s).` })
      : null,
    S.extras.ltError ? banner('warn', `LanguageTool did not run: ${S.extras.ltError}`) : null,
    r.truncated && Object.keys(r.truncated).length
      ? banner('info', `Some rules matched very often and were capped in the list: ${Object.entries(r.truncated).map(([k, v]) => `${k} (${v})`).join(', ')}. The counts above are complete.`)
      : null,
    el('div', { class: 'thesis-layout' }, reader, findings)
  );
}

/* Most useful first: real faults, then sources, then matters of taste. */
const CATEGORY_ORDER = ['grammar', 'typo', 'citation', 'argument', 'structure', 'ai', 'style'];

/*
 * Build the highlighted document. Segments are non-overlapping by
 * construction, so this is a straight concatenation — no nesting to balance.
 */
function renderHighlighted(text, issues) {
  const segments = buildSegments(text, issues);
  let out = '';
  segments.forEach((seg, i) => {
    const raw = escapeHtml(text.slice(seg.start, seg.end));
    if (!seg.issues.length) { out += raw; return; }
    const top = dominantIssue(seg.issues);
    const title = escapeHtml(seg.issues.map((x) => `${x.severity.toUpperCase()}: ${x.message}`).join('\n\n'));
    out += `<mark class="${top.category} sev-${top.severity}" data-seg="${i}" title="${title}">${raw}</mark>`;
  });
  return out;
}


/*
 * Jump to a paragraph in the reader by its opening words. focusIssue() can
 * only find text that carries a <mark>, and most paragraphs carry none — so
 * this walks the rendered text nodes instead and scrolls to the match.
 */
function scrollToText(snippet) {
  const reader = document.getElementById('reader');
  if (!reader || !snippet) return false;
  const needle = String(snippet).replace(/\s+/g, ' ').trim().slice(0, 60);
  if (needle.length < 12) return false;
  const walker = document.createTreeWalker(reader, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const hay = node.textContent.replace(/\s+/g, ' ');
    const at = hay.indexOf(needle.slice(0, 24));
    if (at < 0) continue;
    const el = node.parentElement;
    reader.querySelectorAll('mark.focus').forEach((m) => m.classList.remove('focus'));
    if (el && el !== reader) el.classList.add('focus');
    (el && el !== reader ? el : node.parentElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }
  return false;
}

function focusIssue(issue, idx) {
  const reader = document.getElementById('reader');
  if (!reader) return;
  reader.querySelectorAll('mark.focus').forEach((m) => m.classList.remove('focus'));
  document.querySelectorAll('.finding.active').forEach((f) => f.classList.remove('active'));
  const card = document.querySelector(`.finding[data-idx="${idx}"]`);
  if (card) card.classList.add('active');
  const marks = [...reader.querySelectorAll('mark')];
  const target = marks.find((m) => Number(m.title.length) >= 0 && m.textContent && issue.excerpt.startsWith(m.textContent.slice(0, 12)))
    || marks.find((m) => issue.excerpt.includes(m.textContent.trim()) && m.textContent.trim().length > 3);
  if (target) {
    target.classList.add('focus');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}


/* ----------------------------------------------------------- bloom panel */

/*
 * Bloom's revised taxonomy (Anderson & Krathwohl 2001), applied paragraph by
 * paragraph. Shown as a distribution rather than a score, and every row can be
 * clicked back to the paragraph that produced it — a classification the
 * supervisor cannot check is a classification they should not trust.
 */
function bloomPanel(root, ctx) {
  const b = S.report.bloom;
  const paras = S.report.bloomParagraphs || [];
  const max = Math.max(1, ...b.distribution.map((d) => d.count));

  return el('div', {},
    el('div', { class: 'card', style: 'margin-bottom:14px' },
      el('h2', { text: 'Where the thinking sits' }),
      el('p', { text: b.reading }),
      el('div', { class: 'ladder' },
        b.distribution.map((d) => el('div', {
          class: `rung${b.dominant && d.n === b.dominant.n ? ' is-dominant' : ''}${d.count ? '' : ' is-empty'}`
        },
          el('div', { class: 'bar', style: `height:${Math.round((d.count / max) * 88)}%` }),
          el('div', { class: 'cap' }, el('b', { text: d.label }), `${d.count}`)
        ))
      ),
      el('p', { class: 'hint', text: `${int(b.classifiedParagraphs)} of ${int(b.totalParagraphs)} body paragraphs carried a recognisable move. The other ${int(b.unclassifiedParagraphs)} are left unclassified rather than counted as low-level thinking — no signal is not the same as no thought.` })
    ),

    el('div', { class: 'grid cols-2' },
      el('div', { class: 'card' },
        el('h2', { text: 'Paragraph by paragraph' }),
        el('p', { class: 'hint', text: 'Click a row to jump to it in the text. The right-hand column is the exact wording that decided the level — if it is wrong, you can see immediately why.' }),
        el('div', {}, paras.map((p) => {
          const lv = p.level ? BLOOM_LEVELS.find((l) => l.n === p.level) : null;
          return el('div', {
            class: 'para-row',
            style: 'cursor:pointer',
            onClick: () => { S.panel = 'findings'; renderThesis(root, ctx); requestAnimationFrame(() => scrollToText(p.excerpt)); }
          },
            el('div', { class: 'lv', style: lv ? 'color:var(--cat-bloom)' : 'color:var(--text-dim)', text: lv ? String(lv.n) : '—' }),
            el('div', { class: 'lv', style: lv ? '' : 'color:var(--text-dim);font-weight:400', text: lv ? lv.label : (p.announcedOnly ? 'announced' : 'unclassified') }),
            el('div', {},
              el('div', { class: 'ex', text: clipText(p.excerpt, 150) }),
              p.evidence.length ? el('div', { class: 'ev', text: p.evidence.slice(0, 4).map((e) => e.text).join(' · ') }) : null
            )
          );
        }))
      ),

      el('div', { class: 'card' },
        el('h2', { text: 'What each level means here' }),
        table(['Level', 'Counted when the text…'], BLOOM_LEVELS.map((l) => [
          el('td', {}, chip(`${l.n} ${l.label}`, b.dominant && b.dominant.n === l.n ? 'accent' : '')),
          el('td', { class: 'wrap', text: l.gloss })
        ])),
        el('p', { class: 'hint', style: 'margin-top:10px', text: 'Asserting that something is significant counts as Understand, not Analyse. Analyse is credited only where the text names a relationship — a contrast, a tension, an effect, a shift. That line is a judgement call and you may disagree with it.' }),
        el('h2', { style: 'margin-top:18px', text: 'What this cannot do' }),
        banner('warn', 'This matches wording, not thinking. A student who signposts well reads higher than one who does the same work silently, and an announced move (“this chapter will analyse…”) is deliberately not counted as the move itself. Bloom’s is a ladder of kinds of thinking, not of quality: a chapter of close analysis is not worse than one that proposes a framework. Treat every row as a place to look, never as a mark.'),
        el('p', { class: 'hint', text: 'Anderson, L. W. & Krathwohl, D. R. (2001), A Taxonomy for Learning, Teaching and Assessing — the revision of Bloom (1956). English and Turkish cue words are both recognised.' })
      )
    )
  );
}

const clipText = (t, n) => (String(t || '').length > n ? `${String(t).slice(0, n - 1)}…` : String(t || ''));

/* -------------------------------------------------------- argument panel */

function argumentPanel() {
  const a = S.report.argument;
  return el('div', { class: 'grid cols-2' },
    el('div', { class: 'card' },
      el('h2', { text: 'Does the text support what it asserts?' }),
      el('p', { text: 'A claim is a sentence that asserts something — it carries a claim verb, an evaluative adjective, an absolute, or “should/must”. It counts as supported when a citation, a quotation, a figure or a stated reason appears within two sentences in the same paragraph.' }),
      banner('info', 'These are counts, not a grade. There is no combined score here: the six-component “stress index” this panel used to show was invented for this tool, and a number a supervisor cannot defend to a student is worse than no number.'),
      el('div', { class: 'metric-row' },
        el('div', { class: 'name' }, 'Claims with evidence or a citation',
          el('small', { text: `${int(a.stronglySupportedClaims)} of ${int(a.claims)}` }),
          meter(a.evidenceBackedRatio, a.evidenceBackedRatio > 0.6 ? 'good' : a.evidenceBackedRatio > 0.35 ? 'medium' : 'high')),
        el('div', { class: 'n', text: pct(a.evidenceBackedRatio) })
      ),
      el('div', { class: 'metric-row' },
        el('div', { class: 'name' }, 'Body paragraphs carrying support',
          el('small', { text: 'paragraphs of 35 words or more' }),
          meter(a.paragraphsWithSupport, a.paragraphsWithSupport > 0.6 ? 'good' : 'medium')),
        el('div', { class: 'n', text: pct(a.paragraphsWithSupport) })
      ),
      el('div', { class: 'metric-row' },
        el('div', { class: 'name' }, 'Paragraphs testing a counterargument',
          el('small', { text: 'against the same paragraph count' }),
          meter(a.counterargumentCoverage, a.counterargumentCoverage > 0.25 ? 'good' : 'medium')),
        el('div', { class: 'n', text: pct(a.counterargumentCoverage) })
      )
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Argument measurements' }),
      table(['Measure', { label: 'Value', num: true }, 'Reading'], [
        ['Claims identified', int(a.claims), ''],
        ['Backed by evidence or citation', int(a.stronglySupportedClaims), pct(a.evidenceBackedRatio)],
        ['Backed by reasoning only', int(a.supportedClaims - a.stronglySupportedClaims), ''],
        ['Unsupported', int(a.claims - a.supportedClaims), a.claimSupportRatio < 0.5 ? 'over half the claims stand alone' : ''],
        ['Asserted with certainty, supported by nothing', int(a.criticalStressPoints), ''],
        ['Paragraphs with support', pct(a.paragraphsWithSupport), ''],
        ['Counterargument coverage', pct(a.counterargumentCoverage), a.counterargumentCoverage < 0.15 ? 'the argument is never tested against an objection' : ''],
        ['Hedges per claim', num(a.hedgesPerClaim, 2), a.hedgesPerClaim < 0.3 ? 'under-qualified' : a.hedgesPerClaim > 1.5 ? 'over-qualified' : 'well calibrated'],
        ['Boosters per claim', num(a.boostersPerClaim, 2), a.boostersPerClaim > 0.5 ? 'certainty outruns evidence' : ''],
        ['Cohesion gaps', int(a.cohesionGaps), `paragraph pairs with no shared vocabulary or connective, out of ${int(a.bodyParagraphs)} paragraphs of 35+ words`],
        ['Citations', int(a.citations), `${int(a.uniqueSources)} distinct sources`],
        ['Citation density', num(a.citationsPerThousandWords, 1), 'per 1000 words']
      ].map((row) => [row[0], el('td', { class: 'num', text: row[1] }), row[2]])),
      a.thesisStatement
        ? el('div', { style: 'margin-top:14px' },
            el('h2', { text: 'Detected thesis statement' }),
            el('div', { class: 'quote', style: 'font-family:Georgia,serif;font-size:14px', text: a.thesisStatement.text }),
            a.threadContinuity !== null
              ? el('p', { class: 'hint', text: `Reappears in ${pct(a.threadContinuity)} of body paragraphs.` })
              : null
          )
        : el('p', { class: 'hint', style: 'margin-top:12px', text: 'No explicit thesis statement found. Look for a sentence beginning “This thesis argues…”, “The aim of this study is…”, or similar.' }),
      a.singlePoint
        ? banner('warn', `${pct(a.singlePoint.share)} of citations point at one source (${a.singlePoint.key}). If it is contested, the chapter goes with it.`)
        : null
    )
  );
}

/* ------------------------------------------------------- citations panel */

function citationsPanel(root, ctx) {
  const r = S.report;
  const c = r.citations;
  const styleLabel = r.citationStyle === 'apa7' ? 'APA 7' : 'MLA 9';
  const issues = r.issues.filter((i) => i.category === 'citation');

  return el('div', {},
    c.detected && c.detected !== r.citationStyle
      ? banner('warn', `The reference list looks like ${c.detected === 'apa7' ? 'APA 7' : 'MLA 9'}, but the checker is set to ${styleLabel}. Switch the toggle if the document is meant to be in the other style.`)
      : null,
    el('div', { class: 'grid cols-4', style: 'margin-bottom:16px' },
      stat('Style', styleLabel, `${issues.length} conformance issue${issues.length === 1 ? '' : 's'}`),
      stat('In-text citations', int(c.inTextInStyle + c.inTextWrongStyle), `${c.inTextWrongStyle} in the wrong form`, c.inTextWrongStyle ? 'medium' : 'good'),
      stat('Conformance', c.conformance === null ? '—' : pct(c.conformance), 'in-text citations matching the style', c.conformance > 0.9 ? 'good' : c.conformance < 0.6 ? 'high' : ''),
      stat('Reference entries', int(c.entries), `${r.structure.referencesNeverCited} never cited · ${r.structure.citationsMissingFromList} missing from list`)
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Style findings' }),
      issues.length
        ? table(['Severity', 'Rule', 'Text', 'Problem', 'Fix'],
            issues.map((i) => [
              el('td', {}, chip(i.severity, i.severity)),
              el('td', { style: 'font-family:var(--mono);font-size:11px', text: i.rule }),
              el('td', { class: 'wrap', style: 'font-family:var(--mono);font-size:11px', text: clip(i.excerpt, 90) }),
              el('td', { class: 'wrap', text: i.message }),
              el('td', { class: 'wrap', text: i.suggestion || '—' })
            ]))
        : el('p', { class: 'hint', text: `No ${styleLabel} conformance problems found.` })
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Reference list' }),
      el('p', { text: 'Parsed entries. Use Deep research to check that each one names a source that actually exists.' }),
      (r.referenceEntries || []).length
        ? table([{ label: '#', num: true }, 'Entry'],
            r.referenceEntries.map((e, i) => [
              el('td', { class: 'num', text: String(i + 1) }),
              el('td', { class: 'wrap', text: e.raw })
            ]))
        : el('p', { class: 'hint', text: 'No reference list found. The heading must read “References”, “Works Cited” or “Bibliography” on its own line.' })
    )
  );
}

/* ------------------------------------------------------ originality panel */

function originalityPanel(root, ctx) {
  const ex = S.extras;
  return el('div', {},
    banner('info', 'This compares the thesis against documents you already hold in this workbench and against itself. It has no index of the web or of published journals — see the note in each card for exactly what it can and cannot see.'),
    el('div', { class: 'grid cols-2' },
      el('div', { class: 'card' },
        el('h2', { text: 'Reuse against your own corpus' }),
        el('p', { text: 'Every other thesis saved in this workbench, compared passage by passage. This is what catches two students in the same cohort submitting shared text, and a student reusing their own earlier submission.' }),
        ex.originality
          ? (ex.originality.results.length
              ? table(['Document', { label: 'Overlap', num: true }, { label: 'Passages', num: true }, 'Longest shared passage'],
                  ex.originality.results.map((m) => [
                    m.label,
                    el('td', { class: 'num' }, chip(pct(m.containment), m.containment > 0.25 ? 'high' : m.containment > 0.1 ? 'medium' : '')),
                    el('td', { class: 'num', text: int(m.passages.length) }),
                    el('td', { class: 'wrap', style: 'font-family:var(--mono);font-size:11px', text: clip(S.text.slice(m.passages[0].start, m.passages[0].end), 150) })
                  ]))
              : el('p', { class: 'hint', text: 'No shared passages found against the other saved theses.' }))
          : el('button', { class: 'primary', text: 'Run comparison', onClick: () => runOriginality(root, ctx) }),
        el('p', { class: 'hint', text: 'Matching is by five-word fingerprints, so heavy paraphrase passes. Absence of a match is not evidence of originality.' })
      ),
      el('div', { class: 'card' },
        el('h2', { text: 'Voice consistency' }),
        el('p', { text: 'Passages whose style departs from the rest of the document — sentence rhythm, vocabulary richness, function-word habits. Unattributed text usually reads differently from its surroundings, whoever or whatever produced it. No corpus needed.' }),
        (() => {
          const v = ex.voice || (ex.voice = voiceConsistency(S.text));
          if (!v.usable) return el('p', { class: 'hint', text: v.reason });
          if (!v.outliers.length) return el('p', { class: 'hint', text: `Consistent throughout — no passage deviates sharply across ${v.windows.length} windows.` });
          return el('div', {},
            el('p', { class: 'hint', text: `${v.outliers.length} of ${v.windows.length} windows deviate.` }),
            v.outliers.slice(0, 6).map((w) => el('div', { class: 'finding' },
              el('div', { class: 'top' },
                chip(`deviation ${num(w.deviation, 2)}σ`, w.deviation > 2.2 ? 'high' : 'medium'),
                el('span', { class: 'rule', text: w.drivers.map((d) => `${d.k} ${d.z > 0 ? '↑' : '↓'}`).join('  ') })
              ),
              el('div', { class: 'quote', text: clip(w.text, 220) })
            ))
          );
        })()
      )
    ),
    aiCard()
  );
}

function aiCard() {
  const ex = S.extras;
  const ai = ex.ai || (ex.ai = aiIndicators(S.text));
  return el('div', { class: 'card' },
    el('h2', { text: 'AI-writing indicators' }),
    el('div', { class: 'grid cols-2' },
      el('div', {},
        el('div', { class: 'stress-dial', style: 'margin-bottom:12px' },
          el('div', { class: `num ${ai.score >= 65 ? 'overloaded' : ai.score >= 40 ? 'strained' : 'sound'}`, text: String(ai.score) }),
          el('div', {},
            el('div', { style: 'font-weight:600', text: ai.band }),
            el('div', { class: 'sub', text: 'out of 100' })
          )
        ),
        ai.signals.map((g) => el('div', { class: 'metric-row' },
          el('div', { class: 'name' },
            g.key,
            el('small', { text: g.detail }),
            meter(g.value, g.value > 0.66 ? 'high' : g.value > 0.33 ? 'medium' : 'good')
          ),
          el('div', { class: 'n', text: pct(g.value) })
        ))
      ),
      el('div', {},
        banner('warn', ai.caveat),
        el('p', { class: 'hint', text: 'Practical use: pair a high score with the voice-consistency panel and with the student’s drafts. A student who can talk through their argument and show their notes has answered the question; a score cannot.' })
      )
    )
  );
}

async function runOriginality(root, ctx) {
  const s = getState();
  const others = s.theses.filter((t) => t.id !== S.savedId);
  if (!others.length) {
    toast('No other saved theses to compare against yet.', 'error');
    return;
  }
  S.busy = 'Comparing…';
  renderThesis(root, ctx);
  const corpus = [];
  for (const t of others) {
    const doc = await loadThesisDocument(t.id);
    if (doc && doc.text) {
      const st = s.students.find((x) => x.id === t.studentId);
      corpus.push({ id: t.id, label: `${st ? st.name : 'unassigned'} — ${t.title}`, text: doc.text });
    }
  }
  S.extras.originality = compareAgainstCorpus(S.text, corpus);
  S.busy = null;
  renderThesis(root, ctx);
}

/* --------------------------------------------------------- research panel */

function researchPanel(root, ctx) {
  const ex = S.extras;
  const s = getState();
  const entries = S.report.referenceEntries || [];

  return el('div', {},
    banner('warn', 'Deep research is the only part of this app that uses the network. It sends reference strings to Crossref and OpenAlex, and the thesis statement to OpenAlex. It never sends the thesis text or any student name.'),

    el('div', { class: 'card' },
      el('h2', { text: 'Do these sources exist?' }),
      el('p', { text: 'Each reference is looked up in Crossref (165M+ publisher-deposited records) and OpenAlex (250M+ works). This is the check that catches fabricated citations — a plausible-looking reference to a paper nobody ever wrote.' }),
      entries.length
        ? el('div', {},
            el('div', { class: 'row', style: 'margin-bottom:12px' },
              el('button', { class: 'primary', disabled: Boolean(S.busy), text: `Verify ${entries.length} reference${entries.length === 1 ? '' : 's'}`, onClick: () => runVerification(root, ctx) }),
              S.busy ? el('span', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
            ),
            ex.verification
              ? table(['Status', 'Entry', 'Matched record', { label: 'Score', num: true }, 'Notes'],
                  ex.verification.map((v) => [
                    el('td', {}, chip(statusLabel(v.status), statusTone(v.status))),
                    el('td', { class: 'wrap', style: 'font-size:12px', text: clip(v.ref.raw, 120) }),
                    el('td', { class: 'wrap', style: 'font-size:12px' }, v.match
                      ? el('a', { href: v.match.url || '#', target: '_blank', rel: 'noopener', text: clip(`${v.match.title} (${v.match.year || 'n.d.'})`, 90) })
                      : '—'),
                    el('td', { class: 'num', text: num(v.score, 2) }),
                    el('td', { class: 'wrap', style: 'font-size:12px', text: [...(v.flags || []), v.note || ''].filter(Boolean).join(' ') || '—' })
                  ]))
              : null
          )
        : el('p', { class: 'hint', text: 'No reference list detected to verify.' })
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'Has this argument been made already?' }),
      el('p', { text: 'Searches OpenAlex for published work occupying the same ground as the thesis statement. Run it early — the point is to tell a student to proceed, narrow, or change direction before they write a year of it.' }),
      el('textarea', {
        id: 'novelty-input',
        placeholder: 'Paste or edit the thesis statement to search on…',
        value: S.report.argument.thesisStatement ? S.report.argument.thesisStatement.text : ''
      }),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { class: 'primary', disabled: Boolean(S.busy), text: 'Search prior work', onClick: () => runPriorWork(root, ctx) })
      ),
      ex.priorWork
        ? el('div', { style: 'margin-top:14px' },
            el('div', { class: 'row', style: 'margin-bottom:10px' },
              chip(verdictLabel(ex.priorWork.verdict), ex.priorWork.verdict === 'crowded' ? 'high' : ex.priorWork.verdict === 'occupied' ? 'medium' : 'good'),
              el('span', { class: 'hint', text: `searched: “${ex.priorWork.query}” · ${int(ex.priorWork.total)} indexed matches` })
            ),
            table([{ label: 'Overlap', num: true }, 'Work', { label: 'Year', num: true }, { label: 'Cited by', num: true }, 'Shared terms'],
              ex.priorWork.works.slice(0, 12).map((w) => [
                el('td', { class: 'num' }, chip(pct(w.overlap), w.overlap > 0.5 ? 'high' : w.overlap > 0.3 ? 'medium' : '')),
                el('td', { class: 'wrap' }, el('a', { href: w.url || '#', target: '_blank', rel: 'noopener', text: clip(w.title, 100) }),
                  el('div', { class: 'hint', text: clip(w.authors.slice(0, 3).join(', '), 70) })),
                el('td', { class: 'num', text: w.year || '—' }),
                el('td', { class: 'num', text: int(w.citedBy) }),
                el('td', { class: 'wrap', style: 'font-size:11px', text: w.sharedTerms.join(', ') })
              ])),
            el('p', { class: 'hint', text: ex.priorWork.note })
          )
        : null
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'AI second opinion' }),
      el('p', { text: 'Asks a language model the questions the rule engine cannot answer: does the cited evidence actually support the claim, is that counterargument a strawman, does a key term shift meaning between chapters.' }),
      isConfigured(s.settings)
        ? (() => {
            const plan = planReview(S.text, s.settings);
            return el('div', {},
              plan.fits
                ? el('p', { class: 'hint', text: `${plan.words.toLocaleString()} words ≈ ${plan.promptTokens.toLocaleString()} tokens, against a ${plan.budget.toLocaleString()}-token context. Fits, with ${plan.headroom.toLocaleString()} to spare.` })
                : banner('warn', `This thesis needs about ${plan.promptTokens.toLocaleString()} tokens but the configured context is ${plan.budget.toLocaleString()}. Reviewing it now would cover only the opening pages while appearing to cover all of it, so the button is disabled. Raise the context (restart Ollama with OLLAMA_CONTEXT_LENGTH=32768 and set the same figure in Settings), or paste one chapter at a time.`),
              el('div', { class: 'row' },
                el('button', { class: 'primary', disabled: Boolean(S.busy) || !plan.fits, text: 'Run AI review', onClick: () => runAiReview(root, ctx) }),
                el('span', { class: 'hint', text: s.settings.ai.provider === 'local' ? `local model at ${s.settings.ai.endpoint}` : `sends the thesis text to ${s.settings.ai.model}` })
              ),
              ex.aiReview ? aiReviewResult(ex.aiReview) : null
            );
          })()
        : el('div', {},
            el('p', { class: 'hint', text: 'AI review is off. Turn it on in Settings — you can point it at a local model (Ollama, LM Studio) so no text leaves your machine, or at the Claude API with your own key.' }),
            el('button', { text: 'Open settings', onClick: () => ctx.go('settings') })
          )
    )
  );
}

function aiReviewResult(review) {
  return el('div', { style: 'margin-top:14px' },
    review.summary ? el('p', { text: review.summary }) : null,
    review.strengths && review.strengths.length
      ? el('div', {}, el('h2', { text: 'Strengths' }), el('ul', {}, review.strengths.map((x) => el('li', { text: x }))))
      : null,
    review.anchored && review.anchored.length
      ? el('div', {}, el('h2', { text: `Findings (${review.anchored.length})` }),
          review.anchored.map((i) => el('div', { class: 'finding cat-ai' },
            el('div', { class: 'top' }, chip(i.severity, i.severity), el('span', { class: 'rule', text: i.rule })),
            i.excerpt ? el('div', { class: 'quote', text: clip(i.excerpt, 200) }) : null,
            el('div', { class: 'msg', text: i.message }),
            i.suggestion ? el('div', { class: 'fix', text: `→ ${i.suggestion}` }) : null
          )))
      : null,
    review.unanchored && review.unanchored.length
      ? el('p', { class: 'hint', text: `${review.unanchored.length} finding(s) quoted text that could not be located in the document and are not highlighted — treat those with extra care.` })
      : null
  );
}

async function runVerification(root, ctx) {
  const entries = S.report.referenceEntries || [];
  setContactEmail(getState().settings.contactEmail || '');
  S.busy = `Verifying 0 / ${entries.length}…`;
  renderThesis(root, ctx);
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      out.push(await verifyReference(entries[i].raw));
    } catch (err) {
      out.push({ ref: { raw: entries[i].raw }, status: 'error', score: 0, match: null, note: err.message });
    }
    S.busy = `Verifying ${i + 1} / ${entries.length}…`;
    const el2 = root.querySelector('.spinner');
    if (el2 && el2.parentElement) el2.parentElement.lastChild.textContent = ` ${S.busy}`;
    /* Crossref asks for courtesy; one lookup at a time is well within it. */
    await new Promise((r) => setTimeout(r, 120));
  }
  S.extras.verification = out;
  S.busy = null;
  renderThesis(root, ctx);
  const bad = out.filter((v) => v.status === 'not-found' || v.status === 'doi-not-found').length;
  toast(bad ? `${bad} reference(s) could not be found — check them by hand.` : 'All references matched a record.', bad ? 'error' : 'good');
}

async function runPriorWork(root, ctx) {
  const statement = document.getElementById('novelty-input').value.trim();
  if (statement.length < 25) { toast('Give it a sentence or two to search on.', 'error'); return; }
  setContactEmail(getState().settings.contactEmail || '');
  S.busy = 'Searching OpenAlex…';
  renderThesis(root, ctx);
  try {
    S.extras.priorWork = await findPriorWork(statement);
  } catch (err) {
    toast(err.message, 'error');
  }
  S.busy = null;
  renderThesis(root, ctx);
}

async function runAiReview(root, ctx) {
  S.busy = 'Waiting for the model…';
  renderThesis(root, ctx);
  try {
    const review = await reviewThesis(S.text, getState().settings);
    const { issues, unanchored } = toIssues(review, S.report.text);
    S.extras.aiReview = { ...review, anchored: issues, unanchored };
    /* Fold anchored AI findings into the highlighted reader. */
    S.report.issues = S.report.issues.concat(issues).sort((a, b) => a.start - b.start);
    S.report.counts.total = S.report.issues.length;
    S.filters = null;
    toast('AI review complete.', 'good');
  } catch (err) {
    toast(err.message, 'error');
  }
  S.busy = null;
  renderThesis(root, ctx);
}

/* --------------------------------------------------------- overview panel */

function overviewPanel() {
  const r = S.report;
  const rd = r.readability;
  const v = r.vocabulary;
  return el('div', { class: 'grid cols-2' },
    el('div', { class: 'card' },
      el('h2', { text: 'Readability' }),
      table(['Measure', { label: 'Value', num: true }, 'Reading'], [
        ['Flesch Reading Ease', num(rd.fleschReadingEase), rd.fleschReadingEase < 30 ? 'very dense, even for academic prose' : rd.fleschReadingEase < 50 ? 'typical for a thesis' : 'unusually accessible'],
        ['Flesch–Kincaid grade', num(rd.fleschKincaidGrade), ''],
        ['Gunning Fog', num(rd.gunningFog), ''],
        ['Average sentence', `${num(rd.avgSentenceLength)} words`, r.rhythm.monotone ? `σ ${num(r.rhythm.stdev)} — little variation` : `σ ${num(r.rhythm.stdev)}`],
        ['Longest sentence', `${int(r.rhythm.longest)} words`, ''],
        ['Passive voice', `${int(r.grammarMetrics.passiveCount)}`, `${pct(r.grammarMetrics.passiveRate)} of sentences`],
        ['Nominalisation', pct(v.nominalisationRate), v.nominalisationRate > 0.09 ? 'noun-heavy' : 'fine'],
        ['Lexical variety (MATTR)', num(v.mattr, 3), v.mattr > 0.72 ? 'rich' : v.mattr < 0.6 ? 'repetitive' : 'normal'],
        ['Spelling variant', r.dialect.dominant || '—', r.dialect.mixed ? `mixed — also uses ${r.dialect.offenders.slice(0, 4).join(', ')}` : 'consistent']
      ].map((row) => [row[0], el('td', { class: 'num', text: row[1] }), row[2]]))
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Structure' }),
      table(['Section', 'Present'], [
        ['Abstract', r.structure.sectionsFound.abstract],
        ['Introduction', r.structure.sectionsFound.introduction],
        ['Literature review', r.structure.sectionsFound.literature],
        ['Methodology', r.structure.sectionsFound.method],
        ['Results', r.structure.sectionsFound.results],
        ['Discussion', r.structure.sectionsFound.discussion],
        ['Conclusion', r.structure.sectionsFound.conclusion],
        ['References', r.structure.sectionsFound.references]
      ].map(([name, ok]) => [name, el('td', {}, ok ? chip('found', 'good') : chip('not found', 'medium'))])),
      el('p', { class: 'hint', text: 'Detection is by heading text, so an unconventional structure shows as missing without being wrong.' }),
      el('h2', { style: 'margin-top:16px', text: 'Most frequent terms' }),
      el('div', { class: 'row tight' }, v.topTerms.slice(0, 18).map((t) => chip(`${t.term} ${t.count}`)))
    )
  );
}

/* -------------------------------------------------------------- saving */

async function save(root, ctx) {
  const r = S.report;
  const rec = await saveThesis(
    {
      id: S.savedId || undefined,
      studentId: S.studentId,
      title: S.title || S.filename || 'Untitled',
      filename: S.filename,
      wordCount: r.structure.words,
      bloomLevel: r.bloom.dominant ? r.bloom.dominant.n : null,
      bloomLabel: r.bloom.dominant ? r.bloom.dominant.label : null,
      readingShare: r.bloom.readingShare,
      issueCount: r.counts.total,
      highCount: r.counts.high
    },
    {
      text: S.text,
      report: {
        issues: r.issues,
        counts: r.counts,
        argument: r.argument,
        readability: r.readability,
        structure: r.structure,
        citations: r.citations,
        citationStyle: r.citationStyle,
        generatedAt: r.generatedAt
      }
    }
  );
  S.savedId = rec.id;
  toast('Review saved to this browser.', 'good');
  renderThesis(root, ctx);
}

function savedList(root, ctx) {
  const s = getState();
  if (!s.theses.length) return null;
  return el('div', { class: 'card' },
    el('h2', { text: 'Saved reviews' }),
    table(['Student', 'Title', { label: 'Words', num: true }, 'Level', { label: 'Findings', num: true }, '', ''],
      [...s.theses].reverse().map((t) => {
        const st = s.students.find((x) => x.id === t.studentId);
        return [
          st ? st.name : '(unassigned)',
          t.title,
          el('td', { class: 'num', text: int(t.wordCount) }),
          el('td', { text: t.bloomLabel || '—' }),
          el('td', { class: 'num', text: int(t.issueCount) }),
          el('td', {}, el('button', { class: 'sm', text: 'Reopen', onClick: async () => {
            const doc = await loadThesisDocument(t.id);
            if (!doc) { toast('The document body is missing.', 'error'); return; }
            S.text = doc.text;
            S.title = t.title;
            S.filename = t.filename;
            S.studentId = t.studentId;
            S.savedId = t.id;
            S.style = (doc.report && doc.report.citationStyle) || 'apa7';
            run(root, ctx);
          } })),
          el('td', {}, el('button', { class: 'ghost sm', text: 'Delete', onClick: async () => {
            if (await confirmDialog('Delete review?', `Deletes the saved review and stored text for “${t.title}”.`, 'Delete')) {
              await removeThesis(t.id);
              toast('Deleted.');
            }
          } }))
        ];
      }))
  );
}

function exportReport() {
  const r = S.report;
  const lines = [
    `THESIS REVIEW — ${S.title || S.filename}`,
    `Generated ${new Date().toLocaleString()}`,
    `Words ${r.structure.words} · Paragraphs ${r.structure.paragraphs} · Citation style ${r.citationStyle === 'apa7' ? 'APA 7' : 'MLA 9'}`,
    '',
    `LEVEL OF THINKING (Bloom's revised taxonomy, Anderson & Krathwohl 2001)`,
    `  ${r.bloom.reading}`,
    ...r.bloom.distribution.filter((d) => d.count).map((d) => `  ${d.n} ${d.label}: ${d.count} paragraph(s)`),
    `  Unclassified: ${r.bloom.unclassifiedParagraphs} of ${r.bloom.totalParagraphs}`,
    '',
    `FINDINGS: ${r.counts.total} (${r.counts.high} high, ${r.counts.medium} medium, ${r.counts.low} low)`,
    ''
  ];
  r.issues.forEach((i, n) => {
    lines.push(`${n + 1}. [${i.severity.toUpperCase()}] ${i.rule} (char ${i.start})`);
    if (i.excerpt) lines.push(`   "${clip(i.excerpt, 200)}"`);
    lines.push(`   ${i.message}`);
    if (i.suggestion) lines.push(`   -> ${i.suggestion}`);
    lines.push('');
  });
  downloadText(lines.join('\n'), `thesis-review-${Date.now()}.txt`);
}

/* ---------------------------------------------------------------- utils */

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const statusLabel = (s) => ({ verified: 'verified', probable: 'probable', 'weak-match': 'weak match', 'not-found': 'NOT FOUND', 'doi-not-found': 'DOI dead', error: 'lookup failed' }[s] || s);
const statusTone = (s) => ({ verified: 'good', probable: 'accent', 'weak-match': 'medium', 'not-found': 'high', 'doi-not-found': 'high', error: 'medium' }[s] || '');
const verdictLabel = (v) => ({ crowded: 'Crowded ground', occupied: 'Partly occupied', clear: 'Nothing close indexed' }[v] || v);
