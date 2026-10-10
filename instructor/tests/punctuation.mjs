/*
 * punctuation.mjs — the rules in punctuation.js, against the reference.
 *
 * Each case names the chapter of The Best Punctuation Book, Period that
 * settles it. The style-dependent cases are the important ones: a rule that
 * fires for the wrong style is telling a writer to break their own house
 * style, which is worse than missing the finding.
 */
import { buildDocument } from '../js/analysis/text.js';
import { analysePunctuation, rulesForStyle, STYLES } from '../js/analysis/punctuation.js';
import { analyseMechanics } from '../js/analysis/mechanics.js';
import { analyseGrammar } from '../js/analysis/grammar.js';

let pass = 0; const fails = [];
const ok = (label, cond) => { if (cond) pass += 1; else fails.push(label); };

const run = (text, style) => analysePunctuation(buildDocument(text), { style }).issues;
const rules = (text, style) => run(text, style).map((i) => i.rule);
const has = (text, rule, style = 'mla') => rules(text, style).includes(rule);

/* ---- quotation marks: American usage, all four styles (ch. 2 and 3) ---- */
ok('comma after closing quote is flagged',
  has('He called it “a staged reality”, which overstates it.', 'quote-comma-outside'));
ok('full stop after closing quote is flagged',
  has('He called it “a staged reality”.', 'quote-period-outside'));
ok('comma already inside the quote is left alone',
  !has('He called it “a staged reality,” which overstates it.', 'quote-comma-outside'));
ok('full stop already inside the quote is left alone',
  !has('He called it “a staged reality.”', 'quote-period-outside'));

/* ---- parentheses (ch. 2) ---- */
ok('comma before a closing parenthesis is flagged',
  has('The evidence is set out above (in section 3,) and below.', 'comma-before-closing-paren'));
ok('comma after a closing parenthesis is fine',
  !has('The evidence is set out above (in section 3), and below.', 'comma-before-closing-paren'));

/* ---- spacing, and the style split the old rule could not make (ch. 3) --- */
const twoSpaces = 'The first point stands.  The second does not.';
ok('two spaces flagged in Chicago', has(twoSpaces, 'two-spaces-after-sentence', 'chicago'));
ok('two spaces flagged in APA', has(twoSpaces, 'two-spaces-after-sentence', 'apa'));
ok('two spaces flagged in AP', has(twoSpaces, 'two-spaces-after-sentence', 'ap'));
ok('two spaces NOT flagged in MLA when used throughout',
  !rules(twoSpaces, 'mla').some((r) => r.startsWith('two-spaces')));
ok('MLA flags only the inconsistency, when both are present',
  has('One space here. And two here.  Then one. And one.', 'two-spaces-inconsistent', 'mla'));

/* ---- en dash: Chicago only (ch. 13) ---- */
const range = 'The period 1960-1985 saw the motif displaced.';
ok('hyphenated range flagged in Chicago', has(range, 'en-dash-range', 'chicago'));
ok('hyphenated range NOT flagged in MLA', !has(range, 'en-dash-range', 'mla'));
ok('hyphenated range NOT flagged in APA', !has(range, 'en-dash-range', 'apa'));
ok('hyphenated range NOT flagged in AP', !has(range, 'en-dash-range', 'ap'));

/* ---- the rest (ch. 1, 9, 10) ---- */
ok('doubled exclamation flagged', has('The reading is supported by the evidence!!', 'repeated-terminal-punctuation'));
ok('single exclamation left alone', !has('The reading is supported!', 'repeated-terminal-punctuation'));
ok('decade apostrophe flagged', has("The music of the 1990's was different.", 'decade-apostrophe'));
ok('decade without apostrophe left alone', !has('The music of the 1990s was different.', 'decade-apostrophe'));
ok('space before a comma flagged', has('The result was clear , though contested.', 'space-before-punctuation'));
ok('missing space after a comma flagged', has('The result was clear,though contested.', 'missing-space-after-punctuation'));
ok('a decimal is not a missing space', !has('The figure was 3,5 per cent in 1994.', 'missing-space-after-punctuation'));
ok('two dots flagged as a broken ellipsis', has('He paused.. then went on.', 'ellipsis-as-two-dots'));
ok('a real ellipsis is left alone', !has('He paused … then went on.', 'ellipsis-as-two-dots'));

/* ---- the spaced hyphen, in every style (ch. 12) ---- */
const spacedHyphen = 'The thesis - which is long - argues this.';
ok('spaced hyphen flagged in every style',
  STYLES.every((st) => has(spacedHyphen, 'hyphen-as-dash', st.id)));
ok('the suggestion is an em dash, never an en dash, because three styles lack it',
  run(spacedHyphen, 'mla').filter((i) => i.rule === 'hyphen-as-dash')
    .every((i) => i.suggestion.includes('\u2014') && !i.suggestion.includes('\u2013')
      && !i.message.includes('\u2013')));
ok('a real em dash is left alone', !has('The thesis — which is long — argues this.', 'hyphen-as-dash'));
ok('a hyphenated compound is left alone', !has('A well-known reading of the novel.', 'hyphen-as-dash'));

/*
 * ---- nothing is reported twice ----
 *
 * The real test, and the one that caught this: the Grammar tab shows every
 * analyser's findings in one list, so a rule left behind in mechanics.js
 * after its sourced replacement landed in here produced two findings for one
 * apostrophe — one carrying a chapter and one carrying nothing. Checking
 * punctuation.js alone would never have seen it.
 */
const merged = (text, style = 'mla') => {
  const d = buildDocument(text);
  return [...analyseGrammar(d).issues, ...analyseMechanics(d).issues,
    ...analysePunctuation(d, { style }).issues];
};
const spansOf = (text) => merged(text)
  .filter((i) => i.category === 'punctuation')
  .map((i) => `${i.start}-${i.end}`);
const noRepeat = (text) => { const s = spansOf(text); return new Set(s).size === s.length; };

ok('one decade apostrophe gives one finding across all the analysers',
  noRepeat("The music of the 1990's was loud."));
ok('one spaced hyphen gives one finding across all the analysers',
  noRepeat('The thesis - which is long - argues this.'));
ok('a passage with several marks wrong repeats none of them',
  noRepeat("He called it “a reality”, and the 1990's - a loud decade - were above (in 3,)."));

/* ---- headings are exempt, as everywhere else ---- */
ok('nothing fires inside a heading',
  run('2.1 The Period 1960-1985\n\nThe argument runs as follows.', 'chicago').length === 0);

/* ---- every finding carries its source ---- */
const sourced = run('He called it “a reality”, and the evidence is above (in 3,).', 'mla');
ok('every finding names the book and chapter',
  sourced.length > 0 && sourced.every((i) => /Best Punctuation Book, Period, ch\. \d+/.test(i.source || '')));

/* ---- the four styles are all wired ---- */
ok('every style runs at least one rule', STYLES.every((s) => rulesForStyle(s.id).length > 0));
ok('Chicago runs more rules than MLA, because of the en dash',
  rulesForStyle('chicago').length > rulesForStyle('mla').length);

console.log('\n  PUNCTUATION, AGAINST THE REFERENCE\n');
console.log(`  passed: ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log(`\n  FAILED (${fails.length}):`);
  fails.forEach((f) => console.log('   - ' + f));
  process.exitCode = 1;
} else {
  console.log('  Every rule fires for the styles the book says it applies to, and no others.\n');
}
