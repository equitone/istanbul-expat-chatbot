/*
 * segments.js — turning a list of findings into paintable spans.
 *
 * Shared verbatim between the Instructor Workbench and Scholar Desk, because
 * both highlight a document the same way and a second copy of this is a
 * second place for the overlap logic to go subtly wrong.
 *
 * Findings overlap constantly: a comma splice inside a sentence that is also
 * flagged as passive, a misspelling inside a quoted title. Nested <mark>
 * elements would have to be balanced and would paint the wrong colour at the
 * seams, so the text is cut at every finding boundary instead and each piece
 * carries the findings that cover it whole. The result is a flat list of
 * non-overlapping spans, which is a straight concatenation to render.
 */

export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

export const CATEGORY_META = {
  grammar: { label: 'Grammar errors', colour: 'var(--cat-grammar)' },
  typo: { label: 'Spelling & punctuation', colour: 'var(--cat-typo)' },
  citation: { label: 'Citation style', colour: 'var(--cat-citation)' },
  argument: { label: 'Argument support', colour: 'var(--cat-argument)' },
  bloom: { label: 'Level of thinking', colour: 'var(--cat-bloom)' },
  structure: { label: 'Structure & sources', colour: 'var(--cat-structure)' },
  ai: { label: 'AI review', colour: 'var(--cat-ai)' },
  style: { label: 'Style suggestions', colour: 'var(--cat-style)' }
};


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
const CATEGORY_WEIGHT = { argument: 0, grammar: 1, citation: 2, typo: 3, structure: 4, ai: 5, style: 6 };

export function dominantIssue(segmentIssues) {
  if (!segmentIssues.length) return null;
  return [...segmentIssues].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      CATEGORY_WEIGHT[a.category] - CATEGORY_WEIGHT[b.category]
  )[0];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
