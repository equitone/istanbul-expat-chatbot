import { el, mount, field, table, toast, confirmDialog, banner, int, num, chip } from '../ui.js';
import {
  getState, updateSettings, exportBackup, importBackup, wipeAll, storageEstimate, update
} from '../store.js';
import { DEFAULT_LETTER_SCHEME } from '../stats.js';
import { downloadText } from '../io/files.js';
import { DEFAULT_MODEL, testConnection } from '../analysis/ai.js';

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

    el('div', { class: 'card' },
      el('h2', { text: 'AI review (optional, off by default)' }),
      el('p', { text: 'Everything else in this app runs locally. This is the one feature that can send text elsewhere — so it stays off until you turn it on, and it tells you where the text goes.' }),
      el('label', { class: 'inline' },
        el('input', { type: 'checkbox', checked: ai.enabled, onChange: (e) => setAi({ enabled: e.target.checked }) }),
        el('span', { text: 'Enable AI review' })
      ),
      ai.enabled
        ? el('div', {},
            el('div', { class: 'grid cols-2' },
              field('Provider', el('select', { onChange: (e) => setAi({ provider: e.target.value }) },
                el('option', { value: 'local', selected: ai.provider === 'local', text: 'Local model (nothing leaves your machine)' }),
                el('option', { value: 'anthropic', selected: ai.provider === 'anthropic', text: 'Claude API (text is sent to Anthropic)' })
              )),
              field('Model', el('input', {
                value: ai.model || (ai.provider === 'local' ? 'llama3.1' : DEFAULT_MODEL),
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
                  banner('privacy', 'With a local model, the thesis text goes to a server you run — Ollama, LM Studio, llama.cpp or vLLM — and no further. This keeps the privacy guarantee intact.'),
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
          )
        : el('p', { class: 'hint', text: 'While this is off, no text ever leaves this machine except the reference strings you explicitly send with the Deep research buttons.' }),
      ai.enabled
        ? el('div', { style: 'margin-top:12px' },
            el('div', { class: 'row' },
              el('button', { id: 'ai-test', text: 'Test connection', onClick: runTest }),
              el('span', { id: 'ai-test-result', class: 'hint' })
            )
          )
        : null
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
        ['Argument stress', 'Rule engine, offline', 'Measures whether the text does the work of supporting a claim. It cannot judge whether a claim is true.'],
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
