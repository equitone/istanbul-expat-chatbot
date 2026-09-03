import { el, mount, stat, chip, int, num, pct, toast, banner, emptyState, escapeHtml } from '../ui.js';
import { getState } from '../store.js';
import { compareDocuments } from '../analysis/compare.js';
import { buildSimpleReport, openPrintable, downloadReport } from '../export/report.js';
import { extractText, SUPPORTED, downloadText } from '../io/files.js';

const S = { a: null, b: null, result: null, busy: null, filter: 'all' };

export default function renderCompare(root, ctx) {
  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Compare drafts' }),
        el('p', { text: 'Two versions of the same thesis in, an exact list of what changed out. No model, no guessing — the same two files always produce the same answer, and every change shown is a real change.' })
      ),
      el('div', { class: 'spacer' }),
      S.result ? el('button', { text: 'Start over', onClick: () => { S.a = null; S.b = null; S.result = null; renderCompare(root, ctx); } }) : null,
      S.result ? el('button', { text: 'Export change list', onClick: exportDiff }) : null,
      S.result ? el('button', { class: 'primary', text: 'Report for student', onClick: () => printDiff() }) : null
    ),
    el('div', { class: 'card' },
      el('div', { class: 'grid cols-2' },
        slot('a', 'Earlier draft', root, ctx),
        slot('b', 'Newer draft', root, ctx)
      ),
      el('div', { class: 'row', style: 'margin-top:14px' },
        el('button', {
          class: 'primary',
          disabled: !(S.a && S.b) || Boolean(S.busy),
          text: 'Compare',
          onClick: () => runCompare(root, ctx)
        }),
        S.busy ? el('span', { class: 'hint' }, el('span', { class: 'spinner' }), ` ${S.busy}`) : null
      )
    ),
    S.result ? results(root, ctx) : null
  );
}

function slot(key, label, root, ctx) {
  const loaded = S[key];
  const id = `cmp-${key}`;
  const drop = el('div', { class: `dropzone${loaded ? '' : ''}` },
    loaded
      ? el('div', {},
          el('strong', { text: loaded.name }),
          el('p', { class: 'hint', text: `${int(loaded.words)} words · ${int(loaded.chars)} characters` }),
          el('button', { class: 'sm', text: 'Replace', onClick: () => document.getElementById(id).click() })
        )
      : el('div', {},
          el('strong', { text: label }),
          el('p', { class: 'hint', text: 'Drop a file, or choose one' }),
          el('button', { class: 'sm', text: 'Choose file', onClick: () => document.getElementById(id).click() })
        ),
    el('input', { type: 'file', id, accept: SUPPORTED, style: 'display:none', onChange: (e) => e.target.files[0] && load(key, e.target.files[0], root, ctx) })
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files[0]) load(key, e.dataTransfer.files[0], root, ctx);
  });
  return el('div', {}, el('h2', { text: label }), drop);
}

async function load(key, file, root, ctx) {
  S.busy = `Reading ${file.name}…`;
  renderCompare(root, ctx);
  try {
    const { text } = await extractText(file);
    S[key] = { name: file.name, text, words: (text.match(/[\p{L}\p{N}]+/gu) || []).length, chars: text.length };
    S.result = null;
  } catch (err) {
    toast(err.message, 'error');
  }
  S.busy = null;
  renderCompare(root, ctx);
}

function runCompare(root, ctx) {
  S.busy = 'Diffing…';
  renderCompare(root, ctx);
  setTimeout(() => {
    try {
      S.result = compareDocuments(S.a.text, S.b.text);
    } catch (err) {
      toast(`Comparison failed: ${err.message}`, 'error');
    }
    S.busy = null;
    renderCompare(root, ctx);
  }, 20);
}

function results(root, ctx) {
  const { changes, summary } = S.result;
  if (summary.identical) {
    return el('div', { class: 'card' }, banner('info', 'These two documents are identical once whitespace and punctuation styling are normalised. Nothing changed.'));
  }

  const filters = [
    ['all', `All (${changes.length})`],
    ['modified', `Edited (${summary.modified})`],
    ['added', `Added (${summary.added})`],
    ['removed', `Removed (${summary.removed})`],
    ['moved', `Moved (${summary.moved})`]
  ];
  const visible = S.filter === 'all' ? changes : changes.filter((c) => c.type === S.filter);

  return el('div', {},
    el('div', { class: 'grid cols-4', style: 'margin-bottom:16px' },
      stat('Changed', pct(summary.changedShare), `${summary.unchanged} of ${summary.newParagraphs} paragraphs untouched`, summary.changedShare > 0.5 ? 'accent' : ''),
      stat('Words added', `+${int(summary.wordsAdded)}`, `${int(summary.oldWords)} → ${int(summary.newWords)}`, 'good'),
      stat('Words removed', `−${int(summary.wordsRemoved)}`, `net ${summary.netWords >= 0 ? '+' : ''}${int(summary.netWords)}`, summary.wordsRemoved > summary.wordsAdded ? 'high' : ''),
      stat('Change blocks', int(changes.length), `${summary.modified} edited · ${summary.added} new · ${summary.removed} cut · ${summary.moved} moved`)
    ),
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      filters.map(([id, label]) => el('button', {
        class: S.filter === id ? 'primary sm' : 'sm',
        text: label,
        onClick: () => { S.filter = id; renderCompare(root, ctx); }
      }))
    ),
    el('div', { class: 'card' },
      visible.length
        ? visible.map((c, i) => changeBlock(c, i))
        : el('p', { class: 'hint', text: 'No changes of this kind.' })
    )
  );
}

function changeBlock(c, i) {
  const tone = { added: 'good', removed: 'high', modified: 'accent', moved: 'medium' }[c.type];
  const where = c.newIndex !== null && c.newIndex !== undefined ? `¶${c.newIndex + 1} of the new draft` : `¶${c.oldIndex + 1} of the old draft`;

  let body;
  if (c.type === 'modified') {
    const html = c.tokens.map((t) =>
      t.type === 'same'
        ? escapeHtml(t.text)
        : t.type === 'add'
          ? `<ins style="background:var(--good-soft);color:var(--good);text-decoration:none;border-radius:2px;padding:0 2px">${escapeHtml(t.text)}</ins>`
          : `<del style="background:var(--high-soft);color:var(--high);border-radius:2px;padding:0 2px">${escapeHtml(t.text)}</del>`
    ).join('');
    body = el('div', { class: 'reader', style: 'max-height:none;padding:12px 14px;font-size:14px', html });
  } else if (c.type === 'moved') {
    body = el('div', {},
      el('p', { class: 'hint', text: `Identical text, relocated from position ${c.oldIndex + 1} to ${c.newIndex + 1}.` }),
      el('div', { class: 'reader', style: 'max-height:none;padding:12px 14px;font-size:14px', text: c.newText })
    );
  } else {
    body = el('div', {
      class: 'reader',
      style: `max-height:none;padding:12px 14px;font-size:14px;${c.type === 'removed' ? 'background:var(--high-soft)' : 'background:var(--good-soft)'}`,
      text: c.type === 'added' ? c.newText : c.oldText
    });
  }

  return el('div', { style: 'margin-bottom:16px' },
    el('div', { class: 'row tight', style: 'margin-bottom:6px' },
      chip(c.type, tone),
      el('span', { class: 'hint', text: where }),
      c.type === 'modified' ? el('span', { class: 'hint', text: `· ${pct(c.similarity)} unchanged` }) : null,
      el('span', { class: 'hint', text: `· ${int(c.words)} words` })
    ),
    body
  );
}

function exportDiff() {
  const { changes, summary } = S.result;
  const lines = [
    `DRAFT COMPARISON`,
    `Earlier: ${S.a.name} (${summary.oldWords} words)`,
    `Newer:   ${S.b.name} (${summary.newWords} words)`,
    ``,
    `${summary.modified} edited, ${summary.added} added, ${summary.removed} removed, ${summary.moved} moved.`,
    `${summary.wordsAdded} words added, ${summary.wordsRemoved} removed (net ${summary.netWords >= 0 ? '+' : ''}${summary.netWords}).`,
    `${Math.round(summary.changedShare * 100)}% of the new draft is not carried over unchanged.`,
    ``, '='.repeat(70), ''
  ];
  changes.forEach((c, i) => {
    lines.push(`[${c.type.toUpperCase()}] ${c.newIndex !== null && c.newIndex !== undefined ? `new ¶${c.newIndex + 1}` : `old ¶${c.oldIndex + 1}`}`);
    if (c.type === 'modified') {
      lines.push(c.tokens.map((t) => (t.type === 'same' ? t.text : t.type === 'add' ? `{+${t.text}+}` : `[-${t.text}-]`)).join(''));
    } else {
      lines.push(c.newText || c.oldText);
    }
    lines.push('', '-'.repeat(70), '');
  });
  downloadText(lines.join('\n'), `draft-comparison-${Date.now()}.txt`);
}

/*
 * The change list as a document the student can be sent.
 *
 * Same page shell as the thesis report, so it prints with the same colours
 * and, like that one, references nothing outside itself.
 */
function printDiff() {
  const { changes, summary } = S.result;
  const label = { modified: 'Edited', added: 'Added', removed: 'Removed', moved: 'Moved', unchanged: 'Unchanged' };
  const listed = changes.filter((c) => c.type !== 'unchanged');

  const html = buildSimpleReport({
    title: 'What changed between the two drafts',
    subtitle: [S.a && S.a.name, S.b && S.b.name].filter(Boolean).join('  →  '),
    instructor: getState().settings.instructor || '',
    institution: getState().settings.institution || '',
    blocks: [
      { tiles: [
          ['Edited', String(summary.modified)],
          ['Added', String(summary.added)],
          ['Removed', String(summary.removed)],
          ['Moved', String(summary.moved)],
          ['Untouched', String(summary.unchanged)],
          ['Net words', `${summary.netWords >= 0 ? '+' : ''}${summary.netWords}`]
        ] },
      { heading: 'Every change', count: listed.length,
        lead: listed.length
          ? 'Paragraph by paragraph, in the order they appear in the new draft.'
          : 'Nothing changed between these two files.',
        table: {
          headers: ['#', 'What happened', 'Text'],
          rows: listed.slice(0, 200).map((c, i) => [
            String(i + 1),
            label[c.type] || c.type,
            clipText((c.type === 'removed' ? c.oldText : c.newText) || c.oldText || '', 320)
          ])
        } },
      listed.length > 200 ? { caveat: `Only the first 200 changes are listed; there are ${listed.length}.` } : null,
      { caveat: 'Paragraphs are matched by similarity, so a paragraph rewritten from scratch is reported as one removal and one addition rather than as an edit.' }
    ]
  });

  try { openPrintable(html); } catch (err) {
    downloadReport(html, `draft-changes-${new Date().toISOString().slice(0, 10)}.html`);
    toast('Pop-up blocked, so the report was downloaded instead.', '');
  }
}

const clipText = (t, n) => {
  const one = String(t || '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
