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
import { nameKey } from '../turkish.js';
import { uid, getState, update } from '../store.js';

/*
 * Header matching is done on a folded form of the text, so one hint covers
 * the spellings a real sheet actually contains: Adı / ADI / Adi, Öğrenci No /
 * OGRENCI NO, Soyadı / SOYADI. Turkish dotless i and capital dotted I do not
 * survive toLowerCase() intact, so they are handled before the fold and the
 * rest comes off as combining marks.
 */
export const fold = (s) =>
  String(s == null ? '' : s)
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/*
 * What each column holds. Order matters: the first pattern that matches wins,
 * so the specific readings ("öğrenci no" = the student's number) are listed
 * before the general ones ("no" = a row counter).
 */
const ROLE_HINTS = [
  ['number',    /^(ogrenci no|ogrenci numarasi|student ?no\.?|student ?number|numara|sicil|matricul\w*|id no)$/],
  ['firstName', /^(ad|adi|isim|ogrenci adi|first ?name|given ?name|forename)$/],
  ['lastName',  /^(soyad|soyadi|surname|last ?name|family ?name)$/],
  ['name',      /^(ad soyad|adsoyad|ad ve soyad|isim soyisim|name|full ?name|student ?name|student|ogrenci|ogrenci adi soyadi)$/],
  ['classYear', /^(snf|sinif|sinifi|class|class ?year|year of study|yil|grade ?level)$/],
  ['level',     /^(level|programme|program|degree|derece|seviye|ogrenim duzeyi)$/],
  ['email',     /^(e-?mail|eposta|e-?posta|mail adresi)$/],
  ['total',     /^(hbn|hbp|ham basari notu|ham basari|basari notu|ortalama|genel ortalama|genel not|average|overall|total|toplam|final grade|sonuc notu)$/],
  ['letter',    /^(harf notu|harf|letter|letter ?grade|nota)$/],
  ['status',    /^(gecme durumu|basari durumu|durum|sonuc|result|status|pass ?\/? ?fail|gecti kaldi)$/],
  ['ordinal',   /^(no|no\.|s ?no|sira|sira no|#|num|nr)$/]
];

/* A resit sits in place of the exam it replaces rather than beside it. */
const RESIT_HINTS = /^(but|butunleme|but notu|resit|re-?sit|make ?-?up|makeup|supplementary|mazeret|telafi)/;

/* Which exam a resit stands in for, most specific first. */
const RESIT_TARGETS = [/^final/, /^(vize|midterm|mid ?term|ara ?sinav)/];

/* Rows that are totals or statistics, not people. */
const SUMMARY_ROW = /^(total|toplam|ortalama|average|mean|median|std|stdev|class mean|sınıf|sinif|count|n)\b/i;

/*
 * University exports tag every column with the section code — "Vize(%20)_0202SD".
 * The tag is identical on all of them and carries no per-column meaning, so it
 * is found once and removed before anything is matched; left in place it
 * defeats every hint above and ends up printed on every component name.
 */
export function detectSectionSuffix(headers) {
  const named = headers.map((h) => String(h || '').trim()).filter(Boolean);
  if (named.length < 3) return '';

  let common = named[0];
  for (const h of named.slice(1)) {
    let k = 0;
    while (k < common.length && k < h.length && common[common.length - 1 - k] === h[h.length - 1 - k]) k++;
    common = common.slice(common.length - k);
    if (!common) return '';
  }
  /* Keep only from the last separator, so a shared word ending is not eaten. */
  const m = common.match(/[_\-\s][A-Za-z0-9]+$/);
  const suffix = m ? m[0] : '';
  if (suffix.length < 3) return '';
  /* Never strip something that is the whole of any header. */
  return named.some((h) => h === suffix.trim()) ? '' : suffix;
}

/* "Vize(%20)" and "Final (60%)" declare their own weight; take it. */
export function parseWeight(header) {
  const m = String(header).match(/[([]\s*%?\s*(\d{1,3}(?:[.,]\d+)?)\s*%?\s*[)\]]\s*$/);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

/* The section code alone comes off first: the declared weight sits inside the
   header and behind the code, so "Vize(%20)_0202SD" only reads as 20 once the
   code is gone and the parenthesis is at the end again. */
const withoutSuffix = (header, suffix) => {
  const h = String(header || '').trim();
  return suffix && h.endsWith(suffix) ? h.slice(0, -suffix.length).trim() : h;
};

/* The header with the section code and the weight taken off. */
const cleanHeader = (header, suffix) =>
  withoutSuffix(header, suffix).replace(/[([]\s*%?\s*\d{1,3}(?:[.,]\d+)?\s*%?\s*[)\]]\s*$/, '').trim();

/* A 1, 2, 3 … column is a row counter, whatever it is called. */
function looksOrdinal(values) {
  if (values.length < 4) return false;
  const nums = values.map((v) => Number(v));
  if (nums.some((n) => !Number.isInteger(n))) return false;
  let sequential = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] === nums[i - 1] + 1) sequential++;
  return nums[0] <= 2 && sequential / (nums.length - 1) > 0.9;
}

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

  const looksLikeHeaderCell = (c) => {
    const f = fold(c);
    return ROLE_HINTS.some(([, re]) => re.test(f)) || RESIT_HINTS.test(f);
  };

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => String(c).trim());
    /* Try the row as written and with a shared section code removed, since
       the tag is what stops "Adı_0202SD" being recognised as a name. */
    const suffix = detectSectionSuffix(cells);
    const named = cells.filter((c) => looksLikeHeaderCell(cleanHeader(c, suffix))).length;
    const texty = cells.filter((c) => c && isNaN(Number(c))).length;
    const score = named * 10 + texty;
    if (named > 0 && score > best) { best = score; headerRow = i; }
  }
  if (headerRow === -1) {
    headerRow = rows.findIndex((r) => r.filter((c) => String(c).trim() && isNaN(Number(c))).length >= 2);
  }
  if (headerRow === -1) headerRow = 0;

  const headers = (rows[headerRow] || []).map((c) => String(c).trim());
  const sectionCode = detectSectionSuffix(headers);
  const allBody = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim() !== ''));

  /*
   * Drop TOPLAM / ORTALAMA / TOTAL rows before measuring the columns.
   *
   * They are excluded from the student list later anyway, but if they are
   * left in here they poison every statistic taken from the column: a column
   * of marks out of 100 with a totals row of 513 gets read as being marked
   * out of 520, and every imported mark is then scaled against the wrong
   * maximum.
   */
  const body = allBody.filter((r) => !r.slice(0, 3).some((c) => SUMMARY_ROW.test(String(c).trim())));

  const columns = headers.map((h, idx) => {
    const values = body.map((r) => r[idx]).filter((v) => String(v).trim() !== '');
    const numeric = values.filter((v) => Number.isFinite(Number(v)));
    const clean = cleanHeader(h, sectionCode);
    const folded = fold(clean);
    const hinted = (ROLE_HINTS.find(([, re]) => re.test(folded)) || [null])[0];
    return {
      index: idx,
      header: h || `Column ${letter(idx)}`,
      /* What the instructor should see: the section code and the weight
         belong to the course, not to the name of the component. */
      label: clean || `Column ${letter(idx)}`,
      folded,
      blank: !h,
      weight: parseWeight(withoutSuffix(h, sectionCode)),
      hinted,
      isResit: RESIT_HINTS.test(folded),
      sampleValues: values.slice(0, 4).map(String),
      numericShare: values.length ? numeric.length / values.length : 0,
      max: numeric.length ? Math.max(...numeric.map(Number)) : null,
      ordinal: numeric.length === values.length && looksOrdinal(numeric),
      /* A name looks like two or more words of letters. */
      wordyShare: values.length
        ? values.filter((v) => /^[^\d]{3,}$/.test(String(v).trim()) && String(v).trim().includes(' ')).length / values.length
        : 0,
      digitShare: values.length
        ? values.filter((v) => /^\d{4,}$/.test(String(v).trim())).length / values.length
        : 0
    };
  });

  const taken = new Set();
  const claim = (idx) => { if (idx !== null && idx !== undefined) taken.add(idx); return idx; };
  const byHint = (role) => {
    const c = columns.find((x) => x.hinted === role && !taken.has(x.index));
    return c ? c.index : null;
  };

  /*
   * A bare "No" is ambiguous: on one sheet it is the student number and on
   * the next it is a row counter beside a separate "Öğrenci No". The values
   * settle it — 1, 2, 3 … is a counter — so the column is only read as an
   * identifier when nothing else claims that role.
   */
  let numberCol = claim(byHint('number'));
  const ordinalCol = columns.find((c) => c.hinted === 'ordinal' && c.ordinal && !taken.has(c.index));
  if (ordinalCol) taken.add(ordinalCol.index);
  if (numberCol === null) {
    const asNumber = columns.find((c) => c.hinted === 'ordinal' && !c.ordinal && !taken.has(c.index));
    numberCol = claim(asNumber ? asNumber.index : null);
  }

  const firstNameCol = claim(byHint('firstName'));
  const lastNameCol = claim(byHint('lastName'));
  let nameCol = claim(byHint('name'));

  /* Only guess a name column when the sheet did not name one and there is no
     given/family pair to build one from. */
  if (nameCol === null && firstNameCol === null) {
    const c = [...columns].filter((x) => !taken.has(x.index)).sort((a, b) => b.wordyShare - a.wordyShare)[0];
    nameCol = claim(c && c.wordyShare > 0.4 ? c.index : null);
  }
  if (numberCol === null) {
    const c = [...columns].filter((x) => !taken.has(x.index)).sort((a, b) => b.digitShare - a.digitShare)[0];
    numberCol = claim(c && c.digitShare > 0.6 ? c.index : null);
  }

  const classYearCol = claim(byHint('classYear'));
  const levelCol = claim(byHint('level'));
  const emailCol = claim(byHint('email'));

  /*
   * HBN, the letter grade and Geçti/Kaldı are computed FROM the marks. Read
   * as components they would be counted a second time and would wreck the
   * weighting; dropped silently they would take with them the one thing that
   * can check this import against the sheet it came from. So they are given
   * their own roles and used to verify the result instead.
   */
  const totalCol = claim(byHint('total'));
  const letterCol = claim(byHint('letter'));
  const statusCol = claim(byHint('status'));

  /* Everything numeric that is left is a candidate mark column. */
  const gradeCols = columns
    .filter((c) => !taken.has(c.index) && !c.ordinal)
    .filter((c) => c.numericShare > 0.55 && c.max !== null && c.max <= 1000)
    .map((c) => c.index);

  return {
    headerRow, headers, columns, body, sectionCode,
    nameCol, firstNameCol, lastNameCol, numberCol, levelCol, emailCol,
    classYearCol, totalCol, letterCol, statusCol,
    ordinalCol: ordinalCol ? ordinalCol.index : null,
    gradeCols
  };
}

/*
 * Turn a confirmed mapping into the exact set of records that would be
 * created. Returning it for display rather than writing it is the point:
 * importing a year of marks into the wrong course is not undoable.
 */
export function buildPlan(layout, mapping, meta, existingStudents) {
  const {
    nameCol, firstNameCol, lastNameCol, numberCol, levelCol, emailCol,
    classYearCol, totalCol, letterCol, statusCol, gradeCols, maxScore = 100
  } = mapping;

  /*
   * Weights come from the header where the sheet declares them —
   * "Vize(%20)" is the course's own statement of what that column is worth,
   * and it beats any even split this could invent. Only when no column
   * declares one is the weight shared out equally.
   */
  const declared = gradeCols.map((idx) => (layout.columns[idx] || {}).weight).filter((w) => w);
  const anyDeclared = declared.length > 0;

  const componentDefs = gradeCols.map((idx) => {
    const col = layout.columns[idx] || {};
    return {
      id: uid('cmp'),
      sourceIndex: idx,
      name: col.label || col.header || `Component ${letter(idx)}`,
      weight: anyDeclared
        ? (col.weight || 0)
        : Math.round((100 / Math.max(1, gradeCols.length)) * 10) / 10,
      weightFromHeader: anyDeclared && Boolean(col.weight),
      isResit: Boolean(col.isResit),
      resitFor: null,
      maxScore: Number(mapping.maxScorePerColumn?.[idx]) || guessMax(col) || maxScore
    };
  });

  /*
   * A resit is not a fifth assessment: it stands in for the exam the student
   * failed, and the better of the two counts. Left as its own weighted
   * component, "Vize 20 + Devam 20 + Final 60 + Büt 60" totals 160% and every
   * mark computed from it is wrong. So it is linked to the exam it replaces
   * and carries that exam's weight rather than its own.
   */
  componentDefs.filter((c) => c.isResit).forEach((resit) => {
    const target = RESIT_TARGETS
      .map((re) => componentDefs.find((c) => !c.isResit && re.test(fold(c.name))))
      .find(Boolean);
    if (target) {
      resit.resitFor = target.id;
      resit.weight = 0;
    }
  });

  const students = [];
  const skipped = [];

  /* One name column, or a given-name and family-name pair to join. */
  const nameOf = (row) => {
    if (nameCol !== null && nameCol !== undefined) return String(row[nameCol] ?? '').trim();
    const first = firstNameCol !== null && firstNameCol !== undefined ? String(row[firstNameCol] ?? '').trim() : '';
    const last = lastNameCol !== null && lastNameCol !== undefined ? String(row[lastNameCol] ?? '').trim() : '';
    return [first, last].filter(Boolean).join(' ');
  };

  /* Where the sheet gives Adı and Soyadı separately, keep them apart. Guessing
     which token of a joined name is the surname is unreliable for the Arabic
     and Persian names on the same roster, and the sheet already knows. */
  const partsOf = (row) => ({
    firstName: firstNameCol !== null && firstNameCol !== undefined ? String(row[firstNameCol] ?? '').trim() : '',
    lastName: lastNameCol !== null && lastNameCol !== undefined ? String(row[lastNameCol] ?? '').trim() : ''
  });

  layout.body.forEach((row, i) => {
    const rawName = nameOf(row);
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

    /* nameKey, not toLowerCase: 'MELİS'.toLowerCase() yields 'i' plus a
       combining dot, so a plain comparison called MELİS KESER and Melis Keser
       different people — for 30 of the 100 students in a real cohort, which
       is exactly the duplicate warning this is here to raise. */
    const incomingKey = nameKey(rawName);
    const nameMatches = existingStudents.filter(
      (s) => nameKey(s.name) === incomingKey && (!byNumber || s.id !== byNumber.id)
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
    } else if (byNumber && nameKey(byNumber.name) !== incomingKey) {
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

    const cell = (col) => (col === null || col === undefined ? '' : String(row[col] ?? '').trim());

    students.push({
      name: rawName,
      ...partsOf(row),
      studentNo,
      level: level || meta.level,
      email: cell(emailCol),
      year: meta.year || '',
      /* Year of study (Snf: 2, 3, 4) — not the academic year, which is the
         course's and is set once in the form above. */
      classYear: cell(classYearCol),
      /* What the sheet itself recorded, kept only to check this import
         against it below. */
      recorded: {
        total: totalCol !== null && totalCol !== undefined && Number.isFinite(Number(row[totalCol])) ? Number(row[totalCol]) : null,
        letter: cell(letterCol),
        status: cell(statusCol)
      },
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
  const check = verifyAgainstRecorded(students, componentDefs);

  return {
    conflicts,
    check,
    /* The view refuses to import while this is true. */
    needsDecision: conflicts.some((s) => !s.resolution),
    course: {
      title: meta.title,
      code: meta.code,
      level: meta.level,
      term: meta.term,
      year: meta.year,
      academicYear: meta.academicYear || ''
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

/*
 * The sheet already carries the answer: HBN is the weighted total the
 * department computed. Recomputing it from the columns just imported and
 * comparing is the only check available that the weights, the resit rule and
 * the mark columns were all read correctly — and it is a check against the
 * instructor's own data rather than against an assumption.
 *
 * A disagreement is reported, never corrected. It usually means the sheet
 * holds a manual override, which is the instructor's decision to keep.
 */
function verifyAgainstRecorded(students, components) {
  const withRecorded = students.filter((s) => s.recorded && s.recorded.total !== null);
  if (!withRecorded.length || !components.length) return null;

  const differences = [];
  withRecorded.forEach((s) => {
    const computed = weightedTotal(s.scores, components);
    if (computed === null) return;
    if (Math.abs(computed - s.recorded.total) > 0.51) {
      differences.push({ name: s.name, studentNo: s.studentNo, computed: Math.round(computed * 10) / 10, recorded: s.recorded.total });
    }
  });

  return {
    checked: withRecorded.length,
    agreed: withRecorded.length - differences.length,
    differences: differences.slice(0, 20),
    moreDifferences: Math.max(0, differences.length - 20)
  };
}

/* The same arithmetic the app uses, with a resit substituted for the exam it
   replaces when it is the better mark. Absent marks count as zero here
   because that is what the recorded total does. */
export function weightedTotal(scores, components) {
  let total = 0;
  let weight = 0;
  components.forEach((c) => {
    if (c.resitFor) return;
    const w = Number(c.weight) || 0;
    if (!w) return;
    weight += w;
    const max = Number(c.maxScore) || 100;
    let raw = Number(scores[c.id]);
    if (!Number.isFinite(raw)) raw = 0;
    const resit = components.find((r) => r.resitFor === c.id);
    if (resit) {
      const alt = Number(scores[resit.id]);
      if (Number.isFinite(alt) && alt > raw) raw = alt;
    }
    total += (raw / max) * w;
  });
  return weight ? total : null;
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


/*
 * Write a resolved plan into the store.
 *
 * One update() for the whole import rather than per row: a spreadsheet with
 * two hundred students would otherwise trigger two hundred saves and
 * re-renders, and a half-applied import is the one outcome worse than none.
 *
 * Refuses outright while any conflict is unresolved — the guard belongs here
 * as well as in the view, because this is the function that actually writes.
 */
export function applyPlan(plan) {
  const unresolved = plan.students.filter((s) => !s.resolution);
  if (unresolved.length) {
    throw new Error(`${unresolved.length} name conflict(s) still need a decision.`);
  }

  const courseId = uid('crs');
  const created = { students: 0, linked: 0, marks: 0 };

  update((state) => {
    const idFor = new Map();

    plan.students.forEach((row) => {
      if (row.resolution === 'new') {
        const student = {
          id: uid('stu'),
          name: row.name,
          firstName: row.firstName || '',
          lastName: row.lastName || '',
          studentNo: row.studentNo,
          level: row.level || plan.course.level,
          email: row.email || '',
          programme: '',
          year: row.year || plan.course.year || '',
          classYear: row.classYear || '',
          notes: '',
          createdAt: new Date().toISOString()
        };
        state.students.push(student);
        idFor.set(row, student.id);
        created.students++;
      } else {
        idFor.set(row, row.resolution);
        created.linked++;
        /* Fill in a blank field on the existing record, but never overwrite
           something the instructor already entered. */
        const existing = state.students.find((s) => s.id === row.resolution);
        if (existing) {
          if (!existing.studentNo && row.studentNo) existing.studentNo = row.studentNo;
          if (!existing.lastName && row.lastName) { existing.firstName = row.firstName || ''; existing.lastName = row.lastName; }
          if (!existing.year && (row.year || plan.course.year)) existing.year = row.year || plan.course.year;
          if (!existing.classYear && row.classYear) existing.classYear = row.classYear;
          if (!existing.email && row.email) existing.email = row.email;
        }
      }
    });

    state.courses.push({
      id: courseId,
      title: plan.course.title,
      code: plan.course.code,
      level: plan.course.level,
      term: plan.course.term,
      year: plan.course.year || '',
      /* Filed under an academic year from the start, so importing three years
         of old gradebooks does not pile them all into the current one. */
      academicYear: plan.course.academicYear || getState().settings.activeYear,
      archived: false,
      credits: 0,
      components: plan.components.map((c) => ({
        id: c.id, name: c.name, weight: c.weight, maxScore: c.maxScore,
        /* Kept so the gradebook applies the same better-of-the-two rule the
           department applied, instead of ignoring the resit. */
        resitFor: c.resitFor || null
      })),
      enrolled: plan.students.map((r) => idFor.get(r)).filter(Boolean),
      importedFrom: plan.sourceName || '',
      createdAt: new Date().toISOString()
    });

    state.scores[courseId] = {};
    plan.students.forEach((row) => {
      const sid = idFor.get(row);
      if (!sid) return;
      state.scores[courseId][sid] = { ...row.scores };
      created.marks += Object.keys(row.scores).length;
    });
  }, { type: 'import' });

  return { courseId, ...created };
}
