/*
 * schedule-sheet.js — the teaching timetable as one printable page.
 *
 * The question this answers is asked out loud, by a head of department or a
 * colleague looking for a free hour: "what have you got on?" Answering it from
 * the app means turning a screen round; answering it from a sheet of paper
 * means handing it over. So this is a real grid — days across, hours down,
 * every class in its slot — plus the week-by-week list of what is still to
 * come, on a page that prints on one side of A4.
 *
 * Entirely self-contained: no stylesheet link, no font request, no script.
 * It has to be, because the workbench is locked to this computer and a
 * printable page that fetched anything would be a hole in that.
 */
import { DAYS, weekPlan, weekStart, addDays, nextMeeting, describeMeeting } from '../schedule.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Slots are laid out by the hours actually taught, not 08:00-20:00 of empty
   rows: a timetable with four classes should not print as a wall of blanks. */
function hourRows(courses) {
  const times = new Set();
  courses.forEach((c) => (c.schedule || []).forEach((sl) => { if (sl.time) times.add(sl.time); }));
  if (!times.size) return [];
  return [...times].sort();
}

export function buildScheduleSheet({ courses, instructor = '', institution = '', year = '', semester = '', period = '', weeksAhead = 4 }) {
  const teaching = courses.filter((c) => (c.schedule || []).length);
  const rows = hourRows(teaching);
  const days = DAYS.slice(0, 6).filter((d) => teaching.some((c) => (c.schedule || []).some((sl) => Number(sl.day) === d.id)));

  /* A course with no time set still has to appear — it is on his plate even
     if the hour is not recorded — so it goes in an "unscheduled hour" row
     rather than being dropped from the sheet. */
  const cellFor = (dayId, time) => teaching
    .flatMap((c) => (c.schedule || [])
      .filter((sl) => Number(sl.day) === dayId && (sl.time || '') === time)
      .map((sl) => ({ course: c, slot: sl })));

  const untimed = teaching.some((c) => (c.schedule || []).some((sl) => !sl.time));

  const grid = days.length
    ? `<table class="grid">
        <thead><tr><th class="h"></th>${days.map((d) => `<th>${esc(d.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${[...rows, ...(untimed ? [''] : [])].map((time) => `
            <tr>
              <th class="h">${time ? esc(time) : '<span class="dim">no hour set</span>'}</th>
              ${days.map((d) => {
                const hits = cellFor(d.id, time);
                if (!hits.length) return '<td></td>';
                return `<td class="on">${hits.map(({ course, slot }) => `
                  <div class="cls">
                    <b>${esc(course.code || course.title)}</b>
                    ${course.code ? `<span>${esc(course.title)}</span>` : ''}
                    <span class="meta">${esc(course.levelLabel || '')}${slot.room ? ` · ${esc(slot.room)}` : ''}</span>
                  </div>`).join('')}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>`
    : '<p class="dim">No days are set on any course, so there is no timetable to print yet.</p>';

  /* What is coming, week by week, with the session number — the part a
     colleague cannot read off a grid. */
  const monday = weekStart(new Date());
  const ahead = [];
  for (let w = 0; w < weeksAhead; w++) {
    const m = addDays(monday, w * 7);
    const meetings = weekPlan(teaching, m).filter((x) => x.withinTerm);
    if (meetings.length) ahead.push({ monday: m, meetings });
  }

  const upcoming = ahead.length
    ? ahead.map(({ monday: m, meetings }) => `
        <div class="wk">
          <h3>${m.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} – ${addDays(m, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</h3>
          <ul>${meetings.map((x) => {
            const sub = describeMeeting(x);
            return `<li><b>${esc(DAYS.find((d) => d.id === x.day).short)}</b> ${esc(x.course.code || x.course.title)}${sub ? ` <span class="dim">${esc(sub)}</span>` : ''}</li>`;
          }).join('')}</ul>
        </div>`).join('')
    : '<p class="dim">Nothing scheduled in the coming weeks — the term may not have started, or it has finished.</p>';

  const load = teaching.reduce((n, c) => n + (c.schedule || []).length, 0);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Teaching schedule${semester || year ? ` — ${esc([semester, year].filter(Boolean).join(' '))}` : ''}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #16181d; margin: 0; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .06em; color: #55606f; }
  h3 { font-size: 12px; margin: 0 0 4px; }
  .sub { color: #55606f; margin: 0 0 4px; }
  .dim { color: #7b8494; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid th, table.grid td { border: 1px solid #ccd2db; padding: 5px 6px; vertical-align: top; }
  table.grid thead th { background: #eef1f5; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  table.grid th.h { width: 74px; background: #f6f8fa; font-weight: 600; font-size: 11px; text-align: right; }
  table.grid td { height: 46px; }
  td.on { background: #e8f4f2; }
  .cls b { display: block; font-size: 12px; }
  .cls span { display: block; font-size: 10px; color: #55606f; }
  .cls .meta { font-size: 10px; }
  .weeks { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px; }
  .wk ul { margin: 0; padding-left: 16px; }
  .wk li { font-size: 11px; }
  footer { margin-top: 24px; border-top: 1px solid #ccd2db; padding-top: 6px; font-size: 10px; color: #7b8494; }
  /* Backgrounds are how the occupied hours read at a glance; browsers drop
     them from print by default. */
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <h1>Teaching schedule</h1>
  <p class="sub">${esc(period || [semester ? `${semester} semester` : '', year].filter(Boolean).join(' · ')) || '&nbsp;'}</p>
  ${instructor || institution ? `<p class="sub">${esc([instructor, institution].filter(Boolean).join(' · '))}</p>` : ''}
  <p class="sub">${teaching.length} course${teaching.length === 1 ? '' : 's'} · ${load} class${load === 1 ? '' : 'es'} a week</p>
  ${grid}
  <h2>Coming up</h2>
  <div class="weeks">${upcoming}</div>
  <footer>Printed ${new Date().toLocaleDateString()} from Instructor Workbench. Prepared on this computer; no student data appears on this sheet.</footer>
</body></html>`;
}
