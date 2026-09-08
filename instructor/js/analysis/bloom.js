/*
 * bloom.js — where the thinking sits on Bloom's revised taxonomy.
 *
 * Anderson & Krathwohl (2001), the revision of Bloom (1956):
 *
 *   1 Remember    recall what the text said
 *   2 Understand  restate it in your own words
 *   3 Apply       use a concept on new material
 *   4 Analyse     take apart, compare, show how a part works
 *   5 Evaluate    judge against a criterion, agree or disagree with reasons
 *   6 Create      propose something the scholarship does not yet contain
 *
 * For a literature department the live question is almost always the boundary
 * between 2 and 4: is this student RETELLING the novel or READING it? That is
 * what this module is built to answer, paragraph by paragraph, with the
 * evidence for every decision shown so the supervisor can overrule it.
 *
 * DELIBERATELY NOT A SCORE.
 *
 * Bloom's is a ladder of KINDS of thinking, not a scale of quality, and a
 * thesis is not better for being higher up it — a chapter of close textual
 * analysis (4) is not worse than a chapter that proposes a framework (6).
 * Collapsing the six into one number would invent exactly the kind of
 * authority this tool has no right to. So the output is a DISTRIBUTION over
 * paragraphs plus the evidence, and the reader draws the conclusion.
 *
 * WHAT IT CANNOT DO. This matches wording, not thought. It cannot tell a
 * genuine comparison from the word "whereas", and a student who has been
 * taught to signpost will read higher than one who does the same thinking
 * silently. Every classification here is a prompt to go and look at the
 * paragraph, never a finding about the student.
 */
/* No imports: everything here is self-contained lexicons and string work. */

export const CATEGORY = 'bloom';

export const LEVELS = [
  { n: 1, key: 'remember',   label: 'Remember',   gloss: 'recalls what the text says' },
  { n: 2, key: 'understand', label: 'Understand', gloss: 'restates or explains it' },
  { n: 3, key: 'apply',      label: 'Apply',      gloss: 'uses a concept on the material' },
  { n: 4, key: 'analyse',    label: 'Analyse',    gloss: 'takes apart, compares, shows how it works' },
  { n: 5, key: 'evaluate',   label: 'Evaluate',   gloss: 'judges against a criterion, with reasons' },
  { n: 6, key: 'create',     label: 'Create',     gloss: 'proposes something new' }
];

export const LEVEL_BY_N = Object.fromEntries(LEVELS.map((l) => [l.n, l]));

/*
 * The verb ladder. These are the standard Anderson & Krathwohl action verbs,
 * trimmed to those that actually occur in humanities prose — "calculate" and
 * "tabulate" are in the published lists and belong to a different discipline.
 *
 * Stored as stems: a trailing "s/es/ed/ing" is matched by the tokeniser below,
 * so "compares", "compared" and "comparing" all hit "compar".
 */
const VERB_STEMS = {
  1: ['recall', 'recount', 'retell', 'narrat', 'summariz', 'summaris', 'describ', 'list', 'state', 'mention', 'report', 'record', 'label', 'identif'],
  2: ['explain', 'interpret', 'paraphras', 'clarif', 'illustrat', 'restat', 'exemplif', 'classif', 'convey', 'depict', 'portray', 'demonstrat', 'indicat', 'reveal', 'signal', 'reflect', 'express'],
  3: ['appl', 'operationalis', 'operationaliz', 'mobilis', 'mobiliz', 'deriv'],
  4: ['analys', 'analyz', 'compar', 'contrast', 'differentiat', 'distinguish', 'examin', 'investigat', 'dissect', 'deconstruct', 'trac', 'attribut', 'unpack', 'situat', 'juxtapos', 'foreground', 'complicat'],
  5: ['evaluat', 'assess', 'critiqu', 'criticis', 'criticiz', 'judg', 'defend', 'justif', 'refut', 'rebut', 'dispute', 'challeng', 'contest', 'appraise', 'question', 'overlook', 'neglect', 'misread', 'conflat', 'overstat', 'understat'],
  6: ['propos', 'formulat', 'theoris', 'theoriz', 'devis', 'synthesis', 'synthesiz', 'reconceptualis', 'reconceptualiz', 'reframe', 'reimagin', 'hypothesis', 'hypothesiz', 'coin']
};

/*
 * Stems that are also ordinary nouns. "The question of exile" is not the
 * student questioning anything; "a model of empire" is not model-building.
 * These fire only when nothing determiner-like sits in front of them — the
 * cheapest reliable way to tell a verb from a noun without a parser.
 */
const NOUN_AMBIGUOUS = new Set([
  'question', 'contrast', 'record', 'report', 'label', 'list', 'state', 'trac',
  'compar', 'challeng', 'dispute', 'critiqu', 'appl', 'attribut', 'coin'
]);

const DETERMINERS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'its', 'his', 'her',
  'their', 'our', 'my', 'your', 'such', 'each', 'every', 'any', 'no', 'one',
  'two', 'three', 'several', 'many', 'some', 'both', 'another', 'first',
  'second', 'central', 'main', 'key', 'same', 'other', 'whose', 'of'
]);
/*
 * Phrase cues. These are stronger evidence than a bare verb, because they
 * describe a MOVE rather than name one: "in contrast to" is a comparison
 * happening, where "compare" is often only a promise to compare.
 */
const PHRASE_CUES = {
  1: ['the novel tells', 'the story begins', 'the plot', 'the narrator says', 'at the end of the novel',
      'in chapter', 'the protagonist then', 'after this', 'subsequently the', 'the events of'],
  2: ['in other words', 'that is to say', 'this means that', 'put differently', 'to put it another way',
      'in essence', 'what this suggests is', 'the passage describes', 'this can be understood as',
      'refers to', 'is defined as', 'by which is meant',
      /* Reporting what a critic holds — restatement, not yet analysis. */
      'reads it as', 'reads this as', 'argues that', 'contends that', 'maintains that',
      'claims that', 'suggests that', 'according to', 'in his view', 'in her view',
      'for him', 'for her', 'has approached', 'take the view',
      /* Defining a term. */
      'is a technique', 'is a process', 'is a term', 'can be described as',
      'is understood as', 'is the breaking', 'means that', 'is taken to mean'],
  3: ['applying this', 'using this framework', 'through this lens', 'read through', 'in these terms',
      'on this model', 'following this approach', 'this framework allows', 'if we apply',
      'this concept helps explain', 'seen through',
      /* A method performed on material, which is what Apply means here. */
      'the corpus consists', 'were coded', 'was coded', 'the sample consists',
      'data were collected', 'were collected from', 'the procedure', 'coding scheme',
      'were analysed using', 'were selected'],
  4: ['in contrast to', 'by contrast', 'whereas', 'the relationship between', 'functions as',
      'operates as', 'the tension between', 'this parallels', 'both ... and', 'the difference between',
      'on one level', 'at the same time as', 'the effect of this is', 'what makes this significant is',
      'the structure of', 'the repetition of', 'the shift from', 'gives way to', 'is complicated by',
      'this juxtaposition', 'the contradiction between'],
  5: ['fails to', 'succeeds in', 'more convincing than', 'less persuasive', 'the weakness of',
      'the limitation of', 'i disagree', 'this reading overlooks', 'this argument neglects',
      'is unconvincing', 'is problematic because', 'cannot account for', 'does not adequately',
      'rightly argues', 'wrongly assumes', 'overstates', 'understates', 'is too quick to',
      'while x is right', 'i take issue with', 'this criticism holds'],
  6: ['i propose', 'i want to suggest', 'this thesis argues that', 'i argue that', 'my contribution',
      'a more useful', 'i want to offer', 'this study develops', 'what i am calling',
      'i term this', 'i introduce the concept', 'a new framework', 'has not been considered',
      'no previous study', 'this opens a way', 'i extend']
};

/*
 * Turkish stems. The department writes and thinks in Turkish even when the
 * thesis is in English, and some theses will be Turkish outright. Turkish is
 * agglutinative, so these match as PREFIXES of a folded token:
 * "karşılaştır" catches karşılaştırıyor / karşılaştırarak / karşılaştırılan.
 */
const TR_STEMS = {
  1: ['anlat', 'aktar', 'ozetl', 'siral', 'belirt', 'tanimla', 'adland'],
  2: ['acikla', 'yorumla', 'ifade', 'gosterm', 'anlas', 'ornekl'],
  3: ['uygula', 'kullan', 'yararlan', 'baglam'],
  4: ['coz uml', 'cozumle', 'incele', 'karsilastir', 'ayirt', 'iliskilendir', 'irdele', 'tahlil', 'karsitl'],
  5: ['degerlendir', 'elestir', 'savun', 'tartis', 'sorgula', 'gerekcelendir', 'yetersiz', 'ikna edici'],
  6: ['oner', 'gelistir', 'kur', 'olustur', 'kavramsallast', 'yeniden dusun']
};

/* Announcing a move is not making it. "This chapter will analyse X" is a
   promise; the analysis is somewhere else, or nowhere. */
const ANNOUNCEMENT = /\b(?:will|shall|aims? to|seeks? to|attempts? to|intends? to|sets? out to|is going to|this (?:chapter|section|essay|thesis|paper|study) (?:will|aims|seeks))\b/i;

/* Turkish/English folding so "İNCELEME" and "inceleme" are one token. */
function fold(s) {
  return String(s || '')
    .replace(/[İI]/g, 'i').replace(/ı/g, 'i')
    .replace(/[ŞS]/g, 's').replace(/ş/g, 's')
    .replace(/[ĞG]/g, 'g').replace(/ğ/g, 'g')
    .replace(/[ÇC]/g, 'c').replace(/ç/g, 'c')
    .replace(/[ÖO]/g, 'o').replace(/ö/g, 'o')
    .replace(/[ÜU]/g, 'u').replace(/ü/g, 'u')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/* A verb stem hit: the token starts with the stem, and what follows is a
   plausible inflection rather than a different word ("relat" must not fire on
   "relative", "not" must not fire on "nothing"). */
const INFLECTIONS = ['', 's', 'es', 'd', 'ed', 'ing', 'e', 'ely', 'ion', 'ions', 'ation', 'ations'];
function stemHit(token, stem) {
  if (!token.startsWith(stem)) return false;
  return INFLECTIONS.includes(token.slice(stem.length));
}

/*
 * A noun-ambiguous stem directly after a determiner is a noun phrase, not the
 * student performing the move. This is the check the old claim detector never
 * had, which is why it counted "the significant question" as an assertion.
 */
function precededByDeterminer(tokens, i, stem) {
  if (!NOUN_AMBIGUOUS.has(stem)) return false;
  if (i === 0) return false;
  return DETERMINERS.has(tokens[i - 1]);
}

export function analyseBloom(doc) {
  const text = doc.text;
  const paragraphs = doc.bodyParagraphs.filter((p) => !p.isHeading);

  /* Classify every sentence, then let paragraphs inherit their highest
     PERFORMED level — one real analytic move makes the paragraph analytic,
     while an announcement leaves it where it was. */
  const sentences = doc.bodySentences
    .filter((s) => !s.isHeading && s.words.length >= 5)
    .map((s) => classifySentence(s));

  const byParagraph = new Map();
  sentences.forEach((c) => {
    const list = byParagraph.get(c.sentence.paragraph) || [];
    list.push(c);
    byParagraph.set(c.sentence.paragraph, list);
  });

  const paraResults = paragraphs.map((p) => {
    const list = byParagraph.get(p.index) || [];
    const performed = list.filter((c) => c.level && !c.announced);
    const best = performed.reduce((a, c) => (!a || c.level > a.level ? c : a), null);
    const announcedOnly = !best && list.some((c) => c.announced);
    return {
      index: p.index,
      start: p.start,
      end: p.start + p.text.length,
      words: p.text.split(/\s+/).filter(Boolean).length,
      level: best ? best.level : null,
      evidence: best ? best.evidence : [],
      excerpt: best ? best.sentence.text : p.text,
      announcedOnly,
      /* Every level touched anywhere in the paragraph, for the detail view. */
      levelsPresent: [...new Set(performed.map((c) => c.level))].sort()
    };
  });

  /* Paragraphs too short to carry a move, or with no cue at all, are counted
     as UNCLASSIFIED rather than silently dropped to level 1 — an absent
     signal is not evidence of low-level thinking. */
  const classified = paraResults.filter((p) => p.level);
  const unclassified = paraResults.length - classified.length;

  const distribution = LEVELS.map((l) => {
    const hits = classified.filter((p) => p.level === l.n);
    return {
      ...l,
      count: hits.length,
      share: classified.length ? hits.length / classified.length : 0,
      paragraphs: hits.map((p) => p.index)
    };
  });

  const dominant = classified.length
    ? distribution.reduce((a, d) => (d.count > a.count ? d : a), distribution[0])
    : null;

  /* The highest level reached in at least a tenth of classified paragraphs —
     not the single highest sentence, which any one lucky phrase would win. */
  const SUSTAIN = 0.10;
  const sustained = [...distribution].reverse().find((d) => d.share >= SUSTAIN && d.count >= 2) || null;
  const peak = [...distribution].reverse().find((d) => d.count > 0) || null;

  /* The pivot a literature supervisor actually cares about. */
  const retelling = distribution.filter((d) => d.n <= 2).reduce((a, d) => a + d.count, 0);
  const reading = distribution.filter((d) => d.n >= 4).reduce((a, d) => a + d.count, 0);
  const readingShare = classified.length ? reading / classified.length : 0;

  const issues = [];
  const runs = summaryRuns(paraResults);
  runs.forEach((run) => {
    issues.push({
      category: CATEGORY,
      rule: 'sustained-retelling',
      severity: run.length >= 5 ? 'high' : 'medium',
      start: run.start,
      end: run.end,
      message: `${run.length} paragraphs in a row read as summary rather than analysis — the text recounts what happens without saying what it means.`,
      suggestion: 'Ask what this passage is doing in the argument: what does it show, and how does it connect to the claim of the chapter?',
      excerpt: text.slice(run.start, Math.min(run.end, run.start + 400))
    });
  });

  paraResults
    .filter((p) => p.announcedOnly)
    .forEach((p) => {
      issues.push({
        category: CATEGORY,
        rule: 'announced-not-performed',
        severity: 'low',
        start: p.start,
        end: p.end,
        message: 'This paragraph announces an analytical move ("this chapter will examine…") without carrying one out here.',
        suggestion: 'Either do the work in this paragraph or cut the signpost and let the analysis speak.',
        excerpt: text.slice(p.start, Math.min(p.end, p.start + 400))
      });
    });

  return {
    issues,
    sentences,
    paragraphs: paraResults,
    metrics: {
      distribution,
      dominant,
      sustained,
      peak,
      classifiedParagraphs: classified.length,
      unclassifiedParagraphs: unclassified,
      totalParagraphs: paraResults.length,
      retellingParagraphs: retelling,
      readingParagraphs: reading,
      readingShare,
      summaryRuns: runs.length,
      longestSummaryRun: runs.reduce((a, r) => Math.max(a, r.length), 0),
      reading: plainReading({ classified: classified.length, dominant, sustained, readingShare, runs })
    }
  };
}

/* One sentence → the highest level it PERFORMS, plus what said so. */
function classifySentence(sentence) {
  const raw = sentence.text;
  const lower = raw.toLowerCase();
  const folded = fold(raw);
  const tokens = sentence.words.map((w) => w.lower);
  const foldedTokens = sentence.words.map((w) => fold(w.text));
  const announced = ANNOUNCEMENT.test(raw);

  const evidence = [];
  let level = null;

  for (const l of LEVELS) {
    const n = l.n;
    (PHRASE_CUES[n] || []).forEach((phrase) => {
      const needle = phrase.replace(' ... ', ' ');
      if (needle !== phrase) {
        /* "both ... and" — require both halves in order, which the literal
           string never would. This is the bug the old AI-frame list had. */
        const [a, b] = phrase.split(' ... ');
        const ai = lower.indexOf(a);
        if (ai >= 0 && lower.indexOf(b, ai + a.length) > 0) {
          evidence.push({ level: n, kind: 'phrase', text: phrase });
          if (!level || n > level) level = n;
        }
        return;
      }
      if (lower.includes(phrase)) {
        evidence.push({ level: n, kind: 'phrase', text: phrase });
        if (!level || n > level) level = n;
      }
    });

    (VERB_STEMS[n] || []).forEach((stem) => {
      if (stem.includes(' ')) {
        if (lower.includes(stem)) {
          evidence.push({ level: n, kind: 'verb', text: stem });
          if (!level || n > level) level = n;
        }
        return;
      }
      const at = tokens.findIndex((t, i) => stemHit(t, stem) && !precededByDeterminer(tokens, i, stem));
      if (at >= 0) {
        evidence.push({ level: n, kind: 'verb', text: stem });
        if (!level || n > level) level = n;
      }
    });

    (TR_STEMS[n] || []).forEach((stem) => {
      const hit = stem.includes(' ')
        ? folded.includes(stem)
        : foldedTokens.some((t) => t.startsWith(stem));
      if (hit) {
        evidence.push({ level: n, kind: 'tr', text: stem });
        if (!level || n > level) level = n;
      }
    });
  }

  return { sentence, level, announced, evidence };
}

/* Three or more consecutive paragraphs at Remember/Understand. One summary
   paragraph is normal and necessary; five in a row is a book report. */
function summaryRuns(paras) {
  const runs = [];
  let run = [];
  const isSummary = (p) => p.level !== null && p.level <= 2;
  paras.forEach((p) => {
    if (isSummary(p)) { run.push(p); return; }
    if (run.length >= 3) runs.push(toRun(run));
    run = [];
  });
  if (run.length >= 3) runs.push(toRun(run));
  return runs;
}

const toRun = (run) => ({
  length: run.length,
  start: run[0].start,
  end: run[run.length - 1].end,
  paragraphs: run.map((p) => p.index)
});

/* A sentence a supervisor could paste into feedback, built only from what was
   measured. No adjectives about the student. */
function plainReading({ classified, dominant, sustained, readingShare, runs }) {
  if (!classified) {
    return 'Not enough classifiable prose to say where the thinking sits — the text may be short, in a language this does not cover, or written without the usual signposting.';
  }
  const top = sustained || dominant;
  const parts = [];
  if (dominant) parts.push(`Most paragraphs read as ${dominant.label.toLowerCase()} — ${dominant.gloss}.`);
  if (top && top.n !== dominant.n) {
    parts.push(`Analysis at the level of ${top.label.toLowerCase()} is sustained across ${top.count} paragraphs.`);
  }
  parts.push(readingShare >= 0.4
    ? `${Math.round(readingShare * 100)}% of paragraphs go beyond restating the text.`
    : `Only ${Math.round(readingShare * 100)}% of paragraphs go beyond restating the text, which is the usual sign of a thesis that is still summarising its primary source.`);
  if (runs.length) {
    const longest = runs.reduce((a, r) => Math.max(a, r.length), 0);
    parts.push(`The longest unbroken stretch of summary is ${longest} paragraphs.`);
  }
  return parts.join(' ');
}
