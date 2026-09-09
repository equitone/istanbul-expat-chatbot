import { el, mount, chip, num, int, emptyState, toast, otherYearsNotice } from '../ui.js';
import { compareBySurname, listName } from '../turkish.js';
import { getState, LEVEL_LABEL, setScore , activeCourses, setActiveYear } from '../store.js';
import { courseTotal, describe, toLetter, rank } from '../stats.js';
import { exportTableCsv } from '../export/workbook.js';
import { gradebookRows } from '../export/workbook.js';

let selectedId = null;

export default function renderGradebook(root, ctx) {
  const s = getState();
    /* Choose from this year's live courses; last year's are archived out of the
     way, not deleted, and are still reachable from the Courses tab. */
  const courses = activeCourses();
  if (!courses.some((c) => c.id === selectedId)) selectedId = courses[0] ? courses[0].id : null;
  const course = s.courses.find((c) => c.id === selectedId);

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Gradebook' }),
        el('p', { text: 'Type marks straight into the grid. Totals, letters and ranks update as you go, and blanks are treated as not-yet-marked rather than zero.' })
      ),
      el('div', { class: 'spacer' }),
      courses.length ? el('select', {
        style: 'width:auto;min-width:230px',
        onChange: (e) => { selectedId = e.target.value; renderGradebook(root, ctx); }
      }, courses.map((c) => el('option', { value: c.id, selected: c.id === selectedId, text: `${c.code ? `${c.code} — ` : ''}${c.title} (${LEVEL_LABEL[c.level]})` }))) : null,
      course ? el('button', { text: 'Export this sheet', onClick: () => {
        exportTableCsv(course.code || course.title, gradebookRows(getState(), course));
        toast('CSV downloaded.', 'good');
      } }) : null
    ),
    otherYearsNotice(s, (y) => { setActiveYear(y); selectedId = null; renderGradebook(root, ctx); }),
    !courses.length
      ? emptyState('No courses yet', 'Create a course and enrol students, then come back here to enter marks.',
          el('button', { class: 'primary', text: 'Go to Courses', onClick: () => ctx.go('courses') }))
      : !course.enrolled.length
        ? emptyState('Nobody enrolled', `“${course.title}” has no students yet.`,
            el('button', { class: 'primary', text: 'Manage enrolment', onClick: () => ctx.go('courses') }))
        : grid(course, s, root, ctx)
  );
}

function grid(course, s, root, ctx) {
  const comps = course.components;
  const students = course.enrolled
    .map((id) => s.students.find((x) => x.id === id))
    .filter(Boolean)
    .sort(compareBySurname);

  const rows = students.map((st) => {
    const scores = (s.scores[course.id] || {})[st.id] || {};
    return { st, scores, total: courseTotal(scores, comps) };
  });
  const finals = rows.map((r) => r.total.absolute);
  const stats = describe(finals);
  const ranks = rank(finals);

  /* Live recalculation without a full re-render, so focus is never stolen
     mid-typing. Only the row's own derived cells change. */
  const recalc = (rowIndex, tr) => {
    const fresh = getState();
    const scores = (fresh.scores[course.id] || {})[rows[rowIndex].st.id] || {};
    const total = courseTotal(scores, comps);
    const letter = toLetter(total.absolute, fresh.settings.letterScheme);
    tr.querySelector('[data-cell="total"]').textContent = num(total.absolute);
    tr.querySelector('[data-cell="running"]').textContent = num(total.running);
    const lc = tr.querySelector('[data-cell="letter"]');
    lc.textContent = letter ? letter.letter : '—';
    lc.className = 'num';
    const status = tr.querySelector('[data-cell="status"]');
    status.textContent = total.complete ? 'Complete' : `${total.missing.length} left`;
  };

  const body = el('tbody', {}, rows.map((r, i) => {
    const letter = toLetter(r.total.absolute, s.settings.letterScheme);
    const tr = el('tr', {},
      el('td', { style: 'font-weight:600', title: r.st.name, text: listName(r.st) }),
      el('td', { text: r.st.studentNo || '—' }),
      comps.map((c) => el('td', { class: 'num' }, el('input', {
        class: `grade-input${Number.isFinite(r.scores[c.id]) ? ' filled' : ''}`,
        type: 'number', min: '0', max: String(c.maxScore), step: 'any',
        value: Number.isFinite(r.scores[c.id]) ? r.scores[c.id] : '',
        placeholder: '–',
        title: `${c.name} — out of ${c.maxScore}`,
        onInput: (e) => {
          const v = e.target.value;
          const n = Number(v);
          const bad = v !== '' && (!Number.isFinite(n) || n < 0 || n > c.maxScore);
          e.target.classList.toggle('invalid', bad);
          e.target.classList.toggle('filled', !bad && v !== '');
          if (bad) return;
          setScore(course.id, r.st.id, c.id, v === '' ? null : n);
          recalc(i, tr);
        },
        onKeyDown: (e) => moveFocus(e)
      }))),
      el('td', { class: 'num', dataset: { cell: 'total' }, style: 'font-weight:700', text: num(r.total.absolute) }),
      el('td', { class: 'num', dataset: { cell: 'running' }, text: num(r.total.running) }),
      el('td', { class: 'num', dataset: { cell: 'letter' }, text: letter ? letter.letter : '—' }),
      el('td', { class: 'num', text: ranks[i] ?? '—' }),
      el('td', { dataset: { cell: 'status' }, text: r.total.complete ? 'Complete' : `${r.total.missing.length} left` })
    );
    return tr;
  }));

  const header = el('thead', {}, el('tr', {},
    el('th', { text: 'Student' }),
    el('th', { text: 'No.' }),
    comps.map((c) => el('th', { class: 'num', title: `${c.weight}% of the final mark`, text: `${c.name} /${c.maxScore}` })),
    el('th', { class: 'num', text: 'Final' }),
    el('th', { class: 'num', title: 'Score on the weight graded so far — the mid-semester figure', text: 'Running' }),
    el('th', { class: 'num', text: 'Letter' }),
    el('th', { class: 'num', text: 'Rank' }),
    el('th', { text: 'Status' })
  ));

  const foot = el('tfoot', {}, el('tr', {},
    el('td', { text: 'Class mean' }),
    el('td', { text: '' }),
    comps.map((c) => el('td', { class: 'num', text: num(describe(rows.map((r) => r.scores[c.id])).mean) })),
    el('td', { class: 'num', text: num(stats.mean) }),
    el('td', { colSpan: 4, text: `σ ${num(stats.stdev)} · n ${stats.n}` })
  ));

  return el('div', {},
    el('div', { class: 'row', style: 'margin-bottom:10px' },
      chip(`${students.length} enrolled`, 'accent'),
      chip(`${rows.filter((r) => r.total.complete).length} complete`),
      chip(`weights ${num(comps.reduce((n, c) => n + Number(c.weight || 0), 0))}%`),
      el('span', { class: 'hint', style: 'margin-left:6px', text: 'Enter or ↓ moves down a row · ↑ moves up' })
    ),
    el('div', { class: 'table-wrap' }, el('table', {}, header, body, foot))
  );
}

/* Spreadsheet-style vertical navigation: the whole point of a grid is that
   you can key down a column without touching the mouse. */
function moveFocus(e) {
  if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const cell = e.target.closest('td');
  const row = e.target.closest('tr');
  if (!cell || !row) return;
  const colIndex = [...row.children].indexOf(cell);
  const target = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
  if (!target) return;
  const next = target.children[colIndex] && target.children[colIndex].querySelector('input');
  if (next) { e.preventDefault(); next.focus(); next.select(); }
}
