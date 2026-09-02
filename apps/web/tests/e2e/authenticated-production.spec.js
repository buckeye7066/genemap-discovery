import { test, expect } from '@playwright/test';

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
}

test('complete authenticated production journey persists data across logout and login', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'single production mutation journey');
  test.setTimeout(12 * 60_000);

  const unique = `${process.env.GITHUB_RUN_ID || Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const credentials = {
    email: `genemap-production-e2e+${unique}@example.com`,
    password: `GeneMap!${unique}Aa9`,
  };
  const pageErrors = [];
  let registrationAttempted = false;

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
    expect((await me.json()).email).toBe(credentials.email);

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
    expect(['available', 'partial']).toContain(explanation?.publication?.status);
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
    const questions = quiz?.publication?.content;
    expect(Array.isArray(questions)).toBe(true);
    expect(questions).toHaveLength(5);

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
    const candidatePromise = page.waitForResponse(
      (response) => response.url().includes('/llm/invoke') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: 'short stature', exact: true }).click();
    const candidateResponse = await candidatePromise;
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

    await expect(page.getByRole('heading', { name: 'Generated Research Hypotheses', exact: true })).toBeVisible({ timeout: 30_000 });
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

    expect(pageErrors, `Uncaught browser errors: ${pageErrors.join('\n')}`).toEqual([]);
  } finally {
    await closeDisposableAccount(page, credentials, registrationAttempted);
  }
});
