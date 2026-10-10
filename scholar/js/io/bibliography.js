/*
 * bibliography.js — read RIS and BibTeX exports.
 *
 * This is the way back in from the databases the app cannot search. JSTOR,
 * Project MUSE, Scopus and the MLA Bibliography all export selected records
 * as RIS or BibTeX, every reference manager writes both, and once a file is
 * read here those records sit in the Library like any other: counted in the
 * coverage figures, placed on the gap map if they carry an abstract, cited
 * by the writing tabs, and checkable because they keep their DOI.
 *
 * So the honest answer to "search JSTOR too" is two steps rather than one,
 * and this is the second one.
 *
 * Both formats are parsed strictly and shallowly. Where a field is absent it
 * stays absent: a record with no abstract is a record with no abstract, and
 * the Library says so rather than this file inventing one from the title.
 */

/* ------------------------------------------------------------------ RIS */

/*
 * RIS is line-oriented: a two-letter tag, two spaces, a hyphen, a space,
 * then the value. A record starts at TY and ends at ER. Long values wrap
 * onto continuation lines with no tag, which is why a line that does not
 * match the tag pattern is appended to the previous field rather than
 * dropped — abstracts arrive wrapped almost every time.
 */
const RIS_TYPES = {
  JOUR: 'article', EJOUR: 'article', BOOK: 'book', EBOOK: 'book',
  CHAP: 'chapter', ECHAP: 'chapter', THES: 'thesis', CONF: 'article',
  CPAPER: 'article', RPRT: 'article', ELEC: 'web', GEN: 'article'
};

export function parseRis(text) {
  const out = [];
  let cur = null;
  let lastKey = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if (!m) {
      /* A continuation of the field before it. */
      if (cur && lastKey && line.trim()) {
        const v = cur[lastKey];
        if (Array.isArray(v)) v[v.length - 1] += ` ${line.trim()}`;
        else cur[lastKey] = `${v} ${line.trim()}`.trim();
      }
      continue;
    }
    const [, tag, value] = m;
    if (tag === 'TY') { cur = { TY: value.trim() }; lastKey = 'TY'; continue; }
    if (!cur) continue;
    if (tag === 'ER') { out.push(cur); cur = null; lastKey = null; continue; }
    /* Authors and keywords repeat; everything else is taken once. */
    if (tag === 'AU' || tag === 'A1' || tag === 'A2' || tag === 'A3' || tag === 'ED' || tag === 'KW') {
      cur[tag] = cur[tag] || [];
      cur[tag].push(value.trim());
    } else if (cur[tag] === undefined) {
      cur[tag] = value.trim();
    }
    lastKey = tag;
  }
  if (cur) out.push(cur);

  return out.map((r) => {
    const year = (r.PY || r.Y1 || r.DA || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    return tidy({
      type: RIS_TYPES[r.TY] || 'article',
      title: join(r.TI, r.T1, r.BT),
      authors: [...(r.AU || []), ...(r.A1 || [])],
      editors: [...(r.ED || []), ...(r.A2 || [])],
      year: year ? year[1] : '',
      /* For a chapter, T2 is the book; for an article it is the journal. */
      container: join(r.JO, r.JF, r.T2, r.J2),
      publisher: join(r.PB),
      volume: join(r.VL), issue: join(r.IS),
      pages: r.SP && r.EP ? `${r.SP}-${r.EP}` : join(r.SP),
      doi: cleanDoi(join(r.DO, r.DI)),
      url: join(r.UR, r.L1),
      abstract: join(r.AB, r.N2),
      concepts: (r.KW || []).slice(0, 8)
    });
  }).filter((x) => x.title);
}

/* --------------------------------------------------------------- BibTeX */

const BIB_TYPES = {
  article: 'article', book: 'book', incollection: 'chapter', inbook: 'chapter',
  inproceedings: 'article', conference: 'article', phdthesis: 'thesis',
  mastersthesis: 'thesis', misc: 'article', online: 'web', techreport: 'article'
};

/*
 * BibTeX entries nest braces, so fields cannot be split on commas and
 * values cannot be read with one regular expression. The value is walked
 * character by character, counting depth, which is the only way to keep a
 * title like {The {Ottoman} Novel} intact.
 */
export function parseBibtex(text) {
  const src = String(text);
  const out = [];
  const entry = /@(\w+)\s*\{\s*([^,]*),/g;
  let m;

  while ((m = entry.exec(src)) !== null) {
    const kind = m[1].toLowerCase();
    if (kind === 'comment' || kind === 'preamble' || kind === 'string') continue;
    const fields = {};
    let i = entry.lastIndex;
    let depth = 1;

    while (i < src.length && depth > 0) {
      /* field = value */
      const fm = /\s*([A-Za-z][\w-]*)\s*=\s*/y;
      fm.lastIndex = i;
      const f = fm.exec(src);
      if (!f) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        i += 1;
        continue;
      }
      i = fm.lastIndex;
      let value = '';
      if (src[i] === '{') {
        let d = 0;
        do {
          if (src[i] === '{') d += 1;
          else if (src[i] === '}') d -= 1;
          if (d > 0 || src[i] !== '}') value += src[i];
          i += 1;
        } while (i < src.length && d > 0);
        value = value.slice(1);
      } else if (src[i] === '"') {
        i += 1;
        while (i < src.length && src[i] !== '"') { value += src[i]; i += 1; }
        i += 1;
      } else {
        while (i < src.length && !/[,}]/.test(src[i])) { value += src[i]; i += 1; }
      }
      fields[f[1].toLowerCase()] = debrace(value);
      while (i < src.length && /[\s,]/.test(src[i])) i += 1;
      if (src[i] === '}') { depth -= 1; i += 1; break; }
    }
    entry.lastIndex = i;

    const year = String(fields.year || fields.date || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    out.push(tidy({
      type: BIB_TYPES[kind] || 'article',
      title: fields.title || '',
      authors: splitBibNames(fields.author),
      editors: splitBibNames(fields.editor),
      year: year ? year[1] : '',
      container: fields.journal || fields.booktitle || fields.journaltitle || '',
      publisher: fields.publisher || fields.school || fields.institution || '',
      volume: fields.volume || '', issue: fields.number || '',
      pages: String(fields.pages || '').replace(/--/g, '-'),
      doi: cleanDoi(fields.doi),
      url: fields.url || '',
      abstract: fields.abstract || '',
      concepts: String(fields.keywords || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean).slice(0, 8)
    }));
  }
  return out.filter((x) => x.title);
}

/* "Seyhan, Azade and Pamuk, Orhan" — split on the keyword, not on commas,
   which separate surname from given name inside one name. */
const splitBibNames = (v) => String(v || '')
  .split(/\s+and\s+/i)
  .map((x) => debrace(x).trim())
  .filter(Boolean)
  .map((n) => (n.includes(',') ? n.split(',', 2).map((p) => p.trim()).reverse().join(' ') : n));

/* Strip the braces that protect capitals, and the commonest TeX escapes. */
const debrace = (s) => String(s || '')
  .replace(/[{}]/g, '')
  .replace(/\\&/g, '&').replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/\\\$/g, '$')
  .replace(/\\'\s*([a-z])/gi, '$1').replace(/\\"\s*([a-z])/gi, '$1')
  .replace(/~/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const join = (...vals) => String(vals.find((v) => v && String(v).trim()) || '').trim();
const cleanDoi = (v) => String(v || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/[.,;]$/, '');

function tidy(r) {
  return {
    ...r,
    title: String(r.title || '').replace(/\s+/g, ' ').trim().replace(/[.,]$/, ''),
    abstract: String(r.abstract || '').replace(/\s+/g, ' ').trim(),
    authors: (r.authors || []).map((a) => String(a).replace(/\s+/g, ' ').trim()).filter(Boolean),
    editors: (r.editors || []).map((a) => String(a).replace(/\s+/g, ' ').trim()).filter(Boolean),
    url: r.url || (r.doi ? `https://doi.org/${r.doi}` : '')
  };
}

/* ------------------------------------------------------------- the door */

export const looksLikeRis = (text) => /^\s*TY\s{2}-\s/m.test(String(text));
export const looksLikeBibtex = (text) => /@\w+\s*\{/.test(String(text));

/*
 * Read whichever it is.
 *
 * Returns the records and the format, or throws with a sentence that says
 * what to do. An export that silently yields nothing is the one outcome
 * worth preventing: it reads as "JSTOR had nothing", which is a false gap.
 */
export function parseBibliography(text) {
  const s = String(text || '');
  if (!s.trim()) throw new Error('That file is empty.');
  if (looksLikeRis(s)) {
    const records = parseRis(s);
    if (!records.length) throw new Error('It is an RIS file, but no complete records could be read from it.');
    return { format: 'RIS', records };
  }
  if (looksLikeBibtex(s)) {
    const records = parseBibtex(s);
    if (!records.length) throw new Error('It is a BibTeX file, but no complete entries could be read from it.');
    return { format: 'BibTeX', records };
  }
  throw new Error('That is neither RIS nor BibTeX. In JSTOR or Scopus choose Export and pick RIS; most reference managers offer both.');
}
