/*
 * argument.js — the Argument Stress Evaluator.
 *
 * The metaphor is structural engineering. Each CLAIM is a load-bearing member.
 * Evidence, citations and stated reasoning are its supports. A claim that
 * carries heavy assertive force (boosters, absolutes, "proves") while resting
 * on nothing is OVER-STRESSED: it is where the argument will fail under
 * examination. The evaluator locates those points, quantifies the load, and
 * reports the places a supervisor would otherwise have to find by hand.
 *
 * Nothing here judges whether a claim is TRUE. It measures whether the text
 * does the work of supporting it.
 */
import {
  HEDGES, HEDGE_PHRASES, BOOSTERS, BOOSTER_PHRASES, CLAIM_VERBS,
  EVALUATIVE_ADJECTIVES, WARRANT_MARKERS, EVIDENCE_MARKERS, COUNTER_MARKERS,
  STOPWORDS
} from './lexicons.js';

export const CATEGORY = 'argument';

const HEDGE_SET = new Set(HEDGES);
const BOOSTER_SET = new Set(BOOSTERS);
const CLAIM_VERB_SET = new Set(CLAIM_VERBS);
const EVAL_SET = new Set(EVALUATIVE_ADJECTIVES);
const ABSOLUTES = new Set(['all', 'every', 'always', 'never', 'none', 'no one', 'everyone', 'nothing', 'entirely', 'universally']);

/* Citation shapes we can recognise without a reference manager. */
const CITATION_PATTERNS = [
  /\(([A-Z][A-Za-z'’\-]+(?:\s+(?:et\s+al\.|and|&)\s+[A-Z][A-Za-z'’\-]+)*),?\s*(?:et\s+al\.,?\s*)?(\d{4}[a-z]?)(?:,\s*(?:pp?\.\s*)?[\dxiv–\-–,\s]+)?\)/g,
  /\b([A-Z][A-Za-z'’\-]+)(?:\s+(?:et\s+al\.|and|&)\s+[A-Z][A-Za-z'’\-]+)*\s+\((\d{4}[a-z]?)(?:,\s*(?:pp?\.\s*)?[\dxivIVX–\-,\s]+)?\)/g,
  /\[(\d+(?:\s*[,\-–]\s*\d+)*)\]/g
];

export function analyseArgument(doc) {
  const { text } = doc;
  const sentences = doc.bodySentences;
  const paragraphs = doc.bodyParagraphs;
  const issues = [];
  const add = (o) => issues.push({ category: CATEGORY, ...o, excerpt: text.slice(o.start, o.end) });

  const citations = extractCitations(text.slice(0, doc.bodyEnd));
  const citationsBySentence = bucketByOwner(citations, sentences);

  /* ------------------------------------------------ classify every sentence */
  const marks = sentences.map((s) => {
    const lower = s.text.toLowerCase();
    const lowers = s.words.map((w) => w.lower);
    const hedges = collect(s, lowers, HEDGE_SET, HEDGE_PHRASES, lower);
    const boosters = collect(s, lowers, BOOSTER_SET, BOOSTER_PHRASES, lower);
    const absolutes = s.words.filter((w) => ABSOLUTES.has(w.lower));
    const claimVerbs = s.words.filter((w) => CLAIM_VERB_SET.has(w.lower));
    const evaluatives = s.words.filter((w) => EVAL_SET.has(w.lower));
    const warrants = phraseHits(lower, WARRANT_MARKERS);
    const evidenceMarkers = phraseHits(lower, EVIDENCE_MARKERS);
    const counters = phraseHits(lower, COUNTER_MARKERS);
    const cites = citationsBySentence.get(s.id) || [];
    const quoted = /["“][^"”]{25,}["”]/.test(s.text);
    const numbers = s.words.filter((w) => w.isNumber && w.text.length > 1 && !/^(19|20)\d\d$/.test(w.text));

    const isClaim = claimVerbs.length > 0 || evaluatives.length > 0 || absolutes.length > 0 ||
      boosters.length > 0 || /\b(should|must|ought to)\b/.test(lower);
    const evidenceScore =
      (cites.length ? 2 : 0) + (quoted ? 2 : 0) + (evidenceMarkers.length ? 1 : 0) + (numbers.length ? 1 : 0);

    return {
      id: s.id,
      sentence: s,
      paragraph: s.paragraph,
      hedges, boosters, absolutes, claimVerbs, evaluatives,
      warrants, evidenceMarkers, counters, cites, quoted, numbers,
      isClaim,
      isEvidence: evidenceScore >= 2,
      hasWarrant: warrants.length > 0,
      evidenceScore,
      /* Assertive load: how much weight this sentence asks the reader to carry. */
      load: claimVerbs.length + evaluatives.length + absolutes.length * 1.5 +
            boosters.length * 2 - Math.min(hedges.length, 3) * 0.75
    };
  });

  /* -------------------------------------------------- support each claim */
  const claims = marks.filter((m) => m.isClaim);
  claims.forEach((c) => {
    const window = marks.filter(
      (m) => m.paragraph === c.paragraph && Math.abs(m.id - c.id) <= 2
    );
    const evidenceNearby = window.some((m) => m.evidenceScore >= 2);
    const weakEvidenceNearby = window.some((m) => m.evidenceScore === 1);
    const warrantNearby = window.some((m) => m.hasWarrant);
    c.support = evidenceNearby ? 2 : (weakEvidenceNearby || warrantNearby) ? 1 : 0;
    c.overStressed = c.support === 0 && c.load >= 1;
    c.critical = c.support === 0 && (c.boosters.length > 0 || c.absolutes.length > 0 || /\bprove/i.test(c.sentence.text));
  });

  const thesisStatement = findThesisStatement(marks);

  /* ------------------------------------------------------ stress points */
  claims
    .filter((c) => c.critical)
    .forEach((c) => {
      const trigger = [...c.boosters, ...c.absolutes][0];
      add({
        rule: 'overstressed-claim',
        severity: 'high',
        start: c.sentence.start,
        end: c.sentence.end,
        anchor: trigger ? { start: trigger.start, end: trigger.end } : null,
        message: `Over-stressed claim: asserted with certainty${trigger ? ` (“${trigger.text}”)` : ''} but nothing in this paragraph supports it — no citation, no data, no stated reason.`,
        suggestion: 'Cite a source, give the reasoning, or downgrade the certainty (“suggests”, “may indicate”).'
      });
    });

  claims
    .filter((c) => c.overStressed && !c.critical && !(thesisStatement && c.id === thesisStatement.id))
    .forEach((c) =>
      add({
        rule: 'unsupported-claim',
        severity: 'medium',
        start: c.sentence.start,
        end: c.sentence.end,
        message: 'Claim with no nearby support: no citation, evidence marker or stated reason within this paragraph.',
        suggestion: 'Add evidence or a “because…” clause, or mark it explicitly as a working assumption.'
      })
    );

  /* Booster stacking: "clearly proves that it is obviously undeniable". */
  marks.filter((m) => m.boosters.length >= 2).forEach((m) =>
    add({
      rule: 'booster-stacking',
      severity: 'medium',
      start: m.sentence.start,
      end: m.sentence.end,
      message: `Certainty is stacked (${m.boosters.map((b) => `“${b.text}”`).join(', ')}). Piling up intensifiers reads as compensation for missing evidence.`,
      suggestion: 'Keep at most one, and only if the evidence earns it.'
    })
  );

  /* Hedge stacking: the opposite failure — a claim so qualified it says nothing. */
  marks.filter((m) => m.hedges.length >= 4).forEach((m) =>
    add({
      rule: 'hedge-stacking',
      severity: 'low',
      start: m.sentence.start,
      end: m.sentence.end,
      message: `Over-hedged (${m.hedges.length} qualifiers). After this many, the sentence commits to nothing.`,
      suggestion: 'Keep one qualifier and state the claim.'
    })
  );

  /* ------------------------------------- paragraph-level structural checks */
  const paraStats = paragraphs.map((p) => {
    const inPara = marks.filter((m) => m.paragraph === p.index);
    const words = p.text.split(/\s+/).length;
    return {
      index: p.index,
      paragraph: p,
      words,
      sentences: inPara,
      claims: inPara.filter((m) => m.isClaim).length,
      cites: inPara.reduce((n, m) => n + m.cites.length, 0),
      evidence: inPara.filter((m) => m.evidenceScore >= 2).length,
      counters: inPara.reduce((n, m) => n + m.counters.length, 0),
      warrants: inPara.reduce((n, m) => n + m.warrants.length, 0),
      terms: contentTerms(p.text)
    };
  });

  const bodyParas = paraStats.filter((p) => p.words >= 35);

  /* Orphan paragraphs: argue hard, support nothing. */
  bodyParas
    .filter((p) => p.claims >= 2 && p.cites === 0 && p.evidence === 0 && p.warrants === 0)
    .forEach((p) =>
      add({
        rule: 'unsupported-paragraph',
        severity: 'high',
        start: p.paragraph.start,
        end: Math.min(p.paragraph.end, p.paragraph.start + 400),
        message: `Whole paragraph carries ${p.claims} claims with no citation, no evidence and no stated reasoning.`,
        suggestion: 'This is the kind of paragraph an examiner opens the viva with.'
      })
    );

  /* Quote dumping: the source argues, the student does not. */
  bodyParas.forEach((p) => {
    const quotedChars = (p.paragraph.text.match(/["“][^"”]{25,}["”]/g) || []).join('').length;
    if (quotedChars / p.paragraph.text.length > 0.45) {
      add({
        rule: 'quote-dumping',
        severity: 'medium',
        start: p.paragraph.start,
        end: Math.min(p.paragraph.end, p.paragraph.start + 400),
        message: `${Math.round((quotedChars / p.paragraph.text.length) * 100)}% of this paragraph is quoted text. The quotation is doing the arguing.`,
        suggestion: 'Cut the quotation to its load-bearing clause and analyse it in your own words.'
      });
    }
  });

  /* Cohesion gaps: consecutive body paragraphs sharing almost no vocabulary
     and joined by no connective — the reader falls between them.            */
  for (let i = 1; i < bodyParas.length; i++) {
    const prev = bodyParas[i - 1];
    const cur = bodyParas[i];
    const overlap = jaccard(prev.terms, cur.terms);
    const opensWithConnective = /^(however|therefore|moreover|furthermore|thus|hence|consequently|nevertheless|nonetheless|similarly|likewise|conversely|in contrast|by contrast|in addition|additionally|accordingly|building on|having|this|these|such)\b/i.test(cur.paragraph.text.trim());
    if (overlap < 0.06 && !opensWithConnective) {
      add({
        rule: 'cohesion-gap',
        severity: 'medium',
        start: cur.paragraph.start,
        end: Math.min(cur.paragraph.end, cur.paragraph.start + 200),
        message: `Topic jump: this paragraph shares almost no vocabulary with the one before (${Math.round(overlap * 100)}% overlap) and opens with no connective.`,
        suggestion: 'Open with a sentence that names the link to the previous point.'
      });
    }
  }

  /* Circularity: opens and closes on the same words with nothing in between. */
  bodyParas.forEach((p) => {
    if (p.sentences.length < 3 || p.cites > 0 || p.evidence > 0) return;
    const first = contentTerms(p.sentences[0].sentence.text);
    const last = contentTerms(p.sentences[p.sentences.length - 1].sentence.text);
    if (jaccard(first, last) > 0.55) {
      add({
        rule: 'circular-paragraph',
        severity: 'medium',
        start: p.sentences[p.sentences.length - 1].sentence.start,
        end: p.sentences[p.sentences.length - 1].sentence.end,
        message: 'The paragraph ends by restating its opening in the same terms, with no evidence in between — the reasoning is circular.',
        suggestion: 'Either advance the claim or supply the missing middle.'
      });
    }
  });

  /* ------------------------------------------------- source concentration */
  const sourceLoad = new Map();
  citations.forEach((c) => sourceLoad.set(c.key, (sourceLoad.get(c.key) || 0) + 1));
  const ranked = [...sourceLoad.entries()].sort((a, b) => b[1] - a[1]);
  const totalCites = citations.length;
  const singlePoint = ranked.length && totalCites >= 8 && ranked[0][1] / totalCites > 0.35
    ? { key: ranked[0][0], share: ranked[0][1] / totalCites, count: ranked[0][1] }
    : null;

  /* --------------------------------------------- thesis statement tracking */
  let threadContinuity = null;
  if (thesisStatement && bodyParas.length >= 4) {
    const key = contentTerms(thesisStatement.sentence.text);
    const covered = bodyParas.filter((p) => jaccard(key, p.terms) > 0.03 || [...key].some((t) => p.terms.has(t))).length;
    threadContinuity = covered / bodyParas.length;
    if (threadContinuity < 0.45) {
      add({
        rule: 'thesis-thread-drift',
        severity: 'medium',
        start: thesisStatement.sentence.start,
        end: thesisStatement.sentence.end,
        message: `The stated thesis reappears in only ${Math.round(threadContinuity * 100)}% of body paragraphs. Long stretches argue something else.`,
        suggestion: 'Either tie those sections back to this claim or restate the thesis to cover what the work actually does.'
      });
    }
  }

  /* ---------------------------------------------------------- aggregate */
  const claimCount = claims.length || 1;
  const supported = claims.filter((c) => c.support > 0).length;
  const strongSupported = claims.filter((c) => c.support === 2).length;
  const criticalCount = claims.filter((c) => c.critical).length;
  const words = doc.bodyWords.length || 1;
  const hedgeTotal = marks.reduce((n, m) => n + m.hedges.length, 0);
  const boosterTotal = marks.reduce((n, m) => n + m.boosters.length, 0);
  const counterParas = bodyParas.filter((p) => p.counters > 0).length;

  const metrics = {
    claims: claims.length,
    supportedClaims: supported,
    stronglySupportedClaims: strongSupported,
    claimSupportRatio: supported / claimCount,
    evidenceBackedRatio: strongSupported / claimCount,
    criticalStressPoints: criticalCount,
    citations: totalCites,
    uniqueSources: sourceLoad.size,
    citationsPerThousandWords: (totalCites / words) * 1000,
    paragraphsWithSupport: bodyParas.length ? bodyParas.filter((p) => p.cites > 0 || p.evidence > 0).length / bodyParas.length : 0,
    counterargumentCoverage: bodyParas.length ? counterParas / bodyParas.length : 0,
    hedgeTotal,
    boosterTotal,
    hedgesPerClaim: hedgeTotal / claimCount,
    boostersPerClaim: boosterTotal / claimCount,
    hedgeBoosterRatio: boosterTotal ? hedgeTotal / boosterTotal : (hedgeTotal ? Infinity : 0),
    cohesionGaps: issues.filter((i) => i.rule === 'cohesion-gap').length,
    bodyParagraphs: bodyParas.length,
    singlePoint,
    threadContinuity,
    thesisStatement: thesisStatement
      ? { text: thesisStatement.sentence.text, start: thesisStatement.sentence.start, end: thesisStatement.sentence.end }
      : null
  };

  if (singlePoint) {
    add({
      rule: 'single-source-dependency',
      severity: 'medium',
      start: citations.find((c) => c.key === singlePoint.key).start,
      end: citations.find((c) => c.key === singlePoint.key).end,
      message: `${Math.round(singlePoint.share * 100)}% of all citations point to one source (${singlePoint.key}, ${singlePoint.count}×). If that source is contested, the chapter falls with it.`,
      suggestion: 'Corroborate the load-bearing claims with an independent source.'
    });
  }

  return { issues, metrics, claims, marks, citations };
}

/*
 * The Argument Stress Index used to live here: a 0-100 composite of six
 * weighted components. It was removed deliberately. The underlying signals are
 * real — unsupported claims, hedge/booster balance and lexical cohesion are all
 * measurable — but the weights, the thresholds and the four-band label were
 * invented, and presenting them as a score gave the number an authority no
 * supervisor could defend to a student who challenged it. The measurements
 * below are still reported, individually and without a ranking on top.
 */

/* ---------------------------------------------------------------- helpers */

function extractCitations(text) {
  const out = [];
  const seen = new Set();
  CITATION_PATTERNS.forEach((re, styleIdx) => {
    const rx = new RegExp(re.source, re.flags);
    let m;
    while ((m = rx.exec(text)) !== null) {
      const sig = `${m.index}:${m[0].length}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        raw: m[0],
        key: styleIdx === 2 ? `[${m[1]}]` : `${m[1]} ${m[2] || ''}`.trim(),
        style: styleIdx === 2 ? 'numeric' : 'author-date'
      });
    }
  });
  return out.sort((a, b) => a.start - b.start);
}

function bucketByOwner(items, sentences) {
  const map = new Map();
  let si = 0;
  items.forEach((it) => {
    while (si < sentences.length && sentences[si].end <= it.start) si++;
    let idx = si;
    while (idx < sentences.length && sentences[idx].start > it.start) idx--;
    const s = sentences[idx] || sentences[si];
    if (!s) return;
    if (it.start >= s.start && it.start < s.end) {
      if (!map.has(s.id)) map.set(s.id, []);
      map.get(s.id).push(it);
    }
  });
  return map;
}

function collect(sentence, lowers, wordSet, phrases, lowerText) {
  const hits = sentence.words.filter((w) => wordSet.has(w.lower));
  phrases.forEach((p) => {
    const i = lowerText.indexOf(p);
    if (i >= 0) hits.push({ text: p, start: sentence.start + i, end: sentence.start + i + p.length });
  });
  return hits;
}

function phraseHits(lowerText, list) {
  return list.filter((p) => lowerText.includes(p));
}

function contentTerms(text) {
  const set = new Set();
  (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).forEach((w) => {
    if (!STOPWORDS.has(w)) set.add(stem(w));
  });
  return set;
}

/* Crude suffix stripping — enough to make "narrative"/"narratives" match. */
function stem(w) {
  return w
    .replace(/(?:ations?|ised|ized|ising|izing|ments?|ness|ities|ity|ally|ance|ence|ical|ings?|edly|ers?|est|ies|ied|ive|ous|al|ly|es|s)$/, '')
    .replace(/(.)\1$/, '$1') || w;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}

const THESIS_RE = /\b(this (?:thesis|dissertation|paper|study|article|chapter|essay|research)|i (?:argue|contend|claim|maintain)|the (?:aim|purpose|objective|central claim|argument) of this)\b/i;

function findThesisStatement(marks) {
  const early = marks.filter((m) => m.paragraph <= 6);
  return early.find((m) => THESIS_RE.test(m.sentence.text)) ||
         marks.find((m) => THESIS_RE.test(m.sentence.text)) || null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
