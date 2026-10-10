/*
 * learner-english.js — the mistakes this department's students actually make.
 *
 * The workbench had two grammar engines and neither was aimed at the people
 * using it. The built-in rules are tuned for academic register — comma
 * splices, "these result", "the criteria is" — and LanguageTool is a general
 * English checker that has to be installed, which means a Java runtime, a
 * downloaded server and a terminal window left open. A literature professor
 * is not going to do that, so in practice the second engine does not exist.
 *
 * What does exist is a cohort of Turkish speakers writing English, and a set
 * of contrasts between the two languages that predict where English will go
 * wrong. The contrasts below are plain facts about Turkish grammar; the claim
 * that they are the *most frequent* errors is not made, because this project
 * has measured no cohort. What matters is that each is invisible to both of
 * the other engines:
 *
 *   Turkish has no articles at all, so a/an/the are omitted, inserted and
 *   confused more than anything else.
 *   Turkish does not pluralise a noun after a number or a quantifier — "üç
 *   kitap" is "three book" — so English plural marking is dropped.
 *   Turkish marks the object with a case ending rather than a preposition, so
 *   English verbs get prepositions they do not take: "discuss about".
 *   Some English mass nouns are countable in Turkish: "informations",
 *   "researches", "evidences", "advices".
 *
 * PRECISION OVER RECALL, as elsewhere in this app. Every rule here fires on a
 * pattern that is wrong in essentially all academic prose, and each one is
 * checked against a fixture of correct sentences designed to trip it. A rule
 * that cannot be made quiet on correct writing is not included — a checker
 * the supervisor stops believing is worse than no checker.
 *
 * Nothing here needs installing. It is the same offline rule engine as the
 * rest of the app.
 */
export const CATEGORY = 'grammar';

/*
 * Mass nouns that Turkish treats as countable. Only words where the plural is
 * wrong in ordinary academic prose: "literatures" and "peoples" are excluded
 * because both are legitimate in this discipline ("the literatures of the
 * Balkans", "the peoples of Anatolia").
 */
const MASS_NOUNS = {
  informations: 'information',
  researches: 'research',
  advices: 'advice',
  evidences: 'evidence',
  knowledges: 'knowledge',
  feedbacks: 'feedback',
  equipments: 'equipment',
  softwares: 'software',
  homeworks: 'homework',
  vocabularies: 'vocabulary',
  progresses: 'progress',
  staffs: 'staff'
};

/*
 * Verbs that take a direct object in English and a case ending in Turkish, so
 * the preposition is carried over: "discuss about the novel". How often that
 * happens is not something this project has measured, and the rule does not
 * need it to be true — the construction is wrong either way.
 */
const NO_PREPOSITION = [
  ['discuss', 'about'], ['mention', 'about'], ['emphasise', 'on'], ['emphasize', 'on'],
  ['explain', 'about'], ['describe', 'about'], ['stress', 'on'], ['request', 'for'],
  ['enter', 'to'], ['answer', 'to'], ['approach', 'to'], ['affect', 'to'],
  ['lack', 'of'], ['comprise', 'of'], ['reach', 'to'], ['contact', 'with'],
  ['investigate', 'about'], ['analyse', 'about'], ['analyze', 'about'], ['criticise', 'about'], ['criticize', 'about']
];

/* Verbs followed by a bare infinitive, never by "to -ing". "look forward to
   reading" is correct and is not in this list, which is the whole reason the
   rule is keyed on the verb rather than on "to + -ing". */
const BARE_INFINITIVE_VERBS = [
  'aim', 'aims', 'aimed', 'want', 'wants', 'wanted', 'need', 'needs', 'needed',
  'decide', 'decides', 'decided', 'try', 'tries', 'tried', 'hope', 'hopes', 'hoped',
  'plan', 'plans', 'planned', 'intend', 'intends', 'intended', 'seek', 'seeks', 'sought',
  'manage', 'manages', 'managed', 'fail', 'fails', 'failed', 'refuse', 'refuses', 'refused',
  'agree', 'agrees', 'agreed', 'offer', 'offers', 'offered', 'attempt', 'attempts', 'attempted',
  'wish', 'wishes', 'wished', 'choose', 'chooses', 'chose', 'expect', 'expects', 'expected'
];

/* Quantifiers that require a plural noun after them. */
const PLURAL_QUANTIFIERS = ['many', 'several', 'few', 'various', 'numerous', 'both', 'these', 'those'];

/*
 * Plurals that are not spelled like plurals.
 *
 * The test below is morphological: anything not ending in a sibilant reads as
 * singular. English irregulars defeat that, and the result is the checker
 * telling a student to write "many peoples" — which destroys its credibility
 * faster than a missed error does, because the student now has to judge the
 * tool instead of the sentence.
 */
const IRREGULAR_PLURALS = new Set([
  'people', 'children', 'men', 'women', 'feet', 'teeth', 'mice', 'geese', 'oxen',
  'criteria', 'phenomena', 'data', 'media', 'strata', 'corpora', 'genera',
  'alumni', 'fungi', 'stimuli', 'bacteria', 'curricula', 'addenda', 'errata',
  /* Same in both numbers; a plural "s" would be wrong. */
  'sheep', 'deer', 'fish', 'series', 'species', 'aircraft', 'offspring'
]);

/* Verbs that end in -s and so defeat a bare "is it plural" test. */
const VERB_AFTER = /^(is|was|has|does|goes|says|seems|appears|remains|exists|shows|gives|takes|makes|comes|becomes|reveals?|suggests?|argues?|discusses?|contains?|provides?|presents?|describes?|requires?|includes?|involves?|produces?|reflects?|concerns?|offers?|covers?|follows?|supports?|explains?|refers?|relates?|belongs?|consists?|focuses?|differs?|emerges?|serves?|tends?|needs?|lacks?|holds?|leads?|works?|helps?|means?|uses?)$/i;

const singularish = (w) => {
  if (IRREGULAR_PLURALS.has(w.toLowerCase())) return false;
  return !/(s|x|z|ch|sh)$/i.test(w) || /(ss|us|is)$/i.test(w);
};

/**
 * `doc` is the shared document from text.js. Returns issues in the same shape
 * as every other analyser, so the reader highlights them with no extra work.
 */
export function analyseLearnerEnglish(doc) {
  const text = doc.text;
  const body = text.slice(0, doc.bodyEnd);
  const issues = [];

  /*
   * Headings are not sentences, so none of these rules apply to them.
   *
   * grammar.js skips headings in its sentence loop and mechanics.js checks
   * the flag directly, but these rules scan the raw body text and had no
   * way to know. The result was "2.2 Method" read as a numeral followed by
   * a singular noun and reported as a missing plural — a finding on a
   * section heading, which is the fastest way to lose a reader's trust.
   *
   * Guarded once here rather than in each of the nine rules: a guard added
   * per rule is a guard forgotten by the tenth.
   */
  const headingSpans = (doc.paragraphs || [])
    .filter((p) => p.isHeading)
    .map((p) => [p.start, p.start + p.text.length]);
  const inHeading = (start, end) =>
    headingSpans.some(([a, b]) => start >= a && end <= b);

  const add = (o) => {
    if (inHeading(o.start, o.end)) return;
    issues.push({ category: CATEGORY, ...o, excerpt: text.slice(o.start, o.end) });
  };
  const scan = (re, fn) => { let m; const r = new RegExp(re.source, re.flags); while ((m = r.exec(body)) !== null) fn(m); };

  /* ---------------------------------------------- mass nouns pluralised */
  scan(/\b(informations|researches|advices|evidences|knowledges|feedbacks|equipments|softwares|homeworks|vocabularies|progresses|staffs)\b/gi, (m) => {
    const fix = MASS_NOUNS[m[1].toLowerCase()];
    add({
      rule: 'uncountable-plural',
      severity: 'high',
      start: m.index,
      end: m.index + m[0].length,
      message: `“${m[0]}” — this noun has no plural in English. It is countable in Turkish, which is where the ‑s comes from.`,
      suggestion: fix
    });
  });

  /* --------------------------------------- number or quantifier + singular */
  /* Guarded hard: hyphenated compounds ("a three-day conference"), units and
     measures, and words that are already plural or uncountable all pass. */
  scan(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})\s+([a-z]{3,})\b(?!-)/gi, (m) => {
    const noun = m[2].toLowerCase();
    if (!singularish(noun)) return;
    if (/^(hundred|thousand|million|billion|dozen|per|percent|pages?|years?|months?|weeks?|days?|hours?|minutes?|times?|and|or|of|the|in|to|from)$/.test(noun)) return;
    if (Object.values(MASS_NOUNS).includes(noun)) return;
    /*
     * A following plural noun means the word was an adjective: "three main
     * reasons" is correct and must not be flagged.
     *
     * The test cannot be "ends in s", because that is also every third-person
     * verb. "three student was late" and "two book reveals" were both being
     * waved through by this guard, silently, whenever a verb happened to
     * follow.
     */
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 40).match(/^\s+([a-z]+)/i);
    if (after && /(s|es)$/i.test(after[1]) && !VERB_AFTER.test(after[1])) return;
    add({
      rule: 'number-singular-noun',
      severity: 'medium',
      start: m.index,
      end: m.index + m[0].length,
      message: `“${m[0]}” — English marks the plural on the noun even after a number, where Turkish leaves it unmarked: üç kitap is literally “three book”.`,
      suggestion: `${m[1]} ${m[2]}s`
    });
  });

  scan(/\b(many|several|few|various|numerous|both)\s+([a-z]{4,})\b/gi, (m) => {
    const noun = m[2].toLowerCase();
    if (!singularish(noun)) return;
    if (/^(more|other|such|different|important|possible|recent|major|minor|early|late|new|old|small|large|good|great|key|main|own|same|very|of|a|an|the)$/.test(noun)) return;
    if (Object.values(MASS_NOUNS).includes(noun)) return;
    add({
      rule: 'quantifier-singular-noun',
      severity: 'medium',
      start: m.index,
      end: m.index + m[0].length,
      message: `“${m[1]}” takes a plural noun.`,
      suggestion: `${m[1]} ${m[2]}s`
    });
  });

  /* ------------------------------------------ verbs given a preposition */
  NO_PREPOSITION.forEach(([verb, prep]) => {
    const re = new RegExp(`\\b(${verb}(?:s|d|es|ed|ing)?)\\s+(${prep})\\b`, 'gi');
    scan(re, (m) => {
      add({
        rule: 'extra-preposition',
        severity: 'high',
        start: m.index,
        end: m.index + m[0].length,
        message: `“${m[1]} ${m[2]}” — in English this verb takes its object directly, with no preposition. Turkish marks the object with a case ending, which is where the extra word comes from.`,
        suggestion: m[1]
      });
    });
  });

  scan(/\b(despite|inspite)\s+of\b/gi, (m) => add({
    rule: 'despite-of',
    severity: 'high',
    start: m.index,
    end: m.index + m[0].length,
    message: '“despite of” is not English — it is either “despite” or “in spite of”.',
    suggestion: /inspite/i.test(m[1]) ? 'in spite of' : 'despite'
  }));

  /* ----------------------------------------------- to + -ing after a verb */
  scan(new RegExp(`\\b(${BARE_INFINITIVE_VERBS.join('|')})\\s+to\\s+([a-z]+ing)\\b`, 'gi'), (m) => {
    const base = deGerund(m[2]);
    add({
      rule: 'to-plus-gerund',
      severity: 'high',
      start: m.index,
      end: m.index + m[0].length,
      message: `“${m[1]} to ${m[2]}” — after this verb “to” takes the plain form, not “‑ing”.`,
      /* No guess where the base form is not known: chopping "ing" off
         "improving" gives "improv", and a wrong fix is worse than none. */
      suggestion: base ? `${m[1]} to ${base}` : ''
    });
  });

  /*
   * There is deliberately NO a/an rule here. mechanics.js already has one,
   * with its own exception lists and letter-name handling, and a second copy
   * only produced two findings on the same words.
   */

  /* --------------------------------------------- doubled comparative */
  scan(/\b(more|most)\s+([a-z]+(?:er|est))\b/gi, (m) => {
    if (/^(other|under|over|upper|inner|outer|later|latter|former|proper|further|rather|never|ever|order|paper|matter|water|power|number|gender|manner|modern|western|eastern|northern|southern)$/i.test(m[2])) return;
    add({
      rule: 'double-comparative',
      severity: 'high',
      start: m.index,
      end: m.index + m[0].length,
      message: `“${m[0]}” doubles the comparative — use one or the other.`,
      suggestion: m[2]
    });
  });

  /* ------------------------------------- resumptive pronoun in a relative clause */
  /* "the novel which I read it" — grammatical in Turkish, not in English. */
  /*
   * The pronoun has to sit at a clause boundary: before punctuation, or before
   * the verb that resumes the main clause. Without that guard the rule fires on
   * "the argument that he made it clear", where "it" is a genuine object.
   */
  scan(/\b(which|that|who|whom)\s+((?:[a-z]+\s+){1,4}?)(it|them|him|her)\s*(?=[,.;)]|\s+(?:was|were|is|are|has|have|had)\b|$)/gim, (m) => {
    if (/\b(is|are|was|were|be|been|has|have|had)\b/i.test(m[2]) && /\bto\b/i.test(m[2])) return;
    add({
      rule: 'resumptive-pronoun',
      severity: 'medium',
      start: m.index,
      end: m.index + m[0].length,
      message: `“${m[3]}” repeats the noun that “${m[1]}” already stands for. English drops it; Turkish keeps it.`,
      suggestion: m[0].replace(new RegExp(`\\s*${m[3]}\\s*$`, 'i'), '')
    });
  });

  /* ----------------------------------------------------- according to me */
  scan(/\baccording to (me|my opinion|myself)\b/gi, (m) => add({
    rule: 'according-to-me',
    severity: 'medium',
    start: m.index,
    end: m.index + m[0].length,
    message: '“According to” introduces someone else. For your own view write “In my view” or “I argue that”.',
    suggestion: 'In my view'
  }));

  return { issues };
}

/*
 * "improving" → "improve". English spelling makes this unguessable in general
 * — strip the ending and you get "improv", "writ", "runn" — so this is a map
 * of the verbs that actually occur in this position in academic prose, plus
 * one safe rule: no English verb ends in a bare "v", so a stem ending there
 * takes an "e". Anything else returns null and the finding carries no
 * suggested fix rather than a wrong one.
 */
const GERUND_BASE = {
  improving: 'improve', developing: 'develop', finding: 'find', solving: 'solve',
  understanding: 'understand', analysing: 'analyse', analyzing: 'analyze',
  writing: 'write', reading: 'read', using: 'use', making: 'make',
  creating: 'create', providing: 'provide', showing: 'show', explaining: 'explain',
  examining: 'examine', exploring: 'explore', achieving: 'achieve',
  producing: 'produce', establishing: 'establish', identifying: 'identify',
  addressing: 'address', presenting: 'present', comparing: 'compare',
  defining: 'define', describing: 'describe', including: 'include',
  applying: 'apply', reducing: 'reduce', increasing: 'increase',
  building: 'build', working: 'work', learning: 'learn', teaching: 'teach',
  bringing: 'bring', offering: 'offer', following: 'follow', supporting: 'support'
};

function deGerund(word) {
  const w = String(word || '').toLowerCase();
  if (GERUND_BASE[w]) return GERUND_BASE[w];
  const stem = w.replace(/ing$/, '');
  if (!stem || stem.length < 3) return null;
  if (/v$/.test(stem)) return `${stem}e`;
  return null;
}
