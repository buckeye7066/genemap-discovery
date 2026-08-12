import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuizMode from '../QuizMode';
import { apiClient } from '@genemap/shared';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    generateQuiz: vi.fn(),
    updateLearningProgress: vi.fn(),
    getTopics: vi.fn(),
  },
}));

vi.mock('@/lib/EducationLevelContext', () => ({
  useEducationLevel: () => ({
    level: 'undergraduate',
    levelConfig: { label: 'Undergraduate' },
  }),
}));

describe('QuizMode progress integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // QuizMode now verifies the requested topic against the reviewed catalog
    // (apiClient.getTopics) before generating a quiz for it, and the server
    // wraps generated questions in a canonical publication artifact rather
    // than returning `{ questions }` directly.
    apiClient.getTopics.mockResolvedValue([
      {
        category: 'Genetics Basics',
        topics: [{ id: 'what-is-dna', title: 'What is DNA?' }],
      },
    ]);
    apiClient.generateQuiz.mockResolvedValue({
      topicMetadata: {
        id: 'what-is-dna',
        title: 'What is DNA?',
        description: 'Introductory genetics.',
        category: 'Genetics Basics',
        catalogVersion: 1,
      },
      publication: {
        contractVersion: 1,
        status: 'available',
        content: [{
          question: 'Which molecule stores hereditary information?',
          options: ['DNA', 'Water'],
          correctIndex: 0,
          explanation: 'DNA stores hereditary information.',
        }],
        reasonCode: null,
        correlationId: 'quiz:test-what-is-dna',
        limitations: [],
      },
    });
    apiClient.updateLearningProgress.mockResolvedValue({
      topicId: 'what-is-dna',
      bestScore: 1,
      totalQuestions: 1,
      attempts: 1,
    });
  });

  it('persists the same final score shown to the learner exactly once', async () => {
    render(
      <MemoryRouter initialEntries={['/quizmode?topic=what-is-dna&title=What%20is%20DNA%3F']}>
        <Routes>
          <Route path="/quizmode" element={<QuizMode />} />
        </Routes>
      </MemoryRouter>,
    );

    const correctAnswer = await screen.findByRole('button', { name: /a dna/i });
    fireEvent.click(correctAnswer);
    fireEvent.click(screen.getByRole('button', { name: /see results/i }));

    await screen.findByText('1/1');
    expect(screen.getByText('100%')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.updateLearningProgress).toHaveBeenCalledOnce());
    expect(apiClient.updateLearningProgress).toHaveBeenCalledWith({
      topicId: 'what-is-dna',
      score: 1,
      totalQuestions: 1,
    });
  });
});
