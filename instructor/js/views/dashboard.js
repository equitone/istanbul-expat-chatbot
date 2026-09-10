import { el, mount, stat, int, num, pct, relTime, emptyState, table, chip, toast } from '../ui.js';
import {
  getState, LEVELS, LEVEL_LABEL, addTask, toggleTask, removeTask, activeCourses, updateCourse,
  SEMESTER_LABEL, termLabel, periodLabel
} from '../store.js';
import { courseTotal, classSummary } from '../stats.js';
import { DAYS, weekPlan, weekStart, addDays, toIso, sameDay, describeMeeting } from '../schedule.js';

/* Which week the planner is showing, as an offset from the current one. It
   lives outside the render so paging back and forth survives a re-render. */
let weekOffset = 0;
let showSchedule = false;

export default function renderDashboard(root, { go }) {
  const s = getState();
  const marks = [];
  s.courses.forEach((c) => c.enrolled.forEach((id) => {
    const t = courseTotal((s.scores[c.id] || {})[id], c.components).absolute;
    if (Number.isFinite(t)) marks.push(t);
  }));
  const summary = classSummary(marks.map((m) => ({ score: m })), {
    scaleMax: s.settings.scaleMax, passMark: s.settings.passMark, scheme: s.settings.letterScheme
  });

  const live = activeCourses();
  const empty = !s.students.length && !s.courses.length;

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Overview' }),
        el('p', { text: 'Everything here is stored on this computer only. No account, no server, no upload.' })
      )
    ),

    el('div', { class: 'banner privacy' },
      'Grades live in this browser’s local storage; thesis documents live in its IndexedDB. Nothing leaves the machine unless you turn on AI review or press a Verify button in Thesis review.'
    ),

    plannerCard(s, root, go),

    backupReminder(s, go),

    empty
      ? emptyState('Nothing set up yet',
          'Add your students, then create a course and give it assessment components. The gradebook and statistics build themselves from there.',
          el('div', { class: 'row' },
            el('button', { class: 'primary', text: 'Add students', onClick: () => go('students') }),
            el('button', { text: 'Create a course', onClick: () => go('courses') })
          ))
      : el('div', {},
          el('div', { class: 'grid cols-4', style: 'margin-bottom:16px' },
            stat('Students', int(s.students.length), LEVELS.map((l) => `${l.short} ${s.students.filter((x) => x.level === l.id).length}`).join(' · ')),
            stat('Courses', int(live.length),
              `${live.filter((c) => c.enrolled.length).length} with enrolment${s.courses.length > live.length ? ` · ${s.courses.length - live.length} archived` : ''}`),
            stat('Marks recorded', int(marks.length), `${summary.ungraded || 0} still open`, 'accent'),
            stat('Theses reviewed', int(s.theses.length), s.theses.length ? `last ${relTime(s.theses[s.theses.length - 1].savedAt)}` : 'none yet')
          ),

          el('div', { class: 'grid cols-2' },
            el('div', { class: 'card' },
              el('h2', { text: 'Across all courses' }),
              el('p', { text: 'Every graded student-course pair, pooled.' }),
              marks.length
                ? el('div', { class: 'grid cols-3' },
                    stat('Mean', num(summary.mean), `median ${num(summary.median)}`),
                    stat('Spread', `σ ${num(summary.stdev)}`, `${num(summary.min)}–${num(summary.max)}`),
                    stat('Pass rate', pct(summary.passRate), `at ≥ ${s.settings.passMark}`, summary.passRate >= 0.8 ? 'good' : summary.passRate < 0.5 ? 'high' : '')
                  )
                : el('p', { class: 'hint', text: 'No marks entered yet.' })
            ),
            el('div', { class: 'card' },
              el('h2', { text: 'By level' }),
              el('p', { text: 'Where the three cohorts sit relative to each other.' }),
              table(['Level', { label: 'Students', num: true }, { label: 'Courses', num: true }, { label: 'Mean', num: true }, { label: 'Pass', num: true }],
                LEVELS.map((lvl) => {
                  const courses = live.filter((c) => c.level === lvl.id);
                  const lm = [];
                  courses.forEach((c) => c.enrolled.forEach((id) => {
                    const t = courseTotal((s.scores[c.id] || {})[id], c.components).absolute;
                    if (Number.isFinite(t)) lm.push(t);
                  }));
                  const sum = classSummary(lm.map((m) => ({ score: m })), { passMark: s.settings.passMark, scheme: s.settings.letterScheme });
                  return [
                    el('td', {}, chip(lvl.label, lvl.id === 'undergraduate' ? 'ug' : lvl.id === 'masters' ? 'ma' : 'phd')),
                    el('td', { class: 'num', text: int(s.students.filter((x) => x.level === lvl.id).length) }),
                    el('td', { class: 'num', text: int(courses.length) }),
                    el('td', { class: 'num', text: num(sum.mean) }),
                    el('td', { class: 'num', text: pct(sum.passRate) })
                  ];
                }), { empty: 'No levels in use yet.' })
            )
          ),

          s.theses.length
            ? el('div', { class: 'card' },
                el('h2', { text: 'Recent thesis reviews' }),
                table(['Student', 'Title', { label: 'Words', num: true }, 'Level of thinking', 'Beyond restating', { label: 'Findings', num: true }, 'Reviewed'],
                  [...s.theses].reverse().slice(0, 8).map((t) => {
                    const st = s.students.find((x) => x.id === t.studentId);
                    return [
                      st ? st.name : '(unassigned)',
                      t.title,
                      el('td', { class: 'num', text: int(t.wordCount) }),
                      el('td', { text: t.bloomLabel || '—' }),
                      el('td', {}, t.readingShare === null || t.readingShare === undefined
                        ? chip('—')
                        : chip(`${Math.round(t.readingShare * 100)}% beyond restating`, t.readingShare >= 0.4 ? 'good' : 'medium')),
                      el('td', { class: 'num', text: int(t.issueCount) }),
                      relTime(t.savedAt)
                    ];
                  }))
              )
            : null
        )
  );
}

/*
 * Local-only storage is private, but it is not durable: clearing browsing
 * data, a browser storage eviction, or a Windows cleanup tool will take it
 * without warning. The privacy of this app is worth nothing if a term's
 * grades disappear, so the reminder is deliberately hard to ignore once it
 * has been a while.
 */
function backupReminder(s, go) {
  const hasData = s.students.length || s.courses.length || s.theses.length;
  if (!hasData) return null;

  const last = s.settings.lastBackupAt ? new Date(s.settings.lastBackupAt) : null;
  const days = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
  if (days !== null && days < 14) return null;

  const button = el('button', {
    class: 'sm',
    style: 'margin-left:10px',
    text: 'Back up now',
    onClick: () => go('settings')
  });

  return el('div', { class: 'banner warn' },
    last
      ? `Last backup was ${days} days ago. Everything here lives in this browser only — clearing browsing data would erase it. `
      : 'No backup has been taken yet. Everything here lives in this browser only, and clearing browsing data would erase it with no warning. ',
    button
  );
}


/* ------------------------------------------------------------- planner */


/*
 * One course's meeting days, editable in place. Deliberately day-first: a day
 * is the only field the planner actually needs, and demanding a room and a
 * term start date before showing anything is what kept this card empty.
 */
function scheduleRow(course, rerender) {
  const slots = course.schedule || [];
  const setSlots = (next) => { updateCourse(course.id, { schedule: next }); rerender(); };

  return el('div', { class: 'sched-row' },
    el('div', { class: 'sched-name' },
      el('strong', { text: course.code || course.title }),
      el('small', { text: `${LEVEL_LABEL[course.level]}${course.code ? ` · ${course.title}` : ''}` })
    ),
    el('div', { class: 'row tight', style: 'flex-wrap:wrap' },
      DAYS.slice(0, 6).map((d) => {
        const on = slots.some((sl) => Number(sl.day) === d.id);
        return el('button', {
          class: on ? 'primary sm' : 'sm',
          'aria-pressed': String(on),
          text: d.short,
          onClick: () => setSlots(on
            ? slots.filter((sl) => Number(sl.day) !== d.id)
            : [...slots, { day: d.id, time: '', room: '' }].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7)))
        });
      })
    ),
    slots.length
      ? el('div', { class: 'row tight', style: 'flex-wrap:wrap;align-items:center' },
          slots.map((sl, i) => el('span', { class: 'row tight', style: 'align-items:center' },
            el('span', { class: 'hint', style: 'margin:0', text: DAYS.find((d) => d.id === Number(sl.day)).short }),
            el('input', {
              type: 'time', value: sl.time || '', style: 'width:98px',
              onChange: (e) => updateCourse(course.id, { schedule: slots.map((x, k) => (k === i ? { ...x, time: e.target.value } : x)) })
            }),
            el('input', {
              value: sl.room || '', placeholder: 'room', style: 'width:76px',
              onChange: (e) => updateCourse(course.id, { schedule: slots.map((x, k) => (k === i ? { ...x, room: e.target.value } : x)) })
            })
          )),
          el('span', { class: 'hint', style: 'margin:0', text: 'first week' }),
          el('input', {
            type: 'date', value: course.startDate || '', style: 'width:140px',
            title: 'Set this and each class is numbered — Session 6 of 14.',
            onChange: (e) => { updateCourse(course.id, { startDate: e.target.value }); rerender(); }
          }),
          !course.startDate ? el('span', { class: 'hint', style: 'margin:0', text: '— set it to number the sessions' }) : null
        )
      : null
  );
}

/*
 * "What have you got on?" — asked out loud by a colleague or a head of
 * department. Answering from the screen means turning a laptop round; this
 * prints the answer on one page. No student appears on it: it is a timetable,
 * not a record.
 */
async function printSchedule(s) {
  const teaching = activeCourses().filter((c) => (c.schedule || []).length);
  if (!teaching.length) {
    toast('Set the days a course meets first — there is no timetable to print yet.', 'error');
    return;
  }
  try {
    const [{ buildScheduleSheet }, { openPrintable }] = await Promise.all([
      import('../export/schedule-sheet.js'),
      import('../export/report.js')
    ]);
    openPrintable(buildScheduleSheet({
      /* levelLabel is passed in rather than imported into the sheet, so the
         printable stays a pure function of what it is handed. */
      courses: teaching.map((c) => ({ ...c, levelLabel: LEVEL_LABEL[c.level] || '' })),
      instructor: s.settings.instructor,
      institution: s.settings.institution,
      year: s.settings.activeYear,
      semester: SEMESTER_LABEL[s.settings.activeSemester] || '',
      period: periodLabel(s.settings.activeYear, s.settings.activeSemester)
    }));
  } catch (err) {
    toast(err.message, 'error');
  }
}

/*
 * The week at a glance: what is taught, when, which meeting of the course it
 * is, and what has to be done before it.
 *
 * Deliberately small. A full timetable grid with hour rows looks impressive
 * and answers a question nobody asks — an instructor knows their own hours.
 * What they forget is which session number they are on and what they promised
 * to bring to it, so those are what the card shows.
 */
function plannerCard(s, root, go) {
  /* Off by default once the week is laid out: the point of the card is the
     week, not its settings. */
  const scheduled = activeCourses().filter((c) => (c.schedule || []).length);
  const rerender = () => renderDashboard(root, { go });

  /*
   * "Upcoming" week, not "current" week.
   *
   * On a Friday afternoon every class in the current week has already
   * happened, and a planner showing them is a record rather than a plan. So
   * when nothing is left in this week, the card opens on the next one — which
   * is what was asked for and what is actually useful at the end of a week.
   * The arrows still reach every week in either direction.
   */
  const thisMonday = weekStart(new Date());
  let base = thisMonday;
  if (weekOffset === 0 && scheduled.length) {
    const now = new Date();
    const remaining = weekPlan(scheduled, thisMonday)
      .filter((m) => m.withinTerm && !sameDay(m.date, now) && m.date > now);
    const anyToday = weekPlan(scheduled, thisMonday).some((m) => m.withinTerm && sameDay(m.date, now));
    if (!remaining.length && !anyToday) base = addDays(thisMonday, 7);
  }
  const monday = addDays(base, weekOffset * 7);
  const lookingAhead = base > thisMonday;

  /*
   * Always rendered, even with nothing to show.
   *
   * It used to return null when there were no courses, so on a fresh install
   * the planner did not exist anywhere on screen and there was no way to find
   * out that it should. A feature that hides until it is already configured
   * cannot be configured.
   */
  if (!activeCourses().length) {
    return el('div', { class: 'card' },
      el('h2', { text: 'Weekly planner' }),
      el('p', { class: 'hint', text: 'Your teaching week appears here — each class, which meeting of the course it is, and a to-do list for that session. It needs a course first.' }),
      el('div', { class: 'row' },
        el('button', { class: 'primary', text: 'Create a course', onClick: () => go('courses') }),
        el('button', { text: 'Import a spreadsheet', onClick: () => go('import') })
      )
    );
  }

  /*
   * Set the timetable HERE, not in another tab.
   *
   * This used to be a paragraph telling the instructor to open Courses, find
   * the course, scroll to "When it meets" and fill in a form — six or seven
   * interactions in a different part of the app before the feature he asked
   * for existed at all. Nobody does that. The planner is empty exactly when
   * the days are missing, so the days are asked for exactly there: tick a day
   * and the week draws itself immediately.
   */
  if (!scheduled.length) {
    /* Sticky: ticking the first day flips this card into its laid-out form,
       and if the setup rows collapsed at that moment a second day could not be
       added without hunting for the toggle. It stays open until closed. */
    showSchedule = true;
    return el('div', { class: 'card' },
      el('div', { class: 'row', style: 'align-items:baseline;gap:8px' },
        el('h2', { style: 'margin:0', text: 'Weekly planner' }),
        chip(periodLabel(s.settings.activeYear, s.settings.activeSemester))
      ),
      el('p', { class: 'hint', text: 'Tick the days each course meets and your week appears below. Time, room and the first week’s date are optional — add them whenever.' }),
      el('div', {}, activeCourses().map((c) => scheduleRow(c, rerender)))
    );
  }

  const meetings = weekPlan(scheduled, monday).filter((m) => m.withinTerm);
  const today = new Date();
  const weeksFromNow = Math.round((monday - thisMonday) / (7 * 86400000));
  const label = weeksFromNow === 0 ? 'This week'
    : weeksFromNow === 1 ? 'Next week'
    : weeksFromNow === -1 ? 'Last week'
    : `Week of ${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return el('div', { class: 'card' },
    el('div', { class: 'row', style: 'align-items:center;gap:10px;margin-bottom:4px' },
      el('h2', { style: 'margin:0', text: 'Weekly planner' }),
      /* Which term this week belongs to, spelled out. A planner that shows a
         week without naming the semester leaves the reader counting. */
      chip(periodLabel(s.settings.activeYear, s.settings.activeSemester)),
      el('span', { class: 'hint', style: 'margin:0', text: `${label} · ${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(monday, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${meetings.length} class${meetings.length === 1 ? '' : 'es'}${lookingAhead && weekOffset === 0 ? ' · this week is done' : ''}` }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'sm', text: '‹', title: 'Previous week', onClick: () => { weekOffset--; rerender(); } }),
      weeksFromNow !== 0 ? el('button', { class: 'sm', text: 'Today', onClick: () => { weekOffset = -Math.round((base - thisMonday) / (7 * 86400000)); rerender(); } }) : null,
      el('button', { class: 'sm', text: '›', title: 'Next week', onClick: () => { weekOffset++; rerender(); } }),
      el('button', {
        class: showSchedule ? 'primary sm' : 'sm',
        text: 'Days',
        title: 'Change which days each course meets',
        onClick: () => { showSchedule = !showSchedule; rerender(); }
      }),
      el('button', {
        class: 'sm',
        text: 'Print schedule',
        title: 'A one-page timetable to hand to someone who asks what you are teaching',
        onClick: () => printSchedule(s)
      })
    ),

    showSchedule
      ? el('div', { style: 'margin-bottom:12px' }, activeCourses().map((c) => scheduleRow(c, rerender)))
      : null,

    meetings.length
      ? el('div', { class: 'planner' },
          DAYS.filter((d) => meetings.some((m) => m.day === d.id)).map((d) => {
            const date = meetings.find((m) => m.day === d.id).date;
            const isToday = sameDay(date, today);
            return el('div', { class: `planner-day${isToday ? ' today' : ''}` },
              el('div', { class: 'planner-head' },
                el('strong', { text: d.short }),
                el('span', { text: String(date.getDate()) }),
                isToday ? chip('today', 'accent') : null
              ),
              meetings.filter((m) => m.day === d.id).map((m) => classCard(m, s, rerender))
            );
          })
        )
      : el('p', { class: 'hint', text: weekOffset === 0
          ? 'No classes this week — either the term has not started or it has finished. Use › to look ahead.'
          : 'No classes in this week.' })
  );
}

function classCard(m, s, rerender) {
  const c = m.course;
  const tasks = s.tasks.filter((t) => t.courseId === c.id && t.date === m.iso);
  const open = tasks.filter((t) => !t.done).length;
  const sub = describeMeeting(m);

  const box = el('input', {
    class: 'planner-add',
    placeholder: 'Add a to-do…',
    onKeyDown: (e) => {
      if (e.key !== 'Enter') return;
      const text = e.target.value.trim();
      if (!text) return;
      try { addTask({ courseId: c.id, date: m.iso, text }); e.target.value = ''; rerender(); }
      catch (err) { toast(err.message, 'error'); }
    }
  });

  return el('div', { class: 'planner-class' },
    el('div', { style: 'font-weight:600;font-size:13px', text: c.code || c.title }),
    c.code ? el('div', { class: 'hint', style: 'margin:0', text: c.title }) : null,
    el('div', { class: 'row', style: 'gap:4px;margin:4px 0 6px;flex-wrap:wrap' },
      chip(LEVEL_LABEL[c.level] || c.level, c.level === 'undergraduate' ? 'ug' : c.level === 'masters' ? 'ma' : 'phd'),
      chip(termLabel(c)),
      sub ? chip(sub) : null,
      open ? chip(`${open} to do`, 'medium') : tasks.length ? chip('all done', 'good') : null
    ),
    tasks.length
      ? el('ul', { class: 'planner-tasks' }, tasks.map((t) => el('li', { class: t.done ? 'done' : '' },
          el('label', {},
            el('input', {
              type: 'checkbox', checked: t.done,
              onChange: () => { toggleTask(t.id); rerender(); }
            }),
            el('span', { text: t.text })
          ),
          el('button', { class: 'ghost sm', title: 'Remove', text: '×', onClick: () => { removeTask(t.id); rerender(); } })
        )))
      : null,
    box
  );
}
