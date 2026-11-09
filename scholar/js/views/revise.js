/*
 * revise.js — paste a passage, get it edited.
 *
 * The honest shape of this is in js/analysis/revise.js: the mechanical
 * edits are made, the judgement calls are listed, and nothing is generated.
 * This view's one job beyond showing that is to keep the two kinds apart on
 * screen, so "I changed this for you" is never confused with "you need to
 * deal with this".
 */
import { el, mount, sheet, tag, toast, figure, empty } from '../ui.js';
import { getState } from '../store.js';
import { revise } from '../analysis/revise.js';
import { findTells, readTells } from '../analysis/tells.js';

const S = { text: '', out: null, busy: null, before: null };

export default function render(root, ctx) {
  mount(root,
    el('h1', { text: 'Revise' }),
    el('p', { class: 'lede', text: 'Paste a passage and it is edited here: the flagged words swapped, the empty openers cut, the spelling and punctuation corrected. The edits that need a decision about meaning are listed for you instead of guessed at.' }),

    sheet(null,
      el('p', { class: 'note', style: 'margin-bottom:14px', text: 'This does not turn machine prose into human prose. Nothing can, and a tool that said it could would be lying to you. What it does is remove specific marks from writing that is already yours, and tell you which ones it will not touch, and why.' }),
      el('label', { class: 'field' },
        el('span', { text: 'Your text' }),
        el('textarea', {
          id: 'rev-in', rows: 9, value: S.text,
          placeholder: 'Paste the abstract, the paragraph, the chapter.',
          onInput: (e) => { S.text = e.target.value; S.out = null; }
        })),
      el('div', { class: 'row' },
        el('button', { id: 'rev-run', class: 'solid', disabled: Boolean(S.busy),
          text: 'Revise it', onClick: () => run(root, ctx) }),
        S.out ? el('button', { class: 'sm', text: 'Copy the revised text',
          onClick: () => copy(S.out.text) }) : null,
        S.out ? el('button', { class: 'bare sm', text: 'Start again',
          onClick: () => { S.text = ''; S.out = null; S.before = null; render(root, ctx); } }) : null,
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null)
    ),

    S.out ? result(root, ctx) : null
  );
}

function result(root, ctx) {
  const o = S.out;
  const after = findTells(o.text);
  const before = S.before;
  return el('div', {},
    sheet('What changed',
      el('div', { class: 'figures' },
        figure('edits made', o.changed),
        figure('left to you', o.left.length),
        figure('flagged patterns', `${before.findings.length} → ${after.findings.length}`),
        figure('words', o.text.split(/\s+/).filter(Boolean).length)),
      el('p', { class: 'note', text: readTells(after) }),
      o.spellingRan === false
        ? el('p', { class: 'note', text: `Spelling was not checked or corrected: the dictionary did not load (${o.spellingReason}).` })
        : null),

    sheet('The revised text',
      el('p', { class: 'abstract-out', id: 'rev-out', text: o.text })),

    o.applied.length
      ? sheet(`Edits made (${o.applied.length})`,
          el('div', {}, o.applied.map((e) => el('div', { class: 'item loose' },
            el('div', { class: 'head' }, el('span', { class: 'mono', text: e.rule })),
            el('div', { class: 'body' },
              el('del', { text: e.from }), ' → ',
              el('strong', { text: e.to || '(cut)' })),
            el('div', { class: 'meta', style: 'margin-top:4px', text: e.why })))))
      : sheet(null, empty('Nothing to change mechanically', 'None of the edits this can make safely applied to your text.')),

    o.left.length
      ? sheet(`Left for you (${o.left.length})`,
          el('p', { class: 'note', style: 'margin-bottom:14px', text: 'Each of these needs a decision about what you meant. Making that decision for you would be writing your abstract rather than editing it, which is the thing this app will not do.' }),
          el('div', {}, o.left.map((f) => el('div', { class: 'item loose' },
            el('div', { class: 'head' }, el('span', { class: 'mono', text: f.rule })),
            f.excerpt ? el('div', { class: 'body' }, el('mark', { text: f.excerpt })) : null,
            el('div', { class: 'meta', style: 'margin-top:4px', text: f.message }),
            el('div', { class: 'note', style: 'margin-top:4px', text: f.why })))))
      : null
  );
}

async function run(root, ctx) {
  const text = S.text.trim();
  if (text.length < 40) { toast('Paste a bit more than that.'); return; }
  S.busy = 'Revising…';
  render(root, ctx);
  try {
    S.before = findTells(text);
    S.out = await revise(text, { settings: getState().settings });
  } catch (err) {
    toast(`Could not revise it: ${err.message}`);
  }
  S.busy = null;
  render(root, ctx);
}

function copy(text) {
  navigator.clipboard.writeText(text)
    .then(() => toast('Copied.'))
    .catch(() => toast('This browser would not let the page copy. Select the text and copy it yourself.'));
}
