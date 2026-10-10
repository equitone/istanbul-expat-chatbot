/*
 * ai.js — the model, kept on a short leash.
 *
 * One rule runs through every prompt here: the model may use the records it
 * is handed and nothing else. It is never asked what the literature says,
 * what exists, or who wrote what. Those questions produce fluent invention,
 * and in a research tool an invented citation is the worst possible output
 * because it is indistinguishable from a real one until someone goes looking.
 *
 * What it is asked for is interpretation of material already on the page:
 * turn these counted holes into questions, judge this argument I have already
 * measured, expand this outline I wrote. Everything it returns that names a
 * source is checked against the records before it is shown.
 */
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-opus-5';

export function isConfigured(settings) {
  const ai = (settings || {}).ai || {};
  if (!ai.enabled) return false;
  return ai.provider === 'local' ? Boolean(ai.endpoint) : Boolean(ai.apiKey);
}

const BASE_SYSTEM =
  'You assist a researcher in literary and translation studies. You work only from the records and ' +
  'text you are given in the prompt. You never introduce a book, article, author or quotation that ' +
  'is not there, and if a point cannot be supported from what you were given you leave the point out. ' +
  'You write plainly, in the register of a careful colleague, and you answer in JSON only.';

function pullObject(raw) {
  const tries = [raw];
  const fence = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) tries.push(fence[1]);
  const i = String(raw).indexOf('{');
  const j = String(raw).lastIndexOf('}');
  if (i >= 0 && j > i) tries.push(String(raw).slice(i, j + 1));
  for (const t of tries) { try { return JSON.parse(t); } catch { /* next */ } }
  return null;
}

async function callLocal(prompt, ai, signal, system) {
  const base = String(ai.endpoint || '').replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ai.model || 'llama3.1:8b',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        temperature: 0.4,
        stream: false
      })
    });
  } catch (err) {
    throw new Error(`Could not reach the model at ${base}. Is it running? (${err.message})`);
  }
  if (!res.ok) throw new Error(`The local model returned ${res.status}.`);
  const data = await res.json();
  return ((data.choices || [])[0] || {}).message?.content || '';
}

async function callAnthropic(prompt, ai, signal, system) {
  const res = await fetch(ANTHROPIC, {
    method: 'POST', signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ai.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: ai.model || DEFAULT_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`The API returned ${res.status}. ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  return (data.content || []).map((c) => c.text || '').join('');
}

export async function ask(prompt, settings, { signal, system } = {}) {
  if (!isConfigured(settings)) throw new Error('No model is set up. Add one in Settings.');
  const ai = settings.ai;
  const raw = ai.provider === 'local'
    ? await callLocal(prompt, ai, signal, system || BASE_SYSTEM)
    : await callAnthropic(prompt, ai, signal, system || BASE_SYSTEM);
  const obj = pullObject(raw);
  if (!obj) throw new Error(`The model did not return JSON. It began: ${String(raw).slice(0, 140)}`);
  return obj;
}

/* --------------------------------------------------------------- prompts */

export const sourceLine = (s, i) =>
  `[${i + 1}] ${s.title}${s.year ? ` (${s.year})` : ''}${s.authors && s.authors.length ? ` — ${s.authors.slice(0, 3).join(', ')}` : ''}` +
  `${s.abstract ? `\n    ${String(s.abstract).replace(/\s+/g, ' ').slice(0, 300)}` : ''}`;

/*
 * Argument generation. Not "think of arguments about X" — that is the
 * invention problem again, one layer up. It is: here is the position I want
 * to take and here are the sources I hold; what are the strongest lines of
 * argument AVAILABLE FROM THESE, what would each need, and what is the best
 * objection to each. An argument I cannot support is not an idea, it is a
 * distraction.
 */
export function ideasPrompt({ topic, position, sources }) {
  return `A researcher is working out how to argue a case.

THEIR TOPIC: ${topic}
${position ? `THE POSITION THEY WANT TO TAKE: ${position}\n` : ''}
THE SOURCES THEY HOLD (${sources.length}). These are the only works you know:
${sources.map(sourceLine).join('\n')}

Give the 4 strongest lines of argument available FROM THESE SOURCES.

For each:
- "claim": the argument in one sentence, stated as a position someone could disagree with. Not a topic, not a question.
- "because": the reasoning in two sentences at most.
- "uses": the numbers of the sources it rests on.
- "objection": the strongest objection, stated as its holder would state it.
- "answer": how the argument survives that objection, or an honest note that it may not.
- "strength": "load-bearing" if the sources directly support it, "needs more" if it is plausible but the sources only touch it.

Then "missing": one sentence on what kind of source would most strengthen the
set — a kind of source, not an invented title.

Rules: use only the works listed. Do not name any other author, book or
article. A line of argument you cannot tie to a numbered source does not go in.
Plain words. No "delve", "crucial", "pivotal", "underscore", "it is important
to note". Do not write "not just X but Y".

JSON only:
{"arguments":[{"claim":"...","because":"...","uses":[1,3],"objection":"...","answer":"...","strength":"load-bearing|needs more"}],"missing":"..."}`;
}

/*
 * Expanding an outline. The researcher supplies the argument; the model
 * supplies sentences. It is told the house style explicitly, because a draft
 * that arrives full of the patterns the Prose check flags is a draft that
 * wastes the researcher's afternoon.
 */
export function draftPrompt({ question, section, notes, sources }) {
  return `Expand one section of an essay from the writer's own notes.

THE ESSAY'S QUESTION: ${question || '(not stated)'}
THIS SECTION: ${section.heading}
WHAT THE WRITER WANTS IT TO DO: ${section.intent || '(not stated)'}

THE WRITER'S NOTES FOR THIS SECTION — the argument is theirs, keep it:
${notes || '(none supplied)'}

SOURCES AVAILABLE (${sources.length}):
${sources.length ? sources.map(sourceLine).join('\n') : '(none)'}

Write 2 to 4 paragraphs of continuous prose.

HOUSE STYLE, which matters as much as the content:
- Plain declarative sentences. Vary their length; do not fall into a rhythm.
- Never: delve, intricate, tapestry, pivotal, underscore, foster, testament,
  enhance, crucial, robust, seamless, leverage, realm, elevate, landscape (as
  a metaphor), navigate (as a metaphor), moreover, furthermore, notably,
  arguably, "it is important to note", "it is worth noting", "in conclusion".
- Never "not just X, it's Y", "not only X but also Y". State the point once.
- Do not open paragraphs with a connective. Start with the substance.
- Em dashes sparingly; a comma or a full stop is almost always better.
- No three-item lists unless there are genuinely three things.
- Do not end with a summary of what you just said.
- Never write "studies show", "critics have argued" or "it is widely accepted"
  without naming who. If you cannot name them from the sources above, do not
  make the claim.
- Cite as (Author year) only for the sources listed. Invent nothing.

Return the prose, and separately say what you were unable to support.

JSON only:
{"prose":"...","unsupported":["point the notes assert that the sources do not cover"],"used":[1,2]}`;
}

/* Validate anything that names a source against the set it was given. */
export function checkCitations(items, sources, key = 'uses') {
  const kept = [];
  let dropped = 0;
  (items || []).forEach((it) => {
    const nums = Array.isArray(it[key]) ? it[key].map(Number).filter(Number.isFinite) : [];
    if (nums.some((n) => n < 1 || n > sources.length)) { dropped++; return; }
    kept.push({ ...it, [key]: nums.map((n) => sources[n - 1]).filter(Boolean) });
  });
  return { kept, dropped };
}

/*
 * Does this actually work?
 *
 * Settings used to save quietly and say "Set up." the moment a box had text
 * in it, which answers a different question from the one the user is asking.
 * A typed address is not a reachable model, and the difference only showed up
 * later, on a Write button, as a failure that looked like the feature being
 * broken. This sends one trivial request and reports exactly what came back.
 */
export async function testModel(settings, { signal } = {}) {
  if (!isConfigured(settings)) {
    return { ok: false, detail: settings?.settings?.ai?.enabled === false
      ? 'The model is switched off.'
      : 'Nothing to test yet: fill in the address or the key.' };
  }
  const started = Date.now();
  try {
    const reply = await ask('Reply with exactly {"ok":true} and nothing else.', settings, { signal });
    const ms = Date.now() - started;
    return reply && typeof reply === 'object'
      ? { ok: true, detail: `Answered in ${(ms / 1000).toFixed(1)}s.` }
      : { ok: false, detail: 'It answered, but not with anything usable.' };
  } catch (err) {
    /* The model did reply, just not in JSON. For a connection test that is a
       pass: the thing is reachable, which is what was being asked. */
    const m = String(err.message || err);
    if (/did not return JSON/i.test(m)) {
      return { ok: true, detail: `Reachable in ${((Date.now() - started) / 1000).toFixed(1)}s, though it ignored the format asked for. Good enough to use.` };
    }
    return { ok: false, detail: m };
  }
}

/*
 * What models are actually installed.
 *
 * The model name is a free-text box, which is correct — every server names
 * its models differently and a fixed list would be wrong within a month —
 * but it leaves the obvious question unanswered: what is on this machine?
 * Getting that wrong is a silent failure, because a server asked for a
 * model it does not have returns an error at the moment you press a Write
 * button, long after the mistake was made.
 *
 * Two routes. `/v1/models` is the OpenAI-compatible standard and works for
 * Ollama, LM Studio, llama.cpp and vLLM alike. Ollama's own `/api/tags` is
 * tried after it because it carries the size and quantisation, which is
 * what tells you whether a model will actually run on the machine.
 */
export async function listModels(settings, { signal } = {}) {
  const ai = (settings || {}).ai || {};

  if (ai.provider === 'anthropic') {
    if (!ai.apiKey) return { ok: false, detail: 'Add the API key first, then this can ask which models the key may use.' };
    try {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=40', {
        signal,
        headers: {
          'x-api-key': ai.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        }
      });
      if (!res.ok) return { ok: false, detail: `Anthropic returned ${res.status}. ${(await res.text().catch(() => '')).slice(0, 140)}` };
      const data = await res.json();
      const models = (data.data || []).map((m) => ({ name: m.id, note: m.display_name || '' }));
      return models.length ? { ok: true, models, from: 'Anthropic' } : { ok: false, detail: 'The key works but no models came back.' };
    } catch (err) {
      return { ok: false, detail: `Could not reach Anthropic (${err.message}).` };
    }
  }

  const base = String(ai.endpoint || '').replace(/\/+$/, '');
  if (!base) return { ok: false, detail: 'Fill in the address first.' };

  /* The standard list. */
  try {
    const res = await fetch(`${base.replace(/\/v1$/, '')}/v1/models`, { signal });
    if (res.ok) {
      const data = await res.json();
      const models = (data.data || []).map((m) => ({ name: m.id })).filter((m) => m.name);
      if (models.length) return { ok: true, models, from: base };
    }
  } catch { /* fall through to Ollama's own */ }

  /* Ollama's, which says how big each one is. */
  const root = base.replace(/\/v1$/, '');
  try {
    const res = await fetch(`${root}/api/tags`, { signal });
    if (!res.ok) return { ok: false, detail: `The server at ${root} answered ${res.status} when asked for its models.` };
    const data = await res.json();
    const models = (data.models || []).map((m) => ({
      name: m.name,
      note: [m.details?.parameter_size, m.details?.quantization_level, m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '']
        .filter(Boolean).join(' · ')
    })).filter((m) => m.name);
    return models.length
      ? { ok: true, models, from: root }
      : { ok: false, detail: `${root} is running but has no models installed. Pull one, for example:  ollama pull llama3.1:8b` };
  } catch (err) {
    return {
      ok: false,
      detail: `Nothing answered at ${root}. Is the server running? For Ollama that is  ollama serve,  and it usually starts by itself. (${err.message})`
    };
  }
}
