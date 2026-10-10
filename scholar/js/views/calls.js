/*
 * calls.js — what is open, and when it closes.
 *
 * Conferences, journal issues, edited volumes, prizes, travel grants,
 * fellowships: anything with a deadline and something to gain. Two halves,
 * and the split is deliberate.
 *
 * THE LIST IS YOURS. Everything you add by hand is reliable, sorted by
 * deadline, and tells you how long is left. That is the half that works
 * every time, and it is the half that matters: missing a deadline you knew
 * about is the common failure, not failing to hear about one.
 *
 * THE SOURCES ARE A ROTATION. There is no API for literature CFPs. The sites
 * that carry them are web pages, and a browser will not let a page running
 * on your own computer read most other sites. Where a site publishes a feed
 * and permits it, the items are fetched and any deadline in the text is
 * pulled out. Where it does not, the source keeps its place with a button
 * that opens it and the date you last looked, and the reason is stated in
 * plain words. An empty list that silently means "could not read" would say
 * "nothing is open", which is the one thing this must never say by accident.
 */
import { el, mount, sheet, tag, toast, clip, empty, figure } from '../ui.js';
import { getState, addCall, updateCall, removeCall, addFeed, updateFeed, removeFeed, KINDS, STATUSES } from '../store.js';
import { readFeed, urgency, daysUntil, SUGGESTED_SOURCES } from '../analysis/feeds.js';

const S = {
  tab: 'deadlines',
  filter: 'open',
  form: null,        /* the call being added or edited */
  feedForm: null,
  results: {},       /* feed id -> {ok, items, reason, at} */
  busy: null
};

const blankCall = () => ({ title: '', kind: 'cfp', status: 'watching', deadline: '', url: '', where: '', notes: '' });

export default function render(root, ctx) {
  const s = getState();
  const calls = s.calls.slice().sort(byDeadline);
  const open = calls.filter((c) => !['passed', 'declined'].includes(c.status) && (daysUntil(c.deadline) === null || daysUntil(c.deadline) >= 0));
  const soon = open.filter((c) => { const d = daysUntil(c.deadline); return d !== null && d <= 30; });

  mount(root,
    el('h1', { text: 'Calls' }),
    el('p', { class: 'lede', text: 'Conferences, journal issues, prizes, grants and fellowships, with what is left on the clock. Add anything you come across; the sites you check for new ones live under Sources.' }),

    calls.length ? sheet(null,
      el('div', { class: 'figures' },
        figure('open', open.length),
        figure('closing within a month', soon.length, soon.length ? 'the top of the list' : ''),
        figure('submitted', calls.filter((c) => c.status === 'submitted').length),
        figure('accepted', calls.filter((c) => c.status === 'accepted').length))) : null,

    el('div', { class: 'row', style: 'margin-bottom:22px' },
      el('div', { class: 'seg' },
        el('button', { 'aria-pressed': String(S.tab === 'deadlines'), text: `Deadlines (${calls.length})`,
          onClick: () => { S.tab = 'deadlines'; render(root, ctx); } }),
        el('button', { 'aria-pressed': String(S.tab === 'sources'), text: `Sources (${s.feeds.length})`,
          onClick: () => { S.tab = 'sources'; render(root, ctx); } }))),

    S.tab === 'deadlines' ? deadlines(calls, root, ctx) : sources(root, ctx)
  );
}

/* Soonest first; anything undated sits at the bottom rather than the top,
   because a missing date is not an urgent date. */
function byDeadline(a, b) {
  if (!a.deadline && !b.deadline) return a.title.localeCompare(b.title);
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return a.deadline.localeCompare(b.deadline);
}

/* ------------------------------------------------------------- deadlines */

function deadlines(calls, root, ctx) {
  const shown = calls.filter((c) => {
    if (S.filter === 'all') return true;
    const d = daysUntil(c.deadline);
    if (S.filter === 'open') return !['passed', 'declined'].includes(c.status) && (d === null || d >= 0);
    if (S.filter === 'closed') return d !== null && d < 0;
    return c.status === S.filter;
  });

  return el('div', {},
    sheet(null,
      S.form ? callForm(root, ctx) : el('div', { class: 'row' },
        el('button', { id: 'calls-add', class: 'solid', text: 'Add a call',
          onClick: () => { S.form = blankCall(); render(root, ctx); } }),
        el('div', { class: 'spacer' }),
        el('select', { onChange: (e) => { S.filter = e.target.value; render(root, ctx); } },
          [['open', 'Still open'], ['all', 'Everything'], ['closed', 'Closed'],
           ...STATUSES.map((x) => [x.id, x.label])].map(([id, label]) =>
            el('option', { value: id, selected: S.filter === id, text: label }))))
    ),

    shown.length
      ? sheet(null, shown.map((c) => callItem(c, root, ctx)))
      : sheet(null, empty(calls.length ? 'Nothing under that filter' : 'Nothing tracked yet',
          calls.length ? 'Change the filter above.' : 'Add the first one, or look under Sources for places that list them.',
          calls.length ? null : el('button', { class: 'solid', text: 'Add a call', onClick: () => { S.form = blankCall(); render(root, ctx); } })))
  );
}

function callItem(c, root, ctx) {
  const u = urgency(c.deadline);
  const kind = (KINDS.find((k) => k.id === c.kind) || {}).label || c.kind;
  return el('div', { class: `item${u.kind === 'past' ? ' loose' : ''}` },
    el('div', { class: 'head' },
      el('span', { text: kind }),
      c.deadline ? el('span', { text: c.deadline }) : el('span', { text: 'no deadline recorded' }),
      tag(u.label, u.kind === 'firm' ? 'firm' : ''),
      el('span', { text: (STATUSES.find((x) => x.id === c.status) || {}).label || c.status })),
    el('div', { class: 'title', text: c.title }),
    c.where ? el('div', { class: 'meta', text: c.where }) : null,
    c.notes ? el('div', { class: 'body', style: 'margin-top:6px', text: c.notes }) : null,
    el('div', { class: 'row tight', style: 'margin-top:8px' },
      c.url ? el('a', { href: c.url, target: '_blank', rel: 'noopener', class: 'note', text: 'open ↗' }) : null,
      el('select', { onChange: (e) => { updateCall(c.id, { status: e.target.value }); render(root, ctx); } },
        STATUSES.map((x) => el('option', { value: x.id, selected: c.status === x.id, text: x.label }))),
      el('button', { class: 'sm', text: 'Edit', onClick: () => { S.form = { ...c }; render(root, ctx); } }),
      el('button', { class: 'bare sm', text: 'Remove', onClick: () => {
        /* No undo here, so it asks. A deadline is the kind of thing that is
           hard to find again once it is gone from the list. */
        if (confirm(`Remove “${clip(c.title, 60)}” from the list?`)) { removeCall(c.id); render(root, ctx); }
      } }))
  );
}

function callForm(root, ctx) {
  const f = S.form;
  const editing = Boolean(f.id);
  return el('form', { onSubmit: (e) => { e.preventDefault(); saveCall(root, ctx); } },
    el('h2', { text: editing ? 'Edit this call' : 'Add a call' }),
    el('label', { class: 'field' },
      el('span', { text: 'What it is' }),
      el('input', { id: 'call-title', value: f.title, placeholder: 'ACLA 2027 seminar: translation and exile',
        onInput: (e) => { f.title = e.target.value; } })),
    el('div', { class: 'cols' },
      el('label', { class: 'field' },
        el('span', { text: 'Kind' }),
        el('select', { onChange: (e) => { f.kind = e.target.value; } },
          KINDS.map((k) => el('option', { value: k.id, selected: f.kind === k.id, text: k.label })))),
      el('label', { class: 'field' },
        el('span', { text: 'Deadline' }),
        el('input', { id: 'call-deadline', type: 'date', value: f.deadline,
          onInput: (e) => { f.deadline = e.target.value; } }))),
    el('label', { class: 'field' },
      el('span', { text: 'Link' }),
      el('input', { id: 'call-url', type: 'url', value: f.url, placeholder: 'https://…',
        onInput: (e) => { f.url = e.target.value; } })),
    el('div', { class: 'cols' },
      el('label', { class: 'field' },
        el('span', { text: 'Where it is, or who runs it' }),
        el('input', { value: f.where, placeholder: 'Boğaziçi University, or MLA',
          onInput: (e) => { f.where = e.target.value; } })),
      el('label', { class: 'field' },
        el('span', { text: 'Status' }),
        el('select', { onChange: (e) => { f.status = e.target.value; } },
          STATUSES.map((x) => el('option', { value: x.id, selected: f.status === x.id, text: x.label }))))),
    el('label', { class: 'field' },
      el('span', { text: 'Notes' }),
      el('textarea', { rows: 2, value: f.notes, placeholder: 'What to send, word limit, whether travel is funded.',
        onInput: (e) => { f.notes = e.target.value; } })),
    el('div', { class: 'row', style: 'margin-top:12px' },
      el('button', { class: 'solid', type: 'submit', text: editing ? 'Save' : 'Add it' }),
      el('button', { class: 'bare sm', type: 'button', text: 'Cancel', onClick: () => { S.form = null; render(root, ctx); } }))
  );
}

function saveCall(root, ctx) {
  const f = S.form;
  if (!f.title.trim()) { toast('Give it a name, at least.'); return; }
  if (f.id) { updateCall(f.id, f); toast('Saved.'); }
  else { addCall(f); toast('Added.'); }
  S.form = null;
  render(root, ctx);
}

/* --------------------------------------------------------------- sources */

function sources(root, ctx) {
  const s = getState();
  return el('div', {},
    sheet(null,
      S.feedForm ? feedForm(root, ctx) : el('div', { class: 'row' },
        el('button', { id: 'feed-add', class: 'solid', text: 'Add a site',
          onClick: () => { S.feedForm = { name: '', site: '', feed: '', about: '' }; render(root, ctx); } }),
        s.feeds.length
          ? el('button', { class: 'sm', disabled: Boolean(S.busy), text: 'Check all that can be read',
              onClick: () => checkAll(root, ctx) })
          : null,
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null),
      el('p', { class: 'note', style: 'margin-top:10px', text: 'Most of these sites will not let a page on your own computer read them — that is the browser protecting you, not a fault here. Those keep an open button and the date you last looked. Where a site publishes a feed that permits it, the items appear below it.' })
    ),

    s.feeds.length
      ? s.feeds.map((f) => feedItem(f, root, ctx))
      : sheet(null, empty('No sites yet', 'Add your own, or start from the list below.')),

    suggestions(root, ctx)
  );
}

function feedItem(f, root, ctx) {
  const r = S.results[f.id];
  return sheet(null,
    el('div', { class: 'row' },
      el('div', {},
        el('div', { class: 'title', text: f.name }),
        f.about ? el('div', { class: 'meta', text: f.about }) : null,
        el('div', { class: 'note', text: f.lastChecked ? `Last opened or checked ${f.lastChecked}.` : 'Not checked yet.' })),
      el('div', { class: 'spacer' }),
      f.site ? el('a', { href: f.site, target: '_blank', rel: 'noopener', class: 'button sm',
        onClick: () => { updateFeed(f.id, { lastChecked: today() }); }, text: 'Open the site ↗' }) : null,
      f.feed ? el('button', { class: 'sm', disabled: Boolean(S.busy), text: 'Read the feed',
        onClick: () => check(f, root, ctx) }) : null,
      el('button', { class: 'bare sm', text: 'Remove', onClick: () => { removeFeed(f.id); delete S.results[f.id]; render(root, ctx); } })
    ),

    r && !r.ok ? el('div', { class: 'item loose', style: 'margin-top:12px' },
      el('div', { class: 'body', text: r.reason }),
      f.site ? el('div', { class: 'note', style: 'margin-top:6px' },
        'Open it in a tab instead: ', el('a', { href: f.site, target: '_blank', rel: 'noopener', text: f.site })) : null) : null,

    r && r.ok ? el('div', { style: 'margin-top:14px' },
      el('p', { class: 'note', style: 'margin-bottom:10px',
        text: `${r.items.length} item(s), read ${r.at}. A deadline is shown only where one was written plainly enough to read; check the page before trusting it.` }),
      r.items.map((it) => el('div', { class: 'item' },
        el('div', { class: 'head' },
          it.deadline ? tag(urgency(it.deadline).label, urgency(it.deadline).kind === 'firm' ? 'firm' : '') : el('span', { text: 'no deadline found' }),
          it.published ? el('span', { text: `posted ${it.published}` }) : null),
        el('div', { class: 'title', text: it.title }),
        it.summary ? el('div', { class: 'body', style: 'font-size:14px', text: clip(it.summary, 320) }) : null,
        el('div', { class: 'row tight', style: 'margin-top:8px' },
          it.link ? el('a', { href: it.link, target: '_blank', rel: 'noopener', class: 'note', text: 'open ↗' }) : null,
          el('button', { class: 'sm', text: 'Track this', onClick: () => {
            addCall({ title: it.title, url: it.link, deadline: it.deadline || '', where: f.name,
              notes: clip(it.summary, 400), kind: guessKind(`${it.title} ${it.summary}`) });
            toast('Added to your deadlines.');
            S.tab = 'deadlines';
            render(root, ctx);
          } }))
      ))) : null
  );
}

/* A guess from the wording, corrigible in one click on the form. */
function guessKind(text) {
  const t = String(text).toLowerCase();
  if (/\b(prize|award|medal)\b/.test(t)) return 'prize';
  if (/\b(fellowship|residency)\b/.test(t)) return 'fellowship';
  if (/\b(grant|funding|bursary|travel (?:award|support))\b/.test(t)) return 'grant';
  if (/\b(special issue|journal)\b/.test(t)) return 'journal';
  if (/\b(edited (?:volume|collection)|chapter)\b/.test(t)) return 'volume';
  if (/\b(conference|symposium|congress|convention|seminar)\b/.test(t)) return 'conference';
  return 'cfp';
}

function feedForm(root, ctx) {
  const f = S.feedForm;
  return el('form', { onSubmit: (e) => { e.preventDefault(); saveFeed(root, ctx); } },
    el('h2', { text: 'Add a site to check' }),
    el('div', { class: 'cols' },
      el('label', { class: 'field' },
        el('span', { text: 'Name' }),
        el('input', { id: 'feed-name', value: f.name, placeholder: 'UPenn CFP',
          onInput: (e) => { f.name = e.target.value; } })),
      el('label', { class: 'field' },
        el('span', { text: 'Address of the page' }),
        el('input', { id: 'feed-site', type: 'url', value: f.site, placeholder: 'https://…',
          onInput: (e) => { f.site = e.target.value; } }))),
    el('label', { class: 'field' },
      el('span', { text: 'Feed address, if it has one (optional)' }),
      el('input', { id: 'feed-url', type: 'url', value: f.feed, placeholder: 'https://…/rss.xml',
        onInput: (e) => { f.feed = e.target.value; } }),
      'Look for an RSS or Atom link on the site. With one, the app can try to read it; without one, it is a link you open.'),
    el('label', { class: 'field' },
      el('span', { text: 'What it carries' }),
      el('input', { value: f.about, placeholder: 'Conference and journal calls in comparative literature',
        onInput: (e) => { f.about = e.target.value; } })),
    el('div', { class: 'row', style: 'margin-top:12px' },
      el('button', { class: 'solid', type: 'submit', text: 'Add it' }),
      el('button', { class: 'bare sm', type: 'button', text: 'Cancel', onClick: () => { S.feedForm = null; render(root, ctx); } }))
  );
}

function saveFeed(root, ctx) {
  const f = S.feedForm;
  if (!f.site.trim() && !f.feed.trim()) { toast('Give it an address.'); return; }
  addFeed(f);
  S.feedForm = null;
  toast('Added.');
  render(root, ctx);
}

function suggestions(root, ctx) {
  const have = new Set(getState().feeds.map((f) => `${f.site}|${f.feed}`));
  const left = SUGGESTED_SOURCES.filter((x) => !have.has(`${x.site}|${x.feed}`));
  if (!left.length) return null;
  return sheet('Places that carry these',
    el('p', { class: 'note', style: 'margin-bottom:14px', text: 'A starting list, not an endorsement, and addresses go stale. Add the ones you use and delete the rest.' }),
    left.map((x) => el('div', { class: 'item' },
      el('div', { class: 'title', text: x.name }),
      el('div', { class: 'body', style: 'font-size:14px', text: x.about }),
      el('div', { class: 'row tight', style: 'margin-top:8px' },
        el('a', { href: x.site, target: '_blank', rel: 'noopener', class: 'note', text: 'look at it ↗' }),
        el('button', { class: 'sm', text: 'Add to my sources', onClick: () => { addFeed(x); render(root, ctx); } }),
        x.feed ? el('span', { class: 'note', text: 'has a feed' }) : el('span', { class: 'note', text: 'no feed — a link to open' }))
    ))
  );
}

const today = () => new Date().toISOString().slice(0, 10);

async function check(f, root, ctx) {
  S.busy = `Reading ${f.name}…`;
  render(root, ctx);
  const r = await readFeed(f.feed);
  S.results[f.id] = { ...r, at: today() };
  updateFeed(f.id, { lastChecked: today() });
  S.busy = null;
  render(root, ctx);
}

async function checkAll(root, ctx) {
  const feeds = getState().feeds.filter((f) => f.feed);
  if (!feeds.length) { toast('None of your sources has a feed address.'); return; }
  let done = 0;
  for (const f of feeds) {
    done += 1;
    S.busy = `Reading ${done} of ${feeds.length}…`;
    render(root, ctx);
    /* One at a time: a handful of parallel requests to sites that will mostly
       refuse buys nothing and looks like a scraper. */
    const r = await readFeed(f.feed);
    S.results[f.id] = { ...r, at: today() };
    updateFeed(f.id, { lastChecked: today() });
  }
  const ok = feeds.filter((f) => S.results[f.id] && S.results[f.id].ok).length;
  S.busy = null;
  render(root, ctx);
  toast(`${ok} of ${feeds.length} could be read. The rest have to be opened in a tab.`);
}
