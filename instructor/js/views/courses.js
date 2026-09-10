import { el, mount, table, chip, field, toast, confirmDialog, int, num, emptyState } from '../ui.js';
import { DAYS, nextMeeting, describeMeeting, toIso } from '../schedule.js';
import {
  getState, LEVELS, LEVEL_LABEL, addCourse, updateCourse, removeCourse,
  addComponent, removeComponent, setEnrolment, SCHEMES, schemeById, defaultSchemeFor,
  academicYears, courseCountByYear, stepYear, periodLabel,
  setActiveYear, setActiveSemester, setCourseArchived, archiveYear, currentAcademicYear,
  SEMESTERS, SEMESTER_LABEL, termLabel
} from '../store.js';
import { compare as trCompare } from '../turkish.js';

let selectedId = null;
/* Archived courses are out of the way by default and one click from being
   back. Hiding them irreversibly would be a deletion wearing a nicer word. */
let showArchived = false;

export default function renderCourses(root, ctx) {
  const s = getState();
  const year = s.settings.activeYear;
  /* Scoped to the semester as well, so the list matches the heading above it
     and matches what the planner and gradebook are showing. "Whole year"
     widens it back out. A course with no semester recorded is never hidden. */
  const sem = s.settings.activeSemester;
  const inYear = s.courses.filter((c) =>
    c.academicYear === year && (!sem || !c.semester || c.semester === sem));
  const listed = (showArchived ? inYear : inYear.filter((c) => !c.archived))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || trCompare(a.code || a.title, b.code || b.title));
  if (!listed.some((c) => c.id === selectedId)) selectedId = listed[0] ? listed[0].id : null;
  const course = s.courses.find((c) => c.id === selectedId) || null;
  const archivedCount = inYear.filter((c) => c.archived).length;

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Courses' }),
        el('p', { text: 'A course is a level, a term, a set of weighted assessment components, and an enrolled group.' })
      ),
      el('div', { class: 'spacer' }),
      el('button', { class: 'primary', text: 'New course', onClick: () => newCourseDialog(root, ctx) })
    ),

    yearBar(s, year, inYear, archivedCount, root, ctx),

    !listed.length
      ? emptyState(
          inYear.length ? `Nothing showing in ${year}` : 'No courses yet',
          inYear.length
            ? `All ${inYear.length} course(s) filed under ${year} are archived. Show them below, or switch to another year — nothing has been deleted.`
            : 'Create one and choose the assessment scheme that matches how you actually mark it.',
          inYear.length
            ? el('button', { class: 'primary', text: `Show archived (${archivedCount})`, onClick: () => { showArchived = true; renderCourses(root, ctx); } })
            : el('button', { class: 'primary', text: 'New course', onClick: () => newCourseDialog(root, ctx) }))
      : el('div', { class: 'grid', style: 'grid-template-columns:minmax(220px,280px) minmax(0,1fr)' },
          el('div', { class: 'card', style: 'padding:8px' },
            listed.map((c) => el('button', {
              class: c.id === selectedId ? 'primary' : 'ghost',
              style: `display:block;width:100%;text-align:left;margin-bottom:4px${c.archived ? ';opacity:.6' : ''}`,
              onClick: () => { selectedId = c.id; renderCourses(root, ctx); }
            },
              el('div', { style: 'font-weight:600' }, c.code || c.title, c.archived ? ' · archived' : ''),
              el('div', { style: 'font-size:11px;opacity:.75', text: `${LEVEL_LABEL[c.level]} · ${termLabel(c)} · ${c.enrolled.length} enrolled` })
            ))
          ),
          course ? courseDetail(course, s, root, ctx) : el('div')
        )
  );
}


/*
 * The year bar. Everything in the workbench is scoped to one academic year, so
 * a professor in his fourth year of using this is looking at one year's
 * courses rather than forty. Archiving is per course or per whole year, and
 * both are reversible — nothing here deletes anything.
 */
function yearBar(s, year, inYear, archivedCount, root, ctx) {
  const years = academicYears();
  const counts = courseCountByYear();
  const live = inYear.filter((c) => !c.archived).length;
  const jump = (fn) => { fn(); selectedId = null; renderCourses(root, ctx); };

  return el('div', { class: 'card', style: 'margin-bottom:14px' },
    /*
     * The heading names the period in words, because "2026-2027" alone never
     * says which half of the year is on screen. Everything below is scoped to
     * exactly what this line says.
     */
    el('div', { class: 'row', style: 'align-items:baseline;gap:10px;margin-bottom:10px' },
      el('h2', { style: 'margin:0', text: periodLabel(year, s.settings.activeSemester) }),
      el('span', { class: 'hint', style: 'margin:0', text: `${live} running${archivedCount ? ` · ${archivedCount} archived` : ''}` })
    ),

    el('div', { class: 'row', style: 'align-items:center;flex-wrap:wrap;gap:8px' },
      el('span', { class: 'label', text: 'YEAR' }),
      el('button', { class: 'sm', text: '‹', title: 'Previous academic year', onClick: () => jump(() => stepYear(-1)) }),
      el('select', {
        /* Selects are width:100% by default, which inside a flex row takes the
           whole line and pushes the next-year arrow onto a second one. */
        style: 'width:auto;min-width:190px;flex:0 0 auto',
        onChange: (e) => jump(() => setActiveYear(e.target.value))
      }, years.map((y) => {
        const n = counts.get(y) || 0;
        return el('option', { value: y, selected: y === year, text: n ? `${y} — ${n} course${n === 1 ? '' : 's'}` : y });
      })),
      el('button', { class: 'sm', text: '›', title: 'Next academic year', onClick: () => jump(() => stepYear(1)) }),
      year !== currentAcademicYear()
        ? el('button', { class: 'sm', text: `Back to ${currentAcademicYear()}`, onClick: () => jump(() => setActiveYear(currentAcademicYear())) })
        : null,

      el('span', { class: 'label', style: 'margin-left:8px', text: 'SEMESTER' }),
      el('div', { class: 'row tight' },
        SEMESTERS.map((sem) => el('button', {
          class: s.settings.activeSemester === sem.id ? 'primary sm' : 'sm',
          'aria-pressed': String(s.settings.activeSemester === sem.id),
          text: sem.label,
          onClick: () => jump(() => setActiveSemester(sem.id))
        })),
        el('button', {
          class: !s.settings.activeSemester ? 'primary sm' : 'sm',
          'aria-pressed': String(!s.settings.activeSemester),
          text: 'Whole year',
          onClick: () => jump(() => setActiveSemester(''))
        })
      ),

      el('div', { class: 'spacer' }),
      archivedCount ? el('button', {
        class: showArchived ? 'primary sm' : 'sm',
        text: showArchived ? 'Hide archived' : `Show archived (${archivedCount})`,
        onClick: () => { showArchived = !showArchived; renderCourses(root, ctx); }
      }) : null,
      live ? el('button', {
        class: 'sm',
        text: `Archive ${year}`,
        onClick: async () => {
          const ok = await confirmDialog(
            `Archive ${live} course(s) from ${year}?`,
            'They stay exactly as they are — students, marks and theses all kept — and stop appearing in the gradebook, analytics and the planner. You can bring any of them back from this tab.',
            'Archive'
          );
          if (!ok) return;
          const n = archiveYear(year);
          toast(`${n} course(s) archived. Nothing was deleted.`, 'good');
          jump(() => {});
        }
      }) : null
    ),
    el('p', { class: 'hint', style: 'margin:8px 0 0', text: 'The year list runs well past whatever you have, in both directions, and extends as you move — it is not limited to years that already contain courses, and it does not depend on this computer’s clock.' })
  );
}

function courseDetail(course, s, root, ctx) {
  /* Replacement exams are excluded: they carry the weight of the exam they
     stand in for, so counting them here would report 160% on a course that
     adds up correctly. */
  const totalWeight = course.components
    .filter((c) => !c.resitFor)
    .reduce((n, c) => n + (Number(c.weight) || 0), 0);
  const rerender = () => renderCourses(root, ctx);

  return el('div', {},
    el('div', { class: 'card' },
      el('h2', { text: 'Course details' }),
      el('div', { class: 'grid cols-3' },
        field('Title', el('input', { value: course.title, onChange: (e) => updateCourse(course.id, { title: e.target.value }) })),
        field('Code', el('input', { value: course.code, onChange: (e) => updateCourse(course.id, { code: e.target.value }) })),
        field('Semester', el('select', {
          onChange: (e) => { updateCourse(course.id, { semester: e.target.value }); renderCourses(root, ctx); }
        }, SEMESTERS.map((x) => el('option', { value: x.id, selected: x.id === course.semester, text: x.label }))),
          `Shown everywhere as “${termLabel(course)}”.`),
        field('Academic year', el('input', {
          value: course.academicYear || '', placeholder: currentAcademicYear(),
          onChange: (e) => { updateCourse(course.id, { academicYear: e.target.value.trim() }); renderCourses(root, ctx); }
        }), 'Which year this course is filed under. Archiving works on this.'),
        field('Level', el('select', { onChange: (e) => updateCourse(course.id, { level: e.target.value }) },
          LEVELS.map((l) => el('option', { value: l.id, text: l.label, selected: l.id === course.level })))),
        field('Credits', el('input', { type: 'number', min: '0', step: '0.5', value: course.credits, onChange: (e) => updateCourse(course.id, { credits: Number(e.target.value) }) }))
      ),
      el('div', { class: 'row' },
        el('button', {
          class: 'sm',
          text: course.archived ? 'Bring back into this year' : 'Archive this course',
          title: 'Archiving keeps everything and only takes the course out of the working views.',
          onClick: () => {
            setCourseArchived(course.id, !course.archived);
            toast(course.archived ? 'Course is active again.' : 'Archived. Marks and students kept.', 'good');
            renderCourses(root, ctx);
          }
        }),
        el('div', { class: 'spacer' })
      ),
      el('button', { class: 'danger sm', text: 'Delete course', onClick: async () => {
        if (await confirmDialog('Delete course?', `This deletes “${course.title}” and every mark recorded in it.`, 'Delete')) {
          removeCourse(course.id);
          toast('Course deleted.');
        }
      } })
    ),

    scheduleCard(course, rerender),

    el('div', { class: 'card' },
      el('h2', { text: 'Assessment components' }),
      el('p', { text: 'Weights are percentages of the final mark. Max score is what the component is marked out of.' }),
      /* Switching scheme on a course that already holds marks would orphan
         them, so the offer is only made while the gradebook is still empty. */
      (() => {
        const marked = Object.values((s.scores || {})[course.id] || {}).some((byCmp) => Object.keys(byCmp || {}).length);
        if (marked) return el('p', { class: 'hint', text: 'Marks have been recorded, so the scheme is not swapped wholesale any more — edit the rows below instead. Removing a component removes its marks.' });
        return el('div', { class: 'row', style: 'align-items:center;margin-bottom:10px' },
          el('span', { class: 'hint', text: 'Start from a different scheme:' }),
          el('select', {
            id: 'course-scheme',
            onChange: async (e) => {
              const def = schemeById(e.target.value);
              const ok = await confirmDialog(`Use the “${def.label}” scheme?`,
                `${def.note} This replaces the component list. No marks have been recorded on this course, so nothing is lost.`, 'Replace');
              if (!ok) { renderCourses(root, ctx); return; }
              updateCourse(course.id, { scheme: def.id, components: [] });
              def.components().forEach((c) => addComponent(course.id, c));
              relinkReplacements(course.id, def);
              toast(`Now marked as a ${def.label.toLowerCase()} course.`, 'good');
              renderCourses(root, ctx);
            }
          }, SCHEMES.map((x) => el('option', { value: x.id, selected: x.id === (course.scheme || ''), text: x.label })))
        );
      })(),
      totalWeight !== 100
        ? el('div', { class: 'banner warn', text: `Weights currently total ${num(totalWeight)}%. Final marks are computed against the full 100%, so anything missing counts as unearned.` })
        : el('div', { class: 'banner info', text: 'Weights total 100%.' }),
      el('p', { class: 'hint', text: 'A make-up or resit exam should be set to replace the exam it stands in for. It then carries no weight of its own and the better of the two marks counts — which is how Mazeret and Bütünleme are meant to work, and why weighting them separately would take the course past 100%.' }),
      table(['Component', { label: 'Weight %', num: true }, { label: 'Max score', num: true }, 'Replaces', ''],
        course.components.map((c) => [
          el('td', {}, el('input', { value: c.name, onChange: (e) => patchComponent(course.id, c.id, { name: e.target.value }) })),
          el('td', { class: 'num' }, c.resitFor
            ? el('span', { class: 'hint', title: 'A replacement exam carries the weight of the exam it replaces.', text: '—' })
            : el('input', { class: 'grade-input', type: 'number', min: '0', max: '100', value: c.weight, onChange: (e) => patchComponent(course.id, c.id, { weight: Number(e.target.value) }) })),
          el('td', { class: 'num' }, el('input', { class: 'grade-input', type: 'number', min: '1', value: c.maxScore, onChange: (e) => patchComponent(course.id, c.id, { maxScore: Number(e.target.value) }) })),
          el('td', {}, el('select', {
            style: 'width:auto;min-width:130px',
            onChange: (e) => {
              const target = e.target.value || null;
              /* A replacement holds no weight of its own; releasing one hands
                 back a zero rather than silently restoring a number the
                 instructor never chose. */
              patchComponent(course.id, c.id, { resitFor: target, weight: target ? 0 : Number(c.weight) || 0 });
              rerender();
            }
          },
            el('option', { value: '', selected: !c.resitFor, text: 'nothing — it is its own' }),
            course.components
              .filter((x) => x.id !== c.id && !x.resitFor)
              .map((x) => el('option', { value: x.id, selected: c.resitFor === x.id, text: x.name }))
          )),
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

  /*
   * The scheme picker is the point of this dialog. The same instructor runs a
   * first-year survey marked on two exams, a seminar carried by participation,
   * and a PhD course that is one long piece of work; retyping five component
   * rows every time is the kind of small repeated tax that stops a tool being
   * opened. Choosing the level moves the suggestion, and the suggestion is
   * only ever a starting point.
   */
  let level = 'undergraduate';
  let scheme = defaultSchemeFor(level);

  const note = el('p', { class: 'hint' });
  const preview = el('div', { class: 'row tight', style: 'flex-wrap:wrap;margin-top:6px' });
  const schemeSelect = el('select', { name: 'scheme', onChange: (e) => { scheme = e.target.value; paint(); } },
    SCHEMES.map((x) => el('option', { value: x.id, text: x.label })));

  function paint() {
    schemeSelect.value = scheme;
    const def = schemeById(scheme);
    note.textContent = def.note;
    preview.replaceChildren(...(def.components().length
      ? def.components().map((c) => chip(c.replaces ? `${c.name} · replaces ${c.replaces}` : `${c.name} ${c.weight}%`, c.replaces ? '' : 'accent'))
      : [el('span', { class: 'hint', text: 'No components — you will add your own.' })]));
  }

  const form = el('form', { id: 'new-course-form', onSubmit: (e) => e.preventDefault() },
    el('div', { class: 'grid cols-2' },
      field('Title', el('input', { name: 'title', required: true, placeholder: 'Modernism and Empire' })),
      field('Code', el('input', { name: 'code', placeholder: 'CMPL 401' })),
      field('Level', el('select', {
        name: 'level',
        onChange: (e) => { level = e.target.value; scheme = defaultSchemeFor(level); paint(); }
      }, LEVELS.map((l) => el('option', { value: l.id, text: l.label })))),
      field('Semester', el('select', { name: 'semester' },
        SEMESTERS.map((x) => el('option', { value: x.id, selected: x.id === (s.settings.activeSemester || 'fall'), text: x.label })))),
      field('Academic year', el('input', { name: 'academicYear', value: s.settings.activeYear }),
        'Courses are filed and archived by this.')
    ),
    field('How it is marked', schemeSelect),
    note,
    preview
  );
  paint();

  import('../ui.js').then(({ dialog }) => {
    const dlg = dialog('New course', form, [
      el('button', { text: 'Cancel', onClick: () => dlg.close() }),
      el('button', { class: 'primary', text: 'Create', onClick: () => {
        const data = Object.fromEntries(new FormData(form));
        if (!String(data.title).trim()) { toast('A title is required.', 'error'); return; }
        const c = addCourse({ ...data, scheme });
        selectedId = c.id;
        dlg.close();
        toast('Course created.', 'good');
        renderCourses(root, ctx);
      } })
    ]);
  });
}

/*
 * When the course meets. Filling this in is what puts the course on the
 * weekly planner; a course with no schedule simply does not appear there,
 * which is better than appearing at a time it does not meet.
 */
function scheduleCard(course, rerender) {
  const slots = course.schedule || [];

  const patchSlot = (i, patch) => {
    const next = slots.map((sl, k) => (k === i ? { ...sl, ...patch } : sl));
    updateCourse(course.id, { schedule: next });
  };
  const toggleDay = (day) => {
    const on = slots.some((sl) => Number(sl.day) === day);
    const next = on
      ? slots.filter((sl) => Number(sl.day) !== day)
      : [...slots, { day, time: '', room: '' }].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7));
    updateCourse(course.id, { schedule: next });
    rerender();
  };

  const upcoming = nextMeeting(course);

  return el('div', { class: 'card' },
    el('h2', { text: 'When it meets' }),
    el('p', { text: 'Set this and the course appears on the weekly planner in Overview, with its session number counted from the first week.' }),

    el('div', { class: 'legend' },
      el('span', { class: 'legend-label', text: 'Days' }),
      DAYS.map((d) => el('button', {
        class: slots.some((sl) => Number(sl.day) === d.id) ? 'primary sm' : 'sm',
        'aria-pressed': String(slots.some((sl) => Number(sl.day) === d.id)),
        text: d.short,
        onClick: () => toggleDay(d.id)
      }))
    ),

    slots.length
      ? el('div', { class: 'table-wrap', style: 'margin-top:10px' },
          el('table', {},
            el('thead', {}, el('tr', {},
              el('th', { text: 'Day' }), el('th', { text: 'Starts' }), el('th', { text: 'Room' }))),
            el('tbody', {}, slots.map((sl, i) => el('tr', {},
              el('td', { text: (DAYS.find((d) => d.id === Number(sl.day)) || {}).label || '—' }),
              el('td', {}, el('input', {
                type: 'time', value: sl.time || '', style: 'width:120px',
                onChange: (e) => patchSlot(i, { time: e.target.value })
              })),
              el('td', {}, el('input', {
                value: sl.room || '', placeholder: 'B204',
                onChange: (e) => patchSlot(i, { room: e.target.value.trim() })
              }))
            )))
          ))
      : el('p', { class: 'hint', text: 'No days chosen, so this course does not appear on the planner.' }),

    el('div', { class: 'grid cols-3', style: 'margin-top:12px' },
      field('First week begins', el('input', {
        type: 'date', value: course.startDate || '',
        onChange: (e) => { updateCourse(course.id, { startDate: e.target.value }); rerender(); }
      }), 'Needed to number the sessions. Without it the planner still shows the class, just without “Session 9”.'),
      field('Weeks', el('input', {
        type: 'number', min: '1', max: '52', value: course.weeks || 14,
        onChange: (e) => { updateCourse(course.id, { weeks: Number(e.target.value) || 14 }); rerender(); }
      }), 'How long the term runs, so the planner stops after it.')
    ),

    upcoming
      ? el('p', { class: 'hint', text: `Next meeting: ${upcoming.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${describeMeeting(upcoming) ? ` — ${describeMeeting(upcoming)}` : ''}.` })
      : slots.length && course.startDate
        ? el('p', { class: 'hint', text: 'No meetings left — the term set above has finished.' })
        : null
  );
}
