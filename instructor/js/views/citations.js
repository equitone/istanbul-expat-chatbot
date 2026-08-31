/*
 * citations.js — a tab devoted to sources.
 *
 * Three questions, kept apart because they have different answers and
 * different limits:
 *   Is it formatted correctly?   — style rules, offline, certain.
 *   Does the source exist?       — Crossref and OpenAlex, online, mostly certain.
 *   Is it the student's own?     — fingerprints against documents held here.
 */
import {
  el, mount, stat, chip, table, toast, field, int, num, pct,
  emptyState, banner, confirmDialog
} from '../ui.js';
import { getState, LEVEL_LABEL, loadThesisDocument } from '../store.js';
import { analyseThesis } from '../analysis/index.js';
import { STYLES } from '../analysis/citations.js';
import { verifyReference, setContactEmail } from '../analysis/verify.js';
import { compareAgainstCorpus } from '../analysis/similarity.js';
import { extractText, SUPPORTED } from '../io/files.js';
import { openReportDialog } from './report-dialog.js';

const S = {
  text: '', title: '', filename: '', studentId: null,
  style: 'apa7', report: null, busy: null,
  verification: null, reuse: null, panel: 'style'
};

export default function renderCitations(root, ctx) {
  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Citations' }),
        el('p', { text: 'Whether the referencing is correctly formed, whether the sources exist, and whether the passages around them are the student’s own.' })
      ),
      el('div', { class: 'spacer' }),
      S.report ? el('button', { text: 'Start over', onClick: () => { reset(); renderCitations(root, ctx); } }) : null,
      S.report ? el('button', { class: 'primary', text: 'Report for student', onClick: () => openReportDialog(S.report, { defaultSections: ['summary', 'citation', 'marked'], title: S.title || S.filename, studentId: S.studentId }) }) : null
    ),
    S.report ? loaded(root, ctx) : intake(root, ctx)
  );
}

function reset() {
  Object.assign(S, { text: '', title: '', filename: '', report: null, verification: null, reuse: null, panel: 'style' });
}

/* ------------------------------------------------------------- intake */

function intake(root, ctx) {
  const s = getState();
  const drop = el('div', { class: 'dropzone' },
    el('strong', { text: 'Drop a thesis or a chapter here' }),
    el('p', { class: 'hint', text: 'Word, PDF, RTF, Markdown or plain text. Read in this browser; nothing is uploaded.' }),
    el('input', { type: 'file', id: 'cite-file', accept: SUPPORTED, style: 'display:none', onChange: (e) => e.target.files[0] && ingest(e.target.files[0], root, ctx) }),
    el('button', { class: 'primary', text: 'Choose file', onClick: () => document.getElementById('cite-file').click() })
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) ingest(e.dataTransfer.files[0], root, ctx);
  });

  return el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'grid cols-3', style: 'margin-bottom:12px' },
        field('Student', el('select', { onChange: (e) => { S.studentId = e.target.value || null; } },
          el('option', { value: '', text: '— unassigned —' }),
          s.students.map((st) => el('option', { value: st.id, selected: st.id === S.studentId, text: `${st.name} (${LEVEL_LABEL[st.level]})` })))),
        field('Required style', styleToggle(root, ctx)),
        field('Title', el('input', { value: S.title, placeholder: 'optional', onChange: (e) => { S.title = e.target.value; } }))
      ),
      drop,
      S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Or paste the text' }),
      el('p', { text: 'Include the reference list — the cross-checks need it.' }),
      el('textarea', { id: 'cite-paste', placeholder: 'Paste the chapter and its references…', style: 'min-height:150px' }),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { class: 'primary', text: 'Check citations', onClick: () => {
          const v = document.getElementById('cite-paste').value.trim();
          if (v.length < 120) { toast('Paste at least a paragraph and its references.', 'error'); return; }
          S.text = v; S.filename = 'pasted text';
          run(root, ctx);
        } })
      )
    ),
    savedList(root, ctx)
  );
}

function styleToggle(root, ctx) {
  return el('div', { class: 'row tight' },
    Object.values(STYLES).map((st) => el('button', {
      class: S.style === st.id ? 'primary sm' : 'sm',
      text: st.label,
      onClick: () => {
        S.style = st.id;
        if (S.report) run(root, ctx, { keep: true });
        else renderCitations(root, ctx);
      }
    }))
  );
}

async function ingest(file, root, ctx) {
  S.busy = `Reading ${file.name}…`;
  renderCitations(root, ctx);
  try {
    const { text } = await extractText(file);
    if (!text || text.trim().length < 120) throw new Error('That file produced almost no text.');
    S.text = text; S.filename = file.name;
    if (!S.title) S.title = file.name.replace(/\.[^.]+$/, '');
    S.busy = null;
    run(root, ctx);
  } catch (err) {
    S.busy = null;
    toast(err.message, 'error');
    renderCitations(root, ctx);
  }
}

function run(root, ctx, { keep = false } = {}) {
  S.busy = 'Checking…';
  renderCitations(root, ctx);
  setTimeout(() => {
    try {
      S.report = analyseThesis(S.text, { citationStyle: S.style });
      if (!keep) { S.verification = null; S.reuse = null; }
      S.busy = null;
      renderCitations(root, ctx);
    } catch (err) {
      S.busy = null;
      toast(`Check failed: ${err.message}`, 'error');
      renderCitations(root, ctx);
    }
  }, 20);
}

/* ------------------------------------------------------------- results */

function loaded(root, ctx) {
  const r = S.report;
  const c = r.citations;
  const styleLabel = STYLES[r.citationStyle].label;
  const verified = S.verification ? S.verification.filter((v) => v.status === 'verified' || v.status === 'probable').length : null;
  const notFound = S.verification ? S.verification.filter((v) => v.status === 'not-found' || v.status === 'doi-not-found').length : null;

  const panels = [
    ['style', `Style (${r.issues.filter((i) => i.category === 'citation').length})`],
    ['list', `Reference list (${c.entries})`],
    ['exists', 'Do the sources exist?'],
    ['reuse', 'Passage reuse']
  ];

  return el('div', {},
    el('div', { class: 'grid cols-4', style: 'margin-bottom:16px' },
      stat('Required style', styleLabel, c.detected && c.detected !== r.citationStyle ? `document looks like ${STYLES[c.detected].label}` : 'matches the document'),
      stat('In-text citations', int(c.inTextInStyle + c.inTextWrongStyle), `${c.inTextWrongStyle} in the wrong form`, c.inTextWrongStyle ? 'high' : 'good'),
      stat('Reference entries', int(c.entries), `${r.structure.referencesNeverCited} never cited · ${r.structure.citationsMissingFromList} missing`),
      S.verification
        ? stat('Sources found', `${verified}/${S.verification.length}`, notFound ? `${notFound} not found` : 'all matched', notFound ? 'high' : 'good')
        : stat('Sources checked', '—', 'run Do the sources exist?')
    ),

    c.detected && c.detected !== r.citationStyle
      ? banner('warn', `The reference list is formatted like ${STYLES[c.detected].label}, but the required style is set to ${styleLabel}. If the document is meant to be in ${STYLES[c.detected].label}, switch the toggle — otherwise every entry will be reported as wrong.`)
      : null,

    el('div', { class: 'row', style: 'margin-bottom:14px' },
      panels.map(([id, label]) => el('button', {
        class: S.panel === id ? 'primary sm' : 'sm',
        text: label,
        onClick: () => { S.panel = id; renderCitations(root, ctx); }
      })),
      el('div', { class: 'spacer' }),
      styleToggle(root, ctx)
    ),

    S.panel === 'style' ? stylePanel(r)
      : S.panel === 'list' ? listPanel(r)
      : S.panel === 'exists' ? existsPanel(root, ctx)
      : reusePanel(root, ctx)
  );
}

function stylePanel(r) {
  const issues = r.issues.filter((i) => i.category === 'citation');
  const cross = r.issues.filter((i) => i.rule === 'reference-never-cited' || i.rule === 'citation-missing-reference');
  return el('div', {},
    el('div', { class: 'card' },
      el('h2', { text: `${STYLES[r.citationStyle].label} conformance` }),
      issues.length
        ? table(['Severity', 'Text', 'Problem', 'Fix'], issues.map((i) => [
            el('td', {}, chip(i.severity === 'high' ? 'error' : 'warning', i.severity)),
            el('td', { class: 'wrap', style: 'font-family:var(--mono);font-size:11px', text: clip(i.excerpt, 80) }),
            el('td', { class: 'wrap', text: i.message }),
            el('td', { class: 'wrap', text: i.suggestion || '—' })
          ]))
        : el('p', { class: 'hint', text: 'No conformance problems found.' })
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Text against list' }),
      el('p', { text: 'A citation with no entry is an incomplete reference list; an entry never cited is padding. Both are among the first things an examiner checks.' }),
      cross.length
        ? table(['Severity', 'Item', 'Problem'], cross.map((i) => [
            el('td', {}, chip(i.severity === 'high' ? 'error' : 'warning', i.severity)),
            el('td', { class: 'wrap', style: 'font-size:12px', text: clip(i.excerpt, 90) }),
            el('td', { class: 'wrap', text: i.message })
          ]))
        : el('p', { class: 'hint', text: 'Every citation has an entry, and every entry is cited.' })
    )
  );
}

function listPanel(r) {
  const entries = r.referenceEntries || [];
  return el('div', { class: 'card' },
    el('h2', { text: 'Parsed reference list' }),
    entries.length
      ? table([{ label: '#', num: true }, 'Entry'], entries.map((e, i) => [
          el('td', { class: 'num', text: String(i + 1) }),
          el('td', { class: 'wrap', text: e.raw })
        ]))
      : el('p', { class: 'hint', text: 'No reference list found. The heading must read “References”, “Works Cited” or “Bibliography” on a line of its own.' })
  );
}

function existsPanel(root, ctx) {
  const entries = S.report.referenceEntries || [];
  return el('div', { class: 'card' },
    el('h2', { text: 'Do these sources exist?' }),
    el('p', { text: 'Each entry is looked up in Crossref and OpenAlex. This is the check that catches a fabricated reference — perfectly formatted, plausibly titled, and describing a work nobody wrote.' }),
    banner('warn', 'This step uses the network. Only the reference strings are sent — never the thesis text, never a student’s name.'),
    entries.length
      ? el('div', {},
          el('div', { class: 'row', style: 'margin-bottom:12px' },
            el('button', { class: 'primary', disabled: Boolean(S.busy), text: `Check ${entries.length} reference${entries.length === 1 ? '' : 's'}`, onClick: () => runVerification(root, ctx) }),
            S.busy ? el('span', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
          ),
          S.verification
            ? table(['Status', 'Entry', 'Matched record', 'Notes'], S.verification.map((v) => [
                el('td', {}, chip(STATUS_LABEL[v.status] || v.status, STATUS_TONE[v.status] || '')),
                el('td', { class: 'wrap', style: 'font-size:12px', text: clip(v.ref.raw, 110) }),
                el('td', { class: 'wrap', style: 'font-size:12px' }, v.match
                  ? el('a', { href: v.match.url || '#', target: '_blank', rel: 'noopener', text: clip(`${v.match.title} (${v.match.year || 'n.d.'})`, 80) })
                  : '—'),
                el('td', { class: 'wrap', style: 'font-size:12px', text: [...(v.flags || []), v.note || ''].filter(Boolean).join(' ') || '—' })
              ]))
            : null
        )
      : el('p', { class: 'hint', text: 'No reference list to check.' })
  );
}

function reusePanel(root, ctx) {
  const others = getState().theses;
  return el('div', { class: 'card' },
    el('h2', { text: 'Passage reuse' }),
    el('p', { text: 'Compares this document against every thesis saved in the workbench. Catches two students sharing text, and a student reusing an earlier submission of their own.' }),
    el('p', { class: 'hint', text: 'There is no index of the web or of published journals here. Matching is on five-word sequences, so heavy paraphrase passes. Absence of a match is not evidence of originality.' }),
    others.length
      ? el('div', {},
          el('div', { class: 'row', style: 'margin:12px 0' },
            el('button', { class: 'primary', disabled: Boolean(S.busy), text: `Compare against ${others.length} saved thes${others.length === 1 ? 'is' : 'es'}`, onClick: () => runReuse(root, ctx) }),
            S.busy ? el('span', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
          ),
          S.reuse
            ? (S.reuse.results.length
                ? table(['Document', { label: 'Overlap', num: true }, { label: 'Passages', num: true }, 'Longest shared passage'],
                    S.reuse.results.map((m) => [
                      m.label,
                      el('td', { class: 'num' }, chip(pct(m.containment), m.containment > 0.25 ? 'high' : m.containment > 0.1 ? 'medium' : '')),
                      el('td', { class: 'num', text: int(m.passages.length) }),
                      el('td', { class: 'wrap', style: 'font-family:var(--mono);font-size:11px', text: clip(S.text.slice(m.passages[0].start, m.passages[0].end), 140) })
                    ]))
                : el('p', { class: 'hint', text: 'No shared passages found.' }))
            : null
        )
      : el('p', { class: 'hint', text: 'Nothing to compare against yet — save some thesis reviews first.' })
  );
}

/* ------------------------------------------------------------- actions */

async function runVerification(root, ctx) {
  const entries = S.report.referenceEntries || [];
  setContactEmail(getState().settings.contactEmail || '');
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    S.busy = `Checking ${i + 1} of ${entries.length}…`;
    renderCitations(root, ctx);
    try {
      out.push(await verifyReference(entries[i].raw));
    } catch (err) {
      out.push({ ref: { raw: entries[i].raw }, status: 'error', score: 0, match: null, note: err.message });
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  S.verification = out;
  S.busy = null;
  renderCitations(root, ctx);
  const bad = out.filter((v) => v.status === 'not-found' || v.status === 'doi-not-found').length;
  toast(bad ? `${bad} reference(s) could not be found — check them by hand.` : 'Every reference matched a record.', bad ? 'error' : 'good');
}

async function runReuse(root, ctx) {
  const s = getState();
  S.busy = 'Comparing…';
  renderCitations(root, ctx);
  const corpus = [];
  for (const t of s.theses) {
    const doc = await loadThesisDocument(t.id);
    if (doc && doc.text) {
      const st = s.students.find((x) => x.id === t.studentId);
      corpus.push({ id: t.id, label: `${st ? st.name : 'unassigned'} — ${t.title}`, text: doc.text });
    }
  }
  S.reuse = compareAgainstCorpus(S.text, corpus);
  S.busy = null;
  renderCitations(root, ctx);
}

function savedList(root, ctx) {
  const s = getState();
  if (!s.theses.length) return null;
  return el('div', { class: 'card' },
    el('h2', { text: 'Open a saved thesis' }),
    table(['Student', 'Title', ''], [...s.theses].reverse().slice(0, 10).map((t) => {
      const st = s.students.find((x) => x.id === t.studentId);
      return [
        st ? st.name : '(unassigned)',
        t.title,
        el('td', {}, el('button', { class: 'sm', text: 'Check citations', onClick: async () => {
          const doc = await loadThesisDocument(t.id);
          if (!doc) { toast('The stored text is missing.', 'error'); return; }
          S.text = doc.text; S.title = t.title; S.filename = t.filename; S.studentId = t.studentId;
          run(root, ctx);
        } }))
      ];
    }))
  );
}

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const STATUS_LABEL = { verified: 'verified', probable: 'probable', 'weak-match': 'weak match', 'not-found': 'NOT FOUND', 'doi-not-found': 'DOI dead', error: 'lookup failed' };
const STATUS_TONE = { verified: 'good', probable: 'accent', 'weak-match': 'medium', 'not-found': 'high', 'doi-not-found': 'high', error: 'medium' };
