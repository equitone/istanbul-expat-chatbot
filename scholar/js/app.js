import { el, mount, toast } from './ui.js';
import { getState, subscribe, storageState, dismissWarning } from './store.js';
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

let current = location.hash.replace('#', '') || 'library';
if (!VIEWS.some((v) => v.id === current)) current = 'library';

function go(id) {
  current = id;
  location.hash = id;
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

subscribe(() => { syncContact(); drawStorageWarning(); drawDeadlines(); draw(current); });
window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#', '');
  if (id && id !== current && VIEWS.some((v) => v.id === id)) go(id);
});

drawStorageWarning();
drawDeadlines();
go(current);
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
