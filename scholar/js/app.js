import { el, mount, toast } from './ui.js';
import { getState, subscribe, storageState } from './store.js';
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
import renderSettings from './views/settings.js';

const VIEWS = [
  { id: 'library', label: 'Library', render: renderLibrary },
  { id: 'search', label: 'Find', render: renderSearch },
  { id: 'gaps', label: 'Gaps', render: renderGaps },
  { id: 'evaluate', label: 'Evaluate', render: renderEvaluate },
  { id: 'write', label: 'Write', render: renderWrite },
  { id: 'grammar', label: 'Grammar', render: renderGrammar },
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

subscribe(() => { syncContact(); drawStorageWarning(); draw(current); });
window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#', '');
  if (id && id !== current && VIEWS.some((v) => v.id === id)) go(id);
});

drawStorageWarning();
go(current);
window.__toast = toast;
