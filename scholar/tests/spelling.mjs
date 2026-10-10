/*
 * spelling.mjs — the dictionary, and the false positives it would otherwise
 * produce.
 *
 * The detection half is the easy half: a Hunspell dictionary either holds a
 * word or it does not. What needs testing is everything around it, because a
 * spell checker that reports a scholar's name, their subject vocabulary and
 * every entry in their bibliography is one they turn off on the first run.
 *
 * Run from the scholar directory:  node tests/spelling.mjs
 */
import fs from 'node:fs';
import { buildDocument } from '../js/analysis/text.js';
import { analyseSpelling, DIALECTS, forgetDictionaries } from '../js/analysis/spelling.js';
import { analyseGrammar } from '../js/analysis/grammar.js';
import { analyseMechanics } from '../js/analysis/mechanics.js';
import { analyseLearnerEnglish } from '../js/analysis/learner-english.js';

/* The engine and the dictionaries arrive on window in the browser; node
   needs the same two globals, read from the files that ship with the app. */
const dicts = {};
for (const d of DIALECTS) {
  dicts[d.id] = {
    aff: fs.readFileSync(new URL(`../vendor/dict/${d.id}.aff`, import.meta.url), 'utf8'),
    dic: fs.readFileSync(new URL(`../vendor/dict/${d.id}.dic`, import.meta.url), 'utf8')
  };
}
const engine = fs.readFileSync(new URL('../vendor/nspell.global.js', import.meta.url), 'utf8');
globalThis.window = { __DICTS: dicts };
new Function('window', engine)(globalThis.window);

let pass = 0; const fails = [];
const ok = (label, cond) => { if (cond) pass += 1; else fails.push(label); };

const check = async (text, opts = {}) =>
  analyseSpelling(buildDocument(text), { dialect: 'en_GB', ...opts });
const rulesFor = async (text, opts) => (await check(text, opts)).issues.map((i) => i.excerpt);

/* ---- it loaded at all ---- */
const first = await check('The argument is clear enough to follow.');
ok('the dictionary loads and the check reports that it ran', first.ran === true);
ok('correct prose produces nothing', first.issues.length === 0);

/* ---- the 246 the hand-written table used to hold ---- */
const oldList = 'The seperate chapters recieved a definately different arguement about the phenomenom, and it occured that we could not accomodate it.';
const caught = await rulesFor(oldList);
for (const w of ['seperate', 'recieved', 'definately', 'arguement', 'phenomenom', 'occured', 'accomodate']) {
  ok(`the dictionary catches "${w}", which the old table also caught`, caught.includes(w));
}
const sug = (await check(oldList)).issues;
ok('and suggests the right correction for each',
  ['separate', 'received', 'definitely', 'argument', 'phenomenon', 'occurred', 'accommodate']
    .every((want) => sug.some((i) => i.suggestion.toLowerCase() === want)));

/* ---- things no hand-written table would have held ---- */
ok('it also catches a misspelling nobody would have listed',
  (await rulesFor('The critisism of that reading is widespread.')).includes('critisism'));

/* ---- dialect: the reason both dictionaries ship ---- */
const british = 'We analyse the colour of the theatre in its defence.';
ok('British spelling passes the British dictionary',
  (await rulesFor(british, { dialect: 'en_GB' })).length === 0);
ok('and is flagged against the American one',
  (await rulesFor(british, { dialect: 'en_US' })).length > 0);
const american = 'We analyze the color of the theater in its defense.';
ok('American spelling passes the American dictionary',
  (await rulesFor(american, { dialect: 'en_US' })).length === 0);
ok('and is flagged against the British one',
  (await rulesFor(american, { dialect: 'en_GB' })).length > 0);

/* ---- names: reported, but never called misspelled ---- */
ok('a name the dictionary lacks is reported, nothing guessed on the writer\u2019s behalf',
  (await rulesFor('The reading offered by Pamuk is different.')).includes('Pamuk'));
ok('but a name is never called a misspelling, whatever the dictionary offers',
  (await check('The reading offered by Pamuk is different.')).issues
    .every((i) => i.rule === 'not-in-dictionary' && !/^Misspelling/.test(i.message)));
ok('a capitalised unknown word never gets the higher severity',
  (await check('Yeditepe runs the programme, and Yeditepe funds it.')).issues
    .every((i) => i.severity !== 'high'));
ok('a Turkish name is reported like any other unknown word',
  (await rulesFor('The essay by G\u00fcnseli S\u00f6nmez \u0130\u015f\u00e7i argues otherwise.')).length > 0);

/* ---- a near miss gets the blunt word, a distant one does not ---- */
ok('a near miss is called a misspelling',
  (await check('The seperate chapter is clear.')).issues
    .every((i) => i.rule === 'misspelling' && /^Misspelling/.test(i.message)));
ok('and names the word the dictionary has',
  (await check('The seperate chapter is clear.')).issues[0].suggestion === 'separate');

/* ---- nothing is suppressed any more ---- */
const thrice = await check('Interiority is the term. The interiority of the room matters, and interiority is what the chapter is about.');
ok('a word used three times is reported three times, not gathered into a note',
  thrice.issues.length === 3);
ok('and the old own-vocabulary list is gone', thrice.ownWords === undefined);

/* ---- the writer's own dictionary: the one escape that is left ---- */
ok('a word used once is reported',
  (await rulesFor('The interiority of that room is the subject.')).length === 1);
ok('a word in the writer’s dictionary is never reported',
  (await rulesFor('The interiority of that room is the subject.', { personal: ['interiority'] })).length === 0);
ok('the personal list is matched regardless of case',
  (await rulesFor('Interiority opens the chapter.', { personal: ['interiority'] })).length === 0);

/* ---- what must never be checked ---- */
ok('a heading is not checked',
  (await rulesFor('2.1 Teh Interiority of Rooms\n\nThe argument runs as follows.')).length === 0);
ok('the reference list is not checked',
  (await rulesFor('The argument is set out above.\n\nReferences\n\nWoolf, Virginia. A Room of One’s Own. London: Hogarth, 1929.\n\nSait Faik Abasıyanık. Semaver. Istanbul: Varlık, 1936.')).length === 0);
ok('a DOI is not checked',
  (await rulesFor('The paper is at https://doi.org/10.1093/litimag/xyzqq and was read in full.')).length === 0);
ok('an acronym is not checked', (await rulesFor('The MLA and the AHRC both fund it.')).length === 0);
ok('a possessive does not need the dictionary to hold it',
  (await rulesFor('Woolf’s argument and Mansfield’s reply are both here.')).length === 0);

/* ---- every finding says what judged it ---- */
const sourced = await check('The seperate chapter is clear.');
ok('every finding names the engine and the dictionary',
  sourced.issues.length > 0 && sourced.issues.every((i) => /Hunspell with the SCOWL/.test(i.source || '')));

/* ---- it says so when it cannot run ---- */
const saved = globalThis.window.__nspell;
globalThis.window.__nspell = null;
forgetDictionaries();   /* or the dictionary parsed above answers anyway */
const broken = await analyseSpelling(buildDocument('The seperate chapter is clear.'), { dialect: 'en_US' });
globalThis.window.__nspell = saved;
forgetDictionaries();
ok('a dictionary that will not load is reported, not passed off as clean prose',
  broken.ran === false && broken.issues.length === 0 && /engine|load/i.test(broken.reason || ''));

/*
 * ---- merged with the other analysers, the way the tab merges them ----
 *
 * Two bugs lived here and neither was visible from spelling.js alone.
 * "literatures" came back twice, once as an unknown word and once as an
 * uncountable noun, so a finding the rules explain properly is dropped. But
 * the first version of that dedupe matched any overlap at all, and a
 * sentence-length finding then swallowed every unknown word inside it:
 * "seperate" disappeared because a clause-spanning rule happened to cover
 * it. Only a finding about the same word may suppress one.
 */
const merged = async (text) => {
  const doc = buildDocument(text);
  const others = [...analyseGrammar(doc).issues, ...analyseMechanics(doc).issues,
    ...analyseLearnerEnglish(doc).issues].filter((i) => i.rule !== 'misspelling');
  const sp = await analyseSpelling(doc, { dialect: 'en_GB' });
  const covered = (i) => others.some((o) => i.start < o.end && o.start < i.end
    && (o.end - o.start) <= (i.end - i.start) + 6);
  return [...others, ...sp.issues.filter((i) => !covered(i))];
};

const twoNames = await merged('This paper discusses about three such rooms, drawn from two national literatures, and asks what each one refuses to hold.');
ok('an uncountable noun is explained once, by the rule that knows why',
  twoNames.filter((i) => /literatures/.test(i.excerpt || '')).length === 1);

const swallowed = await merged('Department of English Language and Literature, Ege University i argue that the interwar short story treats the room as a seperate character rather than as a interior setting, and that this move is what distinguishes it from the domestic novel it grew out of.');
ok('a clause-length finding does not swallow an unknown word inside it',
  swallowed.some((i) => i.excerpt === 'seperate'
    && (i.rule === 'not-in-dictionary' || i.rule === 'misspelling')));

console.log('\n  SPELLING, AGAINST A REAL DICTIONARY\n');
console.log(`  passed: ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log(`\n  FAILED (${fails.length}):`);
  fails.forEach((f) => console.log('   - ' + f));
  process.exitCode = 1;
} else {
  console.log('  Catches what the old table caught and what it could not, reports');
  console.log('  every word it does not hold, and never rules on a name.\n');
}
