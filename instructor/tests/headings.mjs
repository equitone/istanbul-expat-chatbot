/*
 * Headings, captions and reference entries — the paragraphs that are not
 * sentences, and must not be told to behave like one.
 *
 * The sentence corpus in cases.js cannot cover this: the question is about
 * whole paragraphs and about a rule that only fires past sixty characters.
 * A thesis has a section break every page or two, so getting this wrong
 * means a finding on every one of them, which is how a checker stops being
 * read.
 */
import { buildDocument, isHeadingLike, looksLikeReference } from '../js/analysis/text.js';
import { analyseMechanics } from '../js/analysis/mechanics.js';

let pass = 0; const fails = [];
const ok = (label, cond) => { if (cond) pass += 1; else fails.push(label); };

/* --- recognised as headings --- */
[
  '2. Textual Analysis',
  '2.1 Doubled/Illusory Reality and Narrative Ambiguity in the Discourse of Cincinnatus',
  '3.2 Melancholia as Authentic Resistance and Transcendence',
  '4.1.2 The Spider, the Moth and the Problem of the Real',
  'Chapter 4 The Spider and the Moth',
  'IV. Conclusions',
  'Appendix B Transcription Conventions',
  'References',
  'Works Cited',
  'Introduction',
  'Theoretical Framework',
  'The Aesthetic Consciousness of the Condemned Man'
].forEach((h) => ok(`heading: ${h.slice(0, 48)}`, isHeadingLike(h)));

/* --- prose that must never be mistaken for a heading --- */
[
  'In Invitation to a Beheading, this transcendence is expressed through Cincinnatus’s notebook entries and his repeated descriptions of an other world',
  'With this theoretical framework, we can trace how these aspects operate in the novel',
  'Nabokov constructs the world of the novel as a fundamentally staged and illusory reality, the spider motif demonstrates this',
  'he proudly displays the spider sitting in a clean web which had been created',
  'The prisoner writes in his notebook every evening,'
].forEach((t) => ok(`prose not a heading: ${t.slice(0, 44)}`, !isHeadingLike(t)));

/* --- reference entries --- */
[
  'Berberova, N., & Nabokov, V. (1967). The Mechanics of Pale Fire. TriQuarterly, 17, 147-159',
  'Alexandrov, V. (1991). Nabokov’s Otherworld. Princeton University Press. https://doi.org/10.1515/9781400861712',
  'Connolly, J. W. (1992). Nabokov’s Early Fiction: Patterns of Self and Other. Cambridge University Press'
].forEach((r) => ok(`reference: ${r.slice(0, 44)}`, looksLikeReference(r)));

ok('a sentence is not a reference',
  !looksLikeReference('Nabokov constructs the world of Invitation to a Beheading as a staged reality'));

/* --- end to end: the rule must stay silent on a document of headings --- */
const doc = `2. Textual Analysis

2.1 Doubled/Illusory Reality and Narrative Ambiguity in the Discourse of Cincinnatus

Nabokov constructs the world of Invitation to a Beheading as a fundamentally staged and illusory reality, and the spider motif demonstrates this clearly throughout.

3.2 Melancholia as Authentic Resistance and Transcendence in the Later Chapters

References

Berberova, N., & Nabokov, V. (1967). The Mechanics of Pale Fire. TriQuarterly, 17, 147-159

Alexandrov, V. (1991). Nabokov's Otherworld. Princeton University Press. https://doi.org/10.1515/9781400861712`;

const found = analyseMechanics(buildDocument(doc)).issues
  .filter((i) => i.rule === 'missing-terminal-punctuation');
ok(`no terminal-punctuation findings on headings and references (got ${found.length})`, found.length === 0);

/* --- but a real unpunctuated paragraph is still caught --- */
const real = `Nabokov constructs the world of Invitation to a Beheading as a fundamentally staged and illusory reality and the spider motif demonstrates this`;
const caught = analyseMechanics(buildDocument(real)).issues
  .some((i) => i.rule === 'missing-terminal-punctuation');
ok('a genuinely unpunctuated paragraph is still caught', caught);

/* --- no rule of any kind may fire inside a heading --- */
import { analyseGrammar } from '../js/analysis/grammar.js';
import { analyseLearnerEnglish } from '../js/analysis/learner-english.js';

const withHeadings = `2.2 Method

The present study aims to understand the device rather than cataloguing it.

Table 3 Results of the Annotation Exercise

Three students were asked to annotate the passages independently.

4. Conclusion`;
const hd = buildDocument(withHeadings);
const spans = hd.paragraphs.filter((p) => p.isHeading).map((p) => [p.start, p.start + p.text.length]);
const everything = [
  ...analyseGrammar(hd).issues,
  ...analyseMechanics(hd).issues,
  ...analyseLearnerEnglish(hd).issues
];
const onHeading = everything.filter((i) => spans.some(([a, b]) => i.start >= a && i.end <= b));
ok(`nothing fires inside a heading (got ${onHeading.length}: ${onHeading.map((i) => i.rule).join(', ')})`,
  onHeading.length === 0);

console.log('\n  HEADINGS, CAPTIONS AND REFERENCES\n');
console.log(`  passed: ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log(`\n  FAILED (${fails.length}):`);
  fails.forEach((f) => console.log('   - ' + f));
  process.exitCode = 1;
} else {
  console.log('  Nothing that is not a sentence is treated as one.\n');
}
