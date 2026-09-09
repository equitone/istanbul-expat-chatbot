/*
 * import.js — bring a previous year's gradebook in from a spreadsheet.
 *
 * Four steps, deliberately separated: read the file, confirm what each column
 * holds, resolve any name collisions, then write. Nothing touches the store
 * until the last one, and the third cannot be skipped.
 */
import {
  el, mount, chip, table, toast, field, int, num, banner, emptyState, confirmDialog
} from '../ui.js';
import { getState, LEVELS, LEVEL_LABEL , academicYearFromTerm, currentAcademicYear } from '../store.js';
import { readWorkbook, detectLayout, buildPlan, applyPlan } from '../io/import-xlsx.js';

const S = {
  workbook: null, sheetIndex: 0, layout: null,
  mapping: null, meta: null, plan: null, busy: null, done: null
};

export default function renderImport(root, ctx) {
  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Import a spreadsheet' }),
        el('p', { text: 'Read an existing gradebook — this year’s or an old one — and turn it into a course with its students and marks.' })
      ),
      el('div', { class: 'spacer' }),
      S.workbook ? el('button', { text: 'Start over', onClick: () => { reset(); renderImport(root, ctx); } }) : null
    ),
    S.done ? doneCard(root, ctx)
      : !S.workbook ? pickFile(root, ctx)
      : el('div', {}, sheetPicker(root, ctx), mappingCard(root, ctx), metaCard(root, ctx), planCard(root, ctx))
  );
}

function reset() {
  Object.assign(S, { workbook: null, sheetIndex: 0, layout: null, mapping: null, meta: null, plan: null, busy: null, done: null });
}

/* ------------------------------------------------------------- step 1 */

function pickFile(root, ctx) {
  const drop = el('div', { class: 'dropzone' },
    el('strong', { text: 'Drop a spreadsheet here' }),
    el('p', { class: 'hint', text: '.xlsx, .xlsm or .csv. Read in this browser — nothing is uploaded.' }),
    el('input', { type: 'file', id: 'import-file', accept: '.xlsx,.xlsm,.xls,.csv', style: 'display:none', onChange: (e) => e.target.files[0] && load(e.target.files[0], root, ctx) }),
    el('button', { class: 'primary', text: 'Choose file', onClick: () => document.getElementById('import-file').click() })
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0], root, ctx);
  });

  return el('div', { class: 'card' },
    drop,
    S.busy ? el('p', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null,
    el('p', { class: 'hint', style: 'margin-top:14px', text: 'It copes with headers part-way down the sheet, columns named in Turkish or English, and a totals row at the bottom. Whatever it guesses, you confirm before anything is written.' })
  );
}

async function load(file, root, ctx) {
  S.busy = `Reading ${file.name}…`;
  renderImport(root, ctx);
  try {
    S.workbook = await readWorkbook(file);
    S.sheetIndex = 0;
    analyseSheet();
  } catch (err) {
    toast(err.message, 'error');
    S.workbook = null;
  }
  S.busy = null;
  renderImport(root, ctx);
}

const GENERIC_SHEET = /^(sheet|page|sayfa|tablo|table|worksheet|data|list|liste|export|rapor|report)\s*\d*$/i;

function analyseSheet() {
  const sheet = S.workbook.sheets[S.sheetIndex];
  S.layout = detectLayout(sheet.rows);
  S.mapping = {
    nameCol: S.layout.nameCol,
    firstNameCol: S.layout.firstNameCol,
    lastNameCol: S.layout.lastNameCol,
    numberCol: S.layout.numberCol,
    levelCol: S.layout.levelCol,
    emailCol: S.layout.emailCol,
    classYearCol: S.layout.classYearCol,
    totalCol: S.layout.totalCol,
    letterCol: S.layout.letterCol,
    statusCol: S.layout.statusCol,
    gradeCols: [...S.layout.gradeCols],
    maxScorePerColumn: {}
  };
  const guessedYear = (S.workbook.filename.match(/(20\d\d)/) || sheet.name.match(/(20\d\d)/) || [])[1] || '';
  S.meta = {
    /* A sheet called "Page 1" or "Sheet1" names the export, not the course;
       the filename is the better guess in that case. */
    title: sheet.name && !GENERIC_SHEET.test(sheet.name.trim())
      ? sheet.name
      : S.workbook.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
    code: '',
    level: 'undergraduate',
    term: guessedYear ? `Fall ${guessedYear}` : getState().settings.defaultTerm,
    year: guessedYear,
    /* A sheet from 2023 belongs in 2023-2024, not in whatever year the
       workbench happens to be showing. Guess from the sheet, fall back to
       the active year. */
    academicYear: guessedYear ? academicYearFromTerm(`Fall ${guessedYear}`) : getState().settings.activeYear
  };
  rebuildPlan();
}

const hasName = (m) =>
  Boolean(m) && ((m.nameCol !== null && m.nameCol !== undefined) ||
                 (m.firstNameCol !== null && m.firstNameCol !== undefined));

function rebuildPlan() {
  if (!S.layout || !hasName(S.mapping)) { S.plan = null; return; }
  S.plan = buildPlan(S.layout, S.mapping, S.meta, getState().students);
  S.plan.sourceName = S.workbook.filename;
}

/* ------------------------------------------------------------- step 2 */

function sheetPicker(root, ctx) {
  if (S.workbook.sheets.length < 2) return null;
  return el('div', { class: 'card' },
    el('h2', { text: 'Which sheet?' }),
    el('div', { class: 'row tight' },
      S.workbook.sheets.map((sh, i) => el('button', {
        class: i === S.sheetIndex ? 'primary sm' : 'sm',
        text: `${sh.name} (${sh.rows.length} rows)`,
        onClick: () => { S.sheetIndex = i; analyseSheet(); renderImport(root, ctx); }
      }))
    )
  );
}

function mappingCard(root, ctx) {
  const L = S.layout;
  const SINGLE = {
    name: 'nameCol', firstName: 'firstNameCol', lastName: 'lastNameCol',
    number: 'numberCol', level: 'levelCol', email: 'emailCol',
    classYear: 'classYearCol', total: 'totalCol', letter: 'letterCol', status: 'statusCol'
  };
  const roleFor = (idx) => {
    const hit = Object.entries(SINGLE).find(([, key]) => S.mapping[key] === idx);
    if (hit) return hit[0];
    if (S.mapping.gradeCols.includes(idx)) return 'grade';
    return 'ignore';
  };
  const setRole = (idx, role) => {
    Object.values(SINGLE).forEach((k) => { if (S.mapping[k] === idx) S.mapping[k] = null; });
    S.mapping.gradeCols = S.mapping.gradeCols.filter((x) => x !== idx);
    if (SINGLE[role]) S.mapping[SINGLE[role]] = idx;
    else if (role === 'grade') S.mapping.gradeCols = [...S.mapping.gradeCols, idx].sort((a, b) => a - b);
    rebuildPlan();
    renderImport(root, ctx);
  };

  const ROLE_OPTIONS = [
    ['ignore', 'ignore'],
    ['name', 'Full name'],
    ['firstName', 'First name'],
    ['lastName', 'Surname'],
    ['number', 'Student no.'],
    ['classYear', 'Year of study'],
    ['grade', 'A mark'],
    ['total', 'Recorded total'],
    ['letter', 'Letter grade'],
    ['status', 'Pass / fail'],
    ['level', 'Level'],
    ['email', 'Email']
  ];

  return el('div', { class: 'card' },
    el('h2', { text: 'What is in each column?' }),
    el('p', { text: `Header taken from row ${L.headerRow + 1}. The guesses below are usually right; correct anything that is not.` }),
    L.sectionCode
      ? el('p', { class: 'hint', text: `Every column ends in “${L.sectionCode}”. That is the section code, not part of any column name, so it has been removed — components are named “Vize”, not “Vize(%20)${L.sectionCode}”.` })
      : null,
    hasName(S.mapping)
      ? null
      : banner('warn', 'No name column identified. Choose one below — either a full-name column, or a first-name and a surname column to join.'),
    el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { text: 'Column' }), el('th', { text: 'Header' }),
          el('th', { text: 'First values' }), el('th', { text: 'Treat as' }), el('th', { class: 'num', text: 'Out of' })
        )),
        el('tbody', {}, L.columns.map((col) => {
          const role = roleFor(col.index);
          return el('tr', {},
            el('td', { text: letter(col.index) }),
            el('td', {},
              el('div', { style: 'font-weight:600', text: col.label || col.header }),
              col.weight ? el('span', { class: 'hint', style: 'margin:0', text: `worth ${col.weight}% — from the header` }) : null
            ),
            el('td', { class: 'wrap', style: 'font-size:12px;color:var(--text-dim)', text: col.sampleValues.join(' · ') || '—' }),
            el('td', {}, el('select', {
              style: 'width:auto;min-width:120px',
              onChange: (e) => setRole(col.index, e.target.value)
            },
              ROLE_OPTIONS.map(([v, t]) => el('option', { value: v, selected: role === v, text: t }))
            )),
            el('td', { class: 'num' }, role === 'grade'
              ? el('input', {
                  class: 'grade-input', type: 'number', min: '1',
                  value: (S.plan?.components.find((c) => c.sourceIndex === col.index) || {}).maxScore || 100,
                  onChange: (e) => { S.mapping.maxScorePerColumn[col.index] = Number(e.target.value); rebuildPlan(); renderImport(root, ctx); }
                })
              : '')
          );
        }))
      )
    )
  );
}

function metaCard(root, ctx) {
  const set = (k) => (e) => { S.meta[k] = e.target.value; rebuildPlan(); };
  return el('div', { class: 'card' },
    el('h2', { text: 'The course this becomes' }),
    el('div', { class: 'grid cols-3' },
      field('Title', el('input', { value: S.meta.title, onChange: set('title') })),
      field('Code', el('input', { value: S.meta.code, placeholder: 'ELIT 341', onChange: set('code') })),
      field('Level', el('select', { onChange: (e) => { S.meta.level = e.target.value; rebuildPlan(); renderImport(root, ctx); } },
        LEVELS.map((l) => el('option', { value: l.id, text: l.label, selected: l.id === S.meta.level })))),
      field('Term', el('input', { value: S.meta.term, onChange: set('term') })),
      field('Academic year', el('input', { value: S.meta.academicYear, placeholder: currentAcademicYear(), onChange: set('academicYear') }),
        'The course is filed under this. Import an old gradebook and set the year it belongs to, then archive it in one go from the Courses tab.')
    )
  );
}

/* ------------------------------------------------------------- step 3 */

function planCard(root, ctx) {
  if (!S.plan) return el('div', { class: 'card' }, el('p', { class: 'hint', text: 'Choose a name column to see what would be imported.' }));
  const p = S.plan;
  const unresolved = p.students.filter((s) => !s.resolution);

  return el('div', {},
    el('div', { class: 'grid cols-4', style: 'margin-bottom:16px' },
      statTile('New students', int(p.summary.newStudents)),
      statTile('Linked to existing', int(p.summary.matchedStudents)),
      statTile('Marks', int(p.summary.marks), `${p.summary.components} component(s)`),
      statTile('Need a decision', int(unresolved.length), unresolved.length ? 'import is blocked' : 'none', unresolved.length ? 'high' : 'good')
    ),

    p.conflicts.length ? conflictCard(root, ctx) : null,

    componentsCard(p),
    p.check ? checkCard(p.check) : null,

    p.skipped.length
      ? el('div', { class: 'card' },
          el('h2', { text: `Rows skipped (${p.skipped.length})` }),
          el('p', { class: 'hint', text: p.skipped.map((s) => `row ${s.row + 1}: ${s.reason}`).join(' · ') })
        )
      : null,

    el('div', { class: 'card' },
      el('h2', { text: 'Preview' }),
      table(['Student', 'No.', 'Status', ...p.components.map((c) => `${c.name} /${c.maxScore}`)],
        p.students.slice(0, 25).map((row) => [
          row.name,
          row.studentNo || '—',
          el('td', {}, row.resolution === 'new' ? chip('new', 'good')
            : row.resolution ? chip('existing', 'accent')
            : chip('undecided', 'high')),
          ...p.components.map((c) => el('td', { class: 'num', text: Number.isFinite(row.scores[c.id]) ? String(row.scores[c.id]) : '—' }))
        ])),
      p.students.length > 25 ? el('p', { class: 'hint', text: `…and ${p.students.length - 25} more rows.` }) : null
    ),

    el('div', { class: 'card' },
      unresolved.length
        ? banner('warn', `${unresolved.length} row(s) share a name with someone already on your roster. Decide each one above before importing — the app will not guess.`)
        : banner('info', `Ready: ${p.summary.newStudents} new student(s), ${p.summary.matchedStudents} linked, ${p.summary.marks} mark(s) into a new course “${S.meta.title}”.`),
      el('button', {
        class: 'primary',
        disabled: Boolean(unresolved.length) || !p.students.length,
        text: `Import ${p.students.length} row(s)`,
        onClick: () => doImport(root, ctx)
      })
    )
  );
}

/*
 * The decision the instructor must make by hand. Each conflicting row is
 * shown next to the people it might be, with the differences visible, and
 * defaults to nothing.
 */
function conflictCard(root, ctx) {
  return el('div', { class: 'card', style: 'border-color:var(--high)' },
    el('h2', { text: `Same name already on your roster (${S.plan.conflicts.length})` }),
    el('p', { text: 'A name is not an identifier — two students can share one. Nothing is merged unless you say so. Where the student number matches, the link was made automatically and is not listed here.' }),
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      el('span', { class: 'hint', text: 'If they are all the same situation:' }),
      el('button', {
        class: 'sm',
        title: 'Every conflicting row becomes a new student record',
        text: 'All are new people',
        onClick: () => { S.plan.conflicts.forEach((r) => { r.resolution = 'new'; }); recount(); renderImport(root, ctx); }
      }),
      el('button', {
        class: 'sm',
        title: 'Every conflicting row is linked to the existing student of the same name',
        text: 'All are the same people',
        onClick: async () => {
          if (await confirmDialog('Link every conflict by name?',
            `This attaches ${S.plan.conflicts.length} imported row(s) to existing students matched on name alone. If two of your students genuinely share a name, one will receive the other's marks. Only do this if you have checked the list.`,
            'Link them all')) {
            S.plan.conflicts.forEach((r) => {
              if (r.conflict.candidates.length === 1) r.resolution = r.conflict.candidates[0].id;
            });
            recount();
            renderImport(root, ctx);
          }
        }
      }),
      el('button', { class: 'ghost sm', text: 'Clear decisions', onClick: () => { S.plan.conflicts.forEach((r) => { r.resolution = null; }); recount(); renderImport(root, ctx); } })
    ),
    S.plan.conflicts.map((row, idx) => {
      const options = [
        { id: 'new', label: `Add as a NEW student${row.studentNo ? ` (no. ${row.studentNo})` : ''}`, sub: 'They are a different person who happens to share the name' },
        ...row.conflict.candidates.map((c) => ({
          id: c.id,
          label: `Same person as ${c.name}`,
          sub: [c.studentNo && `no. ${c.studentNo}`, LEVEL_LABEL[c.level], c.programme, c.year].filter(Boolean).join(' · ') || 'no other details on file'
        }))
      ];
      return el('div', { class: 'finding', dataset: { conflict: String(idx) }, style: `border-left-color:${row.resolution ? 'var(--good)' : 'var(--high)'}` },
        el('div', { class: 'top' },
          el('strong', { text: row.name }),
          row.studentNo ? chip(`no. ${row.studentNo}`) : chip('no number in the sheet', 'medium'),
          chip(row.conflict.reason === 'number-name-mismatch' ? 'number matches, name differs'
            : row.conflict.reason === 'several-same-name' ? 'several people share this name'
            : 'name already on the roster', 'high')
        ),
        el('div', { style: 'margin-top:8px' },
          options.map((o) => el('label', { class: 'inline', style: 'align-items:flex-start' },
            el('input', {
              type: 'radio',
              name: `conflict-${idx}`,
              checked: row.resolution === o.id,
              /* Deliberately does NOT re-render: rebuilding the view on every
                 radio would detach the remaining inputs mid-interaction and
                 throw away the scroll position half-way down a long list. */
              onChange: () => { row.resolution = o.id; recount(); refreshDecisionState(root); }
            }),
            el('span', {}, o.label, el('small', { style: 'display:block;color:var(--text-faint)', text: o.sub }))
          ))
        )
      );
    })
  );
}

/*
 * Update only what a decision changes: the tiles, the import button and the
 * colour of each conflict card. Everything else on the page is unaffected.
 */
function refreshDecisionState(root) {
  const p = S.plan;
  const undecided = p.summary.undecided;

  const tiles = root.querySelectorAll('.stat');
  if (tiles[0]) tiles[0].querySelector('.value').textContent = String(p.summary.newStudents);
  if (tiles[1]) tiles[1].querySelector('.value').textContent = String(p.summary.matchedStudents);
  if (tiles[3]) {
    tiles[3].querySelector('.value').textContent = String(undecided);
    tiles[3].querySelector('.sub').textContent = undecided ? 'import is blocked' : 'none';
    tiles[3].className = `stat ${undecided ? 'high' : 'good'}`;
  }

  p.conflicts.forEach((row, i) => {
    const card = root.querySelector(`.finding[data-conflict="${i}"]`);
    if (card) card.style.borderLeftColor = row.resolution ? 'var(--good)' : 'var(--high)';
  });

  const btn = [...root.querySelectorAll('button.primary')].find((b) => /^Import \d/.test(b.textContent));
  if (btn) btn.disabled = Boolean(undecided) || !p.students.length;

  const banner = root.querySelector('.card .banner.warn, .card .banner.info');
  if (banner) {
    banner.className = `banner ${undecided ? 'warn' : 'info'}`;
    banner.textContent = undecided
      ? `${undecided} row(s) share a name with someone already on your roster. Decide each one above before importing — the app will not guess.`
      : `Ready: ${p.summary.newStudents} new student(s), ${p.summary.matchedStudents} linked, ${p.summary.marks} mark(s) into a new course “${S.meta.title}”.`;
  }
}

function recount() {
  const p = S.plan;
  p.needsDecision = p.students.some((s) => !s.resolution);
  p.summary.newStudents = p.students.filter((s) => s.resolution === 'new').length;
  p.summary.matchedStudents = p.students.filter((s) => s.resolution && s.resolution !== 'new').length;
  p.summary.undecided = p.students.filter((s) => !s.resolution).length;
}

async function doImport(root, ctx) {
  const p = S.plan;
  const ok = await confirmDialog(
    'Import now?',
    `This creates the course “${S.meta.title}”, adds ${p.summary.newStudents} student(s), links ${p.summary.matchedStudents} to existing records, and records ${p.summary.marks} mark(s). You can delete the course afterwards, but the students it adds will remain.`,
    'Import'
  );
  if (!ok) return;
  try {
    S.done = applyPlan(p);
    toast('Import complete.', 'good');
  } catch (err) {
    toast(err.message, 'error');
  }
  renderImport(root, ctx);
}

function doneCard(root, ctx) {
  return el('div', { class: 'card' },
    emptyState('Imported',
      `${S.done.students} new student(s), ${S.done.linked} linked to existing records, ${S.done.marks} mark(s) recorded.`,
      el('div', { class: 'row', style: 'justify-content:center' },
        el('button', { class: 'primary', text: 'Open the gradebook', onClick: () => ctx.go('gradebook') }),
        el('button', { text: 'Import another', onClick: () => { reset(); renderImport(root, ctx); } })
      ))
  );
}

const statTile = (l, v, s, tone) => el('div', { class: `stat${tone ? ` ${tone}` : ''}` },
  el('div', { class: 'label', text: l }), el('div', { class: 'value', text: v }), s ? el('div', { class: 'sub', text: s }) : null);

const letter = (i) => {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

/*
 * What the course will actually be marked out of. Shown before the import,
 * because a wrong weight is invisible afterwards — every total is simply a
 * little off, and nothing announces it.
 */
function componentsCard(p) {
  const total = p.components.filter((c) => !c.resitFor).reduce((n, c) => n + (Number(c.weight) || 0), 0);
  const nameOf = (id) => (p.components.find((c) => c.id === id) || {}).name || '';
  return el('div', { class: 'card' },
    el('h2', { text: 'Components and weights' }),
    table(
      ['Component', { label: 'Weight', num: true }, { label: 'Out of', num: true }, 'Where the weight came from'],
      p.components.map((c) => [
        c.name,
        c.resitFor ? '—' : `${c.weight}%`,
        String(c.maxScore),
        c.resitFor
          ? `Resit for ${nameOf(c.resitFor)} — the better of the two marks counts, so it carries no weight of its own`
          : c.weightFromHeader ? 'the column header' : 'split evenly, because no header declared one'
      ]),
      { footer: [['Total', `${Math.round(total * 10) / 10}%`, '', '']] }
    ),
    Math.abs(total - 100) > 0.5
      ? banner('warn', `These weights add up to ${Math.round(total * 10) / 10}%, not 100%. Import anyway if that is right for this course; otherwise fix the columns above.`)
      : null
  );
}

/*
 * The sheet brought its own answer with it. Recomputing it and comparing is
 * the only check available that the weights, the resit rule and the mark
 * columns were all read correctly — and it checks against the instructor's
 * own data rather than against an assumption.
 */
function checkCard(check) {
  const all = check.agreed === check.checked;
  return el('div', { class: 'card' },
    el('h2', { text: 'Checked against the totals already in the sheet' }),
    all
      ? banner('privacy', `All ${check.checked} recorded totals match what the app computes from the columns above. The weights and the resit rule were read correctly.`)
      : banner('warn', `${check.agreed} of ${check.checked} recorded totals match. ${check.checked - check.agreed} do not — listed below.`),
    all ? null : el('p', { class: 'hint', text: 'A difference is usually a mark entered by hand over the formula, which is yours to keep. It can also mean a weight was read wrongly, in which case correct it above. Nothing here is changed either way — the marks import exactly as the sheet has them.' }),
    all ? null : table(
      ['Student', 'No.', { label: 'Sheet says', num: true }, { label: 'Computed', num: true }],
      check.differences.map((d) => [d.name, d.studentNo || '—', String(d.recorded), String(d.computed)])
    ),
    !all && check.moreDifferences ? el('p', { class: 'hint', text: `…and ${check.moreDifferences} more.` }) : null
  );
}
