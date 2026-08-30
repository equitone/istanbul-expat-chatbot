/*
 * overview.js — whole-document description: readability, vocabulary richness,
 * section structure, and an in-text-citation / reference-list cross-check.
 */
import { countSyllables, isHeadingLike, stripNumbering } from './text.js';
import { EXPECTED_SECTIONS, STOPWORDS } from './lexicons.js';

export const CATEGORY = 'structure';

export function analyseOverview(doc, argumentResult) {
  const { text } = doc;
  const sentences = doc.bodySentences;
  const paragraphs = doc.bodyParagraphs;
  const words = doc.bodyWords;
  const issues = [];
  const add = (o) => issues.push({ category: CATEGORY, ...o, excerpt: text.slice(o.start, o.end) });

  const alphaWords = words.filter((w) => !w.isNumber);
  const wordCount = alphaWords.length;
  const sentenceCount = sentences.length || 1;

  /* --------------------------------------------------------- readability */
  let syllableTotal = 0;
  let complexWords = 0;
  let longWords = 0;
  alphaWords.forEach((w) => {
    const syl = countSyllables(w.text);
    syllableTotal += syl;
    if (syl >= 3) complexWords++;
    if (w.text.length > 6) longWords++;
  });

  const asl = wordCount / sentenceCount;              // average sentence length
  const asw = syllableTotal / Math.max(1, wordCount); // average syllables per word
  const readability = {
    fleschReadingEase: round(206.835 - 1.015 * asl - 84.6 * asw),
    fleschKincaidGrade: round(0.39 * asl + 11.8 * asw - 15.59),
    gunningFog: round(0.4 * (asl + 100 * (complexWords / Math.max(1, wordCount)))),
    smog: round(1.043 * Math.sqrt(complexWords * (30 / sentenceCount)) + 3.1291),
    avgSentenceLength: round(asl),
    avgSyllablesPerWord: round(asw, 2),
    longWordRate: round(longWords / Math.max(1, wordCount), 3)
  };

  /* --------------------------------------------- sentence-length rhythm */
  const lengths = sentences.map((s) => s.words.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, lengths.length));
  const rhythm = {
    mean: round(mean),
    stdev: round(sd),
    shortest: Math.min(...lengths, 0),
    longest: Math.max(...lengths, 0),
    monotone: sd < 5 && lengths.length > 15
  };
  if (rhythm.monotone) {
    add({
      rule: 'monotone-rhythm', severity: 'low', start: 0, end: Math.min(120, text.length),
      message: `Sentence length barely varies (σ = ${rhythm.stdev} words). Uniform rhythm flattens emphasis — a short sentence after a long one is how prose signals “this is the point”.`,
      suggestion: ''
    });
  }

  /* ------------------------------------------------------- vocabulary */
  const freq = new Map();
  alphaWords.forEach((w) => {
    if (STOPWORDS.has(w.lower) || w.lower.length < 4) return;
    freq.set(w.lower, (freq.get(w.lower) || 0) + 1);
  });
  const topTerms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    .map(([term, count]) => ({ term, count, per1000: round((count / Math.max(1, wordCount)) * 1000, 2) }));

  const types = new Set(alphaWords.map((w) => w.lower));
  const vocabulary = {
    tokens: wordCount,
    types: types.size,
    typeTokenRatio: round(types.size / Math.max(1, wordCount), 3),
    mattr: round(movingAverageTTR(alphaWords.map((w) => w.lower), 100), 3),
    nominalisationRate: round(alphaWords.filter((w) => /(?:tion|sion|ment|ness|ity|ance|ence|ism)s?$/.test(w.lower)).length / Math.max(1, wordCount), 3),
    topTerms
  };

  if (vocabulary.nominalisationRate > 0.09) {
    add({
      rule: 'nominalisation', severity: 'low', start: 0, end: Math.min(120, text.length),
      message: `${Math.round(vocabulary.nominalisationRate * 100)}% of words are nominalisations (“-tion”, “-ment”, “-ity”). Heavy noun-stacking buries the verbs and slows the reader.`,
      suggestion: 'Turn key nouns back into verbs: “the implementation of X was carried out” → “we implemented X”.'
    });
  }

  /* ----------------------------------------------------- overused words */
  topTerms.filter((t) => t.per1000 > 12 && t.count >= 8).forEach((t) => {
    const first = words.find((w) => w.lower === t.term);
    if (first) {
      add({
        rule: 'overused-term', severity: 'low', start: first.start, end: first.end,
        message: `“${t.term}” appears ${t.count} times (${t.per1000} per 1000 words). If it is a defined technical term this is fine; otherwise vary it.`,
        suggestion: ''
      });
    }
  });

  /* -------------------------------------------------------- structure */
  const headings = doc.paragraphs
    .filter((p) => isHeadingLike(p.text))
    .map((p) => ({ text: p.text.trim(), start: p.start, end: p.end, index: p.index }));

  const found = {};
  EXPECTED_SECTIONS.forEach((sec) => {
    found[sec.key] = headings.find((h) => {
      const norm = stripNumbering(h.text);
      return sec.labels.some((l) => norm === l || norm.startsWith(l + ' ') || norm.startsWith(l + ':'));
    }) || null;
  });
  const missingSections = EXPECTED_SECTIONS.filter((s) => !found[s.key]).map((s) => s.key);

  /* -------------------------------------------- references cross-check */
  const references = extractReferenceEntries(text, headings);
  const citations = (argumentResult && argumentResult.citations) || [];
  const crossCheck = crossCheckCitations(citations, references);

  crossCheck.uncited.slice(0, 40).forEach((entry) =>
    add({
      rule: 'reference-never-cited', severity: 'medium', start: entry.start, end: entry.end,
      message: `This reference is in the list but never cited in the text (“${entry.surname} ${entry.year}”).`,
      suggestion: 'Cite it or remove it — padded bibliographies are the first thing an examiner checks.'
    })
  );
  crossCheck.missing.slice(0, 40).forEach((cite) =>
    add({
      rule: 'citation-missing-reference', severity: 'high', start: cite.start, end: cite.end,
      message: `“${cite.key}” is cited in the text but has no entry in the reference list.`,
      suggestion: 'Add the full reference.'
    })
  );

  /* ------------------------------------------------------- word budget */
  const structure = {
    words: wordCount,
    sentences: sentenceCount,
    paragraphs: paragraphs.length,
    headings: headings.map((h) => h.text),
    sectionsFound: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, Boolean(v)])),
    missingSections,
    referenceEntries: references.length,
    ...crossCheck.summary,
    avgParagraphWords: round(wordCount / Math.max(1, paragraphs.length)),
    readingMinutes: Math.max(1, Math.round(wordCount / 220))
  };

  return { issues, readability, rhythm, vocabulary, structure, references, crossCheck };
}

/* ---------------------------------------------------------------- helpers */

/* Moving-average type-token ratio: length-independent, unlike raw TTR. */
function movingAverageTTR(tokens, window) {
  if (tokens.length < window) {
    return tokens.length ? new Set(tokens).size / tokens.length : 0;
  }
  let total = 0;
  let n = 0;
  for (let i = 0; i + window <= tokens.length; i += Math.max(1, Math.floor(window / 4))) {
    total += new Set(tokens.slice(i, i + window)).size / window;
    n++;
  }
  return n ? total / n : 0;
}

/* Pull the reference list and split it into entries. */
function extractReferenceEntries(text, headings) {
  const head = headings.find((h) => /^(references|bibliography|works cited|reference list)\b/i.test(stripNumbering(h.text)));
  if (!head) return [];
  const tail = text.slice(head.end);
  const lines = [];
  const re = /[^\n]+/g;
  let m;
  while ((m = re.exec(tail)) !== null) {
    const raw = m[0].trim();
    if (raw.length < 15) continue;
    const year = raw.match(/\((\d{4}[a-z]?)\)|\b(19|20)\d{2}[a-z]?\b/);
    const surname = raw.match(/^([A-Z][A-Za-z'’\-]+)/);
    if (!surname) continue;
    lines.push({
      raw,
      start: head.end + m.index,
      end: head.end + m.index + m[0].length,
      surname: surname[1],
      year: year ? (year[1] || year[0]) : null
    });
  }
  return lines;
}

function crossCheckCitations(citations, references) {
  const authorDate = citations.filter((c) => c.style === 'author-date');
  const refKeys = new Set(references.map((r) => `${r.surname.toLowerCase()}|${(r.year || '').replace(/[a-z]$/, '')}`));
  const citedKeys = new Set();

  const missing = [];
  authorDate.forEach((c) => {
    const [surname, year] = c.key.split(/\s+/);
    if (!surname || !year) return;
    const key = `${surname.toLowerCase()}|${year.replace(/[a-z]$/, '')}`;
    citedKeys.add(key);
    if (references.length && !refKeys.has(key) && !missing.some((x) => x.key === c.key)) missing.push(c);
  });

  const uncited = references.filter(
    (r) => r.year && !citedKeys.has(`${r.surname.toLowerCase()}|${r.year.replace(/[a-z]$/, '')}`)
  );

  return {
    missing,
    uncited,
    summary: {
      inTextCitations: citations.length,
      citationsMissingFromList: missing.length,
      referencesNeverCited: references.length ? uncited.length : 0
    }
  };
}

const round = (v, d = 1) => {
  if (!isFinite(v)) return 0;
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
