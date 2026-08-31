/*
 * report-dialog.js — the "send this to the student" dialog.
 *
 * Shared by Thesis review and Citations so the student always receives the
 * same document, whichever tab the instructor was working in.
 */
import { el, dialog, toast, field } from '../ui.js';
import { getState } from '../store.js';
import { SECTIONS, buildReportHtml, openPrintable, downloadReport } from '../export/report.js';

export function openReportDialog(report, { defaultSections, title, studentId } = {}) {
  const state = getState();
  const student = state.students.find((s) => s.id === studentId);

  const chosen = new Set(defaultSections || ['summary', 'grammar', 'citation', 'marked']);
  const severities = new Set(['high', 'medium']);

  const sectionBoxes = SECTIONS.map((sec) => {
    const available = sec.always || sec.special ||
      report.issues.some((i) => (sec.categories || []).includes(i.category));
    const count = sec.categories ? report.issues.filter((i) => sec.categories.includes(i.category)).length : null;
    return el('label', { class: 'inline' },
      el('input', {
        type: 'checkbox',
        checked: chosen.has(sec.id),
        disabled: !available,
        onChange: (e) => { if (e.target.checked) chosen.add(sec.id); else chosen.delete(sec.id); }
      }),
      el('span', { text: `${sec.label}${count !== null ? ` (${count})` : ''}${available ? '' : ' — nothing found'}` })
    );
  });

  const sevBoxes = [
    ['high', 'Errors — near-certain faults'],
    ['medium', 'Warnings — likely, worth checking'],
    ['low', 'Suggestions — matters of style']
  ].map(([id, label]) => el('label', { class: 'inline' },
    el('input', {
      type: 'checkbox',
      checked: severities.has(id),
      onChange: (e) => { if (e.target.checked) severities.add(id); else severities.delete(id); }
    }),
    el('span', { text: label })
  ));

  const titleInput = el('input', { value: title || 'Thesis', placeholder: 'Title as the student should see it' });
  const noteInput = el('textarea', {
    placeholder: 'Optional. A few lines in your own words, printed at the top of the report.',
    style: 'min-height:80px'
  });

  const build = () => buildReportHtml(report, {
    sections: [...chosen],
    includeSeverities: [...severities],
    studentName: student ? student.name : '',
    thesisTitle: titleInput.value || 'Thesis',
    instructor: state.settings.instructor || '',
    institution: state.settings.institution || '',
    note: noteInput.value.trim()
  });

  const body = el('div', {},
    el('p', { class: 'hint', text: 'Produces one self-contained HTML file. “Print / Save as PDF” opens it and starts the print dialog, where you choose Save as PDF. The colours survive both routes.' }),
    student ? null : el('div', { class: 'banner warn' }, 'No student is attached to this document, so the report will carry no name.'),
    field('Title', titleInput),
    el('h2', { style: 'margin:14px 0 6px;font-size:13px', text: 'Sections to include' }),
    ...sectionBoxes,
    el('h2', { style: 'margin:14px 0 6px;font-size:13px', text: 'Severity to include' }),
    ...sevBoxes,
    el('h2', { style: 'margin:14px 0 6px;font-size:13px', text: 'A note to the student' }),
    noteInput
  );

  const dlg = dialog('Report for the student', body, [
    el('button', { text: 'Cancel', onClick: () => dlg.close() }),
    el('button', {
      text: 'Download HTML',
      title: 'A file you can email. The student opens it in any browser and sees the same colours.',
      onClick: () => {
        const name = (student ? student.name : 'thesis').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        downloadReport(build(), `feedback-${name || 'report'}-${new Date().toISOString().slice(0, 10)}.html`);
        toast('Report downloaded.', 'good');
        dlg.close();
      }
    }),
    el('button', {
      class: 'primary',
      text: 'Print / Save as PDF',
      onClick: () => {
        try {
          openPrintable(build());
          dlg.close();
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    })
  ]);
  return dlg;
}
