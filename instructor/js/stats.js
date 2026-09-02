/* stats.js — descriptive statistics for a gradebook. Pure functions, no DOM. */

export function describe(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = xs.length;
  if (!n) {
    return { n: 0, mean: null, median: null, stdev: null, variance: null, min: null, max: null, q1: null, q3: null, iqr: null, range: null };
  }
  const sum = xs.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  /* Sample standard deviation (n-1): a class is a sample of the cohort, and
     with n small the population form understates the spread. */
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    mean,
    median: percentile(xs, 50),
    stdev: Math.sqrt(variance),
    variance,
    min: xs[0],
    max: xs[n - 1],
    q1: percentile(xs, 25),
    q3: percentile(xs, 75),
    iqr: percentile(xs, 75) - percentile(xs, 25),
    range: xs[n - 1] - xs[0]
  };
}

/* Linear-interpolation percentile (the "exclusive-free" R-7 method Excel uses). */
export function percentile(sortedAsc, p) {
  const xs = sortedAsc;
  if (!xs.length) return null;
  if (xs.length === 1) return xs[0];
  const idx = (p / 100) * (xs.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo);
}

export function histogram(values, { min = 0, max = 100, bins = 10 } = {}) {
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
    label: `${Math.round(min + i * width)}–${Math.round(min + (i + 1) * width)}`
  }));
  values.filter(Number.isFinite).forEach((v) => {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;   // the top value belongs in the last bin
    if (idx < 0) idx = 0;
    out[idx].count++;
  });
  return out;
}

/* Pearson r — used to ask "does this coursework component predict the final?" */
export function correlation(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  pairs.forEach(([x, y]) => {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  });
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

export function zScore(value, mean, stdev) {
  if (!Number.isFinite(value) || !Number.isFinite(mean) || !stdev) return null;
  return (value - mean) / stdev;
}

/* Dense ranking, 1 = highest. Ties share a rank. */
export function rank(values) {
  const sorted = [...new Set(values.filter(Number.isFinite))].sort((a, b) => b - a);
  const map = new Map(sorted.map((v, i) => [v, i + 1]));
  return values.map((v) => (Number.isFinite(v) ? map.get(v) : null));
}

export const DEFAULT_LETTER_SCHEME = [
  { letter: 'AA', min: 90, gpa: 4.0 },
  { letter: 'BA', min: 85, gpa: 3.5 },
  { letter: 'BB', min: 80, gpa: 3.0 },
  { letter: 'CB', min: 75, gpa: 2.5 },
  { letter: 'CC', min: 65, gpa: 2.0 },
  { letter: 'DC', min: 58, gpa: 1.5 },
  { letter: 'DD', min: 50, gpa: 1.0 },
  { letter: 'FD', min: 40, gpa: 0.5 },
  { letter: 'FF', min: 0, gpa: 0.0 }
];

export function toLetter(score, scheme = DEFAULT_LETTER_SCHEME) {
  if (!Number.isFinite(score)) return null;
  const ordered = [...scheme].sort((a, b) => b.min - a.min);
  return ordered.find((s) => score >= s.min) || ordered[ordered.length - 1];
}

export function letterDistribution(scores, scheme = DEFAULT_LETTER_SCHEME) {
  const counts = new Map(scheme.map((s) => [s.letter, 0]));
  scores.filter(Number.isFinite).forEach((s) => {
    const l = toLetter(s, scheme);
    if (l) counts.set(l.letter, (counts.get(l.letter) || 0) + 1);
  });
  const total = scores.filter(Number.isFinite).length || 1;
  return [...counts.entries()].map(([letter, count]) => ({
    letter,
    count,
    share: count / total,
    gpa: (scheme.find((s) => s.letter === letter) || {}).gpa ?? null
  }));
}

/*
 * Weighted course total.
 * Missing marks are PRORATED, not zeroed: mid-semester a blank means
 * "not sat yet", and zeroing it would make every running total meaningless.
 * `complete` tells the caller whether the figure is final.
 */
export function courseTotal(componentScores, components) {
  let earned = 0;
  let weightUsed = 0;
  let weightTotal = 0;
  const missing = [];

  /*
   * A resit stands in for the exam it replaces rather than beside it: it
   * carries no weight of its own and the better of the two marks is the one
   * that counts. Weighting it separately would take the total past 100% and
   * would credit a student twice for sitting the same paper again.
   */
  const resitOf = new Map();
  components.forEach((c) => { if (c.resitFor) resitOf.set(c.resitFor, c); });

  components.forEach((c) => {
    if (c.resitFor) return;
    const weight = Number(c.weight) || 0;
    weightTotal += weight;
    let raw = componentScores ? componentScores[c.id] : null;

    const resit = resitOf.get(c.id);
    if (resit && componentScores) {
      const alt = componentScores[resit.id];
      if (Number.isFinite(alt) && (!Number.isFinite(raw) || alt > raw)) raw = alt;
    }

    if (!Number.isFinite(raw)) {
      missing.push(c.id);
      return;
    }
    const max = Number(c.maxScore) || 100;
    earned += (raw / max) * weight;
    weightUsed += weight;
  });

  const complete = missing.length === 0 && weightTotal > 0;
  return {
    /* Score out of 100 on the weight actually graded so far. */
    running: weightUsed > 0 ? (earned / weightUsed) * 100 : null,
    /* Score out of 100 treating ungraded weight as zero — the final figure. */
    absolute: weightTotal > 0 ? (earned / weightTotal) * 100 : null,
    earned,
    weightUsed,
    weightTotal,
    missing,
    complete
  };
}

export function classSummary(rows, { scaleMax = 100, passMark = 50, scheme = DEFAULT_LETTER_SCHEME } = {}) {
  const scores = rows.map((r) => r.score).filter(Number.isFinite);
  const stats = describe(scores);
  const passing = scores.filter((s) => s >= passMark).length;
  return {
    ...stats,
    passMark,
    passing,
    failing: scores.length - passing,
    passRate: scores.length ? passing / scores.length : null,
    graded: scores.length,
    ungraded: rows.length - scores.length,
    histogram: histogram(scores, { min: 0, max: scaleMax, bins: 10 }),
    letters: letterDistribution(scores, scheme),
    meanGpa: scores.length
      ? scores.reduce((a, s) => a + (toLetter(s, scheme)?.gpa ?? 0), 0) / scores.length
      : null
  };
}
