/*
 * abstract.js — an abstract built out of your own sentences.
 *
 * WHY IT IS BUILT THIS WAY AND NOT THE OTHER WAY.
 *
 * The request behind this was "write abstracts for me, offline, and not
 * detectable as AI". Two of those three can be had honestly and the third
 * cannot, so this is built around what is actually true:
 *
 *   If a model writes the abstract, the abstract is machine-written. No
 *   amount of rephrasing afterwards changes that, and nobody can promise
 *   what any detector will say about it — detectors are wrong in both
 *   directions and do not publish how they score. A tool that promised
 *   otherwise would be lying to its user at the exact moment the stakes
 *   are highest.
 *
 * So nothing here generates prose. You answer five short questions about
 * your own work, in your own words, and this orders them, joins them, counts
 * them against your target, and then runs the same AI-tell check the
 * Evaluate tab runs — because the register is catching, and a sentence you
 * typed after a week of reading machine prose can still carry the marks.
 *
 * The result is writing with nothing to detect, because no model touched it.
 *
 * THE FIVE MOVES.
 *
 * From the move analysis of research-article abstracts in applied
 * linguistics: Ken Hyland, Disciplinary Discourses (2000), describing
 * abstracts as Introduction, Purpose, Method, Product and Conclusion, which
 * descends from John Swales's move analysis in Genre Analysis (1990).
 *
 * No copy of either ships here, the same as for the APA and MLA rules: this
 * names the framework rather than quoting it, and the questions below are
 * worded for a literature department rather than for applied linguistics.
 * A humanities abstract rarely has a "method" section in the social-science
 * sense, so that move is asked as how the argument is actually made.
 */

export const MOVES = [
  {
    id: 'situation',
    label: 'What is being looked at, and what has been said about it',
    hint: 'The texts, the period, the debate you are entering. One or two sentences.',
    move: 'Introduction',
    placeholder: 'Criticism of the interwar short story has read the domestic room as a setting.'
  },
  {
    id: 'problem',
    label: 'What is missing, wrong, or unresolved in that',
    hint: 'The reason the paper exists. If you cannot say this, the abstract is not ready.',
    move: 'Introduction',
    placeholder: 'That reading cannot account for the rooms that refuse their occupants.'
  },
  {
    id: 'claim',
    label: 'What you argue',
    hint: 'Your claim in one sentence, stated flatly. Not what the paper "explores".',
    move: 'Purpose',
    placeholder: 'The room is a character in these stories, and the refusal is the plot.'
  },
  {
    id: 'how',
    label: 'How you argue it',
    hint: 'Close reading, archival work, a comparison, a theoretical frame. What a reader would need to follow you.',
    move: 'Method',
    placeholder: 'Close readings of three stories, set against their serialisation dates.'
  },
  {
    id: 'stakes',
    label: 'What changes if you are right',
    hint: 'What a reader should do differently. This is the move most abstracts skip, and the one editors look for.',
    move: 'Conclusion',
    placeholder: 'Domestic space stops being scenery and becomes the genre’s formal problem.'
  }
];

/*
 * Common targets, as a convenience rather than as a rule.
 *
 * Every call for papers states its own limit and that limit is the only one
 * that matters, so these are starting points and the field is free text.
 * The Calls tab is where yours will be written down.
 */
export const TARGETS = [
  { id: 150, label: '150 words' },
  { id: 250, label: '250 words' },
  { id: 300, label: '300 words' },
  { id: 500, label: '500 words' }
];

export const DEFAULT_TARGET = 250;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/* A move ends in a full stop even when the writer did not type one, because
   the paragraph is joined from these and a missing stop runs two together. */
function sentence(s) {
  const t = clean(s);
  if (!t) return '';
  return /[.!?…]["'’”)]?$/.test(t) ? t : `${t}.`;
}

export const countWords = (s) => clean(s).split(' ').filter(Boolean).length;

/**
 * Assemble the moves into one paragraph, in the order the framework gives.
 *
 * Nothing is rewritten: the sentences are the writer's, joined with a space
 * and given their terminal stops. An abstract is one paragraph in almost
 * every submission system, so it is returned as one.
 */
export function assemble(values) {
  const parts = MOVES.map((m) => sentence(values[m.id])).filter(Boolean);
  return parts.join(' ');
}

/**
 * What is still missing, and how the length sits against the target.
 *
 * `over` and `under` are counted rather than judged: an abstract 40 words
 * over a hard limit is rejected by the form, not by a reviewer, so the
 * number matters more than any adjective this could attach to it.
 */
export function review(values, target = DEFAULT_TARGET) {
  const text = assemble(values);
  const words = countWords(text);
  const limit = Number(target) || DEFAULT_TARGET;
  const missing = MOVES.filter((m) => !clean(values[m.id])).map((m) => m);
  const longest = MOVES
    .map((m) => ({ move: m, words: countWords(values[m.id]) }))
    .sort((a, b) => b.words - a.words)[0];

  return {
    text,
    words,
    limit,
    over: Math.max(0, words - limit),
    under: Math.max(0, limit - words),
    missing,
    /* Named so the writer knows where to cut, rather than being told to
       "be concise" and left to find the fat themselves. */
    longest: longest && longest.words ? longest : null,
    complete: missing.length === 0
  };
}
