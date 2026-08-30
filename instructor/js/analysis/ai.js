/*
 * ai.js — OPTIONAL second-pass review. Disabled by default.
 *
 * The rule engine in this app is fully local and never transmits anything.
 * This module is the one exception, and only when the instructor explicitly
 * turns it on: it sends thesis text to whichever endpoint they configure.
 *
 * Two providers:
 *   anthropic — the Claude API. Text leaves the machine. The UI says so.
 *   local     — any OpenAI-compatible server on the instructor's own machine
 *               or network (Ollama, LM Studio, llama.cpp, vLLM). Nothing
 *               leaves the network, so the privacy guarantee still holds.
 *
 * Requests are plain fetch rather than the Anthropic SDK because this app has
 * no build step and must run from a static directory with no npm install.
 *
 * What the model is asked for is deliberately NOT what the rules already do.
 * Rules find missing citations and stacked boosters; the model is asked the
 * question rules cannot answer — does the evidence actually support the claim.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_MODEL = 'claude-opus-5';

/* A thesis fits comfortably in a 1M-token context; this only guards against
   pathological inputs (an OCR dump of scanned images, say). */
const MAX_CHARS = 400000;

const SYSTEM_PROMPT = `You are assisting a university instructor who is marking a student thesis.

A deterministic rule engine has ALREADY reported: spelling, punctuation, subject-verb agreement, comma splices, passive voice, wordiness, missing citations, unsupported claims, booster/hedge counts, and paragraph cohesion. Do NOT repeat that class of finding.

Report only what rules cannot see:
- Whether cited evidence actually supports the claim it is attached to, or is merely adjacent to it.
- Logical fallacies: circular reasoning, false dilemma, hasty generalisation, equivocation on a key term, non sequitur, post hoc.
- Counterarguments that are strawmen — presented in a weakened form so they can be dismissed.
- Conceptual drift: a central term used in two incompatible senses in different chapters.
- Claims whose scope exceeds what the stated method could establish.
- Gaps where a step of the argument is assumed rather than made.

Be specific and fair. This is a student's work; write findings a supervisor could hand to them directly. Where the writing is genuinely strong, say so in "strengths" — do not manufacture problems.

Respond with JSON only, no prose outside it, in exactly this shape:
{
  "summary": "2-4 sentences on the argument's overall condition",
  "strengths": ["..."],
  "findings": [
    {
      "quote": "an EXACT substring copied verbatim from the thesis, 5-25 words, that the finding is about",
      "type": "evidence-mismatch | fallacy | strawman | conceptual-drift | overreach | missing-step",
      "severity": "high | medium | low",
      "comment": "what is wrong, in one or two sentences",
      "suggestion": "what the student should do about it"
    }
  ]
}`;

export function isConfigured(settings) {
  const ai = settings.ai || {};
  if (!ai.enabled) return false;
  if (ai.provider === 'local') return Boolean(ai.endpoint);
  return Boolean(ai.apiKey);
}

export async function reviewThesis(text, settings, { signal } = {}) {
  const ai = settings.ai || {};
  if (!isConfigured(settings)) throw new Error('AI review is not configured. Enable it in Settings first.');

  const body = String(text || '').slice(0, MAX_CHARS);
  const truncated = String(text || '').length > MAX_CHARS;
  const userPrompt = `Here is the thesis text.\n\n<thesis>\n${body}\n</thesis>\n\nReview it as instructed and return the JSON object.`;

  const raw = ai.provider === 'local'
    ? await callLocal(userPrompt, ai, signal)
    : await callAnthropic(userPrompt, ai, signal);

  const parsed = parseJson(raw);
  return {
    ...parsed,
    truncated,
    provider: ai.provider || 'anthropic',
    model: ai.model || DEFAULT_MODEL,
    reviewedAt: new Date().toISOString()
  };
}

async function callAnthropic(userPrompt, ai, signal) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': ai.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      /* Required for browser-originated calls; it also means the key is
         exposed to this page, which is why the UI warns about it. */
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: ai.model || DEFAULT_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) throw new Error(await describeHttpError(res));
  const data = await res.json();

  if (data.stop_reason === 'refusal') {
    const why = data.stop_details && data.stop_details.explanation;
    throw new Error(`The model declined to review this text${why ? `: ${why}` : '.'}`);
  }
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('The model returned no text.');
  return text;
}

/* OpenAI-compatible chat completions — Ollama, LM Studio, llama.cpp, vLLM. */
async function callLocal(userPrompt, ai, signal) {
  const base = String(ai.endpoint || '').replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      ...(ai.apiKey ? { authorization: `Bearer ${ai.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: ai.model || 'llama3.1',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      stream: false
    })
  });

  if (!res.ok) throw new Error(await describeHttpError(res));
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('The local model returned no text.');
  return text.trim();
}

async function describeHttpError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = (body.error && (body.error.message || body.error.type)) || JSON.stringify(body).slice(0, 300);
  } catch {
    detail = (await res.text().catch(() => '')).slice(0, 300);
  }
  if (res.status === 401) return `Authentication failed (401). Check the API key. ${detail}`;
  if (res.status === 403) return `Access denied (403). ${detail}`;
  if (res.status === 429) return `Rate limited (429) — wait and retry. ${detail}`;
  if (res.status >= 500) return `The provider had a server error (${res.status}). ${detail}`;
  return `Request failed (${res.status}). ${detail}`;
}

/* Models sometimes wrap JSON in prose or a code fence; recover the object. */
function parseJson(raw) {
  const attempts = [raw];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) attempts.push(fence[1]);
  const braces = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  if (braces) attempts.push(braces);

  for (const candidate of attempts) {
    try {
      const obj = JSON.parse(candidate);
      return {
        summary: String(obj.summary || ''),
        strengths: Array.isArray(obj.strengths) ? obj.strengths.map(String) : [],
        findings: Array.isArray(obj.findings) ? obj.findings : []
      };
    } catch { /* try the next candidate */ }
  }
  return { summary: raw.slice(0, 800), strengths: [], findings: [], unparsed: true };
}

/*
 * Turn model findings into issues the highlighter can render, by locating each
 * quoted passage in the source. A quote that cannot be found is kept but left
 * unanchored — better a finding with no highlight than a highlight on the
 * wrong sentence.
 */
export function toIssues(review, text) {
  const issues = [];
  const unanchored = [];

  (review.findings || []).forEach((f, i) => {
    const quote = String(f.quote || '').trim();
    const span = locate(text, quote);
    const base = {
      category: 'ai',
      rule: `ai-${f.type || 'finding'}`,
      severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium',
      message: String(f.comment || '').trim(),
      suggestion: String(f.suggestion || '').trim(),
      fromAi: true
    };
    if (span) {
      issues.push({ ...base, start: span.start, end: span.end, excerpt: text.slice(span.start, span.end) });
    } else {
      unanchored.push({ ...base, index: i, excerpt: quote });
    }
  });

  return { issues, unanchored };
}

/* Exact match first; then a whitespace-tolerant match, because models
   normalise line breaks inside quotations. */
function locate(text, quote) {
  if (!quote || quote.length < 8) return null;
  const direct = text.indexOf(quote);
  if (direct >= 0) return { start: direct, end: direct + quote.length };

  const pattern = quote
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/['’]/g, "['’]")
    .replace(/["“”]/g, '["“”]')
    .replace(/\s+/g, '\\s+');
  try {
    const m = new RegExp(pattern, 'i').exec(text);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  } catch {
    return null;
  }
}
