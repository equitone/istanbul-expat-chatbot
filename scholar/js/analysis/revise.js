/*
 * revise.js — your text, edited. Not your text, regenerated.
 *
 * WHAT THIS IS, GIVEN WHAT WAS ASKED FOR.
 *
 * The ask was a box you paste an abstract into that returns "a full human
 * version". A model could return something, and that something would be
 * machine-written — the thing the Abstract tab exists to avoid — and nobody
 * could tell you what any detector would say about it afterwards. So this
 * does the half that is real, and says plainly that it is a half.
 *
 * It makes the edits that are mechanical and leaves the ones that are not.
 *
 *   APPLIED    A word on the flagged list that has a plain replacement, a
 *              transition stacked at the head of a paragraph, a
 *              misspelling the dictionary recognises, a punctuation mark in
 *              the wrong place. Each of these has exactly one right answer
 *              that does not depend on what the sentence is trying to say,
 *              so the edit is made and listed.
 *
 *   LEFT       Unnamed authority, negative parallelism, a closing paragraph
 *              that restates, a sentence whose subject and verb disagree.
 *              Each needs a decision about meaning. Guessing at one and
 *              writing it into the writer's abstract would be the tool
 *              putting words in their mouth, which is the whole objection
 *              to the other approach.
 *
 * The result is the writer's prose with specific marks removed. It is not
 * "a human version" — it was already a human version, and if it was not,
 * nothing here can make it one.
 *
 * ON WHAT IS SAFE TO APPLY.
 *
 * A finding's suggestion is only applied when it is known to replace its own
 * span exactly. Some rules do not: missing-terminal-punctuation marks the
 * last character of a paragraph and suggests a full stop, which applied
 * literally eats the letter. So the rules that may be applied are named
 * here, one at a time, rather than trusted as a class.
 */
import { WORDS } from './tells.js';
import { buildDocument } from './text.js';
import { analyseMechanics } from './mechanics.js';
import { analysePunctuation } from './punctuation.js';
import { analyseSpelling } from './spelling.js';
import { analyseGrammar } from './grammar.js';

/*
 * The flagged words whose advice is an actual replacement.
 *
 * Derived from the list in tells.js rather than copied, so the two cannot
 * drift apart. Most entries there are advice to a reader — "name the thing
 * itself", "cut it, or say who argues this" — and those are not applied:
 * only an entry whose first alternative is a single plain word, with no
 * instruction attached, is a substitution a machine can make safely.
 *
 * ONE WORD FOR ONE WORD, and nothing longer.
 *
 * "delves" suggests "goes into", and that turned "delves into the tapestry"
 * into "goes into into the tapestry": the replacement ended in a preposition
 * the sentence already had. Fitting a multi-word phrase into a sentence
 * means knowing the grammar around it, which is the line this file does not
 * cross. Those entries are reported instead, with the alternative, for the
 * writer to place themselves.
 */
export const REPLACEMENTS = (() => {
  const map = new Map();
  for (const [word, advice] of WORDS) {
    if (/cut it|name the thing|name who|say who|\u2014/i.test(advice)) continue;
    const first = String(advice).split(',')[0].trim();
    if (!/^[a-z]+$/.test(first)) continue;
    map.set(word, first);
  }
  return map;
})();

/* The flagged words that are not a straight swap, with what the essay
   suggests instead, so they can be listed rather than silently skipped. */
export const ADVISORY = new Map(
  WORDS.filter(([w]) => !REPLACEMENTS.has(w)).map(([w, advice]) => [w, advice])
);

/*
 * Rules whose `suggestion` replaces exactly the span they mark.
 *
 * Checked one by one against the analyser that emits them. Anything not
 * named here is reported and left alone, however confident it sounds.
 */
const APPLICABLE = new Set([
  'misspelling',              /* the word, corrected */
  'doubled-word',             /* "the the" to "the" */
  'article-a-an',             /* a to an */
  'lowercase-i',              /* i to I */
  'sentence-capitalisation',  /* the first word, capitalised */
  'stray-comma',
  /* every punctuation.js rule: each builds its replacement from its match */
  'quote-comma-outside', 'quote-period-outside', 'comma-before-closing-paren',
  'two-spaces-after-sentence', 'two-spaces-inconsistent',
  'repeated-terminal-punctuation', 'decade-apostrophe', 'en-dash-range',
  'space-before-punctuation', 'missing-space-after-punctuation',
  'ellipsis-as-two-dots', 'hyphen-as-dash'
]);

const matchCase = (source, replacement) => {
  if (/^[A-Z][a-z]/.test(source)) return replacement[0].toUpperCase() + replacement.slice(1);
  if (/^[A-Z]+$/.test(source) && source.length > 1) return replacement.toUpperCase();
  return replacement;
};

/**
 * Revise a passage.
 *
 * Returns the edited text, what was changed and why, and what was left for
 * the writer with the reason it cannot be done for them.
 */
export async function revise(text, { settings = {} } = {}) {
  const source = String(text || '');
  if (!source.trim()) return { text: source, applied: [], left: [], changed: 0 };

  const edits = [];   /* { start, end, from, to, rule, why } */
  const left = [];

  /* ---- 1. flagged words with a plain replacement ---- */
  for (const [word, instead] of REPLACEMENTS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      edits.push({
        start: m.index, end: m.index + m[0].length,
        from: m[0], to: matchCase(m[0], instead),
        rule: 'flagged-word',
        why: `“${m[0]}” is on the flagged list in the Signs of AI Writing essay.`
      });
    }
  }

  /*
   * ---- 2. a transition stacked at the head of a paragraph ----
   *
   * Deleted rather than replaced. These carry no information where they sit:
   * the logic they announce is either in the sentence already or is not
   * there at all, and the capital moves to the word that follows.
   */
  const transitions = /(^|\n)[ \t]*(Moreover|Furthermore|Additionally|In addition|That said|Notably|Importantly|Consequently|Nevertheless)\s*,\s*/g;
  let t;
  while ((t = transitions.exec(source)) !== null) {
    const at = t.index + t[1].length;
    const end = t.index + t[0].length;
    const next = source.slice(end, end + 1);
    edits.push({
      start: at, end,
      from: source.slice(at, end), to: next ? '' : '',
      rule: 'stacked-transition',
      why: `“${t[2]}” opens the paragraph and carries nothing. Cut.`,
      capitaliseNext: true
    });
  }

  /*
   * ---- 3. the flagged words that are not a straight swap ----
   *
   * Listed rather than dropped. Without this they fell between the count at
   * the top, which still saw them, and the two lists below, which did not:
   * the page said eleven patterns had become four and then showed nothing
   * about the four.
   */
  for (const [word, advice] of ADVISORY) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    let a;
    while ((a = re.exec(source)) !== null) {
      left.push({
        rule: 'flagged-word', excerpt: a[0],
        message: `\u201C${a[0]}\u201D is on the flagged list in the Signs of AI Writing essay.`,
        why: `Suggested instead: ${advice}. Not swapped for you: which one fits is a choice about the sentence, not about the word.`
      });
    }
  }

  /* ---- 4. the analysers, for rules that replace their own span ---- */
  const doc = buildDocument(source);
  const sp = await analyseSpelling(doc, {
    dialect: settings.spellDialect || 'en_US',
    personal: settings.personalWords || []
  });
  const findings = [
    ...analyseMechanics(doc).issues,
    ...analysePunctuation(doc, { style: settings.punctuationStyle || 'mla' }).issues,
    ...sp.issues,
    ...analyseGrammar(doc).issues.filter((i) => i.category !== 'style')
  ];

  for (const f of findings) {
    if (APPLICABLE.has(f.rule) && f.suggestion) {
      edits.push({
        start: f.start, end: f.end, from: f.excerpt, to: f.suggestion,
        rule: f.rule, why: f.message
      });
    } else {
      left.push({
        rule: f.rule, excerpt: f.excerpt, message: f.message,
        /* Why it is not done for them, rather than silence. */
        why: reasonLeft(f.rule)
      });
    }
  }

  /* ---- apply, from the end, so earlier offsets still hold ---- */
  const ordered = edits
    .filter((e) => e.to !== e.from)
    .sort((a, b) => b.start - a.start)
    .filter((e, i, all) => i === 0 || e.end <= all[i - 1].start);   /* no overlaps */

  let out = source;
  for (const e of ordered) {
    let after = out.slice(e.end);
    /* A deleted opener leaves the next word lower case. */
    if (e.capitaliseNext && /^[a-z]/.test(after)) after = after[0].toUpperCase() + after.slice(1);
    out = out.slice(0, e.start) + e.to + after;
  }

  return {
    text: out,
    applied: ordered.slice().reverse(),
    left,
    changed: ordered.length,
    spellingRan: sp.ran,
    spellingReason: sp.reason || ''
  };
}

/* Each of these needs a decision about what the sentence means, and a tool
   that makes that decision is writing for you rather than editing you. */
function reasonLeft(rule) {
  switch (rule) {
    case 'unnamed-authority':
      return 'Needs a source. No edit can supply one, and dropping the claim is your call.';
    case 'negative-parallelism':
      return 'Saying the second half directly means deciding what you meant by it.';
    case 'restating-close':
      return 'Whether the last paragraph says anything new is a judgement about your argument.';
    case 'em-dash-density':
      return 'Which mark replaces each dash depends on the sentence it is in.';
    case 'rule-of-three':
      return 'Cutting an example or adding one changes what you are claiming.';
    case 'missing-terminal-punctuation':
      return 'The rule marks the last character rather than the gap after it, so applying it would eat a letter.';
    case 'not-in-dictionary':
      return 'It may be a name or a term of art. Add it to your dictionary in Settings instead.';
    case 'subject-verb-agreement':
      return 'Which of the two words to change depends on which one you meant.';
    default:
      return 'No single replacement is right here without knowing what you meant.';
  }
}
