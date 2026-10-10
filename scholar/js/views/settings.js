/*
 * settings.js — edited as a draft, applied on purpose.
 *
 * It used to write every keystroke's blur straight into the store and say
 * nothing. Saving invisibly is the same as not saving as far as the person
 * typing is concerned: there is no moment where the app agrees that it heard
 * you, so the only way to find out whether the address took was to go to
 * another tab and fail there. Now the form holds a draft, Apply writes it,
 * and the page says what changed and what it is now using.
 */
import { el, mount, sheet, field, toast } from '../ui.js';
import { getState, setSettings, setAi, setLanguageTool } from '../store.js';
import { isConfigured, testModel, listModels } from '../ai.js';
import { LANGUAGES, isConfigured as ltConfigured, testConnection as testLt } from '../analysis/languagetool.js';

/* The working copy, kept across redraws of this view. */
const S = { howTo: false, models: null, listing: false };
let draft = null;
let applied = null;   /* what the last Apply did, shown until the next edit */
let probe = null;     /* the result of the model connection test */
let ltProbe = null;   /* the result of the LanguageTool test */
let testing = false;
let ltTesting = false;

const clone = (s) => ({ contactEmail: s.contactEmail || '', ai: { ...s.ai }, languageTool: { ...s.languageTool } });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function render(root, ctx) {
  const saved = getState().settings;
  if (!draft) draft = clone(saved);
  const d = draft;
  const dirty = !same(d, clone(saved));

  /* Any edit invalidates the previous verdicts: they describe the old
     settings, and leaving them up would have the page vouching for something
     that is no longer what the boxes say. */
  const touch = (fn) => { fn(); applied = null; probe = null; ltProbe = null; render(root, ctx); };

  /* The listing describes the saved endpoint, so an edit invalidates it. */

  mount(root,
    el('h1', { text: 'Settings' }),
    el('p', { class: 'lede', text: 'Your library and your drafts live in this browser. The catalogue searches send only the words you type. A model sees only what a tab tells you it is sending.' }),

    sheet('You',
      field('Contact email', el('input', {
        value: d.contactEmail, placeholder: 'you@university.edu',
        onInput: (e) => { d.contactEmail = e.target.value; applied = null; }
      }), 'Sent to OpenAlex and Crossref only, to get into their faster pool. Nowhere else. It also makes them answer faster, which is worth the thirty seconds.')
    ),

    sheet('Model',
      el('p', { text: 'Three things use it, and nothing else does:' }),
      el('ul', { class: 'uses' },
        el('li', {}, el('a', { href: '#gaps', onClick: (e) => { e.preventDefault(); ctx.go('gaps'); }, text: 'Gaps' }),
          ' — turning the counted empty crossings into research questions. The counting happens without it.'),
        el('li', {}, el('a', { href: '#write', onClick: (e) => { e.preventDefault(); ctx.go('write'); }, text: 'Write' }),
          ' — finding lines of argument in the sources, at step 1.'),
        el('li', {}, el('a', { href: '#write', onClick: (e) => { e.preventDefault(); ctx.go('write'); }, text: 'Write' }),
          ' — expanding a section from notes you have written, at step 3.'),
      ),
      el('p', { class: 'note', text: 'Everything else runs with no model at all: the catalogue searches, finding a person, the coverage map and the counted crossings, the argument evaluation, Bloom, the prose check, every reference format, and the whole Grammar tab, which imports nothing from the model layer and cannot be made to use one.' }),
      el('label', { class: 'row', style: 'margin-bottom:14px' },
        el('input', { type: 'checkbox', checked: d.ai.enabled, style: 'width:auto',
          onChange: (e) => touch(() => { d.ai.enabled = e.target.checked; }) }),
        el('span', { text: 'Use a model' })),
      el('div', { class: 'cols' },
        field('Where it runs', el('select', { onChange: (e) => touch(() => { d.ai.provider = e.target.value; }) },
          el('option', { value: 'local', selected: d.ai.provider === 'local', text: 'On this computer (Ollama or similar)' }),
          el('option', { value: 'anthropic', selected: d.ai.provider === 'anthropic', text: 'Claude API (sends text to Anthropic)' }))),
        field('Model name', el('div', {},
          el('input', {
            value: d.ai.model, placeholder: d.ai.provider === 'local' ? 'llama3.1:8b' : 'claude-opus-5',
            onInput: (e) => { d.ai.model = e.target.value; applied = null; } }),
          el('div', { class: 'row tight', style: 'margin-top:6px' },
            el('button', { class: 'bare sm', type: 'button', disabled: S.listing,
              text: S.listing ? 'Asking…' : (d.ai.provider === 'local' ? 'What is installed?' : 'Which models can this key use?'),
              onClick: () => showModels(root, ctx) }),
            S.listing ? el('span', { class: 'note' }, el('span', { class: 'spin' })) : null)))),

      /*
       * The models actually there, as buttons.
       *
       * The box has to stay free text — every server names its models
       * differently and a fixed list would be wrong within a month — but a
       * name typed from memory fails silently, at the moment you press a
       * Write button, long after the mistake. One click fills it with
       * something that exists.
       */
      S.models ? el('div', { class: S.models.ok ? 'verdict' : 'verdict bad' },
        S.models.ok
          ? el('div', {},
              el('strong', { text: `${S.models.models.length} model${S.models.models.length === 1 ? '' : 's'} at ${S.models.from}. ` }),
              el('span', { class: 'note', text: 'Click one to use it.' }),
              el('div', { class: 'row tight', style: 'margin-top:8px' },
                S.models.models.map((m) => el('button', {
                  class: 'sm', type: 'button',
                  'aria-pressed': String(d.ai.model === m.name),
                  title: m.note || '',
                  onClick: () => touch(() => { d.ai.model = m.name; })
                }, el('span', { class: 'model-name', text: m.name }),
                   m.note ? el('span', { class: 'note model-note', text: m.note }) : null))))
          : el('div', {},
              el('strong', { text: 'Could not list them. ' }),
              el('span', { text: S.models.detail }))) : null,
      d.ai.provider === 'local'
        ? field('Address', el('input', { value: d.ai.endpoint, placeholder: 'http://localhost:11434/v1',
            onInput: (e) => { d.ai.endpoint = e.target.value; applied = null; } }),
            'An OpenAI-compatible endpoint. Ollama serves one at this address by default.')
        : field('API key', el('input', { type: 'password', value: d.ai.apiKey, placeholder: 'sk-ant-…',
            onInput: (e) => { d.ai.apiKey = e.target.value; applied = null; } }),
            'Kept in this browser. With this provider the text of your notes and sources is sent to Anthropic when you press a Write button.'),

      el('div', { class: 'row', style: 'margin-top:16px' },
        el('button', { class: 'sm', disabled: dirty || testing, text: testing ? 'Testing…' : 'Test the connection',
          onClick: () => runTest(root, ctx) }),
        testing ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ' asking it to answer') : null,
        dirty ? el('span', { class: 'note', text: 'Apply your changes first, then test what you applied.' }) : null
      ),

      probe ? el('div', { class: probe.ok ? 'verdict' : 'verdict bad', role: 'status' },
        el('strong', { text: probe.ok ? 'It answered.' : 'It did not answer.' }), ' ',
        el('span', { text: probe.detail })) : null,

      el('p', { class: 'note', style: 'margin-top:12px', text: inUse(saved) })
    ),

    sheet('Grammar checking',
      el('p', { text: 'The Grammar tab runs its own rules with nothing installed. LanguageTool is an optional second pass that catches a wider range, and the two are merged with duplicates dropped.' }),
      el('label', { class: 'row', style: 'margin-bottom:14px' },
        el('input', { type: 'checkbox', checked: d.languageTool.enabled, style: 'width:auto',
          onChange: (e) => touch(() => { d.languageTool.enabled = e.target.checked; }) }),
        el('span', { text: 'Also use LanguageTool' })),
      el('div', { class: 'cols' },
        field('Address', el('input', { value: d.languageTool.endpoint, placeholder: 'http://localhost:8081',
          onInput: (e) => { d.languageTool.endpoint = e.target.value; applied = null; } }),
          'A LanguageTool server. Run one on this computer and your text stays here; point it at api.languagetool.org and every paragraph you check is sent to them.'),
        field('English', el('select', { onChange: (e) => touch(() => { d.languageTool.language = e.target.value; }) },
          LANGUAGES.map((l) => el('option', { value: l.id, selected: d.languageTool.language === l.id, text: l.label }))))),
      el('div', { class: 'row', style: 'margin-top:14px' },
        el('button', { class: 'sm', disabled: dirty || ltTesting, text: ltTesting ? 'Testing…' : 'Test LanguageTool',
          onClick: () => runLtTest(root, ctx) }),
        ltTesting ? el('span', { class: 'note' }, el('span', { class: 'spin' }), ' asking the server') : null),
      ltProbe ? el('div', { class: ltProbe.ok ? 'verdict' : 'verdict bad', role: 'status' },
        el('strong', { text: ltProbe.ok ? 'It answered.' : 'It did not answer.' }), ' ',
        el('span', { text: ltProbe.detail })) : null,
      el('div', { class: 'note', style: 'margin-top:12px' }, ...ltStatus(saved)),
      howToRunIt(root, ctx)
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
      el('p', { class: 'note', style: 'margin-top:10px', text: `${getState().sources.length} source(s), ${getState().drafts.length} draft(s). Clearing this browser's data erases both, so export now and then.` })
    ),

    /*
     * One Apply, for the whole page.
     *
     * It was inside the Model section, which was wrong in two ways: it saves
     * the contact address and the LanguageTool settings as well, so its
     * placement claimed a scope it did not have, and anyone editing the
     * address at the top had to scroll down into an unrelated section to
     * find the button that saves it.
     *
     * It now sits at the end and sticks to the bottom of the window while
     * anything is unsaved, so it is reachable from wherever you are typing
     * and disappears the moment there is nothing to do.
     */
    dirty
      ? el('div', { class: 'applybar', role: 'region', 'aria-label': 'Unsaved changes' },
          el('span', { class: 'what', text: pendingSummary(clone(saved), d) }),
          el('div', { class: 'spacer' }),
          el('button', { class: 'bare sm', text: 'Discard', onClick: () => { draft = clone(saved); applied = null; probe = null; ltProbe = null; render(root, ctx); } }),
          el('button', { class: 'solid', text: 'Apply changes', onClick: () => apply(root, ctx) }))
      : applied
        ? el('div', { class: 'applybar done', role: 'status' },
            el('strong', { text: 'Applied. ' }), el('span', { class: 'what', text: applied }))
        : null
  );
}

/* What is waiting to be saved, named rather than counted: "3 changes" tells
   you nothing about whether you meant them. */
function pendingSummary(before, after) {
  const moved = [];
  if (before.contactEmail !== after.contactEmail) moved.push('contact address');
  if (before.ai.enabled !== after.ai.enabled) moved.push(after.ai.enabled ? 'model switched on' : 'model switched off');
  if (before.ai.provider !== after.ai.provider) moved.push('where the model runs');
  if (before.ai.model !== after.ai.model) moved.push('model name');
  if (before.ai.endpoint !== after.ai.endpoint) moved.push('model address');
  if (before.ai.apiKey !== after.ai.apiKey) moved.push('API key');
  if (before.languageTool.enabled !== after.languageTool.enabled) moved.push(after.languageTool.enabled ? 'LanguageTool on' : 'LanguageTool off');
  if (before.languageTool.endpoint !== after.languageTool.endpoint) moved.push('LanguageTool address');
  if (before.languageTool.language !== after.languageTool.language) moved.push('English variant');
  return `Not saved yet: ${moved.join(', ')}.`;
}

/* Local or not, said as a fact about the address rather than a reassurance. */
function ltStatus(saved) {
  if (!ltConfigured(saved)) return ['Not in use. The Grammar tab still works; it just catches less.'];
  const endpoint = String(saved.languageTool.endpoint || '');
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(endpoint);
  return local
    ? [`In use at ${endpoint}, ${saved.languageTool.language}. That address is this computer, so nothing you check is sent anywhere.`]
    : [el('strong', { text: 'In use at ' }), el('strong', { text: endpoint }),
       el('span', { text: `, ${saved.languageTool.language}. That is not this computer: everything you check on the Grammar tab is sent there.` })];
}

/*
 * How to have LanguageTool without sending anything out.
 *
 * This is the whole point of the setting, and the answer is to run the
 * server yourself. Both routes need something installed, which is the real
 * cost and is stated rather than buried: Docker, or Java. Neither is
 * required to use this app — the built-in rules never needed either.
 *
 * Written out in the app rather than linked, because a link to instructions
 * is one more thing to be out of date, and these two commands have not
 * changed in years.
 */
function howToRunIt(root, ctx) {
  if (!S.howTo) {
    return el('p', { style: 'margin-top:8px' },
      el('button', { class: 'bare sm', text: 'How do I run it on this computer?',
        onClick: () => { S.howTo = true; render(root, ctx); } }));
  }
  return el('div', { class: 'item loose', style: 'margin-top:12px' },
    el('div', { class: 'title', style: 'font-size:16px', text: 'Running LanguageTool on this computer' }),
    el('p', { class: 'body', text: 'Then nothing you check leaves the machine, and you still get the wider rule set. Either route works; pick whichever you already have.' }),

    el('h2', { style: 'margin-top:14px', text: 'With Docker' }),
    el('p', { class: 'body', text: 'One command, nothing else to install, and it keeps running until you stop it:' }),
    el('pre', { class: 'why', text: 'docker run -d --name languagetool -p 8081:8010 erikvl87/languagetool' }),
    el('p', { class: 'note', text: 'Stop it with  docker stop languagetool,  start it again with  docker start languagetool.' }),

    el('h2', { style: 'margin-top:14px', text: 'With Java' }),
    el('p', { class: 'body' },
      'Three steps. First check you have Java at all \u2014 in a terminal, ',
      el('code', { text: 'java -version' }),
      '. It needs to say 17 or higher. If the command is not found, install it from ',
      el('a', { href: 'https://adoptium.net/', target: '_blank', rel: 'noopener', text: 'adoptium.net' }),
      ' and take the LTS build for your machine.'),
    el('p', { class: 'body', style: 'margin-top:8px' },
      'Second, download ',
      el('a', { href: 'https://languagetool.org/download/LanguageTool-stable.zip', target: '_blank', rel: 'noopener',
        text: 'LanguageTool-stable.zip' }),
      '. That is the one you want: the standalone desktop package, not the browser add-on and not the Office extension, '
      + 'and the link always points at the current release so it does not go stale. It is around 200 MB because the '
      + 'dictionaries come with it. Unzip it and you get a folder named LanguageTool-6.x or similar.'),
    el('p', { class: 'body', style: 'margin-top:8px' },
      'Third, open a terminal in that folder and run:'),
    el('pre', { class: 'why', text: 'cd ~/Downloads/LanguageTool-6.6\njava -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin "*"' }),
    el('p', { class: 'note', text: 'Change the folder name to match what you actually unzipped. The right folder is the one with languagetool-server.jar directly inside it \u2014 if the command says it cannot find that file, you are one level out.' }),
    el('p', { class: 'note', style: 'margin-top:4px', text: '--allow-origin is what lets this page talk to it; without it the browser refuses and the Grammar tab reports a server that did not answer. If your version objects to the "*", try the flag on its own.' }),
    el('p', { class: 'note', style: 'margin-top:4px', text: 'Leave that terminal window open while you work \u2014 closing it stops the server. It prints "Server started" when it is ready.' }),

    el('p', { class: 'body', style: 'margin-top:14px', text: 'Either way, leave the address above as http://localhost:8081, press Apply, then Test LanguageTool. The Grammar tab will say it is running on this computer.' }),
    el('p', { class: 'note', text: 'Worth knowing: the built-in rules need none of this and never send anything. LanguageTool catches more, and this is the price.' }),
    el('div', { style: 'margin-top:10px' },
      el('button', { class: 'bare sm', text: 'Hide this', onClick: () => { S.howTo = false; render(root, ctx); } }))
  );
}

/* What the app is actually running on, as opposed to what is in the boxes. */
function inUse(saved) {
  if (!saved.ai.enabled) return 'No model in use. The three tabs that need one will say so rather than failing.';
  if (!isConfigured(saved)) return 'Switched on but incomplete, so those three tabs will still say they have no model.';
  return saved.ai.provider === 'local'
    ? `In use: ${saved.ai.model || 'the endpoint default'} at ${saved.ai.endpoint}. Nothing leaves this computer.`
    : `In use: ${saved.ai.model || 'the API default'} at Anthropic. Your notes and sources are sent there when you press a Write button.`;
}

function apply(root, ctx) {
  const before = clone(getState().settings);
  const d = draft;
  setSettings({ contactEmail: String(d.contactEmail || '').trim() });
  setLanguageTool({
    enabled: d.languageTool.enabled,
    endpoint: String(d.languageTool.endpoint || '').trim(),
    language: d.languageTool.language
  });
  setAi({
    enabled: d.ai.enabled,
    provider: d.ai.provider,
    model: String(d.ai.model || '').trim(),
    endpoint: String(d.ai.endpoint || '').trim(),
    apiKey: String(d.ai.apiKey || '').trim()
  });
  draft = clone(getState().settings);
  applied = describe(before, clone(getState().settings));
  probe = null;
  render(root, ctx);
}

/*
 * Name what moved, rather than saying "Saved".
 *
 * "Saved" is the claim the user is checking; repeating it proves nothing. A
 * list of the fields that changed is checkable against what they just typed.
 */
function describe(before, after) {
  const moved = [];
  if (before.contactEmail !== after.contactEmail) {
    moved.push(after.contactEmail ? `contact address is now ${after.contactEmail}` : 'contact address cleared');
  }
  if (before.ai.enabled !== after.ai.enabled) moved.push(after.ai.enabled ? 'model switched on' : 'model switched off');
  if (before.ai.provider !== after.ai.provider) moved.push(`now using ${after.ai.provider === 'local' ? 'a model on this computer' : 'the Claude API'}`);
  if (before.ai.model !== after.ai.model) moved.push(after.ai.model ? `model name is now ${after.ai.model}` : 'model name cleared');
  if (before.ai.endpoint !== after.ai.endpoint) moved.push(`address is now ${after.ai.endpoint || '(empty)'}`);
  if (before.ai.apiKey !== after.ai.apiKey) moved.push(after.ai.apiKey ? 'API key stored in this browser' : 'API key cleared');
  if (before.languageTool.enabled !== after.languageTool.enabled) moved.push(after.languageTool.enabled ? 'LanguageTool switched on' : 'LanguageTool switched off');
  if (before.languageTool.endpoint !== after.languageTool.endpoint) moved.push(`LanguageTool address is now ${after.languageTool.endpoint || '(empty)'}`);
  if (before.languageTool.language !== after.languageTool.language) moved.push(`LanguageTool set to ${after.languageTool.language}`);
  if (!moved.length) return 'Nothing was different, so nothing changed.';
  return `${moved.join('; ')}.`;
}

async function runTest(root, ctx) {
  testing = true;
  probe = null;
  render(root, ctx);
  try {
    probe = await testModel(getState().settings);
  } catch (err) {
    probe = { ok: false, detail: String(err.message || err) };
  }
  testing = false;
  render(root, ctx);
}

async function runLtTest(root, ctx) {
  ltTesting = true;
  ltProbe = null;
  render(root, ctx);
  try {
    ltProbe = await testLt(getState().settings);
  } catch (err) {
    ltProbe = { ok: false, detail: String(err.message || err) };
  }
  ltTesting = false;
  render(root, ctx);
}

/*
 * Ask the server what it has.
 *
 * Against the draft rather than the saved settings, so you can type an
 * address and see what is there before committing to it — which is the
 * order anyone actually does this in.
 */
async function showModels(root, ctx) {
  S.listing = true;
  S.models = null;
  render(root, ctx);
  try {
    S.models = await listModels({ ai: draft.ai });
  } catch (err) {
    S.models = { ok: false, detail: String(err.message || err) };
  }
  S.listing = false;
  render(root, ctx);
}
