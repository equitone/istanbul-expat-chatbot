/*
 * integrity.js — academic integrity in one place.
 *
 * Six checks, each answering a different question, each stating its own
 * limits. Three of them are things similarity-matching cannot do at all:
 *
 *   Fabricated sources   A hallucinated reference matches no corpus, so a
 *                        similarity checker passes it clean.
 *   Author fingerprint   "Is this the same hand as their last essay?" has
 *                        nothing to match against — the student's own earlier
 *                        work is not plagiarism of anything.
 *   File properties      Word records who wrote it, how long it was edited
 *                        and how many times it was saved. Nobody reads the
 *                        container; they only compare the text.
 *
 * And one thing it plainly cannot do: match against the web or against
 * published journals. That needs a licensed index, and the tab says so rather
 * than implying coverage it does not have.
 */
import {
  el, mount, stat, chip, table, toast, field, int, num, pct,
  banner, emptyState, escapeHtml
} from '../ui.js';
import { getState, LEVEL_LABEL, loadThesisDocument } from '../store.js';
import { analyseThesis } from '../analysis/index.js';
import { compareAgainstCorpus, voiceConsistency, aiIndicators } from '../analysis/similarity.js';
import { compareAuthorship } from '../analysis/authorship.js';
import { inspectFile } from '../analysis/forensics.js';
import { verifyReference, setContactEmail } from '../analysis/verify.js';
import { extractText, SUPPORTED } from '../io/files.js';
import { openReportDialog } from './report-dialog.js';

const S = {
  text: '', title: '', filename: '', studentId: null, file: null,
  report: null, busy: null, panel: 'summary',
  reuse: null, voice: null, ai: null, authorship: null, forensics: null, sources: null
};

const PANELS = [
  ['summary', 'Summary'],
  ['reuse', 'Text reuse'],
  ['author', 'Author fingerprint'],
  ['file', 'File properties'],
  ['sources', 'Fabricated sources'],
  ['ai', 'AI indicators']
];

export default function renderIntegrity(root, ctx) {
  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Integrity' }),
        el('p', { text: 'Six checks on whether the work is the student’s own — including three that similarity matching cannot perform.' })
      ),
      el('div', { class: 'spacer' }),
      S.report ? el('button', { text: 'Start over', onClick: () => { reset(); renderIntegrity(root, ctx); } }) : null,
      S.report ? el('button', { class: 'primary', text: 'Report for student', onClick: () => openReportDialog(S.report, { defaultSections: ['summary', 'marked'], title: S.title, studentId: S.studentId }) }) : null
    ),
    S.report ? loaded(root, ctx) : intake(root, ctx)
  );
}

function reset() {
  Object.assign(S, { text: '', title: '', filename: '', file: null, report: null, panel: 'summary',
    reuse: null, voice: null, ai: null, authorship: null, forensics: null, sources: null });
}

/* --------------------------------------------------------------- intake */

function intake(root, ctx) {
  const s = getState();
  const drop = el('div', { class: 'dropzone' },
    el('strong', { text: 'Drop the student’s file here' }),
    el('p', { class: 'hint', text: 'Upload rather than paste where you can: a .docx carries the editing history that the File properties check reads, and pasted text carries none.' }),
    el('input', { type: 'file', id: 'integrity-file', accept: SUPPORTED, style: 'display:none', onChange: (e) => e.target.files[0] && ingest(e.target.files[0], root, ctx) }),
    el('button', { class: 'primary', text: 'Choose file', onClick: () => document.getElementById('integrity-file').click() })
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) ingest(e.dataTransfer.files[0], root, ctx);
  });

  return el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'grid cols-2', style: 'margin-bottom:12px' },
        field('Student', el('select', { onChange: (e) => { S.studentId = e.target.value || null; } },
          el('option', { value: '', text: '— unassigned —' }),
          s.students.map((st) => el('option', { value: st.id, selected: st.id === S.studentId, text: `${st.name} (${LEVEL_LABEL[st.level]})` }))),
          'Needed for the author fingerprint, which compares against this student’s own earlier submissions.'),
        field('Title', el('input', { value: S.title, placeholder: 'optional', onChange: (e) => { S.title = e.target.value; } }))
      ),
      drop,
      S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'What this can and cannot see' }),
      table(['Check', 'Basis', 'Can Turnitin do it?'], [
        ['Text reuse against your archive', 'Five-word fingerprints against every thesis saved here', 'Yes, and against a far larger corpus'],
        ['Voice consistency within the document', 'Stylometry — no corpus needed', 'No'],
        ['Author fingerprint vs their own past work', 'Burrows’s Delta over function words', 'No'],
        ['File properties', 'Editing time, revisions, authorship recorded by Word', 'No'],
        ['Fabricated sources', 'Crossref and OpenAlex lookups', 'No — a hallucinated reference matches nothing'],
        ['AI indicators', 'Statistical tendencies', 'It offers one; treat both with the same caution'],
        ['The web and published journals', '—', 'Yes. This cannot, and does not pretend to.']
      ].map((r) => [r[0], el('td', { class: 'wrap', text: r[1] }), el('td', {}, r[2].startsWith('No') ? chip(r[2], 'good') : chip(r[2], 'medium'))])),
      el('p', { class: 'hint', text: 'Turnitin’s advantage is its corpus — roughly 100 million archived student papers plus licensed publisher content — and nothing here replaces it. What is here answers the questions that corpus cannot.' })
    ),
    savedList(root, ctx)
  );
}

async function ingest(file, root, ctx) {
  S.busy = `Reading ${file.name}…`;
  renderIntegrity(root, ctx);
  try {
    const { text } = await extractText(file);
    if (!text || text.trim().length < 300) throw new Error('That file produced too little text to analyse.');
    S.text = text;
    S.file = file;
    S.filename = file.name;
    if (!S.title) S.title = file.name.replace(/\.[^.]+$/, '');
    S.report = analyseThesis(S.text);
    S.busy = 'Reading file properties…';
    renderIntegrity(root, ctx);
    S.forensics = await inspectFile(file);
    S.voice = voiceConsistency(S.text);
    S.ai = aiIndicators(S.text);
    S.busy = null;
    await runReuse(root, ctx, { quiet: true });
  } catch (err) {
    S.busy = null;
    toast(err.message, 'error');
  }
  renderIntegrity(root, ctx);
}

/* -------------------------------------------------------------- results */

function loaded(root, ctx) {
  return el('div', {},
    el('div', { class: 'row', style: 'margin-bottom:14px' },
      PANELS.map(([id, label]) => el('button', {
        class: S.panel === id ? 'primary sm' : 'sm',
        text: label,
        onClick: () => { S.panel = id; renderIntegrity(root, ctx); }
      })),
      S.busy ? el('span', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
    ),
    S.panel === 'summary' ? summaryPanel(root, ctx)
      : S.panel === 'reuse' ? reusePanel(root, ctx)
      : S.panel === 'author' ? authorPanel(root, ctx)
      : S.panel === 'file' ? filePanel()
      : S.panel === 'sources' ? sourcesPanel(root, ctx)
      : aiPanel()
);
}

/* Collect every signal into one list, ordered by how much attention it wants. */
function signals() {
  const out = [];
  const top = S.reuse && S.reuse.results[0];
  if (top) {
    out.push({
      level: top.containment > 0.25 ? 'high' : top.containment > 0.08 ? 'medium' : 'none',
      panel: 'reuse',
      headline: `${pct(top.containment)} of this document's fingerprints also appear in “${top.label}”`,
      detail: `${top.passages.length} shared passage(s).`
    });
  } else if (S.reuse) {
    out.push({ level: 'none', panel: 'reuse', headline: 'No shared passages with anything in your archive', detail: 'Only says nothing was reused from documents saved here.' });
  }

  if (S.voice && !S.voice.usable) {
    /* Say a check could not run rather than letting it vanish: a silently
       absent check reads as a passed one. */
    out.push({ level: 'skip', panel: 'reuse', headline: 'Voice consistency could not be measured', detail: S.voice.reason });
  }
  if (S.voice && S.voice.usable) {
    out.push({
      level: S.voice.outliers.length > 2 ? 'medium' : S.voice.outliers.length ? 'low' : 'none',
      panel: 'reuse',
      headline: S.voice.outliers.length
        ? `${S.voice.outliers.length} passage(s) written unlike the rest of the document`
        : 'Writing style is consistent throughout',
      detail: `Across ${S.voice.windows.length} windows.`
    });
  }

  if (S.authorship && S.authorship.usable && S.authorship.verdict) {
    out.push({ level: S.authorship.verdict.level, panel: 'author', headline: S.authorship.verdict.headline, detail: S.authorship.verdict.detail });
  }

  if (S.forensics && S.forensics.supported) {
    (S.forensics.observations || []).forEach((o) => out.push({ level: o.level, panel: 'file', headline: o.headline, detail: o.detail }));
  }

  if (S.sources) {
    const bad = S.sources.filter((v) => v.status === 'not-found' || v.status === 'doi-not-found').length;
    out.push({
      level: bad > 1 ? 'high' : bad ? 'medium' : 'none',
      panel: 'sources',
      headline: bad ? `${bad} of ${S.sources.length} references could not be found in any catalogue` : `All ${S.sources.length} references matched a real record`,
      detail: bad ? 'A fabricated reference is formatted perfectly and describes a work nobody wrote.' : ''
    });
  }

  if (S.ai) {
    out.push({
      level: S.ai.score >= 65 ? 'medium' : 'none',
      panel: 'ai',
      headline: `AI-writing indicators: ${S.ai.score}/100 — ${S.ai.band}`,
      detail: 'Indicators only. Never evidence.'
    });
  }

  if (S.authorship && !S.authorship.usable) {
    out.push({ level: 'skip', panel: 'author', headline: 'Author fingerprint could not be measured', detail: S.authorship.reason });
  }
  if (!S.sources) {
    out.push({ level: 'skip', panel: 'sources', headline: 'Sources not checked yet', detail: 'Open Fabricated sources and run the lookup — it needs the network.' });
  }
  if (!S.authorship && S.studentId) {
    out.push({ level: 'skip', panel: 'author', headline: 'Author fingerprint not run yet', detail: 'Open Author fingerprint to compare against this student’s earlier work.' });
  }

  const order = { high: 0, medium: 1, low: 2, skip: 3, none: 4 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

function summaryPanel(root, ctx) {
  const list = signals();
  const high = list.filter((s) => s.level === 'high').length;
  const medium = list.filter((s) => s.level === 'medium').length;
  const skipped = list.filter((s) => s.level === 'skip').length;

  return el('div', {},
    el('div', { class: 'grid cols-3', style: 'margin-bottom:16px' },
      stat('Worth a conversation', int(high), high ? 'see the items below' : 'nothing pressing', high ? 'high' : 'good'),
      stat('Worth a look', int(medium), '', medium ? 'medium' : ''),
      stat('Checks run', int(list.length - skipped), skipped ? `${skipped} could not run` : `${S.forensics && S.forensics.supported ? 'including' : 'without'} file properties`, skipped ? 'medium' : '')
    ),
    high || medium
      ? banner('warn', 'None of these is proof of anything. Each has an innocent explanation, given alongside it. The right next step is almost always to ask the student about their process and to look at their drafts — not to act on a number.')
      : banner('privacy', 'Nothing here stands out. That is not a guarantee of originality: this has no view of the web or of published journals.'),
    el('div', { class: 'card' },
      list.map((sig) => el('div', {
        class: 'finding',
        style: `border-left-color:var(--${sig.level === 'high' ? 'high' : sig.level === 'medium' ? 'medium' : sig.level === 'low' ? 'low' : sig.level === 'skip' ? 'border-strong' : 'good'});cursor:pointer`,
        onClick: () => { S.panel = sig.panel; renderIntegrity(root, ctx); }
      },
        el('div', { class: 'top' },
          chip(sig.level === 'none' ? 'clear' : sig.level === 'skip' ? 'not run' : sig.level,
            sig.level === 'none' ? 'good' : sig.level === 'skip' ? '' : sig.level),
          el('span', { class: 'rule', text: (PANELS.find((p) => p[0] === sig.panel) || [])[1] })
        ),
        el('div', { class: 'msg', text: sig.headline }),
        sig.detail ? el('div', { class: 'hint', text: sig.detail }) : null
      ))
    )
  );
}

function reusePanel(root, ctx) {
  return el('div', { class: 'grid cols-2' },
    el('div', { class: 'card' },
      el('h2', { text: 'Against your own archive' }),
      el('p', { text: 'Every thesis saved in this workbench, compared passage by passage. This is what catches two students in a cohort sharing text, and a student reusing their own earlier submission.' }),
      S.reuse
        ? (S.reuse.results.length
            ? table(['Document', { label: 'Overlap', num: true }, { label: 'Passages', num: true }, 'Longest shared passage'],
                S.reuse.results.map((m) => [
                  m.label,
                  el('td', { class: 'num' }, chip(pct(m.containment), m.containment > 0.25 ? 'high' : m.containment > 0.08 ? 'medium' : '')),
                  el('td', { class: 'num', text: int(m.passages.length) }),
                  el('td', { class: 'wrap', style: 'font-family:var(--mono);font-size:11px', text: clip(S.text.slice(m.passages[0].start, m.passages[0].end), 150) })
                ]))
            : el('p', { class: 'hint', text: 'No shared passages found.' }))
        : el('button', { class: 'primary', text: 'Run comparison', onClick: () => runReuse(root, ctx) }),
      el('p', { class: 'hint', text: 'Five-word fingerprints, so heavy paraphrase passes. No web index. Absence of a match is not evidence of originality.' })
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'Voice consistency inside the document' }),
      el('p', { text: 'Passages whose sentence rhythm, vocabulary and function-word habits depart from the rest. Unattributed text usually reads differently from its surroundings, whoever produced it — and this needs no corpus at all.' }),
      (() => {
        const v = S.voice;
        if (!v) return null;
        if (!v.usable) return el('p', { class: 'hint', text: v.reason });
        if (!v.outliers.length) return el('p', { class: 'hint', text: `Consistent across all ${v.windows.length} windows.` });
        return el('div', {}, v.outliers.slice(0, 6).map((w) => el('div', { class: 'finding' },
          el('div', { class: 'top' },
            chip(`${num(w.deviation, 2)}σ from this document's norm`, w.deviation > 2.2 ? 'high' : 'medium'),
            el('span', { class: 'rule', text: w.drivers.map((d) => `${d.k} ${d.z > 0 ? 'high' : 'low'}`).join(', ') })
          ),
          el('div', { class: 'quote', text: clip(w.text, 240) })
        )));
      })()
    )
  );
}

function authorPanel(root, ctx) {
  const s = getState();
  const student = s.students.find((x) => x.id === S.studentId);

  return el('div', { class: 'card' },
    el('h2', { text: 'Does this read like their own earlier work?' }),
    el('p', { text: 'Burrows’s Delta over function-word frequencies — the standard method in authorship attribution. Function words carry no subject matter, so they stay stable for a writer across topics.' }),
    banner('info', 'Similarity checking cannot ask this question: a student’s own earlier essay is not plagiarism of anything, so there is nothing to match. It is answerable only against your own archive.'),
    !student
      ? el('p', { class: 'hint', text: 'Attach a student to this document first — the check compares against their earlier submissions.' })
      : !S.authorship
        ? el('button', { class: 'primary', disabled: Boolean(S.busy), text: `Compare against ${student.name}’s earlier work`, onClick: () => runAuthorship(root, ctx) })
        : !S.authorship.usable
          ? el('p', { class: 'hint', text: S.authorship.reason })
          : el('div', {},
              S.authorship.verdict
                ? el('div', { class: `banner ${S.authorship.verdict.level === 'high' ? 'warn' : S.authorship.verdict.level === 'medium' ? 'warn' : 'privacy'}` },
                    el('strong', { text: S.authorship.verdict.headline }),
                    el('div', { style: 'margin-top:4px', text: S.authorship.verdict.detail }))
                : null,
              table(['Document', 'Whose', { label: 'Words', num: true }, { label: 'Distance', num: true }],
                S.authorship.results.map((r) => [
                  r.label,
                  el('td', {}, r.sameStudent ? chip('this student', 'accent') : chip('another student')),
                  el('td', { class: 'num', text: int(r.words) }),
                  el('td', { class: 'num', style: 'font-weight:600', text: num(r.delta, 3) })
                ])),
              el('p', { class: 'hint', text: 'Smaller means more alike. The number has no meaning on its own — what matters is whether their own past work sits closer than other people’s.' }),
              el('p', { class: 'hint', text: S.authorship.note })
            )
  );
}

function filePanel() {
  const f = S.forensics;
  if (!f) return el('div', { class: 'card' }, el('p', { class: 'hint', text: 'No file inspected.' }));
  if (!f.supported) {
    return el('div', { class: 'card' },
      el('h2', { text: 'File properties' }),
      el('p', { class: 'hint', text: f.reason }),
      banner('info', 'Upload the original .docx rather than pasting text, and this check has something to read.')
    );
  }

  const rows = [
    ['Author recorded in the file', f.author],
    ['Last saved by', f.lastModifiedBy],
    ['Created', f.created ? new Date(f.created).toLocaleString() : null],
    ['Last modified', f.modified ? new Date(f.modified).toLocaleString() : null],
    ['Total editing time', f.editMinutes !== null && f.editMinutes !== undefined ? `${int(f.editMinutes)} minutes` : null],
    ['Times saved', f.revision],
    ['Words recorded by Word', f.words],
    ['Application', f.application],
    ['Organisation', f.company]
  ].filter((r) => r[1] !== null && r[1] !== undefined && r[1] !== '');

  return el('div', { class: 'grid cols-2' },
    el('div', { class: 'card' },
      el('h2', { text: 'What the file records' }),
      el('p', { text: 'Word writes these itself. Nobody normally looks at them, and no amount of text matching would surface any of it.' }),
      table(['Property', 'Value'], rows.map((r) => [r[0], el('td', { style: 'font-weight:600', text: String(r[1]) })]))
    ),
    el('div', { class: 'card' },
      el('h2', { text: 'What it suggests' }),
      (f.observations || []).map((o) => el('div', { class: 'finding', style: `border-left-color:var(--${o.level === 'high' ? 'high' : o.level === 'medium' ? 'medium' : o.level === 'low' ? 'low' : 'good'})` },
        el('div', { class: 'top' }, chip(o.level === 'none' ? 'clear' : o.level, o.level === 'none' ? 'good' : o.level)),
        el('div', { class: 'msg', text: o.headline }),
        el('div', { class: 'hint', text: o.detail }),
        o.innocent ? el('div', { class: 'fix', style: 'color:var(--text-dim)', text: `Innocent explanation: ${o.innocent}` }) : null
      )),
      banner('warn', 'Metadata is trivially edited, inherited from templates, and destroyed by Google Docs export. It can support a conversation; it cannot settle one.')
    )
  );
}

function sourcesPanel(root, ctx) {
  const entries = (S.report && S.report.referenceEntries) || [];
  return el('div', { class: 'card' },
    el('h2', { text: 'Do the cited sources exist?' }),
    el('p', { text: 'A fabricated reference is perfectly formatted, plausibly titled, attributed to a real scholar in the right field — and describes a work nobody wrote. It matches no corpus, so similarity checking passes it clean. Only a lookup against the scholarly record finds it.' }),
    banner('warn', 'This step uses the network. Only the reference strings are sent, to Crossref and OpenAlex. Never the thesis text, never a student’s name.'),
    entries.length
      ? el('div', {},
          el('div', { class: 'row', style: 'margin-bottom:12px' },
            el('button', { class: 'primary', disabled: Boolean(S.busy), text: `Check ${entries.length} reference${entries.length === 1 ? '' : 's'}`, onClick: () => runSources(root, ctx) })
          ),
          S.sources
            ? table(['Status', 'Entry', 'Matched record', 'Notes'], S.sources.map((v) => [
                el('td', {}, chip(STATUS[v.status] || v.status, TONE[v.status] || '')),
                el('td', { class: 'wrap', style: 'font-size:12px', text: clip(v.ref.raw, 110) }),
                el('td', { class: 'wrap', style: 'font-size:12px' }, v.match
                  ? el('a', { href: v.match.url || '#', target: '_blank', rel: 'noopener', text: clip(`${v.match.title} (${v.match.year || 'n.d.'})`, 80) })
                  : '—'),
                el('td', { class: 'wrap', style: 'font-size:12px', text: [...(v.flags || []), v.note || ''].filter(Boolean).join(' ') || '—' })
              ]))
            : null
        )
      : el('p', { class: 'hint', text: 'No reference list found in this document.' })
  );
}

function aiPanel() {
  const ai = S.ai;
  if (!ai) return null;
  return el('div', { class: 'card' },
    el('h2', { text: 'AI-writing indicators' }),
    el('div', { class: 'grid cols-2' },
      el('div', {},
        el('div', { class: 'stress-dial', style: 'margin-bottom:12px' },
          el('div', { class: `num ${ai.score >= 65 ? 'overloaded' : ai.score >= 40 ? 'strained' : 'sound'}`, text: String(ai.score) }),
          el('div', {}, el('div', { style: 'font-weight:600', text: ai.band }), el('div', { class: 'sub', text: 'out of 100' }))
        ),
        ai.signals.map((g) => el('div', { class: 'metric-row' },
          el('div', { class: 'name' }, g.key, el('small', { text: g.detail })),
          el('div', { class: 'n', text: pct(g.value) })
        ))
      ),
      el('div', {},
        banner('warn', ai.caveat),
        el('p', { class: 'hint', text: 'Read this alongside voice consistency and the file properties. One weak signal is noise; three pointing the same way is a reason to talk to the student. Even then it is a conversation, not a finding.' })
      )
    )
  );
}

/* -------------------------------------------------------------- actions */

async function runReuse(root, ctx, { quiet = false } = {}) {
  const s = getState();
  const others = s.theses;
  if (!others.length) { S.reuse = { results: [] }; if (!quiet) renderIntegrity(root, ctx); return; }
  if (!quiet) { S.busy = 'Comparing…'; renderIntegrity(root, ctx); }
  const corpus = [];
  for (const t of others) {
    const doc = await loadThesisDocument(t.id);
    if (doc && doc.text) {
      const st = s.students.find((x) => x.id === t.studentId);
      corpus.push({ id: t.id, label: `${st ? st.name : 'unassigned'} — ${t.title}`, text: doc.text, studentId: t.studentId });
    }
  }
  S.reuse = compareAgainstCorpus(S.text, corpus);
  S.busy = null;
  if (!quiet) renderIntegrity(root, ctx);
}

async function runAuthorship(root, ctx) {
  const s = getState();
  S.busy = 'Comparing writing style…';
  renderIntegrity(root, ctx);
  const corpus = [];
  for (const t of s.theses) {
    const doc = await loadThesisDocument(t.id);
    if (!doc || !doc.text) continue;
    const st = s.students.find((x) => x.id === t.studentId);
    corpus.push({
      id: t.id,
      label: `${st ? st.name : 'unassigned'} — ${t.title}`,
      text: doc.text,
      sameStudent: Boolean(S.studentId && t.studentId === S.studentId)
    });
  }
  S.authorship = compareAuthorship(S.text, corpus);
  S.busy = null;
  renderIntegrity(root, ctx);
}

async function runSources(root, ctx) {
  const entries = S.report.referenceEntries || [];
  setContactEmail(getState().settings.contactEmail || '');
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    S.busy = `Checking reference ${i + 1} of ${entries.length}…`;
    renderIntegrity(root, ctx);
    try {
      out.push(await verifyReference(entries[i].raw));
    } catch (err) {
      out.push({ ref: { raw: entries[i].raw }, status: 'error', score: 0, match: null, note: err.message });
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  S.sources = out;
  S.busy = null;
  renderIntegrity(root, ctx);
}

function savedList(root, ctx) {
  const s = getState();
  if (!s.theses.length) return null;
  return el('div', { class: 'card' },
    el('h2', { text: 'Or re-check something already saved' }),
    el('p', { class: 'hint', text: 'A saved review has no original file, so the File properties check will have nothing to read.' }),
    table(['Student', 'Title', ''], [...s.theses].reverse().slice(0, 10).map((t) => {
      const st = s.students.find((x) => x.id === t.studentId);
      return [
        st ? st.name : '(unassigned)',
        t.title,
        el('td', {}, el('button', { class: 'sm', text: 'Check', onClick: async () => {
          const doc = await loadThesisDocument(t.id);
          if (!doc) { toast('The stored text is missing.', 'error'); return; }
          S.text = doc.text; S.title = t.title; S.filename = t.filename; S.studentId = t.studentId; S.file = null;
          S.report = analyseThesis(S.text);
          S.forensics = { supported: false, reason: 'This was opened from the saved archive, not from a file, so there are no document properties to read. Upload the original .docx to use that check.' };
          S.voice = voiceConsistency(S.text);
          S.ai = aiIndicators(S.text);
          await runReuse(root, ctx, { quiet: true });
          renderIntegrity(root, ctx);
        } }))
      ];
    }))
  );
}

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const STATUS = { verified: 'verified', probable: 'probable', 'weak-match': 'weak match', 'not-found': 'NOT FOUND', 'doi-not-found': 'DOI dead', error: 'lookup failed' };
const TONE = { verified: 'good', probable: 'accent', 'weak-match': 'medium', 'not-found': 'high', 'doi-not-found': 'high', error: 'medium' };
