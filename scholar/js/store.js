/*
 * store.js — everything lives in this browser.
 *
 * The library is the point: sources you have actually collected, held locally,
 * so the tools that reason about "the literature" are reasoning about a real
 * set of documents rather than about whatever a model remembers.
 */
/*
 * Places that carry literature calls. Links, not data: nothing is fetched
 * until you ask, and the Calls tab says which of them can be read by a
 * browser at all. Addresses go stale; delete the ones that do.
 */
const SEED_FEEDS = [
  { name: 'UPenn Calls for Papers', site: 'https://call-for-papers.sas.upenn.edu/', feed: 'https://call-for-papers.sas.upenn.edu/rss.xml',
    about: 'The standing list for literature and the humanities. Conferences, journal issues, edited volumes.' },
  { name: 'H-Net announcements', site: 'https://www.h-net.org/announce/', feed: 'https://www.h-net.org/announce/rss.php',
    about: 'CFPs, fellowships, prizes and funding across the humanities.' },
  { name: 'WikiCFP \u2014 humanities', site: 'http://www.wikicfp.com/cfp/call?conference=humanities', feed: '',
    about: 'Conference deadlines across fields, searchable by subject.' },
  { name: 'MLA', site: 'https://www.mla.org/', feed: '',
    about: 'Modern Language Association: prizes, grants and the convention call.' },
  { name: 'ACLA annual meeting', site: 'https://www.acla.org/annual-meeting', feed: '',
    about: 'American Comparative Literature Association. Seminar calls open each autumn.' },
  { name: 'ESSE', site: 'https://essenglish.org/', feed: '',
    about: 'European Society for the Study of English: conferences and bursaries.' }
];

const KEY = 'scholar-desk:v1';

/*
 * Will this browser keep anything?
 *
 * Opened from the Finder rather than from a server, Safari refuses
 * localStorage outright, and a private window in any browser can refuse it
 * too. The refusal is invisible exactly where it hurts: the app looks
 * perfectly well, you add twenty sources and write half an essay, you close
 * the window, and none of it was ever written. So it is probed once at boot
 * and said out loud on screen instead of being left in the console.
 */
const PROBE = `${KEY}:probe`;
const storage = (() => {
  try {
    localStorage.setItem(PROBE, '1');
    localStorage.removeItem(PROBE);
    return { ok: true, reason: '' };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || String(err) };
  }
})();

export const storageState = () => ({ ...storage });

const blank = () => ({
  version: 1,
  settings: {
    contactEmail: '',
    ai: { enabled: false, provider: 'local', model: '', apiKey: '', endpoint: 'http://localhost:11434/v1', contextTokens: 32768 },
    /* Optional second opinion on the Grammar tab. Off by default: the public
       server means sending text somewhere, and that is a choice to make
       deliberately, not a default to discover afterwards. */
    languageTool: { enabled: false, endpoint: 'http://localhost:8081', language: 'en-GB' }
  },
  sources: [],   /* papers you have kept: title, authors, year, abstract, full text */
  drafts: [],    /* essays in progress */
  calls: [],     /* submission deadlines you are tracking */
  feeds: null,   /* places you check for new ones; null means never set up */
  /* Deadline warnings you have dismissed, so one does not come back every
     time the app opens. Keyed by call id and the window it fired in. */
  dismissed: [],
  updatedAt: null
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    /* A fresh install goes through migrate() too. It is not only an upgrade
       step: it is where the defaults that cannot sit in blank() are filled
       in, and skipping it on first run left the app in a state no upgrade
       path ever produces, which is the state nobody tests. */
    if (!raw) return migrate(blank());
    const parsed = JSON.parse(raw);
    const b = blank();
    return migrate({ ...b, ...parsed, settings: { ...b.settings, ...(parsed.settings || {}) } });
  } catch (err) {
    console.error('Could not read saved data; starting empty.', err);
    return migrate(blank());
  }
}

function migrate(s) {
  s.sources ||= [];
  s.drafts ||= [];
  s.calls ||= [];
  s.dismissed ||= [];
  /*
   * Seed the sources on first run.
   *
   * An empty Sources tab reads as "this feature does nothing". It is a list
   * of places to check, so it may as well arrive with the places already in
   * it; they are links, nothing is fetched until asked, and any of them can
   * be removed. `null` rather than `[]` distinguishes a new install from
   * someone who deleted them all and does not want them back.
   */
  if (s.feeds === null || s.feeds === undefined) {
    s.feeds = SEED_FEEDS.map((f, i) => ({ id: `feed_seed${i}`, ...f, lastChecked: null }));
  }
  s.settings.ai ||= blank().settings.ai;
  s.settings.languageTool ||= blank().settings.languageTool;
  return s;
}

export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* Deferred to the next frame so a change fired from inside an input event does
   not tear out the node the browser is still working on. */
let pending = false;
function emit() {
  if (pending) return;
  pending = true;
  const flush = () => { pending = false; listeners.forEach((fn) => fn(state)); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
  else setTimeout(flush, 0);
}

let timer = null;
export function update(mutator, { silent = false } = {}) {
  mutator(state);
  state.updatedAt = new Date().toISOString();
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (!storage.ok) { storage.ok = true; storage.reason = ''; emit(); }
    } catch (err) {
      /* Quota, or a browser that will not store for this page at all. Either
         way the work on screen is not saved, which the banner must say. */
      const reason = (err && err.message) || String(err);
      if (storage.ok || storage.reason !== reason) {
        storage.ok = false;
        storage.reason = reason;
        emit();
      }
    }
  }, 200);
  if (!silent) emit();
}

export const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ---------------------------------------------------------------- sources */

export function addSource(data) {
  const src = {
    id: uid('src'),
    title: (data.title || 'Untitled').trim(),
    authors: Array.isArray(data.authors) ? data.authors : [],
    year: data.year || null,
    venue: data.venue || '',
    doi: data.doi || '',
    url: data.url || '',
    abstract: (data.abstract || '').trim(),
    /* Full text when you have the PDF; the abstract alone is enough for the
       coverage map, and the tools say which they had. */
    text: (data.text || '').trim(),
    concepts: Array.isArray(data.concepts) ? data.concepts : [],
    note: '',
    addedAt: new Date().toISOString()
  };
  update((s) => s.sources.push(src));
  return src;
}

export function addSources(list) {
  const made = [];
  update((s) => {
    list.forEach((data) => {
      const key = String(data.doi || data.title || '').trim().toLowerCase();
      if (key && s.sources.some((x) => String(x.doi || x.title).trim().toLowerCase() === key)) return;
      const src = {
        id: uid('src'),
        title: (data.title || 'Untitled').trim(),
        authors: Array.isArray(data.authors) ? data.authors : [],
        year: data.year || null,
        venue: data.venue || '',
        doi: data.doi || '',
        url: data.url || '',
        abstract: (data.abstract || '').trim(),
        text: (data.text || '').trim(),
        concepts: Array.isArray(data.concepts) ? data.concepts : [],
        note: '',
        addedAt: new Date().toISOString()
      };
      s.sources.push(src);
      made.push(src);
    });
  });
  return made;
}

export const updateSource = (id, patch) =>
  update((s) => { const x = s.sources.find((y) => y.id === id); if (x) Object.assign(x, patch); });

export const removeSource = (id) => update((s) => { s.sources = s.sources.filter((x) => x.id !== id); });

/* ----------------------------------------------------------------- drafts */

export function saveDraft(data) {
  let made;
  update((s) => {
    const existing = data.id && s.drafts.find((d) => d.id === data.id);
    if (existing) { Object.assign(existing, data, { savedAt: new Date().toISOString() }); made = existing; return; }
    made = { id: uid('dft'), title: data.title || 'Untitled', question: data.question || '',
      outline: data.outline || [], body: data.body || '', savedAt: new Date().toISOString() };
    s.drafts.push(made);
  });
  return made;
}
export const removeDraft = (id) => update((s) => { s.drafts = s.drafts.filter((d) => d.id !== id); });

export const setSettings = (patch) => update((s) => Object.assign(s.settings, patch));
export const setAi = (patch) => update((s) => { s.settings.ai = { ...s.settings.ai, ...patch }; });
export const setLanguageTool = (patch) => update((s) => { s.settings.languageTool = { ...s.settings.languageTool, ...patch }; });

/* ------------------------------------------------------------------ calls
 *
 * Deadlines you are tracking, and the places you check for new ones. Kept
 * beside the library because a call with a date is research planning, not
 * correspondence, and because it has to survive the same backup.
 */
export const KINDS = [
  { id: 'cfp', label: 'Call for papers' },
  { id: 'conference', label: 'Conference' },
  { id: 'journal', label: 'Journal issue' },
  { id: 'volume', label: 'Edited volume' },
  { id: 'prize', label: 'Prize' },
  { id: 'grant', label: 'Grant or travel funding' },
  { id: 'fellowship', label: 'Fellowship or residency' },
  { id: 'other', label: 'Something else' }
];

export const STATUSES = [
  { id: 'watching', label: 'Watching' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' },
  { id: 'passed', label: 'Let it pass' }
];

export function addCall(data) {
  const call = {
    id: uid('call'),
    title: (data.title || '').trim(),
    kind: data.kind || 'cfp',
    status: data.status || 'watching',
    deadline: data.deadline || '',
    url: (data.url || '').trim(),
    where: (data.where || '').trim(),
    notes: (data.notes || '').trim(),
    addedAt: new Date().toISOString()
  };
  update((s) => { s.calls.push(call); });
  return call;
}

export const updateCall = (id, patch) =>
  update((s) => { const c = s.calls.find((x) => x.id === id); if (c) Object.assign(c, patch); });

export const removeCall = (id) =>
  update((s) => { s.calls = s.calls.filter((x) => x.id !== id); });

export function addFeed(data) {
  const feed = {
    id: uid('feed'),
    name: (data.name || '').trim() || (data.site || data.feed || 'Unnamed'),
    site: (data.site || '').trim(),
    feed: (data.feed || '').trim(),
    about: (data.about || '').trim(),
    lastChecked: null
  };
  update((s) => { s.feeds.push(feed); });
  return feed;
}

export const updateFeed = (id, patch) =>
  update((s) => { const f = s.feeds.find((x) => x.id === id); if (f) Object.assign(f, patch); });

export const removeFeed = (id) =>
  update((s) => { s.feeds = s.feeds.filter((x) => x.id !== id); });

/* A warning seen and waved away, so it does not return on every visit. */
export const dismissWarning = (token) =>
  update((s) => { if (!s.dismissed.includes(token)) s.dismissed.push(token); });
