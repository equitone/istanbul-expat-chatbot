/*
 * lexicons.js — word lists shared by the mechanics, grammar and argument
 * analysers. Kept in one place so a supervisor can tune the tool to a
 * discipline by editing lists rather than logic.
 */

/* ------------------------------------------------------------------ typos */
/* Misspelling -> correction. Deliberately excludes British/American variants,
   which are handled separately as a consistency check, not as errors.        */
export const MISSPELLINGS = {
  teh: 'the', hte: 'the', adn: 'and', taht: 'that', tihs: 'this', tje: 'the',
  recieve: 'receive', recieved: 'received', recieving: 'receiving',
  seperate: 'separate', seperated: 'separated', seperately: 'separately',
  seperation: 'separation', occured: 'occurred', occuring: 'occurring',
  occurence: 'occurrence', occurences: 'occurrences',
  definately: 'definitely', defiantly: 'definitely', definatly: 'definitely',
  arguement: 'argument', arguements: 'arguments',
  existance: 'existence', existant: 'existent',
  phenomenom: 'phenomenon', phenomenons: 'phenomena',
  thier: 'their', thre: 'there', wich: 'which', whcih: 'which',
  becuase: 'because', becasue: 'because', beacuse: 'because',
  neccessary: 'necessary', necesary: 'necessary', neccesary: 'necessary',
  accomodate: 'accommodate', accomodated: 'accommodated',
  refering: 'referring', refered: 'referred',
  developement: 'development', developped: 'developed',
  independant: 'independent', independance: 'independence',
  publically: 'publicly', priviledge: 'privilege',
  questionaire: 'questionnaire', rythm: 'rhythm', rhythem: 'rhythm',
  succesful: 'successful', succesfully: 'successfully', sucessful: 'successful',
  untill: 'until', wierd: 'weird', writting: 'writing', writen: 'written',
  begining: 'beginning', beleive: 'believe', beleived: 'believed',
  concious: 'conscious', consciousnes: 'consciousness',
  enviroment: 'environment', enviromental: 'environmental',
  goverment: 'government', knowlege: 'knowledge', knowldege: 'knowledge',
  maintainance: 'maintenance', mispelled: 'misspelled',
  noticable: 'noticeable', ocassion: 'occasion', paralel: 'parallel',
  perseverence: 'perseverance', posession: 'possession', preceeding: 'preceding',
  reccomend: 'recommend', reccommend: 'recommend', refrence: 'reference',
  relevent: 'relevant', reserach: 'research', researh: 'research',
  responsability: 'responsibility', similiar: 'similar', sincerly: 'sincerely',
  supress: 'suppress', tendancy: 'tendency', tommorow: 'tomorrow',
  unfortunatly: 'unfortunately', usefull: 'useful', vaccum: 'vacuum',
  wheras: 'whereas', whereever: 'wherever', acheive: 'achieve',
  acheived: 'achieved', aquire: 'acquire', apparant: 'apparent',
  assesment: 'assessment', attendence: 'attendance', calender: 'calendar',
  catagory: 'category', cemetary: 'cemetery', changable: 'changeable',
  collegue: 'colleague', comittee: 'committee', commited: 'committed',
  comparision: 'comparison', consenus: 'consensus', critisism: 'criticism',
  decison: 'decision', dependant: 'dependent', descrimination: 'discrimination',
  desicion: 'decision', dilemna: 'dilemma', dissapear: 'disappear',
  dissapoint: 'disappoint', embarass: 'embarrass',
  espesially: 'especially', excercise: 'exercise', experiance: 'experience',
  explaination: 'explanation', familar: 'familiar', finaly: 'finally',
  foriegn: 'foreign', fourty: 'forty', fullfil: 'fulfil', garantee: 'guarantee',
  grammer: 'grammar', harrassment: 'harassment', hierachy: 'hierarchy',
  hipocrisy: 'hypocrisy', humourous: 'humorous', hygeine: 'hygiene',
  ignorence: 'ignorance', immediatly: 'immediately', incidently: 'incidentally',
  inevitible: 'inevitable', inteligence: 'intelligence', interupt: 'interrupt',
  irrelevent: 'irrelevant',
  labratory: 'laboratory', liason: 'liaison', libary: 'library',
  lisence: 'licence', millenium: 'millennium', miniture: 'miniature',
  narritive: 'narrative', occassion: 'occasion', opperation: 'operation',
  oppurtunity: 'opportunity', particulary: 'particularly',
  peice: 'piece', performence: 'performance',
  persistant: 'persistent', personel: 'personnel', persue: 'pursue',
  pharoah: 'pharaoh', posses: 'possess', potentialy: 'potentially',
  practicaly: 'practically', preferance: 'preference', prejudise: 'prejudice',
  presance: 'presence', primative: 'primitive', probaly: 'probably',
  proffesor: 'professor', promiss: 'promise', pronounciation: 'pronunciation',
  proove: 'prove', psycology: 'psychology',
  recomend: 'recommend', reguarding: 'regarding', religous: 'religious',
  repitition: 'repetition', restarant: 'restaurant', rediculous: 'ridiculous',
  saftey: 'safety', sattelite: 'satellite', scedule: 'schedule',
  secratary: 'secretary', sieze: 'seize', sence: 'sense', sepulchure: 'sepulchre',
  sergent: 'sergeant', similarily: 'similarly', sofisticated: 'sophisticated',
  speach: 'speech', stategy: 'strategy', strenght: 'strength',
  strengh: 'strength', succede: 'succeed', suprise: 'surprise',
  suprising: 'surprising', temperture: 'temperature', theif: 'thief',
  therefor: 'therefore', threshhold: 'threshold', throughly: 'thoroughly',
  tounge: 'tongue', truely: 'truly', twelth: 'twelfth', tyrany: 'tyranny',
  underate: 'underrate', unecessary: 'unnecessary', unforseen: 'unforeseen',
  varius: 'various', vegatarian: 'vegetarian', vehical: 'vehicle',
  visable: 'visible', wether: 'whether', whislt: 'whilst', wilfull: 'wilful',
  withold: 'withhold', yeild: 'yield', analize: 'analyse', paticipant: 'participant',
  participent: 'participant', sistematic: 'systematic',
  litrature: 'literature', litreature: 'literature', bibliograpy: 'bibliography',
  methedology: 'methodology', methodolgy: 'methodology', reserch: 'research',
  discusion: 'discussion', conclussion: 'conclusion', introducton: 'introduction',
  significiant: 'significant', signifcant: 'significant', evidance: 'evidence',
  therory: 'theory', theorectical: 'theoretical', empirial: 'empirical',
  qualatative: 'qualitative', quantative: 'quantitative', varaible: 'variable',
  corelation: 'correlation', coeficient: 'coefficient', paramater: 'parameter',
  aproach: 'approach', framwork: 'framework', pespective: 'perspective',
  intepretation: 'interpretation', asumption: 'assumption', anlysis: 'analysis',
  analsis: 'analysis', arguemnt: 'argument', reserarch: 'research'
};

/* Spelling variants: not errors, but mixing them inside one thesis is. */
export const SPELLING_VARIANTS = [
  { us: 'analyze', uk: 'analyse' }, { us: 'analyzed', uk: 'analysed' },
  { us: 'analyzing', uk: 'analysing' }, { us: 'organize', uk: 'organise' },
  { us: 'organized', uk: 'organised' }, { us: 'organization', uk: 'organisation' },
  { us: 'recognize', uk: 'recognise' }, { us: 'recognized', uk: 'recognised' },
  { us: 'emphasize', uk: 'emphasise' }, { us: 'emphasized', uk: 'emphasised' },
  { us: 'criticize', uk: 'criticise' }, { us: 'characterize', uk: 'characterise' },
  { us: 'summarize', uk: 'summarise' }, { us: 'conceptualize', uk: 'conceptualise' },
  { us: 'theorize', uk: 'theorise' }, { us: 'hypothesize', uk: 'hypothesise' },
  { us: 'behavior', uk: 'behaviour' }, { us: 'behavioral', uk: 'behavioural' },
  { us: 'color', uk: 'colour' }, { us: 'labor', uk: 'labour' },
  { us: 'favor', uk: 'favour' }, { us: 'honor', uk: 'honour' },
  { us: 'center', uk: 'centre' }, { us: 'centered', uk: 'centred' },
  { us: 'theater', uk: 'theatre' }, { us: 'meter', uk: 'metre' },
  { us: 'defense', uk: 'defence' }, { us: 'offense', uk: 'offence' },
  { us: 'license', uk: 'licence' }, { us: 'practice', uk: 'practise' },
  { us: 'program', uk: 'programme' }, { us: 'modeling', uk: 'modelling' },
  { us: 'labeled', uk: 'labelled' }, { us: 'traveled', uk: 'travelled' },
  { us: 'fulfill', uk: 'fulfil' }, { us: 'skillful', uk: 'skilful' },
  { us: 'judgment', uk: 'judgement' }, { us: 'aging', uk: 'ageing' },
  { us: 'catalog', uk: 'catalogue' }, { us: 'dialog', uk: 'dialogue' },
  { us: 'toward', uk: 'towards' }, { us: 'while', uk: 'whilst' },
  { us: 'among', uk: 'amongst' }
];

/* -------------------------------------------------------------- confusions */
/* Pairs where the wrong member is a real word, so a dictionary never catches it.
   `test` receives the surrounding sentence's lowercase word array + index.     */
export const CONFUSABLES = [
  { word: 'its', message: "“its” is possessive; “it's” means “it is”.", hint: 'Read it aloud as “it is” — if that works, you need “it’s”.' },
  { word: "it's", message: "“it's” means “it is”; the possessive is “its”.", hint: 'If you mean “belonging to it”, drop the apostrophe.' },
  { word: 'their', message: '“their” = possessive, “there” = place, “they’re” = they are.' },
  { word: 'there', message: '“there” = place, “their” = possessive, “they’re” = they are.' },
  { word: 'affect', message: '“affect” is usually the verb, “effect” the noun.' },
  { word: 'effect', message: '“effect” is usually the noun, “affect” the verb.' },
  { word: 'then', message: '“then” = time, “than” = comparison.' },
  { word: 'than', message: '“than” = comparison, “then” = time.' },
  { word: 'principle', message: '“principle” = rule, “principal” = chief/head.' },
  { word: 'principal', message: '“principal” = chief/head, “principle” = rule.' },
  { word: 'complement', message: '“complement” = completes, “compliment” = praise.' },
  { word: 'cite', message: '“cite” = quote a source, “site” = place, “sight” = vision.' },
  { word: 'lead', message: 'Past tense of “lead” is “led”.' },
  { word: 'discrete', message: '“discrete” = separate, “discreet” = tactful.' },
  { word: 'elicit', message: '“elicit” = draw out, “illicit” = unlawful.' },
  { word: 'imply', message: 'A writer implies; a reader infers.' },
  { word: 'infer', message: 'A reader infers; a writer implies.' }
];

/* Context-triggered confusions: regex over the raw sentence. High precision only. */
export const CONFUSION_PATTERNS = [
  { id: 'its-verb', re: /\bits\s+(is|was|are|were|been|being|not\b)/gi, message: "Looks like “it's” (it is) was intended.", suggest: "it's" },
  { id: 'affect-article', re: /\b(the|an|this|that|its|his|her|their|any|no|some|main|primary|overall|net)\s+(affect)s?\b/gi, message: 'After an article/possessive you almost always want the noun “effect”.', suggest: 'effect' },
  { id: 'effect-verb', re: /\b(to|will|would|may|might|can|could|does|did|not)\s+(effect)\s+(the|a|an|their|its|his|her|this|these|those)\b/gi, message: 'As a verb meaning “to influence”, use “affect”.', suggest: 'affect' },
  { id: 'then-compare', re: /\b(more|less|fewer|greater|higher|lower|better|worse|larger|smaller|rather|other)\s+then\b/gi, message: 'Comparison takes “than”, not “then”.', suggest: 'than' },
  { id: 'there-poss', re: /\bthere\s+(own|respective|findings|results|argument|arguments|claim|claims|work|study|analysis|data|participants|responses|views|methods)\b/gi, message: 'Possessive here — use “their”.', suggest: 'their' },
  { id: 'their-is', re: /\btheir\s+(is|are|was|were)\b/gi, message: 'Existential “there is/are”, not “their”.', suggest: 'there' },
  { id: 'lead-past', re: /\b(has|have|had|was|were|which|that|this)\s+lead\s+to\b/gi, message: 'Past tense of “lead” is “led”.', suggest: 'led' },
  { id: 'loose-lose', re: /\bloose\s+(the|their|its|his|her|significance|meaning|value|credibility)\b/gi, message: '“lose” is the verb; “loose” means not tight.', suggest: 'lose' },
  { id: 'whos-poss', re: /\bwho's\s+(work|study|argument|theory|book|article|findings|research)\b/gi, message: 'Possessive is “whose”.', suggest: 'whose' },
  { id: 'to-too', re: /\b(is|are|was|were|seems|appears)\s+to\s+(broad|narrow|vague|simple|complex|general|weak|strong|small|large|early|late|much|many)\b/gi, message: 'Intensifier “too”, not “to”.', suggest: 'too' },
  { id: 'amount-count', re: /\bamount\s+of\s+(participants|students|studies|articles|papers|cases|respondents|examples|sources|texts|works|people|authors|variables|items|factors)\b/gi, message: 'Countable noun — use “number of”.', suggest: 'number of' },
  { id: 'less-count', re: /\bless\s+(participants|students|studies|articles|papers|cases|respondents|examples|sources|texts|works|people|authors|variables|items|factors|words)\b/gi, message: 'Countable noun — use “fewer”.', suggest: 'fewer' },
  { id: 'decades-apostrophe', re: /\b(1[89]|20)\d0's\b/g, message: 'Decades take no apostrophe.', suggest: 'e.g. 1990s' },
  { id: 'comprised-of', re: /\bcomprised\s+of\b/gi, message: '“comprise” already means “consist of”; use “composed of” or “comprises”.', suggest: 'composed of' },
  { id: 'different-than', re: /\bdifferent\s+than\b/gi, message: 'Academic English prefers “different from”.', suggest: 'different from' },
  { id: 'based-of', re: /\bbased\s+of\b/gi, message: '“based on”.', suggest: 'based on' },
  { id: 'discuss-about', re: /\bdiscuss(?:es|ed|ing)?\s+about\b/gi, message: '“discuss” takes no “about”.', suggest: 'discuss' },
  { id: 'emphasise-on', re: /\bemphasi[sz]e[sd]?\s+on\b/gi, message: '“emphasise” takes no “on” (or use “place emphasis on”).', suggest: 'emphasise' },
  { id: 'research-plural', re: /\bresearch(?:es)\b/gi, message: '“research” is uncountable; use “studies” or “research”.', suggest: 'studies' },
  { id: 'literatures', re: /\bliteratures\b/gi, message: '“literature” is uncountable in the review sense.', suggest: 'literature' },
  { id: 'informations', re: /\b(information|evidence|advice|feedback|knowledge)s\b/gi, message: 'Uncountable noun — no plural “s”.', suggest: '' },
  { id: 'the-most-unique', re: /\b(very|most|quite|extremely|rather)\s+(unique|essential|fundamental|crucial|perfect|absolute)\b/gi, message: 'Absolute adjective — it cannot be graded.', suggest: '' },
  { id: 'irregardless', re: /\birregardless\b/gi, message: 'Non-standard; use “regardless”.', suggest: 'regardless' },
  { id: 'alot', re: /\ba\s?lot\s+of\b/gi, message: 'Informal for academic prose; prefer “many”/“much”/“a great deal of”.', suggest: 'many' }
];

/* ------------------------------------------------------------- wordiness */
export const WORDY_PHRASES = [
  { re: /\bin order to\b/gi, suggest: 'to' },
  { re: /\bdue to the fact that\b/gi, suggest: 'because' },
  { re: /\bowing to the fact that\b/gi, suggest: 'because' },
  { re: /\bin spite of the fact that\b/gi, suggest: 'although' },
  { re: /\bdespite the fact that\b/gi, suggest: 'although' },
  { re: /\bin the event that\b/gi, suggest: 'if' },
  { re: /\bat this point in time\b/gi, suggest: 'now' },
  { re: /\bat the present time\b/gi, suggest: 'now' },
  { re: /\ba (?:large|great) number of\b/gi, suggest: 'many' },
  { re: /\ba (?:small|limited) number of\b/gi, suggest: 'few' },
  { re: /\bthe majority of\b/gi, suggest: 'most' },
  { re: /\bin the case of\b/gi, suggest: 'for' },
  { re: /\bwith regard to\b/gi, suggest: 'about / regarding' },
  { re: /\bwith reference to\b/gi, suggest: 'about' },
  { re: /\bit is important to note that\b/gi, suggest: '(delete — then state the point)' },
  { re: /\bit should be noted that\b/gi, suggest: '(delete)' },
  { re: /\bit is worth mentioning that\b/gi, suggest: '(delete)' },
  { re: /\bthe fact that\b/gi, suggest: 'that' },
  { re: /\bin terms of\b/gi, suggest: '(often deletable)' },
  { re: /\bfor the purpose of\b/gi, suggest: 'to' },
  { re: /\bin the process of\b/gi, suggest: '(often deletable)' },
  { re: /\bhas the ability to\b/gi, suggest: 'can' },
  { re: /\bis able to\b/gi, suggest: 'can' },
  { re: /\bmake(?:s)? (?:a )?reference to\b/gi, suggest: 'refers to' },
  { re: /\bconduct(?:s|ed)? an analysis of\b/gi, suggest: 'analyses' },
  { re: /\bcarr(?:y|ies|ied) out an investigation\b/gi, suggest: 'investigates' },
  { re: /\bplay(?:s|ed)? an important role in\b/gi, suggest: '(name the role)' },
  { re: /\bas a matter of fact\b/gi, suggest: '(delete)' },
  { re: /\bfirst and foremost\b/gi, suggest: 'first' },
  { re: /\beach and every\b/gi, suggest: 'each' },
  { re: /\bcompletely eliminate\b/gi, suggest: 'eliminate' },
  { re: /\bend result\b/gi, suggest: 'result' },
  { re: /\bfinal outcome\b/gi, suggest: 'outcome' },
  { re: /\bpast history\b/gi, suggest: 'history' },
  { re: /\bfuture plans?\b/gi, suggest: 'plans' },
  { re: /\bbasic fundamentals?\b/gi, suggest: 'fundamentals' },
  { re: /\bnew innovation\b/gi, suggest: 'innovation' },
  { re: /\bclosely scrutinise[sd]?\b/gi, suggest: 'scrutinise' }
];

/* ------------------------------------------------------- argument markers */
export const HEDGES = [
  'may', 'might', 'could', 'perhaps', 'possibly', 'probably', 'arguably',
  'apparently', 'seemingly', 'presumably', 'relatively', 'somewhat',
  'generally', 'typically', 'often', 'sometimes', 'usually', 'largely',
  'partly', 'partially', 'appears', 'appear', 'seems', 'seem', 'suggests',
  'suggest', 'indicates', 'indicate', 'tends', 'tend', 'assume', 'assumed',
  'likely', 'unlikely', 'plausible', 'plausibly', 'potentially', 'roughly',
  'approximately', 'broadly', 'tentatively', 'conceivably'
];

export const HEDGE_PHRASES = [
  'to some extent', 'to a certain extent', 'in some cases', 'in most cases',
  'it is possible that', 'it may be that', 'one could argue', 'it would seem',
  'if this is correct', 'on balance', 'by and large'
];

export const BOOSTERS = [
  'clearly', 'obviously', 'evidently', 'undoubtedly', 'undeniably',
  'certainly', 'definitely', 'absolutely', 'unquestionably', 'indisputably',
  'always', 'never', 'all', 'every', 'none', 'must', 'proves', 'proven',
  'prove', 'conclusively', 'irrefutably', 'inevitably', 'necessarily',
  'entirely', 'completely', 'totally', 'utterly', 'perfectly', 'purely'
];

export const BOOSTER_PHRASES = [
  'it is well known', 'it is obvious', 'everyone knows', 'without a doubt',
  'without doubt', 'there is no doubt', 'it goes without saying',
  'it is clear that', 'no one can deny', 'it cannot be denied',
  'beyond any doubt', 'the fact is that'
];

export const CLAIM_VERBS = [
  'demonstrates', 'demonstrate', 'shows', 'show', 'proves', 'prove',
  'reveals', 'reveal', 'establishes', 'establish', 'confirms', 'confirm',
  'argues', 'argue', 'contends', 'contend', 'asserts', 'assert',
  'implies', 'imply', 'indicates', 'indicate', 'illustrates', 'illustrate',
  'highlights', 'highlight', 'underscores', 'underscore', 'signifies',
  'means', 'reflects', 'reflect', 'suggests', 'suggest', 'confirms'
];

export const EVALUATIVE_ADJECTIVES = [
  'crucial', 'critical', 'essential', 'significant', 'important', 'vital',
  'fundamental', 'central', 'key', 'profound', 'remarkable', 'striking',
  'compelling', 'convincing', 'problematic', 'flawed', 'inadequate',
  'superior', 'inferior', 'best', 'worst', 'unprecedented', 'radical'
];

export const WARRANT_MARKERS = [
  'because', 'since', 'therefore', 'thus', 'hence', 'consequently',
  'accordingly', 'as a result', 'given that', 'it follows that',
  'for this reason', 'insofar as', 'in that', 'so that', 'which means',
  'this is why', 'on the grounds that', 'owing to', 'due to'
];

export const EVIDENCE_MARKERS = [
  'for example', 'for instance', 'such as', 'according to', 'as shown in',
  'as reported by', 'data show', 'data suggest', 'the results', 'the findings',
  'evidence from', 'in the survey', 'in the interview', 'participants reported',
  'the sample', 'table', 'figure', 'appendix', 'as cited in', 'quoted in',
  'the study found', 'statistics show', 'as demonstrated by'
];

export const COUNTER_MARKERS = [
  'however', 'nevertheless', 'nonetheless', 'although', 'though', 'whereas',
  'conversely', 'by contrast', 'in contrast', 'on the other hand',
  'admittedly', 'granted', 'critics', 'objection', 'one might object',
  'it could be argued that', 'opponents', 'detractors', 'sceptics',
  'skeptics', 'counterargument', 'while some', 'some scholars argue',
  'a possible objection', 'this view has been challenged', 'yet',
  'despite', 'in spite of', 'even if', 'even though', 'alternatively'
];

export const CONNECTIVES = [
  'however', 'therefore', 'moreover', 'furthermore', 'thus', 'hence',
  'consequently', 'nevertheless', 'nonetheless', 'similarly', 'likewise',
  'conversely', 'meanwhile', 'additionally', 'accordingly', 'instead',
  'otherwise', 'indeed', 'finally', 'first', 'second', 'third', 'firstly',
  'secondly', 'thirdly', 'subsequently', 'overall', 'in conclusion',
  'in summary', 'by contrast', 'for example', 'for instance', 'in particular',
  'in addition', 'as a result', 'on the contrary', 'that is', 'in other words'
];

/* Conjunctive adverbs that produce comma splices when used as a joiner. */
export const CONJUNCTIVE_ADVERBS = [
  'however', 'therefore', 'moreover', 'furthermore', 'thus', 'hence',
  'consequently', 'nevertheless', 'nonetheless', 'otherwise', 'instead',
  'meanwhile', 'accordingly', 'besides', 'likewise', 'similarly'
];

/* Personal / informal register, discouraged in most thesis styles. */
export const INFORMAL = [
  { re: /\b(?:don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|shouldn't|wouldn't|couldn't|it's|that's|there's|let's)\b/gi, message: 'Contraction — spell it out in formal academic prose.' },
  { re: /\b(?:kind of|sort of|a bit|pretty much|stuff|things like that|and so on and so forth|etc\.\s*etc\.)\b/gi, message: 'Vague/informal filler.' },
  { re: /\b(?:huge|massive|tiny|awesome|terrible|amazing|nice|good|bad)\b/gi, message: 'Imprecise evaluative word — prefer a specific term.' },
  { re: /\b(?:I think|I feel|I believe|in my opinion|to be honest|personally)\b/gi, message: 'Unhedged personal opinion — restate as a supported claim.' },
  { re: /\byou\b/gi, message: 'Second person “you” is rare in a thesis; use “one” or rephrase.' }
];

/* Section names expected in a standard empirical or humanities thesis. */
export const EXPECTED_SECTIONS = [
  { key: 'abstract', labels: ['abstract', 'summary'] },
  { key: 'introduction', labels: ['introduction', 'background'] },
  { key: 'literature', labels: ['literature review', 'related work', 'theoretical framework', 'literature'] },
  { key: 'method', labels: ['methodology', 'methods', 'method', 'research design', 'materials and methods'] },
  { key: 'results', labels: ['results', 'findings', 'analysis'] },
  { key: 'discussion', labels: ['discussion', 'interpretation'] },
  { key: 'conclusion', labels: ['conclusion', 'conclusions', 'concluding remarks'] },
  { key: 'references', labels: ['references', 'bibliography', 'works cited'] }
];

/* Words ignored when computing topical overlap between paragraphs. */
export const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been
before being below between both but by can cannot could did do does doing down during each few for from further had has
have having he her here hers herself him himself his how i if in into is it its itself me more most my myself no nor not
of off on once only or other ought our ours ourselves out over own same she should so some such than that the their theirs
them themselves then there these they this those through to too under until up very was we were what when where which
while who whom why with would you your yours yourself yourselves also may might must shall will one two three thus hence
however therefore within upon among across per via given whether either neither both several many much less least often
sometimes always never study research paper thesis chapter section author authors work works used using use based
different various such well although though since being able make made makes take taken new`.trim().split(/\s+/));
