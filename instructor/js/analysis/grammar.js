/*
 * grammar.js — heuristic grammar and register checks for English academic prose.
 *
 * Design rule: precision over recall. A supervisor loses trust in the tool the
 * moment it flags correct prose, so every rule here is narrowed with context
 * until its false-positive rate is near zero, even at the cost of missing cases.
 */
import { CONJUNCTIVE_ADVERBS, WORDY_PHRASES, INFORMAL } from './lexicons.js';

export const CATEGORY = 'grammar';

/*
 * Rules that report a suggestion rather than a fault.
 *
 * Passive voice and wordiness are not errors — an instructor asking to see
 * "the grammar mistakes" does not mean them, and burying six real agreement
 * errors under forty style notes is how a tool stops being read. They keep
 * their own category so the two can be looked at separately.
 */
const STYLE_RULES = new Set([
  'passive-voice', 'wordiness', 'register', 'vague-referent',
  'overlong-sentence', 'sentence-initial-numeral'
]);

const BE = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being', 'am']);
const MODALS = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'ought']);
const HAVE = new Set(['have', 'has', 'had', 'having']);
const DO = new Set(['do', 'does', 'did']);

/* Irregular past participles — needed for passive detection, which -ed misses. */
const PARTICIPLES = new Set(`been done seen given taken made known shown found held written spoken
broken chosen driven eaten fallen forgotten frozen hidden lost left kept meant met paid put read run said sent set sold
sung sunk sat slept spent stood taught told thought understood worn won drawn grown thrown built bought brought caught
cut dealt drunk felt fought got gotten heard let lit proven risen shot shut sought sped spread struck swum torn woken
begun bent bound bred burnt dug fed fled flown forbidden ground hung laid lain led overcome undergone withdrawn
arisen borne beaten bitten blown cast clung come crept dived dreamt dwelt fit hit hurt knelt leapt learnt lent
mistaken outgrown quit rid ridden rung sewn shaken shed shone shrunk slid slit sown spelt spilt split spoilt sprung
stolen stuck stung stridden strung sworn swept swollen swung thrust trodden upheld upset wept wet wound wrung`
  .trim().split(/\s+/));

/* Words that end in -ed but are adjectives or nouns, so not passive triggers. */
const NOT_PARTICIPLE = new Set(['need', 'indeed', 'exceed', 'proceed', 'succeed', 'embed', 'speed', 'breed', 'feed', 'bleed', 'agreed', 'freed', 'red', 'bed', 'led', 'fled', 'shed', 'wed', 'ted', 'hundred', 'sacred', 'united', 'limited', 'aged', 'naked', 'wicked', 'crooked', 'learned', 'beloved']);

export function analyseGrammar(doc) {
  const issues = [];
  const { text } = doc;
  const add = (o) => issues.push({
    category: STYLE_RULES.has(o.rule) ? 'style' : CATEGORY,
    ...o,
    excerpt: text.slice(o.start, o.end)
  });

  let passiveCount = 0;
  let finiteVerbTotal = 0;
  const tense = { past: 0, present: 0 };

  doc.bodySentences.forEach((s) => {
    if (s.isHeading) return; // headings are not sentences; every rule below assumes prose
    const w = s.words;
    const prose = s.lead ? s.text.slice(s.lead) : s.text;
    const lowers = w.map((x) => x.lower);

    /* ------------------------------------------ subject–verb agreement */
    for (let i = 0; i < w.length - 1; i++) {
      const a = lowers[i];
      const b = lowers[i + 1];
      if (SINGULAR_SUBJ.has(a) && PLURAL_VERB.has(b)) {
        add({ rule: 'subject-verb-agreement', severity: 'high', start: w[i].start, end: w[i + 1].end, message: `“${w[i].text}” is singular but “${w[i + 1].text}” is a plural verb form.`, suggestion: SINGULARISE[b] || '' });
      }
      if (PLURAL_SUBJ.has(a) && SINGULAR_VERB.has(b)) {
        add({ rule: 'subject-verb-agreement', severity: 'high', start: w[i].start, end: w[i + 1].end, message: `“${w[i].text}” is plural but “${w[i + 1].text}” is a singular verb form.`, suggestion: PLURALISE[b] || '' });
      }
      /* determiner + noun + verb: "these result shows", "this results show" */
      if (i < w.length - 2) {
        const c = lowers[i + 2];
        if (a === 'these' || a === 'those') {
          if (SINGULAR_VERB.has(c)) add({ rule: 'subject-verb-agreement', severity: 'high', start: w[i].start, end: w[i + 2].end, message: `“${w[i].text}” is plural; “${w[i + 2].text}” is singular.`, suggestion: PLURALISE[c] || '' });
        }
        if ((a === 'this' || a === 'each' || a === 'every') && PLURAL_VERB.has(c) && c !== 'have') {
          add({ rule: 'subject-verb-agreement', severity: 'high', start: w[i].start, end: w[i + 2].end, message: `“${w[i].text}” is singular; “${w[i + 2].text}” is plural.`, suggestion: SINGULARISE[c] || '' });
        }
      }
    }

    /* Latin plurals mishandled — extremely common in theses. */
    scanIn(s, /\b(criteria|phenomena|media|strata|bacteria|data)\s+(is|was|has)\b/gi, (m, off) =>
      add({
        rule: 'latin-plural',
        /* "the data is" is accepted in much modern usage; flag it, but as a
           point to consider rather than a certain error. */
        severity: m[1].toLowerCase() === 'data' ? 'medium' : 'high',
        start: off,
        end: off + m[0].length,
        message: m[1].toLowerCase() === 'data'
          ? '“data” is plural in strict academic usage (singular: datum). Many style guides now accept the singular — check the one your department follows.'
          : `“${m[1]}” is plural (singular: ${LATIN_SINGULAR[m[1].toLowerCase()]}).`,
        suggestion: m[0].replace(/is$/i, 'are').replace(/was$/i, 'were').replace(/has$/i, 'have')
      })
    );
    scanIn(s, /\b(criterion|phenomenon|medium|stratum|bacterium)\s+(are|were|have)\b/gi, (m, off) =>
      add({ rule: 'latin-plural', severity: 'high', start: off, end: off + m[0].length, message: `“${m[1]}” is singular.`, suggestion: '' })
    );
    /* Plural noun subject + singular verb: "the results has been reported". */
    scanIn(s, /\b(the|these|those|many|several|all|both|most|two|three|four|various|numerous|our|their)\s+([a-z]+s)\s+(is|was|has|does)\b/gi, (m, off) => {
      if (isSingularLookingS(m[2].toLowerCase())) return;
      add({ rule: 'subject-verb-agreement', severity: 'high', start: off, end: off + m[0].length, message: `“${m[2]}” is plural but “${m[3]}” is singular.`, suggestion: `${m[1]} ${m[2]} ${PLURALISE[m[3].toLowerCase()]}` });
    });

    /* Plural determiner + singular noun: "these result", "several study". */
    scanIn(s, /\b(these|those|many|several|various|numerous|both|few)\s+([a-z]{3,})\b/gi, (m, off) => {
      const noun = m[2].toLowerCase();
      if (noun.endsWith('s') || IRREGULAR_PLURALS.has(noun) || UNCOUNTABLE.has(noun) || MODIFIER_OK.has(noun)) return;
      add({ rule: 'plural-determiner', severity: 'medium', start: off, end: off + m[0].length, message: `“${m[1]}” is plural but “${m[2]}” looks singular.`, suggestion: `${m[1]} ${m[2]}s` });
    });

    scanIn(s, /\bthere\s+is\s+(many|several|numerous|various|multiple|two|three|four|five|both|few)\b/gi, (m, off) =>
      add({ rule: 'existential-agreement', severity: 'high', start: off, end: off + m[0].length, message: 'Plural complement — use “there are”.', suggestion: m[0].replace(/is/i, 'are') })
    );
    scanIn(s, /\bthere\s+are\s+(a|an|one|much|little)\s/gi, (m, off) =>
      add({ rule: 'existential-agreement', severity: 'high', start: off, end: off + m[0].length, message: 'Singular complement — use “there is”.', suggestion: m[0].replace(/are/i, 'is') })
    );

    /* ------------------------------------------------------ passive voice */
    for (let i = 0; i < w.length - 1; i++) {
      if (!BE.has(lowers[i])) continue;
      let j = i + 1;
      if (ADVERB_LIKE.test(lowers[j] || '')) j++;                       // "was carefully examined"
      const cand = lowers[j];
      if (!cand || !isParticiple(cand)) continue;
      passiveCount++;
      const agent = lowers.slice(j + 1, j + 3).includes('by');
      add({
        rule: 'passive-voice',
        severity: agent ? 'low' : 'low',
        start: w[i].start,
        end: w[j].end,
        message: agent ? 'Passive voice with a stated agent — usually fine, but an active verb is shorter.' : 'Passive voice hides who acted. Name the agent unless the actor is genuinely irrelevant.',
        suggestion: ''
      });
    }

    /* --------------------------------------------------- comma splices */
    CONJUNCTIVE_ADVERBS.forEach((adv) => {
      scanIn(s, new RegExp(`,\\s+(${adv})\\s+(?![,;])`, 'gi'), (m, off) => {
        const rel = off - s.start;
        const before = s.text.slice(0, rel);
        const after = s.text.slice(rel + m[0].length);
        if (!hasFiniteVerb(before) || !hasFiniteVerb(after)) return;
        if (/\b(and|but|or|so|yet)\s*$/i.test(before)) return;
        add({ rule: 'comma-splice', severity: 'high', start: off, end: off + m[0].length, message: `Comma splice: “${m[1]}” cannot join two independent clauses with only a comma. Use a semicolon or full stop.`, suggestion: `; ${m[1]}, ` });
      });
    });
    scanIn(s, /,\s+(it|this|these|those|they|he|she|we|there)\s+(is|are|was|were|has|have|had|do|does|did|will|would|can|could|may|might|must|should|shows?|demonstrates?|suggests?|indicates?|means?)\b/gi, (m, off) => {
      const before = s.text.slice(0, off - s.start);
      if (!hasFiniteVerb(before)) return;
      if (/\b(and|but|or|so|yet|which|who|that|because|although|while|since|if|when|whereas|though)\b[^,]*$/i.test(before)) return;
      add({ rule: 'comma-splice', severity: 'high', start: off, end: off + m[0].length, message: 'Comma splice: two independent clauses joined by a comma. Use a semicolon, a full stop, or a conjunction.', suggestion: `. ${cap(m[1])} ${m[2]}` });
    });

    /* ------------------------------------------------- introductory comma */
    scanIn(s, /^(However|Therefore|Moreover|Furthermore|Nevertheless|Nonetheless|Consequently|Accordingly|Similarly|Conversely|Indeed|In addition|For example|For instance|In conclusion|In summary|By contrast|On the other hand)\s+(?![,])/g, (m, off) =>
      add({ rule: 'introductory-comma', severity: 'medium', start: off, end: off + m[0].length, message: `A comma normally follows the introductory “${m[1]}”.`, suggestion: `${m[1]}, ` })
    );

    /* --------------------------------------------------------- fragments */
    const wordCount = w.length;
    if (wordCount >= 4 && wordCount <= 30) {
      const startsSubordinate = /^(because|although|though|while|whereas|since|if|when|unless|whilst|which|whereby|wherein|given that|despite|in spite of)\b/i.test(prose);
      if (startsSubordinate && !/[,;]/.test(s.text) && countFiniteVerbs(s.text) <= 1) {
        add({ rule: 'fragment', severity: 'medium', start: s.start, end: s.end, message: 'Likely sentence fragment: a subordinate clause with no main clause.', suggestion: '' });
      }
    }
    if (wordCount >= 6 && !hasFiniteVerb(s.text) && !/^[\d.]+\s/.test(s.text)) {
      add({ rule: 'fragment', severity: 'medium', start: s.start, end: s.end, message: 'No finite verb found — this may be a heading or an incomplete sentence.', suggestion: '' });
    }

    /* ----------------------------------------------------- overlong sentence */
    if (wordCount > 45) {
      add({ rule: 'overlong-sentence', severity: 'high', start: s.start, end: s.end, message: `${wordCount}-word sentence. Beyond ~40 words a reader loses the subject; split it.`, suggestion: '' });
    } else if (wordCount > 35) {
      add({ rule: 'overlong-sentence', severity: 'medium', start: s.start, end: s.end, message: `${wordCount}-word sentence — consider splitting.`, suggestion: '' });
    }

    /* ------------------------------------------------- vague “This” subject */
    scanIn(s, /^This\s+(is|was|shows|demonstrates|means|suggests|indicates|leads|proves|reveals|implies|explains|highlights)\b/g, (m, off) =>
      add({ rule: 'vague-referent', severity: 'medium', start: off, end: off + m[0].length, message: '“This” with no noun after it: the reader must guess the referent. Write “This finding/tension/shift…”.', suggestion: `This <noun> ${m[1]}` })
    );

    /* --------------------------------------------------- double negatives */
    scanIn(s, /\b(not|never|n't)\b[^.;:]{0,25}\b(no|nothing|nobody|none|neither|never)\b/gi, (m, off) =>
      add({ rule: 'double-negative', severity: 'medium', start: off, end: off + m[0].length, message: 'Double negative — state it positively.', suggestion: '' })
    );

    /* ------------------------------------------- sentence opening with digits */
    /* "1. The results…" is a list marker, not a sentence opening on a
       numeral, and numbered lists are common in a methods chapter. */
    const isListItem = /^\s*\d+[.)](\s|$)/.test(s.text);
    if (w[0] && w[0].isNumber && w[0].text.length <= 4 && !isListItem) {
      add({ rule: 'sentence-initial-numeral', severity: 'low', start: w[0].start, end: w[0].end, message: 'Do not begin a sentence with a numeral — spell it out or rephrase.', suggestion: '' });
    }

    finiteVerbTotal += countFiniteVerbs(s.text);
    tense.past += (s.text.match(/\b(was|were|had|did)\b/gi) || []).length;
    tense.present += (s.text.match(/\b(is|are|has|have|does|do)\b/gi) || []).length;
  });

  /* ----------------------------------------------------- wordiness / register */
  const body = text.slice(0, doc.bodyEnd);
  WORDY_PHRASES.forEach((p) =>
    scanAll(body, p.re, (m) =>
      add({ rule: 'wordiness', severity: 'low', start: m.index, end: m.index + m[0].length, message: `Wordy: “${m[0]}”.`, suggestion: p.suggest })
    )
  );
  INFORMAL.forEach((p) =>
    scanAll(body, p.re, (m) =>
      add({ rule: 'register', severity: 'low', start: m.index, end: m.index + m[0].length, message: p.message, suggestion: '' })
    )
  );

  const sentenceCount = doc.bodySentences.length || 1;
  return {
    issues,
    metrics: {
      passiveCount,
      passiveRate: passiveCount / sentenceCount,
      finiteVerbTotal,
      tenseBalance: tense,
      tenseMix: Math.min(tense.past, tense.present) / Math.max(1, tense.past + tense.present)
    }
  };
}

/* ---------------------------------------------------------------- helpers */

const SINGULAR_SUBJ = new Set(['he', 'she', 'it', 'this', 'one', 'each', 'everyone', 'someone', 'nobody', 'everybody', 'anyone', 'nothing']);
const PLURAL_SUBJ = new Set(['they', 'we', 'these', 'those', 'both', 'many', 'several']);
const PLURAL_VERB = new Set(['are', 'were', 'have', 'do']);
const SINGULAR_VERB = new Set(['is', 'was', 'has', 'does']);
const SINGULARISE = { are: 'is', were: 'was', have: 'has', do: 'does' };
const PLURALISE = { is: 'are', was: 'were', has: 'have', does: 'do' };
const LATIN_SINGULAR = { data: 'datum', criteria: 'criterion', phenomena: 'phenomenon', media: 'medium', strata: 'stratum', bacteria: 'bacterium' };

/* Nouns that end in -s but are singular, so they never signal an agreement error. */
const S_SINGULAR = new Set(['series', 'species', 'means', 'news', 'physics', 'politics', 'economics',
  'ethics', 'statistics', 'mathematics', 'linguistics', 'aesthetics', 'poetics', 'semantics',
  'this', 'thus', 'less', 'perhaps', 'always', 'across', 'towards', 'whereas', 'unless', 'yes']);

function isSingularLookingS(noun) {
  if (S_SINGULAR.has(noun)) return true;
  return /(?:ss|us|is|as|ics|ness|ous)$/.test(noun);
}

/* Plurals that do not end in -s, plus mass nouns — both are fine after "these"/"many". */
const IRREGULAR_PLURALS = new Set(['children', 'women', 'men', 'people', 'criteria', 'phenomena',
  'data', 'media', 'strata', 'bacteria', 'theses', 'analyses', 'hypotheses', 'indices', 'appendices',
  'matrices', 'corpora', 'schemata', 'foci', 'nuclei', 'stimuli', 'curricula', 'alumni', 'formulae']);
const UNCOUNTABLE = new Set(['research', 'evidence', 'information', 'literature', 'knowledge',
  'work', 'scholarship', 'discourse', 'terminology', 'feedback', 'advice', 'progress', 'behaviour',
  'behavior', 'content', 'context', 'material', 'practice', 'theory', 'thought', 'reasoning']);
/* Adjectives and adverbs that legitimately follow a plural determiner. */
const MODIFIER_OK = new Set(['other', 'such', 'more', 'most', 'different', 'important', 'similar',
  'recent', 'early', 'late', 'key', 'major', 'minor', 'small', 'large', 'new', 'old', 'previous',
  'earlier', 'later', 'specific', 'general', 'common', 'possible', 'potential', 'relevant',
  'significant', 'critical', 'central', 'broad', 'narrow', 'strong', 'weak', 'complex', 'simple',
  'recent', 'existing', 'current', 'further', 'additional', 'various', 'numerous', 'many', 'several',
  'empirical', 'theoretical', 'qualitative', 'quantitative', 'academic', 'scholarly', 'literary',
  'social', 'cultural', 'political', 'historical', 'modern', 'contemporary', 'classical', 'own']);
const ADVERB_LIKE = /ly$/;

function isParticiple(word) {
  if (NOT_PARTICIPLE.has(word)) return false;
  if (PARTICIPLES.has(word)) return true;
  return /[a-z]{3,}ed$/.test(word);
}

const FINITE = /\b(is|are|was|were|am|be(?:en|ing)?|has|have|had|do|does|did|can|could|may|might|must|shall|should|will|would|ought|seems?|appears?|shows?|argues?|suggests?|indicates?|demonstrates?|remains?|becomes?|became|provides?|includes?|requires?|reveals?|means?|makes?|made|takes?|took|gives?|gave|uses?|used|finds?|found|offers?|presents?|examines?|explores?|considers?|describes?|explains?|reflects?|supports?|leads?|allows?|enables?|involves?|contains?|represents?|refers?|relies|relied|focuses|focused|highlights?|emphasi[sz]es?)\b/gi;

/* Lenient: used to SUPPRESS the fragment warning, so it must catch every verb
   form the strict list misses ("established", "consists"), even at the cost of
   matching the odd plural noun. Missing a fragment is cheap; flagging a good
   sentence is not. */
function hasFiniteVerb(fragment) {
  FINITE.lastIndex = 0;
  if (FINITE.test(fragment)) return true;
  /* {3,} so short verbs like "lies" and "sets" count; requiring four
     characters before the -s called a correct sentence a fragment. */
  return /\b[a-z]{3,}(?:ed|es)\b/i.test(fragment) || /\b[a-z]{3,}s\b/i.test(fragment);
}

function countFiniteVerbs(fragment) {
  return (fragment.match(FINITE) || []).length;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* Run a regex inside one sentence, reporting absolute document offsets. */
function scanIn(sentence, re, fn) {
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  /* Skip any list marker so that ^-anchored rules see the prose, not "9. ". */
  const lead = sentence.lead || 0;
  const body = lead ? sentence.text.slice(lead) : sentence.text;
  let m;
  while ((m = rx.exec(body)) !== null) {
    fn(m, sentence.start + lead + m.index);
    if (m[0].length === 0) rx.lastIndex++;
  }
}

function scanAll(text, re, fn) {
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = rx.exec(text)) !== null) {
    fn(m);
    if (m[0].length === 0) rx.lastIndex++;
  }
}
