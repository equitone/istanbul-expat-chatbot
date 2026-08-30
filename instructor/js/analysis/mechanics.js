/*
 * mechanics.js — typos, spelling, punctuation and spacing.
 * Every issue carries absolute offsets so the highlighter can mark it exactly.
 */
import { MISSPELLINGS, SPELLING_VARIANTS, CONFUSION_PATTERNS } from './lexicons.js';

export const CATEGORY = 'typo';

const variantIndex = (() => {
  const map = new Map();
  SPELLING_VARIANTS.forEach((v) => {
    map.set(v.us, { dialect: 'US', pair: v });
    map.set(v.uk, { dialect: 'UK', pair: v });
  });
  return map;
})();

export function analyseMechanics(doc) {
  const issues = [];
  const { text, words } = doc;
  const add = (o) => issues.push({ category: CATEGORY, ...o, excerpt: text.slice(o.start, o.end) });

  /* ---------------------------------------------------------- misspellings */
  words.forEach((w) => {
    const fix = MISSPELLINGS[w.lower];
    if (fix) {
      add({
        rule: 'misspelling',
        severity: 'high',
        start: w.start,
        end: w.end,
        message: `Misspelling: “${w.text}”.`,
        suggestion: matchCase(w.text, fix)
      });
    }
  });

  /* ------------------------------------------------ doubled words: "the the" */
  for (let i = 1; i < words.length; i++) {
    const a = words[i - 1];
    const b = words[i];
    if (a.lower !== b.lower || a.isNumber) continue;
    // Only if nothing but spaces separates them (so "that that" across a clause
    // boundary with punctuation is not flagged).
    const between = text.slice(a.end, b.start);
    if (!/^[ \t]+$/.test(between)) continue;
    if (a.lower === 'had' || a.lower === 'that') continue; // legitimately doubles
    add({
      rule: 'doubled-word',
      severity: 'high',
      start: a.start,
      end: b.end,
      message: `Repeated word “${a.text}”.`,
      suggestion: a.text
    });
  }

  /* -------------------------------------------------------------- spacing */
  scan(text, /[^\n\S]{2,}/g, (m) => {
    if (m.index > 0 && text[m.index - 1] === '\n') return; // indentation
    add({ rule: 'double-space', severity: 'low', start: m.index, end: m.index + m[0].length, message: 'Multiple consecutive spaces.', suggestion: ' ' });
  });
  scan(text, /\s+([,;:.!?])/g, (m) => {
    if (/\n/.test(m[0])) return;
    add({ rule: 'space-before-punctuation', severity: 'medium', start: m.index, end: m.index + m[0].length, message: `No space before “${m[1]}”.`, suggestion: m[1] });
  });
  scan(text, /([,;:])(?=[A-Za-z0-9])/g, (m) =>
    add({ rule: 'missing-space-after-punctuation', severity: 'medium', start: m.index, end: m.index + 1, message: `Missing space after “${m[1]}”.`, suggestion: `${m[1]} ` })
  );
  scan(text, /\(\s+|\s+\)/g, (m) => {
    if (/\n/.test(m[0])) return;
    add({ rule: 'bracket-spacing', severity: 'low', start: m.index, end: m.index + m[0].length, message: 'Stray space inside parentheses.', suggestion: m[0].trim() });
  });

  /* ---------------------------------------------------------- punctuation */
  scan(text, /([!?.])\1{1,}/g, (m) =>
    add({ rule: 'repeated-punctuation', severity: 'medium', start: m.index, end: m.index + m[0].length, message: 'Repeated punctuation is out of register for a thesis.', suggestion: m[1] })
  );
  scan(text, /,\s*(?:and|but|or)\s*,/gi, (m) =>
    add({ rule: 'stray-comma', severity: 'medium', start: m.index, end: m.index + m[0].length, message: 'Comma on both sides of a conjunction.', suggestion: m[0].replace(/,\s*$/, '') })
  );
  scan(text, /\s+-\s+/g, (m) =>
    add({ rule: 'hyphen-as-dash', severity: 'low', start: m.index, end: m.index + m[0].length, message: 'A spaced hyphen is being used as a dash; use an em dash (—) or en dash (–).', suggestion: ' — ' })
  );
  scan(text, /\b(\d{4})\s*-\s*(\d{4})\b/g, (m) =>
    add({ rule: 'year-range-dash', severity: 'low', start: m.index, end: m.index + m[0].length, message: 'Year ranges take an en dash.', suggestion: `${m[1]}–${m[2]}` })
  );

  /* --------------------------------------------------- unbalanced delimiters */
  balanceCheck(text, '(', ')', 'parenthesis').forEach(add);
  balanceCheck(text, '[', ']', 'square bracket').forEach(add);
  const straightQuotes = (text.match(/"/g) || []).length;
  if (straightQuotes % 2 === 1) {
    const last = text.lastIndexOf('"');
    add({ rule: 'unbalanced-quote', severity: 'medium', start: last, end: last + 1, message: 'Odd number of double quotes — one quotation is left open.', suggestion: '' });
  }

  /* ------------------------------------------------------ quote consistency */
  const curly = (text.match(/[“”]/g) || []).length;
  if (curly > 0 && straightQuotes > 0) {
    const first = text.indexOf('"');
    add({ rule: 'mixed-quote-style', severity: 'low', start: first, end: first + 1, message: 'The document mixes straight (") and curly (“ ”) quotation marks. Pick one.', suggestion: '' });
  }

  /* ----------------------------------------------------- capitalisation */
  doc.sentences.forEach((s) => {
    if (s.isHeading) return;
    /* Past any list marker: "9. although" should still be flagged. */
    const first = s.words.find((w) => w.start >= s.start + (s.lead || 0));
    if (!first || first.isNumber) return;
    if (/^[a-z]/.test(first.text) && !/^[a-z]\)/.test(s.text)) {
      add({ rule: 'sentence-capitalisation', severity: 'medium', start: first.start, end: first.end, message: 'Sentence does not begin with a capital letter.', suggestion: capitalise(first.text) });
    }
  });
  scan(text, /\bi\b(?!\.[a-z])/g, (m) => {
    add({ rule: 'lowercase-i', severity: 'high', start: m.index, end: m.index + 1, message: 'The pronoun “I” is always capitalised.', suggestion: 'I' });
  });

  /* -------------------------------------------- missing terminal punctuation */
  doc.paragraphs.forEach((p) => {
    const t = p.text.trimEnd();
    if (t.length < 60) return; // headings and captions are exempt
    if (!/[.!?:;)"'’”\]]$/.test(t)) {
      add({ rule: 'missing-terminal-punctuation', severity: 'medium', start: p.start + t.length - 1, end: p.start + t.length, message: 'Paragraph does not end with terminal punctuation.', suggestion: '.' });
    }
  });

  /* ------------------------------------------------- context-based confusions */
  CONFUSION_PATTERNS.forEach((pat) => {
    scan(text, pat.re, (m) =>
      add({ rule: pat.id, severity: 'high', start: m.index, end: m.index + m[0].length, message: pat.message, suggestion: pat.suggest })
    );
  });

  /* -------------------------------------------------------- a / an articles */
  for (let i = 0; i < words.length - 1; i++) {
    const art = words[i];
    const next = words[i + 1];
    if (art.lower !== 'a' && art.lower !== 'an') continue;
    if (!/^[ \t]+$/.test(text.slice(art.end, next.start))) continue;
    const needsAn = startsWithVowelSound(next.text);
    if (art.lower === 'a' && needsAn) {
      add({ rule: 'article-a-an', severity: 'high', start: art.start, end: art.end, message: `“${next.text}” begins with a vowel sound — use “an”.`, suggestion: matchCase(art.text, 'an') });
    } else if (art.lower === 'an' && !needsAn) {
      add({ rule: 'article-a-an', severity: 'high', start: art.start, end: art.end, message: `“${next.text}” begins with a consonant sound — use “a”.`, suggestion: matchCase(art.text, 'a') });
    }
  }

  return { issues, dialect: detectDialect(words) };
}

/* ---------------------------------------------------------------- helpers */

function detectDialect(words) {
  const counts = { US: 0, UK: 0 };
  const seen = { US: new Set(), UK: new Set() };
  words.forEach((w) => {
    const hit = variantIndex.get(w.lower);
    if (!hit) return;
    counts[hit.dialect]++;
    seen[hit.dialect].add(w.lower);
  });
  const total = counts.US + counts.UK;
  const dominant = counts.US >= counts.UK ? 'US' : 'UK';
  const minority = dominant === 'US' ? 'UK' : 'US';
  return {
    counts,
    dominant: total ? dominant : null,
    mixed: counts.US > 0 && counts.UK > 0,
    offenders: [...seen[minority]].sort(),
    total
  };
}

function balanceCheck(text, open, close, label) {
  const stack = [];
  const issues = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === open) stack.push(i);
    else if (text[i] === close) {
      if (stack.length) stack.pop();
      else issues.push({ rule: 'unbalanced-bracket', category: CATEGORY, severity: 'medium', start: i, end: i + 1, excerpt: close, message: `Closing ${label} with no opening one.`, suggestion: '' });
    }
  }
  stack.forEach((i) =>
    issues.push({ rule: 'unbalanced-bracket', category: CATEGORY, severity: 'medium', start: i, end: i + 1, excerpt: open, message: `Opening ${label} is never closed.`, suggestion: '' })
  );
  return issues;
}

/* Vowel *sound*, not vowel letter — the usual source of a/an errors. */
const AN_EXCEPTIONS = /^(hour|honest|honour|honor|heir|honourable|honorable)/i;
const A_EXCEPTIONS = /^(uni|use|user|usual|utilit|utilis|utiliz|euro|ubiquit|unanim|unif|univers|one|once)/i;
const AN_LETTERS = /^[AEFHILMNORSX]$/;

function startsWithVowelSound(word) {
  if (AN_EXCEPTIONS.test(word)) return true;
  if (A_EXCEPTIONS.test(word)) return false;
  // Acronym read letter-by-letter: all caps, no vowels-as-word, e.g. "an MRI".
  if (/^[A-Z]{2,}$/.test(word)) return AN_LETTERS.test(word[0]);
  return /^[aeiou]/i.test(word);
}

function matchCase(source, replacement) {
  if (/^[A-Z][a-z]/.test(source)) return replacement[0].toUpperCase() + replacement.slice(1);
  if (/^[A-Z]+$/.test(source) && source.length > 1) return replacement.toUpperCase();
  return replacement;
}

const capitalise = (s) => s[0].toUpperCase() + s.slice(1);

function scan(text, re, fn) {
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = rx.exec(text)) !== null) {
    fn(m);
    if (m[0].length === 0) rx.lastIndex++;
  }
}
