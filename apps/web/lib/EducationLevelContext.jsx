import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

const EducationLevelContext = createContext();

export const EDUCATION_LEVELS = {
  elementary: {
    id: 'elementary',
    label: 'Elementary School',
    shortLabel: 'Elementary',
    ageRange: 'Ages 5–10',
    description: 'Simple words, fun analogies, colorful pictures',
    icon: '🧒',
    vocabularyComplexity: 1,
    detailDepth: 1,
    analogyStyle: 'everyday_objects',
    visualizationComplexity: 1,
    promptGuidance: 'Explain like you are talking to a 7-year-old. Use very simple words, fun comparisons to everyday things (like recipes, building blocks, instruction manuals). Avoid all scientific jargon. Keep sentences short.',
  },
  middle_school: {
    id: 'middle_school',
    label: 'Middle School',
    shortLabel: 'Middle',
    ageRange: 'Ages 11–13',
    description: 'Basic science terms with clear definitions',
    icon: '📚',
    vocabularyComplexity: 2,
    detailDepth: 2,
    analogyStyle: 'science_class',
    visualizationComplexity: 2,
    promptGuidance: 'Explain for a middle school science class. Introduce basic scientific terms but always define them. Use relatable analogies. Include "did you know?" facts to keep it interesting.',
  },
  high_school: {
    id: 'high_school',
    label: 'High School',
    shortLabel: 'High School',
    ageRange: 'Ages 14–18',
    description: 'Standard biology terminology and diagrams',
    icon: '🔬',
    vocabularyComplexity: 3,
    detailDepth: 3,
    analogyStyle: 'textbook',
    visualizationComplexity: 3,
    promptGuidance: 'Explain at a high school AP Biology level. Use proper scientific terminology with brief definitions. Include molecular details where relevant. Reference textbook-style diagrams and processes.',
  },
  undergraduate: {
    id: 'undergraduate',
    label: 'Undergraduate',
    shortLabel: 'Undergrad',
    ageRange: 'College level',
    description: 'University-level genetics with molecular detail',
    icon: '🎓',
    vocabularyComplexity: 4,
    detailDepth: 4,
    analogyStyle: 'mechanistic',
    visualizationComplexity: 4,
    promptGuidance: 'Explain at an undergraduate genetics/molecular biology level. Use full scientific terminology. Discuss mechanisms, pathways, and experimental evidence. Reference key studies and techniques.',
  },
  graduate: {
    id: 'graduate',
    label: 'Graduate',
    shortLabel: 'Graduate',
    ageRange: 'Masters / PhD',
    description: 'Advanced topics with research context',
    icon: '🧬',
    vocabularyComplexity: 5,
    detailDepth: 5,
    analogyStyle: 'research',
    visualizationComplexity: 5,
    promptGuidance: 'Explain at a graduate-level genetics depth. Discuss current research, nuances, conflicting evidence, and methodological considerations. Include references to key papers and advanced concepts like epigenetics, regulatory networks, and systems biology.',
  },
  postgraduate: {
    id: 'postgraduate',
    label: 'Post-Graduate / Professional',
    shortLabel: 'Post-Grad',
    ageRange: 'Postdoc / Professional',
    description: 'Expert-level with latest research and data',
    icon: '📊',
    vocabularyComplexity: 6,
    detailDepth: 6,
    analogyStyle: 'publication',
    visualizationComplexity: 6,
    promptGuidance: 'Explain at a postdoctoral / principal investigator level. Assume deep familiarity with genetics. Focus on cutting-edge research, unresolved questions, methodological innovations, and clinical translational aspects. Reference specific loci, alleles, GWAS hits, and functional genomics data.',
  },
};

export const LEVEL_ORDER = [
  'elementary',
  'middle_school',
  'high_school',
  'undergraduate',
  'graduate',
  'postgraduate',
];

const STORAGE_KEY = 'genemap_education_level';

export const EducationLevelProvider = ({ children }) => {
  const { user } = useAuth();
  const [level, setLevelState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user?.education_level && EDUCATION_LEVELS[user.education_level]) {
      setLevelState(user.education_level);
    }
  }, [user?.education_level]);

  const setLevel = useCallback((newLevel) => {
    if (!EDUCATION_LEVELS[newLevel]) return;
    setLevelState(newLevel);
    try {
      localStorage.setItem(STORAGE_KEY, newLevel);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const levelConfig = useMemo(() => level ? EDUCATION_LEVELS[level] : null, [level]);
  const needsOnboarding = !level;

  const value = useMemo(() => ({
    level,
    setLevel,
    levelConfig,
    needsOnboarding,
    allLevels: EDUCATION_LEVELS,
    levelOrder: LEVEL_ORDER,
  }), [level, setLevel, levelConfig, needsOnboarding]);

  return (
    <EducationLevelContext.Provider value={value}>
      {children}
    </EducationLevelContext.Provider>
  );
};

export const useEducationLevel = () => {
  const context = useContext(EducationLevelContext);
  if (!context) {
    throw new Error('useEducationLevel must be used within an EducationLevelProvider');
  }
  return context;
};
