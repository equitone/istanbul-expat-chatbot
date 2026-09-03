import { el, mount, stat, int, num, pct, relTime, emptyState, table, chip, toast } from '../ui.js';
import {
  getState, LEVELS, LEVEL_LABEL, addTask, toggleTask, removeTask
} from '../store.js';
import { courseTotal, classSummary } from '../stats.js';
import { DAYS, weekPlan, weekStart, addDays, toIso, sameDay, describeMeeting } from '../schedule.js';

/* Which week the planner is showing, as an offset from the current one. It
   lives outside the render so paging back and forth survives a re-render. */
let weekOffset = 0;

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
            stat('Courses', int(s.courses.length), `${s.courses.filter((c) => c.enrolled.length).length} with enrolment`),
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
                  const courses = s.courses.filter((c) => c.level === lvl.id);
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
                table(['Student', 'Title', { label: 'Words', num: true }, { label: 'Stress', num: true }, 'Band', { label: 'Findings', num: true }, 'Reviewed'],
                  [...s.theses].reverse().slice(0, 8).map((t) => {
                    const st = s.students.find((x) => x.id === t.studentId);
                    return [
                      st ? st.name : '(unassigned)',
                      t.title,
                      el('td', { class: 'num', text: int(t.wordCount) }),
                      el('td', { class: 'num', text: t.stressIndex ?? '—' }),
                      el('td', {}, chip(t.stressBand || '—', bandTone(t.stressBand))),
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

const bandTone = (b) => ({ Sound: 'good', Serviceable: 'accent', Strained: 'medium', Overloaded: 'high' }[b] || '');

/* ------------------------------------------------------------- planner */

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
  const scheduled = s.courses.filter((c) => (c.schedule || []).length);
  const monday = addDays(weekStart(new Date()), weekOffset * 7);
  const rerender = () => renderDashboard(root, { go });

  /*
   * Always rendered, even with nothing to show.
   *
   * It used to return null when there were no courses, so on a fresh install
   * the planner did not exist anywhere on screen and there was no way to find
   * out that it should. A feature that hides until it is already configured
   * cannot be configured.
   */
  if (!s.courses.length) {
    return el('div', { class: 'card' },
      el('h2', { text: 'Weekly planner' }),
      el('p', { class: 'hint', text: 'Your teaching week appears here — each class, which meeting of the course it is, and a to-do list for that session. It needs a course first.' }),
      el('div', { class: 'row' },
        el('button', { class: 'primary', text: 'Create a course', onClick: () => go('courses') }),
        el('button', { text: 'Import a spreadsheet', onClick: () => go('import') })
      )
    );
  }

  if (!scheduled.length) {
    return el('div', { class: 'card' },
      el('h2', { text: 'Weekly planner' }),
      el('p', { class: 'hint', text: 'You have a course but it has no days set, so there is nothing to lay out yet. Open it, fill in “When it meets” — the days, the time, the room and the date the first week begins — and your week appears here with a to-do list under each class.' }),
      el('button', { class: 'primary', text: 'Set a course timetable', onClick: () => go('courses') })
    );
  }

  const meetings = weekPlan(scheduled, monday).filter((m) => m.withinTerm);
  const today = new Date();
  const label = weekOffset === 0 ? 'This week'
    : weekOffset === 1 ? 'Next week'
    : weekOffset === -1 ? 'Last week'
    : `Week of ${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return el('div', { class: 'card' },
    el('div', { class: 'row', style: 'align-items:center;gap:10px;margin-bottom:4px' },
      el('h2', { style: 'margin:0', text: 'Weekly planner' }),
      el('span', { class: 'hint', style: 'margin:0', text: `${label} · ${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(monday, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${meetings.length} class${meetings.length === 1 ? '' : 'es'}` }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'sm', text: '‹', title: 'Previous week', onClick: () => { weekOffset--; rerender(); } }),
      weekOffset !== 0 ? el('button', { class: 'sm', text: 'Today', onClick: () => { weekOffset = 0; rerender(); } }) : null,
      el('button', { class: 'sm', text: '›', title: 'Next week', onClick: () => { weekOffset++; rerender(); } })
    ),

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
