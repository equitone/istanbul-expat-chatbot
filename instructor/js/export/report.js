/*
 * report.js — a printable, self-contained feedback report for the student.
 *
 * The instructor picks which sections to include; the output is one HTML
 * document with everything inlined — no stylesheet, no script, no images —
 * so it can be emailed as a file and will open, in colour, on any machine.
 *
 * PDF comes from the browser's own print-to-PDF rather than a JavaScript PDF
 * library. That is deliberate: a PDF library would have to re-implement text
 * layout and would lose the inline highlighting, which is the entire point of
 * the document. Print-to-PDF keeps the colours, the text flow and the
 * selectable text, and costs nothing to carry.
 */
import { buildSegments, dominantIssue, CATEGORY_META } from '../analysis/index.js';
import { downloadBlob } from '../io/files.js';

export const SECTIONS = [
  { id: 'summary', label: 'Summary', always: true },
  { id: 'grammar', label: 'Grammar & spelling', categories: ['grammar', 'typo'] },
  { id: 'citation', label: 'Citations & references', categories: ['citation', 'structure'] },
  { id: 'argument', label: 'Argument', categories: ['argument'] },
  { id: 'style', label: 'Style suggestions', categories: ['style'] },
  { id: 'marked', label: 'Marked-up text', special: true },
  { id: 'readability', label: 'Readability figures', special: true }
];

/* Print colours are set as literals: a report is read on someone else's
   machine, where this app's CSS variables do not exist. */
const PALETTE = {
  grammar: '#d98324', typo: '#d1495b', citation: '#9a5b13',
  argument: '#7b4bc4', structure: '#0d8a72', style: '#8a8f9a', ai: '#2b6cb0'
};

export function buildReportHtml(report, opts = {}) {
  const {
    sections = ['summary', 'grammar', 'citation', 'marked'],
    studentName = '',
    thesisTitle = 'Thesis',
    instructor = '',
    institution = '',
    note = '',
    includeSeverities = ['high', 'medium', 'low']
  } = opts;

  const on = (id) => sections.includes(id);
  const shown = report.issues.filter((i) => includeSeverities.includes(i.severity));
  const forSection = (sec) => shown.filter((i) => (sec.categories || []).includes(i.category));

  const parts = [];

  parts.push(`
<header class="head">
  <div class="title">
    <h1>${esc(thesisTitle)}</h1>
    <p class="who">${[studentName && `Written by ${esc(studentName)}`, instructor && `Reviewed by ${esc(instructor)}`, institution && esc(institution)].filter(Boolean).join(' · ')}</p>
  </div>
  <div class="stamp">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</header>`);

  if (note) parts.push(`<div class="note"><strong>From your supervisor</strong><p>${esc(note).replace(/\n/g, '<br>')}</p></div>`);

  if (on('summary')) {
    const c = report.counts;
    parts.push(`
<section>
  <h2>At a glance</h2>
  <div class="tiles">
    ${tile('Words', fmt(report.structure.words))}
    ${tile('Points raised', fmt(shown.length), `${c.high} to fix · ${c.medium} to check`)}
    ${tile('Argument stress', `${report.argument.stressIndex}/100`, report.argument.stressBand)}
    ${tile('Claims supported', pct(report.argument.claimSupportRatio), `${report.argument.supportedClaims} of ${report.argument.claims}`)}
  </div>
  <p class="lead">This report lists what a checking tool and your supervisor found. Items marked
  <span class="sev high">to fix</span> are near-certain faults. <span class="sev medium">To check</span>
  means likely but worth your judgement. <span class="sev low">Suggestion</span> is a matter of style,
  not a mistake — you may reasonably disagree.</p>
</section>`);
  }

  SECTIONS.filter((s) => s.categories && on(s.id)).forEach((sec) => {
    const items = forSection(sec);
    parts.push(`<section><h2>${esc(sec.label)} <span class="count">${items.length}</span></h2>${
      items.length ? items.map(findingHtml).join('') : '<p class="none">Nothing raised in this section.</p>'
    }</section>`);
  });

  if (on('readability')) {
    const r = report.readability;
    const v = report.vocabulary;
    parts.push(`
<section>
  <h2>Readability</h2>
  <table>
    ${row('Average sentence', `${r.avgSentenceLength} words`)}
    ${row('Longest sentence', `${report.rhythm.longest} words`)}
    ${row('Flesch reading ease', r.fleschReadingEase)}
    ${row('Passive voice', `${report.grammarMetrics.passiveCount} sentences (${pct(report.grammarMetrics.passiveRate)})`)}
    ${row('Vocabulary variety', v.mattr)}
    ${row('Spelling variety', report.dialect.dominant || '—')}
  </table>
</section>`);
  }

  if (on('marked')) {
    parts.push(`
<section class="marked-section">
  <h2>Your text, marked up</h2>
  <p class="legend">${
      [...new Set(shown.map((i) => i.category))]
        .map((c) => `<span class="key" style="border-bottom:2px solid ${PALETTE[c] || '#888'}">${esc((CATEGORY_META[c] || {}).label || c)}</span>`)
        .join(' ')
    }</p>
  <div class="doc">${markedUp(report.text, shown)}</div>
</section>`);
  }

  return page(parts.join('\n'), thesisTitle, studentName);
}

/* ------------------------------------------------------------- rendering */

function findingHtml(i) {
  const sev = i.severity === 'high' ? 'to fix' : i.severity === 'medium' ? 'to check' : 'suggestion';
  return `
<div class="finding ${i.severity}" style="border-left-color:${PALETTE[i.category] || '#888'}">
  <div class="fhead"><span class="sev ${i.severity}">${sev}</span>${
    i.source === 'languagetool' ? '<span class="tag">LanguageTool</span>' : ''
  }</div>
  ${i.excerpt ? `<div class="quote">${esc(clip(i.excerpt, 240))}</div>` : ''}
  <div class="msg">${esc(i.message)}</div>
  ${i.suggestion ? `<div class="fix">Try: ${esc(i.suggestion)}</div>` : ''}
</div>`;
}

function markedUp(text, issues) {
  const segments = buildSegments(text, issues);
  let out = '';
  segments.forEach((seg) => {
    const raw = esc(text.slice(seg.start, seg.end)).replace(/\n/g, '<br>');
    if (!seg.issues.length) { out += raw; return; }
    const top = dominantIssue(seg.issues);
    const colour = PALETTE[top.category] || '#888';
    out += `<mark style="background:${hexToRgba(colour, 0.16)};border-bottom:2px solid ${colour}">${raw}</mark>`;
  });
  return out;
}

function page(body, title, student) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}${student ? ` — ${esc(student)}` : ''}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; max-width: 900px; padding: 26px 22px 60px;
    font: 15px/1.6 Georgia, "Iowan Old Style", "Times New Roman", serif;
    color: #1a1f2b; background: #fff;
  }
  h1 { font-size: 21px; margin: 0; letter-spacing: -.01em; }
  h2 {
    font: 600 13px/1.3 -apple-system, "Segoe UI", Roboto, sans-serif;
    text-transform: uppercase; letter-spacing: .08em; color: #5b6472;
    margin: 30px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #d8dde5;
  }
  h2 .count { float: right; color: #8b94a3; font-weight: 400; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          gap: 20px; padding-bottom: 14px; border-bottom: 2px solid #1a1f2b; }
  .who, .stamp { font: 12px -apple-system, "Segoe UI", Roboto, sans-serif; color: #5b6472; margin: 5px 0 0; }
  .note { background: #f0f6f5; border-left: 3px solid #1f6f6b; padding: 12px 15px; margin: 20px 0; }
  .note strong { font: 600 11px -apple-system, sans-serif; text-transform: uppercase;
                 letter-spacing: .07em; color: #1f6f6b; }
  .note p { margin: 6px 0 0; }
  .lead { font-size: 14px; color: #3a4250; }
  table.grid { width: 100%; border-collapse: collapse; margin: 10px 0 16px;
               font: 12.5px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; }
  table.grid th { text-align: left; border-bottom: 1px solid #1a1f2b; padding: 5px 8px 5px 0;
                  font-weight: 600; color: #5b6472; text-transform: uppercase;
                  font-size: 10.5px; letter-spacing: .05em; }
  table.grid td { border-bottom: 1px solid #e6eaf0; padding: 5px 8px 5px 0; vertical-align: top; }
  table.grid tr:last-child td { border-bottom: 0; }
  ul.plain { margin: 8px 0 16px 18px; padding: 0; font-size: 14px; }
  ul.plain li { margin-bottom: 5px; }
  .caveat { font: 12px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif;
            color: #5b6472; background: #f6f7f9; border-left: 3px solid #c9d0da;
            padding: 9px 12px; margin: 4px 0 16px; }
  .tiles { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .tile { flex: 1 1 150px; border: 1px solid #d8dde5; border-radius: 6px; padding: 10px 12px; }
  .tile .l { font: 10px -apple-system, sans-serif; text-transform: uppercase;
             letter-spacing: .06em; color: #8b94a3; }
  .tile .v { font: 700 21px -apple-system, sans-serif; margin-top: 2px; }
  .tile .s { font: 11px -apple-system, sans-serif; color: #5b6472; }
  .finding { border: 1px solid #e6e9ee; border-left-width: 3px; border-radius: 5px;
             padding: 10px 13px; margin-bottom: 9px; break-inside: avoid; }
  .fhead { display: flex; gap: 7px; align-items: center; margin-bottom: 5px; }
  .sev { font: 600 10px -apple-system, sans-serif; text-transform: uppercase;
         letter-spacing: .05em; padding: 2px 7px; border-radius: 99px; }
  .sev.high { background: #fbe6e9; color: #c2384c; }
  .sev.medium { background: #fbf0dc; color: #a5620f; }
  .sev.low { background: #eceff3; color: #5b6472; }
  .tag { font: 10px -apple-system, sans-serif; color: #2b6cb0;
         background: #e8f0fa; padding: 2px 7px; border-radius: 99px; }
  .quote { font: 12px ui-monospace, Menlo, Consolas, monospace; background: #f5f6f8;
           padding: 5px 8px; border-radius: 3px; margin: 5px 0; overflow-wrap: anywhere; }
  .msg { font-size: 14px; }
  .fix { font-size: 13px; color: #1f7a4d; margin-top: 4px; }
  .none { color: #8b94a3; font-style: italic; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  td { padding: 5px 0; border-bottom: 1px solid #eceff3; }
  td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .legend { font: 11px -apple-system, sans-serif; color: #5b6472; }
  .legend .key { margin-right: 12px; }
  .doc { font-size: 15px; line-height: 1.9; white-space: pre-wrap;
         word-wrap: break-word; border: 1px solid #e6e9ee; border-radius: 6px; padding: 20px 22px; }
  mark { background: none; padding: 1px 0; border-radius: 2px;
         -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .foot { margin-top: 34px; padding-top: 12px; border-top: 1px solid #d8dde5;
          font: 11px -apple-system, sans-serif; color: #8b94a3; }
  @media print {
    body { padding: 0; max-width: none; }
    .finding, section { break-inside: auto; }
    h2 { break-after: avoid; }
    /* Without this most browsers drop the highlighting when printing. */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style></head>
<body>
${body}
<p class="foot">Automated checks are a starting point, not a verdict: a rule can be wrong, and some
items are matters of style you may reasonably disagree with. Discuss anything that looks mistaken
with your supervisor.</p>
</body></html>`;
}

/* ---------------------------------------------------------------- output */

/*
 * Open in a new tab and call print(). The instructor then chooses
 * "Save as PDF" in the print dialog. A popup blocker will stop this, so the
 * caller is told when the window did not open.
 */
export function openPrintable(html) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('The browser blocked the report window. Allow pop-ups for this page, or use "Download HTML" instead.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  /* Give the document a moment to lay out before the print dialog. */
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* the user can print manually */ } }, 600);
  return win;
}

export function downloadReport(html, filename) {
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
}


/* ------------------------------------------------- reports for other tabs */

/*
 * A second entry point for the tabs that are not a thesis review — draft
 * comparison, cohort triage, class statistics.
 *
 * It reuses page(), which is the point: one stylesheet, one print rule, one
 * set of colours, and the same guarantee that the file references nothing
 * outside itself. A second styling system would drift from this one and would
 * be the place an external font or a CDN eventually crept in.
 *
 * Blocks are plain data so callers do not build HTML:
 *   { heading, lead, tiles: [[label, value, sub]], table: { headers, rows },
 *     list: [string], note }
 */
export function buildSimpleReport({ title, subtitle = '', instructor = '', institution = '', note = '', blocks = [] }) {
  const parts = [`
<header class="head">
  <div class="title">
    <h1>${esc(title)}</h1>
    <p class="who">${[subtitle && esc(subtitle), instructor && `Prepared by ${esc(instructor)}`, institution && esc(institution)].filter(Boolean).join(' · ')}</p>
  </div>
  <div class="stamp">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</header>`];

  if (note) parts.push(`<div class="note"><strong>Note</strong><p>${esc(note).replace(/\n/g, '<br>')}</p></div>`);

  blocks.filter(Boolean).forEach((b) => {
    if (b.heading) parts.push(`<h2>${esc(b.heading)}${b.count !== undefined ? `<span class="count">${esc(String(b.count))}</span>` : ''}</h2>`);
    if (b.lead) parts.push(`<p class="lead">${esc(b.lead)}</p>`);
    if (b.tiles && b.tiles.length) {
      parts.push(`<div class="tiles">${b.tiles.map(([l, v, sub]) => tile(l, v, sub)).join('')}</div>`);
    }
    if (b.table && b.table.rows && b.table.rows.length) {
      parts.push(`<table class="grid"><thead><tr>${b.table.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
        b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c ?? '—')}</td>`).join('')}</tr>`).join('')
      }</tbody></table>`);
    }
    if (b.list && b.list.length) {
      parts.push(`<ul class="plain">${b.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
    }
    if (b.caveat) parts.push(`<p class="caveat">${esc(b.caveat)}</p>`);
  });

  return page(parts.join('\n'), title, '');
}

/* ---------------------------------------------------------------- helpers */

const tile = (l, v, s) => `<div class="tile"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
const row = (l, v) => `<tr><td>${esc(l)}</td><td>${esc(v ?? '—')}</td></tr>`;
const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString() : '—');
const pct = (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100)}%` : '—');
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
