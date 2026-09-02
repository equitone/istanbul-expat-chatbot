/*
 * schedule.js — when does this course actually meet, and which meeting is it.
 *
 * Pure date arithmetic, no DOM and no storage, so the awkward parts can be
 * tested rather than eyeballed against a calendar.
 *
 * Dates are handled as local calendar days throughout. A class at 09:00 on a
 * Monday is a fact about the instructor's week, not an instant on a timeline,
 * so anything that goes through UTC will land on the wrong day for half the
 * world twice a year. Every date here is built and compared as Y-M-D.
 */

export const DAYS = [
  { id: 1, short: 'Mon', label: 'Monday' },
  { id: 2, short: 'Tue', label: 'Tuesday' },
  { id: 3, short: 'Wed', label: 'Wednesday' },
  { id: 4, short: 'Thu', label: 'Thursday' },
  { id: 5, short: 'Fri', label: 'Friday' },
  { id: 6, short: 'Sat', label: 'Saturday' },
  { id: 0, short: 'Sun', label: 'Sunday' }
];

/* "2025-10-06" -> a Date at local midnight. new Date("2025-10-06") would
   parse it as UTC and show as the 5th anywhere west of Greenwich. */
export function parseDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (d, n) => {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
};

/* Monday of the week containing `date`. */
export function weekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const back = (d.getDay() + 6) % 7;
  return addDays(d, -back);
}

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const DAY_MS = 86400000;
/* Whole days between two local midnights, immune to the hour shifting under
   daylight saving because both ends are normalised first. */
export function daysBetween(a, b) {
  const x = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const y = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((y - x) / DAY_MS);
}

/*
 * Every meeting a course has in one week.
 *
 * A course meets on the weekdays in its `schedule`, from `startDate`, for
 * `weeks` weeks. The session number counts meetings — a course meeting twice
 * a week is on session 5 in week three, not session 3 — because that is the
 * number written at the top of a lecture slide.
 */
export function meetingsInWeek(course, monday) {
  const sched = (course.schedule || []).filter((s) => Number.isInteger(Number(s.day)));
  if (!sched.length) return [];

  const start = parseDay(course.startDate);
  const weeks = Number(course.weeks) || 14;
  const out = [];

  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    sched
      .filter((s) => Number(s.day) === date.getDay())
      .forEach((slot) => {
        const meeting = {
          courseId: course.id,
          date,
          iso: toIso(date),
          day: date.getDay(),
          time: slot.time || '',
          room: slot.room || '',
          session: null,
          weekNumber: null,
          withinTerm: true
        };
        if (start) {
          const offset = daysBetween(start, date);
          const weekNumber = Math.floor(offset / 7) + 1;
          meeting.weekNumber = weekNumber;
          meeting.withinTerm = offset >= 0 && weekNumber <= weeks;
          meeting.session = meeting.withinTerm ? sessionNumber(sched, start, date) : null;
        }
        out.push(meeting);
      });
  }

  return out.sort((a, b) => a.date - b.date || String(a.time).localeCompare(String(b.time)));
}

/*
 * Which meeting of the course this date is. Counted by walking the weekday
 * pattern from the start date rather than multiplying, so a course that meets
 * Monday and Thursday numbers its Thursday correctly in the first week even
 * when term starts on a Wednesday.
 */
export function sessionNumber(schedule, start, date) {
  const days = [...new Set(schedule.map((s) => Number(s.day)))];
  const total = daysBetween(start, date);
  if (total < 0) return null;
  let n = 0;
  for (let i = 0; i <= total; i++) {
    if (days.includes(addDays(start, i).getDay())) n++;
  }
  return n || null;
}

/* Every course meeting in the week beginning `monday`, in time order. */
export function weekPlan(courses, monday) {
  const all = [];
  courses.forEach((c) => meetingsInWeek(c, monday).forEach((m) => all.push({ ...m, course: c })));
  return all.sort((a, b) => a.date - b.date || String(a.time).localeCompare(String(b.time)));
}

/* The next meeting of a course at or after `from`, looking a term ahead. */
export function nextMeeting(course, from = new Date()) {
  let monday = weekStart(from);
  for (let w = 0; w < 30; w++) {
    const hit = meetingsInWeek(course, monday)
      .filter((m) => m.withinTerm && daysBetween(from, m.date) >= 0)
      .sort((a, b) => a.date - b.date)[0];
    if (hit) return hit;
    monday = addDays(monday, 7);
  }
  return null;
}

export const describeMeeting = (m) => {
  const bits = [];
  if (m.session) bits.push(`Session ${m.session}`);
  else if (m.weekNumber && !m.withinTerm) bits.push('Outside term');
  if (m.time) bits.push(m.time);
  if (m.room) bits.push(m.room);
  return bits.join(' · ');
};
