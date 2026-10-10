/*
 * RIS and BibTeX, checked against the shapes the real databases emit.
 * The RIS below is a JSTOR-style export, the BibTeX a Zotero-style one.
 */
import { parseBibliography, parseRis, parseBibtex } from '../js/io/bibliography.js';

let pass = 0; const fails = [];
const is = (label, got, want) => {
  if (String(got) === String(want)) { pass += 1; return; }
  fails.push(`${label}\n     got:  ${got}\n     want: ${want}`);
};

const RIS = `TY  - JOUR
AU  - Seyhan, Azade
AU  - Pamuk, Orhan
TI  - Writing outside the nation: exile and the
      Turkish novel
JO  - Comparative Literature
VL  - 53
IS  - 2
SP  - 101
EP  - 120
PY  - 2001
DO  - https://doi.org/10.1234/cl.2001
AB  - This essay argues that the condition of exile
      shapes the Turkish novel in ways criticism has
      not registered.
KW  - exile
KW  - translation
ER  - 

TY  - CHAP
AU  - Bulson, Eric
TI  - The modern novel and the city
T2  - The Cambridge Companion to the Novel
ED  - Smith, Jane
PB  - Cambridge University Press
SP  - 55
EP  - 70
PY  - 2008
ER  - 
`;

const r = parseRis(RIS);
is('RIS: two records', r.length, 2);
is('RIS: wrapped title rejoined', r[0].title, 'Writing outside the nation: exile and the Turkish novel');
is('RIS: both authors', r[0].authors.join(' | '), 'Seyhan, Azade | Pamuk, Orhan');
is('RIS: year', r[0].year, '2001');
is('RIS: journal', r[0].container, 'Comparative Literature');
is('RIS: page range', r[0].pages, '101-120');
is('RIS: DOI stripped of its prefix', r[0].doi, '10.1234/cl.2001');
is('RIS: wrapped abstract rejoined',
   r[0].abstract,
   'This essay argues that the condition of exile shapes the Turkish novel in ways criticism has not registered.');
is('RIS: keywords', r[0].concepts.join(','), 'exile,translation');
is('RIS: chapter type', r[1].type, 'chapter');
is('RIS: chapter book title', r[1].container, 'The Cambridge Companion to the Novel');
is('RIS: chapter editor', r[1].editors.join(''), 'Smith, Jane');

const BIB = `@article{seyhan2001,
  title = {Writing Outside the {Nation}},
  author = {Seyhan, Azade and Pamuk, Orhan},
  journal = {Comparative Literature},
  volume = {53},
  number = {2},
  pages = {101--120},
  year = {2001},
  doi = {10.1234/cl.2001},
  abstract = {A study of exile, translation {and} the novel.},
  keywords = {exile, translation}
}

@book{pamuk2009,
  title = {The Museum of Innocence},
  author = {Pamuk, Orhan},
  publisher = {Faber and Faber},
  year = {2009}
}
`;

const b = parseBibtex(BIB);
is('BibTeX: two entries', b.length, 2);
is('BibTeX: nested braces kept, outer stripped', b[0].title, 'Writing Outside the Nation');
is('BibTeX: names un-inverted', b[0].authors.join(' | '), 'Azade Seyhan | Orhan Pamuk');
is('BibTeX: en-dash pages normalised', b[0].pages, '101-120');
is('BibTeX: abstract debraced', b[0].abstract, 'A study of exile, translation and the novel.');
is('BibTeX: keywords', b[0].concepts.join(','), 'exile,translation');
is('BibTeX: book type', b[1].type, 'book');
is('BibTeX: publisher not split on "and"', b[1].publisher, 'Faber and Faber');
is('BibTeX: single author', b[1].authors.join(''), 'Orhan Pamuk');
is('BibTeX: url derived from doi', b[0].url, 'https://doi.org/10.1234/cl.2001');

is('sniffs RIS', parseBibliography(RIS).format, 'RIS');
is('sniffs BibTeX', parseBibliography(BIB).format, 'BibTeX');
try { parseBibliography('just some prose, not an export'); fails.push('junk input should have thrown'); }
catch (e) { is('junk input explains itself', /neither RIS nor BibTeX/.test(e.message), 'true'); }

console.log('\n  RIS AND BIBTEX IMPORT\n');
console.log(`  passed: ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log(`\n  FAILED (${fails.length}):`);
  fails.forEach((f) => console.log('   - ' + f));
  process.exitCode = 1;
} else {
  console.log('  Every field read as the databases write it.\n');
}
