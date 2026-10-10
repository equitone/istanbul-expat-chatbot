/*
 * store.js — everything lives in this browser.
 *
 * The library is the point: sources you have actually collected, held locally,
 * so the tools that reason about "the literature" are reasoning about a real
 * set of documents rather than about whatever a model remembers.
 */
const KEY = 'scholar-desk:v1';

const blank = () => ({
  version: 1,
  settings: {
    contactEmail: '',
    ai: { enabled: false, provider: 'local', model: '', apiKey: '', endpoint: 'http://localhost:11434/v1', contextTokens: 32768 }
  },
  sources: [],   /* papers you have kept: title, authors, year, abstract, full text */
  drafts: [],    /* essays in progress */
  updatedAt: null
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    const b = blank();
    return migrate({ ...b, ...parsed, settings: { ...b.settings, ...(parsed.settings || {}) } });
  } catch (err) {
    console.error('Could not read saved data; starting empty.', err);
    return blank();
  }
}

function migrate(s) {
  s.sources ||= [];
  s.drafts ||= [];
  s.settings.ai ||= blank().settings.ai;
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
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { console.error('Save failed', err); }
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
