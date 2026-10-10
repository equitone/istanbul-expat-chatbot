/*
 * index.js — runs every analyser over one thesis and merges the result into a
 * single report: a flat issue list with absolute offsets, per-category metrics,
 * and the segment list the highlighter renders.
 */
import { buildDocument } from './text.js';
/* Defined in segments.js and re-exported below so existing imports from this
   module keep working. segments.js is shared verbatim with ../scholar. */
import { SEVERITY_ORDER, CATEGORY_META, buildSegments, dominantIssue } from './segments.js';

export { SEVERITY_ORDER, CATEGORY_META, buildSegments, dominantIssue };
import { analyseMechanics } from './mechanics.js';
import { analyseGrammar } from './grammar.js';
import { analyseLearnerEnglish } from './learner-english.js';
import { analyseArgument } from './argument.js';
import { analyseBloom } from './bloom.js';
import { analyseOverview } from './overview.js';
import { analyseCitations } from './citations.js';

/* How many instances of one rule to list before collapsing to a count. */
const PER_RULE_CAP = 150;


/* Colours are CSS variables rather than literals so the legend tints follow
   the light/dark palette instead of staying fixed to one theme. */

export function analyseThesis(rawText, { citationStyle = 'apa7' } = {}) {
  const text = normalise(rawText);
  const doc = buildDocument(text);

  const mechanics = analyseMechanics(doc);
  const grammar = analyseGrammar(doc);
  /* Same category as the built-in grammar rules, so they land in one list and
     one legend colour rather than asking the reader to learn a new bucket. */
  const learner = analyseLearnerEnglish(doc);
  const argument = analyseArgument(doc);
  const bloom = analyseBloom(doc);
  const overview = analyseOverview(doc, argument);
  const citations = analyseCitations(doc, citationStyle);

  const merged = dedupe([
    ...mechanics.issues,
    ...grammar.issues,
    ...learner.issues,
    ...argument.issues,
    ...bloom.issues,
    ...overview.issues,
    ...citations.issues
  ]);
  const { issues, truncated } = capPerRule(merged);

  const words = doc.bodyWords.length || 1;
  const per1000 = (n) => Math.round((n / words) * 1000 * 10) / 10;
  const count = (cat) => issues.filter((i) => i.category === cat).length;

  const scorecard = {
    mechanicsPer1000: per1000(merged.filter((i) => i.category === 'typo').length),
    grammarPer1000: per1000(merged.filter((i) => i.category === 'grammar').length),
    /* Bloom's is a distribution, not a rank, so the scorecard carries the two
       facts that are comparable across theses: where most paragraphs sit, and
       how much of the text gets past restating the primary source. */
    bloomDominant: bloom.metrics.dominant ? bloom.metrics.dominant.n : null,
    bloomDominantLabel: bloom.metrics.dominant ? bloom.metrics.dominant.label : null,
    readingShare: bloom.metrics.readingShare,
    readingEase: overview.readability.fleschReadingEase,
    gradeLevel: overview.readability.fleschKincaidGrade
  };

  return {
    text,
    doc,
    issues,
    truncated,
    counts: {
      total: issues.length,
      high: issues.filter((i) => i.severity === 'high').length,
      medium: issues.filter((i) => i.severity === 'medium').length,
      low: issues.filter((i) => i.severity === 'low').length,
      typo: count('typo'),
      grammar: count('grammar'),
      style: count('style'),
      argument: count('argument'),
      bloom: count('bloom'),
      structure: count('structure'),
      citation: count('citation')
    },
    dialect: mechanics.dialect,
    grammarMetrics: grammar.metrics,
    argument: argument.metrics,
    bloom: bloom.metrics,
    bloomParagraphs: bloom.paragraphs,
    readability: overview.readability,
    rhythm: overview.rhythm,
    vocabulary: overview.vocabulary,
    structure: overview.structure,
    crossCheck: overview.crossCheck,
    citations: citations.metrics,
    referenceEntries: citations.entries,
    citationStyle,
    scorecard,
    generatedAt: new Date().toISOString()
  };
}

/*
 * Recompute the per-category counts from the issue list.
 *
 * Anything that merges findings into a finished report — LanguageTool, most
 * obviously — has to call this, or the stat tiles and the triage reasons go on
 * describing the list as it was before the merge. Shared between the views
 * rather than copied into each, because the copy in thesis.js had already
 * drifted: it was written before the Bloom findings existed and silently
 * dropped that count every time it ran.
 */
export function recountIssues(report) {
  const by = (fn) => report.issues.filter(fn).length;
  report.counts = {
    total: report.issues.length,
    high: by((i) => i.severity === 'high'),
    medium: by((i) => i.severity === 'medium'),
    low: by((i) => i.severity === 'low'),
    typo: by((i) => i.category === 'typo'),
    grammar: by((i) => i.category === 'grammar'),
    style: by((i) => i.category === 'style'),
    argument: by((i) => i.category === 'argument'),
    bloom: by((i) => i.category === 'bloom'),
    structure: by((i) => i.category === 'structure'),
    citation: by((i) => i.category === 'citation')
  };
  return report;
}

/* Normalise line endings and exotic whitespace WITHOUT changing length, so all
   offsets computed downstream stay valid against this exact string. */
function normalise(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/ /g, ' ')
    .replace(/​/g, ' ')
    .replace(/\t/g, ' ');
}

function dedupe(issues) {
  const seen = new Set();
  return issues
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .filter((i) => {
      const key = `${i.rule}|${i.start}|${i.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function capPerRule(issues) {
  const counts = new Map();
  const kept = [];
  const truncated = {};
  issues.forEach((i) => {
    const n = (counts.get(i.rule) || 0) + 1;
    counts.set(i.rule, n);
    if (n <= PER_RULE_CAP) kept.push(i);
    else truncated[i.rule] = n;
  });
  return { issues: kept, truncated };
}

/*
 * Turn overlapping issue spans into a flat, non-overlapping segment list.
 * Splitting at every boundary is what lets one word carry two findings
 * (a misspelling inside an over-stressed claim) without breaking the markup.
 */
