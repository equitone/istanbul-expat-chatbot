#!/usr/bin/env node
/*
 * bundle.js — fold the app into one HTML file that opens by double-clicking.
 *
 * ES modules cannot load over file://. The browser refuses them as a cross
 * origin request, so opening index.html from the Finder gives a blank page
 * and nothing in the interface explains why. The served version is fine, but
 * it needs a runtime, and a Mac with no developer tools has no Python, no
 * Node, no Ruby and no PHP — at which point the app simply cannot be started.
 *
 * So this produces ScholarDesk.html: every module, the stylesheet and the
 * entry point in a single file with no external request of any kind. Double
 * click it and it runs.
 *
 * It is a real resolver rather than a concatenation, because concatenating
 * would not work: half the views declare a module-level `const S`, and
 * flattening them into one scope would collide immediately. Each module is
 * wrapped in its own function and memoised, which is what the module system
 * does anyway.
 */
const fs = require('fs');
const path = require('path');

/*
 *   node bundle.js [out.html] [source-folder]
 *
 * The source folder is an argument so package.sh can bundle its own staged
 * copy, the one whose version.js has already been stamped, rather than the
 * working tree. Bundling the working tree there would give the single file a
 * different build marker from the served version beside it in the same zip.
 */
const ROOT = path.resolve(process.argv[3] || __dirname);
const ENTRY = 'js/app.js';

/* The single file has no folder to be dated by, so it carries its own stamp.
   Only when the source is unstamped: a staged build keeps the one it was
   given, so both copies in a release agree. */
const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');

const rel = (from, spec) => path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, from)), spec)).split(path.sep).join('/');

/* Collect the module graph, deepest first. */
const seen = new Map();
function load(id) {
  if (seen.has(id)) return;
  const file = path.join(ROOT, id);
  if (!fs.existsSync(file)) throw new Error(`bundle: missing module ${id}`);
  let src = fs.readFileSync(file, 'utf8');
  if (id === 'js/version.js' && /'dev'|"dev"/.test(src)) src = `export const BUILD = ${JSON.stringify(BUILD)};\n`;
  seen.set(id, src);
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+[^;'"]*from\s*['"]([^'"]+)['"]/g)) load(rel(id, m[1]));
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) load(rel(id, m[1]));
}
load(ENTRY);

/*
 * Rewrite one module's source into a factory body. Only the import/export
 * forms this codebase actually uses are handled, and anything unrecognised
 * throws rather than being silently dropped — a bundler that quietly loses an
 * export produces a blank page with no error, which is the failure this whole
 * file exists to remove.
 */
function transform(id, src) {
  const exported = new Map();   /* local name -> exported name */
  let out = src;

  /* import { a, b as c } from './x.js' */
  out = out.replace(/(?:^|\n)[ \t]*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) => {
    const binds = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const [orig, as] = n.split(/\s+as\s+/).map((x) => x.trim());
      return as ? `${orig}: ${as}` : orig;
    });
    return `\nconst { ${binds.join(', ')} } = __req(${JSON.stringify(rel(id, spec))});`;
  });

  /* import Default from './x.js' */
  out = out.replace(/(?:^|\n)[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"];?/g,
    (_, name, spec) => `\nconst ${name} = __req(${JSON.stringify(rel(id, spec))}).default;`);

  /* bare side-effect import */
  out = out.replace(/(?:^|\n)[ \t]*import\s*['"]([^'"]+)['"];?/g,
    (_, spec) => `\n__req(${JSON.stringify(rel(id, spec))});`);

  /* dynamic import('./x.js') — the views use it to defer the file readers */
  out = out.replace(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    (_, spec) => `Promise.resolve(__req(${JSON.stringify(rel(id, spec))}))`);

  /* export default function name() {} */
  out = out.replace(/(?:^|\n)[ \t]*export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g, (_, name) => {
    exported.set(name, 'default');
    return `\nfunction ${name}`;
  });

  /* export function / const / let / class */
  out = out.replace(/(?:^|\n)[ \t]*export\s+(async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
    (_, asyncKw, kind, name) => {
      exported.set(name, name);
      return `\n${asyncKw || ''}${kind} ${name}`;
    });

  /* export { a, b as c } */
  out = out.replace(/(?:^|\n)[ \t]*export\s*\{([^}]*)\};?/g, (_, names) => {
    names.split(',').map((n) => n.trim()).filter(Boolean).forEach((n) => {
      const [orig, as] = n.split(/\s+as\s+/).map((x) => x.trim());
      exported.set(orig, as || orig);
    });
    return '';
  });

  const leftover = out.match(/(?:^|\n)[ \t]*(?:import|export)\b[^\n]*/);
  if (leftover) throw new Error(`bundle: unhandled module syntax in ${id}: ${leftover[0].trim().slice(0, 90)}`);

  const pairs = [...exported.entries()].map(([local, name]) => (local === name ? local : `${name}: ${local}`));
  return `${out}\nreturn { ${pairs.join(', ')} };`;
}

const modules = [...seen.entries()]
  .map(([id, src]) => `  ${JSON.stringify(id)}: function () {\n${transform(id, src)}\n  },`)
  .join('\n');

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/*
 * netguard.js is a classic script, not a module, and it has to stay one: it
 * must run before anything else. So its source is inlined where its tag was
 * rather than going through the module graph, or the single-file build
 * would ship a dead offline switch.
 */
const netguard = fs.readFileSync(path.join(ROOT, 'js/netguard.js'), 'utf8');

/*
 * The spelling engine and the dictionaries go in the head too, and for a
 * reason that is not a preference: a page opened from a folder cannot load
 * an ES module and cannot fetch its own neighbours. Served, the engine is a
 * script tag and the dictionary is fetched on first use. Here there is
 * nothing to fetch, so both dictionaries are carried in the file.
 *
 * That is about a megabyte of word list in a local file that loads from
 * disk in milliseconds, which is the right trade against the alternative:
 * a single-file build whose spelling check cannot run. The analyser reads
 * them off window.__DICTS, and the check below fails the build if they are
 * not there, because the failure would otherwise be a silent one that only
 * shows up as a document with no spelling mistakes in it.
 */
const nspell = fs.readFileSync(path.join(ROOT, 'vendor/nspell.global.js'), 'utf8');
const dicts = {};
for (const id of ['en_US', 'en_GB']) {
  dicts[id] = {
    aff: fs.readFileSync(path.join(ROOT, `vendor/dict/${id}.aff`), 'utf8'),
    dic: fs.readFileSync(path.join(ROOT, `vendor/dict/${id}.dic`), 'utf8')
  };
}
const dictScript = `window.__DICTS = ${JSON.stringify(dicts)};`;

const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<link rel="stylesheet"[^>]*>/, '')
  .replace(/<script src="js\/netguard\.js"><\/script>/, `<script>\n${netguard}\n</script>`)
  .replace(/<script src="vendor\/nspell\.global\.js"><\/script>/,
    `<script>\n${nspell}\n</script>\n<script>${dictScript}</script>`)
  .replace(/<title>[\s\S]*?<\/title>/, '<title>Scholar Desk</title>');
if (!/__offlineLock/.test(head)) throw new Error('bundle: netguard was not inlined into the head');
if (!/__nspell\s*=/.test(head)) throw new Error('bundle: the spelling engine was not inlined into the head');
if (!/__DICTS/.test(head)) throw new Error('bundle: the dictionaries were not inlined into the head');
for (const id of ['en_US', 'en_GB']) {
  if (!head.includes(`"${id}"`)) throw new Error(`bundle: the ${id} dictionary is missing from the head`);
}
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const outHtml = `<!doctype html>
<html lang="en">
<head>
${head.trim()}
<style>
${css}
</style>
</head>
<body>
${body.trim()}
<script>
/* Scholar Desk, bundled into one file so it runs from the Finder with no
   server and no runtime installed. Generated by bundle.js — edit the modules
   under js/ and rebuild, never this file. */
(function () {
  'use strict';
  var __defs = {
${modules}
  };
  var __cache = {};
  function __req(id) {
    if (__cache[id]) return __cache[id];
    if (!__defs[id]) throw new Error('module not bundled: ' + id);
    var exports = __defs[id].call(null);
    __cache[id] = exports;
    return exports;
  }
  __req(${JSON.stringify(ENTRY)});
})();
</script>
</body>
</html>
`;

const target = process.argv[2] || path.join(ROOT, 'ScholarDesk.html');
fs.writeFileSync(target, outHtml);
console.log(`Bundled ${seen.size} modules -> ${target} (${Math.round(outHtml.length / 1024)}K)`);
