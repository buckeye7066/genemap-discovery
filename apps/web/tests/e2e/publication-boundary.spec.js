import { test, expect } from '@playwright/test';

const REMOVED_ROUTES = [
  '/medicaldata',
  '/vcfanalysis',
  '/aiassistants',
  '/anastasia',
  '/robertclinical',
  '/visualizationhub',
  '/gsea',
];

const FORBIDDEN_NAVIGATION = [
  /medical data/i,
  /vcf analysis/i,
  /clinical support/i,
  /^robert$/i,
  /^anastasia$/i,
  /visualization hub/i,
  /^gsea$/i,
];

const SYNTHETIC_USER = {
  id: 'boundary-e2e-user',
  email: 'boundary-e2e@example.invalid',
  role: 'user',
  display_name: 'Boundary Test User',
  demographics_collected: true,
  education_level: 'undergraduate',
  mailing_list_opt_in: false,
  banned: false,
  entitlements: {
    isPremium: false,
    isAdmin: false,
    licenseInfo: null,
  },
  csrfToken: 'boundary-e2e-csrf-token',
};

function json(route, body) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installSyntheticEducationSession(page, { resolverOutage = false } = {}) {
  const generationRequests = [];
  await page.addInitScript(() => {
    localStorage.setItem('genemap.csrfToken', 'boundary-e2e-csrf-token');
    localStorage.setItem('genemap_education_level', 'undergraduate');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!['fetch', 'xhr'].includes(request.resourceType())) {
      return route.continue();
    }

    const pathname = new URL(request.url()).pathname;
    if (pathname === '/auth/me') return json(route, SYNTHETIC_USER);
    if (pathname === '/education/topics') {
      return json(route, {
        categories: [{
          category: 'Foundations',
          topics: [{ id: 'dna-basics', title: 'DNA Basics', description: 'A reviewed genetics topic.' }],
        }],
      });
    }
    if (pathname === '/education/explain') {
      const payload = request.postDataJSON();
      if (payload.topic !== 'dna-basics') {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'EDUCATION_RESEARCH_BOUNDARY',
            error: 'This route accepts only a bounded genetics education topic.',
          }),
        });
      }
      return json(route, {
        explanation: 'DNA carries inherited information in a four-letter molecular alphabet.',
        topic: 'dna-basics',
        level: 'undergraduate',
        tier: 'free',
        usage: null,
        sources: [{
          label: 'MedlinePlus Genetics: What is DNA?',
          publisher: 'U.S. National Library of Medicine',
          url: 'https://medlineplus.gov/genetics/understanding/basics/dna/',
        }],
      });
    }
    if (pathname === '/genomics/publication-concepts/search') {
      if (resolverOutage) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Resolver unavailable' }),
        });
      }
      return json(route, { suggestions: [] });
    }
    if (pathname === '/llm/invoke') {
      const payload = request.postDataJSON();
      generationRequests.push(payload);
      const operation = payload?.taskInput?.operation;
      if (operation === 'classify_and_suggest') {
        return json(route, { result: JSON.stringify({
          queryType: 'phenotype',
          isDisease: false,
          candidateGenes: [{
            symbol: 'BRCA1',
            name: 'AI-proposed candidate label',
            score: 0.86,
            explanation: 'Exploratory model ranking only.',
          }],
        }) });
      }
      if (operation === 'gene_profile') {
        return json(route, { result: JSON.stringify({
          summary: 'An exploratory research summary for follow-up in primary sources.',
          phenotypes: [{ name: 'Seizure' }],
          keyTakeaways: ['Validate the candidate association in primary literature.'],
        }) });
      }
      return json(route, { result: JSON.stringify({ candidateGenes: [] }) });
    }
    if (pathname === '/genomics/enrich') {
      const payload = request.postDataJSON();
      if (payload?.symbols?.includes('BRCA1')) {
        return json(route, { genes: {
          BRCA1: {
            symbol: 'BRCA1',
            name: 'BRCA1 DNA repair associated',
            entrezId: '672',
            ensemblId: 'ENSG00000012048',
            chromosome: '17',
            start: 43044295,
            end: 43170245,
            genomeBuild: 'GRCh38',
            species: 'Homo sapiens',
            taxId: 9606,
            mapLocation: '17q21.31',
            summary: null,
            source: 'MyGene.info',
            verified: true,
          },
        }, phenotypes: {} });
      }
      return json(route, {
        genes: {},
        phenotypes: payload?.phenotypes?.includes('Seizure')
          ? { seizure: { hpoId: 'HP:0001250', name: 'Seizure', verified: true } }
          : {},
      });
    }
    if (pathname === '/education/progress') return json(route, { sessions: [], progress: [] });
    if (pathname === '/education/entitlements') {
      return json(route, { isPremium: false, todayUsage: {}, limits: {} });
    }
    if (pathname === '/entities/activity') return json(route, { entries: [], entry: {} });
    if (pathname === '/entities/search-history') return json(route, { entries: [], entry: {} });

    // Keep the browser journey hermetic: a rendering error must not send an
    // owner alert, and no unrecognized API call may reach a real environment.
    if (
      pathname === '/report-client-error' ||
      /^\/(?:auth|education|entities|billing|genomics|llm|clinical-trials|admin)(?:\/|$)/.test(pathname)
    ) {
      return json(route, {});
    }

    return route.continue();
  });

  return { generationRequests };
}

test.use({ serviceWorkers: 'block' });

test.describe('authenticated publication route graph', () => {
  for (const removedRoute of REMOVED_ROUTES) {
    test(`${removedRoute} is unavailable to an authenticated user`, async ({ page }) => {
      await installSyntheticEducationSession(page);
      await page.goto(removedRoute);

      await expect(page).toHaveURL(new RegExp(`${removedRoute}$`, 'i'));
      await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
      await expect(page.getByText(`"${removedRoute.slice(1)}"`)).toBeVisible();
    });
  }

  test('the allowed education shell omits clinical navigation', async ({ page }) => {
    await installSyntheticEducationSession(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /learn genetics/i })).toBeVisible();
    for (const forbiddenName of FORBIDDEN_NAVIGATION) {
      await expect(page.getByRole('link', { name: forbiddenName })).toHaveCount(0);
    }

    await page.goto('/privacypolicy');
    await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible();
  });

  test('a beginner can browse the catalog, recover from an empty filter, and read a sourced lesson', async ({ page }) => {
    await installSyntheticEducationSession(page);
    await page.goto('/topicexplorer');

    await expect(page.getByRole('heading', { name: 'Topic Explorer' })).toBeVisible();
    const topicFilter = page.getByPlaceholder('Search topics...');
    await topicFilter.fill('not in the catalog');
    await expect(page.getByText(/no topics match/i)).toBeVisible();
    await topicFilter.fill('');
    await page.getByRole('button', { name: 'DNA Basics' }).click();

    await expect(page.getByRole('heading', { name: 'DNA Basics' })).toBeVisible();
    await expect(page.getByText(/DNA carries inherited information/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /MedlinePlus Genetics/i })).toHaveAttribute(
      'href',
      'https://medlineplus.gov/genetics/understanding/basics/dna/',
    );
  });

  test('guided phenotype research keeps structured intent, source evidence, and human species/build separate', async ({ page }) => {
    const { generationRequests } = await installSyntheticEducationSession(page);
    await page.goto('/search');

    await page.locator('form').getByRole('button', { name: 'short stature', exact: true }).click();
    await expect(page.getByText('BRCA1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/AI-prioritized leads/i)).toBeVisible();
    await expect(page.getByText(/Coordinates & IDs verified/i)).toBeVisible();
    await expect(page.getByText(/Homo sapiens.*GRCh38/i)).toBeVisible();
    await expect(page.getByText(/Ensembl\/NCBI/).first()).toBeVisible();

    await expect.poll(() => generationRequests.length).toBeGreaterThanOrEqual(2);
    for (const request of generationRequests) {
      expect(request).not.toHaveProperty('prompt');
      expect(request).not.toHaveProperty('messages');
      expect(request.publicationTask).toBe('candidate_gene_research');
      expect(request.taskInput.version).toBe(1);
    }
    expect(generationRequests[0].taskInput.query).toMatchObject({
      kind: 'curated_concept',
      conceptId: 'phenotype:short-stature',
    });
    expect(generationRequests.find((item) => item.taskInput.operation === 'gene_profile')?.taskInput.gene)
      .toEqual({ symbol: 'BRCA1' });
  });

  test('raw or URL-prefilled personal text never invokes generation', async ({ page }) => {
    const { generationRequests } = await installSyntheticEducationSession(page);
    await page.goto('/search?query=Alice%20Smith%20BRCA1%20result');

    const input = page.getByLabel(/reviewed research concept/i);
    await expect(input).toHaveValue('Alice Smith BRCA1 result');
    await expect.poll(() => generationRequests.length).toBe(0);
    await page.getByRole('button', { name: 'Search (Free)' }).click();
    await expect(page.getByRole('alert')).toContainText(/reviewed disease\/phenotype|free-text labels/i);
    expect(generationRequests).toHaveLength(0);
  });

  test('resolver outage leaves reviewed examples usable without a false verified label', async ({ page }) => {
    const { generationRequests } = await installSyntheticEducationSession(page, { resolverOutage: true });
    await page.goto('/search');
    const input = page.getByLabel(/reviewed research concept/i);
    await input.fill('poly');

    const reviewed = page.getByRole('button', { name: /Select polydactyly \(phenotype:polydactyly\)/i });
    await expect(reviewed).toBeVisible();
    await expect(reviewed).toContainText('Reviewed GeneMap publication concept');
    await expect(reviewed).not.toContainText(/verified/i);
    expect(generationRequests).toHaveLength(0);
  });
});
