import { el, mount, stat, int, num, pct, relTime, emptyState, table, chip } from '../ui.js';
import { getState, LEVELS, LEVEL_LABEL } from '../store.js';
import { courseTotal, classSummary } from '../stats.js';

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
