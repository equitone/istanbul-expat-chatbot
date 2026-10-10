/*
 * spelling.js — spelling checked against a real dictionary.
 *
 * WHAT IT USES.
 *
 *   Engine      nspell 2.1.5, a Hunspell implementation in JavaScript.
 *               Titus Wormer, MIT. vendor/nspell.js.
 *   Dictionary  the SCOWL-derived Hunspell dictionaries, en_US and en_GB.
 *               Kevin Atkinson, wordlist.sourceforge.net, version 2020.12.07.
 *               vendor/dict/, with both licences beside them.
 *
 * These are the same .aff and .dic files LibreOffice, Firefox and
 * Thunderbird read. Nothing here is a list of words anyone typed out for
 * this app: 79,465 stems with their affix rules, which expands to far more
 * surface forms than a list could hold, and it comes with suggestions
 * computed from the dictionary rather than from a table of known mistakes.
 *
 * WHAT IT REPLACED, AND WHY THAT HAD TO GO.
 *
 * A hand-written table of 246 misspellings. It caught exactly those 246 and
 * nothing else, which is the wrong shape for the job: the words a thesis
 * actually misspells are not the ones a list-writer thinks of. The
 * dictionary catches all 246 and suggests the right correction for each,
 * which is how it was checked before the table was deleted.
 *
 * WHAT A DICTIONARY CANNOT DO, so the other analysers keep doing it.
 *
 * It cannot see a real word used wrongly: its/it's, lead/led, affect/effect
 * are all in the dictionary. Those stay in lexicons.js as context patterns,
 * which is also why Hunspell alone never catches them in Word either.
 *
 * It also cannot tell American from British. Both dictionaries are here and
 * the one that matches the setting is loaded, because SCOWL's normal lists
 * carry one spelling per word — check British prose against en_US and every
 * "analyse" is a misspelling. Mixing the two inside one document is a
 * separate question, answered by the variant check in mechanics.js.
 *
 * THE FALSE POSITIVES IT WOULD OTHERWISE PRODUCE.
 *
 * No general dictionary holds the vocabulary of literary criticism.
 * `interiority`, `diegesis`, `ekphrasis`, `liminality`, `intertextuality`,
 * `focalisation` and `narratological` are all absent from SCOWL at every
 * size, and so are the names of every Turkish scholar and place. Reporting
 * each of them as a misspelling would bury the real ones, so:
 *
 *   - A word the writer added to their own dictionary is never reported.
 *     This is what Word and LibreOffice do, and it is the only honest answer
 *     to domain vocabulary: the writer knows and the dictionary does not.
 *     It is also the only one left, by choice: earlier versions also guessed
 *     that a word capitalised throughout was a name, and that a word used
 *     three times was the writer's own term. Both kept a first run short and
 *     both decided for the writer what was worth seeing, so both are gone.
 *     What the dictionary lacks is now reported, every time.
 *   - Headings, reference entries, URLs, DOIs, acronyms and anything with a
 *     digit in it are skipped, as everywhere else in this analyser.
 *
 * WHAT THE DICTIONARY IS LOADED FROM.
 *
 * Files beside the app, never the network. The served copy fetches them from
 * vendor/dict/; the single-file build has them inlined at build time,
 * because a page opened from a folder cannot fetch its own neighbours. If
 * neither is available the check reports that it could not run, rather than
 * silently reporting nothing and looking like clean prose.
 */
import { categoryForRule } from './segments.js';
import { looksLikeReference } from './text.js';

export const CATEGORY = 'typo';

export const DIALECTS = [
  { id: 'en_US', label: 'American', about: 'analyze, color, center, defense.' },
  { id: 'en_GB', label: 'British', about: 'analyse, colour, centre, defence.' }
];
/* American by default, by choice rather than by accident: it is what the
   writer asked for, and the other is one click away in Settings. */
export const DEFAULT_DIALECT = 'en_US';

/* One loaded dictionary per dialect, kept for the life of the page: 90ms to
   parse, and the Grammar tab is run over and over. */
const loaded = new Map();
let failure = null;

/** Has a dictionary been parsed already? Lets the view avoid a spinner. */
export const isReady = (dialect) => loaded.has(dialect);
export const loadFailure = () => failure;

/*
 * Drop the parsed dictionaries.
 *
 * Each is a few megabytes of parsed structure held for the life of the page,
 * which is the right trade while it is being used. This exists so the tests
 * can exercise the path where loading fails: without it, a dictionary parsed
 * by an earlier case is still cached and the failure cannot be reached.
 */
export function forgetDictionaries() {
  loaded.clear();
  failure = null;
}

/*
 * Load the engine and one dictionary.
 *
 * `window.__DICTS` is how the single-file build supplies them: the bundler
 * inlines the .aff and .dic text there, because that build has no files to
 * fetch. Served, they come off disk.
 */
export async function loadDictionary(dialect = DEFAULT_DIALECT, { base = 'vendor' } = {}) {
  const id = DIALECTS.some((d) => d.id === dialect) ? dialect : DEFAULT_DIALECT;
  if (loaded.has(id)) return loaded.get(id);

  const inline = (typeof window !== 'undefined' && window.__DICTS) || null;
  let aff;
  let dic;
  if (inline && inline[id]) {
    ({ aff, dic } = inline[id]);
  } else {
    const get = async (ext) => {
      const res = await fetch(`${base}/dict/${id}.${ext}`);
      if (!res.ok) throw new Error(`${id}.${ext} answered ${res.status}`);
      return res.text();
    };
    [aff, dic] = await Promise.all([get('aff'), get('dic')]);
  }

  /* The engine arrives as a classic script, so it is on window by the time
     any module runs. A module import could not work from a folder. */
  const nspell = typeof window !== 'undefined' ? window.__nspell : null;
  if (typeof nspell !== 'function') {
    throw new Error('the spelling engine (vendor/nspell.global.js) did not load');
  }
  const spell = nspell(aff, dic);
  loaded.set(id, spell);
  failure = null;
  return spell;
}

/*
 * Check a document.
 *
 * Async because the dictionary may not be parsed yet. Returns the same
 * { issues } shape as the other analysers, plus `ran` so the view can tell
 * "nothing is misspelled" from "the dictionary never loaded" — the
 * distinction a checker must never blur.
 */
export async function analyseSpelling(doc, { dialect = DEFAULT_DIALECT, personal = [], base = 'vendor' } = {}) {
  let spell;
  try {
    spell = await loadDictionary(dialect, { base });
  } catch (err) {
    failure = err.message || String(err);
    return { issues: [], ran: false, reason: failure, dialect };
  }

  const own = new Set(personal.map((w) => String(w).toLowerCase()));
  const text = doc.text;
  const issues = [];

  /*
   * Headings and the reference list are skipped, and the reference list
   * hardest of all: it is wall-to-wall proper nouns, foreign titles and
   * publisher names, so it would produce more unknown words than the whole
   * body put together while saying nothing about anyone's spelling.
   */
  const skip = (doc.paragraphs || [])
    .filter((p) => p.isHeading || looksLikeReference(p.text))
    .map((p) => [p.start, p.start + p.text.length]);
  const refsFrom = doc.referencesStart === null || doc.referencesStart === undefined
    ? Infinity : doc.referencesStart;
  const inSkipped = (at) => at >= refsFrom || skip.some(([a, b]) => at >= a && at < b);

  /*
   * EVERY UNKNOWN WORD IS REPORTED.
   *
   * Two guesses used to stand between the dictionary and the list. A word
   * capitalised everywhere was taken for a name and skipped, and a word
   * used three times or more was taken for the writer's own term and
   * gathered into a note instead of being flagged. Both were there to keep
   * a first run short, and both decided on the writer's behalf what was
   * worth seeing. They are gone, at the writer's request: if the dictionary
   * does not have the word, it is on the list.
   *
   * The release valve is the writer's own dictionary, which is explicit and
   * theirs. A word added there is never reported again.
   */

  /*
   * Where the URLs and DOIs are.
   *
   * Looking back a dozen characters from each word was not enough: the tail
   * of a DOI path is further from the "10.1093" than that, so the last
   * segment of every link was being offered a spelling correction. The spans
   * are found once over the whole text instead.
   */
  const linkSpans = [];
  for (const m of text.matchAll(/(?:https?:\/\/|www\.|doi:\s*|10\.\d{4,9}\/)\S+/gi)) {
    linkSpans.push([m.index, m.index + m[0].length]);
  }
  const inLink = (at) => linkSpans.some(([a, b]) => at >= a && at < b);

  const candidates = [];

  for (const w of doc.words || []) {
    if (!checkable(w)) continue;
    if (inSkipped(w.start) || inLink(w.start)) continue;
    if (own.has(w.lower)) continue;
    const bare = trimPossessive(w.text);
    if (!bare || spell.correct(bare)) continue;
    const capital = /^[A-ZÀ-ÞĞİÖŞÜÇ]/.test(bare);
    candidates.push({ word: w, bare, capital });
  }

  for (const { word, bare, capital } of candidates) {
    const suggestions = spell.suggest(bare).slice(0, 4);
    /*
     * WHEN THIS SAYS "MISSPELLING", AND WHEN IT DOES NOT.
     *
     * A near miss gets the blunt word, because that is what it almost
     * always is and softening it wastes the reader's attention. Anything
     * further out says only what is certain — the word is not in the
     * dictionary — and offers the nearest entry as a question.
     *
     * A capitalised word never gets the blunt word whatever the distance.
     * It is still reported, but a dictionary has no opinion worth hearing
     * about a name, and what it offers for one is usually absurd: "Pamuk"
     * is sent "Amok". Calling that a misspelling would be a claim about a
     * person's name made by a word list that has never heard of them.
     */
    const close = !capital && suggestions.length > 0
      && distance(bare.toLowerCase(), suggestions[0].toLowerCase()) <= 2;
    const nearest = suggestions[0] ? matchCase(bare, suggestions[0]) : '';
    issues.push({
      category: categoryForRule(close ? 'misspelling' : 'not-in-dictionary', CATEGORY),
      rule: close ? 'misspelling' : 'not-in-dictionary',
      severity: close ? 'high' : 'low',
      start: word.start,
      end: word.end,
      excerpt: word.text,
      message: close
        ? `Misspelling: “${word.text}”. The dictionary has “${nearest}”.`
        : nearest
          ? `“${word.text}” is not in the ${labelOf(dialect)} dictionary. Did you mean “${nearest}”? If it is a word you use, add it to your own dictionary in Settings.`
          : `“${word.text}” is not in the ${labelOf(dialect)} dictionary, and it has nothing close to suggest. If it is a word you use, add it to your own dictionary in Settings.`,
      suggestion: nearest,
      alternatives: suggestions.slice(1),
      source: `Hunspell with the SCOWL ${labelOf(dialect)} dictionary`
    });
  }

  return { issues, ran: true, dialect, checked: candidates.length };
}

/* ---------------------------------------------------------------- helpers */

const labelOf = (id) => (DIALECTS.find((d) => d.id === id) || {}).label || id;

/*
 * Worth asking the dictionary about.
 *
 * Anything with a digit, an underscore or a dot in it is an identifier, a
 * DOI or part of a URL. A single letter is an initial or a list marker. All
 * caps is an acronym, and a dictionary has no useful opinion about those.
 */
function checkable(w) {
  if (w.isNumber) return false;
  const t = w.text;
  if (t.length < 3) return false;
  if (/[0-9_@/\\]/.test(t)) return false;
  if (/^[A-Z]{2,}$/.test(t)) return false;
  return /[A-Za-zÀ-ÿĞİÖŞÜÇğıöşüç]/.test(t);
}

/* "Woolf's" is a possessive, not a word the dictionary needs to hold. */
function trimPossessive(t) {
  return t.replace(/[’']s$/i, '').replace(/[’']$/, '');
}

function matchCase(source, replacement) {
  if (/^[A-Z][a-z]/.test(source)) return replacement[0].toUpperCase() + replacement.slice(1);
  if (/^[A-Z]+$/.test(source) && source.length > 1) return replacement.toUpperCase();
  return replacement;
}

/* Levenshtein, bounded: only used to decide whether a suggestion is close
   enough to call the word a misspelling rather than an unknown word. */
function distance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}
