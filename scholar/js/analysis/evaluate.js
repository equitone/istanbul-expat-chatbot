/*
 * evaluate.js — is this argument weak, and could it be stronger?
 *
 * The instructor app had a 0–100 "Argument Stress Index" and it was removed,
 * because the weights and bands were invented and no supervisor could defend
 * the number to a student who challenged it. The same restraint applies here.
 *
 * So: no score. A verdict in words, each part of it tied to a count that can
 * be checked, and a list of the specific things that would make the argument
 * stronger. "Weak" has to mean something you can act on — a claim with
 * nothing near it, a thesis that never comes back, an objection never faced —
 * not a number that went down.
 */
import { analyseArgument } from './argument.js';
import { analyseBloom } from './bloom.js';
import { buildDocument } from './text.js';

/* Each test returns a verdict on one dimension, with the evidence for it. */
function dimensions(a, bloom) {
  const out = [];

  const supported = a.claims ? a.supportedClaims / a.claims : 0;
  out.push({
    key: 'Support',
    state: a.claims < 3 ? 'unknown' : supported >= 0.75 ? 'strong' : supported >= 0.45 ? 'mixed' : 'weak',
    line: a.claims < 3
      ? 'Too few assertions to judge.'
      : `${a.supportedClaims} of ${a.claims} assertions have a citation, a quotation, a figure or a stated reason within two sentences.`,
    fix: supported < 0.75 && a.claims >= 3
      ? `${a.claims - a.supportedClaims} assertion(s) stand alone. Those are the sentences an examiner opens with.`
      : ''
  });

  out.push({
    key: 'Certainty',
    state: a.claims < 3 ? 'unknown'
      : a.criticalStressPoints > Math.max(1, a.claims * 0.15) ? 'weak'
      : a.criticalStressPoints ? 'mixed' : 'strong',
    line: a.criticalStressPoints
      ? `${a.criticalStressPoints} assertion(s) are made with certainty — a booster, an absolute, or "proves" — and supported by nothing.`
      : 'No assertion combines high certainty with no support.',
    fix: a.criticalStressPoints
      ? 'Either support them or lower the certainty. "Suggests" costs nothing and cannot be attacked.'
      : ''
  });

  out.push({
    key: 'Objections',
    state: a.counterargumentCoverage >= 0.2 ? 'strong' : a.counterargumentCoverage > 0.05 ? 'mixed' : 'weak',
    line: `${Math.round(a.counterargumentCoverage * 100)}% of paragraphs engage a counter-position.`,
    fix: a.counterargumentCoverage < 0.2
      ? 'An argument that never meets an objection reads as unaware of its field rather than as confident.'
      : ''
  });

  if (a.thesisStatement) {
    const thread = a.threadContinuity;
    out.push({
      key: 'Thread',
      state: thread === null ? 'unknown' : thread >= 0.5 ? 'strong' : thread >= 0.25 ? 'mixed' : 'weak',
      line: thread === null
        ? 'A thesis statement was found but its recurrence could not be measured.'
        : `The thesis vocabulary reappears in ${Math.round(thread * 100)}% of body paragraphs.`,
      fix: thread !== null && thread < 0.5
        ? 'Long stretches never touch the central claim. Those paragraphs are doing something else, which may be worth knowing.'
        : ''
    });
  } else {
    out.push({
      key: 'Thread',
      state: 'weak',
      line: 'No sentence reads as a thesis statement.',
      fix: 'Nothing here says, in one sentence, what the piece argues. That is usually the fix with the largest effect.'
    });
  }

  out.push({
    key: 'Cohesion',
    state: !a.bodyParagraphs ? 'unknown'
      : a.cohesionGaps / a.bodyParagraphs > 0.2 ? 'weak'
      : a.cohesionGaps ? 'mixed' : 'strong',
    line: `${a.cohesionGaps} pair(s) of consecutive paragraphs share almost no vocabulary and no connective, out of ${a.bodyParagraphs} paragraphs of 35+ words.`,
    fix: a.cohesionGaps ? 'The reader falls between those paragraphs. Usually one sentence fixes each.' : ''
  });

  /* Bloom belongs in the verdict rather than beside it: an argument that only
     restates its primary source is weak in a way no support ratio catches. */
  const b = bloom.metrics;
  out.push({
    key: 'Level of thinking',
    state: !b.classifiedParagraphs ? 'unknown'
      : b.readingShare >= 0.5 ? 'strong' : b.readingShare >= 0.25 ? 'mixed' : 'weak',
    line: b.classifiedParagraphs
      ? `${Math.round(b.readingShare * 100)}% of classifiable paragraphs analyse or judge; the rest restate. Most sit at ${b.dominant ? b.dominant.label.toLowerCase() : 'no clear level'}.`
      : 'Not enough signposted prose to place on Bloom’s taxonomy.',
    fix: b.classifiedParagraphs && b.readingShare < 0.5
      ? 'Summary paragraphs are doing the work of analysis here. Ask of each: what does this show, and how does it bear on the claim?'
      : ''
  });

  return out;
}

const RANK = { weak: 0, mixed: 1, unknown: 2, strong: 3 };

/**
 * @param {string} text
 * @returns a verdict, the dimensions behind it, and the strongest and weakest
 *          passages, so "weak" always points at something on the page.
 */
export function evaluateArgument(text) {
  const doc = buildDocument(text);
  const argument = analyseArgument(doc);
  const bloom = analyseBloom(doc);
  const a = argument.metrics;
  const dims = dimensions(a, bloom);

  const weak = dims.filter((d) => d.state === 'weak');
  const mixed = dims.filter((d) => d.state === 'mixed');
  const strong = dims.filter((d) => d.state === 'strong');

  let verdict;
  let headline;
  if (a.claims < 3 && (bloom.metrics.classifiedParagraphs || 0) < 3) {
    verdict = 'too-short';
    headline = 'Too short to judge';
  } else if (weak.length >= 3) {
    verdict = 'weak';
    headline = 'Weak as it stands';
  } else if (weak.length >= 1) {
    verdict = 'promising';
    headline = 'Sound in places, with a clear weak point';
  } else if (mixed.length >= 2) {
    verdict = 'serviceable';
    headline = 'Serviceable, nothing broken';
  } else {
    verdict = 'strong';
    headline = 'Holds up';
  }

  /* The sentences a reader would attack first: certainty with no support. */
  const exposed = argument.claims
    .filter((c) => c.critical)
    .slice(0, 6)
    .map((c) => ({ text: c.sentence.text, start: c.sentence.start, end: c.sentence.end }));

  /* And the ones carrying the argument: a claim with real evidence beside it. */
  const carrying = argument.claims
    .filter((c) => c.support === 2 && c.load >= 1)
    .slice(0, 4)
    .map((c) => ({ text: c.sentence.text, start: c.sentence.start, end: c.sentence.end }));

  return {
    verdict,
    headline,
    dimensions: [...dims].sort((x, y) => RANK[x.state] - RANK[y.state]),
    exposed,
    carrying,
    thesis: a.thesisStatement,
    bloom: bloom.metrics,
    argument: a,
    /* Everything the model would be told, if one is asked for a second
       opinion. Kept so the view can show what was sent. */
    counts: {
      claims: a.claims,
      supported: a.supportedClaims,
      critical: a.criticalStressPoints,
      counter: a.counterargumentCoverage,
      cohesionGaps: a.cohesionGaps,
      bodyParagraphs: a.bodyParagraphs,
      readingShare: bloom.metrics.readingShare
    }
  };
}
