import { test, expect } from '@playwright/test';

const REMOVED_ROUTES = [
  '/medicaldata',
  '/vcfanalysis',
  '/aiassistants',
  '/anastasia',
  '/robertclinical',
  '/visualizationhub',
  '/gsea',
  '/functionreviewer',
  '/adminfunctiontester',
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

async function installSyntheticEducationSession(page) {
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
    if (pathname === '/education/progress') return json(route, { sessions: [], progress: [] });
    if (pathname === '/education/entitlements') {
      return json(route, { isPremium: false, todayUsage: {}, limits: {} });
    }
    if (pathname === '/entities/activity') return json(route, { entry: {} });

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
});
