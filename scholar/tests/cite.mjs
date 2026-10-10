/*
 * Reference formatting, checked against worked examples from the handbooks.
 *
 * Formatting is rules over fields, so it is testable, and it is exactly the
 * kind of code that is subtly wrong in ways nobody notices until a reviewer
 * does. Each case below is the output the style manual gives for that shape
 * of source.
 */
import { formatReference, stripMarks, parseName, titleCaseMla } from '../js/analysis/cite.js';

let pass = 0; const fails = [];
const is = (label, got, want) => {
  if (got === want) { pass += 1; return; }
  fails.push(`${label}\n     got:  ${got}\n     want: ${want}`);
};

/* ----- names ----- */
is('name: plain', JSON.stringify(parseName('Azade Seyhan')), '{"family":"Seyhan","given":"Azade"}');
is('name: inverted', JSON.stringify(parseName('Seyhan, Azade')), '{"family":"Seyhan","given":"Azade"}');
is('name: one word', JSON.stringify(parseName('Homer')), '{"family":"Homer","given":""}');
is('name: three parts', JSON.stringify(parseName('Gayatri Chakravorty Spivak')), '{"family":"Spivak","given":"Gayatri Chakravorty"}');
is('MLA title case', titleCaseMla('writing outside the nation and the art of the novel'),
   'Writing Outside the Nation and the Art of the Novel');
is('MLA title case keeps acronyms', titleCaseMla('the MLA and its rules'), 'The MLA and Its Rules');

/* ----- journal article ----- */
const art = formatReference({
  type: 'article', authors: ['Azade Seyhan'], year: '2001',
  title: 'Writing outside the nation', container: 'Comparative Literature',
  volume: '53', issue: '2', pages: '101-120', doi: '10.1234/cl.2001'
});
is('APA article', stripMarks(art.apa),
  'Seyhan, A. (2001). Writing outside the nation. Comparative Literature, 53(2), 101-120. https://doi.org/10.1234/cl.2001');
is('MLA article', stripMarks(art.mla),
  'Seyhan, Azade. “Writing Outside the Nation.” Comparative Literature, vol. 53, no. 2, 2001, pp. 101-120. https://doi.org/10.1234/cl.2001.');

/* ----- two and three authors ----- */
const two = formatReference({ type: 'book', authors: ['Azade Seyhan', 'Orhan Pamuk'], year: '2010',
  title: 'A shared book', publisher: 'Princeton University Press' });
is('APA two authors', stripMarks(two.apa),
  'Seyhan, A., & Pamuk, O. (2010). A shared book. Princeton University Press.');
is('MLA two authors', stripMarks(two.mla),
  'Seyhan, Azade, and Orhan Pamuk. A Shared Book. Princeton University Press, 2010.');

const three = formatReference({ type: 'book', authors: ['A One', 'B Two', 'C Three'], year: '2010',
  title: 'Three of them', publisher: 'A Press' });
is('MLA three authors uses et al.', stripMarks(three.mla),
  'One, A., et al. Three of Them. A Press, 2010.');

/* ----- chapter ----- */
const chap = formatReference({
  type: 'chapter', authors: ['Azade Seyhan'], year: '2008',
  title: 'Tales of crossed destinies', container: 'The Cambridge companion to the novel',
  editors: ['Eric Bulson'], publisher: 'Cambridge University Press', pages: '55-70'
});
is('APA chapter', stripMarks(chap.apa),
  'Seyhan, A. (2008). Tales of crossed destinies. In E. Bulson (Ed.), The Cambridge companion to the novel (pp. 55-70). Cambridge University Press.');
is('MLA chapter', stripMarks(chap.mla),
  'Seyhan, Azade. “Tales of Crossed Destinies.” The Cambridge Companion to the Novel, edited by Eric Bulson, Cambridge University Press, 2008, pp. 55-70.');

/* ----- no date, missing fields reported ----- */
const bare = formatReference({ type: 'article', title: 'Something', authors: [] });
is('APA with nothing', stripMarks(bare.apa), '(n.d.). Something.');
is('missing fields listed', bare.missing.join(','), 'author,year,journal');

/* ----- italics are marked, not applied ----- */
const marked = formatReference({ type: 'book', authors: ['A One'], year: '2000', title: 'Italic Me', publisher: 'P' });
is('book title is marked for italics', /\u0001Italic Me\u0001/.test(marked.apa) ? 'yes' : 'no', 'yes');

console.log(`\n  REFERENCE FORMATTING\n`);
console.log(`  passed: ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log(`\n  FAILED (${fails.length}):`);
  fails.forEach((f) => console.log('   - ' + f));
  process.exitCode = 1;
} else {
  console.log('  All worked examples match.\n');
}
