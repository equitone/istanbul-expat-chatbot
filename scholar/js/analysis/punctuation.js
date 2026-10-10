/*
 * punctuation.js — punctuation checked against one named reference.
 *
 * THE REFERENCE.
 *
 * June Casagrande, *The Best Punctuation Book, Period* (Revised Edition).
 * Every rule in this file states something that book states, and each
 * finding names the chapter it comes from, so a disagreement can be settled
 * by opening the book rather than by arguing with the app.
 *
 * Nothing here is copied from it. The rules are facts about English
 * punctuation; the wording, the examples and the implementation are mine.
 *
 * WHY THE STYLE SETTING EXISTS.
 *
 * Because the book is built that way, and because it has to be. Punctuation
 * is not one set of rules, and the places the four major styles disagree are
 * exactly the places a checker will otherwise flag correct writing. The book
 * tags each rule with the styles it applies to:
 *
 *   chicago   book publishing. Chicago Manual of Style and Merriam-Webster.
 *   ap        news and business writing. Associated Press Stylebook.
 *   apa       the sciences. APA Publication Manual.
 *   mla       college papers and academic articles. MLA Handbook.
 *
 * A rule with no style listed applies to all four. A rule listed for some
 * does not fire for the others, which is the whole point: telling an MLA
 * writer to use an en dash is wrong, because the en dash does not exist in
 * academic style at all.
 *
 * The default here is MLA, since this app is for a literature department.
 *
 * WHAT IS DELIBERATELY NOT HERE.
 *
 * The book is clear that much of comma use is the writer's judgement, and a
 * checker cannot have an opinion about a judgement call. Introductory
 * commas, commas around "however", commas between short independent clauses
 * — the book gives both forms as correct, so none of them is checked. An
 * earlier version of this app flagged "However the point stands", which this
 * reference says is right.
 */
export const CATEGORY = 'punctuation';

export const STYLES = [
  { id: 'mla', label: 'Academic (MLA)', about: 'College papers and academic articles.' },
  { id: 'chicago', label: 'Book (Chicago)', about: 'Books, and articles for general magazines.' },
  { id: 'apa', label: 'Science (APA)', about: 'The sciences and social sciences.' },
  { id: 'ap', label: 'News (AP)', about: 'Journalism and business writing.' }
];

export const DEFAULT_STYLE = 'mla';
const ALL = ['chicago', 'ap', 'apa', 'mla'];

const BOOK = 'The Best Punctuation Book, Period';

/*
 * Every rule, with the styles it applies to and the chapter behind it.
 *
 * `find` returns [start, end] spans within the text it is given. Keeping
 * them in one table rather than scattered through a function body means the
 * provenance cannot drift away from the rule it belongs to, which is the
 * failure this whole file is a correction of.
 */
const RULES = [
  {
    id: 'quote-comma-outside',
    styles: ALL,
    chapter: 'ch. 2, Comma',
    severity: 'medium',
    message: 'In American usage a comma goes inside the closing quotation mark, not after it.',
    fix: (m) => `${m[1]},”`,
    /* "...word", → "...word," */
    re: /([\w’'.!?])”\s*,/g
  },
  {
    id: 'quote-period-outside',
    styles: ALL,
    chapter: 'ch. 3, Period',
    severity: 'medium',
    message: 'In American usage a full stop goes inside the closing quotation mark, not after it.',
    fix: (m) => `${m[1]}.”`,
    re: /([\w’'])”\s*\.(?!\.)/g
  },
  {
    id: 'comma-before-closing-paren',
    styles: ALL,
    chapter: 'ch. 2, Comma',
    severity: 'medium',
    message: 'A comma never comes immediately before a closing parenthesis. It may follow one.',
    fix: () => ')',
    re: /,\s*\)/g
  },
  {
    id: 'two-spaces-after-sentence',
    styles: ['chicago', 'ap', 'apa'],
    chapter: 'ch. 3, Period',
    severity: 'low',
    message: 'One space after a full stop, not two.',
    fix: () => ' ',
    re: /(?<=[.!?])[ ]{2,}(?=[A-Z“(])/g
  },
  {
    id: 'two-spaces-inconsistent',
    styles: ['mla'],
    chapter: 'ch. 3, Period',
    severity: 'low',
    /* Academic style permits either, but asks for consistency, so this is a
       consistency check rather than an error. Wired up in analyse(). */
    message: 'Academic style allows one space or two between sentences, but not both in one document.',
    fix: () => ' ',
    re: /(?<=[.!?])[ ]{2,}(?=[A-Z“(])/g,
    onlyWhenMixed: true
  },
  {
    id: 'repeated-terminal-punctuation',
    styles: ALL,
    chapter: 'ch. 9, Exclamation Point',
    severity: 'low',
    message: 'Doubling exclamation or question marks for emphasis is out of place in professional writing.',
    fix: (m) => m[0][0],
    re: /([!?])[!?]+/g
  },
  {
    id: 'decade-apostrophe',
    styles: ALL,
    chapter: 'ch. 1, Apostrophe',
    severity: 'medium',
    message: 'A decade takes no apostrophe before the s. The apostrophe stands for the omitted numerals, as in ’97 for 1997.',
    fix: (m) => `${m[1]}s`,
    re: /\b((?:1[5-9]|20)\d0)['’]s\b/g
  },
  {
    id: 'en-dash-range',
    styles: ['chicago'],
    chapter: 'ch. 13, En Dash',
    severity: 'low',
    /* Only Chicago. The book is explicit that the en dash does not exist in
       news, science or academic style, so flagging a hyphen in a range for
       an MLA writer would be telling them to break their own style. */
    message: 'Book style uses an en dash, not a hyphen, for a range meaning to or through.',
    fix: (m) => `${m[1]}–${m[2]}`,
    re: /\b((?:1[5-9]|20)\d{2})-((?:1[5-9]|20)\d{2})\b/g
  },
  {
    id: 'space-before-punctuation',
    styles: ALL,
    chapter: 'ch. 3, Period',
    severity: 'medium',
    message: 'No space before a comma, full stop, semicolon, colon, question mark or exclamation mark.',
    fix: (m) => m[1],
    re: /[ \t]+([,.;:!?])(?=\s|$)/g
  },
  {
    id: 'missing-space-after-punctuation',
    styles: ALL,
    chapter: 'ch. 3, Period',
    severity: 'medium',
    message: 'A space follows a comma, semicolon or colon.',
    fix: (m) => `${m[1]} `,
    /* A decimal, a time, an initial and a URL all look like this and are
       not errors, so the character after must open a word. */
    re: /([,;:])(?=[A-Za-zÀ-ɏ])/g
  },
  {
    id: 'hyphen-as-dash',
    styles: ALL,
    chapter: 'ch. 12, Em Dash',
    severity: 'low',
    /* The em dash exists in all four styles; the en dash does not, so the
       suggestion names only the em dash whatever style is set. How much
       space goes around it is a house decision and is not checked. */
    message: 'A spaced hyphen is standing in for a dash. The mark for that job is the em dash (\u2014).',
    fix: () => ' \u2014 ',
    re: /\s+-\s+/g
  },
  {
    id: 'ellipsis-as-two-dots',
    styles: ALL,
    chapter: 'ch. 10, Ellipsis',
    severity: 'low',
    message: 'An ellipsis is three points, not two or four.',
    fix: () => '…',
    re: /(?<![.])\.{2}(?![.])|\.{4,}/g
  }
];

/*
 * Run the rules for one style over a document.
 *
 * `doc` is the shared document from text.js. Headings and reference entries
 * are skipped for the same reason every other analyser skips them: they are
 * not sentences and the rules assume prose.
 */
export function analysePunctuation(doc, { style = DEFAULT_STYLE } = {}) {
  const chosen = STYLES.some((s) => s.id === style) ? style : DEFAULT_STYLE;
  const text = doc.text;
  const issues = [];

  /* One space or two: a document may use either in academic style, so the
     check is whether it uses both. */
  const doubles = (text.match(/(?<=[.!?])[ ]{2,}(?=[A-Z“(])/g) || []).length;
  const singles = (text.match(/(?<=[.!?])[ ](?=[A-Z“(])/g) || []).length;
  const mixedSpacing = doubles > 0 && singles > 0;

  for (const rule of RULES) {
    if (!rule.styles.includes(chosen)) continue;
    if (rule.onlyWhenMixed && !mixedSpacing) continue;
    const re = new RegExp(rule.re.source, rule.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex += 1; continue; }
      const start = m.index;
      const end = start + m[0].length;
      if (inSkippedBlock(doc, start, end)) continue;
      issues.push({
        category: CATEGORY,
        rule: rule.id,
        severity: rule.severity,
        start,
        end,
        excerpt: text.slice(start, end),
        message: rule.message,
        suggestion: rule.fix ? rule.fix(m) : '',
        /* Named on every finding, so the authority travels with the claim. */
        source: `${BOOK}, ${rule.chapter}`
      });
    }
  }

  return { issues, style: chosen, mixedSpacing };
}

function inSkippedBlock(doc, start, end) {
  return (doc.paragraphs || []).some(
    (p) => p.isHeading && start >= p.start && end <= p.start + p.text.length
  );
}

/** For a legend or a settings page: which rules a style actually runs. */
export const rulesForStyle = (style) =>
  RULES.filter((r) => r.styles.includes(style)).map((r) => ({
    id: r.id, chapter: r.chapter, message: r.message
  }));
