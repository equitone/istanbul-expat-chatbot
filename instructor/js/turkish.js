/*
 * turkish.js — text handling for Turkish names.
 *
 * JavaScript's default case and sort operations are wrong for Turkish, and
 * wrong in ways that are invisible until a roster is loaded:
 *
 *   'MELİS'.toLowerCase()  →  'meli̇s'   — 'i' plus a COMBINING DOT ABOVE.
 *                                          Twelve characters, not eleven.
 *
 * That single fact broke two things in this workbench. Duplicate detection
 * compared lowercased names, so "MELİS KESER" and "Melis Keser" were held to
 * be different people — for 30 of the 100 students in a real cohort. And the
 * search box compared the same way, so typing "melis" matched nothing.
 *
 * Sorting is wrong too. The Turkish alphabet orders C Ç, G Ğ, I İ, O Ö, S Ş,
 * U Ü, so the default collator files ÇELİK before CEREN and İNCE before IŞIK.
 * A supervisor scanning for a surname does not find it where it belongs.
 *
 * Everything here is locale-explicit. Nothing in the app should call
 * toLowerCase(), toUpperCase() or a bare localeCompare() on a person's name.
 */

/* Intl.Collator is built into the browser; constructing it once matters
   because a 100-row table sorts on every render. */
const COLLATOR = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

export const trLower = (s) => String(s ?? '').toLocaleLowerCase('tr');
export const trUpper = (s) => String(s ?? '').toLocaleUpperCase('tr');

/** Turkish-correct ordering for names, titles and any user-facing list. */
export const compare = (a, b) => COLLATOR.compare(String(a ?? ''), String(b ?? ''));

/*
 * The key two spellings of one name must share.
 *
 * Lowercases in Turkish, strips any combining marks a previous bad
 * lowercasing may already have written into stored data, folds the six
 * Turkish letters to their plain counterparts, and collapses punctuation and
 * spacing. "MELİS KESER", "Melis Keser" and "melis  keser" all become
 * "melis keser"; so does the "meli̇s keser" an older build may have saved.
 *
 * Folding Ç→c and Ş→s is deliberate. It makes the key slightly less precise
 * and much more forgiving of a registry that writes "GUNES" where the student
 * writes "GÜNEŞ" — which registries do constantly.
 */
export function nameKey(s) {
  return trLower(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Does `haystack` contain `needle`, ignoring case, accents and Turkish letters? */
export const matches = (haystack, needle) => nameKey(haystack).includes(nameKey(needle));

/*
 * "MELİS KESER" → "Melis Keser". Registry exports are shouted in capitals,
 * which is unreadable down a hundred rows; the original is kept on the record
 * so exports can still carry exactly what the registry sent.
 *
 * Particles stay lowercase, and a name already in mixed case is left alone —
 * "McDonald" and "van Dijk" must not be flattened.
 */
const PARTICLES = new Set(['de', 'da', 'del', 'della', 'van', 'von', 'bin', 'binti', 'el', 'al', 'ibn', 'abu']);

/*
 * The capital I problem, which has no clean answer.
 *
 * Turkish lowercases I to dotless ı, so IŞIK must become Işık. But the same
 * roster carries ISMAIL and IBRAHIM, where the Turkish rule produces "Ismaıl"
 * — which reads as a typo. So the rule is chosen per word: a word carrying a
 * letter that exists only in Turkish (Ç Ğ İ Ö Ş Ü, or a dotless ı) is cased by
 * Turkish rules; anything else is cased invariantly, where I becomes i.
 *
 * This is right for IŞIK, KADIOĞLU, MELİS, ISMAIL and ALI. It is wrong for
 * YILDIRIM, a common surname spelled Yıldırım, because nothing in the capital
 * spelling says so — only a dictionary of Turkish names would settle it, and
 * a wrong dictionary entry is worse than a missing dot. The registry's own
 * spelling is kept on the record and is what exports carry, so nothing here
 * changes the data; it changes only what is easy to read on screen.
 */
const TURKISH_ONLY = /[çğıöşüÇĞİÖŞÜ]/;

function caseWord(word) {
  const turkish = TURKISH_ONLY.test(word);
  const head = turkish ? trUpper(word.slice(0, 1)) : word.slice(0, 1).toUpperCase();
  const tail = turkish ? trLower(word.slice(1)) : word.slice(1).toLowerCase();
  return head + tail;
}

export function titleCase(s) {
  const raw = String(s ?? '').trim();
  if (!raw) return '';
  /* Only reshape text that is entirely upper case. Anything else was typed by
     a person who meant it. */
  if (raw !== trUpper(raw)) return raw;
  return raw
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^(\s+|-)$/.test(part) || !part) return part;
      if (PARTICLES.has(trLower(part))) return trLower(part);
      return caseWord(part);
    })
    .join('');
}

/*
 * Split a full name into given names and surname.
 *
 * Turkish rosters put the surname last and it is usually one word, but the
 * registry also carries Arabic and Persian names where the last token is not
 * the family name in the same sense. There is no rule that gets every case
 * right, so where the sheet gives separate Adı / Soyadı columns the import
 * keeps them and this is never consulted. This is the fallback for a name
 * that arrived as one string.
 */
export function splitName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/** Surname first, for a list someone reads down looking for a family name. */
export function listName(person) {
  const last = person.lastName || splitName(person.name).last;
  const first = person.firstName || splitName(person.name).first;
  if (!last) return titleCase(first || person.name || '');
  return `${trUpper(last)}, ${titleCase(first)}`;
}

/** Natural order, for a report addressed to the student. */
export function fullName(person) {
  const last = person.lastName || splitName(person.name).last;
  const first = person.firstName || splitName(person.name).first;
  return [titleCase(first), titleCase(last)].filter(Boolean).join(' ') || String(person.name || '');
}

/** Sort a roster the way a roster is sorted: surname, then given name. */
export function compareBySurname(a, b) {
  const al = a.lastName || splitName(a.name).last;
  const bl = b.lastName || splitName(b.name).last;
  return compare(al, bl)
    || compare(a.firstName || splitName(a.name).first, b.firstName || splitName(b.name).first)
    || compare(a.studentNo || '', b.studentNo || '');
}
