/*
 * cases.js — labelled test corpus for the analysis engine.
 *
 * POSITIVE cases each contain one fault and name the rule that should catch
 * it. NEGATIVE cases are correct academic prose that must produce no
 * grammar or spelling finding at all.
 *
 * The negative set is the important half. A checker that flags correct
 * sentences is worse than no checker: the instructor stops reading it, and
 * the student is told to "fix" writing that was already right. Recall can be
 * improved later; a false positive costs trust immediately.
 */

export const POSITIVE = [
  // --- subject / verb agreement ---
  ['subject-verb-agreement', 'The participants was interviewed in June.'],
  ['subject-verb-agreement', 'The findings has been reported in Table 2.'],
  ['subject-verb-agreement', 'The scholarship on this topic were reviewed.'],
  ['subject-verb-agreement', 'He were present at both interviews.'],
  ['subject-verb-agreement', 'They was unable to complete the task.'],
  ['subject-verb-agreement', 'This study are the first of its kind.'],
  ['subject-verb-agreement', 'These results is inconclusive.'],
  ['subject-verb-agreement', 'The responses was coded independently.'],

  // --- Latin plurals ---
  ['latin-plural', 'The criteria is not met by any case.'],
  ['latin-plural', 'This phenomena is well documented.'],
  ['latin-plural', 'The data was collected over two years.'],

  // --- existential agreement ---
  ['existential-agreement', 'There is many reasons to doubt this.'],
  ['existential-agreement', 'There is several competing explanations.'],
  ['existential-agreement', 'There are a single exception to the rule.'],

  // --- plural determiner ---
  ['plural-determiner', 'These result shows a downward trend.'],
  ['plural-determiner', 'Several study confirm the pattern.'],
  ['plural-determiner', 'Many scholar have addressed this.'],

  // --- comma splices ---
  ['comma-splice', 'The sample was small, however the authors claim it is robust.'],
  ['comma-splice', 'The archive is incomplete, therefore the finding is tentative.'],
  ['comma-splice', 'The theory is elegant, it is also untestable.'],
  ['comma-splice', 'The results were mixed, they do not support the hypothesis.'],

  // --- fragments ---
  ['fragment', 'Although the framework is useful in several respects.'],
  ['fragment', 'Because the sample was drawn from a single cohort.'],
  ['fragment', 'Which explains the divergence between the two datasets.'],

  // --- introductory comma ---
  ['introductory-comma', 'However the chronology does not support that reading.'],
  ['introductory-comma', 'Furthermore the evidence is circumstantial.'],
  ['introductory-comma', 'Nevertheless the pattern is consistent.'],

  // --- articles ---
  ['article-a-an', 'A unexpected outcome emerged in phase two.'],
  ['article-a-an', 'This is an historic misreading of a common rule.'],
  ['article-a-an', 'The study produced a extraordinary result.'],

  // --- confusables ---
  ['its-verb', 'Its is clear that the argument is circular.'],
  ['then-compare', 'The effect was more significant then anticipated.'],
  ['then-compare', 'The result was better then expected.'],
  ['their-is', 'Their is no evidence for this claim.'],
  ['there-poss', 'The authors published there findings in 2019.'],
  ['lead-past', 'This has lead to considerable confusion.'],
  ['amount-count', 'The amount of participants who withdrew was high.'],
  ['less-count', 'There were less participants than expected.'],
  ['decades-apostrophe', 'The debate began in the 1990\'s.'],
  ['comprised-of', 'The corpus is comprised of 240 reviews.'],
  ['different-than', 'This reading is different than the standard one.'],
  ['discuss-about', 'The chapter discusses about the reception of the work.'],
  ['research-plural', 'Recent researches have addressed this question.'],
  ['informations', 'The informations were gathered from three archives.'],
  ['irregardless', 'Irregardless of the outcome, the method holds.'],

  // --- spelling ---
  ['misspelling', 'The data was recieved from three archives.'],
  ['misspelling', 'The two groups were seperate throughout.'],
  ['misspelling', 'This occured during the second phase.'],
  ['misspelling', 'The arguement rests on a single premise.'],
  ['misspelling', 'The results are definately significant.'],
  ['misspelling', 'The methodolgy section is incomplete.'],
  ['misspelling', 'This is neccessary for the analysis.'],
  ['misspelling', 'The enviroment shaped the outcome.'],

  // --- mechanics ---
  ['doubled-word', 'The the results are inconclusive.'],
  ['lowercase-i', 'In this chapter i argue for a different reading.'],
  ['space-before-punctuation', 'The result was clear , though contested.'],
  ['repeated-punctuation', 'Could this be the explanation??'],
  ['double-negative', 'The study does not provide no evidence for this.']
];

/*
 * Correct academic prose. Every one of these must produce zero findings in
 * the `grammar` and `typo` categories. Style observations are allowed.
 */
export const NEGATIVE = [
  'The participants were interviewed in June and their responses were coded independently.',
  'The findings have been reported in Table 2, alongside the confidence intervals.',
  'The criteria are not met by any of the four cases examined here.',
  'This phenomenon is well documented in the comparative literature.',
  'The data were collected over two years by a team of four researchers.',
  'There are many reasons to doubt this conclusion, and the chapter examines three.',
  'These results show a downward trend across the period under discussion.',
  'Several studies confirm the pattern, though none accounts for the outliers.',
  'The sample was small; the authors nevertheless claim the finding is robust.',
  'Although the framework is useful in several respects, it cannot explain the anomaly.',
  'However, the chronology does not support that reading of the evidence.',
  'An unexpected outcome emerged during the second phase of the fieldwork.',
  'A unified account of the period has yet to be written.',
  'A one-sided reading of the archive produces exactly this error.',
  'An hour of close reading yields more than a week of theory.',
  'It is clear that the argument depends on a single contested premise.',
  'The effect was more significant than the authors had anticipated.',
  'The number of participants who withdrew was higher than expected.',
  'There were fewer participants than the design required.',
  'The debate began in the 1990s and has not been settled.',
  'The corpus comprises 240 reviews published between 1990 and 2015.',
  'This reading is different from the standard one in three respects.',
  'The chapter discusses the reception of the work in Turkish periodicals.',
  'Recent research has addressed this question from several directions.',
  'The information was gathered from three separate archives.',
  'Regardless of the outcome, the method holds for the wider corpus.',
  'The analysis is complete and the results are summarised below.',
  'The process is slow, but it is reliable under the stated conditions.',
  'The series is long enough to support a time-series analysis.',
  'The status of the manuscript remains unclear.',
  'Many people were involved in the transcription of the interviews.',
  'These children were tested twice, six months apart.',
  'Much of this research is new and has not yet been replicated.',
  'The corpus consists of 240 reviews, coded by two independent readers.',
  'Prior work by Venuti established the framing, and Bassnett extended it.',
  'We reviewed the archive; more work then began on the corpus itself.',
  'She read the earlier draft, then the later one, and noted the changes.',
  'The theory is elegant; it is also, as the next section argues, untestable.',
  'Neither account explains the divergence between the two datasets.',
  'Each of the four cases meets the criterion set out in Chapter 2.',
  'The author argues that form and history are inseparable in this period.',
  'Its significance lies in the method rather than the conclusion.',
  'The committee recommended that the thesis be revised and resubmitted.',
  'Had the sample been larger, the correlation might have reached significance.',
  'What the archive shows is not what the published account records.'
];
