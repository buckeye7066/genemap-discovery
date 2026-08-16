export const onboardingStorageKey = 'genemap-discovery:onboarding-dismissed';

export const onboardingSteps = [
  {
    stepNumber: 1,
    title: 'Choose a file',
    plainLanguageDescription: 'When upload tools are ready, you will choose a genetic data file from your device.',
    userBenefit: 'You can see what is needed before you share anything.',
    safetyNote: 'Only choose a file if you are comfortable using it here.',
  },
  {
    stepNumber: 2,
    title: 'Check the file type',
    plainLanguageDescription: 'The app will check whether the file looks like a supported format.',
    userBenefit: 'This helps catch common file mistakes early.',
    safetyNote: 'A file check is not a medical review.',
  },
  {
    stepNumber: 3,
    title: 'Review privacy reminders',
    plainLanguageDescription: 'You will see clear reminders about what happens next.',
    userBenefit: 'You can pause before continuing.',
    safetyNote: 'Do not upload anything you do not want to use.',
  },
  {
    stepNumber: 4,
    title: 'Read the summary',
    plainLanguageDescription: 'The app will show a simple overview of what it can and cannot explain.',
    userBenefit: 'You know the limits before viewing details.',
    safetyNote: 'The app is for learning, not diagnosis or treatment decisions.',
  },
  {
    stepNumber: 5,
    title: 'Explore gene details',
    plainLanguageDescription: 'You may be able to view educational information connected to genes in your file.',
    userBenefit: 'This can help you understand terms and context.',
    safetyNote: 'Gene information does not tell you what action to take.',
  },
  {
    stepNumber: 6,
    title: 'Look up related conditions',
    plainLanguageDescription: 'You may be able to read trusted background information about related conditions.',
    userBenefit: 'This supports learning in plain language.',
    safetyNote: 'This is not a diagnosis or personal risk estimate.',
  },
  {
    stepNumber: 7,
    title: 'Save or leave',
    plainLanguageDescription: 'You will be told what choices are available for keeping or leaving the results.',
    userBenefit: 'You stay in control of your next step.',
    safetyNote: 'Do not rely on this app for urgent or personal medical choices.',
  },
  {
    stepNumber: 8,
    title: 'Decide what to explore next',
    plainLanguageDescription: 'You can continue learning, explore more terms, or leave the upload area.',
    userBenefit: 'There is always a clear next step.',
    safetyNote: 'For personal health questions, speak with a qualified healthcare professional.',
  },
];
