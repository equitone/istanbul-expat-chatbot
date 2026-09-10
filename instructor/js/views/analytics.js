import { el, mount, stat, table, chip, barChart, num, int, pct, emptyState, meter, otherYearsNotice } from '../ui.js';
import { getState, LEVELS, LEVEL_LABEL , activeCourses, setActiveYear, termLabel, periodLabel } from '../store.js';
import { courseTotal, classSummary, describe, correlation, toLetter } from '../stats.js';
import { buildSimpleReport, openPrintable, downloadReport } from '../export/report.js';
import { toast } from '../ui.js';

let selectedId = null;

export default function renderAnalytics(root, ctx) {
  const s = getState();
    /* Choose from this year's live courses; last year's are archived out of the
     way, not deleted, and are still reachable from the Courses tab. */
  const courses = activeCourses();
  if (!courses.some((c) => c.id === selectedId)) selectedId = courses[0] ? courses[0].id : null;
  const course = s.courses.find((c) => c.id === selectedId);

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Analytics' }),
        el('p', { text: 'End-of-term statistics for one course, and a comparison across the three levels.' })
      ),
      el('div', { class: 'spacer' }),
      chip(periodLabel(s.settings.activeYear, s.settings.activeSemester)),
      courses.length ? el('select', {
        style: 'width:auto;min-width:230px',
        onChange: (e) => { selectedId = e.target.value; renderAnalytics(root, ctx); }
      }, courses.map((c) => el('option', { value: c.id, selected: c.id === selectedId, text: `${c.code ? `${c.code} — ` : ''}${c.title} · ${termLabel(c)}` }))) : null,
      course ? el('button', { class: 'primary', text: 'Print report', onClick: () => printAnalytics(course, s) }) : null
    ),
    otherYearsNotice(s, (y) => { setActiveYear(y); selectedId = null; renderAnalytics(root, ctx); }),
    !courses.length
      ? emptyState('No courses yet', 'Statistics appear once a course has enrolled students with marks.',
          el('button', { class: 'primary', text: 'Go to Courses', onClick: () => ctx.go('courses') }))
      : el('div', {}, courseAnalytics(course, s), levelComparison(s))
  );
}

function courseAnalytics(course, s) {
  const rows = course.enrolled.map((id) => {
    const st = s.students.find((x) => x.id === id);
    const scores = (s.scores[course.id] || {})[id] || {};
    return { st, scores, score: courseTotal(scores, course.components).absolute };
  }).filter((r) => r.st);

  const sum = classSummary(rows, { scaleMax: s.settings.scaleMax, passMark: s.settings.passMark, scheme: s.settings.letterScheme });
  if (!sum.graded) {
    return el('div', { class: 'card' }, emptyState('No marks recorded', `Enter marks for “${course.title}” in the Gradebook and the statistics build themselves.`));
  }

  const finals = rows.map((r) => r.score);
  const skew = sum.stdev ? (sum.mean - sum.median) / sum.stdev : 0;

  return el('div', {},
    el('div', { class: 'grid cols-4', style: 'margin-bottom:16px' },
      stat('Mean', num(sum.mean), `median ${num(sum.median)}`, 'accent'),
      stat('Std deviation', num(sum.stdev), `IQR ${num(sum.q1)}–${num(sum.q3)}`),
      stat('Pass rate', pct(sum.passRate), `${sum.passing} of ${sum.graded} at ≥ ${s.settings.passMark}`, sum.passRate >= 0.8 ? 'good' : sum.passRate < 0.5 ? 'high' : ''),
      stat('Mean GPA', num(sum.meanGpa, 2), `range ${num(sum.min)}–${num(sum.max)}`)
    ),

    el('div', { class: 'grid cols-2' },
      el('div', { class: 'card' },
        el('h2', { text: 'Mark distribution' }),
        el('p', { text: `${sum.graded} graded, ${sum.ungraded} outstanding.` }),
        barChart(sum.histogram, { format: (d) => `${Math.round(d.from)}` }),
        el('p', { class: 'hint', text: Math.abs(skew) < 0.15
          ? 'Roughly symmetric — mean and median agree.'
          : skew > 0
            ? `Mean sits ${num(sum.mean - sum.median)} above the median: a tail of low marks is pulling the average down relative to the typical student.`
            : `Mean sits ${num(sum.median - sum.mean)} below the median: a cluster at the top with a thin lower tail.` })
      ),
      el('div', { class: 'card' },
        el('h2', { text: 'Letter grades' }),
        el('p', { text: 'Using the scheme set in Settings.' }),
        table(['Grade', { label: 'Count', num: true }, { label: 'Share', num: true }, ''],
          sum.letters.filter((l) => l.count).map((l) => [
            el('td', {}, chip(l.letter, l.gpa >= 3 ? 'good' : l.gpa >= 2 ? 'accent' : l.gpa >= 1 ? 'medium' : 'high')),
            el('td', { class: 'num', text: int(l.count) }),
            el('td', { class: 'num', text: pct(l.share) }),
            el('td', { style: 'width:130px' }, meter(l.share, l.gpa >= 2 ? 'good' : 'medium'))
          ]), { empty: 'No grades yet.' })
      )
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'Component analysis' }),
      el('p', { text: 'How each assessment behaved, and whether it agrees with the final mark. A component with low correlation is measuring something the rest of the course is not — which may be a virtue or a fault, but is worth knowing.' }),
      table(['Component', { label: 'Weight', num: true }, { label: 'n', num: true }, { label: 'Mean', num: true }, { label: 'Mean %', num: true }, { label: 'σ', num: true }, { label: 'r with final', num: true }, 'Reading'],
        course.components.map((c) => {
          const raw = rows.map((r) => r.scores[c.id]);
          const d = describe(raw);
          const r = correlation(raw, finals);
          return [
            c.name,
            el('td', { class: 'num', text: `${c.weight}%` }),
            el('td', { class: 'num', text: int(d.n) }),
            el('td', { class: 'num', text: num(d.mean) }),
            el('td', { class: 'num', text: d.mean === null ? '—' : num((d.mean / (c.maxScore || 100)) * 100) }),
            el('td', { class: 'num', text: num(d.stdev) }),
            el('td', { class: 'num', text: r === null ? '—' : num(r, 2) }),
            el('td', {}, r === null ? chip('too few marks') : r > 0.7 ? chip('tracks the final', 'good') : r > 0.4 ? chip('moderate', 'accent') : chip('diverges', 'medium'))
          ];
        }))
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'Students needing attention' }),
      el('p', { text: 'Below the pass mark, or more than one standard deviation under the class mean.' }),
      (() => {
        const flagged = rows
          .filter((r) => Number.isFinite(r.score) && (r.score < s.settings.passMark || (sum.stdev && r.score < sum.mean - sum.stdev)))
          .sort((a, b) => a.score - b.score);
        if (!flagged.length) return el('p', { class: 'hint', text: 'Nobody is below the pass mark or a standard deviation under the mean.' });
        return table(['Student', { label: 'Final', num: true }, { label: 'z', num: true }, 'Missing', ''],
          flagged.map((r) => {
            const t = courseTotal(r.scores, course.components);
            const z = sum.stdev ? (r.score - sum.mean) / sum.stdev : null;
            return [
              r.st.name,
              el('td', { class: 'num', text: num(r.score) }),
              el('td', { class: 'num', text: num(z, 2) }),
              t.missing.length ? t.missing.map((id) => (course.components.find((c) => c.id === id) || {}).name).join(', ') : 'none',
              el('td', {}, r.score < s.settings.passMark ? chip('failing', 'high') : chip('below average', 'medium'))
            ];
          }));
      })()
    )
  );
}

function levelComparison(s) {
  const data = LEVELS.map((lvl) => {
    const courses = s.courses.filter((c) => c.level === lvl.id);
    const marks = [];
    courses.forEach((c) => c.enrolled.forEach((id) => {
      const t = courseTotal((s.scores[c.id] || {})[id], c.components).absolute;
      if (Number.isFinite(t)) marks.push(t);
    }));
    return { lvl, courses: courses.length, marks, d: describe(marks), sum: classSummary(marks.map((m) => ({ score: m })), { passMark: s.settings.passMark, scheme: s.settings.letterScheme }) };
  });

  return el('div', { class: 'card' },
    el('h2', { text: 'Across the three levels' }),
    el('p', { text: 'Every graded student-course pair, grouped by the level the course belongs to.' }),
    table(['Level', { label: 'Courses', num: true }, { label: 'Marks', num: true }, { label: 'Mean', num: true }, { label: 'Median', num: true }, { label: 'σ', num: true }, { label: 'Min', num: true }, { label: 'Max', num: true }, { label: 'Pass', num: true }],
      data.map((r) => [
        el('td', {}, chip(r.lvl.label, r.lvl.id === 'undergraduate' ? 'ug' : r.lvl.id === 'masters' ? 'ma' : 'phd')),
        el('td', { class: 'num', text: int(r.courses) }),
        el('td', { class: 'num', text: int(r.marks.length) }),
        el('td', { class: 'num', text: num(r.d.mean) }),
        el('td', { class: 'num', text: num(r.d.median) }),
        el('td', { class: 'num', text: num(r.d.stdev) }),
        el('td', { class: 'num', text: num(r.d.min) }),
        el('td', { class: 'num', text: num(r.d.max) }),
        el('td', { class: 'num', text: pct(r.sum.passRate) })
      ]))
  );
}

/*
 * Class statistics as a document — the thing that gets attached to a board of
 * examiners paper. Marks are per student, so this one is for the instructor
 * and the department rather than for a student; the roster is included
 * precisely because that is what a moderation meeting needs to see.
 */
function printAnalytics(course, s) {
  const scheme = s.settings.letterScheme;
  const rows = course.enrolled.map((id) => {
    const st = s.students.find((x) => x.id === id);
    const t = courseTotal((s.scores[course.id] || {})[id], course.components);
    return { st, total: t.absolute, complete: t.complete };
  }).filter((r) => r.st);

  const marks = rows.map((r) => r.total).filter(Number.isFinite);
  const summary = classSummary(marks.map((m) => ({ score: m })), {
    scaleMax: s.settings.scaleMax, passMark: s.settings.passMark, scheme
  });

  const html = buildSimpleReport({
    title: `${course.code ? `${course.code} — ` : ''}${course.title}`,
    subtitle: [LEVEL_LABEL[course.level], course.term, `${rows.length} enrolled`].filter(Boolean).join(' · '),
    instructor: s.settings.instructor || '',
    institution: s.settings.institution || '',
    blocks: [
      { tiles: [
          ['Graded', `${summary.graded} of ${rows.length}`],
          ['Mean', num(summary.mean, 1)],
          ['Median', num(summary.median, 1)],
          ['Std dev', num(summary.stdev, 1)],
          ['Pass rate', pct(summary.passRate)],
          ['Mean GPA', num(summary.meanGpa, 2)]
        ] },
      { heading: 'Components',
        table: {
          headers: ['Component', 'Weight', 'Out of', 'Class mean'],
          rows: course.components.map((c) => [
            c.name,
            c.resitFor ? 'resit' : `${c.weight}%`,
            String(c.maxScore),
            num(describe(course.enrolled.map((id) => ((s.scores[course.id] || {})[id] || {})[c.id])).mean, 1)
          ])
        } },
      { heading: 'Letter distribution',
        table: {
          headers: ['Letter', 'Count', 'Share'],
          rows: summary.letters.filter((l) => l.count).map((l) => [l.letter, String(l.count), pct(l.share)])
        } },
      { heading: 'Marks', count: rows.length,
        table: {
          headers: ['Student', 'No.', 'Mark', 'Letter', 'Complete'],
          rows: rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1)).map((r) => [
            r.st.name, r.st.studentNo || '—',
            Number.isFinite(r.total) ? num(r.total, 1) : '—',
            Number.isFinite(r.total) ? (toLetter(r.total, scheme) || {}).letter || '—' : '—',
            r.complete ? 'yes' : 'not all components'
          ])
        } },
      { caveat: 'Marks are computed against the full weighting; a component not yet entered counts as unearned, which is why an incomplete row reads lower than it will finish. Where a resit replaces an exam, the better of the two marks is used.' }
    ]
  });

  try { openPrintable(html); } catch (err) {
    downloadReport(html, `${(course.code || course.title).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-statistics.html`);
    toast('Pop-up blocked, so the report was downloaded instead.', '');
  }
}
