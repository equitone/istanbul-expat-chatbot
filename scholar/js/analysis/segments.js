/*
 * segments.js — turning a list of findings into paintable spans.
 *
 * Shared verbatim between the Instructor Workbench and Scholar Desk, because
 * both highlight a document the same way and a second copy of this is a
 * second place for the overlap logic to go subtly wrong.
 *
 * Findings overlap constantly: a comma splice inside a sentence that is also
 * flagged as passive, a misspelling inside a quoted title. Nested <mark>
 * elements would have to be balanced and would paint the wrong colour at the
 * seams, so the text is cut at every finding boundary instead and each piece
 * carries the findings that cover it whole. The result is a flat list of
 * non-overlapping spans, which is a straight concatenation to render.
 */

export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

export const CATEGORY_META = {
  grammar: { label: 'Grammar errors', colour: 'var(--cat-grammar)' },
  typo: { label: 'Typos & spelling', colour: 'var(--cat-typo)' },
  punctuation: { label: 'Punctuation', colour: 'var(--cat-punctuation)' },
  citation: { label: 'Citation style', colour: 'var(--cat-citation)' },
  argument: { label: 'Argument support', colour: 'var(--cat-argument)' },
  bloom: { label: 'Level of thinking', colour: 'var(--cat-bloom)' },
  structure: { label: 'Structure & sources', colour: 'var(--cat-structure)' },
  ai: { label: 'AI review', colour: 'var(--cat-ai)' },
  style: { label: 'Style suggestions', colour: 'var(--cat-style)' }
};


/*
 * Which bucket a rule belongs in.
 *
 * Spelling and punctuation used to share one, and they are not the same
 * question. Someone hunting for a comma problem and someone hunting for a
 * misspelling are doing different jobs, and a single list makes both of them
 * read past the other.
 *
 * The line is drawn on what the fix changes, which is the only test that
 * stays decidable at the edges:
 *
 *   PUNCTUATION   a mark or a space changes and no word does. A comma splice
 *                 is here: the repair is a semicolon, not a rewrite.
 *   TYPO          a word is the wrong word. Misspellings, doubled words, and
 *                 the homophone confusions — its/it’s, loose/lose.
 *   GRAMMAR       a word changes form, or one is added or removed. Agreement,
 *                 articles, plurals, prepositions.
 *   STYLE         nothing is wrong; this is a suggestion.
 *
 * Anything not named here keeps whatever category its analyser assigned.
 */
/*
 * Only rules from the other analysers need naming here. Everything in
 * punctuation.js sets this category itself, so listing those ids would be a
 * second place to keep in step — and the five stale names this set still
 * carried, left behind when their rules moved or went, are what that costs.
 */
const PUNCTUATION = new Set([
  'comma-splice', 'stray-comma', 'missing-terminal-punctuation',
  'unbalanced-quote', 'unbalanced-bracket', 'mixed-quote-style'
]);

/* Mechanical slips that are not punctuation: the wrong word, or the wrong
   case on the right one. */
const TYPO = new Set([
  'misspelling', 'doubled-word', 'sentence-capitalisation', 'lowercase-i',
  'its-verb', 'affect-article', 'effect-verb', 'then-compare', 'there-poss',
  'their-is', 'lead-past', 'loose-lose', 'whos-poss', 'to-too', 'alot',
  'irregardless', 'based-of'
]);

/* Caught by mechanics.js or the confusables list, but grammatical: a word
   changes form or a preposition appears that English does not take. */
const GRAMMAR = new Set([
  'article-a-an', 'amount-count', 'less-count', 'informations',
  'research-plural', 'literatures', 'comprised-of', 'different-than',
  'discuss-about', 'emphasise-on', 'the-most-unique'
]);

export function categoryForRule(rule, fallback) {
  if (PUNCTUATION.has(rule)) return 'punctuation';
  if (TYPO.has(rule)) return 'typo';
  if (GRAMMAR.has(rule)) return 'grammar';
  return fallback;
}


export function buildSegments(text, issues, { categories, severities } = {}) {
  const active = issues.filter(
    (i) => (!categories || categories.has(i.category)) && (!severities || severities.has(i.severity))
  );
  if (!active.length) return [{ start: 0, end: text.length, issues: [] }];

  const points = new Set([0, text.length]);
  active.forEach((i) => {
    points.add(clamp(i.start, 0, text.length));
    points.add(clamp(i.end, 0, text.length));
  });
  const sorted = [...points].sort((a, b) => a - b);

  const segments = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const start = sorted[k];
    const end = sorted[k + 1];
    if (end <= start) continue;
    const hits = active.filter((i) => i.start <= start && i.end >= end);
    segments.push({ start, end, issues: hits });
  }
  return segments;
}

/* The category a segment is painted with when several findings overlap:
   the most severe wins, ties broken by category weight. */
const CATEGORY_WEIGHT = { argument: 0, grammar: 1, citation: 2, typo: 3, punctuation: 4, structure: 5, ai: 6, style: 7 };

export function dominantIssue(segmentIssues) {
  if (!segmentIssues.length) return null;
  return [...segmentIssues].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      CATEGORY_WEIGHT[a.category] - CATEGORY_WEIGHT[b.category]
  )[0];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
