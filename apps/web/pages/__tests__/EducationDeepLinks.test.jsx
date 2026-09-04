import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import TopicExplorer from '../TopicExplorer';
import QuizMode from '../QuizMode';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    getTopics: vi.fn(),
    getExplanation: vi.fn(),
    chat: vi.fn(),
    generateQuiz: vi.fn(),
    updateLearningProgress: vi.fn(),
  },
}));

vi.mock('@/lib/EducationLevelContext', () => ({
  useEducationLevel: () => ({
    level: 'undergraduate',
    levelConfig: { label: 'Undergraduate' },
  }),
}));
vi.mock('@/components/education/AdaptiveExplanation', () => ({ default: () => null }));
vi.mock('@/components/education/LevelPicker', () => ({ default: () => null }));
vi.mock('@/components/education/UsageBanner', () => ({ default: () => null }));
vi.mock('@/components/shared/MedicalDisclaimer', () => ({ default: () => null }));
vi.mock('@/components/shared/SourceList', () => ({
  default: ({ sources, title }) => (
    <section aria-label={title}>
      {(sources || []).map((source) => (
        <a key={source.url} href={source.url}>{source.label}</a>
      ))}
    </section>
  ),
}));
vi.mock('@/components/shared/safeModelMarkdown', () => ({ safeModelMarkdownComponents: {} }));
vi.mock('@/components/ui/progress', () => ({ Progress: () => null }));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }) => <div>{children}</div>,
  TabsContent: ({ children }) => <div>{children}</div>,
  TabsList: ({ children }) => <div>{children}</div>,
  TabsTrigger: ({ children }) => <button type="button">{children}</button>,
}));

const catalog = [{
  category: 'Foundations',
  topics: [{ id: 'what-is-dna', title: 'What is DNA?' }],
}];

describe('education deep-link catalog boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.getTopics.mockResolvedValue(catalog);
  });

  it('rejects an unknown Topic Explorer id without displaying its attacker title or generating', async () => {
    render(
      <MemoryRouter initialEntries={['/topicexplorer?topic=invented&title=Take%20Tylenol']}>
        <TopicExplorer />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/topic is unavailable/i);
    expect(screen.queryByText(/take tylenol/i)).not.toBeInTheDocument();
    await waitFor(() => expect(apiClient.getTopics).toHaveBeenCalledOnce());
    expect(apiClient.getExplanation).not.toHaveBeenCalled();
    expect(apiClient.chat).not.toHaveBeenCalled();
  });

  it('resolves a valid Topic Explorer id before generation and ignores its URL title', async () => {
    apiClient.getExplanation.mockResolvedValue({
      publication: {
        contractVersion: 1,
        status: 'available',
        content: 'Catalog-bounded explanation.',
        reasonCode: null,
        correlationId: 'explanation-deep-link-test',
        limitations: [],
      },
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?', category: 'Foundations' },
      sources: [],
    });

    render(
      <MemoryRouter initialEntries={['/topicexplorer?topic=what-is-dna&title=Take%20Tylenol']}>
        <TopicExplorer />
      </MemoryRouter>,
    );

    expect(await screen.findByText('What is DNA?')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.getExplanation).toHaveBeenCalledWith({
      topic: 'what-is-dna',
      level: 'undergraduate',
    }));
    expect(apiClient.getTopics.mock.invocationCallOrder[0])
      .toBeLessThan(apiClient.getExplanation.mock.invocationCallOrder[0]);
    expect(screen.queryByText(/take tylenol/i)).not.toBeInTheDocument();
  });

  it('rejects an unknown Quiz id without displaying its attacker title or generating', async () => {
    render(
      <MemoryRouter initialEntries={['/quizmode?topic=invented&title=Take%20Tylenol']}>
        <QuizMode />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/topic is unavailable/i);
    expect(screen.queryByText(/take tylenol/i)).not.toBeInTheDocument();
    await waitFor(() => expect(apiClient.getTopics).toHaveBeenCalledOnce());
    expect(apiClient.generateQuiz).not.toHaveBeenCalled();
  });

  it('uses the catalog title and persists each correct quiz answer exactly once', async () => {
    const questions = [
      {
        question: 'Question one?',
        options: ['Correct one', 'Wrong one'],
        correctIndex: 0,
        explanation: 'First explanation.',
      },
      {
        question: 'Question two?',
        options: ['Wrong two', 'Correct two'],
        correctIndex: 1,
        explanation: 'Second explanation.',
      },
    ];
    apiClient.generateQuiz.mockResolvedValue({
      publication: {
        contractVersion: 1,
        status: 'available',
        content: questions,
        reasonCode: null,
        correlationId: 'quiz-score-test',
        limitations: [],
      },
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?', category: 'Foundations' },
      sources: [{
        label: 'DNA glossary',
        publisher: 'National Human Genome Research Institute',
        url: 'https://www.genome.gov/genetics-glossary/Deoxyribonucleic-Acid-DNA',
      }],
    });
    apiClient.updateLearningProgress.mockResolvedValue({});

    render(
      <MemoryRouter initialEntries={['/quizmode?topic=what-is-dna&title=Take%20Tylenol']}>
        <QuizMode />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Question one?')).toBeInTheDocument();
    expect(screen.getByText('What is DNA? Quiz')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'References for this quiz' }))
      .toHaveTextContent('DNA glossary');
    expect(screen.queryByText(/take tylenol/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /correct one/i }));
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    fireEvent.click(await screen.findByRole('button', { name: /correct two/i }));
    fireEvent.click(screen.getByRole('button', { name: /see results/i }));

    await waitFor(() => expect(apiClient.updateLearningProgress).toHaveBeenCalledWith({
      topicId: 'what-is-dna',
      score: 2,
      totalQuestions: 2,
    }));
    expect(apiClient.updateLearningProgress).toHaveBeenCalledTimes(1);
  });
});
