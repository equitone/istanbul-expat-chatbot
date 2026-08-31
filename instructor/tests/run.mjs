/*
 * run.mjs — measure the analysis engine against tests/cases.js.
 *
 *   node tests/run.mjs          summary
 *   node tests/run.mjs -v       list every failure
 *
 * Recall  = of the planted faults, how many were caught.
 * Precision proxy = of the correct sentences, how many were left alone.
 */
import { POSITIVE, NEGATIVE } from './cases.js';
import { analyseThesis } from '../js/analysis/index.js';

const verbose = process.argv.includes('-v');
const HARD = new Set(['grammar', 'typo']); // categories that assert a fault

const missed = [];
let caughtExact = 0;
let caughtSomething = 0;

for (const [rule, text] of POSITIVE) {
  const issues = analyseThesis(text).issues;
  if (issues.some((i) => i.rule === rule)) { caughtExact++; caughtSomething++; continue; }
  if (issues.some((i) => HARD.has(i.category))) {
    caughtSomething++;
    missed.push({ text, want: rule, got: issues.filter((i) => HARD.has(i.category)).map((i) => i.rule).join(','), kind: 'wrong-rule' });
    continue;
  }
  missed.push({ text, want: rule, got: '(nothing)', kind: 'missed' });
}

const falsePositives = [];
for (const text of NEGATIVE) {
  const hard = analyseThesis(text).issues.filter((i) => HARD.has(i.category));
  if (hard.length) falsePositives.push({ text, got: hard.map((i) => `${i.rule}:"${i.excerpt}"`).join('  ') });
}

const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;

console.log('\n  ANALYSIS ENGINE — measured against a labelled corpus\n');
console.log(`  Planted faults caught (exact rule) : ${caughtExact}/${POSITIVE.length}  ${pct(caughtExact, POSITIVE.length)}`);
console.log(`  Planted faults flagged at all      : ${caughtSomething}/${POSITIVE.length}  ${pct(caughtSomething, POSITIVE.length)}`);
console.log(`  Correct sentences left alone       : ${NEGATIVE.length - falsePositives.length}/${NEGATIVE.length}  ${pct(NEGATIVE.length - falsePositives.length, NEGATIVE.length)}`);

if (falsePositives.length) {
  console.log(`\n  FALSE POSITIVES (${falsePositives.length}) — correct prose wrongly flagged:`);
  falsePositives.forEach((f) => {
    console.log(`    "${f.text}"`);
    console.log(`      -> ${f.got}`);
  });
} else {
  console.log('\n  No false positives.');
}

const trulyMissed = missed.filter((m) => m.kind === 'missed');
console.log(`\n  MISSED (${trulyMissed.length}) — faults the engine does not detect:`);
(verbose ? trulyMissed : trulyMissed.slice(0, 12)).forEach((m) => console.log(`    [${m.want}] "${m.text}"`));
if (!verbose && trulyMissed.length > 12) console.log(`    … and ${trulyMissed.length - 12} more (run with -v)`);

const wrongRule = missed.filter((m) => m.kind === 'wrong-rule');
if (wrongRule.length) {
  console.log(`\n  FLAGGED BY A DIFFERENT RULE (${wrongRule.length}) — caught, but labelled otherwise:`);
  (verbose ? wrongRule : wrongRule.slice(0, 6)).forEach((m) => console.log(`    want ${m.want} · got ${m.got} · "${m.text}"`));
}

console.log('');
process.exit(falsePositives.length > 0 ? 1 : 0);
