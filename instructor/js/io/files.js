/*
 * files.js — turn an uploaded thesis into plain text, in the browser.
 *
 * The file is read with FileReader and parsed locally; it is never uploaded.
 * Parsers are fetched lazily from a CDN the first time they are needed, so a
 * machine that only ever handles .txt/.md never loads anything at all. See
 * README for how to vendor them for a fully air-gapped install.
 */

const CDN = {
  mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
};

/* A local copy wins over the CDN, so vendoring is a drop-in change. */
const LOCAL = {
  mammoth: 'vendor/mammoth.browser.min.js',
  pdfjs: 'vendor/pdf.min.js',
  pdfWorker: 'vendor/pdf.worker.min.js',
  xlsx: 'vendor/xlsx.full.min.js'
};

const loaded = new Map();

export function loadScript(name) {
  if (loaded.has(name)) return loaded.get(name);
  const promise = tryLoad(LOCAL[name]).catch(() => tryLoad(CDN[name]));
  loaded.set(name, promise);
  return promise;
}

function tryLoad(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error('no source'));
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve(src);
    el.onerror = () => { el.remove(); reject(new Error(`Could not load ${src}`)); };
    document.head.appendChild(el);
  });
}

export async function hasLocalVendor(name) {
  try {
    const res = await fetch(LOCAL[name], { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export const SUPPORTED = '.txt,.md,.markdown,.docx,.pdf,.rtf,.html,.htm';

export async function extractText(file) {
  const name = (file.name || '').toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));

  if (['.txt', '.md', '.markdown', '.csv'].includes(ext)) {
    return { text: stripMarkdown(await file.text()), source: 'text' };
  }
  if (ext === '.html' || ext === '.htm') {
    return { text: htmlToText(await file.text()), source: 'html' };
  }
  if (ext === '.rtf') {
    return { text: rtfToText(await file.text()), source: 'rtf' };
  }
  if (ext === '.docx') {
    return { text: await readDocx(file), source: 'docx' };
  }
  if (ext === '.pdf') {
    return { text: await readPdf(file), source: 'pdf' };
  }
  if (ext === '.doc') {
    throw new Error('Legacy .doc is not readable in the browser. Save it as .docx or paste the text.');
  }
  if (ext === '.pages') {
    throw new Error('Pages files are not readable. Export to .docx or PDF first.');
  }
  /* Unknown extension: try it as text rather than refusing outright. */
  return { text: stripMarkdown(await file.text()), source: 'text' };
}

async function readDocx(file) {
  await loadScript('mammoth');
  if (!window.mammoth) throw new Error('The Word reader could not be loaded. Check your connection, or paste the text instead.');
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return normaliseParagraphs(result.value);
}

async function readPdf(file) {
  await loadScript('pdfjs');
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error('The PDF reader could not be loaded. Check your connection, or paste the text instead.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = (await hasLocalVendor('pdfWorker')) ? LOCAL.pdfWorker : CDN.pdfWorker;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(joinPdfItems(content.items));
  }
  return normaliseParagraphs(pages.join('\n\n'));
}

/*
 * PDF text has no paragraphs — only positioned runs. Rebuild line breaks from
 * vertical position, then stitch lines that are continuations of a sentence
 * (and repair words the extractor split with a hyphen at the line end).
 */
function joinPdfItems(items) {
  let out = '';
  let lastY = null;
  items.forEach((item) => {
    const y = item.transform ? Math.round(item.transform[5]) : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out += '\n';
    else if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += item.str.startsWith(' ') ? '' : ' ';
    out += item.str;
    lastY = y;
  });
  return out
    .replace(/([a-z])-\n([a-z])/g, '$1$2')       // rejoin hyphenated line breaks
    .replace(/([^.!?:;"'”\n])\n(?=[a-z(])/g, '$1 '); // unwrap soft line wraps
}

function normaliseParagraphs(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function stripMarkdown(text) {
  return normaliseParagraphs(
    String(text || '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}[-*+]\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*\n]+)\*/g, '$1')
      .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  );
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,nav,header,footer').forEach((el) => el.remove());
  const blocks = [];
  doc.body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,td').forEach((el) => {
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t) blocks.push(t);
  });
  return normaliseParagraphs(blocks.length ? blocks.join('\n\n') : doc.body.textContent);
}

function rtfToText(rtf) {
  return normaliseParagraphs(
    rtf
      .replace(/\\par[d]?/g, '\n')
      .replace(/\{\\\*[^{}]*\}/g, '')
      .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\[a-z]+-?\d* ?/gi, '')
      .replace(/[{}]/g, '')
  );
}

/* --------------------------------------------------------------- download */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/*
 * A UTF-8 BOM is what makes Excel open a CSV with Turkish characters intact,
 * so CSV keeps it. Everything else must not have one: a BOM makes a .json
 * file fail JSON.parse in every strict parser, and a backup that only some
 * tools can read is not a backup.
 */
export const downloadText = (text, filename, type = 'text/plain;charset=utf-8') => {
  const wantsBom = /csv/i.test(type) || /\.csv$/i.test(filename);
  downloadBlob(new Blob([wantsBom ? '\ufeff' + text : text], { type }), filename);
};
