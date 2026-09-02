/*
 * topic.js — is this topic worth a year of the student's life?
 *
 * The question a supervisor is really asked at the first meeting is not "does
 * this exist" but "is there room here, and if not, where is the room". This
 * turns a list of search hits into that answer.
 *
 * Everything here is computed from the works handed in. It does not ask a
 * model and it does not invent a reading of the field: an angle is only
 * suggested when the retrieved literature is the evidence for it, and each
 * one carries the count it rests on so the supervisor can disagree with the
 * reasoning rather than with a verdict.
 *
 * The standing limit, which the caller must keep visible: catalogues index
 * titles, abstracts and metadata, not full text, and their coverage of
 * monographs and of non-English scholarship is uneven. "Nothing close found"
 * is encouraging and is not proof of novelty.
 */

import { STOPWORDS, CLAIM_VERBS, HEDGES, BOOSTERS } from './lexicons.js';

/*
 * The scaffolding of a thesis statement is not its content.
 *
 * "This thesis argues that…" is how every statement is written, so "argues"
 * appears in none of the retrieved titles and would be scored as the most
 * distinctive term in the topic — putting "lead with 'argues'" at the top of
 * the advice. The claim verbs, hedges and boosters the rest of the app
 * already knows about are removed for the same reason the stopwords are.
 */
const GENRE = `study studies research paper papers thesis theses dissertation dissertations chapter chapters
article articles essay essays book books analysis approach approaches case cases evidence argument arguments
account accounts work works literature field theory framework method methods methodology finding findings
result results discussion conclusion introduction overview examine examines examined explore explores explored
investigate investigates investigated consider considers discuss discusses address addresses focus focuses
using used based upon toward towards within without between across through during`.split(/\s+/);

/*
 * High-frequency academic verbs. Not claim verbs — these make no assertion
 * about certainty — but they are the connective tissue of any statement and
 * they almost never appear in a title, so left in they score as the rarest
 * and therefore most "distinctive" term in the topic. "Lead with 'renders'"
 * is advice no supervisor would give.
 */
const COMMON_VERBS = `render renders rendered rendering shape shapes shaped shaping flatten flattens flattened
make makes made making produce produces produced create creates created cause causes caused allow allows allowed
enable enables enabled reflect reflects reflected indicate indicates indicated treat treats treated
trace traces traced follow follows followed remain remains remained become becomes became appear appears appeared
serve serves served function functions functioned operate operates operated emerge emerges emerged
depend depends depended derive derives derived constitute constitutes constituted involve involves involved
require requires required provide provides provided offer offers offered present presents presented
describe describes described define defines defined identify identifies identified determine determines determined
carry carries carried bring brings brought give gives given take takes taken hold holds held
work works worked read reads change changes changed turn turns turned move moves moved`.split(/\s+/);

const STOP = new Set([
  ...STOPWORDS,
  ...CLAIM_VERBS,
  ...HEDGES,
  ...BOOSTERS,
  ...GENRE.map((w) => w.trim()).filter(Boolean),
  ...COMMON_VERBS.map((w) => w.trim()).filter(Boolean)
]);

const words = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

const uniq = (xs) => [...new Set(xs)];

/* Overlap bands. A hit at 0.5 shares half its content terms with the topic,
   which in practice reads as "the same argument"; 0.3 reads as "the same
   area". Both are reported, because they mean different things to a
   supervisor and collapsing them would hide the distinction. */
const CLOSE = 0.5;
const NEAR = 0.3;

export function assessTopic(statement, works, { total = 0, source = 'OpenAlex' } = {}) {
  const topicTerms = uniq(words(statement));
  const hits = (works || []).map((w) => ({
    ...w,
    terms: new Set(words(`${w.title || ''} ${w.abstract || ''}`))
  }));

  const close = hits.filter((w) => w.overlap >= CLOSE);
  const near = hits.filter((w) => w.overlap >= NEAR && w.overlap < CLOSE);

  /*
   * Which of the instructor's own terms the field already owns, and which it
   * does not. This is the whole assessment in two lists: the crowded terms
   * are what everyone else is also writing about, and the rare ones are the
   * only place a contribution can come from.
   */
  const share = (term) => (hits.length ? hits.filter((w) => w.terms.has(term)).length / hits.length : 0);
  const scored = topicTerms.map((t) => ({ term: t, share: share(t), count: hits.filter((w) => w.terms.has(t)).length }));
  const crowded = scored.filter((t) => t.share >= 0.6).sort((a, b) => b.share - a.share);
  const distinctive = scored.filter((t) => t.share <= 0.2).sort((a, b) => a.share - b.share);

  /* What this literature talks about that the topic does not mention. */
  const conceptCounts = new Map();
  hits.forEach((w) => uniq(w.concepts || []).forEach((c) => conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1)));
  const topicText = new Set(topicTerms);
  const adjacent = [...conceptCounts.entries()]
    .filter(([c, n]) => n >= Math.max(2, Math.ceil(hits.length * 0.3)) && !words(c).some((w) => topicText.has(w)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([concept, count]) => ({ concept, count }));

  const years = hits.map((w) => Number(w.year)).filter((y) => Number.isFinite(y) && y > 1900);
  const closeYears = close.map((w) => Number(w.year)).filter((y) => Number.isFinite(y) && y > 1900);
  const newestClose = closeYears.length ? Math.max(...closeYears) : null;
  const thisYear = new Date().getFullYear();

  const verdict = decide({ close: close.length, near: near.length, distinctive, crowded, hits: hits.length });
  const angles = suggest({ close, near, distinctive, crowded, adjacent, newestClose, thisYear, hits });

  return {
    statement,
    source,
    total,
    examined: hits.length,
    counts: { close: close.length, near: near.length, unrelated: hits.length - close.length - near.length },
    closest: close[0] || near[0] || hits[0] || null,
    crowdedTerms: crowded.slice(0, 8),
    distinctiveTerms: distinctive.slice(0, 8),
    adjacent,
    span: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
    newestClose,
    verdict,
    angles,
    /* Part of the payload so no caller can render the verdict without it. */
    caveat: 'This reads titles, abstracts and metadata from one catalogue — never full text. Coverage of monographs and of scholarship not published in English is uneven, so "nothing close" is encouraging rather than conclusive. Treat it as the first hour of a literature review, not as the review.'
  };
}

/*
 * The verdict is a reading of two numbers: how much of the field is already
 * standing on this ground, and whether the topic says anything the field
 * does not already say. Neither alone decides it — a crowded area with a
 * genuinely distinctive angle is a good thesis, and an empty area with no
 * distinctive terms is usually a topic too vague to have competition.
 */
function decide({ close, near, distinctive, crowded, hits }) {
  if (!hits) {
    return { band: 'unknown', headline: 'Nothing came back to judge', detail: 'The search returned no works at all, which usually means the terms are too specific or too unusual rather than that the ground is empty. Try broader wording before reading anything into it.' };
  }
  if (close >= 3) {
    return distinctive.length
      ? { band: 'crowded', headline: 'Occupied ground, but you are not saying what they say', detail: `${close} works in this set make close to the same claim. What separates yours is ${distinctive.slice(0, 3).map((d) => `“${d.term}”`).join(', ')} — that has to become the argument rather than a detail inside it.` }
      : { band: 'crowded', headline: 'This is already a well-worked argument', detail: `${close} works in this set make substantially this claim, and every term in the statement is standard in that literature. As written this describes the field rather than adding to it.` };
  }
  if (close >= 1) {
    return { band: 'occupied', headline: 'Someone is close to this', detail: `${close} work${close === 1 ? '' : 's'} sit${close === 1 ? 's' : ''} close to this claim. Worth reading before committing — the thesis then either extends it or takes issue with it, and either is a stronger position than arriving at it independently.` };
  }
  if (near >= 3) {
    return { band: 'workable', headline: 'The area is active; the specific claim is not taken', detail: `${near} works are in the same area but none makes this claim. That is usually the best place to be: there is a conversation to join and a gap inside it.` };
  }
  if (crowded.length && !distinctive.length) {
    return { band: 'vague', headline: 'Too general to place', detail: 'Every term here is common in this literature and nothing narrows it. A statement this broad cannot be shown to be novel or not — add the case, period, corpus or method the thesis actually works on and search again.' };
  }
  return { band: 'clear', headline: 'Nothing close in this catalogue', detail: 'No indexed work makes this claim. Encouraging, but read the caveat: monographs and non-English scholarship are unevenly covered, and this is the ground where a supervisor should check a second catalogue before saying yes.' };
}

/*
 * Concrete next moves. Each one names the evidence it came from, because a
 * suggestion a supervisor cannot check is a suggestion they cannot pass on to
 * the student with any authority.
 */
function suggest({ close, near, distinctive, crowded, adjacent, newestClose, thisYear, hits }) {
  const out = [];

  if (distinctive.length && (close.length || near.length)) {
    const d = distinctive.slice(0, 2).map((x) => `“${x.term}”`).join(' and ');
    out.push({
      move: `Lead with ${d}`,
      why: `${distinctive[0].count === 0 ? 'No work' : `Only ${distinctive[0].count} of ${hits.length} works`} in this set uses ${distinctive.slice(0, 1).map((x) => `“${x.term}”`)}. It is the part of the statement the field has not absorbed, so it should be the claim rather than a qualifier inside it.`
    });
  }

  if (crowded.length >= 2 && !distinctive.length) {
    out.push({
      move: 'Add a boundary the field has not drawn',
      why: `${crowded.slice(0, 3).map((c) => `“${c.term}”`).join(', ')} each appear in most of the works retrieved. Naming a period, a single corpus, a region or a method that none of them uses is what would turn this from a summary into a position.`
    });
  }

  if (adjacent.length) {
    out.push({
      move: `Engage ${adjacent[0].concept}, or say why not`,
      why: `${adjacent[0].count} of the ${hits.length} works retrieved are indexed under ${adjacent[0].concept} and the statement does not mention it. Either it belongs in the thesis or the thesis needs a reason for leaving it out; an examiner will ask which.`
    });
  }

  if (newestClose && thisYear - newestClose >= 8) {
    out.push({
      move: `Revisit ground last worked in ${newestClose}`,
      why: `The closest work found is ${thisYear - newestClose} years old. Where the sources, the archive or the critical vocabulary have moved since, re-reading it is a thesis in itself — and one with a built-in justification.`
    });
  }

  if (close.length >= 1) {
    const c = close[0];
    out.push({
      move: 'Position against the closest work explicitly',
      why: `“${(c.title || 'the closest match').slice(0, 90)}”${c.year ? ` (${c.year})` : ''} shares ${Math.round(c.overlap * 100)}% of its content terms with this statement. A thesis that does not name it reads as though it has not been found; one that names it and disagrees has an argument on the first page.`
    });
  }

  if (!out.length) {
    out.push({
      move: 'Search again with the specifics in',
      why: 'Nothing in the results is close enough to argue with or distinctive enough to build on, which usually means the statement is still at the level of a subject rather than a claim. Put the case, the period and the method into it and run it again.'
    });
  }

  return out;
}
