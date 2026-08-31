/*
 * prepare.js — copy the web app into desktop/app/ before packaging.
 *
 * The desktop build is a wrapper, not a fork: there is exactly one copy of
 * the application code, one directory up. Copying it at build time keeps the
 * two from drifting, which is what happens the moment anyone edits a
 * duplicated file.
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..');
const DEST = path.join(__dirname, 'app');
const PARTS = ['index.html', 'styles.css', 'js', 'vendor', 'samples', 'GUIDE.md'];

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const part of PARTS) {
  const from = path.join(SRC, part);
  if (!fs.existsSync(from)) { console.warn(`  skipped (missing): ${part}`); continue; }
  fs.cpSync(from, path.join(DEST, part), { recursive: true });
}
console.log(`Copied ${PARTS.length} item(s) into desktop/app/`);
