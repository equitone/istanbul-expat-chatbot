/*
 * style-audit.js — a document checked against one citation style.
 *
 * Three questions, asked separately because they have different answers and
 * a writer fixes them at different moments:
 *
 *   citations    the in-text citations in the running prose
 *   entries      the reference list at the back
 *   marks        the punctuation inside both
 *
 * WHERE THE RULES COME FROM, AND WHAT THAT IS WORTH.
 *
 * The Publication Manual of the American Psychological Association, 7th
 * edition, and the MLA Handbook, 8th and 9th editions. Every finding names
 * which, so a disagreement is settled by opening the handbook.
 *
 * Said plainly, because the punctuation checker in this app sets a higher
 * bar: no copy of either manual ships here, the way Casagrande does for
 * prose punctuation, so these findings cite the manual by name and edition
 * rather than by chapter. They are the forms the manuals set out, and they
 * are checked narrowly: only patterns that are unambiguous in either style
 * are flagged. The long tail of either handbook is not here and is not
 * pretended to be.
 *
 * NOTHING IS REWRITTEN. Each finding says what is wrong and which style
 * says so. A citation silently corrected is a citation nobody checked.
 *
 * ON MLA 8 AND MLA 9.
 *
 * For the entry types a literature department submits, they mostly agree.
 * The ninth edition expanded the guidance around the container model,
 * added chapters on inclusive language and annotated bibliographies, and
 * recommends the https://doi.org/ form for a DOI; it did not reshape the
 * journal article or the book. The two are kept apart anyway because the
 * writer needs to say which they are working to, and the tab says where
 * they agree rather than inventing a difference to justify the button.
 */

export const STYLES = [
  { id: 'apa7', label: 'APA 7', tone: 'apa',
    manual: 'the APA Publication Manual, 7th edition',
    listHeading: 'References',
    about: 'Author–date. The sciences and social sciences.' },
  { id: 'mla8', label: 'MLA 8', tone: 'mla8',
    manual: 'the MLA Handbook, 8th edition',
    listHeading: 'Works Cited',
    about: 'Author–page, container model. 2016.' },
  { id: 'mla9', label: 'MLA 9', tone: 'mla9',
    manual: 'the MLA Handbook, 9th edition',
    listHeading: 'Works Cited',
    about: 'Author–page. 2021, and the current one.' }
];

export const CHECKS = [
  { id: 'citations', label: 'In-text citations', tone: 'check-cite',
    about: 'The citations in your prose: whether they carry what the style asks for, in the order and punctuation it asks for.' },
  { id: 'entries', label: 'Reference list', tone: 'check-list',
    about: 'The entries at the back: their shape, their order, and the heading above them.' },
  { id: 'marks', label: 'Punctuation in citations', tone: 'check-marks',
    about: 'The commas, stops and quotation marks inside citations and entries, which differ between the styles more than anything else does.' }
];

export const DEFAULT_STYLE = 'mla9';

const styleOf = (id) => STYLES.find((s) => s.id === id) || STYLES[2];
const isMla = (id) => id === 'mla8' || id === 'mla9';

/* ------------------------------------------------------------- the rules */

/*
 * Every rule names the check it belongs to, the styles it applies to, and
 * the manual behind it. A rule that fires for the wrong style tells a
 * writer to break the style they are working to, which is worse than
 * missing the finding — the same principle the punctuation checker runs on.
 */
const RULES = [
  /* ---------------------------------------------- in-text citations, APA */
  {
    id: 'apa-missing-comma',
    check: 'citations', styles: ['apa7'], severity: 'high',
    rule: 'A parenthetical citation separates author and year with a comma.',
    re: /\(([A-Z][\p{L}'’-]+(?:\s(?:et al\.|and|&)\s[\p{L}'’-]+)?)\s((?:1[5-9]|20)\d{2}[a-z]?)\)/gu,
    message: (m) => `“${m[0]}” has no comma. Author–date style writes (${m[1]}, ${m[2]}).`
  },
  {
    id: 'apa-and-in-parens',
    check: 'citations', styles: ['apa7'], severity: 'medium',
    rule: 'Inside parentheses the ampersand is used; "and" is for running prose.',
    re: /\([A-Z][\p{L}'’-]+\sand\s[A-Z][\p{L}'’-]+,\s*(?:1[5-9]|20)\d{2}/gu,
    message: (m) => `“${m[0]}…” uses “and” inside the parentheses. Use “&” there, and “and” when the names are part of your sentence.`
  },
  {
    id: 'apa-page-abbrev',
    check: 'citations', styles: ['apa7'], severity: 'medium',
    rule: 'A page locator is p. for one page and pp. for a range.',
    re: /\(\s*[^()]*?,\s*(?:1[5-9]|20)\d{2}[a-z]?,\s*(pg\.|pg|page|pages|pp|p)\s*\d/gu,
    message: (m) => `“${m[1]}” is not the abbreviation this style uses. It is “p.” for a single page and “pp.” for a range, each with its full stop.`
  },

  /* ---------------------------------------------- in-text citations, MLA */
  {
    id: 'mla-comma-before-page',
    check: 'citations', styles: ['mla8', 'mla9'], severity: 'high',
    rule: 'Nothing separates the author from the page number.',
    /* A four-digit year is not a page number: that case belongs to the
       year rule, and matching it here reported one citation twice. */
    re: /\(([A-Z][\p{L}'’-]+(?:\sand\s[A-Z][\p{L}'’-]+)?),\s*(?!(?:1[5-9]|20)\d{2}\))(\d{1,4}(?:[–-]\d{1,4})?)\)/gu,
    message: (m) => `“${m[0]}” has a comma before the page number. Author–page style writes (${m[1]} ${m[2]}).`
  },
  {
    id: 'mla-page-abbrev',
    check: 'citations', styles: ['mla8', 'mla9'], severity: 'high',
    rule: 'The page number stands bare in an in-text citation; p. and pp. belong in the entry.',
    re: /\([A-Z][\p{L}'’-]+(?:\sand\s[A-Z][\p{L}'’-]+)?,?\s*(pp?\.|pg\.|page)\s*\d/gu,
    message: (m) => `“${m[0]}…” carries “${m[1]}”. In the text the number goes on its own; p. and pp. are for the list at the back.`
  },
  {
    id: 'mla-year-in-citation',
    check: 'citations', styles: ['mla8', 'mla9'], severity: 'medium',
    rule: 'An in-text citation gives the page, not the year.',
    re: /\([A-Z][\p{L}'’-]+,\s*((?:1[5-9]|20)\d{2})\)/gu,
    message: (m) => `“${m[0]}” gives a year where this style gives a page. That is the author–date form; if you are citing a whole work with no page, the name alone is enough.`
  },
  {
    id: 'mla-ampersand',
    check: 'citations', styles: ['mla8', 'mla9'], severity: 'medium',
    rule: 'Two authors are joined with "and", in the text and in the entry alike.',
    re: /\([A-Z][\p{L}'’-]+\s&\s[A-Z][\p{L}'’-]+/gu,
    message: (m) => `“${m[0]}…” uses an ampersand. This style writes “and”, in the citation and in the entry.`
  },

  /* ------------------------------------------- shared in-text conventions */
  {
    id: 'et-al-stop',
    check: 'marks', styles: ['apa7', 'mla8', 'mla9'], severity: 'medium',
    rule: '"et al." is an abbreviation of "et alii" and carries a full stop.',
    re: /\bet al(?!\.)\b/g,
    message: () => '“et al” is missing its full stop. It abbreviates “et alii”, so it is “et al.”'
  },
  {
    id: 'et-al-comma',
    check: 'marks', styles: ['apa7', 'mla8', 'mla9'], severity: 'low',
    rule: 'No comma stands between a single author name and "et al."',
    re: /\(\s*[A-Z][\p{L}'’-]+,\s+et al\./gu,
    message: (m) => `“${m[0]}” has a comma before “et al.” A single surname is followed by it directly.`
  },
  {
    id: 'doi-as-label',
    check: 'marks', styles: ['apa7', 'mla9'], severity: 'low',
    rule: 'A DOI is given as a link, in the https://doi.org/ form.',
    re: /\bdoi:\s*10\.\d{4,9}\/\S+/gi,
    message: (m) => `“${m[0].slice(0, 40)}…” uses the old “doi:” label. Both current editions give it as https://doi.org/10.…`
  }
];

/*
 * Rules that run over one entry in the reference list rather than over the
 * running prose. Each receives the entry text and returns a reason, or null.
 */
const ENTRY_RULES = [
  {
    id: 'entry-year-position',
    check: 'entries', styles: ['apa7'], severity: 'high',
    rule: 'The year follows the author, in parentheses.',
    test: (t) => (/^[^()]{4,120}\((?:1[5-9]|20)\d{2}[a-z]?\)/.test(t) ? null
      : 'The year is not in parentheses after the author. Author–date entries open with the author, then the year in brackets, then the title.')
  },
  {
    id: 'entry-year-parens-mla',
    check: 'entries', styles: ['mla8', 'mla9'], severity: 'medium',
    rule: 'The year sits with the publication details, not in parentheses after the author.',
    test: (t) => (/^[^()]{4,120}\((?:1[5-9]|20)\d{2}[a-z]?\)/.test(t)
      ? 'The year is bracketed straight after the author, which is the author–date shape. Here the date belongs with the rest of the publication details at the end.'
      : null)
  },
  {
    id: 'entry-ampersand',
    check: 'entries', styles: ['mla8', 'mla9'], severity: 'medium',
    rule: 'Authors are joined with "and".',
    test: (t) => (/\s&\s/.test(t) ? 'An ampersand joins the authors. This style writes “and”.' : null)
  },
  {
    id: 'entry-and-apa',
    check: 'entries', styles: ['apa7'], severity: 'medium',
    rule: 'The last two authors are joined with an ampersand.',
    test: (t) => (/,\s+and\s+[A-Z]/.test(t) && !/\s&\s/.test(t)
      ? 'The authors are joined with “and”. In the list at the back this style uses “&”.' : null)
  },
  {
    id: 'entry-quoted-title',
    check: 'entries', styles: ['mla8', 'mla9'], severity: 'low',
    rule: 'The title of a work inside a container goes in quotation marks.',
    test: (t) => (/[“"][^”"]{8,}[”"]/.test(t) || !/,\s*(?:vol\.|no\.|pp\.)/i.test(t) ? null
      : 'This looks like an article or a chapter, and its title is not in quotation marks. The title of a piece inside a larger work is quoted; the container is italicised.')
  },
  {
    id: 'entry-terminal-stop',
    check: 'marks', styles: ['apa7', 'mla8', 'mla9'], severity: 'low',
    rule: 'Every entry ends with a full stop, unless it ends with a URL.',
    test: (t) => (/[.\]]$/.test(t.trim()) || /https?:\/\/\S+$/.test(t.trim()) ? null
      : 'The entry does not end with a full stop.')
  },
  {
    id: 'entry-page-abbrev',
    check: 'marks', styles: ['apa7'], severity: 'low',
    rule: 'A page range in an entry is given without pp. for a journal article.',
    test: (t) => (/\d+\(\d+\),\s*pp\.\s*\d/.test(t)
      ? 'A journal article with a volume and issue number gives its page range bare, without “pp.”' : null)
  },
  {
    id: 'entry-hanging-hint',
    check: 'entries', styles: ['apa7', 'mla8', 'mla9'], severity: 'low',
    rule: 'Entries are alphabetical by the first author’s surname.',
    test: () => null   /* handled across the list, below, not per entry */
  }
];

/* ------------------------------------------------------------- the audit */

/**
 * Audit a document against one style.
 *
 * `doc` is the shared document from text.js. Returns findings grouped by
 * check, plus what it was able to identify, because "no findings" and "I
 * could not find your reference list" are different answers.
 */
export function auditStyle(doc, { style = DEFAULT_STYLE, checks = ['citations', 'entries', 'marks'] } = {}) {
  const st = styleOf(style);
  const text = doc.text;
  const wanted = new Set(checks);

  const list = findReferenceList(doc);
  const bodyEnd = list ? list.start : text.length;
  const issues = [];

  /* Pattern rules. Those about citations run over the prose only; those
     about punctuation run over the whole document, since an entry's commas
     are as much in scope as a citation's. */
  for (const r of RULES) {
    if (!r.styles.includes(style) || !wanted.has(r.check)) continue;
    const limit = r.check === 'citations' ? bodyEnd : text.length;
    const re = new RegExp(r.re.source, r.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex += 1; continue; }
      if (m.index >= limit) break;
      if (inHeading(doc, m.index)) continue;
      issues.push({
        check: r.check, rule: r.id, severity: r.severity,
        start: m.index, end: m.index + m[0].length, excerpt: m[0],
        message: r.message(m), says: r.rule, source: st.manual
      });
    }
  }

  /* Entry rules, over the reference list. */
  if (list) {
    for (const entry of list.entries) {
      for (const r of ENTRY_RULES) {
        if (!r.styles.includes(style) || !wanted.has(r.check)) continue;
        const why = r.test(entry.text, style);
        if (!why) continue;
        issues.push({
          check: r.check, rule: r.id, severity: r.severity,
          start: entry.start, end: entry.start + entry.text.length,
          excerpt: clip(entry.text, 90),
          message: why, says: r.rule, source: st.manual
        });
      }
    }

    /* Alphabetical order, asked of the list rather than of any one entry. */
    if (wanted.has('entries')) {
      const keys = list.entries.map((e) => sortKeyOf(e.text));
      for (let i = 1; i < keys.length; i++) {
        if (keys[i] && keys[i - 1] && keys[i].localeCompare(keys[i - 1], 'en') < 0) {
          const e = list.entries[i];
          issues.push({
            check: 'entries', rule: 'entry-order', severity: 'medium',
            start: e.start, end: e.start + e.text.length, excerpt: clip(e.text, 90),
            message: `“${keys[i]}” comes after “${keys[i - 1]}” in the list but before it in the alphabet.`,
            says: 'The list is alphabetical by the first author’s surname.',
            source: st.manual
          });
          break;   /* One finding: the list is out of order, said once. */
        }
      }
    }

    /* The heading above the list. */
    if (wanted.has('entries') && list.heading && !headingMatches(list.heading.text, st)) {
      issues.push({
        check: 'entries', rule: 'list-heading', severity: 'medium',
        start: list.heading.start, end: list.heading.start + list.heading.text.length,
        excerpt: list.heading.text.trim(),
        message: `This style calls the list “${st.listHeading}”. Yours is headed “${list.heading.text.trim()}”.`,
        says: `The list is headed ${st.listHeading}.`,
        source: st.manual
      });
    }
  }

  issues.sort((a, b) => a.start - b.start);
  return {
    style, styleLabel: st.label, manual: st.manual,
    issues,
    citationsFound: countCitations(text.slice(0, bodyEnd)),
    list: list ? { heading: list.heading ? list.heading.text.trim() : null, count: list.entries.length } : null
  };
}

/* ---------------------------------------------------------------- pieces */

/*
 * Where the reference list starts, and what is in it.
 *
 * Found by its heading, because that is how a reader finds it. Without one
 * there is nothing to check and the tab says so rather than treating the
 * last few paragraphs as entries and reporting on prose.
 */
export function findReferenceList(doc) {
  const paras = doc.paragraphs || [];
  const idx = paras.findIndex((p) =>
    /^\s*(references|works cited|bibliography|reference list|citations)\s*:?\s*$/i.test(p.text.trim()));
  if (idx === -1) return null;
  const heading = paras[idx];
  /*
   * One entry per line, not one per paragraph.
   *
   * A reference list is typed as consecutive lines with no blank line
   * between them, so the paragraph splitter hands back the whole list as a
   * single block. Checked that way three entries become one, every
   * per-entry finding lands on the first, and the alphabetical check has
   * nothing to compare. Lines, with their offsets kept, so a finding still
   * points at the entry it is about.
   */
  const entries = [];
  for (const p of paras.slice(idx + 1)) {
    let at = p.start;
    for (const line of p.text.split('\n')) {
      const lead = line.length - line.trimStart().length;
      const t = line.trim();
      if (t.length > 20) entries.push({ start: at + lead, text: t });
      at += line.length + 1;
    }
  }
  if (!entries.length) return null;
  return { start: heading.start, heading, entries };
}

const headingMatches = (text, st) => {
  const t = text.trim().toLowerCase().replace(/[:：]$/, '');
  if (st.id === 'apa7') return t === 'references';
  return t === 'works cited';
};

/* The surname an entry files under: everything up to the first comma. */
function sortKeyOf(entry) {
  const m = entry.match(/^([\p{L}'’-]+)\s*,/u);
  return m ? m[1].toLowerCase() : '';
}

/* How many in-text citations there are at all, so "no findings" can be told
   apart from "this document cites nothing in a form I recognise". */
function countCitations(prose) {
  const parens = prose.match(/\([A-Z][\p{L}'’-]+[^()]{0,60}\)/gu) || [];
  const narrative = prose.match(/[A-Z][\p{L}'’-]+\s\((?:1[5-9]|20)\d{2}[a-z]?(?:,[^()]{0,20})?\)/gu) || [];
  return parens.length + narrative.length;
}

const inHeading = (doc, at) => (doc.paragraphs || []).some(
  (p) => p.isHeading && at >= p.start && at < p.start + p.text.length);

const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

/** For a legend: which rules a style actually runs, per check. */
export const rulesFor = (style, check) => [...RULES, ...ENTRY_RULES]
  .filter((r) => r.styles.includes(style) && r.check === check && r.id !== 'entry-hanging-hint')
  .map((r) => ({ id: r.id, says: r.rule }));
