/* app.js — bootstrap and routing. Each view renders into its own section. */
import { $, el, mount, toast } from './ui.js';
import { subscribe, getState } from './store.js';
import { exportWorkbook, exportAllCsv } from './export/workbook.js';

import renderDashboard from './views/dashboard.js';
import renderStudents from './views/students.js';
import renderImport from './views/import.js';
import renderCourses from './views/courses.js';
import renderGradebook from './views/gradebook.js';
import renderAnalytics from './views/analytics.js';
import renderThesis from './views/thesis.js';
import renderCitations from './views/citations.js';
import renderIntegrity from './views/integrity.js';
import renderCompare from './views/compare.js';
import renderResearch from './views/research.js';
import renderSettings from './views/settings.js';

const VIEWS = [
  { id: 'dashboard', label: 'Overview',   render: renderDashboard },
  { id: 'students',  label: 'Students',   render: renderStudents },
  { id: 'courses',   label: 'Courses',    render: renderCourses },
  { id: 'import',    label: 'Import',     render: renderImport },
  { id: 'gradebook', label: 'Gradebook',  render: renderGradebook },
  { id: 'analytics', label: 'Analytics',  render: renderAnalytics },
  { id: 'thesis',    label: 'Thesis review', render: renderThesis },
  { id: 'citations', label: 'Citations',   render: renderCitations },
  { id: 'integrity', label: 'Integrity',   render: renderIntegrity },
  { id: 'compare',   label: 'Compare drafts', render: renderCompare },
  { id: 'research',  label: 'Research',    render: renderResearch },
  { id: 'settings',  label: 'Settings',   render: renderSettings }
];

let current = location.hash.replace('#', '') || 'dashboard';
if (!VIEWS.some((v) => v.id === current)) current = 'dashboard';

/* Views that own transient state (an analysed thesis, an in-progress diff)
   must not be blown away by an unrelated store update. */
const STICKY = new Set(['thesis', 'compare', 'citations', 'research', 'import', 'integrity']);
const rendered = new Set();

function buildTabs() {
  mount($('#tabs'), VIEWS.map((v) =>
    el('button', {
      class: 'tab',
      role: 'tab',
      id: `tab-${v.id}`,
      'aria-selected': String(v.id === current),
      text: v.label,
      onClick: () => go(v.id)
    })
  ));
}

function go(id) {
  current = id;
  location.hash = id;
  VIEWS.forEach((v) => {
    const section = document.getElementById(`view-${v.id}`);
    const tab = document.getElementById(`tab-${v.id}`);
    const active = v.id === id;
    section.classList.toggle('active', active);
    if (tab) tab.setAttribute('aria-selected', String(active));
  });
  renderView(id);
  window.scrollTo(0, 0);
}

function renderView(id, { force = false } = {}) {
  const view = VIEWS.find((v) => v.id === id);
  if (!view) return;
  if (STICKY.has(id) && rendered.has(id) && !force) return;
  const section = document.getElementById(`view-${id}`);
  try {
    view.render(section, { go, refresh: () => renderView(id, { force: true }) });
    rendered.add(id);
  } catch (err) {
    console.error(`Failed to render ${id}`, err);
    mount(section, el('div', { class: 'banner warn', text: `This view failed to render: ${err.message}` }));
  }
}

/* Re-render the visible view when data changes elsewhere. */
subscribe((event) => {
  if (event && event.type === 'toast') {
    toast(event.message, 'error');
    return;
  }
  if (event && event.silent) return;
  rendered.delete(current);
  renderView(current, { force: true });
});

$('#btn-export').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const state = getState();
  if (!state.courses.length && !state.students.length && !state.theses.length) {
    toast('Nothing to export yet — add students and a course first.');
    return;
  }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Building…';
  try {
    await exportWorkbook({ includeTheses: true });
    toast('Workbook downloaded.', 'good');
  } catch (err) {
    console.error(err);
    try {
      await exportAllCsv();
      toast('Excel library unavailable — exported CSV instead.', '');
    } catch (err2) {
      toast(err.message, 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#', '');
  if (id && id !== current && VIEWS.some((v) => v.id === id)) go(id);
});

buildTabs();
go(current);
