import { el, mount, sheet, field, toast } from '../ui.js';
import { getState, setSettings, setAi } from '../store.js';
import { isConfigured } from '../ai.js';

export default function render(root, ctx) {
  const s = getState();
  const ai = s.settings.ai;
  mount(root,
    el('h1', { text: 'Settings' }),
    el('p', { class: 'lede', text: 'Your library and your drafts live in this browser. The catalogue searches send only the words you type. A model sees only what a tab tells you it is sending.' }),

    sheet('You',
      field('Contact email', el('input', { value: s.settings.contactEmail, placeholder: 'you@university.edu',
        onChange: (e) => setSettings({ contactEmail: e.target.value.trim() }) }),
        'Sent to OpenAlex and Crossref only, to get into their faster pool. Nowhere else.')
    ),

    sheet('Model',
      el('p', { text: 'Needed by three things: the write-up on the Gaps tab, the argument finder, and expanding an outline. Everything else — search, the coverage map, the argument evaluation, Bloom, the prose check — runs here with no model at all.' }),
      el('label', { class: 'row', style: 'margin-bottom:14px' },
        el('input', { type: 'checkbox', checked: ai.enabled, style: 'width:auto', onChange: (e) => setAi({ enabled: e.target.checked }) }),
        el('span', { text: 'Use a model' })),
      el('div', { class: 'cols' },
        field('Where it runs', el('select', { onChange: (e) => setAi({ provider: e.target.value }) },
          el('option', { value: 'local', selected: ai.provider === 'local', text: 'On this computer (Ollama or similar)' }),
          el('option', { value: 'anthropic', selected: ai.provider === 'anthropic', text: 'Claude API (sends text to Anthropic)' }))),
        field('Model name', el('input', { value: ai.model, placeholder: ai.provider === 'local' ? 'llama3.1:8b' : 'claude-opus-5',
          onChange: (e) => setAi({ model: e.target.value.trim() }) }))),
      ai.provider === 'local'
        ? field('Address', el('input', { value: ai.endpoint, placeholder: 'http://localhost:11434/v1',
            onChange: (e) => setAi({ endpoint: e.target.value.trim() }) }),
            'An OpenAI-compatible endpoint. Ollama serves one at this address by default.')
        : field('API key', el('input', { type: 'password', value: ai.apiKey, placeholder: 'sk-ant-…',
            onChange: (e) => setAi({ apiKey: e.target.value.trim() }) }),
            'Kept in this browser. With this provider the text of your notes and sources is sent to Anthropic when you press a Write button.'),
      el('p', { class: 'note', text: isConfigured(s.settings) ? 'Set up.' : 'Not set up — the three tabs above will say so rather than failing.' })
    ),

    sheet('Your data',
      el('div', { class: 'row' },
        el('button', { class: 'sm', text: 'Export everything', onClick: () => {
          const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
          const a = el('a', { href: URL.createObjectURL(blob), download: `scholar-desk-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a); a.click(); a.remove();
        } }),
        el('button', { class: 'sm', text: 'Import a backup', onClick: () => document.getElementById('settings-import').click() }),
        el('input', { id: 'settings-import', type: 'file', accept: '.json', style: 'display:none', onChange: async (e) => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const data = JSON.parse(await f.text());
            if (!data || !Array.isArray(data.sources)) throw new Error('That file is not a Scholar Desk backup.');
            localStorage.setItem('scholar-desk:v1', JSON.stringify(data));
            location.reload();
          } catch (err) { toast(err.message); }
        } })),
      el('p', { class: 'note', style: 'margin-top:10px', text: `${s.sources.length} source(s), ${s.drafts.length} draft(s). Clearing this browser's data erases both, so export now and then.` })
    )
  );
}
