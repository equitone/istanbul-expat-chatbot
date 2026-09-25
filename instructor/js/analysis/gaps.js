/*
 * gaps.js — where a literature is thin, computed before anything is written.
 *
 * THE FAILURE MODE THIS IS BUILT AGAINST.
 *
 * Ask a language model "what are the research gaps in X" and it will produce
 * five fluent, plausible, unfalsifiable paragraphs, some of them citing work
 * that does not exist. A supervisor cannot tell those from real findings, and
 * a student sent down one of them loses a term. That is the single worst
 * outcome this whole tool could produce, so the model is not asked that
 * question.
 *
 * THE DIVISION OF LABOUR.
 *
 *   This module   retrieves real works and cross-tabulates them along the
 *                 axes a literary scholar actually thinks in — theoretical
 *                 framework, period, method, region. Cells where both margins
 *                 are well populated and the intersection is EMPTY are
 *                 structural holes in the retrieved literature. They are
 *                 counted, not guessed, and every one can be clicked back to
 *                 the works that produced the margins.
 *
 *   The model     turns a counted hole into a question a supervisor could act
 *                 on, and says whether it looks like an opportunity, a dead
 *                 end, or a category error. It is given the counts and the
 *                 retrieved records, and it is told it may not introduce a
 *                 work that is not in them.
 *
 * So the mechanism finds the holes and the model explains them. The finding
 * survives without the model; only the wording depends on it.
 *
 * WHAT IT MAY NEVER SAY.
 *
 * Not "nobody has done this" — only "nothing in these N works does this".
 * OpenAlex indexes journal articles far better than monographs, and barely
 * covers Turkish-language scholarship, which for this department is not a
 * footnote: a hole here may be full of work published in Istanbul. Every
 * result carries its own coverage figures and that warning.
 */

/* ------------------------------------------------------------------ axes */

/*
 * Each axis is a list of [label, matcher]. Matching is on title + abstract +
 * OpenAlex concepts, lower-cased. Terms are chosen to be unambiguous in a
 * literary-studies corpus: "queer" and "gender" are safe, "critical" and
 * "cultural" are not and are absent.
 */
const FRAMEWORK = [
  ['Psychoanalytic', /\b(psychoanaly\w*|lacan\w*|freud\w*|kristeva|melancholi\w*|the uncanny)\b/],
  ['Postcolonial', /\b(postcolonial\w*|colonial\w*|empire|imperial\w*|subaltern|orientalis\w*|said'?s|spivak|bhabha)\b/],
  ['Feminist / gender', /\b(feminis\w*|gender\w*|patriarch\w*|womanhood|misogyn\w*|butler'?s)\b/],
  ['Queer', /\b(queer\w*|homoerot\w*|lesbian|gay|trans(?:gender)?\b|sedgwick)\b/],
  ['Marxist / class', /\b(marxis\w*|class struggle|proletaria\w*|commodit\w*|ideolog\w*|jameson|bourgeois\w*)\b/],
  ['Formalist / narratology', /\b(narratolog\w*|formalis\w*|free indirect|focaliz\w*|focalis\w*|prosod\w*|genette|narrative structure)\b/],
  ['Ecocritical', /\b(ecocritic\w*|ecolog\w*|anthropocene|environmental\w*|more-than-human|climate)\b/],
  ['Affect / emotion', /\b(affect theory|affective|emotion\w*|feeling\w*|sentiment\w*|shame|disgust)\b/],
  ['Translation studies', /\b(translat\w*|retranslat\w*|interpret(?:ing|er)\b|source text|target text|foreignis\w*|domesticat\w*|venuti)\b/],
  ['Reception / readership', /\b(reception|readership|reader response|book review\w*|circulation|middlebrow|bestseller)\b/],
  ['Digital / quantitative', /\b(digital humanities|computational|distant reading|corpus (?:analysis|linguistics|stylistics)|topic model\w*|stylometr\w*|network analysis)\b/],
  ['Archival / book history', /\b(archiv\w*|manuscript\w*|book history|print culture|periodical\w*|publishing house|editorial)\b/],
  ['Memory / trauma', /\b(trauma\w*|memory studies|cultural memory|postmemory|mourning|testimon\w*)\b/],
  ['Disability', /\b(disabilit\w*|madness|illness narrativ\w*|crip\b|deaf\w*|blind(?:ness)?\b)\b/]
];

const PERIOD = [
  ['Early modern', /\b(early modern|renaissance|elizabethan|jacobean|seventeenth[- ]century|16th[- ]century|17th[- ]century)\b/],
  ['Eighteenth century', /\b(eighteenth[- ]century|18th[- ]century|enlightenment|augustan|restoration)\b/],
  ['Romantic', /\b(romantic\w*|regency|nineteenth[- ]century early)\b/],
  ['Victorian', /\b(victorian|nineteenth[- ]century|19th[- ]century)\b/],
  ['Modernist', /\b(modernis\w*|interwar|avant[- ]garde|early twentieth[- ]century|1920s|1930s)\b/],
  ['Postwar', /\b(postwar|post-war|1950s|1960s|cold war)\b/],
  ['Contemporary', /\b(contemporary|twenty-first[- ]century|21st[- ]century|post-?2000|present-day)\b/]
];

const METHOD = [
  ['Close reading', /\b(close read\w*|textual analysis|explication|line[- ]by[- ]line)\b/],
  ['Comparative', /\b(comparative|comparison between|world literature|cross-cultural)\b/],
  ['Archival', /\b(archiv\w*|manuscript\w*|unpublished|correspondence|marginalia)\b/],
  ['Corpus / computational', /\b(corpus|computational|quantitative|dataset|distant reading|stylometr\w*)\b/],
  ['Interview / ethnographic', /\b(interview\w*|ethnograph\w*|fieldwork|questionnaire|survey of readers)\b/],
  ['Theoretical', /\b(theoretical framework|conceptual|philosoph\w*|ontolog\w*|epistemolog\w*)\b/]
];

const REGION = [
  ['Anglophone', /\b(english|british|american|irish|scottish|anglophone|canadian|australian)\b/],
  ['Turkish / Ottoman', /\b(turkish|turkey|ottoman|anatolia\w*|istanbul|tanzimat)\b/],
  ['French', /\b(french|france|francophone|parisian)\b/],
  ['German', /\b(german\w*|austrian|weimar)\b/],
  ['Russian / Slavic', /\b(russian|soviet|slavic|polish|czech)\b/],
  ['Arabic / Persian', /\b(arabic|persian|iranian|egyptian|levantine|farsi)\b/],
  ['Latin American', /\b(latin american|brazilian|argentin\w*|mexican|hispanic)\b/],
  ['South Asian', /\b(indian|south asian|bengali|urdu|pakistani|hindi)\b/],
  ['East Asian', /\b(chinese|japanese|korean|east asian)\b/]
];

export const AXES = [
  { id: 'framework', label: 'Theoretical framework', terms: FRAMEWORK },
  { id: 'period', label: 'Period', terms: PERIOD },
  { id: 'method', label: 'Method', terms: METHOD },
  { id: 'region', label: 'Region / language', terms: REGION }
];

/* The haystack for one work. Concepts come from OpenAlex's own classifier and
   are worth as much as the abstract for placing a work on an axis. */
const haystack = (w) =>
  `${w.title || ''} ${w.abstract || ''} ${(w.concepts || []).join(' ')} ${(w.container || w.journal || '')}`.toLowerCase();

/** Which labels on one axis a work carries. A work can sit in several. */
function labelsFor(work, terms) {
  const hay = haystack(work);
  return terms.filter(([, re]) => re.test(hay)).map(([label]) => label);
}

/* ------------------------------------------------------- the coverage map */

/**
 * Place every work on every axis, and cross-tabulate two axes at a time.
 * Returns the counts the rest of this module reasons over, and that the UI
 * shows so a supervisor can check any claim against the works behind it.
 */
export function coverageMap(works) {
  const placed = works.map((w) => {
    const on = {};
    AXES.forEach((a) => { on[a.id] = labelsFor(w, a.terms); });
    return { work: w, on };
  });

  const marginals = {};
  AXES.forEach((a) => {
    const counts = new Map();
    placed.forEach((p) => p.on[a.id].forEach((l) => counts.set(l, (counts.get(l) || 0) + 1)));
    marginals[a.id] = [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((x, y) => y.count - x.count);
  });

  const withAbstract = works.filter((w) => (w.abstract || '').length > 60).length;
  const unplaced = placed.filter((p) => AXES.every((a) => !p.on[a.id].length)).length;
  const years = works.map((w) => Number(w.year)).filter((y) => Number.isFinite(y) && y > 1800);

  return {
    placed,
    marginals,
    coverage: {
      works: works.length,
      withAbstract,
      unplaced,
      earliest: years.length ? Math.min(...years) : null,
      latest: years.length ? Math.max(...years) : null
    }
  };
}

/**
 * Cells where BOTH margins are well populated and the intersection is empty.
 *
 * The both-margins condition is what separates a structural hole from an
 * accident of the search: "psychoanalytic" appearing 14 times and "Turkish"
 * 9 times with no overlap is a fact about the literature, while a label that
 * appears twice tells you only that the query was narrow.
 */
export function findHoles(map, { minMargin = 3, pairs = [['framework', 'region'], ['framework', 'period'], ['method', 'framework'], ['method', 'region']] } = {}) {
  const holes = [];
  pairs.forEach(([aId, bId]) => {
    const aLabels = map.marginals[aId].filter((m) => m.count >= minMargin);
    const bLabels = map.marginals[bId].filter((m) => m.count >= minMargin);
    aLabels.forEach((a) => {
      bLabels.forEach((b) => {
        const both = map.placed.filter((p) => p.on[aId].includes(a.label) && p.on[bId].includes(b.label));
        if (both.length) return;
        holes.push({
          axes: [aId, bId],
          labels: [a.label, b.label],
          axisLabels: [AXES.find((x) => x.id === aId).label, AXES.find((x) => x.id === bId).label],
          counts: [a.count, b.count],
          /* The works that make each margin real — the evidence a supervisor
             clicks into to see that the hole is between two live areas. */
          aWorks: map.placed.filter((p) => p.on[aId].includes(a.label)).slice(0, 4).map((p) => p.work),
          bWorks: map.placed.filter((p) => p.on[bId].includes(b.label)).slice(0, 4).map((p) => p.work),
          /* Both margins strong and equal is a more interesting hole than one
             strong and one barely over the threshold. */
          weight: Math.min(a.count, b.count) * 2 + Math.abs(a.count - b.count) * -0.5
        });
      });
    });
  });
  return holes.sort((x, y) => y.weight - x.weight);
}

/*
 * Thin cells: occupied, but only just. Often more useful than an empty one —
 * a single paper on a crossing means somebody thought it worth doing and
 * there is something to argue with.
 */
export function findThin(map, { minMargin = 4, maxCell = 2, pairs = [['framework', 'region'], ['framework', 'period']] } = {}) {
  const thin = [];
  pairs.forEach(([aId, bId]) => {
    map.marginals[aId].filter((m) => m.count >= minMargin).forEach((a) => {
      map.marginals[bId].filter((m) => m.count >= minMargin).forEach((b) => {
        const both = map.placed.filter((p) => p.on[aId].includes(a.label) && p.on[bId].includes(b.label));
        if (!both.length || both.length > maxCell) return;
        thin.push({
          axes: [aId, bId],
          labels: [a.label, b.label],
          axisLabels: [AXES.find((x) => x.id === aId).label, AXES.find((x) => x.id === bId).label],
          counts: [a.count, b.count],
          cell: both.length,
          works: both.map((p) => p.work)
        });
      });
    });
  });
  return thin.sort((x, y) => (x.cell - y.cell) || (Math.min(...y.counts) - Math.min(...x.counts)));
}

/* --------------------------------------------------------- the AI prompt */

const workLine = (w, i) =>
  `[${i + 1}] ${w.title || 'untitled'} (${w.year || 'n.d.'})${w.authors && w.authors.length ? ` — ${w.authors.slice(0, 2).join(', ')}` : ''}${w.abstract ? `\n    ${String(w.abstract).replace(/\s+/g, ' ').slice(0, 280)}` : ''}`;

/**
 * The prompt. Deliberately narrow: the holes are already found, and the model
 * is asked only to interpret them. It is given the records so it can ground
 * what it writes, and told plainly that it may not add to them.
 */
export function buildGapPrompt({ statement, query, map, holes, thin, works }) {
  const margins = AXES
    .map((a) => {
      const m = map.marginals[a.id].slice(0, 8);
      return m.length ? `${a.label}: ${m.map((x) => `${x.label} (${x.count})`).join(', ')}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const holeLines = holes.slice(0, 8).map((h, i) =>
    `H${i + 1}. ${h.labels[0]} × ${h.labels[1]} — ${h.counts[0]} works on the first, ${h.counts[1]} on the second, NONE on both.`
  ).join('\n');

  const thinLines = thin.slice(0, 5).map((t, i) =>
    `T${i + 1}. ${t.labels[0]} × ${t.labels[1]} — only ${t.cell} work(s): ${t.works.map((w) => w.title).join('; ')}`
  ).join('\n');

  return `You are helping a literature supervisor judge where a research area is thin.

${statement ? `THE STUDENT'S PROPOSED CLAIM:\n${statement}\n` : `SEARCH TOPIC: ${query}\n`}
RETRIEVED WORKS (${works.length}). These are the ONLY works you know about:
${works.slice(0, 25).map(workLine).join('\n')}

HOW THE RETRIEVED SET IS DISTRIBUTED:
${margins || '(too few works carried recognisable markers)'}

EMPTY CROSSINGS found by counting the set above — both sides well represented, no work on both:
${holeLines || '(none found)'}

BARELY-OCCUPIED CROSSINGS:
${thinLines || '(none found)'}

Your task, for the most promising 3 to 5 of those crossings:

1. Write the research question that crossing implies, in one sentence a
   supervisor could put to a student.
2. Say which of these it is, and why:
   OPPORTUNITY — plausibly nobody has joined these yet
   HARDER THAN IT LOOKS — the crossing is empty because the sources, the
     language competence or the archive access make it difficult
   PROBABLY A CATEGORY ERROR — the crossing is empty because it does not make
     sense to join these two
3. Say what a student would need: which primary sources, which languages,
   which archives, and whether this is term-paper, MA or PhD sized.
4. Name which of the numbered works above would have to be engaged. Use their
   numbers. Do not name any other work.

RULES YOU MUST FOLLOW:
- You may not mention any book, article or author that is not in the list
  above. If you cannot support a point from that list, leave the point out.
- Never write that nobody has studied something. The only true statement
  available is that nothing in these ${works.length} retrieved works does.
- This retrieval is from OpenAlex, which indexes journal articles far better
  than monographs and barely covers Turkish-language scholarship. Where a gap
  looks likely to be filled by a monograph or by work published in Turkish,
  say so.
- Be brief. A supervisor reads this between classes.

Reply as JSON only:
{"gaps":[{"question":"...","kind":"opportunity|harder|category-error","why":"...","needs":"...","scale":"term paper|MA|PhD","works":[1,4],"caveat":"..."}],"note":"one sentence on how much weight this retrieval can bear"}`;
}

/**
 * Check the model's answer against the corpus before any of it is shown.
 * A gap citing a work number that does not exist is dropped; the count of
 * what was dropped is reported rather than hidden, because a model that
 * invents citations is telling you something about the rest of its answer.
 */
export function validateGaps(parsed, works) {
  const raw = Array.isArray(parsed && parsed.gaps) ? parsed.gaps : [];
  const kept = [];
  let dropped = 0;
  raw.forEach((g) => {
    const nums = Array.isArray(g.works) ? g.works.map(Number).filter((n) => Number.isFinite(n)) : [];
    const bad = nums.filter((n) => n < 1 || n > works.length);
    if (bad.length) { dropped++; return; }
    if (!g.question || String(g.question).trim().length < 10) { dropped++; return; }
    kept.push({
      question: String(g.question).trim(),
      kind: ['opportunity', 'harder', 'category-error'].includes(g.kind) ? g.kind : 'opportunity',
      why: String(g.why || '').trim(),
      needs: String(g.needs || '').trim(),
      scale: String(g.scale || '').trim(),
      caveat: String(g.caveat || '').trim(),
      works: nums.map((n) => works[n - 1]).filter(Boolean)
    });
  });
  return { gaps: kept, dropped, note: String((parsed && parsed.note) || '').trim() };
}
