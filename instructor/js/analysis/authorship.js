/*
 * authorship.js — does this read like the same person who wrote their
 * earlier submissions?
 *
 * Burrows's Delta, the standard method in computational authorship
 * attribution: take the most frequent function words, express each text as
 * relative frequencies, z-score every feature across the comparison set, and
 * measure the mean absolute difference. Function words are used precisely
 * because they carry no subject matter — "of", "the", "which" appear at rates
 * that are stable for a writer and largely independent of topic, so a
 * chemistry essay and a poetry essay by one person still look alike.
 *
 * WHY THIS IS WORTH HAVING
 * Similarity checking asks "does this text appear somewhere else?". It cannot
 * ask "is this the same hand as last term's essay?", because there is nothing
 * to match against — the student's own earlier work is not plagiarism of
 * anything. That question is answerable only with the instructor's own
 * archive, which is exactly what this workbench accumulates.
 *
 * WHAT IT CANNOT DO
 * Delta needs length: below roughly 1,500 words per sample the numbers are
 * noise. It needs at least a couple of reference samples. And a large
 * distance has innocent causes — a different genre, a year of improvement, a
 * heavily proofread submission. It is calibrated here against other students'
 * work so the figure has something to mean, and it is still only a reason to
 * ask, never an answer.
 */

const MIN_WORDS = 1200;

/* The most frequent function words in academic English. Deliberately
   contentless: the method depends on these being unrelated to topic. */
const FEATURES = `the of and to in a is that it for as with was on be by this are from at or an which but not have
has had they their we our you your he her his its would could should may might will can do does did than then so if
when where who whom whose what while there here these those such some any all both each other another more most
much many few less least own same very just only also even still yet again ever never always often sometimes
however therefore thus hence because since although though whereas unless until after before during between among
within without through against about above below over under into onto upon toward towards across along around
behind beyond beside besides despite except like near off out per plus round save till up via
i me my myself we us our ours he him she hers it them they what who how why whether either neither
one two first second next last then now here there almost enough quite rather too indeed perhaps
been being am were are do done make made take taken give given see seen know known think thought
say said go went come came use used find found`.trim().split(/\s+/);

const UNIQUE_FEATURES = [...new Set(FEATURES)];

function frequencies(text) {
  const words = String(text).toLowerCase().match(/[a-z']+/g) || [];
  const total = words.length;
  const counts = new Map();
  words.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  return {
    total,
    vector: UNIQUE_FEATURES.map((f) => (total ? (counts.get(f) || 0) / total : 0))
  };
}

/**
 * Compare one document against a set of others.
 *
 * `corpus` entries carry `sameStudent: true` where the text is known to be by
 * the same student — those are the comparison of interest; the rest calibrate
 * what "a different person" looks like for this cohort and this assignment.
 */
export function compareAuthorship(targetText, corpus) {
  const target = frequencies(targetText);
  const usable = corpus.filter((c) => {
    const f = frequencies(c.text);
    c._freq = f;
    return f.total >= MIN_WORDS;
  });

  if (target.total < MIN_WORDS) {
    return { usable: false, reason: `The document is ${target.total.toLocaleString()} words; this method needs about ${MIN_WORDS.toLocaleString()} to say anything.` };
  }
  if (usable.length < 2) {
    return { usable: false, reason: `Needs at least two other documents of ${MIN_WORDS.toLocaleString()}+ words to compare against. There ${usable.length === 1 ? 'is 1' : 'are none'} saved.` };
  }

  /* Z-score every feature across target plus corpus, which is what makes the
     distances comparable rather than dominated by "the". */
  const all = [target, ...usable.map((c) => c._freq)];
  const means = [];
  const sds = [];
  UNIQUE_FEATURES.forEach((_, i) => {
    const vals = all.map((f) => f.vector[i]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1e-12;
    means.push(mean);
    sds.push(sd);
  });
  const z = (f) => f.vector.map((v, i) => (v - means[i]) / sds[i]);

  const zt = z(target);
  const results = usable.map((c) => {
    const zc = z(c._freq);
    const delta = zt.reduce((a, v, i) => a + Math.abs(v - zc[i]), 0) / zt.length;
    return { id: c.id, label: c.label, sameStudent: Boolean(c.sameStudent), words: c._freq.total, delta };
  }).sort((a, b) => a.delta - b.delta);

  const own = results.filter((r) => r.sameStudent);
  const others = results.filter((r) => !r.sameStudent);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const ownMean = mean(own.map((r) => r.delta));
  const otherMean = mean(others.map((r) => r.delta));

  /*
   * The finding is comparative, not absolute. A Delta of 0.8 means nothing on
   * its own; a Delta to the student's own past work that is LARGER than the
   * typical distance to other students' work is the thing worth a look.
   */
  let verdict = null;
  if (own.length && others.length >= 2) {
    const ratio = ownMean / otherMean;
    if (ratio > 1.05) {
      verdict = {
        level: 'high',
        headline: 'This reads less like the student’s own earlier work than like other people’s',
        detail: `Average distance to their ${own.length} earlier submission(s) is ${ownMean.toFixed(3)}; to ${others.length} other students’ work it is ${otherMean.toFixed(3)}. Their own past writing should normally be the closest match, not the furthest.`
      };
    } else if (ratio > 0.9) {
      verdict = {
        level: 'medium',
        headline: 'No clearer resemblance to their own earlier work than to anyone else’s',
        detail: `Distance to their own work (${ownMean.toFixed(3)}) is close to the distance to other students’ (${otherMean.toFixed(3)}). Weak, but not what a consistent author usually looks like.`
      };
    } else {
      verdict = {
        level: 'none',
        headline: 'Consistent with the student’s earlier writing',
        detail: `Closer to their own past work (${ownMean.toFixed(3)}) than to other students’ (${otherMean.toFixed(3)}), which is the expected pattern.`
      };
    }
  }

  return {
    usable: true,
    targetWords: target.total,
    results,
    ownMean,
    otherMean,
    verdict,
    note: 'Burrows’s Delta over function-word frequencies. Distances are only meaningful relative to each other. A large distance has innocent explanations — a different genre, a year of improvement, heavy proofreading — so treat this as a reason to ask about the student’s process, never as a conclusion.'
  };
}
