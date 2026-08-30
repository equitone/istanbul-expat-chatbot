/*
 * workbook.js — builds the Excel export.
 *
 * Everything the instructor can see on screen ends up in the workbook: the
 * roster, every course gradebook, class statistics, a cross-level comparison,
 * component diagnostics, and the full thesis findings. Sheets are plain values
 * (no formulas) so the file opens identically in Excel, Numbers and LibreOffice.
 */
import { getState, LEVELS, LEVEL_LABEL, loadThesisDocument } from '../store.js';
import { courseTotal, classSummary, describe, correlation, toLetter, rank } from '../stats.js';
import { loadScript, downloadBlob, downloadText } from '../io/files.js';

export async function buildWorkbook({ includeTheses = true } = {}) {
  await loadScript('xlsx');
  if (!window.XLSX) throw new Error('The spreadsheet library could not be loaded. Use "Export CSV" instead, or vendor the library (see README).');
  const XLSX = window.XLSX;
  const state = getState();
  const wb = XLSX.utils.book_new();

  const sheets = await collectSheets(state, { includeTheses });
  sheets.forEach(({ name, rows, widths }) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths || inferWidths(rows);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, wb));
  });

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function exportWorkbook(options) {
  const blob = await buildWorkbook(options);
  downloadBlob(blob, `gradebook-${stamp()}.xlsx`);
}

/* CSV fallback for machines with no access to the spreadsheet library. */
export async function exportAllCsv() {
  const state = getState();
  const sheets = await collectSheets(state, { includeTheses: true });
  const body = sheets
    .map(({ name, rows }) => `### ${name}\n${rows.map(toCsvRow).join('\n')}`)
    .join('\n\n');
  downloadText(body, `gradebook-${stamp()}.csv`, 'text/csv;charset=utf-8');
}

export function exportTableCsv(name, rows) {
  downloadText(rows.map(toCsvRow).join('\n'), `${slug(name)}-${stamp()}.csv`, 'text/csv;charset=utf-8');
}

/* ----------------------------------------------------------- sheet builders */

async function collectSheets(state, { includeTheses }) {
  const sheets = [];
  sheets.push(overviewSheet(state));
  sheets.push(studentsSheet(state));
  sheets.push(coursesSheet(state));

  state.courses.forEach((course) => {
    sheets.push(gradebookSheet(state, course));
  });

  sheets.push(statisticsSheet(state));
  sheets.push(levelComparisonSheet(state));
  sheets.push(componentAnalysisSheet(state));

  if (includeTheses && state.theses.length) {
    sheets.push(thesisSummarySheet(state));
    const detail = await thesisFindingsSheet(state);
    if (detail) sheets.push(detail);
  }
  return sheets;
}

function overviewSheet(state) {
  const s = state.settings;
  const rows = [
    ['Instructor Workbench — export'],
    ['Generated', new Date().toLocaleString()],
    ['Instructor', s.instructor || '—'],
    ['Institution', s.institution || '—'],
    ['Term', s.defaultTerm || '—'],
    [],
    ['Pass mark', s.passMark],
    ['Scale maximum', s.scaleMax],
    [],
    ['Students', state.students.length],
    ...LEVELS.map((l) => [`  ${l.label}`, state.students.filter((x) => x.level === l.id).length]),
    ['Courses', state.courses.length],
    ['Theses analysed', state.theses.length],
    [],
    ['Note', 'Running totals prorate ungraded components; final totals count them as zero.']
  ];
  return { name: 'Overview', rows, widths: [{ wch: 28 }, { wch: 34 }] };
}

function studentsSheet(state) {
  const header = ['Student ID', 'Name', 'Student no.', 'Level', 'Programme', 'Email', 'Courses', 'Theses'];
  const rows = state.students.map((st) => [
    st.id,
    st.name,
    st.studentNo,
    LEVEL_LABEL[st.level] || st.level,
    st.programme || '',
    st.email || '',
    state.courses.filter((c) => c.enrolled.includes(st.id)).map((c) => c.code || c.title).join(', '),
    state.theses.filter((t) => t.studentId === st.id).length
  ]);
  return { name: 'Students', rows: [header, ...rows] };
}

function coursesSheet(state) {
  const header = ['Course ID', 'Code', 'Title', 'Level', 'Term', 'Credits', 'Enrolled', 'Component', 'Weight %', 'Max score'];
  const rows = [];
  state.courses.forEach((c) => {
    if (!c.components.length) {
      rows.push([c.id, c.code, c.title, LEVEL_LABEL[c.level], c.term, c.credits, c.enrolled.length, '—', '', '']);
      return;
    }
    c.components.forEach((comp, i) => {
      rows.push([
        i === 0 ? c.id : '', i === 0 ? c.code : '', i === 0 ? c.title : '',
        i === 0 ? LEVEL_LABEL[c.level] : '', i === 0 ? c.term : '',
        i === 0 ? c.credits : '', i === 0 ? c.enrolled.length : '',
        comp.name, Number(comp.weight) || 0, Number(comp.maxScore) || 100
      ]);
    });
    const total = c.components.reduce((n, x) => n + (Number(x.weight) || 0), 0);
    rows.push(['', '', '', '', '', '', '', 'TOTAL WEIGHT', total, total === 100 ? '' : '⚠ does not sum to 100']);
  });
  return { name: 'Courses', rows: [header, ...rows] };
}

export function gradebookRows(state, course) {
  const scheme = state.settings.letterScheme;
  const comps = course.components;
  const header = [
    'Student no.', 'Name', 'Level',
    ...comps.map((c) => `${c.name} (/${c.maxScore}, ${c.weight}%)`),
    'Weighted total', 'Running total', 'Letter', 'GPA', 'Rank', 'Z-score', 'Status'
  ];

  const enrolled = course.enrolled
    .map((id) => state.students.find((s) => s.id === id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const computed = enrolled.map((st) => {
    const scores = (state.scores[course.id] || {})[st.id] || {};
    const total = courseTotal(scores, comps);
    return { st, scores, total };
  });

  const finals = computed.map((r) => r.total.absolute);
  const stats = describe(finals);
  const ranks = rank(finals);

  const rows = computed.map((r, i) => {
    const letter = toLetter(r.total.absolute, scheme);
    const z = stats.stdev ? (r.total.absolute - stats.mean) / stats.stdev : null;
    return [
      r.st.studentNo, r.st.name, LEVEL_LABEL[r.st.level],
      ...comps.map((c) => (Number.isFinite(r.scores[c.id]) ? r.scores[c.id] : '')),
      round(r.total.absolute), round(r.total.running),
      letter ? letter.letter : '', letter ? letter.gpa : '',
      ranks[i] ?? '', round(z, 2),
      r.total.complete ? 'Complete' : `${r.total.missing.length} missing`
    ];
  });

  const footer = [
    ['', 'CLASS MEAN', '', ...comps.map((c) => round(describe(computed.map((r) => r.scores[c.id])).mean)), round(stats.mean), '', '', '', '', '', ''],
    ['', 'MEDIAN', '', ...comps.map((c) => round(describe(computed.map((r) => r.scores[c.id])).median)), round(stats.median), '', '', '', '', '', ''],
    ['', 'STD DEV', '', ...comps.map((c) => round(describe(computed.map((r) => r.scores[c.id])).stdev)), round(stats.stdev), '', '', '', '', '', '']
  ];

  return [header, ...rows, [], ...footer];
}

function gradebookSheet(state, course) {
  return { name: course.code || course.title || 'Course', rows: gradebookRows(state, course) };
}

function statisticsSheet(state) {
  const header = ['Course', 'Code', 'Level', 'Term', 'Enrolled', 'Graded', 'Ungraded', 'Mean', 'Median', 'Std dev', 'Min', 'Q1', 'Q3', 'Max', 'Pass rate %', 'Mean GPA'];
  const rows = state.courses.map((c) => {
    const rowsFor = c.enrolled.map((id) => ({ score: courseTotal((state.scores[c.id] || {})[id], c.components).absolute }));
    const sum = classSummary(rowsFor, { scaleMax: state.settings.scaleMax, passMark: state.settings.passMark, scheme: state.settings.letterScheme });
    return [
      c.title, c.code, LEVEL_LABEL[c.level], c.term, c.enrolled.length, sum.graded, sum.ungraded,
      round(sum.mean), round(sum.median), round(sum.stdev), round(sum.min),
      round(sum.q1), round(sum.q3), round(sum.max),
      sum.passRate === null ? '' : round(sum.passRate * 100), round(sum.meanGpa, 2)
    ];
  });

  const distHeader = [[], ['Grade distribution by course'], ['Course', ...state.settings.letterScheme.map((s) => s.letter)]];
  const distRows = state.courses.map((c) => {
    const rowsFor = c.enrolled.map((id) => ({ score: courseTotal((state.scores[c.id] || {})[id], c.components).absolute }));
    const sum = classSummary(rowsFor, { scaleMax: state.settings.scaleMax, passMark: state.settings.passMark, scheme: state.settings.letterScheme });
    const byLetter = Object.fromEntries(sum.letters.map((l) => [l.letter, l.count]));
    return [c.title, ...state.settings.letterScheme.map((s) => byLetter[s.letter] || 0)];
  });

  return { name: 'Class statistics', rows: [header, ...rows, ...distHeader, ...distRows] };
}

function levelComparisonSheet(state) {
  const header = ['Level', 'Students', 'Courses', 'Graded marks', 'Mean', 'Median', 'Std dev', 'Min', 'Max', 'Pass rate %'];
  const rows = LEVELS.map((lvl) => {
    const courses = state.courses.filter((c) => c.level === lvl.id);
    const marks = [];
    courses.forEach((c) => {
      c.enrolled.forEach((id) => {
        const t = courseTotal((state.scores[c.id] || {})[id], c.components).absolute;
        if (Number.isFinite(t)) marks.push(t);
      });
    });
    const d = describe(marks);
    const passing = marks.filter((m) => m >= state.settings.passMark).length;
    return [
      lvl.label,
      state.students.filter((s) => s.level === lvl.id).length,
      courses.length, marks.length,
      round(d.mean), round(d.median), round(d.stdev), round(d.min), round(d.max),
      marks.length ? round((passing / marks.length) * 100) : ''
    ];
  });
  return { name: 'By level', rows: [header, ...rows] };
}

/*
 * Which assessments actually discriminate? A component that correlates weakly
 * with the final mark is either measuring something different or not measuring
 * anything — worth knowing before reusing it next year.
 */
function componentAnalysisSheet(state) {
  const header = ['Course', 'Component', 'Weight %', 'Max', 'n', 'Mean', 'Mean %', 'Std dev', 'Min', 'Max', 'r with course total', 'Reading'];
  const rows = [];
  state.courses.forEach((c) => {
    const finals = c.enrolled.map((id) => courseTotal((state.scores[c.id] || {})[id], c.components).absolute);
    c.components.forEach((comp) => {
      const raw = c.enrolled.map((id) => ((state.scores[c.id] || {})[id] || {})[comp.id]);
      const d = describe(raw);
      const r = correlation(raw, finals);
      rows.push([
        c.code || c.title, comp.name, comp.weight, comp.maxScore, d.n,
        round(d.mean), d.mean === null ? '' : round((d.mean / (comp.maxScore || 100)) * 100),
        round(d.stdev), round(d.min), round(d.max),
        r === null ? '' : round(r, 2),
        r === null ? 'too few marks' : r > 0.7 ? 'tracks the final closely' : r > 0.4 ? 'moderate agreement' : 'measures something different'
      ]);
    });
  });
  return { name: 'Component analysis', rows: [header, ...rows] };
}

function thesisSummarySheet(state) {
  const header = ['Student', 'Level', 'Title', 'File', 'Words', 'Stress index', 'Band', 'Total findings', 'High severity', 'Analysed'];
  const rows = state.theses.map((t) => {
    const st = state.students.find((s) => s.id === t.studentId);
    return [
      st ? st.name : '(unassigned)', st ? LEVEL_LABEL[st.level] : '',
      t.title, t.filename, t.wordCount, t.stressIndex, t.stressBand,
      t.issueCount, t.highCount, new Date(t.savedAt).toLocaleString()
    ];
  });
  return { name: 'Thesis summary', rows: [header, ...rows] };
}

async function thesisFindingsSheet(state) {
  const header = ['Student', 'Thesis', 'Category', 'Rule', 'Severity', 'Excerpt', 'Comment', 'Suggestion', 'Char offset'];
  const rows = [];
  for (const t of state.theses) {
    const doc = await loadThesisDocument(t.id);
    if (!doc || !doc.report) continue;
    const st = state.students.find((s) => s.id === t.studentId);
    (doc.report.issues || []).forEach((i) => {
      rows.push([
        st ? st.name : '(unassigned)', t.title,
        i.category, i.rule, i.severity,
        clip(i.excerpt, 180), clip(i.message, 300), clip(i.suggestion || '', 120), i.start
      ]);
    });
  }
  if (!rows.length) return null;
  return {
    name: 'Thesis findings',
    rows: [header, ...rows],
    widths: [{ wch: 20 }, { wch: 24 }, { wch: 14 }, { wch: 24 }, { wch: 9 }, { wch: 50 }, { wch: 60 }, { wch: 30 }, { wch: 10 }]
  };
}

/* ---------------------------------------------------------------- helpers */

function inferWidths(rows) {
  const widths = [];
  rows.slice(0, 60).forEach((row) => {
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length;
      widths[i] = Math.min(48, Math.max(widths[i] || 9, len + 2));
    });
  });
  return widths.map((wch) => ({ wch }));
}

/* Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
function safeSheetName(name, wb) {
  let base = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, '-').slice(0, 28).trim() || 'Sheet';
  let candidate = base;
  let n = 2;
  while (wb.SheetNames.includes(candidate)) candidate = `${base.slice(0, 26)} ${n++}`;
  return candidate;
}

function toCsvRow(row) {
  return (row || []).map((cell) => {
    const v = cell ?? '';
    return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  }).join(',');
}

const round = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : '');
const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stamp = () => new Date().toISOString().slice(0, 10);
