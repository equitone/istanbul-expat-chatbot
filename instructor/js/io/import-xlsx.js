/*
 * import-xlsx.js — read an existing gradebook spreadsheet and turn it into
 * students, a course, and marks.
 *
 * The hard part is that a spreadsheet kept by hand for years has no schema.
 * Headers sit on row 4, the name column is called "Ad Soyad" or "Öğrenci" or
 * nothing at all, there are merged title rows, and a "TOTAL" row at the
 * bottom that must not become a student. So this guesses, shows the guess,
 * and lets the instructor correct it before anything is written.
 *
 * Nothing is committed to the store until applyPlan() is called.
 */
import { loadScript } from './files.js';
import { uid } from '../store.js';

/* Header words seen on real Turkish and English gradebooks. */
const NAME_HINTS = /^(name|full ?name|student ?name|student|ad|adı|ad ?soyad|adsoyad|isim|öğrenci|ogrenci|öğrenci ?adı)$/i;
const NUMBER_HINTS = /^(no|no\.|number|student ?no\.?|student ?number|id|numara|öğrenci ?no|ogrenci ?no|sicil)$/i;
const LEVEL_HINTS = /^(level|programme|program|degree|mocap|derece|seviye)$/i;
const EMAIL_HINTS = /^(e-?mail|eposta|e-?posta)$/i;
/* Rows that are totals or statistics, not people. */
const SUMMARY_ROW = /^(total|toplam|ortalama|average|mean|median|std|stdev|class mean|sınıf|sinif|count|n)\b/i;

export async function readWorkbook(file) {
  await loadScript('xlsx');
  if (!window.XLSX) throw new Error('The spreadsheet reader could not be loaded.');
  const XLSX = window.XLSX;
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });

  return {
    filename: file.name,
    sheets: wb.SheetNames.map((name) => ({
      name,
      /* header:1 gives raw rows; defval keeps column positions aligned. */
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false })
        .map((r) => r.map((c) => (c === null || c === undefined ? '' : c)))
    })).filter((s) => s.rows.length)
  };
}

/*
 * Find the header row and what each column holds.
 *
 * The header is the first row that names at least one thing we recognise, or
 * failing that the first row with several text cells followed by rows that
 * look like data.
 */
export function detectLayout(rows) {
  let headerRow = -1;
  let best = -1;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => String(c).trim());
    const named = cells.filter((c) => NAME_HINTS.test(c) || NUMBER_HINTS.test(c)).length;
    const texty = cells.filter((c) => c && isNaN(Number(c))).length;
    const score = named * 10 + texty;
    if (named > 0 && score > best) { best = score; headerRow = i; }
  }
  if (headerRow === -1) {
    headerRow = rows.findIndex((r) => r.filter((c) => String(c).trim() && isNaN(Number(c))).length >= 2);
  }
  if (headerRow === -1) headerRow = 0;

  const headers = (rows[headerRow] || []).map((c) => String(c).trim());
  const body = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim() !== ''));

  const columns = headers.map((h, idx) => {
    const values = body.map((r) => r[idx]).filter((v) => String(v).trim() !== '');
    const numeric = values.filter((v) => Number.isFinite(Number(v)));
    return {
      index: idx,
      header: h || `Column ${letter(idx)}`,
      blank: !h,
      sampleValues: values.slice(0, 4).map(String),
      numericShare: values.length ? numeric.length / values.length : 0,
      max: numeric.length ? Math.max(...numeric.map(Number)) : null,
      /* A name looks like two or more words of letters. */
      wordyShare: values.length
        ? values.filter((v) => /^[^\d]{3,}$/.test(String(v).trim()) && String(v).trim().includes(' ')).length / values.length
        : 0,
      digitShare: values.length
        ? values.filter((v) => /^\d{4,}$/.test(String(v).trim())).length / values.length
        : 0
    };
  });

  const pick = (hint, fallback) => {
    const byHeader = columns.find((c) => hint.test(c.header));
    if (byHeader) return byHeader.index;
    return fallback ? fallback() : null;
  };

  const nameCol = pick(NAME_HINTS, () => {
    const c = [...columns].sort((a, b) => b.wordyShare - a.wordyShare)[0];
    return c && c.wordyShare > 0.4 ? c.index : null;
  });
  const numberCol = pick(NUMBER_HINTS, () => {
    const c = [...columns].sort((a, b) => b.digitShare - a.digitShare)[0];
    return c && c.digitShare > 0.6 && c.index !== nameCol ? c.index : null;
  });
  const levelCol = pick(LEVEL_HINTS);
  const emailCol = pick(EMAIL_HINTS);

  /* Everything numeric that is not an identifier is a candidate mark column. */
  const gradeCols = columns
    .filter((c) => c.index !== nameCol && c.index !== numberCol && c.index !== levelCol && c.index !== emailCol)
    .filter((c) => c.numericShare > 0.55 && c.max !== null && c.max <= 1000 && !/rank|z-?score|gpa|toplam|total|ortalama|average/i.test(c.header))
    .map((c) => c.index);

  return { headerRow, headers, columns, body, nameCol, numberCol, levelCol, emailCol, gradeCols };
}

/*
 * Turn a confirmed mapping into the exact set of records that would be
 * created. Returning it for display rather than writing it is the point:
 * importing a year of marks into the wrong course is not undoable.
 */
export function buildPlan(layout, mapping, meta, existingStudents) {
  const {
    nameCol, numberCol, levelCol, emailCol, gradeCols, maxScore = 100
  } = mapping;

  const componentDefs = gradeCols.map((idx) => {
    const col = layout.columns[idx] || {};
    return {
      id: uid('cmp'),
      sourceIndex: idx,
      name: col.header || `Component ${letter(idx)}`,
      weight: Math.round((100 / Math.max(1, gradeCols.length)) * 10) / 10,
      maxScore: Number(mapping.maxScorePerColumn?.[idx]) || guessMax(col) || maxScore
    };
  });

  const students = [];
  const skipped = [];

  layout.body.forEach((row, i) => {
    const rawName = String(row[nameCol] ?? '').trim();
    if (!rawName) { skipped.push({ row: i, reason: 'no name' }); return; }
    if (SUMMARY_ROW.test(rawName)) { skipped.push({ row: i, reason: `looks like a summary row (“${rawName}”)` }); return; }

    const studentNo = numberCol === null || numberCol === undefined ? '' : String(row[numberCol] ?? '').trim();
    const level = levelCol !== null && levelCol !== undefined
      ? normaliseLevel(String(row[levelCol] ?? ''))
      : meta.level;

    /*
     * Matching an incoming row to an existing student.
     *
     * A student number is an identifier and matching on it is safe. A NAME IS
     * NOT: two people in a department share a name often enough that merging
     * on it silently would eventually put one student's marks on another's
     * record, and nobody would notice until a transcript was wrong.
     *
     * So a name match is never applied automatically. It is returned as a
     * conflict for the instructor to resolve one by one.
     */
    const byNumber = studentNo
      ? existingStudents.find((s) => s.studentNo && s.studentNo === studentNo)
      : null;

    const nameMatches = existingStudents.filter(
      (s) => s.name.trim().toLowerCase() === rawName.toLowerCase() && (!byNumber || s.id !== byNumber.id)
    );

    let conflict = null;
    if (!byNumber && nameMatches.length) {
      conflict = {
        reason: nameMatches.length > 1 ? 'several-same-name' : 'same-name',
        candidates: nameMatches.map((s) => ({
          id: s.id,
          name: s.name,
          studentNo: s.studentNo,
          level: s.level,
          programme: s.programme,
          year: s.year
        }))
      };
    } else if (byNumber && byNumber.name.trim().toLowerCase() !== rawName.toLowerCase()) {
      /* Same number, different name — a typo, or the number was reused. */
      conflict = {
        reason: 'number-name-mismatch',
        candidates: [{ id: byNumber.id, name: byNumber.name, studentNo: byNumber.studentNo, level: byNumber.level }]
      };
    }

    const scores = {};
    componentDefs.forEach((c) => {
      const v = row[c.sourceIndex];
      if (v === '' || v === null || v === undefined) return;
      const n = Number(v);
      if (Number.isFinite(n)) scores[c.id] = n;
    });

    students.push({
      name: rawName,
      studentNo,
      level: level || meta.level,
      email: emailCol !== null && emailCol !== undefined ? String(row[emailCol] ?? '').trim() : '',
      year: meta.year || '',
      /* Only a student-number match links automatically. */
      existingId: byNumber ? byNumber.id : null,
      conflict,
      /* What the instructor chose: 'new' or an existing student id.
         Left null until they decide, and nothing is written before then. */
      resolution: conflict ? null : (byNumber ? byNumber.id : 'new'),
      scores
    });
  });

  const conflicts = students.filter((s) => s.conflict);

  return {
    conflicts,
    /* The view refuses to import while this is true. */
    needsDecision: conflicts.some((s) => !s.resolution),
    course: {
      title: meta.title,
      code: meta.code,
      level: meta.level,
      term: meta.term,
      year: meta.year
    },
    components: componentDefs,
    students,
    skipped,
    summary: {
      newStudents: students.filter((s) => s.resolution === 'new').length,
      matchedStudents: students.filter((s) => s.resolution && s.resolution !== 'new').length,
      undecided: conflicts.filter((s) => !s.resolution).length,
      components: componentDefs.length,
      marks: students.reduce((n, s) => n + Object.keys(s.scores).length, 0)
    }
  };
}

/* Some sheets mark out of 20 or 50; take the observed maximum as a hint. */
function guessMax(col) {
  if (col.max === null) return null;
  for (const candidate of [10, 20, 25, 50, 100]) {
    if (col.max <= candidate) return candidate;
  }
  return Math.ceil(col.max / 10) * 10;
}

export function normaliseLevel(raw) {
  const s = String(raw).toLowerCase();
  if (/phd|doctora|doktora|dr\.?$|doctoral/.test(s)) return 'phd';
  if (/master|msc|ma\b|yüksek|yuksek|graduate/.test(s)) return 'masters';
  if (/under|bachelor|bsc|ba\b|lisans|undergrad/.test(s)) return 'undergraduate';
  return null;
}

const letter = (i) => {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};
