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
vi.mock('@/components/education/AdaptiveExplanation', async () => {
  const { default: PublicationState } = await vi.importActual('@/components/shared/PublicationState');
  return {
    default: ({ artifact, loading }) => (
      <div
        data-testid="adaptive-explanation"
        data-publication-reason={artifact?.reasonCode || ''}
      >
        {loading ? 'explanation-loading' : artifact?.content || 'no-explanation'}
        <PublicationState artifact={artifact} />
      </div>
    ),
  };
});
vi.mock('@/components/education/AdaptiveImage', async () => {
  const { default: PublicationState } = await vi.importActual('@/components/shared/PublicationState');
  return {
    default: ({ artifact, loading }) => (
      <div
        data-testid="adaptive-image"
        data-publication-reason={artifact?.reasonCode || ''}
      >
        {loading
          ? 'image-loading'
          : [
            artifact?.status || 'none',
            artifact?.correlationId || 'no-correlation',
            artifact?.content?.imageUrl || 'no-image',
            artifact?.content?.revisedPrompt || 'no-prompt',
          ].join(':')}
        <PublicationState artifact={artifact} />
      </div>
    ),
  };
});
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

function modelPublicationError(correlationId) {
  const error = new Error('Generated content is temporarily unavailable.');
  error.status = 503;
  error.details = {
    publication: {
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'model_publication_disabled',
      correlationId,
      limitations: [],
    },
  };
  return error;
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
      staleError.reject(modelPublicationError('quiz:stale-disabled'));
      await Promise.allSettled([staleSuccess.promise, staleError.promise]);
    });

    expect(screen.getByText('Current quiz question?')).toBeInTheDocument();
    expect(screen.queryByText('Stale quiz question?')).toBeNull();
    expect(screen.queryByText(/generated content is temporarily unavailable/i)).toBeNull();
    expect(screen.queryByText('quiz:stale-disabled')).toBeNull();
    expect(screen.queryByText(/generating quiz questions/i)).toBeNull();
  });

  it('renders the terminal recovery publication returned with a quiz 503', async () => {
    apiClient.generateQuiz.mockRejectedValue(modelPublicationError('quiz:recovery-disabled'));

    render(routedElement('/quizmode?topic=what-is-dna', QuizMode));

    const supportId = await screen.findByText('quiz:recovery-disabled');
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('Publication unavailable');
    expect(publicationAlert).toHaveTextContent('Support ID: quiz:recovery-disabled');
    expect(screen.queryByText(/quiz error/i)).toBeNull();
  });

  it.each([
    ['elementary', 'elementary'],
    ['middle_school', 'middle_school'],
    ['high_school', 'high_school'],
    ['undergraduate', 'undergraduate'],
    ['graduate', 'graduate'],
    ['postgraduate', 'postgraduate'],
    ['phd', 'graduate'],
    ['medical', 'postgraduate'],
    ['researcher', 'postgraduate'],
    ['__proto__', 'undergraduate'],
    ['constructor', 'undergraduate'],
    ['hasOwnProperty', 'undergraduate'],
    ['toString', 'undergraduate'],
  ])('sends saved level %s to the quiz API as %s', async (savedLevel, apiLevel) => {
    educationState.level = savedLevel;
    apiClient.generateQuiz.mockResolvedValue(
      quizResponse('what-is-dna', 'What is DNA?', `${savedLevel} quiz question?`),
    );

    render(routedElement('/quizmode?topic=what-is-dna', QuizMode));

    await waitFor(() => expect(apiClient.generateQuiz).toHaveBeenCalledWith({
      topic: 'what-is-dna',
      level: apiLevel,
      questionCount: 5,
    }));
    expect(await screen.findByText(`${savedLevel} quiz question?`)).toBeInTheDocument();
  });

  it('falls back to undergraduate for an unrecognized saved level', async () => {
    educationState.level = 'unknown_profile_level';
    apiClient.generateQuiz.mockResolvedValue(
      quizResponse('what-is-dna', 'What is DNA?', 'Fallback quiz question?'),
    );

    render(routedElement('/quizmode?topic=what-is-dna', QuizMode));

    await waitFor(() => expect(apiClient.generateQuiz).toHaveBeenCalledWith({
      topic: 'what-is-dna',
      level: 'undergraduate',
      questionCount: 5,
    }));
    expect(await screen.findByText('Fallback quiz question?')).toBeInTheDocument();
  });

  it.each([
    ['elementary', 'elementary'],
    ['middle_school', 'middle_school'],
    ['high_school', 'high_school'],
    ['undergraduate', 'undergraduate'],
    ['graduate', 'graduate'],
    ['postgraduate', 'postgraduate'],
    ['phd', 'graduate'],
    ['medical', 'postgraduate'],
    ['researcher', 'postgraduate'],
    ['unknown_profile_level', 'undergraduate'],
    ['__proto__', 'undergraduate'],
    ['constructor', 'undergraduate'],
    ['hasOwnProperty', 'undergraduate'],
    ['toString', 'undergraduate'],
  ])('normalizes Topic Explorer saved level %s to publication level %s', async (savedLevel, apiLevel) => {
    educationState.level = savedLevel;
    apiClient.getExplanation.mockResolvedValue({
      publication: publication(`Explanation for ${savedLevel}.`, `explanation:${savedLevel}`),
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      sources: [],
    });

    const path = '/topicexplorer?topic=what-is-dna';
    const { rerender } = render(routedElement(path, TopicExplorer));

    await waitFor(() => expect(apiClient.getExplanation).toHaveBeenCalledWith({
      topic: 'what-is-dna',
      level: apiLevel,
    }));
    expect(apiClient.getExplanation).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(`Explanation for ${savedLevel}.`)).toBeInTheDocument();

    // Equivalent saved values share the normalized request scope, so changing
    // to its canonical value must not invalidate or repeat the publication.
    educationState.level = apiLevel;
    rerender(routedElement(path, TopicExplorer));

    expect(apiClient.getExplanation).toHaveBeenCalledTimes(1);
    expect(screen.getByText(`Explanation for ${savedLevel}.`)).toBeInTheDocument();
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

  it.each([
    ['missing', undefined],
    ['null', null],
    ['scalar', 'https://provider-scalar-leak.example/image.png'],
    [
      'noncanonical',
      {
        ...publication({
          imageUrl: 'https://provider-image-leak.example/image.png',
          revisedPrompt: 'PROVIDER_REVISED_PROMPT_LEAK',
        }, 'image:noncanonical'),
        raw: 'PROVIDER_IMAGE_EXTRA_FIELD_LEAK',
      },
    ],
  ])('fails closed when an image response has a %s publication', async (
    _shape,
    responsePublication,
  ) => {
    apiClient.getExplanation.mockResolvedValue({
      publication: publication('Current explanation.', 'explanation:image-fail-closed'),
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      sources: [],
    });
    apiClient.generateImage.mockResolvedValue({
      publication: responsePublication,
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
    });

    render(routedElement('/topicexplorer?topic=what-is-dna', TopicExplorer));
    await screen.findByText('Current explanation.');
    fireEvent.click(screen.getByRole('button', { name: /^generate image$/i }));

    const supportId = await screen.findByText('image:client-invalid-publication');
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('Publication unavailable');
    expect(screen.getByTestId('adaptive-image')).toHaveAttribute(
      'data-publication-reason',
      'invalid_publication_artifact',
    );
    expect(screen.getByTestId('adaptive-image')).toHaveTextContent(
      'unavailable:image:client-invalid-publication:no-image:no-prompt',
    );
    expect(screen.queryByText(/provider-(?:scalar|image)-leak/i)).toBeNull();
    expect(screen.queryByText(/PROVIDER_(?:REVISED_PROMPT|IMAGE_EXTRA_FIELD)_LEAK/i)).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['scalar', 'PROVIDER_CHAT_SCALAR_LEAK'],
    [
      'noncanonical',
      {
        ...publication('PROVIDER_CHAT_OBJECT_LEAK', 'chat:noncanonical'),
        raw: 'PROVIDER_CHAT_EXTRA_FIELD_LEAK',
      },
    ],
  ])('fails closed when a tutor response has a %s publication', async (
    _shape,
    responsePublication,
  ) => {
    apiClient.getExplanation.mockResolvedValue({
      publication: publication('Current explanation.', 'explanation:chat-fail-closed'),
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      sources: [],
    });
    apiClient.chat.mockResolvedValue({
      publication: responsePublication,
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
    });

    render(routedElement('/topicexplorer?topic=what-is-dna', TopicExplorer));
    await screen.findByText('Current explanation.');
    fireEvent.click(screen.getByRole('button', { name: /explain another way/i }));

    const supportId = await screen.findByText('chat:client-invalid-publication');
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('Publication unavailable');
    expect(screen.queryByText(/PROVIDER_CHAT_(?:SCALAR|OBJECT|EXTRA_FIELD)_LEAK/i)).toBeNull();
    expect(screen.queryByText(/could not be completed/i)).toBeNull();
  });

  it('renders terminal 503 publications for explanation, image, and tutor recovery', async () => {
    apiClient.getExplanation.mockRejectedValue(
      modelPublicationError('explanation:recovery-disabled'),
    );
    apiClient.generateImage.mockRejectedValue(
      modelPublicationError('image:recovery-disabled'),
    );
    apiClient.chat.mockRejectedValue(
      modelPublicationError('chat:recovery-disabled'),
    );

    render(routedElement('/topicexplorer?topic=what-is-dna', TopicExplorer));

    expect(await screen.findByText('explanation:recovery-disabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^generate image$/i }));
    expect(await screen.findByText('image:recovery-disabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /explain another way/i }));
    expect(await screen.findByText('chat:recovery-disabled')).toBeInTheDocument();

    expect(screen.getAllByText(/publication unavailable/i)).toHaveLength(3);
    expect(screen.queryAllByText(/generated content is temporarily unavailable/i)).toHaveLength(0);
  });

  it.each([
    ['missing', undefined, 'invalid_publication_artifact', 'explanation:client-invalid-publication'],
    ['null', null, 'invalid_publication_artifact', 'explanation:client-invalid-publication'],
    ['scalar', 'PROVIDER_SCALAR_LEAK', 'invalid_publication_artifact', 'explanation:client-invalid-publication'],
    [
      'noncanonical',
      { ...publication('PROVIDER_OBJECT_LEAK', 'explanation:noncanonical'), raw: 'EXTRA_FIELD_LEAK' },
      'invalid_publication_artifact',
      'explanation:client-invalid-publication',
    ],
  ])('fails closed when an explanation response has a %s publication', async (
    _shape,
    responsePublication,
    expectedReasonCode,
    expectedCorrelationId,
  ) => {
    apiClient.getExplanation.mockResolvedValue({
      publication: responsePublication,
      topicMetadata: { id: 'what-is-dna', title: 'What is DNA?' },
      sources: [],
    });

    render(routedElement('/topicexplorer?topic=what-is-dna', TopicExplorer));

    const supportId = await screen.findByText(expectedCorrelationId);
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('Publication unavailable');
    expect(screen.getByTestId('adaptive-explanation')).toHaveAttribute(
      'data-publication-reason',
      expectedReasonCode,
    );
    expect(screen.getByTestId('adaptive-explanation')).toHaveTextContent('no-explanation');
    expect(screen.queryByText(/PROVIDER_(?:SCALAR|OBJECT)_LEAK/i)).toBeNull();
    expect(screen.queryByText(/EXTRA_FIELD_LEAK/i)).toBeNull();
  });

  it('uses reviewed catalog metadata after validating the response topic identity', async () => {
    apiClient.getExplanation.mockResolvedValue({
      publication: publication('Canonical explanation.', 'explanation:canonical-topic'),
      topicMetadata: {
        id: 'what-is-dna',
        title: 'Response-controlled title',
        category: 'Response-controlled category',
      },
      sources: [],
    });

    render(routedElement('/topicexplorer?topic=what-is-dna', TopicExplorer));

    expect(await screen.findByText('Canonical explanation.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What is DNA?');
    expect(screen.queryByText('Response-controlled title')).toBeNull();
  });

  it('keeps an unknown-topic catalog error across education-level changes', async () => {
    const path = '/topicexplorer?topic=unknown-topic';
    const { rerender } = render(routedElement(path, TopicExplorer));

    const catalogError = await screen.findByRole('alert');
    expect(catalogError).toHaveTextContent(/not in the reviewed catalog/i);
    expect(apiClient.getTopics).toHaveBeenCalledTimes(1);
    expect(apiClient.getExplanation).not.toHaveBeenCalled();

    educationState.level = 'graduate';
    rerender(routedElement(path, TopicExplorer));

    expect(screen.getByRole('alert')).toHaveTextContent(/not in the reviewed catalog/i);
    expect(apiClient.getTopics).toHaveBeenCalledTimes(1);
    expect(apiClient.getExplanation).not.toHaveBeenCalled();
  });
});
