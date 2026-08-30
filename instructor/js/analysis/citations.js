/*
 * citations.js — citation STYLE conformance for APA 7 and MLA 9.
 *
 * This checks form, not truth: whether an entry is punctuated and ordered the
 * way the chosen style requires. Whether the source actually exists is a
 * different question, answered by verify.js.
 *
 * The two styles differ in ways that are mechanically detectable:
 *
 *              APA 7                          MLA 9
 *   in-text    (Sontag, 1977, p. 12)          (Sontag 12)
 *   joiner     & in parentheses, and in prose  and everywhere
 *   names      Sontag, S.                      Sontag, Susan.
 *   date       (1977). straight after author   , 1977. near the end
 *   article    Sentence case, no quotes        "Title Case in Quotes."
 *   locator    12(3), 45–67                    vol. 12, no. 3, pp. 45-67
 *   list head  References                      Works Cited
 */

export const STYLES = {
  apa7: {
    id: 'apa7',
    label: 'APA 7',
    listHeading: /^references$/i,
    listHeadingLabel: 'References',
    /* (Sontag, 1977) / (Sontag & Barthes, 1977) / (Sontag et al., 1977, p. 12) */
    parenthetical: /\(([^()]{0,120}?),\s*(\d{4}[a-z]?|n\.d\.)((?:,\s*(?:pp?\.|paras?\.|ch\.)\s*[^)]+)?)\)/g,
    narrative: /\b([A-Z][A-Za-z'’\-]+(?:\s+(?:et\s+al\.|and|&)\s+[A-Z][A-Za-z'’\-]+)*)\s+\((\d{4}[a-z]?|n\.d\.)\)/g
  },
  mla9: {
    id: 'mla9',
    label: 'MLA 9',
    listHeading: /^works cited$/i,
    listHeadingLabel: 'Works Cited',
    /* (Sontag 12) / (Sontag and Barthes 12-14) / (Sontag, "On Photography" 12) */
    parenthetical: /\(([A-Z][A-Za-z'’\-]+(?:\s+(?:et\s+al\.|and)\s+[A-Z][A-Za-z'’\-]+)*)(?:,\s*[^)]*?)?\s+(\d+(?:[-–]\d+)?)\)/g,
    narrative: /\b([A-Z][A-Za-z'’\-]+)\s+(?:argues|writes|notes|observes|claims|contends|states|suggests|maintains)\b[^.]{0,120}?\((\d+(?:[-–]\d+)?)\)/g
  }
};

export const CATEGORY = 'citation';

export function analyseCitations(doc, styleId = 'apa7') {
  const style = STYLES[styleId] || STYLES.apa7;
  const other = styleId === 'apa7' ? STYLES.mla9 : STYLES.apa7;
  const { text } = doc;
  const issues = [];
  const add = (o) => issues.push({ category: CATEGORY, style: style.id, ...o, excerpt: text.slice(o.start, o.end) });

  const body = text.slice(0, doc.bodyEnd);

  /* ------------------------------------------------ in-text conformance */
  const inStyle = [
    ...matches(body, style.parenthetical).map((m) => ({ ...m, form: 'parenthetical' })),
    ...matches(body, style.narrative).map((m) => ({ ...m, form: 'narrative' }))
  ];
  const inOther = [
    ...matches(body, other.parenthetical),
    ...matches(body, other.narrative)
  ].filter((m) => !inStyle.some((s) => overlaps(s, m)));

  inOther.forEach((m) =>
    add({
      rule: 'wrong-style-in-text',
      severity: 'high',
      start: m.start,
      end: m.end,
      message: `This in-text citation is ${other.label} form, but the document is set to ${style.label}.`,
      suggestion: style.id === 'apa7'
        ? 'APA 7 wants author and year: (Sontag, 1977, p. 12).'
        : 'MLA 9 wants author and page, with no comma and no year: (Sontag 12).'
    })
  );

  /* APA-only: "&" is for parentheses, "and" for running prose. */
  if (style.id === 'apa7') {
    matches(body, /\b([A-Z][A-Za-z'’\-]+)\s+&\s+([A-Z][A-Za-z'’\-]+)\s+\((\d{4})\)/g).forEach((m) =>
      add({
        rule: 'ampersand-in-prose',
        severity: 'medium',
        start: m.start,
        end: m.end,
        message: 'In APA 7, “&” belongs inside parentheses; a narrative citation takes “and”.',
        suggestion: m.raw.replace(' & ', ' and ')
      })
    );
    matches(body, /\(([A-Z][A-Za-z'’\-]+)\s+and\s+([A-Z][A-Za-z'’\-]+),\s*\d{4}/g).forEach((m) =>
      add({
        rule: 'and-in-parentheses',
        severity: 'medium',
        start: m.start,
        end: m.end,
        message: 'In APA 7, a parenthetical citation takes “&”, not “and”.',
        suggestion: m.raw.replace(' and ', ' & ')
      })
    );
    /* Three or more authors are "et al." from the first citation in APA 7. */
    matches(body, /\(([A-Z][A-Za-z'’\-]+),\s*([A-Z][A-Za-z'’\-]+),?\s*(?:&|and)\s*([A-Z][A-Za-z'’\-]+),\s*\d{4}\)/g).forEach((m) =>
      add({
        rule: 'apa-et-al',
        severity: 'medium',
        start: m.start,
        end: m.end,
        message: 'APA 7 uses “et al.” from the first citation when a work has three or more authors.',
        suggestion: `(${m.groups[0]} et al., …)`
      })
    );
  } else {
    /* MLA never puts a comma between author and page. */
    matches(body, /\(([A-Z][A-Za-z'’\-]+),\s+(\d+(?:[-–]\d+)?)\)/g).forEach((m) =>
      add({
        rule: 'mla-comma-before-page',
        severity: 'medium',
        start: m.start,
        end: m.end,
        message: 'MLA 9 puts no comma between the author and the page number.',
        suggestion: `(${m.groups[0]} ${m.groups[1]})`
      })
    );
    matches(body, /\(([A-Z][A-Za-z'’\-]+)\s+&\s+/g).forEach((m) =>
      add({
        rule: 'mla-ampersand',
        severity: 'medium',
        start: m.start,
        end: m.end,
        message: 'MLA 9 spells out “and” between two authors.',
        suggestion: m.raw.replace('&', 'and')
      })
    );
  }

  /* -------------------------------------------------- list heading name */
  const headings = doc.paragraphs.filter((p) => p.text.trim().length < 40);
  const listHead = headings.find((p) => /^(references|works cited|bibliography|reference list)$/i.test(p.text.trim()));
  if (listHead && !style.listHeading.test(listHead.text.trim())) {
    add({
      rule: 'wrong-list-heading',
      severity: 'medium',
      start: listHead.start,
      end: listHead.end,
      message: `${style.label} names this list “${style.listHeadingLabel}”, not “${listHead.text.trim()}”.`,
      suggestion: style.listHeadingLabel
    });
  }

  /* -------------------------------------------------- reference entries */
  const entries = splitEntries(text, doc);
  entries.forEach((e) => {
    const problems = style.id === 'apa7' ? checkApaEntry(e.raw) : checkMlaEntry(e.raw);
    problems.forEach((p) =>
      add({
        rule: p.rule,
        severity: p.severity || 'medium',
        start: e.start,
        end: e.end,
        message: p.message,
        suggestion: p.suggestion || ''
      })
    );
  });

  /* Alphabetical order is required by both styles. */
  const keys = entries.map((e) => (e.raw.match(/^([A-Za-z'’\-]+)/) || ['', ''])[1].toLowerCase());
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] && keys[i - 1] && keys[i] < keys[i - 1]) {
      add({
        rule: 'list-not-alphabetical',
        severity: 'low',
        start: entries[i].start,
        end: entries[i].end,
        message: `Entry “${keys[i]}” comes after “${keys[i - 1]}” — the list is not in alphabetical order.`,
        suggestion: ''
      });
      break; // one report is enough; the fix is to sort the whole list
    }
  }

  const detected = detectStyle(inStyle.length, inOther.length, entries);
  return {
    issues,
    style: style.id,
    metrics: {
      inTextInStyle: inStyle.length,
      inTextWrongStyle: inOther.length,
      entries: entries.length,
      conformance: inStyle.length + inOther.length
        ? inStyle.length / (inStyle.length + inOther.length)
        : null,
      detected
    },
    entries
  };
}

/* Which style does the document actually look like? Reported so the
   instructor can flip the toggle rather than wade through false errors. */
function detectStyle(inStyleCount, otherCount, entries) {
  const mlaSignals = entries.filter((e) => /\bvol\.\s*\d|\bno\.\s*\d|\bpp?\.\s*\d+[-–]|"[^"]+\.?"/.test(e.raw)).length;
  const apaSignals = entries.filter((e) => /\(\d{4}[a-z]?\)\.|\bdoi\b|https:\/\/doi\.org/i.test(e.raw)).length;
  if (apaSignals > mlaSignals * 1.5) return 'apa7';
  if (mlaSignals > apaSignals * 1.5) return 'mla9';
  return null;
}

/* --------------------------------------------------------- entry checks */

function checkApaEntry(raw) {
  const out = [];
  if (!/\(\s*(?:\d{4}[a-z]?|n\.d\.)\s*\)/.test(raw)) {
    out.push({ rule: 'apa-missing-year', severity: 'high', message: 'APA 7 entry has no year in parentheses after the author.', suggestion: 'Author, A. A. (2020). Title…' });
  } else if (!/^[^()]{0,90}\(\s*(?:\d{4}[a-z]?|n\.d\.)\s*\)/.test(raw)) {
    out.push({ rule: 'apa-year-position', severity: 'medium', message: 'In APA 7 the year comes directly after the author name.', suggestion: 'Author, A. A. (2020). Title…' });
  }
  if (!/^[A-Z][A-Za-z'’\-]+,\s*[A-Z]\./.test(raw)) {
    out.push({ rule: 'apa-author-initials', severity: 'medium', message: 'APA 7 uses surname then initials: “Sontag, S.”', suggestion: '' });
  }
  if (/"[^"]{6,}"/.test(raw)) {
    out.push({ rule: 'apa-quoted-title', severity: 'medium', message: 'APA 7 does not put article titles in quotation marks.', suggestion: '' });
  }
  if (/\bvol\.\s*\d|\bno\.\s*\d/i.test(raw)) {
    out.push({ rule: 'apa-volume-form', severity: 'medium', message: 'APA 7 writes the volume and issue as “12(3)”, not “vol. 12, no. 3”.', suggestion: '' });
  }
  if (/\bpp?\.\s*\d/i.test(raw) && !/\d+\(\d+\)/.test(raw)) {
    out.push({ rule: 'apa-page-form', severity: 'low', message: 'APA 7 journal entries give page ranges without “pp.” (books chapters keep it).', suggestion: '' });
  }
  return out;
}

function checkMlaEntry(raw) {
  const out = [];
  if (/\(\s*\d{4}[a-z]?\s*\)\./.test(raw)) {
    out.push({ rule: 'mla-parenthesised-year', severity: 'high', message: 'MLA 9 does not put the year in parentheses after the author; it goes near the end of the entry.', suggestion: 'Sontag, Susan. On Photography. Farrar, 1977.' });
  }
  if (!/\b(?:19|20)\d{2}\b/.test(raw)) {
    out.push({ rule: 'mla-missing-year', severity: 'medium', message: 'No publication year found in this entry.', suggestion: '' });
  }
  if (/^[A-Z][A-Za-z'’\-]+,\s*[A-Z]\.\s*(?:[A-Z]\.\s*)*(?:\(|$)/.test(raw)) {
    out.push({ rule: 'mla-initials', severity: 'medium', message: 'MLA 9 spells out the author’s given name: “Sontag, Susan.”', suggestion: '' });
  }
  if (/\d+\(\d+\)/.test(raw)) {
    out.push({ rule: 'mla-volume-form', severity: 'medium', message: 'MLA 9 writes “vol. 12, no. 3”, not “12(3)”.', suggestion: '' });
  }
  if (/,\s*(?:19|20)\d{2},\s*pp?\.\s*\d+[-–]\d+/.test(raw) === false && /\bjournal\b/i.test(raw)) {
    out.push({ rule: 'mla-page-form', severity: 'low', message: 'MLA 9 journal entries end with “pp. 45-67.”', suggestion: '' });
  }
  return out;
}

/* Reference entries: each hanging-indent block after the list heading. */
export function splitEntries(text, doc) {
  if (doc.referencesStart === null || doc.referencesStart === undefined) return [];
  const headEnd = (doc.paragraphs.find((p) => p.start === doc.referencesStart) || {}).end || doc.referencesStart;
  const tail = text.slice(headEnd);
  const out = [];
  const re = /[^\n]+/g;
  let m;
  while ((m = re.exec(tail)) !== null) {
    const line = m[0];
    const raw = line.replace(/\s+/g, ' ').trim();
    const start = headEnd + m.index;
    const end = start + line.length;
    /* A hanging-indent continuation belongs to the entry above it, not to a
       new one — that is the only case where two lines are one reference. */
    const isContinuation = /^\s{2,}/.test(line) && out.length;
    if (isContinuation) {
      const prev = out[out.length - 1];
      prev.raw = `${prev.raw} ${raw}`.trim();
      prev.end = end;
      continue;
    }
    if (raw.length < 18) continue;
    out.push({ raw, start, end });
  }
  return out;
}

/* ---------------------------------------------------------------- utils */

function matches(text, re) {
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const out = [];
  let m;
  while ((m = rx.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, raw: m[0], groups: m.slice(1) });
    if (m[0].length === 0) rx.lastIndex++;
  }
  return out;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;
