/*
 * similarity.js — text reuse, voice consistency, and AI-writing indicators.
 *
 * WHAT THIS HONESTLY IS
 * ---------------------
 * There is no web-scale index here. This cannot tell you a passage was copied
 * from a journal article it has never seen. What it CAN do, it does exactly:
 *
 *   1. Reuse between documents the instructor holds — every thesis uploaded to
 *      this workbench, plus any source pasted in. That catches collusion
 *      between students in the same cohort and self-plagiarism across a
 *      student's own submissions, which is a large share of real cases.
 *   2. Voice consistency INSIDE one document — passages whose style departs
 *      sharply from the rest. Unattributed text tends to read differently from
 *      its surroundings whether a person or a model produced it, and this
 *      needs no corpus at all.
 *   3. AI-writing indicators — statistical tendencies, not proof. Read the
 *      warning attached to the result before showing a number to anyone.
 *
 * Detection is by winnowed k-gram fingerprinting (Schleimer et al., 2003):
 * hash every 5-word window, keep the minimum in each sliding window of
 * hashes. Two documents sharing a passage share fingerprints regardless of
 * where the passage sits, and paraphrase below the k-gram level is missed —
 * which is a limit worth stating rather than hiding.
 */
import { buildDocument, countSyllables } from './text.js';

const K = 5;          // words per shingle
const WINDOW = 4;     // winnowing window, in hashes
const MIN_RUN = 2;    // consecutive shingles before a match is worth reporting

/* ------------------------------------------------------------ fingerprints */

export function fingerprint(text) {
  const words = [];
  const re = /[\p{L}\p{N}']+/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    words.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  if (words.length < K) return { hashes: [], words: words.length };

  const shingles = [];
  for (let i = 0; i + K <= words.length; i++) {
    const gram = words.slice(i, i + K).map((x) => x.w).join(' ');
    shingles.push({ h: hash(gram), start: words[i].start, end: words[i + K - 1].end, index: i });
  }

  /* Winnow: keep the smallest hash of each window, so both documents select
     the same shingles independently of alignment. */
  const kept = [];
  let lastIdx = -1;
  for (let i = 0; i + WINDOW <= shingles.length; i++) {
    let min = i;
    for (let j = i; j < i + WINDOW; j++) if (shingles[j].h < shingles[min].h) min = j;
    if (min !== lastIdx) { kept.push(shingles[min]); lastIdx = min; }
  }
  if (!kept.length && shingles.length) kept.push(shingles[0]);
  return { hashes: kept, words: words.length, total: shingles.length };
}

/* Compare one document against a set of others held locally. */
export function compareAgainstCorpus(targetText, corpus) {
  const target = fingerprint(targetText);
  const index = new Map();
  target.hashes.forEach((s) => {
    if (!index.has(s.h)) index.set(s.h, []);
    index.get(s.h).push(s);
  });

  const results = corpus.map((entry) => {
    const other = fingerprint(entry.text);
    const hits = [];
    other.hashes.forEach((s) => {
      const matched = index.get(s.h);
      if (matched) matched.forEach((t) => hits.push({ target: t, other: s }));
    });

    const passages = mergeRuns(hits.map((h) => h.target)).filter((p) => p.count >= MIN_RUN);
    const covered = passages.reduce((n, p) => n + (p.end - p.start), 0);
    return {
      id: entry.id,
      label: entry.label,
      matchedShingles: hits.length,
      /* Share of the TARGET's fingerprints that also appear in this document. */
      containment: target.hashes.length ? new Set(hits.map((h) => h.target.index)).size / target.hashes.length : 0,
      charsCovered: covered,
      coverage: targetText.length ? covered / targetText.length : 0,
      passages: passages.slice(0, 60)
    };
  })
    .filter((r) => r.passages.length)
    .sort((a, b) => b.containment - a.containment);

  return { target, results };
}

/* Adjacent fingerprint hits describe one continuous passage; merge them. */
function mergeRuns(spans) {
  if (!spans.length) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out = [{ start: sorted[0].start, end: sorted[0].end, count: 1 }];
  sorted.slice(1).forEach((s) => {
    const last = out[out.length - 1];
    if (s.start <= last.end + 40) {
      last.end = Math.max(last.end, s.end);
      last.count++;
    } else {
      out.push({ start: s.start, end: s.end, count: 1 });
    }
  });
  return out.sort((a, b) => (b.end - b.start) - (a.end - a.start));
}

/* ------------------------------------------------------------- stylometry */

const FUNCTION_WORDS = 'the of and to in a is that it for as with was on be by this are from at or an which but not have has had they their we our you your he she his her its would could should may might will can do does did than then so if when while there these those such more most other some any all no'.split(' ');

/*
 * Slide a window over the document and measure how each passage writes, not
 * what it says. A window several standard deviations from the document's own
 * norm is a passage whose voice does not match the thesis around it.
 */
export function voiceConsistency(text, { windowWords = 220, step = 110 } = {}) {
  const doc = buildDocument(text);
  const sentences = doc.bodySentences;
  if (sentences.length < 12) {
    return { windows: [], outliers: [], usable: false, reason: 'Too short to model a baseline (needs ~12+ sentences).' };
  }

  const windows = [];
  let i = 0;
  while (i < sentences.length) {
    const group = [];
    let words = 0;
    let j = i;
    while (j < sentences.length && words < windowWords) {
      group.push(sentences[j]);
      words += sentences[j].words.length;
      j++;
    }
    if (group.length >= 3) windows.push(features(group, words));
    if (j >= sentences.length) break;
    /* Advance by roughly `step` words for a 50% overlap. */
    let advanced = 0;
    while (i < sentences.length && advanced < step) { advanced += sentences[i].words.length; i++; }
  }
  if (windows.length < 4) {
    return { windows, outliers: [], usable: false, reason: 'Too few windows to establish a baseline.' };
  }

  const keys = ['avgSentence', 'burstiness', 'ttr', 'wordLength', 'functionRate', 'commaRate', 'syllables', 'subordination'];
  const stats = {};
  keys.forEach((k) => {
    const vals = windows.map((w) => w[k]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1e-9;
    stats[k] = { mean, sd };
  });

  windows.forEach((w) => {
    let sum = 0;
    w.z = {};
    keys.forEach((k) => {
      const z = (w[k] - stats[k].mean) / stats[k].sd;
      w.z[k] = z;
      sum += z * z;
    });
    w.deviation = Math.sqrt(sum / keys.length);
    w.drivers = keys
      .map((k) => ({ k, z: w.z[k] }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 3)
      .filter((d) => Math.abs(d.z) > 1);
  });

  const outliers = windows
    .filter((w) => w.deviation >= 1.6)
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, 12);

  return { windows, outliers, stats, usable: true };
}

function features(group, words) {
  const lengths = group.map((s) => s.words.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
  const all = group.flatMap((s) => s.words);
  const lower = all.map((w) => w.lower);
  const text = group.map((s) => s.text).join(' ');

  return {
    start: group[0].start,
    end: group[group.length - 1].end,
    text,
    words,
    avgSentence: mean,
    burstiness: sd,
    ttr: new Set(lower).size / Math.max(1, lower.length),
    wordLength: all.reduce((a, w) => a + w.text.length, 0) / Math.max(1, all.length),
    functionRate: lower.filter((w) => FUNCTION_WORDS.includes(w)).length / Math.max(1, lower.length),
    commaRate: (text.match(/,/g) || []).length / Math.max(1, group.length),
    syllables: all.reduce((a, w) => a + countSyllables(w.text), 0) / Math.max(1, all.length),
    subordination: (text.match(/\b(which|that|because|although|while|whereas|since|if|when|whose|whom)\b/gi) || []).length / Math.max(1, group.length)
  };
}

/* ------------------------------------------------- AI-writing indicators */

const AI_VOCABULARY = ['delve', 'delves', 'delving', 'tapestry', 'testament', 'multifaceted', 'nuanced', 'interplay', 'underscore', 'underscores', 'underscoring', 'pivotal', 'realm', 'realms', 'landscape', 'navigate', 'navigating', 'foster', 'fostering', 'leverage', 'leveraging', 'holistic', 'robust', 'intricate', 'intricacies', 'crucial', 'paramount', 'myriad', 'plethora', 'endeavor', 'endeavour', 'furthermore', 'moreover', 'additionally', 'consequently', 'notably', 'significantly', 'comprehensive', 'invaluable', 'seamless', 'transformative', 'unwavering', 'meticulous', 'meticulously'];

const AI_FRAMES = [
  "it's important to note", 'it is important to note', 'it is worth noting',
  'plays a crucial role', 'plays a vital role', 'plays a significant role',
  'in the realm of', 'in the ever-evolving', 'a testament to',
  'not only ... but also', 'when it comes to', 'the world of',
  'sheds light on', 'paves the way', 'at the forefront of',
  'in conclusion, it is', 'overall, it is clear'
];

/*
 * Returns INDICATORS, never a verdict. The caveat travels with the number so
 * no caller can render the score without it.
 */
export function aiIndicators(text) {
  const doc = buildDocument(text);
  const sentences = doc.bodySentences;
  const words = doc.bodyWords;
  const lower = words.map((w) => w.lower);
  const n = words.length || 1;

  const lengths = sentences.map((s) => s.words.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, lengths.length));
  const burstiness = mean ? sd / mean : 0;

  const paraLengths = doc.bodyParagraphs.map((p) => p.text.split(/\s+/).length).filter((x) => x > 25);
  const paraMean = paraLengths.reduce((a, b) => a + b, 0) / Math.max(1, paraLengths.length);
  const paraSd = Math.sqrt(paraLengths.reduce((a, b) => a + (b - paraMean) ** 2, 0) / Math.max(1, paraLengths.length));
  const paraUniformity = paraMean ? 1 - Math.min(1, paraSd / paraMean) : 0;

  const lowerText = text.toLowerCase();
  const vocabHits = lower.filter((w) => AI_VOCABULARY.includes(w)).length;
  const frameHits = AI_FRAMES.filter((f) => lowerText.includes(f.replace(' ... ', ' '))).length;
  const contractions = (text.match(/\b\w+['’](?:t|s|re|ve|ll|d|m)\b/g) || []).length;
  const tricolon = (text.match(/\b\w+,\s+\w+,\s+and\s+\w+\b/g) || []).length;

  const signals = [
    { key: 'Uniform sentence rhythm', weight: 22, value: clamp01((0.62 - burstiness) / 0.35), detail: `burstiness ${burstiness.toFixed(2)} (human academic prose typically 0.5–0.9)` },
    { key: 'Uniform paragraph length', weight: 13, value: clamp01((paraUniformity - 0.55) / 0.35), detail: `uniformity ${paraUniformity.toFixed(2)}` },
    { key: 'Model-favoured vocabulary', weight: 25, value: clamp01(((vocabHits / n) * 1000 - 2.5) / 9), detail: `${vocabHits} hits (${((vocabHits / n) * 1000).toFixed(1)} per 1000 words)` },
    { key: 'Formulaic framing', weight: 20, value: clamp01(frameHits / 6), detail: `${frameHits} stock frames` },
    { key: 'Absence of contractions', weight: 8, value: contractions === 0 ? 1 : clamp01((3 - contractions) / 3), detail: `${contractions} contractions` },
    { key: 'Rule-of-three lists', weight: 12, value: clamp01(((tricolon / Math.max(1, sentences.length)) * 100 - 2) / 8), detail: `${tricolon} tricolons` }
  ];

  const score = Math.round(signals.reduce((a, s) => a + s.weight * s.value, 0));

  return {
    score,
    band: score >= 65 ? 'Strong indicators' : score >= 40 ? 'Mixed indicators' : 'Few indicators',
    signals,
    metrics: { burstiness, paraUniformity, vocabHits, frameHits, contractions, tricolon, words: n },
    /* Deliberately part of the payload, not the UI's choice to include. */
    caveat: 'These are statistical tendencies, not evidence. Published AI detectors mislabel human writing regularly, and they misfire hardest on non-native English writers, on heavily edited prose, and on formulaic disciplinary genres — exactly the writing a thesis cohort produces. A high score is a reason to have a conversation with the student about their process, or to ask for drafts and notes. It is never a finding of misconduct, and it should never be recorded as one.'
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* FNV-1a, 32-bit. Fast, and collisions are harmless here — a false shingle
   match is filtered out by the MIN_RUN consecutive-hit requirement. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

/* ------------------------------------------------------------ cross-match */

/*
 * Reuse across a whole batch, every document against every other.
 *
 * compareAgainstCorpus re-fingerprints the entire corpus once per target,
 * which is fine for one thesis against a shelf and quadratic when the shelf
 * IS the batch — 30 submissions would fingerprint 900 documents. Here each
 * document is fingerprinted once and the hashes are inverted into buckets, so
 * the work is proportional to the number of shared hashes rather than to the
 * number of pairs.
 */
export function crossMatch(entries) {
  /* Fingerprint the body only. A cohort reading the same syllabus cites the
     same works, so bibliographies overlap heavily between papers that share
     nothing else; counting them would put every submission near the top. */
  const prints = entries.map((e) => {
    const body = e.text.slice(0, buildDocument(e.text).bodyEnd || e.text.length);
    return { id: e.id, label: e.label, text: e.text, print: fingerprint(body) };
  });

  const buckets = new Map();
  prints.forEach((p, doc) =>
    p.print.hashes.forEach((s) => {
      if (!buckets.has(s.h)) buckets.set(s.h, []);
      buckets.get(s.h).push({ doc, s });
    })
  );

  /*
   * A phrase that turns up across most of the cohort is the assignment brief,
   * a required declaration or a title page — shared because it was handed out,
   * not because it was copied.
   *
   * The filter only runs on a batch large enough for "most of the cohort" to
   * mean anything. Below that it does the opposite of its job: in a batch of
   * three, a passage in all three would be dropped as boilerplate when three
   * students copying each other is precisely the finding.
   */
  const ubiquitous = prints.length >= 5 ? Math.max(4, Math.ceil(prints.length * 0.6)) : Infinity;
  let suppressed = 0;

  const pairs = new Map();
  buckets.forEach((list) => {
    if (list.length < 2) return;
    if (new Set(list.map((x) => x.doc)).size >= ubiquitous) { suppressed++; return; }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].doc === list[j].doc) continue;
        const [lo, hi] = list[i].doc < list[j].doc ? [list[i], list[j]] : [list[j], list[i]];
        const key = `${lo.doc}|${hi.doc}`;
        let rec = pairs.get(key);
        if (!rec) {
          rec = { a: lo.doc, b: hi.doc, aHits: new Map(), bHits: new Map() };
          pairs.set(key, rec);
        }
        rec.aHits.set(lo.s.index, lo.s);
        rec.bHits.set(hi.s.index, hi.s);
      }
    }
  });

  const results = [];
  pairs.forEach((rec) => {
    const A = prints[rec.a];
    const B = prints[rec.b];
    const passagesA = mergeRuns([...rec.aHits.values()]).filter((p) => p.count >= MIN_RUN);
    if (!passagesA.length) return;
    const passagesB = mergeRuns([...rec.bHits.values()]).filter((p) => p.count >= MIN_RUN);
    const covered = passagesA.reduce((n, p) => n + (p.end - p.start), 0);
    results.push({
      a: A.id,
      b: B.id,
      labelA: A.label,
      labelB: B.label,
      /* Share of A's fingerprints that also appear in B, and vice versa. A
         short paper lifted whole into a long one is high one way and low the
         other, so both are kept rather than averaged away. */
      containmentA: A.print.hashes.length ? rec.aHits.size / A.print.hashes.length : 0,
      containmentB: B.print.hashes.length ? rec.bHits.size / B.print.hashes.length : 0,
      charsCovered: covered,
      passagesA: passagesA.slice(0, 40),
      passagesB: passagesB.slice(0, 40)
    });
  });

  results.sort(
    (x, y) => Math.max(y.containmentA, y.containmentB) - Math.max(x.containmentA, x.containmentB)
  );
  /* Reported, not hidden: every percentage above is net of this filter, and
     an instructor comparing two numbers deserves to know one was applied. */
  results.suppressedPhrases = suppressed;
  return results;
}
