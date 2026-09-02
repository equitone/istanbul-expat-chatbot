/*
 * batch.js — triage a whole cohort in one pass.
 *
 * Marking a stack of theses is mostly deciding which ones need a careful read.
 * This view answers that question and nothing else: drop the folder in, and it
 * returns the same submissions ordered by how much they want attention, with
 * the reason for each position stated in words. Everything it finds is already
 * available one thesis at a time in the other tabs — the point here is to not
 * have to open twenty-five files to discover which three are the problem.
 *
 * Two rules it holds to:
 *
 *   Nothing is written to the gradebook. A filename is matched against the
 *   roster as a SUGGESTION only, shown with the name it guessed, exactly as
 *   the Excel import refuses to merge two students on a name alone.
 *
 *   The ranking is explainable. There is no single opaque score; a submission
 *   sits high because of listed reasons, and the list is what the instructor
 *   reads. A number nobody can argue with is a number nobody can check.
 */
import {
  el, mount, table, chip, stat, toast, banner, meter, int, num
} from '../ui.js';
import { getState, LEVEL_LABEL } from '../store.js';
import { analyseThesis } from '../analysis/index.js';
import { aiIndicators, crossMatch } from '../analysis/similarity.js';
import { extractText, SUPPORTED, downloadText } from '../io/files.js';
import { stageThesis } from './thesis.js';

const S = {
  rows: [],
  pairs: [],
  running: false,
  progress: null,
  style: 'apa7',
  sort: 'attention',
  failures: []
};

/* Above this a batch takes long enough that the instructor should be told
   before it starts rather than after. */
const MANY = 40;

export default function renderBatch(root, ctx) {
  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Batch triage' }),
        el('p', { text: 'Analyse a whole folder of submissions at once and read them in the order they need reading. Every file is parsed in this browser; nothing is uploaded and nothing is written to the gradebook.' })
      ),
      el('div', { class: 'spacer' }),
      S.rows.length ? el('button', { text: 'Clear', onClick: () => { reset(); renderBatch(root, ctx); } }) : null,
      S.rows.length ? el('button', { text: 'Export CSV', onClick: exportCsv }) : null
    ),
    S.running ? progressCard() : intake(root, ctx),
    S.failures.length ? failureCard() : null,
    S.rows.length && !S.running ? results(root, ctx) : null
  );
}

function reset() {
  Object.assign(S, { rows: [], pairs: [], running: false, progress: null, failures: [] });
}

/* ------------------------------------------------------------- intake */

function intake(root, ctx) {
  const pick = (multiple, dir) => {
    const input = el('input', {
      type: 'file',
      accept: SUPPORTED,
      style: 'display:none',
      multiple: true,
      onChange: (e) => e.target.files.length && run([...e.target.files], root, ctx)
    });
    if (dir) { input.webkitdirectory = true; input.directory = true; }
    return input;
  };

  const filesInput = pick(true, false);
  const dirInput = pick(true, true);

  const drop = el('div', { class: 'dropzone' },
    el('strong', { text: 'Drop a folder of theses here' }),
    el('p', { class: 'hint', text: 'Word (.docx), PDF, RTF, HTML, Markdown or plain text — as many as you like. Files are read on this computer and are not uploaded.' }),
    filesInput,
    dirInput,
    el('div', { class: 'row' },
      el('button', { class: 'primary', text: 'Choose files', onClick: () => filesInput.click() }),
      el('button', { text: 'Choose a folder', onClick: () => dirInput.click() })
    )
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const files = await filesFromDrop(e.dataTransfer);
    if (files.length) run(files, root, ctx);
  });

  return el('div', { class: 'card' },
    el('label', { class: 'field', style: 'max-width:280px' },
      el('span', { text: 'Citation style to check against' }),
      el('select', {
        onChange: (e) => { S.style = e.target.value; }
      },
        el('option', { value: 'apa7', text: 'APA 7', selected: S.style === 'apa7' }),
        el('option', { value: 'mla9', text: 'MLA 9', selected: S.style === 'mla9' })
      )
    ),
    drop,
    el('p', { class: 'hint', style: 'margin-top:12px' , text: 'Each submission is also compared against every other one in the batch, which is the check a single-file tool cannot make: two students who worked together are only visible when both papers are on the table at once.' })
  );
}

/* A dropped folder arrives as directory entries, not as files. */
async function filesFromDrop(dt) {
  const items = [...(dt.items || [])];
  const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const out = [];
  const walk = async (entry, depth = 0) => {
    if (depth > 4) return;
    if (entry.isFile) {
      out.push(await new Promise((res, rej) => entry.file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      /* readEntries returns at most 100 at a time and signals the end with an
         empty batch, so one call is not enough for a large cohort folder. */
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, depth + 1);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

/* --------------------------------------------------------------- run */

const ANALYSABLE = /\.(txt|md|markdown|docx|pdf|rtf|html?|csv)$/i;

async function run(files, root, ctx) {
  const usable = files.filter((f) => ANALYSABLE.test(f.name) && !/^[._]/.test(f.name));
  if (!usable.length) {
    toast('No readable files in that selection.', 'error');
    return;
  }
  if (usable.length > MANY && !window.confirm(
    `${usable.length} files selected. Analysing them will take a few minutes and the tab must stay open. Continue?`
  )) return;

  S.running = true;
  S.rows = [];
  S.failures = [];
  S.pairs = [];
  S.progress = { done: 0, total: usable.length, current: usable[0].name };
  renderBatch(root, ctx);

  const students = getState().students;

  for (const file of usable) {
    S.progress.current = file.name;
    renderBatch(root, ctx);
    /* Yield so the progress line actually paints between documents; without
       this the whole batch runs in one frame and the UI looks hung. */
    await new Promise((r) => setTimeout(r, 0));
    try {
      const { text } = await extractText(file);
      if (!text || text.trim().length < 400) throw new Error('Too short to analyse (under 400 characters of text).');
      const report = analyseThesis(text, { citationStyle: S.style });
      const ai = aiIndicators(text);
      S.rows.push({
        id: `f${S.rows.length}`,
        filename: file.name,
        path: file.webkitRelativePath || file.name,
        size: file.size,
        text,
        report,
        ai,
        match: suggestStudent(file.name, students),
        overlap: null
      });
    } catch (err) {
      S.failures.push({ filename: file.name, message: err.message });
    }
    S.progress.done++;
  }

  if (S.rows.length > 1) {
    S.progress.current = 'Comparing submissions against each other…';
    renderBatch(root, ctx);
    await new Promise((r) => setTimeout(r, 0));
    S.pairs = crossMatch(S.rows.map((r) => ({ id: r.id, label: r.filename, text: r.text })));
    S.rows.forEach((row) => {
      const mine = S.pairs
        .filter((p) => p.a === row.id || p.b === row.id)
        .map((p) => {
          const self = p.a === row.id;
          const passages = self ? p.passagesA : p.passagesB;
          return {
            other: self ? p.labelB : p.labelA,
            containment: self ? p.containmentA : p.containmentB,
            longest: passages.length ? Math.max(...passages.map((x) => x.end - x.start)) : 0
          };
        })
        .sort((x, y) => y.containment - x.containment);
      row.overlap = mine[0] || null;
      row.overlapCount = mine.length;
    });
  }

  S.rows.forEach((r) => { r.reasons = reasonsFor(r); });
  S.running = false;
  S.progress = null;
  renderBatch(root, ctx);
  toast(`${S.rows.length} analysed${S.failures.length ? `, ${S.failures.length} could not be read` : ''}.`, 'good');
}

function progressCard() {
  const p = S.progress || { done: 0, total: 0, current: '' };
  const share = p.total ? p.done / p.total : 0;
  return el('div', { class: 'card' },
    el('h2', { text: `Analysing ${p.total} submissions` }),
    meter(share),
    el('p', { class: 'hint', text: `${p.done} of ${p.total} — ${p.current}` }),
    el('p', { class: 'hint', text: 'Keep this tab open. Nothing leaves the computer; the work is happening in this browser.' })
  );
}

function failureCard() {
  return el('div', { class: 'card' },
    banner('warn', `${S.failures.length} file${S.failures.length === 1 ? '' : 's'} could not be read and ${S.failures.length === 1 ? 'is' : 'are'} not in the table below.`),
    table(['File', 'Why'], S.failures.map((f) => [f.filename, f.message]))
  );
}

/* ------------------------------------------------------- student match */

/*
 * A suggestion, never an assignment. The filename is the only evidence
 * available and it is weak evidence: it is offered with the name it matched so
 * the instructor can see what it thought, and it writes nothing anywhere.
 */
function suggestStudent(filename, students) {
  const stem = filename.replace(/\.[^.]+$/, '');
  const norm = stem.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = new Set(norm.split(' ').filter((t) => t.length > 2));
  if (!tokens.size) return null;

  const scored = students.map((s) => {
    const parts = s.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((t) => t.length > 2);
    const hit = parts.filter((p) => tokens.has(p)).length;
    const byNumber = s.studentNo && norm.includes(String(s.studentNo).toLowerCase()) ? 1 : 0;
    return { student: s, hit, byNumber, need: parts.length };
  }).filter((x) => x.byNumber || x.hit);

  if (!scored.length) return null;
  scored.sort((a, b) => (b.byNumber - a.byNumber) || (b.hit - a.hit));
  const best = scored[0];
  const tied = scored.filter((x) => x.byNumber === best.byNumber && x.hit === best.hit);
  return {
    student: best.student,
    confident: best.byNumber === 1 || (best.hit >= 2 && tied.length === 1),
    ambiguous: tied.length > 1,
    alternatives: tied.slice(0, 3).map((x) => x.student.name)
  };
}

/* ------------------------------------------------------------ reasons */

/*
 * Thresholds, all in one place so they can be argued with. Each returns a
 * reason at 'high' or 'medium' or nothing at all; a submission with no
 * reasons is one there is no evidence to prioritise, which is a result.
 */
function reasonsFor(r) {
  const out = [];
  const words = r.report.doc.bodyWords.length || 1;
  const per1000 = (n) => (n / words) * 1000;

  const stress = r.report.scorecard.stressIndex;
  if (stress > 65) out.push({ level: 'high', key: 'Argument', text: `stress ${stress} — ${r.report.argument.stressBand.toLowerCase()}` });
  else if (stress > 45) out.push({ level: 'medium', key: 'Argument', text: `stress ${stress} — strained` });

  const o = r.overlap;
  if (o && (o.containment >= 0.20 || o.longest >= 900)) {
    out.push({ level: 'high', key: 'Overlap', text: `${Math.round(o.containment * 100)}% shared with ${o.other}` });
  } else if (o && (o.containment >= 0.07 || o.longest >= 180)) {
    out.push({ level: 'medium', key: 'Overlap', text: `passage shared with ${o.other}` });
  }

  if (r.ai.score >= 65) out.push({ level: 'high', key: 'AI signals', text: `${r.ai.score}/100 — worth a conversation, not a finding` });
  else if (r.ai.score >= 40) out.push({ level: 'medium', key: 'AI signals', text: `${r.ai.score}/100 — mixed` });

  const errors = r.report.counts.grammar + r.report.counts.typo;
  if (per1000(errors) >= 12) out.push({ level: 'high', key: 'Language', text: `${num(per1000(errors), 1)} errors per 1000 words` });
  else if (per1000(errors) >= 6) out.push({ level: 'medium', key: 'Language', text: `${num(per1000(errors), 1)} errors per 1000 words` });

  if (r.report.counts.citation >= 15) out.push({ level: 'high', key: 'Citations', text: `${r.report.counts.citation} style problems` });
  else if (r.report.counts.citation >= 5) out.push({ level: 'medium', key: 'Citations', text: `${r.report.counts.citation} style problems` });

  /* uncited is reported as 0 when there is no reference list at all, so a
     thesis with no bibliography does not read as one with a tidy one. */
  const x = (r.report.crossCheck && r.report.crossCheck.summary) || {};
  if (x.citationsMissingFromList > 0 || x.referencesNeverCited > 0) {
    out.push({
      level: x.citationsMissingFromList > 2 ? 'high' : 'medium',
      key: 'References',
      text: [
        x.citationsMissingFromList ? `${x.citationsMissingFromList} cited but not listed` : null,
        x.referencesNeverCited ? `${x.referencesNeverCited} listed but never cited` : null
      ].filter(Boolean).join(', ')
    });
  }

  /*
   * Rates and structural ratios need a document long enough to compute them
   * over. Below that they still say something, but not enough to send an
   * instructor to a paper ahead of one where the evidence is a 2,000-character
   * verbatim match. Raising a reason to 'high' and then printing "this number
   * is unreliable" beside it is a contradiction, so the two are reconciled
   * here: the derived measures come down, the observed facts do not.
   */
  const DERIVED = new Set(['Argument', 'AI signals', 'Language']);
  if (words < RELIABLE_WORDS) {
    let downgraded = 0;
    out.forEach((r) => {
      if (r.level === 'high' && DERIVED.has(r.key)) { r.level = 'medium'; downgraded++; }
    });
    out.push({
      level: 'low',
      key: 'Length',
      text: downgraded
        ? `${int(words)} words — too short to measure rates over, so ${downgraded} reason${downgraded === 1 ? '' : 's'} above ${downgraded === 1 ? 'was' : 'were'} lowered`
        : `${int(words)} words — rates measured over this little text are unreliable`
    });
  }

  const RANK = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

/* Under this, a per-1000-word rate is arithmetic on too few words to mean
   much; it is also the floor Burrows's Delta uses elsewhere in the app. */
const RELIABLE_WORDS = 1200;

const attentionOf = (r) =>
  (r.reasons || []).reduce((n, x) => n + (x.level === 'high' ? 10 : x.level === 'medium' ? 3 : 1), 0);

/* ------------------------------------------------------------ results */

const SORTS = {
  attention: { label: 'Needs attention', fn: (a, b) => attentionOf(b) - attentionOf(a) || a.filename.localeCompare(b.filename) },
  name: { label: 'Filename', fn: (a, b) => a.filename.localeCompare(b.filename) },
  stress: { label: 'Argument stress', fn: (a, b) => b.report.scorecard.stressIndex - a.report.scorecard.stressIndex },
  overlap: { label: 'Overlap with others', fn: (a, b) => (b.overlap?.containment || 0) - (a.overlap?.containment || 0) },
  ai: { label: 'AI signals', fn: (a, b) => b.ai.score - a.ai.score },
  length: { label: 'Length', fn: (a, b) => b.report.doc.bodyWords.length - a.report.doc.bodyWords.length }
};

function results(root, ctx) {
  const rows = [...S.rows].sort(SORTS[S.sort].fn);
  const flagged = S.rows.filter((r) => (r.reasons || []).some((x) => x.level === 'high')).length;
  const clean = S.rows.filter((r) => !(r.reasons || []).some((x) => x.level !== 'low')).length;

  return el('div', {},
    el('div', { class: 'grid cols-4' },
      stat('Submissions', int(S.rows.length), S.failures.length ? `${S.failures.length} unreadable` : 'all readable'),
      stat('Need a close read', int(flagged), 'at least one high-level reason', flagged ? 'high' : 'good'),
      stat('Nothing flagged', int(clean), 'nothing beyond a note', clean ? 'good' : ''),
      stat('Shared passages', int(S.pairs.length), 'pairs with matching text', S.pairs.length ? 'medium' : 'good')
    ),
    el('div', { class: 'card' },
      el('div', { class: 'row', style: 'align-items:flex-end;gap:12px;flex-wrap:wrap' },
        el('label', { class: 'field', style: 'max-width:220px;margin:0' },
          el('span', { text: 'Order by' }),
          el('select', {
            onChange: (e) => { S.sort = e.target.value; renderBatch(root, ctx); }
          }, Object.entries(SORTS).map(([k, v]) =>
            el('option', { value: k, text: v.label, selected: S.sort === k })
          ))
        ),
        el('div', { class: 'spacer' }),
        el('p', { class: 'hint', style: 'margin:0;max-width:460px', text: 'Order is set by the reasons listed on each row, not by a hidden score. A row with no reasons is not a good thesis — it is one this tool has nothing to say about.' })
      ),
      table(
        ['Submission', 'Student (suggested)', { label: 'Words', num: true }, { label: 'Stress', num: true }, 'Why it is here', ''],
        rows.map((r) => rowFor(r, root, ctx))
      )
    ),
    S.pairs.length ? pairsCard() : null,
    el('div', { class: 'card' },
      el('h2', { text: 'What this pass does not tell you' }),
      el('p', { class: 'hint', text: 'It compares these files against each other and against nothing else. A passage taken from a published book, from the open web, or from a paper submitted to a different course is invisible here — use the Integrity tab, which checks a single thesis against your saved reviews and verifies its references against Crossref.' }),
      el('p', { class: 'hint', text: 'The AI figures are statistical tendencies and are wrong often enough that they must never stand as a finding on their own; they misfire hardest on non-native English writers. Treat a high number as a reason to ask a student about their process.' })
    )
  );
}

/* Same bands the Thesis view uses: 25 sound, 45 serviceable, 65 strained. */
const stressTone = (v) => (v > 65 ? 'high' : v > 45 ? 'medium' : v > 25 ? 'low' : 'good');

function rowFor(r, root, ctx) {
  return el('tr', {},
    el('td', {},
      el('strong', { text: r.filename }),
      r.path !== r.filename ? el('div', { class: 'hint', text: r.path } ) : null
    ),
    el('td', {}, matchCell(r)),
    el('td', { class: 'num', text: int(r.report.doc.bodyWords.length) }),
    el('td', { class: 'num' }, chip(String(r.report.scorecard.stressIndex), stressTone(r.report.scorecard.stressIndex))),
    el('td', {}, (r.reasons || []).length
      ? el('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px' },
          r.reasons.map((x) => chip(`${x.key}: ${x.text}`, x.level)))
      : el('span', { class: 'hint', text: 'Nothing flagged' })),
    el('td', {}, el('button', {
      text: 'Open',
      onClick: () => {
        stageThesis({
          text: r.text,
          filename: r.filename,
          title: r.filename.replace(/\.[^.]+$/, ''),
          style: S.style,
          studentId: r.match && r.match.confident ? r.match.student.id : null
        });
        ctx.go('thesis', { force: true });
      }
    }))
  );
}

function matchCell(r) {
  const m = r.match;
  if (!m) return el('span', { class: 'hint', text: 'No match in the roster' });
  const label = `${m.student.name} · ${LEVEL_LABEL[m.student.level] || m.student.level}`;
  if (m.ambiguous) {
    return el('div', {},
      chip('Ambiguous', 'high'),
      el('div', { class: 'hint', text: `Could be ${m.alternatives.join(' or ')} — the filename does not say which.` })
    );
  }
  return el('div', {},
    el('span', { text: label }),
    el('div', { class: 'hint', text: m.confident ? 'Suggested from the filename — nothing has been assigned.' : 'Weak match on one name only.' })
  );
}

function pairsCard() {
  return el('div', { class: 'card' },
    el('h2', { text: 'Submissions sharing text' }),
    el('p', { class: 'hint', text: 'Matching is by five-word fingerprints over the body only — bibliographies are excluded, because a cohort reading one syllabus cites the same works. Paraphrase below five words is not caught. Shared text is not by itself misconduct: a quoted source or a supplied dataset description will land here. Read the passages before drawing any conclusion.' }),
    S.pairs.suppressedPhrases
      ? el('p', { class: 'hint', text: `${S.pairs.suppressedPhrases} phrases appear across most of the batch and were treated as handed-out material — a brief, a declaration, a title page — rather than reuse. Every percentage below is net of that.` })
      : null,
    table(
      ['One', 'The other', { label: 'Share of each', num: true }, { label: 'Longest passage', num: true }],
      S.pairs.slice(0, 40).map((p) => [
        p.labelA,
        p.labelB,
        `${Math.round(p.containmentA * 100)}% / ${Math.round(p.containmentB * 100)}%`,
        `${int(Math.max(...p.passagesA.map((x) => x.end - x.start), 0))} chars`
      ])
    )
  );
}

/* --------------------------------------------------------------- export */

function exportCsv() {
  const head = ['File', 'Path', 'Suggested student', 'Match confidence', 'Words', 'Stress index', 'Stress band',
    'Grammar', 'Spelling', 'Style', 'Citation style', 'Argument', 'Structure',
    'Reading ease', 'Grade level', 'AI indicator', 'Top overlap with', 'Overlap %', 'Reasons'];
  const lines = [...S.rows].sort(SORTS[S.sort].fn).map((r) => [
    r.filename,
    r.path,
    r.match ? r.match.student.name : '',
    r.match ? (r.match.ambiguous ? 'ambiguous' : r.match.confident ? 'confident' : 'weak') : 'none',
    r.report.doc.bodyWords.length,
    r.report.scorecard.stressIndex,
    r.report.argument.stressBand,
    r.report.counts.grammar,
    r.report.counts.typo,
    r.report.counts.style,
    r.report.counts.citation,
    r.report.counts.argument,
    r.report.counts.structure,
    num(r.report.scorecard.readingEase, 1),
    num(r.report.scorecard.gradeLevel, 1),
    r.ai.score,
    r.overlap ? r.overlap.other : '',
    r.overlap ? Math.round(r.overlap.containment * 100) : '',
    (r.reasons || []).map((x) => `${x.key}: ${x.text}`).join('; ')
  ]);
  const csv = [head, ...lines].map((row) => row.map(csvCell).join(',')).join('\n');
  downloadText(csv, `batch-triage-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  toast('Triage table exported.', 'good');
}

/* A leading =, + or - makes Excel treat the cell as a formula; prefixing an
   apostrophe is what stops a filename from being executed on open. */
function csvCell(v) {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
