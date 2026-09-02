import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('published agent boundary', () => {
  it('aliases browser imports to the bounded client instead of the persona registry barrel', () => {
    for (const config of [read('../../vite.config.js'), read('../../vitest.config.js')]) {
      expect(config).toContain(
        "'@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/client.ts')",
      );
      expect(config).toContain(
        "'@genemap/shared/associationClaim': path.resolve(__dirname, '../../packages/shared/src/associationClaim.ts')",
      );
      expect(config).not.toContain(
        "'@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')",
      );
    }
  });

  it('does not register or navigate to retired persona or diagnostic pages', () => {
    const pageConfig = read('../../pages.config.js');
    const layout = read('../../Layout.jsx');
    for (const retired of ['AIAssistants', 'Anastasia', 'RobertClinical', 'FunctionReviewer', 'AdminFunctionTester']) {
      expect(pageConfig).not.toContain(`./pages/${retired}`);
      expect(layout).not.toContain(`createPageUrl("${retired}")`);
    }

    for (const retiredFile of [
      new URL('../FunctionReviewer.jsx', import.meta.url),
      new URL('../AdminFunctionTester.jsx', import.meta.url),
      new URL('../../components/functionRegistry.js', import.meta.url),
    ]) {
      expect(existsSync(retiredFile)).toBe(false);
    }
  });

  it('uses only finite publication tasks in the active generation graph', () => {
    const sources = [
      read('../../pages/Dashboard.jsx'),
      read('../../pages/TopicExplorer.jsx'),
      read('../../components/search/PhenotypeSearchService.jsx'),
      read('../../components/research/HypothesisGenerator.jsx'),
    ].join('\n');

    expect(sources).not.toContain('apiClient.invokeLLM');
    expect(sources).not.toContain("agent: 'robert'");
    expect(sources).not.toContain("agent: 'anastasia'");
    expect(sources).not.toContain('usePersistConversation');
    expect(sources).toContain('invokePublicationTask');
  });
});
