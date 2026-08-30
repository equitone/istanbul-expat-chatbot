/*
 * text.js — offset-preserving segmentation for English academic prose.
 *
 * Every function returns spans carrying absolute {start,end} offsets into the
 * ORIGINAL document string. The highlighter depends on that invariant: if a
 * rule reports an offset, it must be usable to slice the untouched source.
 */

const ABBREVIATIONS = new Set([
  'dr', 'prof', 'mr', 'mrs', 'ms', 'st', 'jr', 'sr', 'vs', 'etc', 'al',
  'eg', 'ie', 'cf', 'fig', 'figs', 'ed', 'eds', 'vol', 'vols', 'no', 'nos',
  'pp', 'p', 'ch', 'chap', 'sec', 'ca', 'approx', 'dept', 'univ', 'inst',
  'trans', 'repr', 'rev', 'esp', 'viz', 'ibid', 'op', 'cit', 'phd', 'ba',
  'ma', 'msc', 'bsc', 'inc', 'ltd', 'co', 'jan', 'feb', 'mar', 'apr', 'jun',
  'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
]);

const CLOSERS = ')]}"’”\'';

/** Split into paragraphs. Blank lines win; a document with none falls back to single newlines. */
export function splitParagraphs(text) {
  let parts = matchSpans(text, /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g);
  const blankSeparated = /\n\s*\n/.test(text);
  if (!blankSeparated) parts = matchSpans(text, /[^\n]+/g);
  return parts
    .map((p) => trimSpan(text, p))
    .filter((p) => p.end > p.start)
    .map((p, index) => ({ ...p, index, text: text.slice(p.start, p.end) }));
}

/** Split one paragraph into sentences. `offset` is the paragraph's absolute start. */
export function splitSentences(source, offset = 0) {
  const out = [];
  const len = source.length;
  let start = 0;
  let i = 0;

  const push = (from, to) => {
    const span = trimSpan(source, { start: from, end: to });
    if (span.end > span.start) {
      out.push({
        start: span.start + offset,
        end: span.end + offset,
        text: source.slice(span.start, span.end)
      });
    }
  };

  while (i < len) {
    const ch = source[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      let j = i;
      while (j + 1 < len && '.!?'.includes(source[j + 1])) j++;
      if (isSentenceBoundary(source, start, i, j)) {
        let end = j + 1;
        while (end < len && CLOSERS.includes(source[end])) end++;
        push(start, end);
        let k = end;
        while (k < len && /\s/.test(source[k])) k++;
        start = k;
        i = k;
        continue;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  push(start, len);
  return out.map((s, index) => ({ ...s, index }));
}

function isSentenceBoundary(source, sentenceStart, first, last) {
  const terminator = source[last];

  if (terminator === '.') {
    const before = source.slice(sentenceStart, first);
    /* "1." opening a paragraph is a list marker or a section number; splitting
       there would strand it as its own sentence and skew every per-sentence
       statistic in a numbered methods chapter. */
    if (/^\s*\d{1,3}$/.test(before)) return false;
    const wordMatch = before.match(/([A-Za-z][A-Za-z.]*)$/);
    if (wordMatch) {
      const bare = wordMatch[1].replace(/\./g, '').toLowerCase();
      if (ABBREVIATIONS.has(bare)) return false;
      if (wordMatch[1].length === 1 && /[A-Z]/.test(wordMatch[1])) return false; // initial: "J. Smith"
    }
    if (/\d$/.test(before) && /^\d/.test(source.slice(last + 1))) return false; // decimal
  }

  let k = last + 1;
  while (k < len_(source) && CLOSERS.includes(source[k])) k++;
  if (k >= source.length) return true;
  if (!/\s/.test(source[k])) return false; // "e.g.x" — not a break
  while (k < source.length && /\s/.test(source[k])) k++;
  if (k >= source.length) return true;
  // A lowercase continuation almost always means the period was not terminal.
  return !/[a-z]/.test(source[k]);
}

const len_ = (s) => s.length;

/** Word tokens with offsets. Keeps internal apostrophes ("student's", "don't"). */
export function tokenizeWords(source, offset = 0) {
  const re = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-z]+)*|\d+(?:[.,]\d+)*/g;
  const out = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    out.push({
      text: m[0],
      lower: m[0].toLowerCase(),
      start: m.index + offset,
      end: m.index + m[0].length + offset,
      isNumber: /^\d/.test(m[0])
    });
  }
  return out;
}

function matchSpans(text, re) {
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

function trimSpan(text, span) {
  let { start, end } = span;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}

/** Liang-style heuristic syllable count. Good enough for readability indices. */
export function countSyllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  let n = groups ? groups.length : 1;
  if (/[^aeiou]le$/.test(w)) n++;
  if (/(?:ia|io|ua|uo|eo)/.test(w)) n++;
  return Math.max(1, n);
}

/** Build the sentence + paragraph scaffold once; every analyser reuses it. */
export function buildDocument(text) {
  const paragraphs = splitParagraphs(text);
  const sentences = [];
  paragraphs.forEach((p) => {
    /* A heading is not prose: it has no finite verb, no terminal stop and may
       open with a section number. Rules that assume a sentence must skip it. */
    p.isHeading = isHeadingLike(p.text);
    const list = splitSentences(p.text, p.start);
    p.sentenceIds = [];
    list.forEach((s) => {
      const id = sentences.length;
      p.sentenceIds.push(id);
      /* A leading "1." / "3)" is scaffolding, not prose. Record its length so
         rules anchored to the start of a sentence can skip past it while
         still reporting offsets into the original document. */
      const marker = s.text.match(/^\s*\d{1,3}[.)]\s+/);
      sentences.push({
        ...s,
        id,
        paragraph: p.index,
        isHeading: p.isHeading,
        lead: marker ? marker[0].length : 0,
        words: tokenizeWords(s.text, s.start)
      });
    });
  });
  const words = sentences.flatMap((s) => s.words);

  /* The reference list is not prose: counting it would wreck readability scores
     and flag every entry as a sentence fragment. Mark where the body ends. */
  const refHead = paragraphs.find(
    (p) => isHeadingLike(p.text) &&
      /^(references|bibliography|works cited|reference list)\b/i.test(stripNumbering(p.text))
  );
  const bodyEnd = refHead ? refHead.start : text.length;

  return {
    text,
    paragraphs,
    sentences,
    words,
    bodyEnd,
    referencesStart: refHead ? refHead.start : null,
    bodyParagraphs: paragraphs.filter((p) => p.start < bodyEnd),
    bodySentences: sentences.filter((s) => s.start < bodyEnd),
    bodyWords: words.filter((w) => w.start < bodyEnd)
  };
}

/* Strip a leading section number ("3.", "3.1", "IV.") — and nothing else.
   A looser character class silently ate the "I" off "Introduction". */
export function stripNumbering(heading) {
  return heading.trim().replace(/^(?:\d+(?:\.\d+)*|[IVXLC]{1,6})[.)]?\s+/, '').trim().toLowerCase();
}

/** Headings are short, unpunctuated lines — useful for section detection. */
export function isHeadingLike(paragraphText) {
  const t = paragraphText.trim();
  if (!t || t.length > 90) return false;
  if (/[.!?;:]$/.test(t) && !/^\d+(\.\d+)*\.?$/.test(t)) return false;
  const words = t.split(/\s+/);
  return words.length <= 12;
}
