import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import QuizMode from '../QuizMode';
import TopicExplorer from '../TopicExplorer';

const educationState = vi.hoisted(() => ({ level: 'undergraduate' }));

vi.mock('@genemap/shared', () => ({
  apiClient: {
    getTopics: vi.fn(),
    generateQuiz: vi.fn(),
    updateLearningProgress: vi.fn(),
    getExplanation: vi.fn(),
    generateImage: vi.fn(),
    chat: vi.fn(),
  },
}));

vi.mock('@/lib/EducationLevelContext', () => ({
  useEducationLevel: () => ({
    level: educationState.level,
    levelConfig: { label: educationState.level },
  }),
}));
vi.mock('@/components/education/AdaptiveExplanation', () => ({
  default: ({ artifact, loading }) => (
    <div data-testid="adaptive-explanation">
      {loading ? 'explanation-loading' : artifact?.content || 'no-explanation'}
    </div>
  ),
}));
vi.mock('@/components/education/AdaptiveImage', () => ({
  default: ({ artifact, loading }) => (
    <div data-testid="adaptive-image">
      {loading
        ? 'image-loading'
        : `${artifact?.status || 'none'}:${artifact?.correlationId || 'no-correlation'}:${artifact?.content?.imageUrl || 'no-image'}`}
    </div>
  ),
}));
vi.mock('@/components/education/LevelPicker', () => ({ default: () => null }));
vi.mock('@/components/education/UsageBanner', () => ({ default: () => null }));
vi.mock('@/components/shared/MedicalDisclaimer', () => ({ default: () => null }));
vi.mock('@/components/shared/SourceList', () => ({ default: () => null }));
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
  topics: [
    { id: 'what-is-dna', title: 'What is DNA?' },
    { id: 'gene-expression', title: 'Gene Expression' },
  ],
}];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function publication(content, correlationId) {
  return {
    contractVersion: 1,
    status: 'available',
    content,
    reasonCode: null,
    correlationId,
    limitations: [],
  };
}

function quizResponse(topicId, title, question) {
  return {
    publication: publication([{
      question,
      options: ['Correct', 'Incorrect'],
      correctIndex: 0,
      explanation: 'Explanation.',
    }], `quiz:${topicId}`),
    topicMetadata: { id: topicId, title, category: 'Foundations' },
  };
}

function RoutedPage({ path, Page }) {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(path);
  }, [navigate, path]);
  return <Page />;
}

function routedElement(path, Page) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <RoutedPage path={path} Page={Page} />
    </MemoryRouter>
  );
}

describe('education async publication boundaries', () => {
  beforeEach(() => {
    educationState.level = 'undergraduate';
    vi.resetAllMocks();
    apiClient.getTopics.mockResolvedValue(catalog);
    apiClient.updateLearningProgress.mockResolvedValue({});
  });

  it('ignores stale quiz success and error completions across topic and level changes', async () => {
    const staleSuccess = deferred();
    const staleError = deferred();
    const current = deferred();
    apiClient.generateQuiz
      .mockImplementationOnce(() => staleSuccess.promise)
      .mockImplementationOnce(() => staleError.promise)
      .mockImplementationOnce(() => current.promise);

    const firstPath = '/quizmode?topic=what-is-dna';
    const { rerender } = render(routedElement(firstPath, QuizMode));
    await waitFor(() => expect(apiClient.generateQuiz).toHaveBeenCalledTimes(1));

    const secondPath = '/quizmode?topic=gene-expression';
    rerender(routedElement(secondPath, QuizMode));
    expect(screen.queryByText(/stale quiz question/i)).toBeNull();
    await waitFor(() => expect(apiClient.generateQuiz).toHaveBeenCalledTimes(2));

    educationState.level = 'graduate';
    rerender(routedElement(secondPath, QuizMode));
    await waitFor(() => expect(apiClient.generateQuiz).toHaveBeenCalledTimes(3));

    await act(async () => {
      current.resolve(quizResponse('gene-expression', 'Gene Expression', 'Current quiz question?'));
      await current.promise;
    });
    expect(await screen.findByText('Current quiz question?')).toBeInTheDocument();

    await act(async () => {
      staleSuccess.resolve(quizResponse('what-is-dna', 'What is DNA?', 'Stale quiz question?'));
      staleError.reject(new Error('stale quiz failure'));
      await Promise.allSettled([staleSuccess.promise, staleError.promise]);
    });

    expect(screen.getByText('Current quiz question?')).toBeInTheDocument();
    expect(screen.queryByText('Stale quiz question?')).toBeNull();
    expect(screen.queryByText(/stale quiz failure/i)).toBeNull();
    expect(screen.queryByText(/generating quiz questions/i)).toBeNull();
  });

  it('keeps explanation, image, and chat completions independent and scoped to topic plus level', async () => {
    const staleExplanation = deferred();
    const currentExplanation = deferred();
    const staleImage = deferred();
    const currentImage = deferred();
    const staleChat = deferred();
    const currentChat = deferred();
    apiClient.getExplanation
      .mockImplementationOnce(() => staleExplanation.promise)
      .mockImplementationOnce(() => currentExplanation.promise);
    apiClient.generateImage
      .mockImplementationOnce(() => staleImage.promise)
      .mockImplementationOnce(() => currentImage.promise);
    apiClient.chat
      .mockImplementationOnce(() => staleChat.promise)
      .mockImplementationOnce(() => currentChat.promise);

    const path = '/topicexplorer?topic=what-is-dna';
    const { rerender } = render(routedElement(path, TopicExplorer));
    await waitFor(() => expect(apiClient.getExplanation).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^generate image$/i }));
    fireEvent.click(screen.getByRole('button', { name: /explain another way/i }));
    await waitFor(() => expect(apiClient.generateImage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiClient.chat).toHaveBeenCalledTimes(1));

    educationState.level = 'graduate';
    rerender(routedElement(path, TopicExplorer));
    expect(screen.getByTestId('adaptive-explanation')).toHaveTextContent('explanation-loading');
    expect(screen.getByTestId('adaptive-image')).toHaveTextContent('none:no-correlation:no-image');
    expect(screen.getByTestId('adaptive-image')).not.toHaveTextContent('stale.example');
    await waitFor(() => expect(apiClient.getExplanation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /^generate image$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /^generate image$/i }));
    fireEvent.click(screen.getByRole('button', { name: /give a general example/i }));
    await waitFor(() => expect(apiClient.generateImage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(apiClient.chat).toHaveBeenCalledTimes(2));

    await act(async () => {
      staleExplanation.resolve({
        publication: publication('Stale explanation.', 'explanation:stale'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
        sources: [],
      });
      staleImage.resolve({
        publication: publication({
          imageUrl: 'https://stale.example/image.png',
          revisedPrompt: null,
        }, 'image:stale'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      });
      staleChat.reject(new Error('stale tutor failure'));
      await Promise.allSettled([staleExplanation.promise, staleImage.promise, staleChat.promise]);
    });

    expect(screen.getByTestId('adaptive-explanation')).toHaveTextContent('explanation-loading');
    expect(screen.getByRole('button', { name: /^generate image$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /give a general example/i })).toBeDisabled();
    expect(screen.queryByText(/stale explanation/i)).toBeNull();
    expect(screen.queryByText(/stale tutor failure/i)).toBeNull();
    expect(screen.getByTestId('adaptive-image')).not.toHaveTextContent('stale.example');

    await act(async () => {
      currentExplanation.resolve({
        publication: publication('Current explanation.', 'explanation:current'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
        sources: [],
      });
      currentImage.resolve({
        publication: publication({
          imageUrl: 'https://current.example/image.png',
          revisedPrompt: null,
        }, 'image:current'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      });
      currentChat.resolve({
        publication: publication('Current tutor response.', 'chat:current'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      });
      await Promise.all([currentExplanation.promise, currentImage.promise, currentChat.promise]);
    });

    expect(await screen.findByText('Current explanation.')).toBeInTheDocument();
    expect(screen.getByTestId('adaptive-image')).toHaveTextContent('current.example/image.png');
    expect(await screen.findByText('Current tutor response.')).toBeInTheDocument();
    expect(screen.queryByText(/stale/i)).toBeNull();
  });

  it('requires an own null-or-string revisedPrompt before image content is reusable', async () => {
    apiClient.getExplanation.mockResolvedValue({
      publication: publication('Current explanation.', 'explanation:image-validator'),
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      sources: [],
    });
    apiClient.generateImage
      .mockResolvedValueOnce({
        publication: publication({ imageUrl: 'https://example.test/missing.png' }, 'image:missing'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      })
      .mockResolvedValueOnce({
        publication: publication({
          imageUrl: 'https://example.test/number.png',
          revisedPrompt: 42,
        }, 'image:number'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      })
      .mockResolvedValueOnce({
        publication: publication({
          imageUrl: 'https://example.test/valid.png',
          revisedPrompt: null,
        }, 'image:valid'),
        topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      });

    render(routedElement('/topicexplorer?topic=what-is-dna', TopicExplorer));
    await screen.findByText('Current explanation.');

    fireEvent.click(screen.getByRole('button', { name: /^generate image$/i }));
    await waitFor(() => expect(screen.getByTestId('adaptive-image')).toHaveTextContent('unavailable:image:missing:no-image'));
    fireEvent.click(screen.getByRole('button', { name: /^regenerate image$/i }));
    await waitFor(() => expect(screen.getByTestId('adaptive-image')).toHaveTextContent('unavailable:image:number:no-image'));
    fireEvent.click(screen.getByRole('button', { name: /^regenerate image$/i }));
    await waitFor(() => expect(screen.getByTestId('adaptive-image')).toHaveTextContent('available:image:valid:https://example.test/valid.png'));
  });
});
