import { el, mount, toast } from './ui.js';
import { getState, subscribe, storageState, dismissWarning, setSettings } from './store.js';
import { dueWarnings, urgency } from './analysis/feeds.js';
import { BUILD } from './version.js';
import { setContactEmail } from './analysis/verify.js';
import { setContactEmail as setPeopleEmail } from './analysis/people.js';
import { setContactEmail as setGatherEmail } from './analysis/gather.js';

import renderLibrary from './views/library.js';
import renderSearch from './views/search.js';
import renderGaps from './views/gaps.js';
import renderEvaluate from './views/evaluate.js';
import renderWrite from './views/write.js';
import renderGrammar from './views/grammar.js';
import renderCalls from './views/calls.js';
import renderReferences from './views/references.js';
import renderSettings from './views/settings.js';

/*
 * TWO DOORS.
 *
 * Nine tabs in one row asked a question nobody wants at the start of a
 * working session: which of these nine am I in the mood for. The two things
 * this app does are not alike and are not done at the same hour. Building an
 * argument is open-ended and takes a morning; checking a draft is close work
 * on something already written and takes twenty minutes.
 *
 * So the app opens on the choice, and each door shows only its own tabs.
 * Settings is in both, because a setting is needed wherever you are, and the
 * wordmark goes back to the doors from anywhere.
 *
 * The door is remembered, so this is a first-run question and not a toll
 * gate: come back tomorrow and you land where you left off, with the doors
 * one click away.
 */
const DOORS = [
  {
    id: 'write',
    title: 'Write',
    blurb: 'Build the argument. Find who has written on it, see what is missing, and draft against your own notes.',
    doing: ['Your library', 'Who has published on it', 'Where the gaps are', 'Drafting', 'Calls for papers'],
    tabs: ['library', 'search', 'gaps', 'write', 'calls', 'references', 'settings'],
    land: 'library'
  },
  {
    id: 'check',
    title: 'Check',
    blurb: 'Go over something already written. Grammar, spelling and punctuation, how the argument holds up, and whether the citations match the style.',
    doing: ['Grammar and spelling', 'Punctuation', 'How the argument holds', 'Citations against APA or MLA'],
    tabs: ['grammar', 'evaluate', 'references', 'settings'],
    land: 'grammar'
  }
];

const VIEWS = [
  { id: 'library', label: 'Library', render: renderLibrary },
  { id: 'search', label: 'Find', render: renderSearch },
  { id: 'gaps', label: 'Gaps', render: renderGaps },
  { id: 'evaluate', label: 'Evaluate', render: renderEvaluate },
  { id: 'write', label: 'Write', render: renderWrite },
  { id: 'grammar', label: 'Grammar', render: renderGrammar },
  { id: 'calls', label: 'Calls', render: renderCalls },
  { id: 'references', label: 'References', render: renderReferences },
  { id: 'settings', label: 'Settings', render: renderSettings }
];

/*
 * Nothing is being saved — say so, loudly and permanently.
 *
 * This is the one condition the app cannot work around. A page opened from
 * the Finder has no origin a browser will store against in Safari, so the
 * library and the drafts live only as long as the window does. Silence here
 * costs an afternoon's work, so the warning sits above everything, cannot be
 * dismissed, and names the two ways out.
 */
function drawStorageWarning() {
  const s = storageState();
  const existing = document.getElementById('nosave');
  if (s.ok) { if (existing) existing.remove(); return; }
  if (existing) return;
  const note = el('div', { id: 'nosave', class: 'nosave', role: 'alert' },
    el('strong', { text: 'Nothing you do here is being saved.' }),
    el('p', { text: 'This browser will not store data for a page opened straight from a folder. Add a source or write a draft and it is gone when the window closes.' }),
    el('p', { text: 'Either open this same file in Chrome or Firefox, which do store it, or start the served version (start.command, then http://localhost:8130) and work there.' }),
    el('p', { class: 'why', text: s.reason })
  );
  document.body.insertBefore(note, document.getElementById('main'));
}

/*
 * Deadlines, where you cannot miss them.
 *
 * A deadline tracked on a tab you are not looking at is a deadline missed,
 * so the warning sits above every tab until it is dealt with. It fires once
 * a month out, once a week out, and once on the last day, and dismissing
 * one window does not silence the next — waving away "a month to go" must
 * not also cost you the warning on the final morning.
 *
 * Not a modal. An interruption you have to click through to reach your own
 * work gets dismissed unread within a week, and then it is worse than
 * nothing, because you have stopped seeing it and still believe you would
 * be told.
 */
function drawDeadlines() {
  const existing = document.getElementById('due');
  const s = getState();
  const due = dueWarnings(s.calls, s.dismissed);
  if (existing) existing.remove();
  if (!due.length) return;

  const worst = due[0];
  const note = el('div', { id: 'due', class: `due${worst.days <= 1 ? ' now' : ''}`, role: 'status' },
    el('div', { class: 'due-body' },
      el('strong', { text: due.length === 1 ? 'A deadline is coming up.' : `${due.length} deadlines are coming up.` }),
      el('ul', {}, due.slice(0, 4).map((w) => el('li', {},
        el('span', { class: 'when', text: urgency(w.call.deadline).label }),
        ' \u00b7 ',
        w.call.url
          ? el('a', { href: w.call.url, target: '_blank', rel: 'noopener', text: w.call.title })
          : el('span', { text: w.call.title }),
        el('button', {
          class: 'bare sm', text: 'dismiss',
          title: `Hide this until it is ${w.window === 'month' ? 'a week away' : w.window === 'week' ? 'the last day' : 'gone'}`,
          onClick: () => { dismissWarning(w.token); drawDeadlines(); }
        })))),
      due.length > 4 ? el('p', { class: 'more', text: `and ${due.length - 4} more.` }) : null),
    el('button', { class: 'sm', text: 'Open Calls', onClick: () => go('calls') })
  );
  document.body.insertBefore(note, document.getElementById('main'));
}

/*
 * The offline switch, wired to the guard that is already running.
 *
 * netguard.js reads the flag straight out of storage on every request, so
 * this only has to write it — there is no state to keep in sync and no
 * window in which the setting and the guard disagree. The page is marked so
 * the whole interface can show the state rather than only this corner of it.
 */
function wireOfflineSwitch() {
  const box = document.getElementById('offline-toggle');
  if (!box) return;
  const apply = () => {
    const on = getState().settings.offlineLock === true;
    box.checked = on;
    document.body.classList.toggle('is-offline', on);
    const label = document.querySelector('#offline .offline-label');
    if (label) label.textContent = on ? 'Offline \u2014 nothing leaves' : 'Offline';
  };
  box.addEventListener('change', () => {
    setSettings({ offlineLock: box.checked });
    apply();
    toast(box.checked
      ? 'Offline. Nothing can leave this computer. Find, Gaps and the calls feeds will not work until you switch it off.'
      : 'Back online. The catalogue searches work again.');
  });
  apply();
  subscribe(apply);
}

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const stamp = document.getElementById('stamp');
if (stamp) stamp.textContent = BUILD === 'dev' ? 'dev' : BUILD;

VIEWS.forEach((v) => {
  tabs.append(el('button', {
    id: `tab-${v.id}`, role: 'tab', 'aria-selected': 'false',
    text: v.label, onClick: () => go(v.id)
  }));
  main.append(el('section', { id: `view-${v.id}`, class: 'view', role: 'tabpanel' }));
});

/* The entrance, and a panel of its own so it can be shown and hidden like
   any view rather than by tearing the page down. */
const foyer = el('section', { id: 'view-foyer', class: 'view foyer' });
main.append(foyer);

let door = null;
let current = null;

/*
 * Which door, and where in it.
 *
 * The hash carries both — #check/grammar — so a reload, a back button and a
 * bookmark all land where they were. A bare tab name in the hash still
 * works, from an older link: the door it belongs to is worked out from it.
 */
function readHash() {
  const raw = location.hash.replace('#', '');
  if (!raw || raw === 'doors') return { door: null, view: null };
  const [a, b] = raw.split('/');
  const d = DOORS.find((x) => x.id === a);
  if (d) return { door: d.id, view: d.tabs.includes(b) ? b : d.land };
  const owner = DOORS.find((x) => x.tabs.includes(a));
  return owner ? { door: owner.id, view: a } : { door: null, view: null };
}

function openDoor(id, view) {
  const d = DOORS.find((x) => x.id === id);
  if (!d) { showFoyer(); return; }
  door = d.id;
  document.body.classList.add('has-door');
  document.body.setAttribute('data-door', d.id);
  /* Only this door's tabs. The others are not disabled, they are absent:
     a greyed-out tab is still a decision to make. */
  VIEWS.forEach((v) => {
    const t = document.getElementById(`tab-${v.id}`);
    if (t) t.hidden = !d.tabs.includes(v.id);
  });
  try { localStorage.setItem('scholar-door', d.id); } catch { /* private window */ }
  go(d.tabs.includes(view) ? view : d.land);
}

function showFoyer() {
  door = null;
  current = null;
  document.body.classList.remove('has-door');
  document.body.removeAttribute('data-door');
  location.hash = 'doors';
  VIEWS.forEach((v) => {
    document.getElementById(`view-${v.id}`).classList.remove('active');
    const t = document.getElementById(`tab-${v.id}`);
    if (t) t.hidden = true;
  });
  foyer.classList.add('active');
  drawFoyer();
  window.scrollTo(0, 0);
}

function drawFoyer() {
  mount(foyer,
    el('div', { class: 'foyer-inner' },
      el('h1', { class: 'foyer-title', text: 'What are you doing today?' }),
      el('p', { class: 'foyer-sub', text: 'Two ways in. Everything is the same work on the same library; this only decides which half is in front of you. You can swap at any time from the name in the corner.' }),
      el('div', { class: 'doors' }, DOORS.map((d) => el('button', {
        class: `door door-${d.id}`, id: `door-${d.id}`,
        onClick: () => openDoor(d.id, d.land)
      },
        el('span', { class: 'door-title', text: d.title }),
        el('span', { class: 'door-blurb', text: d.blurb }),
        el('ul', { class: 'door-list' }, d.doing.map((x) => el('li', { text: x }))),
        el('span', { class: 'door-go', text: 'Open \u2192' })
      ))),
      el('p', { class: 'foyer-foot', text: 'Nothing on either side needs the internet except the catalogue searches, and the switch in the corner stops even those.' })
    )
  );
}

function go(id) {
  const owner = DOORS.find((x) => x.tabs.includes(id));
  if (owner && owner.id !== door) { openDoor(owner.id, id); return; }
  current = id;
  foyer.classList.remove('active');
  location.hash = `${door}/${id}`;
  VIEWS.forEach((v) => {
    document.getElementById(`view-${v.id}`).classList.toggle('active', v.id === id);
    document.getElementById(`tab-${v.id}`).setAttribute('aria-selected', String(v.id === id));
  });
  draw(id);
  window.scrollTo(0, 0);
}

function draw(id) {
  const v = VIEWS.find((x) => x.id === id);
  if (!v) return;
  const section = document.getElementById(`view-${id}`);
  try {
    v.render(section, { go });
  } catch (err) {
    console.error(`Failed to render ${id}`, err);
    mount(section, el('div', { class: 'item loose' }, el('div', { class: 'body', text: `This view failed to render: ${err.message}` })));
  }
}

/* The contact address is sent to the catalogues only, and only to get into
   their polite pool. Pushed into both modules whenever settings change. */
function syncContact() {
  const email = getState().settings.contactEmail || '';
  setContactEmail(email);
  setPeopleEmail(email);
  setGatherEmail(email);
}
syncContact();

subscribe(() => { syncContact(); drawStorageWarning(); drawDeadlines(); if (current) draw(current); });
window.addEventListener('hashchange', () => {
  const want = readHash();
  if (!want.door) { if (door) showFoyer(); return; }
  if (want.door !== door) openDoor(want.door, want.view);
  else if (want.view && want.view !== current) go(want.view);
});

/* The wordmark is the way back to the doors, which is where a one-word
   mark in the corner already looks like it should go. */
const mark = document.querySelector('.wordmark');
if (mark) {
  mark.setAttribute('role', 'button');
  mark.setAttribute('tabindex', '0');
  mark.title = 'Back to the two doors';
  mark.addEventListener('click', showFoyer);
  mark.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showFoyer(); }
  });
}

wireOfflineSwitch();
drawStorageWarning();
drawDeadlines();

/*
 * Where to start.
 *
 * A link wins, then the door used last, then the foyer. Someone who has
 * been here before should not have to answer the same question daily; only
 * a first visit, or a deliberate click on the wordmark, shows the choice.
 */
const start = readHash();
let remembered = null;
try { remembered = localStorage.getItem('scholar-door'); } catch { /* private window */ }
if (start.door) openDoor(start.door, start.view);
else if (DOORS.some((d) => d.id === remembered)) openDoor(remembered, null);
else showFoyer();
window.__toast = toast;

/*
 * The app is left open for days at a time, so "today" has to be re-read
 * rather than fixed at load. Checked hourly and whenever the window is
 * brought back to the front, which is what actually catches the morning a
 * deadline turns from tomorrow into today.
 */
/*
 * Publish the header's real height.
 *
 * The panes on the Grammar tab stick below it and size themselves to what is
 * left of the window. The header wraps to two lines at narrow widths and
 * grows when the deadline banner appears, so a constant in the stylesheet
 * would be wrong exactly when space is tightest.
 */
function measureBar() {
  const bar = document.querySelector('header.bar');
  if (bar) document.documentElement.style.setProperty('--bar', `${Math.round(bar.getBoundingClientRect().height)}px`);
}
measureBar();
window.addEventListener('resize', measureBar);
if (typeof ResizeObserver === 'function') {
  const bar = document.querySelector('header.bar');
  if (bar) new ResizeObserver(measureBar).observe(bar);
}

setInterval(drawDeadlines, 3600000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) drawDeadlines(); });
