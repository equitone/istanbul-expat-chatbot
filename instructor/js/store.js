/*
 * store.js — all application state, held on this machine only.
 *
 * Gradebook data lives in localStorage (small, synchronous, survives reload).
 * Thesis documents live in IndexedDB, because a single thesis can exceed the
 * whole localStorage quota. Nothing is ever transmitted: there is no server
 * component to this application.
 */
import { DEFAULT_LETTER_SCHEME } from './stats.js';

const KEY = 'instructor-workbench:v1';
const DB_NAME = 'instructor-workbench';
const DB_VERSION = 1;
const DOC_STORE = 'documents';

export const LEVELS = [
  { id: 'undergraduate', label: 'Undergraduate', short: 'UG' },
  { id: 'masters', label: "Master's", short: 'MA' },
  { id: 'phd', label: 'PhD', short: 'PhD' }
];

export const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.id, l.label]));

function blankState() {
  return {
    version: 1,
    settings: {
      instructor: '',
      institution: '',
      defaultTerm: currentTerm(),
      /* Nothing may leave this computer. Default on: a privacy control that
         has to be found and switched on has already failed. netguard.js
         enforces it at the network layer; this is only the switch. */
      offlineLock: true,
      scaleMax: 100,
      passMark: 50,
      letterScheme: DEFAULT_LETTER_SCHEME.map((s) => ({ ...s })),
      /* Defaults to a model running on this computer, because that is the
         only option consistent with the rest of the app; the model name is
         left empty so each provider supplies its own. An instructor who
         chooses the Claude API keeps that choice — this is the default for a
         fresh install, not a migration. */
      ai: { enabled: false, provider: 'local', model: '', apiKey: '', endpoint: '' },
      /* Optional local grammar engine. Off until the instructor installs it. */
      languageTool: { enabled: false, endpoint: 'http://localhost:8081', language: 'en-GB', picky: false }
    },
    students: [],
    courses: [],
    scores: {},
    theses: [],
    comments: [],
    tasks: [],
    updatedAt: null
  };
}

let state = load();
const listeners = new Set();

/* ------------------------------------------------------------- lifecycle */

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    return migrate({ ...blankState(), ...parsed, settings: { ...blankState().settings, ...(parsed.settings || {}) } });
  } catch (err) {
    console.error('Could not read saved data; starting empty.', err);
    return blankState();
  }
}

function migrate(s) {
  s.students ||= [];
  s.courses ||= [];
  s.scores ||= {};
  s.theses ||= [];
  s.comments ||= [];
  s.tasks ||= [];
  /* Absent in anything saved before the lock existed, and absence must mean
     locked rather than open. */
  if (typeof s.settings.offlineLock !== 'boolean') s.settings.offlineLock = true;
  s.settings.ai ||= blankState().settings.ai;
  s.settings.languageTool ||= blankState().settings.languageTool;
  s.settings.letterScheme ||= DEFAULT_LETTER_SCHEME.map((x) => ({ ...x }));
  s.courses.forEach((c) => {
    c.components ||= [];
    c.enrolled ||= [];
    /* When and where it meets. Absent on every course created before the
       planner existed, which is why it defaults to empty rather than to a
       guess — an invented Monday 09:00 would put a class on the timetable
       that does not happen. */
    c.schedule ||= [];
    c.startDate ||= '';
    c.weeks ||= 14;
  });
  return s;
}

let saveTimer = null;
export function persist({ immediate = false } = {}) {
  state.updatedAt = new Date().toISOString();
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Save failed', err);
      notify({ type: 'error', message: 'Could not save — browser storage may be full. Export a backup now.' });
    }
  };
  clearTimeout(saveTimer);
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(event = {}) {
  listeners.forEach((fn) => fn(event, state));
}

function notify(payload) {
  listeners.forEach((fn) => fn({ type: 'toast', ...payload }, state));
}

/** Mutate state through this so persistence and re-render always follow. */
export function update(mutator, event = {}) {
  mutator(state);
  persist();
  emit(event);
}

/* -------------------------------------------------------------- students */

export function addStudent(data) {
  const student = {
    id: uid('stu'),
    name: (data.name || '').trim(),
    studentNo: (data.studentNo || '').trim(),
    level: data.level || 'undergraduate',
    email: (data.email || '').trim(),
    programme: (data.programme || '').trim(),
    year: (data.year || '').trim(),
    notes: '',
    createdAt: new Date().toISOString()
  };
  update((s) => s.students.push(student), { type: 'students' });
  return student;
}

export function updateStudent(id, patch) {
  update((s) => {
    const st = s.students.find((x) => x.id === id);
    if (st) Object.assign(st, patch);
  }, { type: 'students' });
}

export function removeStudent(id) {
  update((s) => {
    s.students = s.students.filter((x) => x.id !== id);
    s.courses.forEach((c) => { c.enrolled = c.enrolled.filter((x) => x !== id); });
    Object.values(s.scores).forEach((byStudent) => { delete byStudent[id]; });
    s.theses = s.theses.filter((t) => t.studentId !== id);
  }, { type: 'students' });
}

export const studentsByLevel = (level) => state.students.filter((s) => s.level === level);

/* --------------------------------------------------------------- courses */

export function addCourse(data) {
  const course = {
    id: uid('crs'),
    title: (data.title || '').trim(),
    code: (data.code || '').trim(),
    level: data.level || 'undergraduate',
    term: (data.term || state.settings.defaultTerm || '').trim(),
    credits: Number(data.credits) || 0,
    components: resolveReplaces((data.components || defaultComponents()).map((c) => ({ id: uid('cmp'), ...c }))),
    schedule: data.schedule || [],
    startDate: data.startDate || '',
    weeks: Number(data.weeks) || 14,
    enrolled: [],
    createdAt: new Date().toISOString()
  };
  update((s) => s.courses.push(course), { type: 'courses' });
  return course;
}

/*
 * The scheme a new course starts with.
 *
 * Two of these five carry no weight of their own. Mazeret is the make-up
 * exam for a missed Vize and Bütünleme is the resit for the Final: each
 * stands in place of the exam it replaces and the better mark counts. Given
 * a weight of their own they would take the course past 100% and credit a
 * student twice for sitting one paper — which is exactly the fault this app
 * found in the real gradebook it was tested against.
 *
 * `replaces` names the component by its position here; addCourse turns it
 * into the generated id, since ids do not exist yet at this point.
 */
/* Turn a `replaces: 'Vize'` written by name into a resitFor holding the id
   that was generated a moment ago. */
function resolveReplaces(components) {
  return components.map((c) => {
    const { replaces, ...rest } = c;
    if (!replaces) return { ...rest, resitFor: rest.resitFor || null };
    const target = components.find((x) => x.name === replaces);
    return { ...rest, resitFor: target ? target.id : null };
  });
}

function defaultComponents() {
  return [
    { name: 'Class participation', weight: 20, maxScore: 100 },
    { name: 'Vize', weight: 20, maxScore: 100 },
    { name: 'Mazeret', weight: 0, maxScore: 100, replaces: 'Vize' },
    { name: 'Final', weight: 60, maxScore: 100 },
    { name: 'Bütünleme', weight: 0, maxScore: 100, replaces: 'Final' }
  ];
}

export function updateCourse(id, patch) {
  update((s) => {
    const c = s.courses.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  }, { type: 'courses' });
}

export function removeCourse(id) {
  update((s) => {
    s.courses = s.courses.filter((c) => c.id !== id);
    delete s.scores[id];
    /* Its to-dos go with it; orphaned tasks would sit on the planner
       attached to a course that no longer exists. */
    s.tasks = s.tasks.filter((t) => t.courseId !== id);
  }, { type: 'courses' });
}

export function addComponent(courseId, data) {
  update((s) => {
    const c = s.courses.find((x) => x.id === courseId);
    if (c) c.components.push({ id: uid('cmp'), name: data.name || 'Component', weight: Number(data.weight) || 0, maxScore: Number(data.maxScore) || 100 });
  }, { type: 'courses' });
}

export function removeComponent(courseId, componentId) {
  update((s) => {
    const c = s.courses.find((x) => x.id === courseId);
    if (!c) return;
    c.components = c.components.filter((x) => x.id !== componentId);
    const byStudent = s.scores[courseId] || {};
    Object.values(byStudent).forEach((row) => { delete row[componentId]; });
  }, { type: 'courses' });
}

export function setEnrolment(courseId, studentIds) {
  update((s) => {
    const c = s.courses.find((x) => x.id === courseId);
    if (c) c.enrolled = [...new Set(studentIds)];
  }, { type: 'courses' });
}

/* ---------------------------------------------------------------- scores */

export function setScore(courseId, studentId, componentId, value) {
  update((s) => {
    s.scores[courseId] ||= {};
    s.scores[courseId][studentId] ||= {};
    if (value === null || value === '' || !Number.isFinite(Number(value))) {
      delete s.scores[courseId][studentId][componentId];
    } else {
      s.scores[courseId][studentId][componentId] = Number(value);
    }
  }, { type: 'scores', courseId, studentId, silent: true });
}

export const getScores = (courseId, studentId) =>
  ((state.scores[courseId] || {})[studentId]) || {};

/* --------------------------------------------------------------- theses */
/* Metadata lives in state; the full text and report live in IndexedDB. */

export async function saveThesis(meta, payload) {
  const record = {
    id: meta.id || uid('th'),
    studentId: meta.studentId || null,
    courseId: meta.courseId || null,
    title: meta.title || 'Untitled',
    filename: meta.filename || '',
    wordCount: meta.wordCount || 0,
    bloomLevel: meta.bloomLevel ?? null,
    bloomLabel: meta.bloomLabel ?? null,
    readingShare: meta.readingShare ?? null,
    issueCount: meta.issueCount ?? 0,
    highCount: meta.highCount ?? 0,
    savedAt: new Date().toISOString()
  };
  await dbPut(DOC_STORE, { id: record.id, text: payload.text, report: payload.report });
  update((s) => {
    const i = s.theses.findIndex((t) => t.id === record.id);
    if (i >= 0) s.theses[i] = record;
    else s.theses.push(record);
  }, { type: 'theses' });
  return record;
}

export const loadThesisDocument = (id) => dbGet(DOC_STORE, id);

export async function removeThesis(id) {
  await dbDelete(DOC_STORE, id);
  update((s) => { s.theses = s.theses.filter((t) => t.id !== id); }, { type: 'theses' });
}

/* ------------------------------------------------------------- settings */

/* ------------------------------------------------------------ comment bank */

/*
 * Feedback an instructor writes once and then writes forty more times.
 * Comments live in the same state object as everything else, so they travel
 * in the backup file and outlive a browser reset like the gradebook does.
 *
 * `uses` is kept so the picker can put the ones actually being used at the
 * top; a bank sorted alphabetically stops being faster than retyping once it
 * passes about a dozen entries.
 */
export function addComment({ text, tag = '' }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('A comment needs some text.');
  const existing = state.comments.find((c) => c.text === body);
  if (existing) return existing.id;
  const id = uid('cm');
  update((s) => s.comments.unshift({ id, text: body, tag: tag.trim(), uses: 0, createdAt: new Date().toISOString() }));
  return id;
}

export function noteCommentUsed(id) {
  /* Silent: a usage count changing must not re-render the dialog the
     instructor is typing in. */
  update((s) => {
    const c = s.comments.find((x) => x.id === id);
    if (c) c.uses = (c.uses || 0) + 1;
  }, { silent: true });
}

export function removeComment(id) {
  update((s) => { s.comments = s.comments.filter((c) => c.id !== id); });
}

export const commentsByUse = () =>
  [...state.comments].sort((a, b) => (b.uses || 0) - (a.uses || 0) || a.text.localeCompare(b.text));

/* --------------------------------------------------------- class to-dos */

/*
 * What has to be done before a particular class meets.
 *
 * A task is pinned to a course and to a date — the date of the session it
 * belongs to — rather than to a session number, because a class can be moved
 * and the work moves with the date rather than with the count. A task with no
 * date is course admin that is not tied to a meeting.
 */
export function addTask({ courseId, date = '', text }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('A task needs some text.');
  const id = uid('tsk');
  update((s) => s.tasks.push({
    id, courseId: courseId || null, date: date || '', text: body,
    done: false, createdAt: new Date().toISOString()
  }), { silent: true });
  return id;
}

export function toggleTask(id) {
  /* Silent: ticking a box must not rebuild the panel the pointer is in. */
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) { t.done = !t.done; t.doneAt = t.done ? new Date().toISOString() : null; }
  }, { silent: true });
}

export function updateTask(id, patch) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  }, { silent: true });
}

export function removeTask(id) {
  update((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); }, { silent: true });
}

export const tasksFor = (courseId, date) =>
  state.tasks.filter((t) => t.courseId === courseId && t.date === date);

export function updateSettings(patch) {
  update((s) => Object.assign(s.settings, patch), { type: 'settings' });
}

/* --------------------------------------------------------- backup / restore */

export async function exportBackup({ includeDocuments = true } = {}) {
  const documents = [];
  if (includeDocuments) {
    for (const t of state.theses) {
      const doc = await dbGet(DOC_STORE, t.id);
      if (doc) documents.push(doc);
    }
  }
  return {
    format: 'instructor-workbench-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
    documents
  };
}

export async function importBackup(payload, { merge = false } = {}) {
  if (!payload || payload.format !== 'instructor-workbench-backup') {
    throw new Error('This file is not an Instructor Workbench backup.');
  }
  const incoming = migrate({ ...blankState(), ...payload.state, settings: { ...blankState().settings, ...(payload.state.settings || {}) } });

  if (merge) {
    const known = new Set(state.students.map((s) => s.id));
    incoming.students.forEach((s) => { if (!known.has(s.id)) state.students.push(s); });
    const knownCourses = new Set(state.courses.map((c) => c.id));
    incoming.courses.forEach((c) => { if (!knownCourses.has(c.id)) state.courses.push(c); });
    Object.entries(incoming.scores).forEach(([cid, rows]) => {
      state.scores[cid] = { ...(state.scores[cid] || {}), ...rows };
    });
    const knownTheses = new Set(state.theses.map((t) => t.id));
    incoming.theses.forEach((t) => { if (!knownTheses.has(t.id)) state.theses.push(t); });
  } else {
    state = incoming;
  }

  for (const doc of payload.documents || []) await dbPut(DOC_STORE, doc);
  persist({ immediate: true });
  emit({ type: 'restore' });
}

export async function wipeAll() {
  state = blankState();
  persist({ immediate: true });
  await dbClear(DOC_STORE);
  emit({ type: 'restore' });
}

/* ------------------------------------------------------------- IndexedDB */

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DOC_STORE)) db.createObjectStore(DOC_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const dbPut = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
const dbGet = (store, id) => tx(store, 'readonly', (s) => s.get(id));
const dbDelete = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
const dbClear = (store) => tx(store, 'readwrite', (s) => s.clear());

/* ---------------------------------------------------------------- utils */

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function currentTerm() {
  const d = new Date();
  const year = d.getFullYear();
  const m = d.getMonth();
  if (m >= 8) return `Fall ${year}`;
  if (m >= 5) return `Summer ${year}`;
  return `Spring ${year}`;
}

export function storageEstimate() {
  if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
  return Promise.resolve(null);
}
