import {
  createPublicationArtifact,
  PUBLICATION_STATUSES,
} from '@genemap/shared';

const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const TASKS = Object.freeze({
  AGGREGATE_RESEARCH: 'aggregate_genomics_research',
  CANDIDATE_GENE: 'candidate_gene_research',
  GENETICS_EDUCATION: 'genetics_education',
  RESEARCH_HYPOTHESIS: 'research_hypothesis',
  LEARNING_ACTIVITY: 'learning_activity_summary',
});
const RESEARCH_TASKS = new Set([
  TASKS.AGGREGATE_RESEARCH,
  TASKS.RESEARCH_HYPOTHESIS,
]);
const ALLOWED_QUERY_TYPES = new Set(['disease', 'phenotype', 'hpo_term']);
const WITHHELD_PROFILE_SUMMARY = 'Generated profile withheld because the response crossed GeneMap Discovery\'s non-clinical publication boundary. No clinical guidance was shown.';
const UNAVAILABLE_PROFILE_SUMMARY = 'Generated profile unavailable. This gene remains an unverified AI-suggested candidate lead; verify relevance in cited authoritative sources.';

const MEDICATION_NAME_PATTERN = '(?:aspirin|ibuprofen|acetaminophen|paracetamol|naproxen|warfarin|heparin|insulin|metformin|glipizide|semaglutide|liraglutide|atorvastatin|rosuvastatin|simvastatin|lisinopril|losartan|amlodipine|metoprolol|carvedilol|levothyroxine|methimazole|prednisone|amoxicillin|azithromycin|doxycycline|ciprofloxacin|gabapentin|pregabalin|sertraline|fluoxetine|escitalopram|omeprazole|pantoprazole|albuterol|epinephrine|naloxone|[a-z]{4,}(?:mab|nib|pril|sartan|olol|statin|cillin|cycline|azole|vir|caine))';

const OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET = '(?:(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+)?(?:(?:a|an|the|this|that|these|those|your|their)\\s+)?(?:(?:new|current|proposed|statistical|research|analytical|alternative|further|additional|aggregate|deidentified|population(?:[- ]?level)|cohort(?:[- ]?level)|genetic|genomic|educational|laboratory|lab|cultured|patient\\s*derived)\\s+)?(?:example|examples|following|case|cases|concept|concepts|data|dataset|datasets|analysis|analyses|research|reviewing|comparing|examining|analyzing|checking|reading|validating|verifying|exploring|bias|selection|ascertainment|confounding|outlier|outliers|pipeline|workflow|iteration|simulation|model|models|server|service|process|query|queries|study|studies|survey|surveys|quiz|quizzes|understanding|knowledge|performance|set|sets|experiment|experiments|calculation|calculations|comparison|comparisons|code|script|job|request|requests|method|methods|algorithm|algorithms|regression|software|tool|tools|database|databases|library|libraries|reference|references|equation|equations|formula|formulas|hypothesis|hypotheses|metric|metrics|statistic|statistics|result|results|evidence|field|fields|variable|variables|record|records|table|tables|figure|figures|chart|charts|sample|samples|specimen|specimens|cell|cells|culture|cultures|reagent|reagents|assay|assays|protein|proteins|cohort|cohorts|variant|variants|coordinate|coordinates|site|sites|signal|signals|codon|codons|cross|crosses|allele|alleles|pedigree|pedigrees|inheritance|gene|genes|chromosome|chromosomes|dna|rna|p\\s*c\\s*r|c\\s*r\\s*i\\s*s\\s*p\\s*r|sequencing|translation|transcription|p\\s*u\\s*n\\s*n\\s*e\\s*t\\s*t\\s+squares?|measurement|measurements|source|sources|lesson|section|reading|learning|education|validation|verification|review|coverage|threshold|resolution|sensitivity|specificity|power))';
const GENERIC_CLINICAL_ACTION = '(?:take|try|consume|ingest|swallow|chew|drink|dissolve|inhale|spray|inject|administer|prescribe|dose|medicate|redose|refill|combine|restart|re\\s*start|hold|pause|cease|maintain|replace|substitute|remove|add|keep\\s+(?:taking|using)|receive|give|initiate|manage|start|begin|resume|continue|stop|discontinue|skip|taper|increase|decrease|avoid|apply|rub|insert|place|wear|use|undergo|schedule|screen|test|diagnose|treat|monitor|switch(?:\\s+to)?)';
const GENERIC_CLINICAL_ACTION_GERUND = '(?:taking|trying|consuming|ingesting|swallowing|chewing|drinking|dissolving|inhaling|spraying|injecting|administering|prescribing|dosing|medicating|redosing|refilling|combining|restarting|holding|pausing|ceasing|maintaining|replacing|substituting|removing|adding|receiving|giving|initiating|managing|starting|beginning|resuming|continuing|stopping|discontinuing|skipping|tapering|increasing|decreasing|avoiding|applying|rubbing|inserting|placing|wearing|using|undergoing|scheduling|screening|testing|diagnosing|treating|monitoring|switching(?:\\s+to)?)';
const GENERIC_CLINICAL_ACTION_PAST = '(?:taken|tried|consumed|ingested|swallowed|chewed|drunk|dissolved|inhaled|sprayed|injected|administered|prescribed|dosed|medicated|redosed|refilled|combined|restarted|held|paused|ceased|maintained|replaced|substituted|removed|added|received|given|initiated|managed|started|resumed|continued|stopped|discontinued|skipped|tapered|increased|decreased|avoided|applied|rubbed|inserted|placed|worn|undergone|scheduled|screened|tested|diagnosed|treated|monitored|switched\\s+to)';
const PASSIVE_CLINICAL_ACTION_PAST = `(?:used|${GENERIC_CLINICAL_ACTION_PAST})`;
const CLINICAL_SUBJECT = '(?:you|patients?|the\\s+patients?|this\\s+patient|these\\s+patients|the\\s+individual|individuals?|your\\s+child|children|adults?|family\\s+members?)';
// Semantic projection separates letter/digit boundaries so identifiers such as
// `X-17` become `X 17`. Keep that normalized suffix attached to the passive
// subject; otherwise an unreviewed identifier can evade percentage handling.
const PASSIVE_USE_SUBJECT = `(?:[\\p{L}][\\p{L}\\p{N}'-]{0,63}(?:\\s+\\d{1,63})?|\\d{1,63})`;
const PASSIVE_USE_AUXILIARY = '(?:is|are|was|were|has|have|had|may|might|can|could|would|should|must|will|needs?|ought)';
const PASSIVE_USE_STRONG_MODAL_AUXILIARY = '(?:(?:should|must|will|needs?|has|have|had|ought)\\b|is\\s+to\\b)';
const PASSIVE_USE_PERSON_TARGET = `(?:you|your\\s+child|(?:(?:the|this|these)\\s+)?(?:patients?|individuals?|children)(?![-\\s]+(?:derived|samples?|data|records?|cohorts?|cells?|specimens?))|(?:the|this)\\s+child|family\\s+members?)`;
const PASSIVE_USE_PERSONALIZED_CONTEXT = `(?:(?:for|on|in|into|to|by|among)\\s+${PASSIVE_USE_PERSON_TARGET}|when\\s+(?:treating|screening|monitoring|diagnosing)\\s+${PASSIVE_USE_PERSON_TARGET}|your\\s+(?:symptoms?|treatment|therapy|medication|medicine|drug|dose|dosing|screening|diagnosis|prognosis|genes?|genome|dna|variants?)|(?:in|for)\\s+(?:clinical|medical)\\s+care|during\\s+your\\s+(?:treatment|therapy|screening|clinical\\s+care|medical\\s+care))`;
const PASSIVE_USE_CLINICAL_INDICATION = '(?:pain|symptoms?|headaches?|migraines?|inflammation|hypertension|diabetes|cancer|asthma|fever|seizures?|infections?|cystic\\s+fibrosis|(?:[\\p{L}-]+\\s+){0,2}(?:disease|disorder|syndrome)|(?!(?:mitosis|meiosis)\\b)[\\p{L}-]+(?:itis|osis|emia|oma|pathy))';
const PASSIVE_USE_CLINICAL_TARGET = `(?:${PASSIVE_USE_CLINICAL_INDICATION}|(?:you|your\\s+child|(?:the|this|these)\\s+(?:patients?|individuals?|children)|patients?|individuals?|children)(?!-(?:derived|reported)\\b|\\s+(?:derived|samples?|data|records?|cohorts?|cells?|specimens?)))`;
const PASSIVE_USE_CLINICAL_PURPOSE = `(?:(?:to|for|in)\\s+(?:treat|treating|manage|managing|diagnose|diagnosing|screen|screening|monitor|monitoring|relieve|relieving|reduce|reducing|prevent|preventing)\\s+(?:(?:a|an|the|this|these)\\s+)?${PASSIVE_USE_CLINICAL_TARGET}\\b|(?:for|against)\\s+${PASSIVE_USE_CLINICAL_INDICATION}\\b(?!\\s+(?:research|stud(?:y|ies)|analysis|model(?:s|ing)?|dataset|samples?|cells?))|(?:as|for)\\s+(?:a\\s+|the\\s+)?(?:treatment|therapy|medication)(?:\\s+of\\s+${PASSIVE_USE_CLINICAL_INDICATION})?)`;
const CLINICAL_QUANTITY = '(?:\\d+(?:\\.\\d+)?|\\.\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|half|quarter)';
const CLINICAL_DOSE_UNIT = '(?:mg|mcg|μg|ug|ng|g|ml|cc|iu|units?|grams?|milli?grams?|micrograms?|nanograms?|milliliters?)';
const CLINICAL_PERCENT = '(?:%|٪|per\\s+cent\\b|percent(?:age)?\\b(?!\\s+points?\\b))';
const CLINICAL_PERCENTAGE_VALUE = `${CLINICAL_QUANTITY}\\s*${CLINICAL_PERCENT}`;
const CLINICAL_PERCENTAGE_FORMULATION_NOUN = '(?:(?:topical\\s+)?(?:solutions?|creams?|gels?|ointments?|formulations?)|concentrations?)';
const CLINICAL_PERCENTAGE_NAMED_FORMULATION = `${CLINICAL_PERCENTAGE_VALUE}(?:(?:\\s*strength)(?:\\s+${CLINICAL_PERCENTAGE_FORMULATION_NOUN})?|\\s+${CLINICAL_PERCENTAGE_FORMULATION_NOUN})`;
const CLINICAL_SCHEDULE = `(?:daily|nightly|weekly|each\\s+(?:morning|evening|day|night|week)|once|twice|${CLINICAL_QUANTITY}\\s+times?)\\s*(?:(?:a|per)\\s+(?:day|week)|daily|weekly)?|every\\s+(?:(?:${CLINICAL_QUANTITY}|\\d+)\\s*(?:h|hr|hrs|hours?)|morning|evening|day|night|week)|at\\s+bedtime|with\\s+(?:meals?|breakfast|lunch|dinner)|as\\s+needed|on\\s+(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)|q\\s*\\d+\\s*h`;
const PASSIVE_USE_ADMINISTRATION_CONTEXT = `(?:(?:(?:orally|topically|intravenously|intramuscularly|subcutaneously)\\s+)?(?:${CLINICAL_SCHEDULE})|at\\s+(?:a\\s+)?(?:dose\\s+of\\s+)?${CLINICAL_QUANTITY}\\s*(?:${CLINICAL_DOSE_UNIT}|${CLINICAL_PERCENT})|as\\s+(?:a\\s+)?${CLINICAL_QUANTITY}\\s*(?:${CLINICAL_DOSE_UNIT}|${CLINICAL_PERCENT})\\s*(?:solution)?|as\\s+${CLINICAL_QUANTITY}\\s+(?:tablets?|capsules?|pills?|drops?|puffs?|sprays?|inhalations?)(?:\\s+(?:once|twice|${CLINICAL_QUANTITY}\\s+times?)\\s+(?:a\\s+day|daily))?)`;
const PASSIVE_PERCENTAGE_NAMED_ADMINISTRATION_CONTEXT = `(?:(?:as|in|at)\\s+(?:a\\s+)?${CLINICAL_PERCENTAGE_NAMED_FORMULATION}|(?:in|at)\\s+(?:a\\s+)?concentration\\s+of\\s+${CLINICAL_PERCENTAGE_VALUE})`;
const PASSIVE_PERCENTAGE_BARE_ADMINISTRATION_CONTEXT = `(?:as|in|at)\\s+(?:a\\s+)?${CLINICAL_PERCENTAGE_VALUE}(?!\\s+points?\\b)`;
const PERCENTAGE_ADMINISTRATION_CONTEXT = `(?:${PASSIVE_PERCENTAGE_NAMED_ADMINISTRATION_CONTEXT}|${PASSIVE_PERCENTAGE_BARE_ADMINISTRATION_CONTEXT})`;
const PASSIVE_USE_RESEARCH_CONTEXT = '(?:research|stud(?:y|ies)|analysis|assays?|samples?|workflows?|simulations?|models?|methods?|tools?|lessons?|education|examples?|datasets?|calibration|quality[ -]control|aggregate\\s+research|(?:aggregate|deidentified|population(?:[- ]?level)|cohort(?:[- ]?level))\\s+cohorts?|allele\\s+frequenc(?:y|ies)|significance\\s+levels?|sensitivity|specificity|accuracy|precision|recall|false[ -](?:positive|negative)\\s+rates?|genomic\\s+library|patient-derived\\s+(?:samples?|cells?)|selection\\s+marker|cultured\\s+cells|cell\\s+growth|mitosis|meiosis|absorbance|culture\\s+cells|edit\\s+genes|amplify\\s+dna|tumor\\s+genomes|punnett\\s+squares?|inheritance\\s+ratios?)';
const PASSIVE_USE_CONCRETE_LAB_CONTEXT = '(?:assays?|quality[ -]control|genomic\\s+library|selection\\s+marker|cultured\\s+cells|cell\\s+growth|mitosis|meiosis|absorbance|culture\\s+cells|tumor\\s+genomes|(?:the\\s+)?labs?|laborator(?:y|ies)(?:\\s+research)?|(?:dna|rna)\\s+extraction|p\\s*c\\s*r|sequencing\\s+library\\s+preparation|(?:genetic|genetics|genomic)\\s+experiments?|c\\s*r\\s*i\\s*s\\s*p\\s*r\\s+editing|gel\\s+electrophoresis|cell\\s*culture\\s+experiments?|(?:patient-derived\\s+(?:samples?|cells?)[^.!?;\\n]{0,60}\\b(?:aggregate\\s+research|laborator(?:y|ies)|lab|assays?)|(?:aggregate\\s+research|laborator(?:y|ies)|lab|assays?)[^.!?;\\n]{0,60}\\bpatient-derived\\s+(?:samples?|cells?)))';

const DIRECT_CLINICAL_ACTION = `(?:${GENERIC_CLINICAL_ACTION}|choose|select)`;
const DIRECT_CLINICAL_ACTION_GERUND = `(?:${GENERIC_CLINICAL_ACTION_GERUND}|choosing|selecting)`;
const DIRECT_CLINICAL_ACTION_FORM = `(?:${DIRECT_CLINICAL_ACTION}|${DIRECT_CLINICAL_ACTION_GERUND})`;
const RENDERED_DIRECTIVE_BOUNDARY = '(?:^|[.!?;:,\\n|]|[\\p{Pd}\\p{Pi}\\p{Pf}\\p{Ps}\\p{Pe}\\p{Po}\\p{So}]|\\b(?:and|then)\\b)\\s*';
const RENDERED_DIRECTIVE_OPENERS = `(?:(?:["'(]|\\[|\\{)\\s*)*`;
const DIRECT_MODAL_SUBJECT = '(?:you|i|we|they|one|someone|anyone|people|persons?|readers?|users?|learners?|students?|patients?|individuals?|adults?|children|(?:the|this|a|one)\\s+(?:patient|child|individual|person|reader|user|learner|student)|your\\s+child|family\\s+members?)';
const DIRECT_MODAL = `(?:(?:may|might|can|could|would|will|should|must)(?:\\s+(?:not|never))?(?:\\s+(?:want|need)\\s+to)?|(?:cannot|can't|couldn't|wouldn't|won't|shouldn't|mustn't)(?:\\s+(?:want|need)\\s+to)?|(?:ought(?:\\s+not)?|need(?:s)?|do(?:es)?\\s+not\\s+need)\\s+to|(?:is|are)\\s+(?:not\\s+)?to|(?:is|are)\\s+(?:advised|instructed)\\s+to)`;
const DIRECT_ACTION_PERSON_TARGET = `(?:you|your\\s+child|(?:(?:the|this|these|a|an)\\s+)?(?:patients?|individuals?|children|child|persons?)(?![-\\s]+(?:derived|samples?|data|records?|cohorts?|cells?|specimens?))|family\\s+members?)`;
const DIRECT_ACTION_HARD_CLINICAL_CONTEXT = `(?:${PASSIVE_USE_PERSONALIZED_CONTEXT}|${PASSIVE_USE_CLINICAL_PURPOSE}|\\b(?:${MEDICATION_NAME_PATTERN}|medications?|medicines?|drugs?|treatments?|therap(?:y|ies)|clinical\\s+care|medical\\s+care|diagnos(?:is|tic|ed)|prognos(?:is|tic)|symptoms?|pain|headaches?|migraines?|hypertension|diabetes|asthma|fever|seizures?|infections?)\\b|\\b(?:for|on|in|into|to|by|among)\\s+${DIRECT_ACTION_PERSON_TARGET}\\b)`;
const DIRECT_ACTION_HARD_CLINICAL_CONTEXT_PATTERN = new RegExp(
  DIRECT_ACTION_HARD_CLINICAL_CONTEXT,
  'iu',
);
const DIRECT_ACTION_ADMINISTRATION_PATTERN = new RegExp(
  `(?:\\b${PASSIVE_USE_ADMINISTRATION_CONTEXT}|\\b${CLINICAL_QUANTITY}\\s*${CLINICAL_DOSE_UNIT})`,
  'iu',
);
const DIRECT_ACTION_SPECIFIC_PERSON_PATTERN = /\b(?:(?:this|the|a|one)\s+(?:patient|child|individual|person)|your\s+child)(?![-\s]+(?:derived|samples?|data|records?|cohorts?|cells?|specimens?))\b/iu;
const DIRECT_ACTION_PERSON_MARKED_RISK_PATTERN = /\b(?:personal|individual(?:ized)?|your|family|(?:a|the|this)\s+patient'?s?)\b[^.!?;\n]*\brisk\b/iu;
const DIRECT_ACTION_DISEASE_RISK_PATTERN = /\b(?:disease|cancer|clinical)\b(?:\s+[\p{L}-]+){0,4}\s+risk\b/iu;
const DIRECT_ACTION_AGGREGATE_RISK_PATTERN = /\b(?:aggregate|deidentified|population(?:[- ]?level)|cohort(?:[- ]?level))\b[^.!?;\n]*\brisk\b|\brisk\b[^.!?;\n]*\b(?:aggregate|deidentified|population(?:[- ]?level)|cohort(?:[- ]?level))\b/iu;
const EXPLICIT_DOSE_PATTERN = new RegExp(
  `\\b${CLINICAL_QUANTITY}\\s*${CLINICAL_DOSE_UNIT}\\b`,
  'iu',
);
const DIRECT_ACTION_NONCLINICAL_TARGET_PATTERN = new RegExp(
  `^\\s*${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b`,
  'iu',
);
const DIRECT_ACTION_IDIOM_TARGET_PATTERN = /^\s*(?:(?:a|the|this|your)\s+)?(?<target>care|caution|look)\b/iu;
const DIRECT_ACTION_GENETICS_NOUN_PATTERN = /^(?:start\s+(?:codons?|(?:gain|loss)\s+variants?)|stop\s+(?:codons?|(?:gain|loss)\s+variants?)|test\s+(?:cross(?:es)?|statistics?|performance|sets?)|(?:start\s+(?:and\s+)?(?:stop|end)|stop\s+(?:and\s+)?start)\s+(?:codons?|coordinates?|sites?|signals?)|(?:test\s+use|use\s+test)\s+cases?|use\s+(?:dependent\s+effects?|in\s+research|as\s+(?:a\s+)?selection\s+marker|is\s+measured\s+in\s+(?:the\s+)?aggregate\s+cohort)|use\s+of\s+(?:(?:a|an|the)\s+)?(?:c\s*r\s*i\s*s\s*p\s*r|p\s*c\s*r|p\s*u\s*n\s*n\s*e\s*t\s*t\s+squares?|genetics?|genomics?|genes?|dna|rna|codons?|alleles?|pedigrees?|models?|datasets?|methods?|tools?))\b/iu;
const DIRECTIVE_START_PATTERN = new RegExp(
  `${RENDERED_DIRECTIVE_BOUNDARY}${RENDERED_DIRECTIVE_OPENERS}(?:please\\s+)?(?:(?:do(?:\\s+not)?|don't|never)\\s+)?(?<action>${DIRECT_CLINICAL_ACTION})\\b(?<tail>[^.!?;\\n]*)`,
  'giu',
);
const DIRECTIVE_MODAL_PATTERN = new RegExp(
  `\\b${DIRECT_MODAL_SUBJECT}\\s+${DIRECT_MODAL}\\s+(?<action>${DIRECT_CLINICAL_ACTION})\\b(?<tail>[^.!?;\\n]*)`,
  'giu',
);
const DIRECTIVE_INVERTED_MODAL_PATTERN = new RegExp(
  `\\b(?:may|might|can|could|would|will|should|must)(?:\\s+(?:not|never))?\\s+${DIRECT_MODAL_SUBJECT}\\s+(?<action>${DIRECT_CLINICAL_ACTION})\\b(?<tail>[^.!?;\\n]*)`,
  'giu',
);
const DIRECTIVE_INSTRUCTION_PATTERN = new RegExp(
  `\\b(?:(?:consider)\\s+(?<gerund>${DIRECT_CLINICAL_ACTION_GERUND})|(?:how|ways?|steps?|when)\\s+to\\s+(?<action>${DIRECT_CLINICAL_ACTION})|how\\s+(?:may|might|can|could|would|will|should|must)\\s+${DIRECT_MODAL_SUBJECT}\\s+(?<modalAction>${DIRECT_CLINICAL_ACTION})|(?:it\\s+(?:may|might|can|could|would)\\s+be\\s+(?:reasonable|appropriate|helpful)|the\\s+(?:next\\s+)?step\\s+is)\\s+to\\s+(?<framedAction>${DIRECT_CLINICAL_ACTION})|(?:recommend(?:s|ed|ing)?|suggest(?:s|ed|ing)?|advise(?:s|d|ing)?|instruct(?:s|ed|ing)?|urge(?:s|d|ing)?)\\s+(?:(?:that\\s+)?${DIRECT_MODAL_SUBJECT}\\s+)?(?:to\\s+)?(?<recommendedAction>${DIRECT_CLINICAL_ACTION_FORM}))\\b(?<tail>[^.!?;\\n]*)`,
  'giu',
);
const DIRECTIVE_SUBORDINATE_PATTERN = new RegExp(
  `\\b(?:before|after|when)\\s+(?:${DIRECT_MODAL_SUBJECT}\\s+)?(?<action>${DIRECT_CLINICAL_ACTION_FORM})\\b(?<tail>[^.!?;\\n]*)`,
  'giu',
);
const DIRECTIVE_NESTED_ACTION_PATTERN = new RegExp(
  `\\b(?:to|then|and(?:\\s+then)?|before|after)\\s+(?:${DIRECT_MODAL_SUBJECT}\\s+)?(?<action>${DIRECT_CLINICAL_ACTION_FORM})\\b`,
  'giu',
);
const RECOMMENDATION_OBJECT_PATTERN = /\b(?:recommend(?:s|ed|ing)?|suggest(?:s|ed|ing)?)\b(?:\s+(?<tail>[^.!?;\n]*))?/giu;
const RECOMMENDATION_LEADING_ACTION_PATTERN = new RegExp(
  `^\\s*(?:(?:that\\s+)?${DIRECT_MODAL_SUBJECT}\\s+)?(?:to\\s+)?(?<action>${DIRECT_CLINICAL_ACTION_FORM})\\b(?<tail>[^.!?;\\n]*)`,
  'iu',
);
const SAFE_PASSIVE_RECOMMENDATION_PATTERN = /\b(?:testing|the\s+test)\s+(?:is|are)\s+(?:recommended|advised|indicated)\b[^.!?;\n]*\b(?:quality[ -]control|(?:a|an|the|this)\s+assay|model\s+validation)\b/iu;
const RECOMMENDATION_HEADING_PATTERN = new RegExp(
  `(?:^|[.!?;\\n|]\\s*)(?<frame>(?:(?:(?:my|the|a)\\s+)?(?:recommendation|(?:preferred|best|reasonable)\\s+(?:option|choice)|choice|option|medication|treatment|therapy)(?:\\s+for\\s+[^:;.!?\\n|]{1,100})?|for\\s+(?:${DIRECT_ACTION_PERSON_TARGET}|${PASSIVE_USE_CLINICAL_INDICATION}))\\s*(?:is|:)\\s*(?<object>[^.!?;\\n|]+))`,
  'giu',
);
const RECOMMENDATION_PREDICATE_PATTERN = /(?:^|[.!?;\n|]\s*)(?<frame>(?<object>[^:;.!?\n|]+?)\s+(?:is|would\s+be)\s+(?:(?:(?:my|the|a)\s+)?recommendation|(?:(?:the|a)\s+)?(?:preferred|best|reasonable|good)\s+(?:option|choice)|appropriate|suitable|beneficial|indicated|advised)(?<tail>[^.!?;\n|]*))/giu;

const CLINICAL_GUIDANCE_PATTERNS = [
  /(?:^|[.!?;:,\n]\s*|\b(?:and|then)\s+)(?:please\s+)?(?:get|obtain|order|request|book)\s+(?:(?:a|an|the|your)\s+)?(?:(?:genetic|diagnostic|medical|clinical|cancer|carrier)\s+)?(?:test|testing|screen|screening|scan|biopsy|exam|examination)\b/iu,
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:(?:definitely|certainly|probably|likely|clearly|really)\\s+)?(?:need(?:s)?|require(?:s)?|would\\s+benefit\\s+from)\\s+(?!to\\b)(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)[\\p{L}\\p{N}]`, 'iu'),
  new RegExp(`\\b(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)[\\p{L}\\p{N}][\\p{L}\\p{N}'-]{1,63}(?:\\s+[\\p{L}\\p{N}][\\p{L}\\p{N}'-]{1,63}){0,2}\\s+(?:may|might|can|could|will|should)\\s+(?:help|relieve|reduce|improve|treat|manage)\\s+(?:you|your|the\\s+patient|the\\s+patient's)\\b`, 'iu'),
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:(?:[\\p{L}-]+|very)\\s+){0,3}(?:have|has|suffer(?:s)?\\s+from|test(?:s|ed)?\\s+positive\\s+for|are\\s+positive\\s+for|show(?:s)?\\s+signs\\s+of|meet(?:s)?\\s+(?:the\\s+)?criteria\\s+for|are\\s+diagnosed\\s+with|is\\s+diagnosed\\s+with)\\b[^.!?\\n]{0,100}`, 'iu'),
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:(?:may|might|could)\\s+)?(?:carry|carries|harbor|harbors)\\b[^.!?\\n]{0,100}`, 'iu'),
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:is|are|tests?|tested)\\s+positive\\s+for\\b[^.!?\\n]{0,100}`, 'iu'),
  /\b(?:the|these|those|this|your)\s+(?:findings?|results?|tests?|test\s+results?|genotype|variants?|data)\s+(?:is|are)\s+(?:diagnostic\s+of|consistent\s+with|indicative\s+of|positive\s+for)\b[^.!?\n]{0,100}/iu,
  /\byour\s+(?:findings?|results?|tests?|test\s+results?|genotype|variants?)\s+(?:confirm|confirms|show|shows|indicate|indicates|prove|proves)\b[^.!?\n]{0,100}/iu,
  /\byour\s+(?:symptoms|results|genotype|variant|variants|test|tests)\s+(?:mean|means|show|shows|indicate|indicates|confirm|confirms|prove|proves)\s+(?:(?:that\s+)?you\s+have|(?:a\s+)?diagnosis\s+of)\b/iu,
  /\byour\s+(?:symptoms|results|genotype|variant|variants|test|tests)\s+(?:is|are)\s+(?:diagnostic\s+of|consistent\s+with|indicative\s+of)\b/iu,
  /\b(?:recommend(?:ed|ation)?|advise(?:d)?|should|must|need(?:s)? to|ought to|prescribe(?:d)?|start|stop|increase|decrease|take|avoid|undergo|administer|switch)\b[^.!?\n]{0,120}\b(?:treatment|therapy|medication|medicine|drug|screening|(?:diagnostic|medical|clinical|genetic|cancer|carrier)\s+tests?|dose|dosing|dosage|surgery|procedure|clinical care|medical care)\b/iu,
  /\b(?:screening|treatment|therapy|medication|medicine|drug|(?:diagnostic|medical|clinical|genetic|cancer|carrier)\s+tests?|dose|dosing|dosage|surgery|procedure|clinical care|medical care)\b[^.!?\n]{0,40}\b(?:is|are|would be|may be|should be|must be)\b[^.!?\n]{0,40}\b(?:recommended|advised|indicated|required|necessary|appropriate)\b/iu,
  /\b(?:you|your|patient|this patient|individual|family members?)\b[^.!?\n]{0,120}\b(?:personal risk|risk of|diagnos\w*|prognos\w*|treatment|therapy|medication|medicine|drug|screening|dose|dosing|clinical action)\b/iu,
  /\b(?:consult|contact|see|seek)\b[^.!?\n]{0,60}\b(?:doctor|physician|clinician|genetic counselor|medical professional|emergency department|emergency care)\b/iu,
  /\b(?:diagnosis|prognosis|prognostic conclusion|clinical recommendation|treatment recommendation|screening recommendation|medication recommendation|drug recommendation)\b/iu,
  /\b(?:dose|dosing|dosage)\b[^.!?\n]{0,80}\b(?:recommend\w*|should|must|take|administer|adjust|increase|decrease|mg|mcg|ug|units?)\b/iu,
  /\b(?:take|start|stop|avoid|administer|inject|swallow|apply|use)\b[^.!?\n]{0,100}\b(?:one|two|three|four|five|six|seven|eight|nine|ten|half|a|an|\d+)\s+(?:tablets?|capsules?|pills?|drops?|puffs?|sprays?|inhalations?|teaspoons?|tablespoons?|units?)\b/iu,
  /\b(?:take|start|stop|avoid|administer|inject|swallow|apply|use)\b[^.!?\n]{0,100}\b(?:daily|nightly|weekly|once\s+(?:a\s+)?day|twice\s+(?:a\s+)?day|every\s+\w+\s+hours?|at\s+bedtime|with\s+meals?|as\s+needed)\b/iu,
  new RegExp(`\\b(?:take|start|stop|avoid|use|administer|prescribe|switch(?:\\s+to)?)\\b[^.!?\\n]{0,80}\\b${MEDICATION_NAME_PATTERN}\\b`, 'iu'),
  new RegExp(`\\b${MEDICATION_NAME_PATTERN}\\b[^.!?\\n]{0,80}\\b(?:is|are|may be|should be|must be)\\b[^.!?\\n]{0,40}\\b(?:recommended|advised|indicated|prescribed|avoided)\\b`, 'iu'),
];

const PASSIVE_ACTION_CLAUSE_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_SUBJECT}\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]*?\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_USE_PERSONALIZED_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_PERSONALIZED_CONTEXT}\\b`,
  'iu',
);
const PASSIVE_USE_CLINICAL_PURPOSE_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_CLINICAL_PURPOSE}\\b`,
  'iu',
);
const PASSIVE_ACTION_ADMINISTRATION_PATTERN = new RegExp(
  `\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b\\s*,?\\s+(?<administration>${PASSIVE_USE_ADMINISTRATION_CONTEXT})\\b`,
  'giu',
);
const PASSIVE_ADMINISTRATION_PERCENTAGE_PATTERN = new RegExp(
  `${CLINICAL_PERCENTAGE_VALUE}(?![\\p{L}\\p{N}%٪])`,
  'iu',
);
const PASSIVE_ACTION_NAMED_PERCENTAGE_ADMINISTRATION_PATTERN = new RegExp(
  `\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b(?=[^.!?;\\n]*\\b${PASSIVE_PERCENTAGE_NAMED_ADMINISTRATION_CONTEXT}(?![\\p{L}\\p{N}%٪]))`,
  'iu',
);
const PASSIVE_PERCENTAGE_FORMULATION_SUBJECT = `(?:${CLINICAL_PERCENTAGE_NAMED_FORMULATION}|${CLINICAL_PERCENTAGE_VALUE}\\s+${PASSIVE_USE_SUBJECT}\\s+${CLINICAL_PERCENTAGE_FORMULATION_NOUN})`;
const PASSIVE_PERCENTAGE_FORMULATION_SUBJECT_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:the|an?)\\s+)?${PASSIVE_PERCENTAGE_FORMULATION_SUBJECT}\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]*?\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_PERCENTAGE_AGAROSE_ELECTROPHORESIS_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])${CLINICAL_PERCENTAGE_VALUE}\\s+agarose\\s+gels?\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]*?\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b[^.!?;\\n]*?\\b(?:for|in|during)\\s+(?:gel\\s+)?electrophoresis\\b`,
  'iu',
);
const PASSIVE_PERCENTAGE_RESEARCH_SUBJECT = '(?:methods?|models?|filters?|assays?|reagents?|algorithms?|pipelines?|workflows?|tools?|simulations?|datasets?|variables?|statistics?|thresholds?|tests?|procedures?|corrections?|approach(?:es)?|techniques?|strateg(?:y|ies)|analys(?:is|es)|equations?|estimators?|classifiers?|calibrations?|metrics?|measures?|calculations?|comparisons?|regressions?|p\\s*c\\s*r)';
const PASSIVE_PERCENTAGE_RESEARCH_SUBJECT_TOKEN_PATTERN = new RegExp(
  `^${PASSIVE_PERCENTAGE_RESEARCH_SUBJECT}$`,
  'iu',
);
const PASSIVE_PERCENTAGE_FRAME_EVENT_PATTERN = new RegExp(
  `(?<subjectAux>\\b(?<subject>${PASSIVE_USE_SUBJECT})\\s+${PASSIVE_USE_AUXILIARY}\\b)|(?<action>\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b)|(?<percentage>\\b${PASSIVE_PERCENTAGE_BARE_ADMINISTRATION_CONTEXT}(?![\\p{L}\\p{N}%٪]))`,
  'giu',
);
const PASSIVE_PERCENTAGE_DISCOURSE_BOUNDARY_PATTERN = /\b(?:while|whereas|although|but|however|conversely|meanwhile|afterwards?|subsequently|(?:and\s+)?then)\b/iu;
const ACTIVE_PERSON_REGULAR_CLINICAL_ACTION = '(?:take|consume|ingest|swallow|chew|drink|dissolve|inhale|spray|inject|administer|prescribe|dose|medicate|redose|refill|combine|hold|pause|cease|maintain|replace|substitute|remove|add|receive|give|initiate|manage|start|begin|resume|continue|stop|discontinue|skip|taper|increase|decrease|avoid|rub|insert|place|wear|use|schedule|screen|test|diagnose|treat|monitor)';
const ACTIVE_PERSON_CLINICAL_ACTION = `(?:${ACTIVE_PERSON_REGULAR_CLINICAL_ACTION}s?|tr(?:y|ies)|appl(?:y|ies)|undergo(?:es)?|switch(?:es)?(?:\\s+to)?|re\\s*starts?|keeps?\\s+(?:taking|using)|${GENERIC_CLINICAL_ACTION_GERUND})`;
const ACTIVE_PERSON_PERCENTAGE_ACTION_PATTERN = new RegExp(
  `\\b(?<subject>(?:(?:(?:this|the|a|one)\\s+)?(?:patient|child|individual|person|adult)|(?:(?:these|the)\\s+)?(?:patients|children|individuals|persons|adults)|you))\\b[^.!?;\\n]*?\\b(?<action>${ACTIVE_PERSON_CLINICAL_ACTION})\\b(?<tail>[^.!?;\\n]*)`,
  'giu',
);
const ACTIVE_PERSON_PERCENTAGE_CONTEXT_PATTERN = new RegExp(
  `\\b(?:${PERCENTAGE_ADMINISTRATION_CONTEXT}|(?:a\\s+)?(?:${CLINICAL_PERCENTAGE_NAMED_FORMULATION}|${CLINICAL_PERCENTAGE_VALUE}))(?![\\p{L}\\p{N}%٪])`,
  'iu',
);
const ACTIVE_PERSON_REVIEWED_PERCENTAGE_RESEARCH_TARGET_PATTERN = /^(?<prefix>\s*(?:(?:a|an|the|this|that)\s+)?)(?<target>filters?|approach(?:es)?|procedures?|estimators?|corrections?|tests?|techniques?|strateg(?:y|ies)|classifiers?|calibrations?)\b(?=[^.!?;\n]*\bpercentage value\b[^.!?;\n]*\baggregate\s+(?:research|analysis|stud(?:y|ies)|comparisons?)\b)/iu;
const PASSIVE_USE_RESEARCH_CONTEXT_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_RESEARCH_CONTEXT}\\b`,
  'iu',
);
const PASSIVE_USE_CONCRETE_LAB_CONTEXT_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_CONCRETE_LAB_CONTEXT}\\b`,
  'iu',
);
const PASSIVE_ACTION_KNOWN_MEDICATION_PATTERN = new RegExp(
  `\\b(?:${MEDICATION_NAME_PATTERN}|medications?|medicines?|drugs?)\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]*?\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_ACTION_PERSON_SUBJECT_PATTERN = new RegExp(
  `\\b${CLINICAL_SUBJECT}\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]*?\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_ACTION_NONCLINICAL_PERSON_SUBJECT_PATTERN = new RegExp(
  '(?:\\byou\\s+are\\s+used\\s+to\\s+[\\p{L}-]+ing\\b|\\bpatients?\\s+are\\s+used\\s+as\\s+controls?\\b[^.!?;\\n]{0,80}\\bresearch\\b)',
  'iu',
);
const PASSIVE_ACTION_STRONG_MODAL_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_SUBJECT}\\s+${PASSIVE_USE_STRONG_MODAL_AUXILIARY}[^.!?;\\n]*?\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_ACTION_WEAK_MODAL_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_SUBJECT}\\s+(?:may|might|can|could|would)\\b[^.!?;\\n]*?\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);

const NAMED_HTML_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  ast: '*',
  bsol: '\\',
  colon: ':',
  comma: ',',
  copy: '\u00a9',
  dash: '-',
  emsp: ' ',
  ensp: ' ',
  excl: '!',
  gt: '>',
  hairsp: ' ',
  hyphen: '-',
  lpar: '(',
  lrm: '',
  lsqb: '[',
  lt: '<',
  nbsp: ' ',
  newline: '\n',
  num: '#',
  percnt: '%',
  period: '.',
  quest: '?',
  quot: '"',
  reg: '\u00ae',
  rlm: '',
  rpar: ')',
  rsqb: ']',
  semi: ';',
  shy: '',
  sol: '/',
  tab: '\t',
  thinsp: ' ',
  zerowidthspace: '',
  zwj: '',
  zwnj: '',
});

const SAFETY_CONFUSABLES = new Map(Object.entries({
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'y', 'χ': 'x', 'ϲ': 'c',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
  'а': 'a', 'е': 'e', 'і': 'i', 'ј': 'j', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'х': 'x', 'у': 'y', 'ѕ': 's', 'һ': 'h', 'ԁ': 'd', 'ԛ': 'q', 'ӏ': 'l',
  'ս': 'u', 'հ': 'h', 'ո': 'n', 'օ': 'o',
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
}));

const CLINICAL_SKELETON_WORDS = Object.freeze([
  'add', 'administer', 'advised', 'applied', 'apply', 'avoid', 'cease', 'chew', 'combine', 'consume', 'diagnose', 'diagnosed',
  'dissolve', 'dose', 'drink', 'hold', 'inhale', 'inject', 'injected', 'ingest', 'insert', 'maintain', 'medicate', 'medication', 'monitor', 'must', 'need',
  'pain', 'patient', 'pause', 'prescribe', 'recommend', 'redose', 'refill', 'remove', 'replace', 'require', 'restart', 'screen', 'should',
  'choose', 'select', 'skip', 'spray', 'start', 'stop', 'substitute', 'swallow', 'symptoms', 'take', 'taken', 'taper', 'test', 'tested', 'treat', 'treated', 'try', 'use', 'used',
]);

const OBFUSCATED_CLINICAL_WORD_PATTERNS = Object.freeze(
  CLINICAL_SKELETON_WORDS.map((word) => Object.freeze([
    new RegExp(`(?<!\\p{L})${Array.from(word).join('\\s*')}(?!\\p{L})`, 'giu'),
    word,
  ])),
);

function containsUnsupportedNamedHtmlEntity(value) {
  if (typeof value !== 'string') return false;
  for (const match of value.matchAll(/&([a-z][a-z0-9]+);/giu)) {
    if (!Object.hasOwn(NAMED_HTML_ENTITIES, match[1].toLowerCase())) return true;
  }
  return false;
}

function collapseObfuscatedClinicalWords(value) {
  let collapsed = value;
  for (const [pattern, word] of OBFUSCATED_CLINICAL_WORD_PATTERNS) {
    collapsed = collapsed.replace(pattern, word);
  }
  return collapsed;
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function decodeHtmlEntities(value, { preserveUnknownNamed = true } = {}) {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/giu, (match, entity) => {
    if (entity[0] !== '#') {
      // The safety projection removes unknown names conservatively because a
      // renderer may know more named references than this finite table. The
      // visible-output normalizer preserves them to avoid corrupting neutral
      // scientific notation such as an unlisted Greek entity.
      return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? (preserveUnknownNamed ? match : '');
    }
    const hex = entity[1]?.toLowerCase() === 'x';
    const numeric = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff
      || (numeric >= 0xd800 && numeric <= 0xdfff)) return ' ';
    return String.fromCodePoint(numeric);
  });
}

function removeInvisibleFormatCharacters(value) {
  return value.replace(/[\p{Cf}\u034f\u061c\u180e]/gu, '');
}

function normalizeVisibleText(value) {
  return removeInvisibleFormatCharacters(decodeHtmlEntities(value).normalize('NFKC'));
}

function stripRenderedMarkupForSafety(value, { separateFormatting = false } = {}) {
  // HTML and Markdown inline markup do not create visible characters. Remove
  // them without inserting a separator so T<em>ak</em>e and T**ak**e project
  // to the same safety text the reader sees: Take.
  const withoutHtml = value
    .replace(/<!--[\s\S]*?-->/gu, '')
    // Block elements create a rendered boundary. Preserve that boundary so a
    // directive cannot hide behind a preceding paragraph, table cell, or line
    // break while inline tags still join the same visible word below.
    .replace(/<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)(?:\s[^<>]*)?\s*\/?>/giu, '\n')
    .replace(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/gu, '');
  return stripUntrustedMarkupAndLinks(withoutHtml)
    .replace(/\\([\\`*{}[\]()#+\-.!_>~|%٪])/gu, '$1')
    .replace(/[`*_~]+/gu, separateFormatting ? ' ' : '')
    .replace(/^\s{0,3}#{1,6}\s*/gmu, '')
    .replace(/^\s*>\s?/gmu, ' ')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, '');
}

function semanticSafetyText(value, {
  separatePunctuation = false,
  joinLineBreaks = false,
} = {}) {
  if (typeof value !== 'string') return '';
  const normalized = replaceControlCharacters(removeInvisibleFormatCharacters(
    decodeHtmlEntities(value, { preserveUnknownNamed: false }).normalize('NFKD'),
  ), { preserveLineBreaks: true });
  const confusableMapped = Array.from(normalized, (character) => {
    const codePoint = character.codePointAt(0) ?? -1;
    if (codePoint >= 0x0660 && codePoint <= 0x0669) {
      return String.fromCodePoint(0x30 + codePoint - 0x0660);
    }
    if (codePoint >= 0x06f0 && codePoint <= 0x06f9) {
      return String.fromCodePoint(0x30 + codePoint - 0x06f0);
    }
    if (codePoint === 0x066b) return '.';
    return SAFETY_CONFUSABLES.get(character) ?? character;
  }).join('');
  return stripRenderedMarkupForSafety(confusableMapped, {
    separateFormatting: separatePunctuation,
  })
    .replace(/\p{M}+/gu, '')
    // Decimal precision is irrelevant to the publication decision. Collapse
    // decimal separators in the safety-only projection so neither an ASCII
    // leading dot nor a normalized Arabic decimal mark becomes a sentence
    // boundary before dose/percentage classification.
    .replace(/(?<![\p{L}\p{N}])\.(?=\d)/gu, '0')
    .replace(/(?<=\d)\.(?=\d)/gu, '')
    // Renderers can place a symbolic percent on the next visual line or in a
    // following block. Join only digit + percent-symbol tokens; the spelled
    // word "percent" keeps its clause boundary semantics.
    .replace(/(?<=\d)[\p{Z}\t\f\v\r\n\u0085\u2028\u2029]*(?=[%٪])/gu, '')
    // Preserve reviewed genetics compounds before treating rendered long
    // dashes as clause boundaries. Short in-word dashes still flow through
    // the compact-word projection below for obfuscation checks.
    .replace(/\b(start|stop)\s*[\u2012-\u2015\u2e3a\u2e3b]\s*(start|stop|end)\b/giu, '$1 $2')
    .replace(/[\u2012-\u2015\u2e3a\u2e3b]+/gu, '\n')
    .replace(/([\p{L}\p{N}])[\p{Pd}._/\\,:;|\u00b7\u2022]+(?=[\p{L}\p{N}])/gu, (
      _match,
      letter,
    ) => `${letter}${separatePunctuation ? ' ' : ''}`)
    .replace(/(\p{L})(?=\p{N})/gu, '$1 ')
    .replace(/(\p{N})(?=\p{L})/gu, '$1 ')
    .replace(/[\r\n\u0085\u2028\u2029]+/gu, joinLineBreaks ? ' ' : '\n')
    .replace(/[\p{Z}\t\f\v ]+/gu, ' ')
    .trim();
}

function confusableEditBudget(targetLength) {
  // Short safety keywords have too few characters for a fixed fuzzy-match
  // budget to be selective. Keep a one-edit floor so three-letter directives
  // cannot bypass the boundary with one unmapped non-Latin character, and use
  // the full two-edit fail-closed budget only for words of eight or more.
  return Math.min(2, Math.max(1, Math.floor(targetLength / 4)));
}

function withinEditBudget(left, right, maxEdits) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > maxEdits) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]
        + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > maxEdits) return false;
    previous = current;
  }
  return previous[right.length] <= maxEdits;
}

/**
 * UTS-39-style defense for mixed/confusable clinical keywords. The explicit
 * skeleton map handles common Greek/Cyrillic lookalikes; for an unmapped
 * non-Latin letter embedded in an otherwise Latin token, a length-scaled
 * comparison of up to two edits fails closed instead of assuming safety.
 */
function containsSuspiciousClinicalConfusable(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = removeInvisibleFormatCharacters(
    decodeHtmlEntities(value, { preserveUnknownNamed: false }).normalize('NFKD'),
  ).replace(/\p{M}+/gu, '');
  for (const match of normalized.matchAll(/\p{L}{2,}/gu)) {
    const token = match[0];
    if (!Array.from(token).some((character) => (character.codePointAt(0) ?? 0) > 0x7f)) continue;
    const skeleton = Array.from(token, (character) => {
      const mapped = SAFETY_CONFUSABLES.get(character);
      if (mapped) return mapped;
      return /[A-Za-z]/u.test(character) ? character : '';
    }).join('').toLowerCase();
    if (skeleton.length < 2) continue;
    if (CLINICAL_SKELETON_WORDS.some((word) => (
      withinEditBudget(skeleton, word, confusableEditBudget(word.length))
    ))) {
      return true;
    }
  }
  return false;
}

function replaceControlCharacters(value, { preserveLineBreaks = false } = {}) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? -1;
    if (preserveLineBreaks
      && (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x85)) return '\n';
    const isC0OrDel = codePoint <= 0x1f || codePoint === 0x7f;
    const isC1 = codePoint >= 0x80 && codePoint <= 0x9f;
    return isC0OrDel || isC1 ? ' ' : character;
  }).join('');
}

function stripUntrustedMarkupAndLinks(value) {
  return value
    .replace(/!\[([^\]]*)\]\s*\[[^\]]*\]/gu, '$1')
    .replace(/\[([^\]]+)\]\s*\[[^\]]*\]/gu, '$1')
    .replace(/^\s*\[[^\]\n]{1,128}\]:\s*.*$/gmu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/!\[([^\]]*)\]\((?:\\.|[^()]|\([^()]*\))*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\((?:\\.|[^()]|\([^()]*\))*\)/gu, '$1')
    .replace(/\b(?:javascript|data):[^\s]+/giu, ' ')
    .replace(/\bhttps?:\/\/[^\s<>()]+/giu, '[external link removed]')
    .replace(/(^|[\s(])\/\/[A-Za-z0-9.-]+(?:\/[^\s<>()]*)?/gmu, '$1[external link removed]')
    .replace(/\bwww\.[^\s<>()]+/giu, '[external link removed]');
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = stripUntrustedMarkupAndLinks(replaceControlCharacters(normalizeVisibleText(value)))
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function removeAllowedBoundaryDisclaimers(value) {
  return value
    .replace(/(^|[.!?;\n]\s*)use\s+of\s+[\p{L}\p{N}'-]{1,64}\s+(?:is|was)\s+(?:measured|recorded|analyzed)\s+as\s+(?:an?\s+)?(?:aggregate|deidentified|population(?:[- ]?level)|cohort(?:[- ]?level))\s+cohort\s+variable(?=$|[.!?;\n])/gimu, '$1 ')
    .replace(/\bnot\s+(?:a\s+)?diagnosis\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bnot\s+medical\s+advice\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bnot\s+(?:intended|suitable)\s+for\s+clinical\s+use\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bdoes\s+not\s+(?:assess|predict|establish)\s+(?:personal\s*)?(?:risk|diagnosis|prognosis)\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bdo\s+not\s+use\s+(?:it|(?:this|the)\s+(?:output|response|result|results)|these\s+results|output|response|result|results)\s+(?:medically|for\s+(?:medical\s+advice|clinical\s+use|clinical\s+decisions?|(?:diagnosis|personal(?:-|\s)?risk(?:\s+prediction)?|treatment|dosing|screening)(?:\s*(?:,|and|or)\s*(?:diagnosis|personal(?:-|\s)?risk(?:\s+prediction)?|treatment|dosing|screening))*(?:\s*,?\s*(?:and|or)\s+(?:other\s+)?clinical\s+decisions?)?))\b(?=$|[.!?;:\n])/giu, ' ');
}

function baseDirectAction(action) {
  const normalized = action.toLocaleLowerCase('en-US');
  const aliased = ({
    applies: 'apply',
    choosing: 'choose',
    keeps: 'keep',
    selecting: 'select',
    starting: 'start',
    stopping: 'stop',
    switches: 'switch',
    taking: 'take',
    testing: 'test',
    tries: 'try',
    undergoes: 'undergo',
    using: 'use',
  })[normalized];
  if (aliased) return aliased;
  if (normalized.startsWith('keeps ')) return `keep ${normalized.slice(6)}`;
  return normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
}

function isNonClinicalDirectAction(action, tail) {
  const normalizedAction = baseDirectAction(action);
  const actionAndTail = `${normalizedAction} ${tail.trimStart()}`;
  if (DIRECT_ACTION_GENETICS_NOUN_PATTERN.test(actionAndTail)) return true;
  const idiomTarget = tail.match(DIRECT_ACTION_IDIOM_TARGET_PATTERN)?.groups.target;
  if (idiomTarget) {
    return normalizedAction === 'take'
      || (normalizedAction === 'use' && idiomTarget !== 'look');
  }
  return DIRECT_ACTION_NONCLINICAL_TARGET_PATTERN.test(tail);
}

function reviewedGeneticsNounTailEnd(action, tail) {
  const normalizedAction = baseDirectAction(action);
  const trimmedTail = tail.trimStart();
  const match = `${normalizedAction} ${trimmedTail}`.match(DIRECT_ACTION_GENETICS_NOUN_PATTERN);
  if (!match) return 0;
  return (tail.length - trimmedTail.length)
    + Math.max(0, match[0].length - normalizedAction.length - 1);
}

function hasHardDirectClinicalContext(directive) {
  if (DIRECT_ACTION_HARD_CLINICAL_CONTEXT_PATTERN.test(directive)) return true;
  if (DIRECT_ACTION_SPECIFIC_PERSON_PATTERN.test(directive)) return true;
  if (DIRECT_ACTION_PERSON_MARKED_RISK_PATTERN.test(directive)) return true;
  if (DIRECT_ACTION_DISEASE_RISK_PATTERN.test(directive)
    && !DIRECT_ACTION_AGGREGATE_RISK_PATTERN.test(directive)) return true;
  return DIRECT_ACTION_ADMINISTRATION_PATTERN.test(directive)
    && !PASSIVE_USE_CONCRETE_LAB_CONTEXT_PATTERN.test(directive);
}

function directiveHasUnsafeDirectAction(action, tail, frame) {
  if (hasHardDirectClinicalContext(frame)) return true;

  const reviewedTailEnd = reviewedGeneticsNounTailEnd(action, tail);
  const nestedActions = [...tail.matchAll(DIRECTIVE_NESTED_ACTION_PATTERN)].filter((match) => (
    (match.index ?? 0) >= reviewedTailEnd
  ));
  const firstTail = tail.slice(0, nestedActions[0]?.index ?? tail.length);
  if (!isNonClinicalDirectAction(action, firstTail)) return true;

  return nestedActions.some((match, index) => {
    const nestedTailStart = (match.index ?? 0) + match[0].length;
    const nestedTailEnd = nestedActions[index + 1]?.index ?? tail.length;
    const nestedTail = tail.slice(nestedTailStart, nestedTailEnd);
    const fullTail = `${match.groups.action} ${nestedTail}`;
    return hasHardDirectClinicalContext(fullTail)
      || !isNonClinicalDirectAction(match.groups.action, nestedTail);
  });
}

function containsActivePersonPercentageAdministration(value) {
  return [...value.matchAll(ACTIVE_PERSON_PERCENTAGE_ACTION_PATTERN)].some((match) => {
    const tail = match.groups.tail ?? '';
    const percentageContext = tail.match(ACTIVE_PERSON_PERCENTAGE_CONTEXT_PATTERN);
    if (!percentageContext) return false;
    const safetyTail = tail.replace(percentageContext[0], ' percentage value ');
    const researchTarget = match.groups.subject.toLocaleLowerCase('en-US') === 'this individual'
      ? safetyTail.match(ACTIVE_PERSON_REVIEWED_PERCENTAGE_RESEARCH_TARGET_PATTERN)
      : null;
    const researchTargetStart = researchTarget
      ? researchTarget[0].length - researchTarget.groups.target.length
      : -1;
    const classificationTail = researchTarget
      ? `${safetyTail.slice(0, researchTargetStart)}model${safetyTail.slice(
        researchTargetStart + researchTarget.groups.target.length,
      )}`
      : safetyTail;
    return directiveHasUnsafeDirectAction(
      match.groups.action,
      classificationTail,
      `${match.groups.action} ${classificationTail}`,
    );
  });
}

function recommendationObjectIsUnsafe(object, frame) {
  if (hasHardDirectClinicalContext(frame)) return true;
  const actionMatch = object.match(RECOMMENDATION_LEADING_ACTION_PATTERN);
  if (actionMatch) {
    return directiveHasUnsafeDirectAction(
      actionMatch.groups.action,
      actionMatch.groups.tail ?? '',
      frame,
    );
  }
  return !isNonClinicalDirectAction('choose', object);
}

function containsDirectClinicalAction(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const patterns = [
    DIRECTIVE_START_PATTERN,
    DIRECTIVE_MODAL_PATTERN,
    DIRECTIVE_INVERTED_MODAL_PATTERN,
    DIRECTIVE_INSTRUCTION_PATTERN,
    DIRECTIVE_SUBORDINATE_PATTERN,
  ];
  return patterns.some((pattern) => [...value.matchAll(pattern)].some((match) => {
    const action = match.groups.action
      ?? match.groups.gerund
      ?? match.groups.modalAction
      ?? match.groups.framedAction
      ?? match.groups.recommendedAction;
    return directiveHasUnsafeDirectAction(action, match.groups.tail ?? '', match[0]);
  }));
}

function containsUnsafeRecommendation(value) {
  return [...value.matchAll(RECOMMENDATION_OBJECT_PATTERN)].some((match) => {
    const clauseStart = Math.max(
      value.lastIndexOf('.', match.index ?? 0),
      value.lastIndexOf('!', match.index ?? 0),
      value.lastIndexOf('?', match.index ?? 0),
      value.lastIndexOf(';', match.index ?? 0),
      value.lastIndexOf('\n', match.index ?? 0),
    ) + 1;
    const clauseEndCandidates = ['.', '!', '?', ';', '\n']
      .map((boundary) => value.indexOf(boundary, match.index ?? 0))
      .filter((index) => index >= 0);
    const clauseEnd = clauseEndCandidates.length > 0
      ? Math.min(...clauseEndCandidates)
      : value.length;
    const clause = value.slice(clauseStart, clauseEnd);
    const tail = match.groups.tail ?? '';
    const actionMatch = tail.match(RECOMMENDATION_LEADING_ACTION_PATTERN);
    if (actionMatch) {
      return recommendationObjectIsUnsafe(tail, clause);
    }
    if (!hasHardDirectClinicalContext(clause)
      && SAFE_PASSIVE_RECOMMENDATION_PATTERN.test(clause)) return false;
    return recommendationObjectIsUnsafe(tail, clause);
  });
}

function containsUnsafeRecommendationFrame(value) {
  const headingUnsafe = [...value.matchAll(RECOMMENDATION_HEADING_PATTERN)].some((match) => (
    recommendationObjectIsUnsafe(match.groups.object, match.groups.frame)
  ));
  if (headingUnsafe) return true;
  return [...value.matchAll(RECOMMENDATION_PREDICATE_PATTERN)].some((match) => (
    recommendationObjectIsUnsafe(match.groups.object, match.groups.frame)
  ));
}

function containsClinicalDose(value) {
  if (!EXPLICIT_DOSE_PATTERN.test(value)) return false;
  if (!PASSIVE_USE_CONCRETE_LAB_CONTEXT_PATTERN.test(value)) return true;
  return PASSIVE_USE_PERSONALIZED_PATTERN.test(value)
    || PASSIVE_USE_CLINICAL_PURPOSE_PATTERN.test(value)
    || DIRECT_ACTION_SPECIFIC_PERSON_PATTERN.test(value)
    || DIRECT_ACTION_PERSON_MARKED_RISK_PATTERN.test(value)
    || (DIRECT_ACTION_DISEASE_RISK_PATTERN.test(value)
      && !DIRECT_ACTION_AGGREGATE_RISK_PATTERN.test(value));
}

function scanPassivePercentageFrame(frame) {
  const barePercentageSubjects = [];
  let currentSubject = null;
  let actionSubject = null;
  let hasActiveAction = false;
  let eventCount = 0;

  for (const match of frame.matchAll(PASSIVE_PERCENTAGE_FRAME_EVENT_PATTERN)) {
    eventCount += 1;
    if (match.groups.subjectAux) {
      currentSubject = match.groups.subject;
      actionSubject = null;
      hasActiveAction = false;
    } else if (match.groups.action) {
      actionSubject = currentSubject;
      hasActiveAction = true;
    } else if (match.groups.percentage && hasActiveAction) {
      barePercentageSubjects.push(actionSubject);
    }
  }

  return { barePercentageSubjects, eventCount };
}

function containsPassiveClinicalAction(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return value.split(/[.!?;\n]+/u).some((clause) => {
    if (!PASSIVE_ACTION_CLAUSE_PATTERN.test(clause)) return false;
    if (
      PASSIVE_ACTION_PERSON_SUBJECT_PATTERN.test(clause)
      && !PASSIVE_ACTION_NONCLINICAL_PERSON_SUBJECT_PATTERN.test(clause)
    ) return true;
    if (PASSIVE_USE_PERSONALIZED_PATTERN.test(clause)) return true;
    if (PASSIVE_USE_CLINICAL_PURPOSE_PATTERN.test(clause)) return true;

    const hasReviewedResearchContext = PASSIVE_USE_RESEARCH_CONTEXT_PATTERN.test(clause);
    const hasConcreteLabContext = PASSIVE_USE_CONCRETE_LAB_CONTEXT_PATTERN.test(clause);
    const percentageDiscourseFrames = clause.split(
      PASSIVE_PERCENTAGE_DISCOURSE_BOUNDARY_PATTERN,
    );
    const hasUnsafePercentageFrame = percentageDiscourseFrames.some((frame) => {
      const hasLocalConcreteLabContext = PASSIVE_USE_CONCRETE_LAB_CONTEXT_PATTERN.test(frame)
        || PASSIVE_PERCENTAGE_AGAROSE_ELECTROPHORESIS_PATTERN.test(frame);
      const hasNamedPercentageAdministration =
        PASSIVE_ACTION_NAMED_PERCENTAGE_ADMINISTRATION_PATTERN.test(frame)
        || PASSIVE_PERCENTAGE_FORMULATION_SUBJECT_PATTERN.test(frame);
      if (hasNamedPercentageAdministration && !hasLocalConcreteLabContext) return true;

      const { barePercentageSubjects } = scanPassivePercentageFrame(frame);
      if (barePercentageSubjects.length > 0 && !hasLocalConcreteLabContext) {
        if (!hasReviewedResearchContext
          || barePercentageSubjects.some((subject) => (
            !subject || !PASSIVE_PERCENTAGE_RESEARCH_SUBJECT_TOKEN_PATTERN.test(subject)
          ))) return true;
      }

      if (hasLocalConcreteLabContext) return false;
      return [...frame.matchAll(PASSIVE_ACTION_ADMINISTRATION_PATTERN)].some((match) => (
        !PASSIVE_ADMINISTRATION_PERCENTAGE_PATTERN.test(match.groups.administration)
      ));
    });
    if (hasUnsafePercentageFrame) return true;
    if (PASSIVE_ACTION_KNOWN_MEDICATION_PATTERN.test(clause) && !hasConcreteLabContext) {
      return true;
    }
    return (PASSIVE_ACTION_STRONG_MODAL_PATTERN.test(clause)
      || PASSIVE_ACTION_WEAK_MODAL_PATTERN.test(clause))
      && !hasReviewedResearchContext;
  });
}

function containsProhibitedClinicalGuidance(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  // CommonMark decodes the complete HTML named-reference table. This service
  // intentionally keeps only a small reviewed decoder; an unrecognized entity
  // in visible text therefore fails closed instead of being deleted from the
  // safety projection while the browser renders a confusable character.
  const visibleMarkup = stripRenderedMarkupForSafety(value);
  if (containsUnsupportedNamedHtmlEntity(visibleMarkup)) return true;
  if (containsSuspiciousClinicalConfusable(value)) return true;
  const policyTexts = new Set([
    collapseObfuscatedClinicalWords(semanticSafetyText(value)),
    collapseObfuscatedClinicalWords(semanticSafetyText(value, { separatePunctuation: true })),
    // Keep the boundary-preserving projections above for rendered directives,
    // and additionally scan soft-line joins so a subject, passive action, or
    // spelled percentage cannot be split across HTML/entity/Unicode newlines.
    collapseObfuscatedClinicalWords(semanticSafetyText(value, { joinLineBreaks: true })),
    collapseObfuscatedClinicalWords(semanticSafetyText(value, {
      separatePunctuation: true,
      joinLineBreaks: true,
    })),
  ]);
  return [...policyTexts].some((policyText) => {
    const withoutAllowedDisclaimers = removeAllowedBoundaryDisclaimers(policyText);
    return CLINICAL_GUIDANCE_PATTERNS.some((pattern) => pattern.test(withoutAllowedDisclaimers))
      || containsActivePersonPercentageAdministration(withoutAllowedDisclaimers)
      || containsDirectClinicalAction(withoutAllowedDisclaimers)
      || containsUnsafeRecommendation(withoutAllowedDisclaimers)
      || containsUnsafeRecommendationFrame(withoutAllowedDisclaimers)
      || containsClinicalDose(withoutAllowedDisclaimers)
      || containsPassiveClinicalAction(withoutAllowedDisclaimers);
  });
}

function cleanNonClinicalText(value, maxLength) {
  if (containsProhibitedClinicalGuidance(value)) return null;
  const cleaned = cleanText(value, maxLength);
  if (!cleaned || (cleaned !== value && containsProhibitedClinicalGuidance(cleaned))) return null;
  return cleaned;
}

function cleanStringArray(value, { maxItems, maxLength, nonClinical = false }) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const item of value) {
    const text = nonClinical
      ? cleanNonClinicalText(item, maxLength)
      : cleanText(item, maxLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
}

function normalizeNarrativeFormatting(value) {
  if (typeof value !== 'string') return null;
  const lines = normalizeVisibleText(value)
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => stripUntrustedMarkupAndLinks(replaceControlCharacters(line))
      .replace(/[ \t]+/gu, ' ')
      .trimEnd());
  const normalized = lines
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (!normalized) return null;
  return normalized;
}

function sanitizeNarrativeArtifact(result, {
  maxLength,
  correlationId,
  emptyReasonCode,
}) {
  if (containsProhibitedClinicalGuidance(result)) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.WITHHELD,
      reasonCode: 'clinical_boundary',
      correlationId,
    });
  }
  const normalized = normalizeNarrativeFormatting(result);
  if (!normalized) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: emptyReasonCode,
      correlationId,
    });
  }
  const locallyTruncated = normalized.length > maxLength;
  const cleaned = normalized.slice(0, maxLength);
  if (containsProhibitedClinicalGuidance(cleaned)) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.WITHHELD,
      reasonCode: 'clinical_boundary',
      correlationId,
    });
  }
  return createPublicationArtifact({
    status: locallyTruncated
      ? PUBLICATION_STATUSES.PARTIAL
      : PUBLICATION_STATUSES.AVAILABLE,
    content: cleaned,
    reasonCode: locallyTruncated ? 'local_output_truncated' : null,
    correlationId,
    limitations: locallyTruncated
      ? ['The response exceeded the local publication length limit and was truncated.']
      : [],
  });
}

function parseJsonCandidate(result) {
  if (isPlainObject(result) || Array.isArray(result)) return result;
  if (typeof result !== 'string') return null;

  const trimmed = result.trim();
  if (!trimmed) return null;
  const attempts = [trimmed];

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  if (unfenced !== trimmed) attempts.push(unfenced);

  const firstObject = unfenced.indexOf('{');
  const lastObject = unfenced.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    attempts.push(unfenced.slice(firstObject, lastObject + 1));
  }

  const firstArray = unfenced.indexOf('[');
  const lastArray = unfenced.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    attempts.push(unfenced.slice(firstArray, lastArray + 1));
  }

  for (const attempt of [...new Set(attempts)]) {
    try {
      const parsed = JSON.parse(attempt);
      if (isPlainObject(parsed) || Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next bounded representation.
    }
  }
  return null;
}

function normalizeCandidateGene(value) {
  if (!isPlainObject(value)) return null;
  const symbol = typeof value.symbol === 'string'
    ? value.symbol.trim().toUpperCase()
    : '';
  if (!GENE_SYMBOL.test(symbol)) return null;

  const symbolPolicyText = symbol
    .replace(/-/gu, ' ')
    .replace(/(\d)(MG|MCG|UG|ML|UNITS?)\b/gu, '$1 $2');
  if (/^(?:TAKE|START|STOP|AVOID|USE|ADMINISTER|INJECT|SWALLOW|APPLY|PRESCRIBE|SWITCH)\b/u.test(symbolPolicyText)) return null;
  if (containsProhibitedClinicalGuidance(symbolPolicyText)) return null;

  const name = cleanNonClinicalText(value.name, 256);
  const explanation = cleanNonClinicalText(value.explanation, 2_000);
  return {
    symbol,
    ...(name ? { name } : {}),
    ...(explanation ? { explanation } : {}),
  };
}

function normalizeCandidateGenes(value, maxItems = 15) {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set();
  const genes = [];
  for (const item of input) {
    const gene = normalizeCandidateGene(item);
    if (!gene || seen.has(gene.symbol)) continue;
    seen.add(gene.symbol);
    genes.push(gene);
    if (genes.length >= maxItems) break;
  }
  return genes;
}

function trustedQueryClassification(taskInput) {
  const query = isPlainObject(taskInput?.query) ? taskInput.query : null;
  if (!query) return null;

  if (query.kind === 'hpo') {
    return {
      queryType: 'hpo_term',
      isDisease: false,
      isHPOTerm: true,
      diseaseName: null,
    };
  }

  if (query.kind === 'mondo') {
    return {
      queryType: 'disease',
      isDisease: true,
      isHPOTerm: false,
      diseaseName: cleanText(query.canonicalLabel, 256),
    };
  }

  if (query.kind === 'curated_concept'
    && (query.conceptKind === 'disease' || query.conceptKind === 'phenotype')) {
    const isDisease = query.conceptKind === 'disease';
    return {
      queryType: query.conceptKind,
      isDisease,
      isHPOTerm: false,
      diseaseName: isDisease ? cleanText(query.canonicalLabel, 256) : null,
    };
  }

  return null;
}

function normalizeClassification(parsed, taskInput = {}) {
  const source = isPlainObject(parsed) ? parsed : {};
  const trusted = trustedQueryClassification(taskInput);
  const modelIsDisease = source.isDisease === true;
  const modelQueryType = ALLOWED_QUERY_TYPES.has(source.queryType)
    ? source.queryType
    : (modelIsDisease ? 'disease' : 'phenotype');
  const queryType = trusted?.queryType ?? modelQueryType;
  const isDisease = trusted?.isDisease ?? modelIsDisease;
  const isHPOTerm = trusted?.isHPOTerm ?? source.isHPOTerm === true;
  const diseaseName = isDisease
    ? trusted?.diseaseName ?? cleanNonClinicalText(source.diseaseName, 256)
    : null;
  const inheritancePattern = cleanNonClinicalText(source.inheritancePattern, 256);
  return {
    queryType,
    isDisease,
    ...(diseaseName ? { diseaseName } : {}),
    isHPOTerm,
    mainFeatures: cleanStringArray(source.mainFeatures, {
      maxItems: 20,
      maxLength: 256,
      nonClinical: true,
    }),
    synonyms: cleanStringArray(source.synonyms, {
      maxItems: 20,
      maxLength: 256,
      nonClinical: true,
    }),
    ...(inheritancePattern ? { inheritancePattern } : {}),
    hpoTerms: [],
  };
}

function normalizeGeneProfile(parsed) {
  const source = isPlainObject(parsed) ? parsed : {};
  const candidateSummary = cleanText(source.summary, 4_000);
  const summaryStatus = !candidateSummary
    ? 'unavailable'
    : containsProhibitedClinicalGuidance(source.summary)
      || containsProhibitedClinicalGuidance(candidateSummary)
      ? 'withheld'
      : 'available';
  const summary = summaryStatus === 'available'
    ? candidateSummary
    : summaryStatus === 'withheld'
      ? WITHHELD_PROFILE_SUMMARY
      : UNAVAILABLE_PROFILE_SUMMARY;
  const keyTakeaways = cleanStringArray(source.keyTakeaways, {
    maxItems: 12,
    maxLength: 500,
    nonClinical: true,
  });
  const phenotypeNames = cleanStringArray(
    Array.isArray(source.phenotypes)
      ? source.phenotypes.map((item) => (isPlainObject(item) ? item.name : item))
      : [],
    { maxItems: 20, maxLength: 256, nonClinical: true },
  );
  return {
    summary,
    summaryStatus,
    keyTakeaways,
    phenotypes: phenotypeNames.map((name) => ({ name })),
  };
}

function safeEmptyCandidateOutput(operation, taskInput) {
  if (operation === 'classify') return normalizeClassification({}, taskInput);
  if (operation === 'gene_profile') return normalizeGeneProfile({});
  if (operation === 'suggest_candidates') return { candidateGenes: [] };
  return { ...normalizeClassification({}, taskInput), candidateGenes: [] };
}

function sanitizeCandidateTaskOutput(taskInput, result) {
  const operation = taskInput?.operation;
  const parsed = parseJsonCandidate(result);
  if (!parsed) return JSON.stringify(safeEmptyCandidateOutput(operation, taskInput));

  if (operation === 'gene_profile') {
    return JSON.stringify(normalizeGeneProfile(parsed));
  }

  if (operation === 'classify') {
    return JSON.stringify(normalizeClassification(parsed, taskInput));
  }

  const candidateSource = Array.isArray(parsed)
    ? parsed
    : parsed.candidateGenes;
  const candidateGenes = normalizeCandidateGenes(candidateSource);
  if (operation === 'suggest_candidates') {
    return JSON.stringify({ candidateGenes });
  }

  return JSON.stringify({
    ...normalizeClassification(parsed, taskInput),
    candidateGenes,
  });
}

/**
 * Fail closed on malformed or policy-violating quiz fields without changing the
 * option order or correct index. Dropping an individual option could silently
 * turn a valid index into a different answer, so any invalid option rejects the
 * entire question.
 */
function sanitizeEducationQuizItems(result, maxItems) {
  if (!Array.isArray(result)) {
    return { questions: [], rejectedCount: 0 };
  }
  const questions = [];
  let rejectedCount = 0;
  for (const item of result) {
    if (!isPlainObject(item) || !Array.isArray(item.options)) {
      rejectedCount += 1;
      continue;
    }
    const question = cleanNonClinicalText(item.question, 1_000);
    const options = item.options.slice(0, 6).map((option) => cleanNonClinicalText(option, 500));
    const explanation = cleanNonClinicalText(item.explanation, 2_000);
    const correctIndex = item.correctIndex;
    if (
      !question
      || options.length < 2
      || options.some((option) => !option)
      || !Number.isInteger(correctIndex)
      || correctIndex < 0
      || correctIndex >= options.length
      || !explanation
    ) {
      rejectedCount += 1;
      continue;
    }
    questions.push({ question, options, correctIndex, explanation });
    if (questions.length >= maxItems) break;
  }
  return { questions, rejectedCount };
}

export function sanitizeEducationQuizOutput(result, maxItems = 20) {
  return sanitizeEducationQuizItems(result, maxItems).questions;
}

const PROVIDER_COMPLETIONS = new Set(['complete', 'unknown', 'truncated', 'filtered', 'failed']);

function providerCompletion(result) {
  if (isPlainObject(result)) {
    const hasText = Object.hasOwn(result, 'text');
    const hasCompletionMetadata = Object.hasOwn(result, 'completion');
    if (!hasText && !hasCompletionMetadata) {
      return { text: result, completion: 'unknown' };
    }
    const suppliedCompletion = result.completion;
    const structuredText = hasText
      ? result.text
      : Object.fromEntries(
        Object.entries(result).filter(([key]) => key !== 'completion'),
      );
    return {
      text: structuredText,
      completion: typeof suppliedCompletion === 'string'
        && PROVIDER_COMPLETIONS.has(suppliedCompletion)
        ? suppliedCompletion
        : hasCompletionMetadata
          ? 'failed'
          : 'unknown',
    };
  }
  return { text: result, completion: 'unknown' };
}

function containsProhibitedClinicalGuidanceDeep(value) {
  if (typeof value === 'string') return containsProhibitedClinicalGuidance(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsProhibitedClinicalGuidanceDeep(item));
  }
  if (!isPlainObject(value)) return false;
  return Object.values(value).some((item) => containsProhibitedClinicalGuidanceDeep(item));
}

function completionArtifact(completion, correlationId) {
  if (completion === 'filtered') {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.WITHHELD,
      reasonCode: 'provider_filtered',
      correlationId,
    });
  }
  if (completion === 'failed') {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: 'provider_incomplete',
      correlationId,
    });
  }
  return null;
}

export function sanitizeEducationQuizArtifact(result, expectedItems = 5, options = {}) {
  const correlationId = options.correlationId || 'internal-publication';
  const requestedItems = Number.isInteger(expectedItems) && expectedItems > 0
    ? Math.min(expectedItems, 20)
    : 5;
  const provider = providerCompletion(result);
  const terminal = completionArtifact(provider.completion, correlationId);
  if (terminal) return terminal;
  if (provider.completion === 'truncated') {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: 'provider_truncated_structured_output',
      correlationId,
    });
  }

  const { questions, rejectedCount } = sanitizeEducationQuizItems(provider.text, requestedItems);
  if (questions.length === 0) {
    const crossedClinicalBoundary = containsProhibitedClinicalGuidanceDeep(provider.text);
    return createPublicationArtifact({
      status: crossedClinicalBoundary
        ? PUBLICATION_STATUSES.WITHHELD
        : PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: crossedClinicalBoundary
        ? 'clinical_boundary'
        : 'provider_malformed',
      correlationId,
    });
  }

  if (questions.length < requestedItems || rejectedCount > 0) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.PARTIAL,
      content: questions,
      reasonCode: 'items_withheld_or_missing',
      correlationId,
      limitations: [`Returned ${questions.length} of ${requestedItems} requested safe questions; ${rejectedCount} provider item(s) were rejected.`],
    });
  }
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.AVAILABLE,
    content: questions,
    correlationId,
  });
}

export function sanitizePublicationArtifact(publicationTask, taskInput, result, options = {}) {
  const correlationId = options.correlationId || 'internal-publication';
  const provider = providerCompletion(result);
  const terminal = completionArtifact(provider.completion, correlationId);
  if (terminal) return terminal;

  if (publicationTask === TASKS.CANDIDATE_GENE) {
    if (provider.completion === 'truncated') {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_truncated_structured_output',
        correlationId,
      });
    }
    const parsed = parseJsonCandidate(provider.text);
    if (!parsed) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_malformed',
        correlationId,
      });
    }
    const content = JSON.parse(sanitizeCandidateTaskOutput(taskInput, parsed));
    const crossedClinicalBoundary = containsProhibitedClinicalGuidanceDeep(parsed);
    if (taskInput?.operation === 'gene_profile'
      && content.summaryStatus === 'withheld') {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.WITHHELD,
        reasonCode: 'clinical_boundary',
        correlationId,
      });
    }
    if (taskInput?.operation === 'gene_profile'
      && content.summaryStatus === 'unavailable') {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'profile_summary_unavailable',
        correlationId,
      });
    }
    const hasSafeCandidateContent = Array.isArray(content.candidateGenes)
      ? content.candidateGenes.length > 0
      : taskInput?.operation === 'gene_profile'
        ? content.summaryStatus === 'available'
          || content.keyTakeaways?.length > 0
          || content.phenotypes?.length > 0
        : true;
    if (crossedClinicalBoundary && !hasSafeCandidateContent) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.WITHHELD,
        reasonCode: 'clinical_boundary',
        correlationId,
      });
    }
    if (crossedClinicalBoundary) {
      // The normalized candidate output contains only fields that passed the
      // boundary. A partial status makes the omission visible without ever
      // carrying the blocked provider text inside the artifact.
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.PARTIAL,
        content,
        reasonCode: 'clinical_fields_withheld',
        correlationId,
        limitations: ['One or more provider fields crossed the non-clinical publication boundary and were omitted.'],
      });
    }
    const candidateCount = Array.isArray(content.candidateGenes)
      ? content.candidateGenes.length
      : null;
    const hasClassificationDetail = Boolean(
      content.diseaseName
      || content.inheritancePattern
      || content.mainFeatures?.length
      || content.synonyms?.length,
    );
    if (taskInput?.operation === 'suggest_candidates' && candidateCount === 0) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_empty',
        correlationId,
      });
    }
    if (taskInput?.operation === 'classify' && !hasClassificationDetail) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_empty',
        correlationId,
      });
    }
    if (taskInput?.operation === 'classify_and_suggest' && candidateCount === 0) {
      if (!hasClassificationDetail) {
        return createPublicationArtifact({
          status: PUBLICATION_STATUSES.UNAVAILABLE,
          reasonCode: 'provider_empty',
          correlationId,
        });
      }
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.PARTIAL,
        content,
        reasonCode: 'candidate_leads_missing',
        correlationId,
        limitations: ['The reviewed query classification is available, but the provider returned no reusable candidate-gene leads.'],
      });
    }
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.AVAILABLE,
      content,
      correlationId,
    });
  }

  const taskConfig = publicationTask === TASKS.GENETICS_EDUCATION
    ? { maxLength: 8_000, emptyReasonCode: 'provider_empty' }
    : RESEARCH_TASKS.has(publicationTask)
      ? { maxLength: 12_000, emptyReasonCode: 'provider_empty' }
      : publicationTask === TASKS.LEARNING_ACTIVITY
        ? { maxLength: 3_000, emptyReasonCode: 'provider_empty' }
        : null;
  if (!taskConfig) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: 'unsupported_publication_task',
      correlationId,
    });
  }

  const artifact = sanitizeNarrativeArtifact(provider.text, {
    ...taskConfig,
    correlationId,
  });
  if (provider.completion !== 'truncated'
    || ![PUBLICATION_STATUSES.AVAILABLE, PUBLICATION_STATUSES.PARTIAL].includes(artifact.status)) {
    return artifact;
  }
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.PARTIAL,
    content: artifact.content,
    reasonCode: 'provider_truncated',
    correlationId,
    limitations: [
      'The provider reached its output limit; the response may be incomplete.',
      ...artifact.limitations,
    ],
  });
}

export function sanitizePublicationTaskOutput(publicationTask, taskInput, result) {
  return sanitizePublicationArtifact(publicationTask, taskInput, result, {
    correlationId: 'legacy-publication-boundary',
  });
}

export const __test = {
  decodeHtmlEntities,
  normalizeVisibleText,
  semanticSafetyText,
  cleanText,
  cleanNonClinicalText,
  cleanStringArray,
  containsProhibitedClinicalGuidance,
  scanPassivePercentageFrame,
  parseJsonCandidate,
  normalizeCandidateGene,
  normalizeCandidateGenes,
  trustedQueryClassification,
  normalizeClassification,
  normalizeGeneProfile,
  WITHHELD_PROFILE_SUMMARY,
  UNAVAILABLE_PROFILE_SUMMARY,
};
