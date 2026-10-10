/*
 * feeds.js — read a call-for-papers feed, and be honest when you cannot.
 *
 * THE AWKWARD TRUTH ABOUT "UPDATES".
 *
 * There is no API for literature calls for papers. The places that carry
 * them — the UPenn CFP list, WikiCFP, association newsletters, individual
 * university pages — are web pages, and a page running on your own computer
 * is not allowed to read most other sites. The browser blocks it, by design,
 * and no amount of code here changes that. A tool that promises automatic
 * updates and quietly shows an empty list is worse than one that does not
 * promise them, because an empty list reads as "nothing is open".
 *
 * So this tries, and reports precisely what happened. Where a site publishes
 * RSS or Atom and permits cross-origin reads, the items come back parsed,
 * with any deadline found in the text. Where it does not, the failure is
 * stated in those words, the source stays in the list with a button that
 * opens it, and the date you last looked is recorded. A rotation of sites to
 * check, with deadlines tracked, is a real tool for this; a fake inbox is
 * not.
 *
 * Nothing here is sent anywhere except a GET to the feed address you typed.
 */

/* Deadlines as they are actually written in calls for papers. */
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

const DEADLINE_CUE = /(?:deadline|due|closes?|submissions?\s+(?:by|due)|abstracts?\s+(?:by|due)|apply\s+by)\b[^.]{0,40}?/i;

/*
 * Pull a date out of free text.
 *
 * Only forms that are unambiguous in English are read. "03/04/2027" is
 * deliberately not: it is March in America and April everywhere else, and
 * guessing wrong on a submission deadline is the one error this must not
 * make. A date it cannot read is left null and the item says so.
 */
export function findDeadline(text) {
  const s = String(text || '');
  const near = s.match(new RegExp(`${DEADLINE_CUE.source}(.{0,60})`, 'i'));
  const haystack = near ? near[0] : s;

  /* 15 January 2027 / 15th Jan 2027 */
  let m = haystack.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    return iso(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
  }
  /* January 15, 2027 / Jan 15 2027 */
  m = haystack.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    return iso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
  }
  /* 2027-01-15 */
  m = haystack.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function iso(y, monthIndex, d) {
  if (!(y > 1990 && y < 2100) || !(d >= 1 && d <= 31)) return null;
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

const text = (node, ...names) => {
  for (const n of names) {
    const found = node.querySelector(n);
    if (found && found.textContent.trim()) return found.textContent.trim();
  }
  return '';
};

const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/*
 * Fetch and parse one feed.
 *
 * Returns {ok, items, reason}. It never throws: a source that cannot be read
 * is an ordinary, expected outcome here, and the caller shows the reason
 * beside the source rather than losing the whole list to one failure.
 */
export async function readFeed(url, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, { signal, headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
  } catch (err) {
    return {
      ok: false,
      items: [],
      reason: `This site does not let a page on your own computer read it (${err.message}). That is the site's decision, not a fault here — open it in a tab instead.`
    };
  }
  if (!res.ok) return { ok: false, items: [], reason: `The site answered ${res.status}.` };

  const body = await res.text();
  let doc;
  try {
    doc = new DOMParser().parseFromString(body, 'application/xml');
  } catch {
    return { ok: false, items: [], reason: 'The answer was not XML, so it is not a feed address.' };
  }
  if (doc.querySelector('parsererror')) {
    return { ok: false, items: [], reason: 'That address returned a web page rather than a feed. Look for an RSS or Atom link on the site.' };
  }

  const entries = [...doc.querySelectorAll('item, entry')];
  if (!entries.length) return { ok: false, items: [], reason: 'It is a feed, but it currently lists nothing.' };

  const items = entries.slice(0, 40).map((e) => {
    const title = text(e, 'title');
    const link = e.querySelector('link[href]')?.getAttribute('href')
      || text(e, 'link', 'guid');
    const body2 = strip(text(e, 'description', 'summary', 'content'));
    const published = text(e, 'pubDate', 'published', 'updated', 'dc\\:date');
    return {
      title,
      link,
      summary: body2.slice(0, 600),
      published: published ? new Date(published).toISOString().slice(0, 10) : null,
      /* The date that matters is the deadline, not when it was posted. */
      deadline: findDeadline(`${title} ${body2}`)
    };
  }).filter((i) => i.title);

  return { ok: true, items, reason: '' };
}

/* Days from today, negative once it has passed. */
export function daysUntil(isoDate) {
  if (!isoDate) return null;
  const then = new Date(`${isoDate}T23:59:59`);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  return Math.ceil((then - now) / 86400000);
}

export function urgency(isoDate) {
  const d = daysUntil(isoDate);
  if (d === null) return { label: 'no date', kind: '' };
  if (d < 0) return { label: `closed ${-d} day${-d === 1 ? '' : 's'} ago`, kind: 'past' };
  if (d === 0) return { label: 'closes today', kind: 'firm' };
  if (d <= 7) return { label: `${d} day${d === 1 ? '' : 's'} left`, kind: 'firm' };
  if (d <= 30) return { label: `${d} days left`, kind: '' };
  return { label: `${d} days left`, kind: '' };
}

/*
 * Places that carry literature calls, offered as a starting list.
 *
 * These are links to open, not data this app has. Where a site publishes a
 * feed the address is included and reading it is attempted; where it does
 * not, or where it refuses, the entry still earns its place as something to
 * check on a rotation. Addresses change — if one is dead, replace it.
 */
export const SUGGESTED_SOURCES = [
  { name: 'UPenn Calls for Papers', site: 'https://call-for-papers.sas.upenn.edu/', feed: 'https://call-for-papers.sas.upenn.edu/rss.xml',
    about: 'The standing list for literature and the humanities. Conferences, journal issues, edited volumes.' },
  { name: 'WikiCFP — humanities', site: 'http://www.wikicfp.com/cfp/call?conference=humanities', feed: '',
    about: 'Conference deadlines across fields, searchable by subject.' },
  { name: 'MLA — calls and awards', site: 'https://www.mla.org/Resources/Career/Job-List', feed: '',
    about: 'Modern Language Association: prizes, grants and the convention call.' },
  { name: 'ACLA annual meeting', site: 'https://www.acla.org/annual-meeting', feed: '',
    about: 'American Comparative Literature Association. Seminar calls open each autumn.' },
  { name: 'ESSE — European Society for the Study of English', site: 'https://essenglish.org/', feed: '',
    about: 'Conference and bursary announcements, with a European focus.' },
  { name: 'IASPM / literature and culture grants', site: 'https://www.h-net.org/announce/', feed: 'https://www.h-net.org/announce/rss.php',
    about: 'H-Net announcements: CFPs, fellowships, prizes, funding.' }
];
