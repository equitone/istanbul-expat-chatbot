/*
 * languagetool.js — optional grammar engine, running on the instructor's own
 * machine.
 *
 * WHY THIS EXISTS
 * ---------------
 * The built-in rule engine is about forty hand-written patterns. LanguageTool
 * is thousands of rules with a real part-of-speech tagger behind them. On a
 * set of faults written without reference to either engine's rule list, the
 * built-in engine caught 4 of 15 and LanguageTool caught 11. That gap is not
 * closable by adding more regexes.
 *
 * The two are complementary rather than redundant. LanguageTool has no rule
 * for a comma splice, for "these result", or for "the criteria is" — the
 * academic patterns the built-in rules were written for. So when both are
 * available the app runs both and merges them.
 *
 * LanguageTool is a Java server the instructor runs locally. Nothing is sent
 * anywhere: it listens on localhost, and the text goes to their own process.
 * The privacy guarantee is unchanged.
 */

/* Requests are split so a long thesis does not hit any server-side limit.
   Splitting on blank lines keeps sentences whole, which matters because
   LanguageTool's rules work across a sentence. */
const CHUNK_CHARS = 12000;

export const LANGUAGES = [
  { id: 'en-GB', label: 'English (British)' },
  { id: 'en-US', label: 'English (American)' },
  { id: 'en-AU', label: 'English (Australian)' },
  { id: 'en-CA', label: 'English (Canadian)' },
  { id: 'en', label: 'English (variant-agnostic)' }
];

/*
 * LanguageTool's own issueType, mapped onto this app's categories.
 * Anything it calls style stays out of the error list, matching how the
 * built-in rules are separated.
 */
const TYPE_MAP = {
  misspelling: { category: 'typo', severity: 'high' },
  typographical: { category: 'typo', severity: 'medium' },
  whitespace: { category: 'typo', severity: 'low' },
  characters: { category: 'typo', severity: 'low' },
  duplication: { category: 'typo', severity: 'high' },
  grammar: { category: 'grammar', severity: 'high' },
  'non-conformance': { category: 'grammar', severity: 'medium' },
  inconsistency: { category: 'style', severity: 'low' },
  style: { category: 'style', severity: 'low' },
  register: { category: 'style', severity: 'low' },
  redundancy: { category: 'style', severity: 'low' },
  'locale-violation': { category: 'style', severity: 'low' },
  uncategorized: { category: 'grammar', severity: 'medium' }
};

/*
 * Rules to drop outright.
 *
 * A thesis is full of surnames, and a spell checker that does not know them
 * reports every citation as a misspelling — which is how a checker gets
 * switched off. Oxford -ize is a house-style choice, not an error.
 */
const SUPPRESSED = new Set(['OXFORD_SPELLING_Z_NOT_S', 'OXFORD_SPELLING_ISE_VERBS', 'OXFORD_SPELLING_NOUNS']);

export function isConfigured(settings) {
  const lt = settings.languageTool || {};
  return Boolean(lt.enabled && lt.endpoint);
}

export async function checkText(text, settings, { signal, onProgress } = {}) {
  const lt = settings.languageTool || {};
  const base = String(lt.endpoint || '').replace(/\/+$/, '');
  const url = /\/v2\/check$/.test(base) ? base : `${base}/v2/check`;
  const language = lt.language || 'en-GB';

  const chunks = splitForRequests(text);
  const issues = [];

  for (let i = 0; i < chunks.length; i++) {
    const { body, offset } = chunks[i];
    if (onProgress) onProgress(i + 1, chunks.length);

    const params = new URLSearchParams({ language, text: body });
    if (lt.motherTongue) params.set('motherTongue', lt.motherTongue);
    if (lt.picky) params.set('level', 'picky');

    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: params
    }).catch((err) => { throw describeFailure(err, url); });

    if (!res.ok) throw new Error(`LanguageTool returned ${res.status}. ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const data = await res.json();

    (data.matches || []).forEach((m) => {
      if (SUPPRESSED.has(m.rule?.id)) return;
      const map = TYPE_MAP[(m.rule?.issueType || 'uncategorized').toLowerCase()] || TYPE_MAP.uncategorized;
      const start = offset + m.offset;
      const end = start + m.length;
      const fixes = (m.replacements || []).slice(0, 3).map((r) => r.value).filter(Boolean);
      issues.push({
        category: map.category,
        severity: map.severity,
        /* Prefixed so a LanguageTool finding is distinguishable from a
           built-in one at a glance, in the list and in the exports. */
        rule: `lt:${(m.rule?.id || 'unknown').toLowerCase()}`,
        start,
        end,
        excerpt: text.slice(start, end),
        message: m.message || m.shortMessage || 'LanguageTool flagged this.',
        suggestion: fixes.join('  ·  '),
        source: 'languagetool'
      });
    });
  }

  return { issues, language, chunks: chunks.length };
}

/** Confirm the server is reachable and report what it is. */
export async function testConnection(settings, { signal } = {}) {
  const lt = settings.languageTool || {};
  const base = String(lt.endpoint || '').replace(/\/+$/, '');
  if (!base) throw new Error('No LanguageTool address set.');
  const url = /\/v2\/check$/.test(base) ? base : `${base}/v2/check`;

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ language: lt.language || 'en-GB', text: 'This are a test sentence.' })
  }).catch((err) => { throw describeFailure(err, url); });

  if (!res.ok) throw new Error(`LanguageTool returned ${res.status}.`);
  const data = await res.json();
  const v = data.software || {};
  return {
    ok: true,
    detail: `${v.name || 'LanguageTool'} ${v.version || ''} answered at ${url} — ${(data.matches || []).length} finding(s) on the probe sentence, language ${data.language?.name || lt.language}.`
  };
}

/*
 * A cross-origin refusal and a stopped server are the same TypeError in a
 * browser, so name both — the fix is a server flag either way.
 */
function describeFailure(err, url) {
  if (err.name === 'AbortError') return err;
  let origin = url;
  try { origin = new URL(url).origin; } catch { /* keep the raw string */ }
  return new Error(
    `Could not reach LanguageTool at ${origin}. Either it is not running, or it is refusing this page's origin (${location.origin}). ` +
    'Start it with --allow-origin "*". Original error: ' + err.message
  );
}

/* Split on blank lines, never mid-sentence, tracking the offset of each
   chunk so every reported position still points into the original text. */
function splitForRequests(text) {
  if (text.length <= CHUNK_CHARS) return [{ body: text, offset: 0 }];

  const out = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + CHUNK_CHARS, text.length);
    if (end < text.length) {
      const para = text.lastIndexOf('\n\n', end);
      const line = text.lastIndexOf('\n', end);
      const stop = text.lastIndexOf('. ', end);
      const cut = [para, line, stop].filter((x) => x > cursor + 1000).sort((a, b) => b - a)[0];
      if (cut) end = cut + 1;
    }
    out.push({ body: text.slice(cursor, end), offset: cursor });
    cursor = end;
  }
  return out;
}

/*
 * Merge LanguageTool findings with the built-in ones.
 *
 * Where both flag the same span, LanguageTool's message is usually the more
 * precise, so it wins and the duplicate is dropped. Built-in findings it does
 * not overlap are kept: the comma-splice and academic-agreement rules have no
 * LanguageTool equivalent, which is the reason for running both.
 */
export function merge(builtIn, external) {
  const overlaps = (a, b) => {
    const lo = Math.max(a.start, b.start);
    const hi = Math.min(a.end, b.end);
    const shared = hi - lo;
    if (shared <= 0) return false;
    return shared >= Math.min(a.end - a.start, b.end - b.start) * 0.5;
  };
  const kept = builtIn.filter((mine) => !external.some((ext) => ext.category === mine.category && overlaps(mine, ext)));
  return [...kept, ...external].sort((a, b) => a.start - b.start);
}
