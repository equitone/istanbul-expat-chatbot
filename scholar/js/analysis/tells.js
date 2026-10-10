/*
 * tells.js — the patterns that make prose read as machine-written.
 *
 * Taken from Wikipedia's "Signs of AI writing" essay, which is the closest
 * thing to an agreed list and is what the request named. Everything here is a
 * STYLE judgement, not a detector: it says "this sentence has the shape AI
 * prose tends to have", never "a machine wrote this". The distinction matters
 * because the same patterns appear in perfectly human writing by anyone
 * trained on business English, and because a tool that pronounces on
 * authorship is the thing the other app in this repository exists to avoid.
 *
 * Used two ways. On prose you wrote, it is a copy-edit pass. On a draft this
 * app expanded from your outline, it is a check on its own output, run before
 * you ever see the text — a drafting tool that produces the stuff it tells
 * you to remove is not worth having.
 */
export const CATEGORY = 'tell';

/* Words the essay names outright. Each carries what to do instead, because
   "avoid this word" without an alternative just produces a thesaurus crawl. */
const WORDS = [
  ['delve', 'go into, examine'], ['delves', 'goes into'], ['delving', 'going into'],
  ['intricate', 'complicated, detailed'], ['intricacies', 'details'],
  ['tapestry', 'name the thing itself'],
  ['pivotal', 'central, decisive'],
  ['underscore', 'show, stress'], ['underscores', 'shows'], ['underscoring', 'showing'],
  ['foster', 'encourage, support'], ['fosters', 'encourages'], ['fostering', 'encouraging'],
  ['testament', 'evidence, sign'],
  ['enhance', 'improve, add to'], ['enhances', 'improves'], ['enhanced', 'improved'],
  ['crucial', 'important, necessary — or cut it'],
  ['boast', 'has'], ['boasts', 'has'],
  ['robust', 'strong, well-supported'],
  ['seamless', 'smooth, uninterrupted'], ['seamlessly', 'smoothly'],
  ['leverage', 'use'], ['leveraging', 'using'],
  ['realm', 'field, area'], ['realms', 'fields'],
  ['elevate', 'raise, improve'], ['elevates', 'raises'],
  ['unlock', 'open up, make possible'], ['unleash', 'release'],
  ['game-changer', 'say what actually changed'],
  ['moreover', 'and — or start the sentence plainly'],
  ['furthermore', 'and — or start the sentence plainly'],
  ['notably', 'cut it, or name who noted'],
  ['arguably', 'cut it, or say who argues this']
];

const PHRASES = [
  [/\bit(?:'|’)?s important to note that\b/gi, 'Cut it. Say the thing.'],
  [/\bit is important to note that\b/gi, 'Cut it. Say the thing.'],
  [/\bit(?:'|’)?s worth noting that\b/gi, 'Cut it. Say the thing.'],
  [/\bit is worth noting that\b/gi, 'Cut it. Say the thing.'],
  [/\bin conclusion\b/gi, 'Stop when the point is made.'],
  [/\bin summary\b/gi, 'Stop when the point is made.'],
  [/\ball in all\b/gi, 'Stop when the point is made.'],
  [/\bultimately,/gi, 'Usually removable.'],
  [/\bin today(?:'|’)?s (?:fast-paced|digital|ever-evolving|modern|complex) world\b/gi, 'Say when and where you mean.'],
  [/\bplays? a (?:crucial|vital|pivotal|key|significant) role\b/gi, 'Say what it actually does.'],
  [/\bsheds? light on\b/gi, 'Say what it shows.'],
  [/\bpaves? the way\b/gi, 'Say what it leads to.'],
  [/\bat the forefront of\b/gi, 'Say where it actually stands.'],
  [/\bnavigat(?:e|es|ing) the\b/gi, 'Metaphorical "navigate" — say what is being done.'],
  [/\bthe (?:\w+ )?landscape\b/gi, 'Say the field, the market, the set of positions.']
];

/* Vague authority. The essay singles this out and it is the one that does real
   damage in academic work: it reads as a citation and is not one. */
const UNNAMED = [
  /\bstudies (?:show|suggest|have shown|indicate)\b/gi,
  /\bresearch (?:shows|suggests|has shown|indicates)\b/gi,
  /\bexperts (?:say|agree|believe|argue)\b/gi,
  /\bscholars (?:have noted|note|agree|argue)\b/gi,
  /\bobservers have noted\b/gi,
  /\bit (?:is|has been) (?:widely |generally )?(?:believed|accepted|argued|acknowledged)\b/gi,
  /\bmany (?:critics|scholars|researchers) (?:have )?(?:argued|noted|suggested)\b/gi
];

const NEGATIVE_PARALLEL = [
  [/\b(?:it(?:'|’)?s|this is|that(?:'|’)?s) not (?:just|only|merely) [^.;,]{3,60}[,;] (?:it(?:'|’)?s|but) /gi, '“Not just X, it’s Y”'],
  [/\bnot only (?:does |did |is |are |was )?[^.;,]{3,60}, but (?:also |it also )?/gi, '“Not only X but also Y”'],
  [/\bthis is(?:n(?:'|’)?t| not) about [^.;]{3,60}[,;—-]+ (?:it(?:'|’)?s|this is) about /gi, '“Not about X, about Y”'],
  [/\b(?:isn(?:'|’)?t|is not) (?:a|an|the) [^.;]{3,40}[,;] (?:it(?:'|’)?s|but) (?:a|an|the) /gi, 'Negative parallelism']
];

const TRANSITION_OPENERS = /^(?:moreover|furthermore|additionally|that said|in addition|notably|importantly|consequently|nevertheless|nonetheless)\b/i;

const sentencesOf = (text) =>
  String(text || '').split(/(?<=[.!?])\s+(?=[A-Z"“'(])/).map((s) => s.trim()).filter(Boolean);

const paragraphsOf = (text) =>
  String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/**
 * Returns { findings, metrics, score } for a piece of prose.
 *
 * `score` is a count-based summary, not a probability of anything. It exists
 * so a draft can be compared against its own revision, and it is labelled on
 * screen as what it is.
 */
export function findTells(text) {
  const src = String(text || '');
  const findings = [];
  const push = (o) => findings.push({ category: CATEGORY, ...o, excerpt: src.slice(o.start, o.end) });

  const scan = (re, fn) => {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = r.exec(src)) !== null) { fn(m); if (m.index === r.lastIndex) r.lastIndex++; }
  };

  WORDS.forEach(([word, instead]) => {
    scan(new RegExp(`\\b${word}\\b`, 'gi'), (m) => push({
      rule: 'flagged-word', weight: 1, start: m.index, end: m.index + m[0].length,
      message: `“${m[0]}” is on the list of words that mark machine prose.`,
      fix: `Try: ${instead}.`
    }));
  });

  PHRASES.forEach(([re, advice]) => scan(re, (m) => push({
    rule: 'stock-phrase', weight: 2, start: m.index, end: m.index + m[0].length,
    message: `Stock phrase: “${m[0].trim()}”.`, fix: advice
  })));

  UNNAMED.forEach((re) => scan(re, (m) => push({
    rule: 'unnamed-authority', weight: 3, start: m.index, end: m.index + m[0].length,
    message: `“${m[0].trim()}” claims authority without naming a source.`,
    fix: 'Name who, and cite them. If there is no source, drop the claim.'
  })));

  NEGATIVE_PARALLEL.forEach(([re, label]) => scan(re, (m) => push({
    rule: 'negative-parallelism', weight: 2, start: m.index, end: m.index + m[0].length,
    message: `${label}. The construction promises a contrast and rarely delivers one.`,
    fix: 'Say the second half directly and drop the first.'
  })));

  /* Em dashes. Not wrong, but a density well above ordinary prose is one of
     the most reliable tells in the list. */
  const dashes = (src.match(/—/g) || []).length;
  const words = (src.match(/[\p{L}\p{N}]+/gu) || []).length || 1;
  const dashRate = (dashes / words) * 1000;
  if (dashRate > 2.5 && dashes >= 3) {
    const first = src.indexOf('—');
    push({
      rule: 'em-dash-density', weight: 2, start: first, end: first + 1,
      message: `${dashes} em dashes in ${words} words (${dashRate.toFixed(1)} per 1000). Ordinary prose runs well under two.`,
      fix: 'Most of these want a comma, a colon, a full stop or brackets.'
    });
  }

  /* Formulaic transitions stacked at paragraph openings. */
  const paras = paragraphsOf(src);
  const opened = paras.filter((p) => TRANSITION_OPENERS.test(p));
  if (opened.length >= 2) {
    const where = src.indexOf(opened[0]);
    push({
      rule: 'stacked-transitions', weight: 2, start: where, end: where + Math.min(40, opened[0].length),
      message: `${opened.length} paragraphs open with a connective (${opened.map((p) => p.split(/[\s,]/)[0]).join(', ')}).`,
      fix: 'Connectives belong where the logic turns, not at the top of every paragraph.'
    });
  }

  /* Rule of three, used as a default rhythm rather than because there are
     three things. Three or more tricolons in a short piece is the tell. */
  const tricolons = [...src.matchAll(/\b([\p{L}]+), ([\p{L}]+),? and ([\p{L}]+)\b/gu)];
  const sentences = sentencesOf(src);
  if (tricolons.length >= 3 && tricolons.length / Math.max(1, sentences.length) > 0.12) {
    push({
      rule: 'rule-of-three', weight: 1, start: tricolons[0].index, end: tricolons[0].index + tricolons[0][0].length,
      message: `${tricolons.length} three-item lists in ${sentences.length} sentences.`,
      fix: 'Vary the count. Sometimes one example is enough; sometimes there are five.'
    });
  }

  /* A closing paragraph that restates. */
  const last = paras[paras.length - 1] || '';
  if (paras.length > 2 && /^(?:in (?:conclusion|summary|short)|to (?:sum up|conclude)|ultimately|all in all|overall)\b/i.test(last)) {
    const where = src.lastIndexOf(last);
    push({
      rule: 'restating-close', weight: 2, start: where, end: where + Math.min(50, last.length),
      message: 'The last paragraph opens by announcing a summary.',
      fix: 'Cut the announcement. If the paragraph says something new, keep it; if not, cut the paragraph.'
    });
  }

  findings.sort((a, b) => a.start - b.start);
  const weight = findings.reduce((n, f) => n + (f.weight || 1), 0);
  return {
    findings,
    metrics: {
      words, sentences: sentences.length, paragraphs: paras.length,
      emDashes: dashes, emDashRate: dashRate,
      flaggedWords: findings.filter((f) => f.rule === 'flagged-word').length,
      unnamedAuthority: findings.filter((f) => f.rule === 'unnamed-authority').length
    },
    /* Per thousand words, so a long piece is not penalised for being long. */
    density: (weight / words) * 1000,
    weight
  };
}

/** A one-line reading, for the top of the panel. */
export function readTells(result) {
  const d = result.density;
  if (!result.metrics.words) return 'Nothing to read yet.';
  if (!result.findings.length) return 'No flagged patterns. The prose does not carry the usual machine-writing marks.';
  const worst = result.metrics.unnamedAuthority
    ? ` ${result.metrics.unnamedAuthority} of them claim authority without naming a source, which is the one to fix first.`
    : '';
  if (d > 8) return `Heavy: ${result.findings.length} flagged patterns across ${result.metrics.words} words.${worst}`;
  if (d > 3) return `Some marks: ${result.findings.length} flagged patterns across ${result.metrics.words} words.${worst}`;
  return `Light: ${result.findings.length} flagged pattern(s) across ${result.metrics.words} words.${worst}`;
}
