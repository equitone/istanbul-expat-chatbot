/*
 * index.js — runs every analyser over one thesis and merges the result into a
 * single report: a flat issue list with absolute offsets, per-category metrics,
 * and the segment list the highlighter renders.
 */
import { buildDocument } from './text.js';
import { analyseMechanics } from './mechanics.js';
import { analyseGrammar } from './grammar.js';
import { analyseArgument } from './argument.js';
import { analyseOverview } from './overview.js';
import { analyseCitations } from './citations.js';

/* How many instances of one rule to list before collapsing to a count. */
const PER_RULE_CAP = 150;

export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

export const CATEGORY_META = {
  typo: { label: 'Spelling & mechanics', colour: '#d1495b' },
  grammar: { label: 'Grammar & style', colour: '#e08a1e' },
  argument: { label: 'Argument stress', colour: '#7b4bc4' },
  structure: { label: 'Structure & sources', colour: '#0d8a72' },
  citation: { label: 'Citation style', colour: '#9a5b13' },
  ai: { label: 'AI review', colour: '#2b6cb0' }
};

export function analyseThesis(rawText, { citationStyle = 'apa7' } = {}) {
  const text = normalise(rawText);
  const doc = buildDocument(text);

  const mechanics = analyseMechanics(doc);
  const grammar = analyseGrammar(doc);
  const argument = analyseArgument(doc);
  const overview = analyseOverview(doc, argument);
  const citations = analyseCitations(doc, citationStyle);

  const merged = dedupe([
    ...mechanics.issues,
    ...grammar.issues,
    ...argument.issues,
    ...overview.issues,
    ...citations.issues
  ]);
  const { issues, truncated } = capPerRule(merged);

  const words = doc.bodyWords.length || 1;
  const per1000 = (n) => Math.round((n / words) * 1000 * 10) / 10;
  const count = (cat) => issues.filter((i) => i.category === cat).length;

  const scorecard = {
    mechanicsPer1000: per1000(merged.filter((i) => i.category === 'typo').length),
    grammarPer1000: per1000(merged.filter((i) => i.category === 'grammar' && i.severity !== 'low').length),
    stressIndex: argument.metrics.stressIndex,
    stressBand: argument.metrics.stressBand,
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
      argument: count('argument'),
      structure: count('structure'),
      citation: count('citation')
    },
    dialect: mechanics.dialect,
    grammarMetrics: grammar.metrics,
    argument: argument.metrics,
    stressComponents: argument.metrics.stressComponents,
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
export function buildSegments(text, issues, { categories, severities } = {}) {
  const active = issues.filter(
    (i) => (!categories || categories.has(i.category)) && (!severities || severities.has(i.severity))
  );
  if (!active.length) return [{ start: 0, end: text.length, issues: [] }];

  const points = new Set([0, text.length]);
  active.forEach((i) => {
    points.add(clamp(i.start, 0, text.length));
    points.add(clamp(i.end, 0, text.length));
  });
  const sorted = [...points].sort((a, b) => a - b);

  const segments = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const start = sorted[k];
    const end = sorted[k + 1];
    if (end <= start) continue;
    const hits = active.filter((i) => i.start <= start && i.end >= end);
    segments.push({ start, end, issues: hits });
  }
  return segments;
}

/* The category a segment is painted with when several findings overlap:
   the most severe wins, ties broken by category weight. */
const CATEGORY_WEIGHT = { argument: 0, citation: 1, typo: 2, grammar: 3, structure: 4, ai: 5 };

export function dominantIssue(segmentIssues) {
  if (!segmentIssues.length) return null;
  return [...segmentIssues].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      CATEGORY_WEIGHT[a.category] - CATEGORY_WEIGHT[b.category]
  )[0];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
