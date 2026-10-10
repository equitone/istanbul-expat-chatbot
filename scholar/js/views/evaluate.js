/*
 * evaluate.js — is the argument weak, and where exactly?
 *
 * Both halves of the request in one place: how well the argument holds, and
 * where it sits on Bloom's taxonomy. They belong together because the second
 * explains a particular kind of weakness the first cannot see — prose that
 * supports every assertion it makes and never gets past restating its source
 * passes a support test and is still not an argument.
 *
 * No score. A verdict in words, each line tied to a count you can check, and
 * the sentences an examiner would go at first.
 */
import { el, mount, sheet, tag, toast, clip, empty, figure, table, escapeHtml } from '../ui.js';
import { getState } from '../store.js';
import { evaluateArgument } from '../analysis/evaluate.js';
import { findTells, readTells } from '../analysis/tells.js';
import { LEVELS } from '../analysis/bloom.js';

const S = { text: '', result: null, tells: null, panel: 'argument', busy: null };

const STATE_TAG = { strong: 'firm', mixed: '', weak: 'fill', unknown: '' };

export default function render(root, ctx) {
  mount(root,
    el('h1', { text: 'Evaluate' }),
    el('p', { class: 'lede', text: 'Paste a draft, a chapter or a paper. Nothing leaves this computer: the argument, the level of thinking and the prose check all run here.' }),

    sheet(null,
      el('textarea', { id: 'eval-text', rows: 7, value: S.text, placeholder: 'Paste the text…',
        onChange: (e) => { S.text = e.target.value; } }),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { id: 'eval-run', class: 'solid', text: 'Evaluate', onClick: () => run(root, ctx) }),
        el('input', { type: 'file', accept: '.txt,.md,.pdf,.docx', style: 'max-width:260px',
          onChange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            try {
              const { extractText } = await import('../io/files.js');
              const { text } = await extractText(f);
              S.text = text; run(root, ctx);
            } catch (err) { toast(err.message); }
          } }),
        S.busy ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ` ${S.busy}`) : null)
    ),

    S.result ? panels(root, ctx) : null
  );
}

function panels(root, ctx) {
  const r = S.result;
  return el('div', {},
    sheet(null,
      el('div', { class: 'row', style: 'margin-bottom:16px' },
        el('div', {},
          el('h1', { style: 'font-size:24px;margin:0', text: r.headline }),
          el('div', { class: 'note', style: 'margin-top:4px', text: verdictLine(r) })),
        el('div', { class: 'spacer' }),
        el('div', { class: 'seg' },
          [['argument', 'Argument'], ['bloom', 'Level of thinking'], ['prose', 'Prose']].map(([id, label]) =>
            el('button', { 'aria-pressed': String(S.panel === id), text: label,
              onClick: () => { S.panel = id; render(root, ctx); } })))
      )
    ),
    S.panel === 'argument' ? argumentPanel(r)
      : S.panel === 'bloom' ? bloomPanel(r)
      : prosePanel()
  );
}

function verdictLine(r) {
  const weak = r.dimensions.filter((d) => d.state === 'weak').length;
  const strong = r.dimensions.filter((d) => d.state === 'strong').length;
  if (r.verdict === 'too-short') return 'Not enough assertions or classifiable paragraphs to judge.';
  return `${weak} dimension(s) weak, ${strong} strong, across ${r.counts.claims} assertions in ${r.counts.bodyParagraphs} substantial paragraphs.`;
}

function argumentPanel(r) {
  return el('div', {},
    sheet('Where it holds and where it does not',
      r.dimensions.map((d) => el('div', { class: d.state === 'weak' ? 'item' : 'item loose' },
        el('div', { class: 'head' },
          tag(d.state, STATE_TAG[d.state]),
          el('span', { text: d.key })),
        el('div', { class: 'body', text: d.line }),
        d.fix ? el('div', { class: 'meta', style: 'margin-top:4px', text: d.fix }) : null))
    ),
    r.thesis
      ? sheet('The sentence reading as your thesis',
          el('div', { class: 'reader', style: 'font-size:17px', text: r.thesis.text }),
          el('p', { class: 'note', style: 'margin-top:8px', text: 'Found by looking for a first-person claim verb near the opening. If this is not your thesis, the Thread measure above is measuring the wrong sentence.' }))
      : null,
    r.exposed.length
      ? sheet('Asserted with certainty, supported by nothing',
          el('p', { class: 'note', style: 'margin-bottom:12px', text: 'These combine a booster, an absolute or “proves” with no citation, quotation, figure or stated reason within two sentences. They are where an examiner starts.' }),
          r.exposed.map((x) => el('div', { class: 'item' }, el('div', { class: 'reader', style: 'font-size:15px', text: x.text }))))
      : null,
    r.carrying.length
      ? sheet('Carrying the argument',
          el('p', { class: 'note', style: 'margin-bottom:12px', text: 'Assertions with real evidence beside them. Worth knowing which these are before you cut for length.' }),
          r.carrying.map((x) => el('div', { class: 'item loose' }, el('div', { class: 'reader', style: 'font-size:15px', text: x.text }))))
      : null
  );
}

function bloomPanel(r) {
  const b = r.bloom;
  const max = Math.max(1, ...b.distribution.map((d) => d.count));
  return el('div', {},
    sheet('Where the thinking sits',
      el('p', { style: 'margin-bottom:16px', text: b.reading }),
      el('div', { class: 'figures' },
        b.distribution.map((d) => el('div', { class: 'figure' },
          el('div', { class: 'bar-chart', style: 'height:26px;margin-bottom:8px' },
            el('i', { class: b.dominant && d.n === b.dominant.n ? '' : 'pale', style: `height:${Math.round((d.count / max) * 100)}%` })),
          el('span', { class: 'n', style: 'font-size:22px', text: String(d.count) }),
          el('span', { class: 'k', text: `${d.n} ${d.label}` })))
      ),
      el('p', { class: 'note', text: `${b.classifiedParagraphs} of ${b.totalParagraphs} paragraphs carried a recognisable move. The other ${b.unclassifiedParagraphs} are unclassified rather than counted low — no signal is not the same as no thought.` })
    ),
    sheet('What each level means',
      table(['Level', 'Counted when the text…'], LEVELS.map((l) => [
        el('td', {}, tag(`${l.n} ${l.label}`, b.dominant && b.dominant.n === l.n ? 'fill' : '')),
        el('td', { class: 'wrap', text: l.gloss })
      ])),
      el('p', { class: 'note', style: 'margin-top:12px', text: 'Asserting that something is significant counts as Understand. Analyse needs the text to name a relationship — a contrast, a tension, an effect, a shift. That line is a judgement and you may disagree with it.' })
    )
  );
}

function prosePanel() {
  const t = S.tells;
  if (!t) return null;
  return el('div', {},
    sheet('Does this read as machine-written?',
      el('p', { style: 'margin-bottom:14px', text: readTells(t) }),
      el('div', { class: 'figures' },
        figure('flagged patterns', t.findings.length),
        figure('per 1000 words', t.density.toFixed(1)),
        figure('em dashes', t.metrics.emDashes, `${t.metrics.emDashRate.toFixed(1)} per 1000`),
        figure('unnamed authority', t.metrics.unnamedAuthority, t.metrics.unnamedAuthority ? 'fix these first' : '')
      ),
      el('p', { class: 'note', text: 'This is a style judgement, never a claim about who wrote the text. The same patterns appear in perfectly human prose by anyone trained on business English, and no honest tool can tell the difference.' })
    ),
    t.findings.length
      ? sheet('What to change',
          t.findings.slice(0, 40).map((f) => el('div', { class: 'item loose' },
            el('div', { class: 'head' }, el('span', { text: f.rule.replace(/-/g, ' ') })),
            el('div', { class: 'body' }, el('mark', { text: clip(f.excerpt, 90) })),
            el('div', { class: 'meta', style: 'margin-top:4px', text: f.message }),
            f.fix ? el('div', { class: 'meta', text: f.fix }) : null)),
          t.findings.length > 40 ? el('p', { class: 'note', text: `${t.findings.length - 40} more not listed.` }) : null)
      : null
  );
}

function run(root, ctx) {
  const text = String(S.text || '').trim();
  if (text.length < 300) { toast('Paste at least a few paragraphs.'); return; }
  S.busy = 'Reading…';
  render(root, ctx);
  setTimeout(() => {
    try {
      S.result = evaluateArgument(text);
      S.tells = findTells(text);
    } catch (err) {
      toast(err.message);
    }
    S.busy = null;
    render(root, ctx);
  }, 20);
}
