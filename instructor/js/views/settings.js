import { el, mount, field, table, toast, confirmDialog, banner, int, num, chip } from '../ui.js';
import {
  getState, updateSettings, exportBackup, importBackup, wipeAll, storageEstimate, update
} from '../store.js';
import { DEFAULT_LETTER_SCHEME } from '../stats.js';
import { downloadText } from '../io/files.js';
import { describeEndpoint } from '../endpoints.js';
import { DEFAULT_MODEL, testConnection } from '../analysis/ai.js';
import { LANGUAGES, testConnection as testLanguageTool } from '../analysis/languagetool.js';

export default function renderSettings(root, ctx) {
  const s = getState();
  const ai = s.settings.ai;

  mount(root,
    el('div', { class: 'view-head' },
      el('div', {},
        el('h1', { text: 'Settings' }),
        el('p', { text: 'Grading scheme, optional AI review, and your data.' })
      )
    ),

    el('div', { class: 'grid cols-2' },
      el('div', { class: 'card' },
        el('h2', { text: 'You and the term' }),
        field('Your name', el('input', { value: s.settings.instructor, onChange: (e) => updateSettings({ instructor: e.target.value }) })),
        field('Institution', el('input', { value: s.settings.institution, onChange: (e) => updateSettings({ institution: e.target.value }) })),
        field('Default term', el('input', { value: s.settings.defaultTerm, onChange: (e) => updateSettings({ defaultTerm: e.target.value }) })),
        field('Contact email for scholarly APIs',
          el('input', { type: 'email', value: s.settings.contactEmail || '', placeholder: 'optional', onChange: (e) => updateSettings({ contactEmail: e.target.value }) }),
          'Crossref and OpenAlex give faster service to requests that identify themselves. Used only in Deep research, and sent to nobody else.')
      ),

      el('div', { class: 'card' },
        el('h2', { text: 'Grading' }),
        field('Pass mark', el('input', { type: 'number', min: '0', max: '100', value: s.settings.passMark, onChange: (e) => updateSettings({ passMark: Number(e.target.value) }) })),
        field('Scale maximum', el('input', { type: 'number', min: '1', value: s.settings.scaleMax, onChange: (e) => updateSettings({ scaleMax: Number(e.target.value) }) })),
        el('h2', { style: 'margin-top:14px', text: 'Letter scheme' }),
        table(['Letter', { label: 'Min score', num: true }, { label: 'GPA', num: true }],
          s.settings.letterScheme.map((row, i) => [
            el('td', {}, el('input', { value: row.letter, style: 'width:70px', onChange: (e) => patchScheme(i, { letter: e.target.value }) })),
            el('td', { class: 'num' }, el('input', { class: 'grade-input', type: 'number', value: row.min, onChange: (e) => patchScheme(i, { min: Number(e.target.value) }) })),
            el('td', { class: 'num' }, el('input', { class: 'grade-input', type: 'number', step: '0.5', value: row.gpa, onChange: (e) => patchScheme(i, { gpa: Number(e.target.value) }) }))
          ])),
        el('button', { class: 'sm', style: 'margin-top:10px', text: 'Reset to default', onClick: () => updateSettings({ letterScheme: DEFAULT_LETTER_SCHEME.map((x) => ({ ...x })) }) })
      )
    ),

    offlineLockCard(s, root, ctx),

    el('div', { class: 'card' },
      el('h2', { text: 'Grammar engine' }),
      el('p', { text: 'The built-in rules always run and need nothing installed. LanguageTool is an optional second engine that runs on this computer — thousands of rules against the built-in forty, and far better on ordinary grammar. On a set of faults written for neither engine, the built-in rules caught 4 of 15 and LanguageTool caught 11.' }),
      el('p', { class: 'hint', text: 'They are complementary, so both run when it is switched on. LanguageTool has no rule for a comma splice, for “these result”, or for “the criteria is” — the academic patterns the built-in rules exist for.' }),
      el('label', { class: 'inline' },
        el('input', { type: 'checkbox', checked: (s.settings.languageTool || {}).enabled, onChange: (e) => setLt({ enabled: e.target.checked }) }),
        el('span', { text: 'Also use LanguageTool' })
      ),
      (s.settings.languageTool || {}).enabled
        ? el('div', {},
            /* Derived from the address in the box below, not asserted. A
               remote address used to sit under a banner claiming localhost. */
            endpointBanner(s.settings.languageTool.endpoint, 'The thesis text'),
            el('div', { class: 'grid cols-2' },
              field('Address', el('input', { value: s.settings.languageTool.endpoint || '', placeholder: 'http://localhost:8081', onChange: (e) => setLt({ endpoint: e.target.value }) })),
              field('Variety of English', el('select', { onChange: (e) => setLt({ language: e.target.value }) },
                LANGUAGES.map((l) => el('option', { value: l.id, selected: l.id === s.settings.languageTool.language, text: l.label }))),
                'British and American spelling are checked against different dictionaries — the wrong one reports “summarised” as a misspelling.')
            ),
            el('label', { class: 'inline' },
              el('input', { type: 'checkbox', checked: s.settings.languageTool.picky, onChange: (e) => setLt({ picky: e.target.checked }) }),
              el('span', { text: 'Picky mode — more suggestions, more noise' })
            ),
            el('div', { class: 'row' },
              el('button', { id: 'lt-test', text: 'Test LanguageTool', onClick: runLtTest }),
              el('span', { id: 'lt-test-result', class: 'hint' })
            ),
            el('details', { style: 'margin-top:12px' },
              el('summary', { style: 'cursor:pointer;font-size:13px', text: 'How to install it' }),
              el('p', { class: 'hint', text: 'Needs Java 17 or newer. Download LanguageTool from languagetool.org/download (the desktop/standalone zip), unzip it, then from that folder run:' }),
              el('pre', { style: 'background:var(--surface-2);padding:10px;border-radius:6px;overflow-x:auto;font-size:12px' },
                'java -cp "languagetool-server.jar" org.languagetool.server.HTTPServer \\\n  --port 8081 --allow-origin "*"'),
              el('p', { class: 'hint', text: '--allow-origin is required, or the browser blocks this page from reaching it. Leave that window open while you work, exactly like the app\u2019s own.' })
            )
          )
        : el('p', { class: 'hint', text: 'Without it, grammar checking is the built-in rules only: strong on academic patterns, thin on general grammar.' })
    ),

    el('div', { class: 'card', id: 'ai-setup' },
      el('h2', { text: 'AI review and model setup (optional, off by default)' }),
      el('p', { text: 'Everything else in this app runs locally. This is the one feature that can send text elsewhere — so it stays off until you turn it on, and it tells you where the text goes.' }),
      el('label', { class: 'inline' },
        el('input', { type: 'checkbox', checked: ai.enabled, onChange: (e) => setAi({ enabled: e.target.checked }) }),
        el('span', { text: 'Enable AI review' })
      ),
      /*
       * The settings below used to be hidden until the checkbox was ticked,
       * which meant anyone who came here to set a model up found a lone
       * checkbox and an explanation — nothing to fill in. Typing an address
       * into a box sends nothing; only ticking Enable and pressing a review
       * button does. So the fields are always here and the checkbox governs
       * use, which is what the privacy promise was ever about.
       */
      !ai.enabled
        ? el('p', { class: 'hint', text: 'Fill these in now if you like — nothing is transmitted by doing so. No text leaves this machine until the box above is ticked and you press a Review button.' })
        : null,
      ollamaHelp(ai),
      modelNameWarning(ai),
      el('div', {},
            el('div', { class: 'grid cols-2' },
              field('Provider', el('select', { onChange: (e) => setAi({ provider: e.target.value }) },
                el('option', { value: 'local', selected: ai.provider === 'local', text: 'Local model (nothing leaves your machine)' }),
                /* Not offered while the lock is on. Leaving it selectable and
                   failing later would teach the instructor that the app is
                   broken rather than that the lock is doing its job. */
                s.settings.offlineLock
                  ? null
                  : el('option', { value: 'anthropic', selected: ai.provider === 'anthropic', text: 'Claude API (text is sent to Anthropic)' })
              ), s.settings.offlineLock ? 'Only a model on this computer can be used while the lock is on.' : ''),
              field('Model', el('input', {
                value: ai.model || (ai.provider === 'local' ? 'llama3.1:8b' : DEFAULT_MODEL),
                onChange: (e) => setAi({ model: e.target.value })
              }))
            ),
            ai.provider === 'local'
              ? el('div', {},
                  el('div', { class: 'row tight', style: 'margin-bottom:10px' },
                    el('span', { class: 'hint', text: 'Common backends:' }),
                    LOCAL_PRESETS.map((preset) => el('button', {
                      class: 'sm',
                      title: preset.note,
                      text: preset.label,
                      onClick: () => setAi({ endpoint: preset.endpoint })
                    }))
                  ),
                  endpointBanner(ai.endpoint, 'The thesis text'),
                  field('Endpoint', el('input', { value: ai.endpoint || '', placeholder: 'http://localhost:11434/v1', onChange: (e) => setAi({ endpoint: e.target.value }) }),
                    'The OpenAI-compatible base URL. Ollama: http://localhost:11434/v1 — LM Studio: http://localhost:1234/v1'),
                  field('API key (usually blank for local servers)', el('input', { type: 'password', value: ai.apiKey || '', onChange: (e) => setAi({ apiKey: e.target.value }) })),
                  field('Context window (tokens)',
                    el('input', { type: 'number', min: '2048', step: '1024', value: ai.contextTokens || 8192, onChange: (e) => setAi({ contextTokens: Number(e.target.value) }) }),
                    'Must match what the server is actually running. Ollama defaults to a few thousand tokens and silently drops anything beyond it — a whole thesis would be reviewed from its first pages only. Start Ollama with OLLAMA_CONTEXT_LENGTH=32768 and put 32768 here.')
                )
              : el('div', {},
                  banner('warn', 'With the Claude API, the full thesis text is transmitted to Anthropic for the review. Do not use this for material a student has not agreed to share, or where your institution’s data policy forbids it.'),
                  field('API key', el('input', { type: 'password', value: ai.apiKey || '', placeholder: 'sk-ant-…', onChange: (e) => setAi({ apiKey: e.target.value }) }),
                    'Stored in this browser’s local storage in plain text, and sent to Anthropic with each request. Anyone with access to this computer or this page can read it. Use a key you can revoke.')
                )
          ),
      el('div', { style: 'margin-top:12px' },
        el('div', { class: 'row' },
          el('button', { id: 'ai-test', text: 'Test connection', onClick: runTest }),
          el('span', { id: 'ai-test-result', class: 'hint' })
        )
      )
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'Your data' }),
      el('p', { text: 'A backup is a single JSON file containing everything — roster, courses, marks, and the full text of every saved thesis. Keep one; browser storage can be cleared by the browser itself.' }),
      el('div', { class: 'row' },
        el('button', { class: 'primary', text: 'Download backup', onClick: async () => {
          const payload = await exportBackup({ includeDocuments: true });
          downloadText(JSON.stringify(payload, null, 2), `workbench-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
          updateSettings({ lastBackupAt: new Date().toISOString() });
          toast('Backup downloaded. Keep it somewhere other than this computer.', 'good');
        } }),
        el('button', { text: 'Restore from backup', onClick: () => document.getElementById('restore-file').click() }),
        el('input', { type: 'file', id: 'restore-file', accept: '.json', style: 'display:none', onChange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const payload = JSON.parse(await f.text());
            const merge = await confirmDialog('Restore', 'Choose Merge to add anything missing and keep what is here, or Cancel then use Replace. Merge is the safe option.', 'Merge');
            await importBackup(payload, { merge });
            toast(merge ? 'Merged.' : 'Restored.', 'good');
          } catch (err) {
            toast(`Restore failed: ${err.message}`, 'error');
          }
          e.target.value = '';
        } }),
        el('div', { class: 'spacer' }),
        el('button', { class: 'danger', text: 'Erase everything', onClick: async () => {
          if (await confirmDialog('Erase all data?', 'This deletes every student, course, mark and thesis review from this browser. If you have not downloaded a backup, it is gone.', 'Erase everything')) {
            await wipeAll();
            toast('All data erased.');
          }
        } })
      ),
      el('div', { id: 'storage-line', class: 'hint', style: 'margin-top:12px', text: 'Checking storage…' })
    ),

    el('div', { class: 'card' },
      el('h2', { text: 'What this tool can and cannot see' }),
      el('p', { text: 'Worth knowing before you rely on any number it produces.' }),
      table(['Check', 'Basis', 'Limit'], [
        ['Spelling, grammar, punctuation', 'Rule engine, offline', 'Heuristic. Tuned to avoid false positives, so it misses cases rather than inventing them.'],
        ['Level of thinking', 'Word lists, offline', 'Bloom’s revised taxonomy (Anderson & Krathwohl 2001) applied paragraph by paragraph. It matches wording, not thought, and shows the wording behind every decision so you can overrule it.'],
        ['Claims & support', 'Rule engine, offline', 'Counts whether an assertion has a citation, quotation or stated reason near it. It cannot judge whether a claim is true, and it produces no combined score.'],
        ['Citation style (APA 7 / MLA 9)', 'Rule engine, offline', 'Checks form, not truth.'],
        ['Reuse against your corpus', 'Fingerprinting, offline', 'Only sees theses saved in this workbench. No web index, no journal index. Heavy paraphrase passes.'],
        ['Voice consistency', 'Stylometry, offline', 'Flags passages unlike the rest of the document. A flag is a question, not an answer.'],
        ['AI-writing indicators', 'Statistical, offline', 'Indicators only. Misfires on non-native writers and formulaic genres. Never treat as proof.'],
        ['Citation existence', 'Crossref + OpenAlex, online', 'Catches fabricated sources. Older books and non-English monographs are legitimately absent from both.'],
        ['Prior published work', 'OpenAlex, online', 'Searches titles and abstracts, not full text. Absence is weak evidence of novelty.'],
        ['Draft comparison', 'Exact diff, offline', 'Exact and repeatable. No limits worth noting.']
      ].map((r) => [r[0], el('td', { class: 'wrap' }, chip(r[1].includes('online') ? 'online' : 'offline', r[1].includes('online') ? 'medium' : 'good'), ` ${r[1]}`), el('td', { class: 'wrap', text: r[2] })]))
    )
  );

  applyPendingFocus(root);

  storageEstimate().then((est) => {
    const line = document.getElementById('storage-line');
    if (!line) return;
    const s2 = getState();
    const counts = `${s2.students.length} students · ${s2.courses.length} courses · ${s2.theses.length} theses`;
    line.textContent = est && est.usage
      ? `${counts} — using ${(est.usage / 1048576).toFixed(1)} MB of roughly ${(est.quota / 1048576).toFixed(0)} MB available to this site.`
      : counts;
  });
}

function setLt(patch) {
  updateSettings({ languageTool: { ...getState().settings.languageTool, ...patch } });
}

async function runLtTest(e) {
  const btn = e.currentTarget;
  const out = document.getElementById('lt-test-result');
  btn.disabled = true;
  out.textContent = 'Testing…';
  out.style.color = '';
  try {
    const r = await testLanguageTool(getState().settings);
    out.textContent = r.detail;
    out.style.color = 'var(--good)';
  } catch (err) {
    out.textContent = err.message;
    out.style.color = 'var(--high)';
  } finally {
    btn.disabled = false;
  }
}

function setAi(patch) {
  const ai = { ...getState().settings.ai, ...patch };
  updateSettings({ ai });
}

function patchScheme(index, patch) {
  const scheme = getState().settings.letterScheme.map((row, i) => (i === index ? { ...row, ...patch } : row));
  updateSettings({ letterScheme: scheme });
}


/* Base URLs for the local runtimes an instructor is most likely to already
   have. Each mounts its OpenAI-compatible surface at a different path. */
const LOCAL_PRESETS = [
  { label: 'Ollama', endpoint: 'http://localhost:11434/v1', note: 'Ollama serves an OpenAI-compatible API at /v1. No key needed.' },
  { label: 'Open WebUI', endpoint: 'http://localhost:3000/api', note: 'Open WebUI mounts its OpenAI-compatible API at /api and requires a key from Settings → Account.' },
  { label: 'LM Studio', endpoint: 'http://localhost:1234/v1', note: 'Start the server from LM Studio’s Developer tab and enable CORS there.' },
  { label: 'llama.cpp', endpoint: 'http://localhost:8080/v1', note: 'llama-server serves /v1 by default.' }
];

async function runTest(e) {
  const btn = e.currentTarget;
  const out = document.getElementById('ai-test-result');
  btn.disabled = true;
  out.textContent = 'Testing…';
  out.style.color = '';
  try {
    const result = await testConnection(getState().settings);
    out.textContent = result.detail;
    out.style.color = 'var(--good)';
  } catch (err) {
    out.textContent = err.message;
    out.style.color = 'var(--high)';
  } finally {
    btn.disabled = false;
  }
}

/*
 * The steps, where the person actually is when they need them.
 *
 * The Research tab explains this too, but somebody who lands here from a
 * menu rather than from that button would otherwise face an endpoint box
 * with no clue what is meant to be listening on the other end.
 */
function ollamaHelp(ai) {
  if (ai.provider === 'anthropic') return null;
  return el('details', { class: 'howto', open: !ai.endpoint },
    el('summary', { text: 'How to get a model running on this computer' }),
    el('ol', {},
      el('li', {}, 'Install ', el('strong', { text: 'Ollama' }), ' from ollama.com — there is a normal Windows and Mac installer and it needs no account.'),
      el('li', {}, 'Open Terminal (Mac) or Command Prompt (Windows) and run ', el('code', { text: 'ollama pull llama3.1:8b' }), ' — about 5 GB, once.'),
      el('li', {}, 'Start it with enough context for a thesis: ', el('code', { text: 'OLLAMA_CONTEXT_LENGTH=32768 ollama serve' })),
      el('li', {}, 'Press the ', el('strong', { text: 'Ollama' }), ' button below, set Model to ', el('code', { text: 'llama3.1:8b' }), ' and Context window to ', el('code', { text: '32768' }), ', then press ', el('strong', { text: 'Test connection' }), '.')
    ),
    el('p', { class: 'hint', text: 'That third step is not optional. Ollama defaults to a few thousand tokens of context and silently drops whatever does not fit — a whole thesis would be reviewed from its first pages only, with nothing to tell you. This app refuses rather than pretending, and shows you the arithmetic.' })
  );
}

/*
 * Arriving here from the Research tab's "no model" panel. Without this the
 * button dropped the instructor at the top of a seven-card page with no
 * indication which card they had been sent to.
 */
let pendingFocus = null;
export function focusAiSetup() { pendingFocus = 'ai-setup'; }

function applyPendingFocus(root) {
  if (!pendingFocus) return;
  const target = root.querySelector(`#${pendingFocus}`);
  pendingFocus = null;
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1800);
  });
}

/*
 * Say where an endpoint actually points, rather than printing a promise the
 * code does not check. An empty box gets the default reassurance, because
 * nothing has been chosen yet and nothing is being sent.
 */
function endpointBanner(endpoint, what) {
  if (!String(endpoint || '').trim()) {
    return el('p', { class: 'hint', text: 'Put the address of the server below. Anything starting http://localhost is a program on this computer, and the text goes no further than that.' });
  }
  const d = describeEndpoint(endpoint, { what });
  return banner(d.tone || 'warn', d.text);
}

/*
 * A hosted model's name pointed at a local server.
 *
 * "claude-sonnet-5" with the provider set to Local is a contradiction: Ollama
 * has never heard of it, so the request fails with a bare "model not found".
 * Worse than the error is the belief behind it — that Claude is running on
 * this computer. It is not, and it cannot; those models only exist behind
 * their vendor's API. Say so before the instructor sends anything.
 */
const HOSTED_NAME = /^(claude|gpt|o[1-4]|gemini|grok|mistral-large|command-r)/i;

function modelNameWarning(ai) {
  if (ai.provider !== 'local') return null;
  const name = String(ai.model || '').trim();
  if (!name || !HOSTED_NAME.test(name)) return null;
  return banner('warn',
    `“${name}” is a hosted model — it runs on its vendor's servers and cannot be installed on this computer, so a local server will answer "model not found". `
    + 'Put the name of a model you have actually pulled here, such as llama3.1:8b. '
    + 'If you meant to use Claude, switch the provider above to Claude API — and note that this sends your text to Anthropic.');
}

/*
 * The lock, at the top of Settings because it governs everything below it.
 *
 * Switching it off is deliberately a two-step confirmation naming what
 * becomes possible, because the thing being turned off is the guarantee the
 * instructor was given about their students' work.
 */
function offlineLockCard(s, root, ctx) {
  const on = s.settings.offlineLock !== false;
  return el('div', { class: 'card', id: 'offline-lock', style: `border-color:var(--${on ? 'good' : 'high'})` },
    el('div', { class: 'row', style: 'align-items:center;gap:8px' },
      chip(on ? 'locked' : 'UNLOCKED', on ? 'good' : 'high'),
      el('h2', { style: 'margin:0', text: 'Lock to this computer' })
    ),
    on
      ? el('div', {},
          el('p', { text: 'Nothing can leave this machine. Student names, marks, thesis text and everything else stay here, and no button in this app can send them anywhere — the block is on the network itself, not on the buttons, so a mis-typed address or a wrong click cannot get past it.' }),
          el('p', { class: 'hint', text: 'A model or a grammar server running on this computer still works: localhost is this computer. What is refused is any address that is not.' }),
          el('p', { class: 'hint', text: 'Switched off, these become possible: the Claude API (which sends the whole thesis to Anthropic), scholarly lookups that send a student’s references and thesis statement to Crossref and OpenAlex, and the Research tab’s searches.' })
        )
      : el('div', {},
          banner('warn', 'The lock is off. Citation checks and prior-work lookups send parts of a student’s thesis to Crossref and OpenAlex, and the Claude API option sends the whole text to Anthropic. Turn the lock back on unless you have a reason not to.')
        ),
    el('div', { class: 'row', style: 'margin-top:10px' },
      on
        ? el('button', {
            text: 'Unlock online features…',
            onClick: async () => {
              const ok = await confirmDialog(
                'Allow this app to reach the internet?',
                'While unlocked, the Research tab can search online, citation checking can send a student’s reference list and thesis statement to Crossref and OpenAlex, and the Claude API option becomes available — that one sends the entire thesis to Anthropic.\n\nThe lock exists so that no wrong button can leak student work. Turn it off only if you need an online lookup, and turn it back on afterwards.',
                'Unlock'
              );
              if (ok) { updateSettings({ offlineLock: false }); toast('Online features unlocked. Student work can now leave this computer.', 'error'); }
            }
          })
        : el('button', {
            class: 'primary',
            text: 'Lock it again',
            onClick: () => { updateSettings({ offlineLock: true }); toast('Locked. Nothing can leave this computer.', 'good'); }
          })
    )
  );
}
