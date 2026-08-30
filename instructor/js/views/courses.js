import { el, mount, table, chip, field, toast, confirmDialog, int, num, emptyState } from '../ui.js';
import {
  getState, LEVELS, LEVEL_LABEL, addCourse, updateCourse, removeCourse,
  addComponent, removeComponent, setEnrolment
} from '../store.js';

let selectedId = null;

export default function renderCourses(root, ctx) {
  const s = getState();
  if (!s.courses.some((c) => c.id === selectedId)) selectedId = s.courses[0] ? s.courses[0].id : null;
  const course = s.courses.find((c) => c.id === selectedId) || null;

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Courses' }),
        el('p', { text: 'A course is a level, a term, a set of weighted assessment components, and an enrolled group.' })
      ),
      el('div', { class: 'spacer' }),
      el('button', { class: 'primary', text: 'New course', onClick: () => newCourseDialog(root, ctx) })
    ),

    !s.courses.length
      ? emptyState('No courses yet', 'Create one and it arrives with a standard set of components you can rename or reweight.',
          el('button', { class: 'primary', text: 'New course', onClick: () => newCourseDialog(root, ctx) }))
      : el('div', { class: 'grid', style: 'grid-template-columns:minmax(220px,280px) minmax(0,1fr)' },
          el('div', { class: 'card', style: 'padding:8px' },
            s.courses.map((c) => el('button', {
              class: c.id === selectedId ? 'primary' : 'ghost',
              style: 'display:block;width:100%;text-align:left;margin-bottom:4px',
              onClick: () => { selectedId = c.id; renderCourses(root, ctx); }
            },
              el('div', { style: 'font-weight:600', text: c.code || c.title }),
              el('div', { style: 'font-size:11px;opacity:.75', text: `${LEVEL_LABEL[c.level]} · ${c.term} · ${c.enrolled.length} enrolled` })
            ))
          ),
          course ? courseDetail(course, s, root, ctx) : el('div')
        )
  );
}

function courseDetail(course, s, root, ctx) {
  const totalWeight = course.components.reduce((n, c) => n + (Number(c.weight) || 0), 0);
  const rerender = () => renderCourses(root, ctx);

  return el('div', {},
    el('div', { class: 'card' },
      el('h2', { text: 'Course details' }),
      el('div', { class: 'grid cols-3' },
        field('Title', el('input', { value: course.title, onChange: (e) => updateCourse(course.id, { title: e.target.value }) })),
        field('Code', el('input', { value: course.code, onChange: (e) => updateCourse(course.id, { code: e.target.value }) })),
        field('Term', el('input', { value: course.term, onChange: (e) => updateCourse(course.id, { term: e.target.value }) })),
        field('Level', el('select', { onChange: (e) => updateCourse(course.id, { level: e.target.value }) },
          LEVELS.map((l) => el('option', { value: l.id, text: l.label, selected: l.id === course.level })))),
        field('Credits', el('input', { type: 'number', min: '0', step: '0.5', value: course.credits, onChange: (e) => updateCourse(course.id, { credits: Number(e.target.value) }) }))
      ),
      el('button', { class: 'danger sm', text: 'Delete course', onClick: async () => {
        if (await confirmDialog('Delete course?', `This deletes “${course.title}” and every mark recorded in it.`, 'Delete')) {
          removeCourse(course.id);
          toast('Course deleted.');
        }
      } })
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'Assessment components' }),
      el('p', { text: 'Weights are percentages of the final mark. Max score is what the component is marked out of.' }),
      totalWeight !== 100
        ? el('div', { class: 'banner warn', text: `Weights currently total ${num(totalWeight)}%. Final marks are computed against the full 100%, so anything missing counts as unearned.` })
        : el('div', { class: 'banner info', text: 'Weights total 100%.' }),
      table(['Component', { label: 'Weight %', num: true }, { label: 'Max score', num: true }, ''],
        course.components.map((c) => [
          el('td', {}, el('input', { value: c.name, onChange: (e) => patchComponent(course.id, c.id, { name: e.target.value }) })),
          el('td', { class: 'num' }, el('input', { class: 'grade-input', type: 'number', min: '0', max: '100', value: c.weight, onChange: (e) => patchComponent(course.id, c.id, { weight: Number(e.target.value) }) })),
          el('td', { class: 'num' }, el('input', { class: 'grade-input', type: 'number', min: '1', value: c.maxScore, onChange: (e) => patchComponent(course.id, c.id, { maxScore: Number(e.target.value) }) })),
          el('td', {}, el('button', { class: 'ghost sm', text: 'Remove', onClick: async () => {
            if (await confirmDialog('Remove component?', `Marks recorded for “${c.name}” will be deleted.`, 'Remove')) removeComponent(course.id, c.id);
          } }))
        ]), { empty: 'No components yet — add one below.' }),
      el('form', { class: 'row', style: 'margin-top:12px', onSubmit: (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        if (!String(f.get('name')).trim()) return;
        addComponent(course.id, { name: f.get('name'), weight: Number(f.get('weight')), maxScore: Number(f.get('maxScore')) });
        e.target.reset();
      } },
        el('input', { name: 'name', placeholder: 'Component name', style: 'flex:2;min-width:160px' }),
        el('input', { name: 'weight', type: 'number', placeholder: 'Weight %', min: '0', max: '100', style: 'width:110px' }),
        el('input', { name: 'maxScore', type: 'number', placeholder: 'Max', min: '1', value: '100', style: 'width:90px' }),
        el('button', { type: 'submit', text: 'Add component' })
      )
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'Enrolment' }),
      el('p', { text: `Students shown are those at ${LEVEL_LABEL[course.level]} level, plus anyone already enrolled.` }),
      (() => {
        const eligible = s.students.filter((st) => st.level === course.level || course.enrolled.includes(st.id));
        if (!eligible.length) return el('p', { class: 'hint', text: 'No students at this level yet.' });
        return el('div', {},
          el('div', { class: 'row tight', style: 'margin-bottom:10px' },
            el('button', { class: 'sm', text: 'Select all', onClick: () => setEnrolment(course.id, eligible.map((x) => x.id)) }),
            el('button', { class: 'sm', text: 'Clear', onClick: () => setEnrolment(course.id, []) }),
            el('span', { class: 'hint', style: 'margin-left:8px', text: `${course.enrolled.length} of ${eligible.length} enrolled` })
          ),
          el('div', { style: 'columns:220px 3;gap:14px' },
            eligible.map((st) => el('label', { class: 'inline', style: 'break-inside:avoid' },
              el('input', {
                type: 'checkbox', checked: course.enrolled.includes(st.id),
                onChange: (e) => {
                  const next = e.target.checked
                    ? [...course.enrolled, st.id]
                    : course.enrolled.filter((x) => x !== st.id);
                  setEnrolment(course.id, next);
                }
              }),
              el('span', { text: `${st.name}${st.studentNo ? ` · ${st.studentNo}` : ''}` })
            ))
          )
        );
      })()
    )
  );
}

function patchComponent(courseId, componentId, patch) {
  const course = getState().courses.find((c) => c.id === courseId);
  if (!course) return;
  const comp = course.components.find((c) => c.id === componentId);
  if (!comp) return;
  Object.assign(comp, patch);
  updateCourse(courseId, { components: course.components });
}

function newCourseDialog(root, ctx) {
  const s = getState();
  const form = el('form', { id: 'new-course-form', onSubmit: (e) => e.preventDefault() },
    field('Title', el('input', { name: 'title', required: true, placeholder: 'Modernism and Empire' })),
    field('Code', el('input', { name: 'code', placeholder: 'CMPL 401' })),
    field('Level', el('select', { name: 'level' }, LEVELS.map((l) => el('option', { value: l.id, text: l.label })))),
    field('Term', el('input', { name: 'term', value: s.settings.defaultTerm })),
    el('p', { class: 'hint', text: 'The course starts with Participation / Midterm / Term paper / Final exam. Change them afterwards.' })
  );
  import('../ui.js').then(({ dialog }) => {
    const dlg = dialog('New course', form, [
      el('button', { text: 'Cancel', onClick: () => dlg.close() }),
      el('button', { class: 'primary', text: 'Create', onClick: () => {
        const data = Object.fromEntries(new FormData(form));
        if (!String(data.title).trim()) { toast('A title is required.', 'error'); return; }
        const c = addCourse(data);
        selectedId = c.id;
        dlg.close();
        toast('Course created.', 'good');
      } })
    ]);
  });
}
