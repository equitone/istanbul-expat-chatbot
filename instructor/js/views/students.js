import { el, mount, table, chip, field, toast, confirmDialog, int, emptyState } from '../ui.js';
import { getState, LEVELS, LEVEL_LABEL, addStudent, updateStudent, removeStudent } from '../store.js';

let filter = 'all';

export default function renderStudents(root) {
  const s = getState();
  const list = filter === 'all' ? s.students : s.students.filter((x) => x.level === filter);

  const form = el('form', { class: 'card', onSubmit: (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!String(data.name).trim()) { toast('A name is required.', 'error'); return; }
    addStudent(data);
    e.target.reset();
    toast('Student added.', 'good');
  } },
    el('h2', { text: 'Add a student' }),
    el('div', { class: 'grid cols-3' },
      field('Full name', el('input', { name: 'name', required: true, placeholder: 'Ayşe Yılmaz' })),
      field('Student number', el('input', { name: 'studentNo', placeholder: '20211234' })),
      field('Level', el('select', { name: 'level' }, LEVELS.map((l) => el('option', { value: l.id, text: l.label })))),
      field('Programme', el('input', { name: 'programme', placeholder: 'Comparative Literature' })),
      field('Email', el('input', { name: 'email', type: 'email', placeholder: 'optional' }))
    ),
    el('button', { class: 'primary', type: 'submit', text: 'Add student' })
  );

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Students' }),
        el('p', { text: 'One roster across all three levels. A student can be enrolled in any number of courses.' })
      ),
      el('div', { class: 'spacer' }),
      el('div', { class: 'row tight' },
        el('button', { class: filter === 'all' ? 'primary sm' : 'sm', text: `All (${s.students.length})`, onClick: () => { filter = 'all'; renderStudents(root); } }),
        LEVELS.map((l) => el('button', {
          class: filter === l.id ? 'primary sm' : 'sm',
          text: `${l.label} (${s.students.filter((x) => x.level === l.id).length})`,
          onClick: () => { filter = l.id; renderStudents(root); }
        }))
      )
    ),
    form,
    list.length
      ? table(['Name', 'No.', 'Level', 'Programme', 'Email', { label: 'Courses', num: true }, { label: 'Theses', num: true }, ''],
          list.map((st) => [
            el('td', {}, el('input', {
              value: st.name, style: 'border:0;background:none;padding:2px 0;font-weight:600',
              onChange: (e) => updateStudent(st.id, { name: e.target.value.trim() })
            })),
            st.studentNo || '—',
            el('td', {}, chip(LEVEL_LABEL[st.level], st.level === 'undergraduate' ? 'ug' : st.level === 'masters' ? 'ma' : 'phd')),
            st.programme || '—',
            st.email || '—',
            el('td', { class: 'num', text: int(s.courses.filter((c) => c.enrolled.includes(st.id)).length) }),
            el('td', { class: 'num', text: int(s.theses.filter((t) => t.studentId === st.id).length) }),
            el('td', {}, el('button', {
              class: 'ghost sm', text: 'Remove', title: 'Removes the student, their marks and their thesis reviews',
              onClick: async () => {
                if (await confirmDialog('Remove student?', `This deletes ${st.name}, every mark recorded for them, and any thesis reviews. It cannot be undone.`, 'Remove')) {
                  removeStudent(st.id);
                  toast('Student removed.');
                }
              }
            }))
          ]))
      : emptyState('No students in this view', filter === 'all' ? 'Add your first student with the form above.' : 'No students at this level yet.')
  );
}
