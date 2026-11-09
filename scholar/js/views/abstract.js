/*
 * abstract.js — the abstract tab.
 *
 * Five boxes, your sentences, assembled. See js/analysis/abstract.js for why
 * nothing here generates prose; the short version is that a model-written
 * abstract is machine-written however it is afterwards rephrased, and this
 * tab exists so there is nothing to detect rather than something to hide.
 *
 * What it does instead is the work around the writing: keeping the moves in
 * the order a reader expects, counting against the limit the call gave you,
 * naming which move to cut when you are over, and running the finished
 * paragraph through the same checks as the rest of the app.
 */
import { el, mount, sheet, tag, toast, field, figure, empty } from '../ui.js';
import { getState, saveDraft } from '../store.js';
import { MOVES, TARGETS, DEFAULT_TARGET, assemble, review, countWords } from '../analysis/abstract.js';
import { findTells, readTells } from '../analysis/tells.js';
import { buildDocument } from '../analysis/text.js';
import { analyseGrammar } from '../analysis/grammar.js';
import { analyseMechanics } from '../analysis/mechanics.js';
import { analysePunctuation } from '../analysis/punctuation.js';
import { analyseSpelling, DIALECTS as SPELL_DIALECTS } from '../analysis/spelling.js';

const S = {
  values: {},
  target: DEFAULT_TARGET,
  checked: null,
  busy: null
};

export default function render(root, ctx) {
  const s = getState();
  const r = review(S.values, S.target);

  mount(root,
    el('h1', { text: 'Abstract' }),
    el('p', { class: 'lede', text: 'Five questions about your paper, answered in your own sentences, assembled into one paragraph in the order a reader expects. Nothing here is written by a model.' }),

    sheet(null,
      el('p', { class: 'note', style: 'margin-bottom:14px', text: 'A model could draft this, and then the abstract would be machine-written, whatever was done to it afterwards — and nobody can tell you what a detector would make of it, because detectors are wrong in both directions and do not publish how they score. So this does the part that can be done honestly: it holds the structure, counts the words, and checks the prose. The sentences are yours, so there is nothing to detect.' }),
      el('div', { class: 'row', style: 'margin-bottom:4px' },
        field('Word limit', el('input', {
          id: 'abs-target', type: 'number', min: '50', max: '2000', value: String(S.target),
          style: 'max-width:120px',
          onInput: (e) => { S.target = Number(e.target.value) || DEFAULT_TARGET; paint(root, ctx); }
        }), 'Whatever the call for papers says. These are starting points, not a rule.'),
        el('div', { class: 'row tight', style: 'align-items:flex-end;padding-bottom:18px' },
          TARGETS.map((t) => el('button', {
            class: 'sm', 'aria-pressed': String(S.target === t.id), text: t.label,
            onClick: () => { S.target = t.id; render(root, ctx); }
          }))))
    ),

    sheet('The five moves',
      el('p', { class: 'note', style: 'margin-bottom:16px', text: 'From the move analysis of abstracts in Ken Hyland’s Disciplinary Discourses (2000) — introduction, purpose, method, product, conclusion — which descends from John Swales’s Genre Analysis (1990). No copy of either ships here, so this names the framework rather than quoting it, and the questions are worded for a literature department.' }),
      MOVES.map((m) => el('label', { class: 'field' },
        el('span', {},
          m.label,
          el('span', { class: 'mono', style: 'margin-left:10px;opacity:.6;font-size:11px', text: m.move })),
        el('textarea', {
          id: `abs-${m.id}`, rows: 2, value: S.values[m.id] || '',
          placeholder: m.placeholder,
          onInput: (e) => { S.values[m.id] = e.target.value; S.checked = null; paint(root, ctx); }
        }),
        el('div', { class: 'note', style: 'margin-top:4px' },
          m.hint,
          el('span', { class: 'mono', id: `count-${m.id}`, style: 'margin-left:10px',
            text: countLabel(S.values[m.id]) }))))
    ),

    assembled(r, root, ctx),
    S.checked ? results(S.checked) : null
  );
}

const countLabel = (v) => {
  const n = countWords(v);
  return n ? `${n} word${n === 1 ? '' : 's'}` : '';
};

/*
 * Repaint only the live numbers.
 *
 * A full render on every keystroke takes the cursor out of the box you are
 * typing in, which is the one thing a writing tool must never do.
 */
function paint(root, ctx) {
  MOVES.forEach((m) => {
    const c = document.getElementById(`count-${m.id}`);
    if (c) c.textContent = countLabel(S.values[m.id]);
  });
  const r = review(S.values, S.target);
  const out = document.getElementById('abs-out');
  if (out) out.textContent = r.text || '';
  const tally = document.getElementById('abs-tally');
  if (tally) tally.textContent = tallyText(r);
  const run = document.getElementById('abs-check');
  if (run) run.disabled = !r.text;
}

function tallyText(r) {
  if (!r.text) return 'Nothing yet.';
  const bits = [`${r.words} of ${r.limit} words`];
  if (r.over) bits.push(`${r.over} over the limit`);
  else if (r.under > 0) bits.push(`${r.under} to spare`);
  if (r.missing.length) {
    bits.push(`${r.missing.length} move${r.missing.length === 1 ? '' : 's'} still empty`);
  }
  return bits.join(' · ');
}

function assembled(r, root, ctx) {
  return sheet('The abstract',
    el('div', { class: 'row', style: 'margin-bottom:10px' },
      el('span', { class: 'note mono', id: 'abs-tally', text: tallyText(r) }),
      el('div', { class: 'spacer' }),
      r.over ? tag(`${r.over} over`, 'firm') : null),

    el('p', { id: 'abs-out', class: 'abstract-out', text: r.text || '' }),
    !r.text ? empty('Nothing yet', 'Answer a move or two above and the paragraph builds itself here.') : null,

    /* Where to cut, named. "Be concise" is not advice. */
    r.over && r.longest
      ? el('p', { class: 'note', text: `You are ${r.over} over. The longest move is “${r.longest.move.label}” at ${r.longest.words} words; that is usually where the room is.` })
      : null,
    r.missing.length
      ? el('p', { class: 'note', text: `Still empty: ${r.missing.map((m) => m.label.toLowerCase()).join('; ')}.` })
      : null,

    el('div', { class: 'row', style: 'margin-top:14px' },
      el('button', { id: 'abs-check', class: 'solid', disabled: !r.text,
        text: 'Check it', onClick: () => check(root, ctx) }),
      el('button', { class: 'sm', disabled: !r.text, text: 'Copy',
        onClick: () => copy(r.text) }),
      el('button', { class: 'sm', disabled: !r.text, text: 'Keep it with my drafts',
        onClick: () => keep(r) }),
      S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null)
  );
}

/* ------------------------------------------------------------- the check */

async function check(root, ctx) {
  const s = getState();
  const r = review(S.values, S.target);
  if (!r.text) return;
  S.busy = 'Checking…';
  render(root, ctx);
  try {
    const doc = buildDocument(r.text);
    const dialect = s.settings.spellDialect || SPELL_DIALECTS[0].id;
    const sp = await analyseSpelling(doc, { dialect, personal: s.settings.personalWords || [] });
    /*
     * The same three buckets the Grammar tab shows, and for the same
     * reason: style rules are matters of taste, the passive-voice rule
     * among them, and this tab is not the place to argue about them. The
     * register question is answered above, by the check built for it.
     */
    const SHOWN = new Set(['grammar', 'punctuation', 'typo']);
    const issues = [
      ...analyseGrammar(doc).issues,
      ...analyseMechanics(doc).issues.filter((i) => i.rule !== 'misspelling'),
      ...analysePunctuation(doc, { style: s.settings.punctuationStyle }).issues,
      ...sp.issues
    ].filter((i) => SHOWN.has(i.category)).sort((a, b) => a.start - b.start);
    S.checked = { tells: findTells(r.text), issues, spelling: sp, words: r.words };
  } catch (err) {
    toast(`Could not check it: ${err.message}`);
  }
  S.busy = null;
  render(root, ctx);
}

/*
 * Two verdicts, kept apart.
 *
 * The register check answers "does this read as machine-written", which is a
 * judgement about style. The rest answers "is anything wrong", which is not.
 * Merging them would let a comma splice dress up as evidence about who wrote
 * the paragraph.
 */
function results(c) {
  const t = c.tells;
  return el('div', {},
    sheet('Does it read as machine-written?',
      el('p', { style: 'margin-bottom:14px', text: readTells(t) }),
      el('div', { class: 'figures' },
        figure('flagged patterns', t.findings.length),
        figure('per 1000 words', t.density.toFixed(1)),
        figure('em dashes', t.metrics.emDashes),
        figure('unnamed authority', t.metrics.unnamedAuthority, t.metrics.unnamedAuthority ? 'fix these first' : '')),
      el('p', { class: 'note', text: 'You wrote these sentences, so this is not asking whether a model was involved. It is asking whether the register has rubbed off, which it does after a week of reading machine prose. It is a style judgement either way, never a claim about authorship.' }),
      t.findings.length
        ? el('div', { style: 'margin-top:14px' }, t.findings.slice(0, 20).map((f) => el('div', { class: 'item loose' },
            el('div', { class: 'head' }, el('span', { class: 'mono', text: f.rule.replace(/-/g, ' ') })),
            el('div', { class: 'body' }, el('mark', { text: f.excerpt })),
            el('div', { class: 'meta', style: 'margin-top:4px', text: f.message }),
            f.fix ? el('div', { class: 'meta', text: f.fix }) : null)))
        : null),

    sheet('Grammar, punctuation and spelling',
      c.issues.length
        ? el('div', {}, c.issues.map((i) => el('div', { class: `item loose finding cat-${i.category}` },
            el('div', { class: 'head' },
              el('span', { class: `swatch cat-${i.category}` }),
              el('span', { class: 'mono', text: i.rule }),
              i.severity ? tag(i.severity, i.severity === 'high' ? 'firm' : '') : null),
            el('div', { class: 'body' }, el('mark', { text: i.excerpt })),
            el('div', { class: 'meta', style: 'margin-top:4px', text: i.message }),
            i.source ? el('div', { class: 'note source', style: 'margin-top:4px', text: i.source }) : null)))
        : empty('Nothing wrong', `${c.words} words, and none of the rules fired.`),
      c.spelling && !c.spelling.ran
        ? el('p', { class: 'note', text: `Spelling was not checked: the dictionary did not load (${c.spelling.reason}).` })
        : null)
  );
}

/* ------------------------------------------------------------- the rest */

function copy(text) {
  navigator.clipboard.writeText(text)
    .then(() => toast('Copied.'))
    /* Clipboard access is refused in more places than people expect, and a
       button that silently does nothing is worse than one that says so. */
    .catch(() => toast('This browser would not let the page copy. Select the paragraph and copy it yourself.'));
}

/*
 * saveDraft builds its own record and reads `body`, not `text`, so passing
 * the paragraph under the wrong key saved an empty draft and said it had
 * worked. The question is carried too, because a draft that is only a
 * paragraph is one nobody can place six months later.
 */
function keep(r) {
  const made = saveDraft({
    title: `Abstract \u2014 ${r.words} words`,
    question: (S.values.claim || '').trim(),
    body: r.text
  });
  toast(made && made.body ? 'Kept with your drafts.' : 'It did not save. Copy it instead.');
}
