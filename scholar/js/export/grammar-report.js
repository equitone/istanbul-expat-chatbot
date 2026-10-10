/*
 * grammar-report.js — one self-contained HTML file of a grammar check.
 *
 * Everything is inlined: no stylesheet, no script, no images. The file opens
 * in colour on any machine, can be emailed, and keeps working when the app
 * that made it is gone.
 *
 * PDF comes from the browser's own print-to-PDF rather than a JavaScript PDF
 * library. That is deliberate. A PDF library would have to re-implement text
 * layout and would lose the inline highlighting, which is most of the point
 * of the document; print-to-PDF keeps the colours, the text flow and
 * selectable, searchable text, and adds nothing to carry.
 *
 * Colours are literals here rather than CSS variables. The report is read on
 * someone else's machine, where this app's variables do not exist.
 */
import { buildSegments, dominantIssue } from '../analysis/segments.js';

/* Three buckets, matching the tab. Style findings never reach this file. */
const PALETTE = {
  grammar: '#b4651a',
  punctuation: '#1f6f7a',
  typo: '#a32f3f'
};

const LABEL = {
  grammar: 'Grammatical mistakes',
  punctuation: 'Punctuation',
  typo: 'Typos'
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Blank lines become paragraphs; a run of marked spans is concatenated,
   never nested, because buildSegments guarantees they do not overlap. */
function markedHtml(text, issues) {
  const segments = buildSegments(text, issues);
  let out = '';
  segments.forEach((seg) => {
    const raw = esc(text.slice(seg.start, seg.end));
    if (!seg.issues.length) { out += raw; return; }
    const top = dominantIssue(seg.issues);
    out += `<mark class="${top.category}">${raw}</mark>`;
  });
  return out.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
}

export function buildGrammarReport({ text, issues, words, dialect, ltNote, title = 'Grammar check' }) {
  const byCat = (c) => issues.filter((i) => i.category === c);
  const real = issues.length;
  const when = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });

  const section = (cat) => {
    const list = byCat(cat);
    if (!list.length) return '';
    return `
    <section>
      <h2><span class="dot" style="background:${PALETTE[cat]}"></span>${LABEL[cat]} <span class="n">${list.length}</span></h2>
      ${list.map((i) => {
        const line = text.slice(0, i.start).split('\n').length;
        return `<div class="finding">
          <div class="where">line ${line}${i.rule ? ` · <code>${esc(i.rule)}</code>` : ''}${i.severity ? ` · ${esc(i.severity)}` : ''}</div>
          <blockquote>…${esc(text.slice(Math.max(0, i.start - 60), i.start))}<mark class="${cat}">${esc(i.excerpt)}</mark>${esc(text.slice(i.end, i.end + 60))}…</blockquote>
          <p class="msg">${esc(i.message)}</p>
          ${i.suggestion ? `<p class="fix">Suggested: ${esc(i.suggestion)}</p>` : ''}
        </div>`;
      }).join('\n')}
    </section>`;
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font: 15px/1.6 "Iowan Old Style", Palatino, Georgia, serif; color: #111; max-width: 46em; margin: 0 auto; padding: 24px; }
  h1 { font-size: 26px; margin: 0 0 2px; }
  h2 { font-size: 15px; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
       text-transform: uppercase; letter-spacing: .08em; margin: 30px 0 12px;
       padding-bottom: 5px; border-bottom: 1px solid #ccc; display: flex; align-items: center; gap: 8px; }
  h2 .n { margin-left: auto; font-weight: normal; color: #777; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .sub { color: #666; font-size: 13px; margin: 0 0 18px; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  .figures { display: flex; flex-wrap: wrap; gap: 22px; border-top: 2px solid #111; border-bottom: 1px solid #ccc; padding: 12px 0; margin-bottom: 6px; }
  .fig b { display: block; font-size: 24px; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  .fig span { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: #666;
              font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  .finding { margin: 0 0 16px; padding-left: 12px; border-left: 2px solid #ddd; break-inside: avoid; }
  .where { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #777; text-transform: uppercase; letter-spacing: .05em; }
  blockquote { margin: 5px 0; font-size: 14px; color: #333; }
  .msg { margin: 4px 0 0; font-size: 14px; }
  .fix { margin: 3px 0 0; font-size: 13px; color: #555;
         font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  mark { padding: 0 1px; border-radius: 2px; }
  mark.grammar { background: ${PALETTE.grammar}2e; border-bottom: 2px solid ${PALETTE.grammar}; }
  mark.punctuation { background: ${PALETTE.punctuation}2e; border-bottom: 2px solid ${PALETTE.punctuation}; }
  mark.typo    { background: ${PALETTE.typo}2e;    border-bottom: 2px solid ${PALETTE.typo}; }
  .legend { font-size: 12px; color: #555; display: flex; gap: 16px; flex-wrap: wrap; margin: 10px 0 0;
            font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  .marked p { margin: 0 0 11px; }
  footer { margin-top: 34px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 11.5px; color: #777;
           font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  /* Printers default to dropping background colours, which would remove the
     highlighting the report exists to carry. */
  @media print { body { padding: 0; } mark { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <p class="sub">${when} · ${words.toLocaleString()} words</p>

  <div class="figures">
    <div class="fig"><b>${byCat('grammar').length}</b><span>grammar</span></div>
    <div class="fig"><b>${byCat('punctuation').length}</b><span>punctuation</span></div>
    <div class="fig"><b>${byCat('typo').length}</b><span>typos</span></div>
    <div class="fig"><b>${words ? (real / words * 1000).toFixed(1) : '0'}</b><span>per 1000 words</span></div>
    <div class="fig"><b>${dialect && dialect.mixed ? 'Mixed' : dialect && dialect.dominant === 'UK' ? 'British' : dialect && dialect.dominant === 'US' ? 'American' : '—'}</b><span>spelling</span></div>
  </div>
  <div class="legend">
    <span><span class="dot" style="background:${PALETTE.grammar}"></span> grammar</span>
    <span><span class="dot" style="background:${PALETTE.punctuation}"></span> punctuation</span>
    <span><span class="dot" style="background:${PALETTE.typo}"></span> typos</span>
  </div>
  ${ltNote ? `<p class="sub" style="margin-top:14px">${esc(ltNote)}</p>` : ''}

  ${section('grammar')}
  ${section('punctuation')}
  ${section('typo')}

  <section>
    <h2>The text, marked</h2>
    <div class="marked">${markedHtml(text, issues)}</div>
  </section>

  <footer>
    Checked on this computer by Scholar Desk. Only things that are wrong are listed.
    A checker is cautious by design: nothing flagged does not mean nothing wrong.
  </footer>
</body></html>`;
}

/*
 * Print-to-PDF, through a window rather than an iframe.
 *
 * An iframe would print the host page in some browsers, and the window
 * carries the report's own @page margins. The print dialog is opened after
 * load so the stylesheet is applied to what the user sees in the preview.
 */
export function openPrintable(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.addEventListener('load', () => setTimeout(() => w.print(), 120));
  return true;
}

export function downloadReport(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
