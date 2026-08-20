// Verify the PROPOSED Content-Security-Policy against the REAL production
// bundle before shipping it. Local `vite build` is unavailable in this
// worktree (a missing dep in the junctioned node_modules -- A/B-proved
// identical on pristine origin/main), so instead of guessing, this loads the
// live site and INJECTS the proposed policy onto the document response, then
// records every violation the browser reports. A CSP that breaks a released
// product is worse than the disclosure gap it closes.
import { chromium } from 'playwright';

const WEB = 'https://genemap-discovery.vercel.app';
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://genemap-api-production.up.railway.app",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const violations = [];
const failedRequests = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

// Force the proposed policy onto the top-level document.
await page.route('**/*', async (route) => {
  const req = route.request();
  if (req.resourceType() !== 'document') return route.continue();
  const res = await route.fetch();
  const headers = { ...res.headers(), 'content-security-policy': CSP };
  route.fulfill({ response: res, headers });
});

await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    (window.__cspViolations ||= []).push({
      directive: e.violatedDirective,
      blocked: String(e.blockedURI).slice(0, 120),
    });
  });
});

page.on('console', (m) => {
  const t = m.text();
  if (/content security policy|refused to/i.test(t)) violations.push(t.slice(0, 160));
});
page.on('requestfailed', (r) => failedRequests.push(`${r.failure()?.errorText} ${r.url().slice(0, 90)}`));

const paths = ['/', '/Login'];
for (const p of paths) {
  await page.goto(WEB + p, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const inPage = await page.evaluate(() => window.__cspViolations || []).catch(() => []);
  const rendered = await page.evaluate(() => document.body?.innerText?.trim().length || 0).catch(() => 0);
  const scripts = await page.evaluate(() => document.scripts.length).catch(() => 0);
  console.log(`\n${p}  rendered_chars=${rendered}  scripts=${scripts}  in_page_violations=${inPage.length}`);
  for (const v of inPage.slice(0, 8)) console.log(`   VIOLATION ${v.directive} <- ${v.blocked}`);
}

console.log(`\nconsole CSP messages: ${violations.length}`);
for (const v of violations.slice(0, 10)) console.log('  ' + v);
console.log(`failed requests: ${failedRequests.length}`);
for (const f of failedRequests.slice(0, 8)) console.log('  ' + f);

await ctx.close();
await browser.close();
