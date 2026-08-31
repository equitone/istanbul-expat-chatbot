/*
 * forensics.js — what the FILE says, as distinct from what the text says.
 *
 * A .docx is a zip containing docProps/core.xml and docProps/app.xml, which
 * record who created the document, who last saved it, when, how many times it
 * was revised, and how many minutes it was open for editing. Word writes
 * these itself; a student does not normally know they exist.
 *
 * This is one of the clearest gaps in similarity-based checking. Turnitin
 * compares text against a corpus and never looks at the container. A thesis
 * whose properties say it was edited for four minutes across one revision,
 * or that was authored by a name that is not the student's, is a question
 * worth asking — and no amount of text matching will raise it.
 *
 * Everything here is a QUESTION, not a finding. Metadata is trivially
 * editable, carried over from a template, and lost entirely by Google Docs
 * export. Absence of a signal means nothing at all.
 */

/* Read one file out of a zip without a library: parse the central directory,
   then inflate with the platform's own DecompressionStream. */
async function readZipEntry(buffer, wanted) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  /* End-of-central-directory record, searched from the back. */
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a readable zip container.');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

    if (name === wanted) {
      /* The local header repeats the name and extra fields at its own lengths. */
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const raw = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return new TextDecoder().decode(raw);
      if (method !== 8) throw new Error(`Unsupported compression in ${name}.`);
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const tag = (xml, name) => {
  const m = xml && xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
};

export async function inspectFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.docx')) return inspectDocx(file);
  if (name.endsWith('.pdf')) return inspectPdf(file);
  return {
    supported: false,
    reason: 'File properties can only be read from .docx and .pdf. A pasted or plain-text document carries none.'
  };
}

async function inspectDocx(file) {
  const buffer = await file.arrayBuffer();
  let core = null;
  let app = null;
  try {
    core = await readZipEntry(buffer, 'docProps/core.xml');
    app = await readZipEntry(buffer, 'docProps/app.xml');
  } catch (err) {
    return { supported: false, reason: `Could not read the document container: ${err.message}` };
  }
  if (!core && !app) {
    return { supported: false, reason: 'This .docx carries no properties. Files exported from Google Docs and some converters have none — that is normal and means nothing.' };
  }

  const created = tag(core, 'dcterms:created');
  const modified = tag(core, 'dcterms:modified');
  const editMinutes = Number(tag(app, 'TotalTime'));
  const revision = Number(tag(core, 'cp:revision'));
  const words = Number(tag(app, 'Words'));

  const facts = {
    supported: true,
    kind: 'docx',
    author: tag(core, 'dc:creator'),
    lastModifiedBy: tag(core, 'cp:lastModifiedBy'),
    title: tag(core, 'dc:title'),
    company: tag(app, 'Company'),
    application: tag(app, 'Application'),
    created,
    modified,
    editMinutes: Number.isFinite(editMinutes) ? editMinutes : null,
    revision: Number.isFinite(revision) ? revision : null,
    words: Number.isFinite(words) ? words : null,
    pages: Number(tag(app, 'Pages')) || null,
    template: tag(app, 'Template')
  };

  return { ...facts, observations: readDocx(facts) };
}

/*
 * Turn the properties into questions. Each says what was observed, what it
 * might mean, and — importantly — the innocent explanation, because every
 * one of these has one.
 */
function readDocx(f) {
  const out = [];
  const push = (level, headline, detail, innocent) => out.push({ level, headline, detail, innocent });

  if (f.editMinutes !== null && f.words) {
    const perMinute = f.editMinutes > 0 ? f.words / f.editMinutes : Infinity;
    if (f.editMinutes === 0) {
      push('high', 'Recorded editing time is zero',
        `Word records ${f.words.toLocaleString()} words but no editing time at all.`,
        'Normal if the text was pasted into a fresh document, or the file passed through a converter.');
    } else if (perMinute > 120) {
      push('high', `About ${Math.round(perMinute)} words per minute of recorded editing`,
        `${f.words.toLocaleString()} words against ${f.editMinutes} minute(s) of editing time. Sustained composition runs closer to 20–40.`,
        'Normal if the student drafted elsewhere — by hand, in another program, or in Google Docs — and pasted the result in.');
    } else if (perMinute > 60) {
      push('medium', `About ${Math.round(perMinute)} words per minute of recorded editing`,
        `${f.words.toLocaleString()} words against ${f.editMinutes} minutes.`,
        'Consistent with heavy pasting from the student’s own notes.');
    }
  }

  if (f.revision !== null && f.revision <= 2 && (f.words || 0) > 2000) {
    push('medium', `Saved ${f.revision} time(s)`,
      `A ${f.words.toLocaleString()}-word document with a revision count of ${f.revision} was assembled somewhere else and saved here once.`,
      'Normal if the final copy was assembled from chapter files, or exported from another program.');
  }

  if (f.author && f.lastModifiedBy && f.author.trim().toLowerCase() !== f.lastModifiedBy.trim().toLowerCase()) {
    push('medium', 'Created and last saved by different names',
      `Created by “${f.author}”, last saved by “${f.lastModifiedBy}”.`,
      'Normal on a shared or lab computer, or where a supervisor opened and saved the file.');
  }

  if (f.created && f.modified) {
    const gap = (new Date(f.modified) - new Date(f.created)) / 3600000;
    if (Number.isFinite(gap) && gap >= 0 && gap < 2 && (f.words || 0) > 3000) {
      push('high', `Created and last modified ${gap < 1 ? 'less than an hour' : 'under two hours'} apart`,
        `${f.words.toLocaleString()} words, created ${new Date(f.created).toLocaleString()}, last saved ${new Date(f.modified).toLocaleString()}.`,
        'Normal if this file is a final export and the work happened in an earlier file.');
    }
  }

  if (f.template && !/^normal(\.dotm?)?$/i.test(f.template)) {
    push('low', `Built on the template “${f.template}”`, 'The document was started from a specific template.',
      'Often a departmental thesis template, which is exactly what students are told to use.');
  }

  if (!out.length) {
    push('none', 'Nothing unusual in the file properties',
      'Editing time, revision count and authorship look like ordinary drafting.',
      '');
  }
  return out;
}

async function inspectPdf(file) {
  const { loadScript } = await import('../io/files.js');
  await loadScript('pdfjs');
  if (!window.pdfjsLib) return { supported: false, reason: 'The PDF reader could not be loaded.' };
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const meta = await pdf.getMetadata();
  const info = meta.info || {};
  const parse = (d) => {
    const m = String(d || '').match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}`).toISOString() : null;
  };
  const facts = {
    supported: true,
    kind: 'pdf',
    author: info.Author || null,
    title: info.Title || null,
    application: info.Creator || null,
    producer: info.Producer || null,
    created: parse(info.CreationDate),
    modified: parse(info.ModDate),
    pages: pdf.numPages
  };

  const out = [];
  if (facts.created && facts.modified) {
    const gap = Math.abs(new Date(facts.modified) - new Date(facts.created)) / 60000;
    if (gap > 5) {
      out.push({ level: 'low', headline: 'Modified after creation', detail: `About ${Math.round(gap)} minutes apart.`, innocent: 'Any re-save or re-export does this.' });
    }
  }
  if (facts.producer && /word|libreoffice|pages|docs/i.test(facts.producer)) {
    out.push({ level: 'none', headline: `Exported from ${facts.producer}`, detail: 'The original was a word-processor document.', innocent: '' });
  }
  if (!out.length) {
    out.push({ level: 'none', headline: 'Nothing unusual in the PDF properties', detail: 'A PDF records far less than a Word file — no editing time, no revision count.', innocent: '' });
  }
  return { ...facts, observations: out };
}
