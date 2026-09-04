import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://genemap-discovery.vercel.app';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function csrfHeaders(page) {
  const cookies = await page.context().cookies(BASE_URL);
  const csrfCookie = cookies.find((cookie) => cookie.name === 'csrfToken');
  if (!csrfCookie?.value) {
    throw new Error('Authenticated session did not expose a CSRF token');
  }
  return { 'x-csrf-token': decodeURIComponent(csrfCookie.value) };
}

async function closeDisposableAccount(page, credentials, registrationAttempted) {
  if (!registrationAttempted) return;

  let me = await page.request.get('/auth/me');
  if (me.status() === 401) {
    const login = await page.request.post('/auth/login', {
      data: credentials,
    });
    if (!login.ok()) {
      // A failed registration may not have created an account. A 401 here
      // proves there is nothing to clean up for this unique address.
      if (login.status() === 401) return;
      throw new Error(`Cleanup login failed: ${login.status()} ${await login.text()}`);
    }
    me = await page.request.get('/auth/me');
  }
  if (!me.ok()) {
    throw new Error(`Cleanup session check failed: ${me.status()} ${await me.text()}`);
  }

  const response = await page.request.post('/account/delete', {
    headers: await csrfHeaders(page),
    data: {
      email: credentials.email,
      password: credentials.password,
      confirmation: 'DELETE MY ACCOUNT',
    },
    timeout: 60_000,
  });
  if (!response.ok()) {
    throw new Error(`Disposable account cleanup failed: ${response.status()} ${await response.text()}`);
  }

  const afterDelete = await page.request.get('/auth/me');
  if (afterDelete.status() !== 401) {
    throw new Error(`Deleted account retained a session: ${afterDelete.status()} ${await afterDelete.text()}`);
  }
  const deletedLogin = await page.request.post('/auth/login', { data: credentials });
  if (deletedLogin.status() !== 401) {
    throw new Error(`Deleted account could still sign in: ${deletedLogin.status()} ${await deletedLogin.text()}`);
  }
}

test('complete authenticated production journey persists data across logout and login', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'single production mutation journey');
  test.setTimeout(12 * 60_000);

  const unique = `${process.env.GITHUB_RUN_ID || Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const credentials = {
    email: `genemap-production-e2e+${unique}@example.com`,
    password: `GeneMap!${unique}Aa9`,
  };
  const profileName = `Production Profile ${unique}`;
  const labTitle = `Production glucose panel ${unique}`;
  const pageErrors = [];
  let registrationAttempted = false;
  let savedLab;
  let assistantConversationId;

  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(credentials.email);
    await page.getByLabel('Password', { exact: true }).fill(credentials.password);
    const registrationPromise = page.waitForResponse(
      (response) => response.url().includes('/auth/register') && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    registrationAttempted = true;
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    const registrationResponse = await registrationPromise;
    expect(registrationResponse.status(), await registrationResponse.text()).toBe(200);
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });

    const me = await page.request.get('/auth/me');
    expect(me.status(), await me.text()).toBe(200);
    const meBody = await me.json();
    expect(meBody.email).toBe(credentials.email);
    expect(meBody.entitlements).toMatchObject({
      tier: 'premium',
      isPremium: true,
      access: { source: 'complimentary' },
    });
    expect(meBody.entitlements.features).toEqual(expect.arrayContaining([
      'health.records',
      'assistants.profile_context',
      'research.workspace',
    ]));

    await expect(page.getByText('Complete Your Profile', { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByPlaceholder('Your full name').fill(profileName);
    const profilePromise = page.waitForResponse(
      (response) => response.url().includes('/auth/me') && response.request().method() === 'PUT',
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Continue to GeneMap', exact: true }).click();
    const profileResponse = await profilePromise;
    expect(profileResponse.status(), await profileResponse.text()).toBe(200);
    expect((await profileResponse.json()).demographics_collected).toBe(true);
    await expect(page).toHaveURL(/\/profile(?:\?|$)/, { timeout: 30_000 });

    await page.goto('/healthdata');
    await expect(page.getByRole('heading', { name: 'Health data', exact: true })).toBeVisible({ timeout: 30_000 });

    const storageConsent = page.locator('label')
      .filter({ hasText: 'Allow encrypted health-data storage' })
      .getByRole('checkbox');
    const aiConsent = page.locator('label')
      .filter({ hasText: 'Allow Anastasia and Robert to process health and genetics questions' })
      .getByRole('checkbox');
    await storageConsent.click();
    await aiConsent.click();
    await expect(storageConsent).toHaveAttribute('data-state', 'checked');
    await expect(aiConsent).toHaveAttribute('data-state', 'checked');

    const consentPromise = page.waitForResponse(
      (response) => response.url().includes('/entities/consent/batch')
        && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Save privacy choices', exact: true }).click();
    const consentResponse = await consentPromise;
    expect(consentResponse.status(), await consentResponse.text()).toBe(200);
    const consentRecords = (await consentResponse.json()).records;
    expect(consentRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ consentType: 'medical_data_storage', version: '1.0', granted: true }),
      expect.objectContaining({ consentType: 'medical_data_ai_analysis', version: '1.0', granted: true }),
    ]));
    await expect(page.getByText('Privacy choices saved. A later revocation supersedes an earlier grant.', { exact: true })).toBeVisible();

    const healthGoal = `Understand the glucose result for ${profileName}`;
    await page.getByLabel('Goals', { exact: true }).fill(healthGoal);
    const healthProfilePromise = page.waitForResponse(
      (response) => response.url().endsWith('/entities/medical-data')
        && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Save encrypted health profile', exact: true }).click();
    const healthProfileResponse = await healthProfilePromise;
    expect(healthProfileResponse.status(), await healthProfileResponse.text()).toBe(200);
    expect((await healthProfileResponse.json()).record).toMatchObject({
      dataType: 'health_profile',
      content: { schemaVersion: 1, goals: [healthGoal] },
    });

    await page.locator('input[type="file"]').setInputFiles({
      name: 'production-glucose-panel.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'Test,Result,Units,Reference Range,Flag',
        'Glucose,102,mg/dL,70-99,H',
      ].join('\n')),
    });
    await expect(page.getByText('Extraction complete', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Glucose', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Record title', { exact: true }).fill(labTitle);

    const labSavePromise = page.waitForResponse(
      (response) => response.url().endsWith('/entities/medical-data')
        && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Save encrypted result', exact: true }).click();
    const labSaveResponse = await labSavePromise;
    expect(labSaveResponse.status(), await labSaveResponse.text()).toBe(200);
    savedLab = (await labSaveResponse.json()).record;
    expect(savedLab).toMatchObject({
      dataType: 'lab_document',
      title: labTitle,
      content: {
        schemaVersion: 1,
        parserVersion: 'health-document-1.0.0',
        status: 'structured',
        source: { fileName: 'production-glucose-panel.csv', extractionMethod: 'csv' },
        observations: [expect.objectContaining({
          name: 'Glucose',
          value: '102',
          unit: 'mg/dL',
          flag: 'high',
        })],
      },
    });
    expect(savedLab.id).toBeTruthy();
    expect(savedLab.content.source.sha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(page.getByText('Parsed lab document saved. Its structured results can now be used by Anastasia or Robert.', { exact: true })).toBeVisible();

    await page.goto(`/assistants?record=${encodeURIComponent(savedLab.id)}`);
    await expect(page.getByRole('heading', { name: 'Profile-aware assistants', exact: true })).toBeVisible({ timeout: 30_000 });
    const selectedRecord = page.locator('label').filter({ hasText: labTitle }).getByRole('checkbox');
    await expect(selectedRecord).toHaveAttribute('data-state', 'checked', { timeout: 30_000 });
    const assistantPrompt = 'Using my selected record, explain the reported Glucose result in plain educational language and include the exact value and unit. Do not diagnose or recommend treatment.';
    await page.getByPlaceholder(/Ask Anastasia about/).fill(assistantPrompt);
    const assistantPromise = page.waitForResponse(
      (response) => response.url().includes('/assistants/anastasia/chat')
        && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const assistantResponse = await assistantPromise;
    expect(assistantResponse.status(), await assistantResponse.text()).toBe(200);
    const assistantBody = await assistantResponse.json();
    assistantConversationId = assistantBody.conversationId;
    expect(assistantBody).toMatchObject({
      assistant: { id: 'anastasia', displayName: 'Anastasia' },
      contextReceipt: {
        assistant: 'anastasia',
        healthProfileIncluded: true,
        records: [expect.objectContaining({
          id: savedLab.id,
          title: labTitle,
          parserVersion: 'health-document-1.0.0',
          observationCount: 1,
        })],
        responseReview: {
          status: 'passed',
          generationSource: expect.stringMatching(/^(?:provider|verified_context_fallback)$/u),
          matchedContextKinds: expect.arrayContaining(['lab_observation', 'lab_value']),
          requiredContextKinds: ['lab_observation', 'lab_value'],
        },
      },
    });
    expect(assistantBody.contextReceipt.profileFields).toContain('displayName');
    expect(assistantBody.message).toMatch(/Glucose/iu);
    expect(assistantBody.message).toMatch(/102\s*mg\/dL/iu);
    await expect(page.getByText(/Context receipt 1\.0/)).toBeVisible();
    await expect(page.getByText(/Response review passed after/)).toBeVisible();

    await page.evaluate(() => localStorage.setItem('genemap_education_level', 'undergraduate'));

    const topicsResponse = await page.request.get('/education/topics');
    expect(topicsResponse.status(), await topicsResponse.text()).toBe(200);
    const topicCatalog = await topicsResponse.json();
    const firstTopic = topicCatalog?.categories?.flatMap((category) => category.topics || [])[0];
    expect(firstTopic?.id).toBeTruthy();
    expect(firstTopic?.title).toBeTruthy();

    await page.goto('/learningpath');
    await expect(page.getByRole('heading', { name: 'Learning Path', exact: true })).toBeVisible();
    await expect(page.getByText(firstTopic.title, { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    const explanationPromise = page.waitForResponse(
      (response) => response.url().includes('/education/explain') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.goto(`/topicexplorer?topic=${encodeURIComponent(firstTopic.id)}`);
    const explanationResponse = await explanationPromise;
    expect(explanationResponse.status(), await explanationResponse.text()).toBe(200);
    const explanation = await explanationResponse.json();
    const explanationProof = {
      status: explanation?.publication?.status,
      reasonCode: explanation?.publication?.reasonCode,
      correlationId: explanation?.publication?.correlationId,
    };
    expect(
      ['available', 'partial'],
      `Explanation publication was not reusable: ${JSON.stringify(explanationProof)}`,
    ).toContain(explanation?.publication?.status);
    expect(typeof explanation?.publication?.content).toBe('string');
    expect(explanation.publication.content.trim().length).toBeGreaterThan(50);

    await page.goto('/quizmode');
    await expect(page.getByRole('heading', { name: 'Take a Quiz', exact: true })).toBeVisible();
    const quizPromise = page.waitForResponse(
      (response) => response.url().includes('/education/quiz') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: firstTopic.title, exact: true }).click();
    const quizResponse = await quizPromise;
    expect(quizResponse.status(), await quizResponse.text()).toBe(200);
    const quiz = await quizResponse.json();
    const quizProof = {
      status: quiz?.publication?.status,
      reasonCode: quiz?.publication?.reasonCode,
      correlationId: quiz?.publication?.correlationId,
    };
    const questions = quiz?.publication?.content;
    expect(
      Array.isArray(questions),
      `Quiz publication did not contain questions: ${JSON.stringify(quizProof)}`,
    ).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(5);

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      await expect(page.getByRole('heading', { name: question.question, exact: true })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', {
        name: new RegExp(escapeRegex(question.options[0])),
      }).click();
      await expect(page.getByText('Explanation:', { exact: true })).toBeVisible();
      await page.getByRole('button', {
        name: index === questions.length - 1 ? /See Results/ : /Next Question/,
      }).click();
    }
    await expect(page.getByText(`${firstTopic.title} Quiz Results`, { exact: true })).toBeVisible();

    await page.goto('/search');
    await expect(page.getByRole('heading', { name: 'Phenotype → Gene Discovery', exact: true })).toBeVisible();
    const [candidateResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes('/llm/invoke') && response.request().method() === 'POST',
        { timeout: 120_000 },
      ),
      page
        .getByRole('heading', { name: 'Start Your Discovery', exact: true })
        .locator('..')
        .locator('..')
        .getByRole('button', { name: 'short stature', exact: true })
        .click(),
    ]);
    expect(candidateResponse.status(), await candidateResponse.text()).toBe(200);
    const candidate = await candidateResponse.json();
    expect(['available', 'partial']).toContain(candidate?.publication?.status);
    const candidateGenes = candidate?.publication?.content?.candidateGenes;
    expect(Array.isArray(candidateGenes)).toBe(true);
    expect(candidateGenes.length).toBeGreaterThan(0);
    const candidateSymbol = candidateGenes[0].symbol;

    await expect(page.getByText(candidateSymbol, { exact: true }).first()).toBeVisible({ timeout: 120_000 });
    await page.getByRole('checkbox').first().check();
    await expect(page.getByText(/1 gene selected/)).toBeVisible();

    const setName = `Production E2E Set ${unique}`;
    const setResponse = await page.request.post('/entities/gene-sets', {
      headers: await csrfHeaders(page),
      data: {
        name: setName,
        description: 'Disposable production browser verification',
        genes: [candidateSymbol, 'IGF1'],
        metadata: { source: 'production-browser-e2e' },
      },
    });
    expect(setResponse.status(), await setResponse.text()).toBe(200);
    const savedSet = (await setResponse.json()).set;
    expect(savedSet?.id).toBeTruthy();

    await page.goto(`/search?geneSetId=${encodeURIComponent(savedSet.id)}`);
    await expect(page.getByText(candidateSymbol, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('IGF1', { exact: true }).first()).toBeVisible();

    await page.goto('/researchmode');
    await expect(page.getByRole('heading', { name: 'Research Mode', exact: true })).toBeVisible();
    const hypothesisPromise = page.waitForResponse(
      (response) => response.url().includes('/llm/invoke') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: 'Generate Research Hypotheses', exact: true }).click();
    const hypothesisResponse = await hypothesisPromise;
    expect(hypothesisResponse.status(), await hypothesisResponse.text()).toBe(200);
    const hypothesis = await hypothesisResponse.json();
    expect(['available', 'partial']).toContain(hypothesis?.publication?.status);
    expect(typeof hypothesis?.publication?.content).toBe('string');
    expect(hypothesis.publication.content.trim().length).toBeGreaterThan(50);

    await expect(page.getByText('Generated Research Hypotheses', { exact: true })).toBeVisible({ timeout: 30_000 });
    const projectPromise = page.waitForResponse(
      (response) => response.url().includes('/entities/projects') && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Save to Projects', exact: true }).click();
    const projectResponse = await projectPromise;
    expect(projectResponse.status(), await projectResponse.text()).toBe(200);
    const savedProject = (await projectResponse.json()).project;
    expect(savedProject?.id).toBeTruthy();
    await expect(page.getByText('Saved to Research Projects.', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: /Projects/ }).click();
    await expect(page.getByText(savedProject.title, { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    expect((await page.request.get('/auth/me')).status()).toBe(401);

    await page.getByLabel('Email', { exact: true }).fill(credentials.email);
    await page.getByLabel('Password', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });

    await page.goto(`/search?geneSetId=${encodeURIComponent(savedSet.id)}`);
    await expect(page.getByText(candidateSymbol, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('IGF1', { exact: true }).first()).toBeVisible();

    await page.goto('/researchmode');
    await page.getByRole('tab', { name: /Projects/ }).click();
    await expect(page.getByText(savedProject.title, { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    const persistedHealthResponse = await page.request.get('/entities/medical-data');
    expect(persistedHealthResponse.status(), await persistedHealthResponse.text()).toBe(200);
    const persistedHealth = (await persistedHealthResponse.json()).records;
    expect(persistedHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: savedLab.id,
        title: labTitle,
        content: expect.objectContaining({ parserVersion: 'health-document-1.0.0' }),
      }),
      expect.objectContaining({
        dataType: 'health_profile',
        content: expect.objectContaining({ goals: [healthGoal] }),
      }),
    ]));

    const persistedConversationResponse = await page.request.get('/entities/conversations?assistantType=anastasia');
    expect(persistedConversationResponse.status(), await persistedConversationResponse.text()).toBe(200);
    const persistedConversations = (await persistedConversationResponse.json()).conversations;
    expect(persistedConversations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: assistantConversationId,
        assistantType: 'anastasia',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: assistantPrompt }),
          expect.objectContaining({ role: 'assistant' }),
        ]),
        metadata: expect.objectContaining({
          lastContextReceipt: expect.objectContaining({
            records: [expect.objectContaining({ id: savedLab.id })],
          }),
        }),
      }),
    ]));

    expect(pageErrors, `Uncaught browser errors: ${pageErrors.join('\n')}`).toEqual([]);
  } finally {
    await closeDisposableAccount(page, credentials, registrationAttempted);
  }
});
