/*
 * students.js — one roster across all three levels, viewed a cohort at a time.
 *
 * A department's whole student body in one flat list is unusable by the second
 * year, so level and academic year are both filters and the default view is
 * grouped rather than flat.
 */
import { el, mount, table, chip, field, toast, confirmDialog, int, emptyState } from '../ui.js';
import { getState, LEVELS, LEVEL_LABEL, addStudent, updateStudent, removeStudent } from '../store.js';

const S = { level: 'all', year: 'all', course: 'all', search: '', grouped: true };

export default function renderStudents(root, ctx) {
  const s = getState();
  const all = s.students;

  /* Years actually present, newest first, plus a bucket for records that
     predate the year field or came from a sheet without one. */
  const years = [...new Set(all.map((x) => String(x.year || '').trim()).filter(Boolean))].sort().reverse();
  const anyUnset = all.some((x) => !String(x.year || '').trim());

  /* Enrolment is held on the course, so the lookup is built once per render
     rather than scanned per student per course. */
  const courses = s.courses;
  const enrolledIn = new Map(courses.map((c) => [c.id, new Set(c.enrolled || [])]));
  const anyUnenrolled = all.some((st) => !courses.some((c) => enrolledIn.get(c.id).has(st.id)));

  const matches = (st) => {
    if (S.level !== 'all' && st.level !== S.level) return false;
    if (S.course === 'none' && courses.some((c) => enrolledIn.get(c.id).has(st.id))) return false;
    if (S.course !== 'all' && S.course !== 'none') {
      const set = enrolledIn.get(S.course);
      if (!set || !set.has(st.id)) return false;
    }
    const y = String(st.year || '').trim();
    if (S.year === 'none' && y) return false;
    if (S.year !== 'all' && S.year !== 'none' && y !== S.year) return false;
    if (S.search) {
      const q = S.search.toLowerCase();
      if (![st.name, st.studentNo, st.programme, st.email].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    }
    return true;
  };
  const shown = all.filter(matches);

  const filterBtn = (key, value, label, count) => el('button', {
    class: S[key] === value ? 'primary sm' : 'sm',
    'aria-pressed': String(S[key] === value),
    text: count === undefined ? label : `${label} (${count})`,
    onClick: () => { S[key] = value; renderStudents(root, ctx); }
  });

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Students' }),
        el('p', { text: 'Everyone you teach, filtered by course, level and academic year rather than shown all at once.' })
      ),
      el('div', { class: 'spacer' }),
      el('input', {
        placeholder: 'Search name, number, programme…',
        value: S.search,
        style: 'width:250px',
        onInput: (e) => {
          S.search = e.target.value;
          const box = document.activeElement;
          renderStudents(root, ctx);
          /* Re-focus and restore the caret: the view is rebuilt on each
             keystroke and would otherwise drop focus after one letter. */
          const next = root.querySelector('input[placeholder^="Search"]');
          if (next && box) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
        }
      })
    ),

    el('div', { class: 'legend' },
      el('span', { class: 'legend-label', text: 'Level' }),
      filterBtn('level', 'all', 'All', all.length),
      LEVELS.map((l) => filterBtn('level', l.id, l.label, all.filter((x) => x.level === l.id).length))
    ),

    courses.length
      ? el('div', { class: 'legend' },
          el('span', { class: 'legend-label', text: 'Course' }),
          filterBtn('course', 'all', 'All courses'),
          courses.map((c) => filterBtn('course', c.id, c.code ? `${c.code} — ${c.title}` : c.title, (c.enrolled || []).length)),
          anyUnenrolled ? filterBtn('course', 'none', 'Not on any course', all.filter((st) => !courses.some((c) => enrolledIn.get(c.id).has(st.id))).length) : null
        )
      : null,

    years.length || anyUnset
      ? el('div', { class: 'legend' },
          el('span', { class: 'legend-label', text: 'Year' }),
          filterBtn('year', 'all', 'All years'),
          years.map((y) => filterBtn('year', y, y, all.filter((x) => String(x.year || '').trim() === y).length)),
          anyUnset ? filterBtn('year', 'none', 'No year set', all.filter((x) => !String(x.year || '').trim()).length) : null
        )
      : null,

    el('div', { class: 'row', style: 'margin:4px 0 14px' },
      el('span', { class: 'hint', text: `Showing ${shown.length} of ${all.length}.` }),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'sm',
        text: S.grouped ? 'Show as one list' : 'Group by level and year',
        onClick: () => { S.grouped = !S.grouped; renderStudents(root, ctx); }
      })
    ),

    addForm(),

    !all.length
      ? emptyState('No students yet', 'Add them with the form above, or bring a previous year in from a spreadsheet.',
          el('button', { class: 'primary', text: 'Import a spreadsheet', onClick: () => ctx.go('import') }))
      : !shown.length
        ? emptyState('Nothing matches', 'No student matches these filters.')
        : S.grouped ? groupedView(shown, s, root, ctx) : rosterTable(shown, s, root, ctx)
  );
}

/* Group by level, then by year within it, newest year first. */
function groupedView(shown, s, root, ctx) {
  const groups = [];
  LEVELS.forEach((lvl) => {
    const inLevel = shown.filter((x) => x.level === lvl.id);
    if (!inLevel.length) return;
    const years = [...new Set(inLevel.map((x) => String(x.year || '').trim()))]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)));
    years.forEach((y) => {
      groups.push({
        level: lvl,
        year: y,
        students: inLevel.filter((x) => String(x.year || '').trim() === y)
      });
    });
  });

  return el('div', {}, groups.map((g) => el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:10px' },
      chip(g.level.label, g.level.id === 'undergraduate' ? 'ug' : g.level.id === 'masters' ? 'ma' : 'phd'),
      chip(g.year || 'no year set', g.year ? 'accent' : ''),
      el('span', { class: 'hint', text: `${g.students.length} student${g.students.length === 1 ? '' : 's'}` })
    ),
    rosterTable(g.students, s, root, ctx, { compact: true })
  )));
}

function rosterTable(list, s, root, ctx, { compact = false } = {}) {
  /* Year of study comes in from university exports ("Snf": 2, 3, 4) and is
     only worth a column where some record actually carries one — otherwise it
     is an empty column on every roster that was typed in by hand. */
  const anyClassYear = s.students.some((st) => String(st.classYear || '').trim());
  const headers = ['Name', 'No.', ...(compact ? [] : ['Level']),
    ...(anyClassYear ? [{ label: 'Class', num: true }] : []),
    'Year', 'Programme', { label: 'Courses', num: true }, { label: 'Theses', num: true }, ''];
  return table(headers, [...list].sort((a, b) => a.name.localeCompare(b.name)).map((st) => [
    el('td', {}, el('input', {
      value: st.name, style: 'border:0;background:none;padding:2px 0;font-weight:600',
      onChange: (e) => updateStudent(st.id, { name: e.target.value.trim() })
    })),
    el('td', {}, el('input', {
      value: st.studentNo || '', placeholder: '—', style: 'border:0;background:none;padding:2px 0;width:100px',
      onChange: (e) => updateStudent(st.id, { studentNo: e.target.value.trim() })
    })),
    ...(compact ? [] : [el('td', {}, chip(LEVEL_LABEL[st.level], st.level === 'undergraduate' ? 'ug' : st.level === 'masters' ? 'ma' : 'phd'))]),
    ...(anyClassYear ? [el('td', { class: 'num' }, el('input', {
      value: st.classYear || '', placeholder: '—', style: 'border:0;background:none;padding:2px 0;width:44px;text-align:right',
      onChange: (e) => updateStudent(st.id, { classYear: e.target.value.trim() })
    }))] : []),
    el('td', {}, el('input', {
      value: st.year || '', placeholder: '—', style: 'border:0;background:none;padding:2px 0;width:64px',
      onChange: (e) => updateStudent(st.id, { year: e.target.value.trim() })
    })),
    el('td', {}, el('input', {
      value: st.programme || '', placeholder: '—', style: 'border:0;background:none;padding:2px 0',
      onChange: (e) => updateStudent(st.id, { programme: e.target.value.trim() })
    })),
    el('td', { class: 'num', text: int(s.courses.filter((c) => c.enrolled.includes(st.id)).length) }),
    el('td', { class: 'num', text: int(s.theses.filter((t) => t.studentId === st.id).length) }),
    el('td', {}, el('button', {
      class: 'ghost sm', text: 'Remove',
      onClick: async () => {
        if (await confirmDialog('Remove student?', `This deletes ${st.name}, every mark recorded for them, and any thesis reviews. It cannot be undone.`, 'Remove')) {
          removeStudent(st.id);
          toast('Student removed.');
        }
      }
    }))
  ]));
}

function addForm() {
  return el('details', { class: 'card' },
    el('summary', { style: 'cursor:pointer;font-weight:600;font-size:14px', text: 'Add a student' }),
    el('form', { style: 'margin-top:12px', onSubmit: (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      if (!String(data.name).trim()) { toast('A name is required.', 'error'); return; }
      addStudent(data);
      e.target.reset();
      toast('Student added.', 'good');
    } },
      el('div', { class: 'grid cols-3' },
        field('Full name', el('input', { name: 'name', required: true, placeholder: 'Ayşe Yılmaz' })),
        field('Student number', el('input', { name: 'studentNo', placeholder: '20211234' })),
        field('Level', el('select', { name: 'level' }, LEVELS.map((l) => el('option', { value: l.id, text: l.label })))),
        field('Academic year', el('input', { name: 'year', placeholder: '2026' })),
        field('Programme', el('input', { name: 'programme', placeholder: 'Comparative Literature' })),
        field('Email', el('input', { name: 'email', type: 'email', placeholder: 'optional' }))
      ),
      el('button', { class: 'primary', type: 'submit', text: 'Add student' })
    )
  );
}
