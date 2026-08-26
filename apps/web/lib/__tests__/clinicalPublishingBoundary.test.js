import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HIGH_RISK_CLINICAL_AI_ENABLED,
  PERSONAL_GENOMICS_ENABLED,
  PUBLICATION_MODE,
} from '../featureFlags';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('clinical publishing boundary', () => {
  it('is a fail-closed education/research build', () => {
    expect(PUBLICATION_MODE).toBe('education_research');
    expect(HIGH_RISK_CLINICAL_AI_ENABLED).toBe(false);
    expect(PERSONAL_GENOMICS_ENABLED).toBe(false);
  });

  it('omits high-risk pages from both route and navigation graphs', () => {
    const pageConfig = read('../../pages.config.js');
    const layout = read('../../Layout.jsx');
    const forbiddenPages = [
      'MedicalData',
      'VCFAnalysis',
      'AIAssistants',
      'Anastasia',
      'RobertClinical',
      'VisualizationHub',
      'GSEA',
    ];

    for (const page of forbiddenPages) {
      expect(pageConfig).not.toMatch(new RegExp(`lazyWithRetry\\(\\(\\) => import\\(['"]\\./pages/${page}['"]\\)\\)`));
      expect(pageConfig).not.toMatch(new RegExp(`["']${page}["']\\s*:`));
      expect(layout).not.toContain(`createPageUrl("${page}")`);
    }
  });

  it('does not load medical records or clinical conversations on the dashboard', () => {
    const dashboard = read('../../pages/Dashboard.jsx');
    expect(dashboard).not.toContain('apiClient.getMedicalData()');
    expect(dashboard).not.toContain('apiClient.getConversations()');
    expect(dashboard).not.toContain('Medical data genes:');
  });

  it('declares a finite publication task on every surviving generation wrapper', () => {
    const wrappers = [
      ['Dashboard', read('../../pages/Dashboard.jsx'), 'apiClient.invokePublicationTask(', 'learning_activity_summary'],
      ['PhenotypeSearchService', read('../../components/search/PhenotypeSearchService.jsx'), 'apiClient.invokePublicationTask(', 'candidate_gene_research'],
      ['HypothesisGenerator', read('../../components/research/HypothesisGenerator.jsx'), 'apiClient.invokePublicationTask(', 'research_hypothesis'],
      ['TopicExplorer', read('../../pages/TopicExplorer.jsx'), 'apiClient.chat(', 'genetics_education'],
    ];

    for (const [label, source, call, task] of wrappers) {
      const callCount = source.split(call).length - 1;
      expect(callCount, `${label} generation call count`).toBeGreaterThan(0);
      expect(source, `${label} task declaration`).toContain(`'${task}'`);
      expect(source, `${label} versioned structured input`).toContain('version: 1');
      expect(source, `${label} raw prompt call`).not.toContain('apiClient.invokeLLM(');
    }

    const sharedTypes = read('../../../../packages/shared/src/types.ts');
    for (const task of [
      'genetics_education',
      'aggregate_genomics_research',
      'candidate_gene_research',
      'research_hypothesis',
      'learning_activity_summary',
    ]) {
      expect(sharedTypes).toContain(`'${task}'`);
    }
    expect(sharedTypes).toContain('export type PublicationTaskRequest');
    expect(sharedTypes).toContain('version: 1;');

    const sharedClient = read('../../../../packages/shared/src/client.ts');
    expect(sharedClient).toContain('invokePublicationTask<T extends PublicationTaskRequest>');
    expect(sharedClient).not.toContain('invokeLLM(');
    expect(sharedClient).not.toContain('llmChat(');
    expect(sharedClient).not.toContain('llmImage(');

    const autocomplete = read('../../components/search/AutocompleteSearch.jsx');
    const searchForm = read('../../components/search/SearchForm.jsx');
    const searchPage = read('../../pages/Search.jsx');
    expect(autocomplete).toContain('SAFE_SUGGESTIONS');
    expect(autocomplete).toContain('apiClient.searchPublicationConcepts');
    expect(autocomplete).not.toContain('invokePublicationTask');
    expect(autocomplete).toContain('if (cancelled) return;');
    expect(autocomplete).toContain('suggestion.publicationReference');
    expect(searchForm).toContain('suggestion.publicationReference || null');
    expect(searchPage).toContain('selectedReference = null');
    expect(searchPage).toContain('PhenotypeSearchService.findCandidates(');
    expect(searchPage).toContain('publicationReference,');
    expect(searchPage).toContain('resolvePublicationSearchReference(');
    const dashboard = read('../../pages/Dashboard.jsx');
    expect(dashboard).toContain('publicationReferenceFromHistory');
    expect(dashboard).toContain('publicationHistoryReplay');
    expect(dashboard).toContain("'Prefill only'");
    expect(dashboard).not.toContain('publicationConceptByLabel(value)');
    expect(dashboard).not.toContain('publicationHpoReference(value)');
    expect(dashboard).not.toContain('encodeURIComponent(search.query)');

    const history = read('../../pages/History.jsx');
    expect(history).toContain('publicationHistoryReplay(search)');
    expect(history).toContain("'Review Query'");
    expect(history).toContain("'Prefill only'");
    expect(history).not.toContain('encodeURIComponent(search.query)');
  });

  it('keeps guided research, completed empty states, and quizzes aligned with their contracts', () => {
    const hypothesis = read('../../components/research/HypothesisGenerator.jsx');
    const geneCard = read('../../components/search/GeneCard.jsx');
    const quiz = read('../../pages/QuizMode.jsx');

    expect(hypothesis).toContain('!sampleCountIsValid');
    expect(hypothesis).toContain('step="1"');
    expect(geneCard).toContain('gene.detailsPending');
    expect(geneCard).toContain('No candidate phenotype terms are available');
    expect(quiz).toContain('topic: topicId');
    expect(quiz).not.toContain('topic: topicTitle');
    expect(quiz).not.toContain("id: 'general-genetics'");
  });

  it('removes unrelated arbitrary generation from published support and icon routes', () => {
    const support = read('../../pages/ContactSupport.jsx');
    const pageConfig = read('../../pages.config.js');

    expect(support).not.toContain('apiClient.invokeLLM');
    expect(support).not.toContain('AI Draft');
    expect(pageConfig).not.toContain("import('./pages/IconGenerator')");
    expect(pageConfig).not.toContain('"IconGenerator"');
  });

  it('omits unverified VCF, database, and pathway-statistics execution from Research Mode', () => {
    const researchMode = read('../../pages/ResearchMode.jsx');
    expect(researchMode).not.toContain('BulkVCFAnalysis');
    expect(researchMode).not.toContain('value="bulk-vcf"');
    expect(researchMode).not.toContain('ExternalDatabaseIntegration');
    expect(researchMode).not.toContain('PathwayEnrichment');
    expect(researchMode).not.toContain('value="databases"');
    expect(researchMode).not.toContain('value="pathways"');
  });

  it('removes live links to unpublished research-computation surfaces', () => {
    const search = read('../../pages/Search.jsx');
    const dashboard = read('../../pages/Dashboard.jsx');
    const onboarding = read('../../components/dashboard/OnboardingTour.jsx');

    for (const source of [search, dashboard, onboarding]) {
      expect(source).not.toContain('createPageUrl("VisualizationHub")');
      expect(source).not.toContain('createPageUrl("GSEA")');
      expect(source).not.toContain('createPageUrl("AIAssistants")');
    }

    for (const forbidden of [
      'GenomeBrowser',
      'ComparativeGenomics',
      '../components/visualizations/',
      'apiClient.invokeLLM',
    ]) {
      expect(search).not.toContain(forbidden);
    }
  });

  it('excludes high-risk clinical surfaces from the published GeneCard bundle', () => {
    const card = read('../../components/search/GeneCard.jsx');

    for (const forbidden of [
      'RobertClinicalSupport',
      'ClinicalTrialFinder',
      'FHIRExporter',
      'medicalContextCache',
      'HIGH_RISK_CLINICAL_AI_ENABLED',
      'AI-Powered Variant Interpretation',
      'Comprehensive Variant Interpretation',
      'Pharmacogenomic Implications',
      'Analyze Against My Medical Data',
      'Clinical Trials',
      'setIsAnalyzingVariant',
      'setShowClinicalAnalysis',
      'getClinicalRecordsCached',
    ]) {
      expect(card).not.toContain(forbidden);
    }

    expect(card).toContain('exportGeneReport(gene)');
    expect(card).toContain('exportJSON(gene');
    expect(card).toContain('copyShareableLink(gene');
    expect(card).not.toContain('lazyWithRetry');
    expect(card).not.toContain('../visualizations/');
    expect(card).not.toContain('<GenomeBrowser');
    expect(card).not.toContain('<ProteinDomains');
    expect(card).not.toContain('<ProteinStructure');
    expect(card).not.toContain('<ProteinInteractions');
  });

  it('keeps research-project export neutral and non-clinical', () => {
    const projects = read('../../components/research/ProjectManager.jsx');

    for (const forbidden of [
      'FHIRExporter',
      'Export to FHIR',
      'Generate & Download FHIR',
      'healthcare systems',
      'clinical systems',
      'EHR',
      'PHI',
      'apiClient.invokeLLM',
    ]) {
      expect(projects).not.toContain(forbidden);
    }

    expect(projects).toContain('Export Project Summary (JSON)');
    expect(projects).toContain('do not include personal');
  });

  it('ships no high-risk endpoint methods in the public shared client', () => {
    const sharedClient = read('../../../../packages/shared/src/client.ts');

    for (const forbidden of [
      '/entities/medical-data',
      '/entities/conversations',
      '/genomics/vcf',
      '/genomics/variant',
      '/genomics/clinvar',
      '/clinical-trials',
      'getMedicalData(',
      'getConversations(',
      'searchVariants(',
      'searchPhenotypes(',
      'parseVcf(',
      'enrichVcfCohort(',
      'searchClinicalTrials(',
      'HIPAA Compliance',
      '/admin/self-test',
      'runFunctionTests(',
    ]) {
      expect(sharedClient).not.toContain(forbidden);
    }

    expect(sharedClient).toContain('/genomics/enrich');
    expect(sharedClient).toContain('/genomics/publication-concepts/search');

    const adminRoute = read('../../../../services/api/src/routes/admin.js');
    expect(adminRoute).not.toContain("fastify.get('/self-test'");
  });

  it('keeps administrator analytics aggregate-only', () => {
    const analytics = read('../../pages/AdminAnalytics.jsx');

    for (const forbidden of [
      'Medical Records',
      'Medical Data Upload Types',
      'Robert (Clinical)',
      'Anastasia (Counselor)',
      'Top 10 Search Queries',
      'recentSearches',
      'recentActivity',
      'recentConversations',
      'medicalDataTypeBreakdown',
      'agentMesh',
      'search.query',
      'activity.entityId',
      'activity.metadata',
    ]) {
      expect(analytics).not.toContain(forbidden);
    }

    expect(analytics).toContain('Aggregate Platform Analytics');
    expect(analytics).toContain('Individual search text');
    expect(analytics).toContain('activityTypeBreakdown');
    expect(analytics).toContain('searchTypeBreakdown');
  });

  it('does not initiate unused third-party font connections', () => {
    // This checked index.HTML only, and on 2026-08-20 the shell was genuinely
    // clean -- while index.CSS carried
    //   @import url('https://fonts.googleapis.com/css2?family=Inter...')
    // so every visitor's browser contacted Google while the processor register
    // read as verified. A guard that inspects one file cannot speak for the
    // whole browser graph, so it now covers every source that can pull a
    // subresource. Found by loading the real production bundle under the
    // proposed CSP; the font was the ONLY violation.
    const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
    const surfaces = {
      'index.html': read('../../index.html'),
      'index.css': read('../../index.css'),
      'main.jsx': read('../../main.jsx'),
    };
    for (const [name, contents] of Object.entries(surfaces)) {
      for (const host of FONT_HOSTS) {
        expect(contents, `${name} must not reference ${host}`).not.toContain(host);
      }
    }
  });

  it('does not import the retired clinical persona registry into the browser graph', () => {
    const viteConfig = read('../../vite.config.js');
    const vitestConfig = read('../../vitest.config.js');
    const registryTest = read('../../pages/__tests__/agentRegistryTotality.test.js');

    for (const config of [viteConfig, vitestConfig]) {
      expect(config).toContain(
        "'@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/client.ts')",
      );
      expect(config).not.toContain(
        "'@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')",
      );
    }
    expect(registryTest).not.toContain('agentRegistry');
  });

  it('removes retired persona and agent-mesh contracts from runtime source', () => {
    const sharedIndex = read('../../../../packages/shared/src/index.ts');
    const sharedClient = read('../../../../packages/shared/src/client.ts');
    const llmRoute = read('../../../../services/api/src/routes/llm.js');

    expect(sharedIndex).not.toContain('agentRegistry');
    expect(sharedClient).not.toContain('options.agent');
    expect(sharedClient).not.toContain('agentRegistry');
    expect(llmRoute).not.toContain('agentMesh');
    expect(llmRoute).not.toContain('resolveAgent');
    expect(llmRoute).not.toContain('peerNote');
  });

  it('keeps public policy and subscription claims inside the same boundary', () => {
    const privacy = read('../../pages/PrivacyPolicy.jsx');
    const normalizedPrivacy = privacy.replace(/\s+/g, ' ');
    const terms = read('../../pages/TermsOfService.jsx');
    const premium = read('../../pages/Premium.jsx');

    expect(privacy).toContain('Publication-mode data boundary');
    expect(privacy).not.toContain('Health &amp; genetic data you upload');
    expect(privacy).not.toContain('Delete any uploaded record from the Medical Data page');
    expect(privacy).not.toContain('Access to account data is scoped to the signed-in user');
    expect(privacy).toContain('authorized Axiom Biolabs operators');
    for (const provider of ['Vercel:', 'Railway:', 'Resend:', 'Sentry:', 'Redis rate-limit operator:', 'NLM Clinical Tables', 'STRING public API:']) {
      expect(privacy).toContain(provider);
    }
    expect(normalizedPrivacy).toContain('two to ten policy-filtered public gene symbols');
    expect(normalizedPrivacy).toContain('fixed human taxon 9606');
    expect(normalizedPrivacy).toContain('bounded score and added-neighbor settings');
    expect(normalizedPrivacy).toContain('a caller identifier');
    expect(normalizedPrivacy).toContain('does not send phenotype text, variants, patient records');
    expect(terms).not.toContain('The published service does not accept personal medical records');
    expect(terms).toContain('fields can still accept free text');
    expect(terms).not.toContain('AI providers acting as our processors');
    expect(premium).toContain('Saved gene sets & research projects');
    expect(premium).not.toContain('VCF analysis & clinical tools');
    expect(premium).not.toContain('All visualization tools');

    const playListing = read('../../../../docs/play-store/listing.md');
    expect(playListing).not.toContain('compare expression, interactions');
    expect(playListing).not.toContain('Data Visualization Hub');
    expect(playListing).toContain('Draft only');
    expect(playListing).toContain('finite catalog of reviewed genetics topics');
    expect(playListing).not.toContain('Ready-to-paste');
  });

  it('keeps operational error signals finite and non-identifying', () => {
    const browserReporter = read('../reportClientError.js');
    const clientRoute = read('../../../../services/api/src/routes/clientError.js');
    const errorHandler = read('../../../../services/api/src/middleware/errorHandler.js');
    const firstLogin = read('../../../../services/api/src/services/firstLoginNotifier.js');
    const browserSentry = read('../sentry.js');
    const apiSentry = read('../../../../services/api/src/config/sentry.js');

    expect(browserReporter).toContain('JSON.stringify({ eventCode, errorClass })');
    for (const forbidden of ['err.message', 'err.stack', 'window.location', 'statusCode: info']) {
      expect(browserReporter).not.toContain(forbidden);
    }
    for (const forbidden of ['verifyAccessToken', 'reportErrorToOwner', 'body.message', 'body.stack', 'body.route']) {
      expect(clientRoute).not.toContain(forbidden);
    }
    expect(errorHandler).not.toContain('reportErrorToOwner');
    expect(errorHandler).not.toContain('captureException');
    expect(errorHandler).toContain('message: isProd ? undefined : sanitizeError(error)');
    for (const forbidden of ['sendEmail', 'user.email', 'user.fullName', 'FIRST_LOGIN_REPORT_EMAIL']) {
      expect(firstLogin).not.toContain(forbidden);
    }
    for (const sentry of [browserSentry, apiSentry]) {
      expect(sentry).not.toContain('@sentry/');
      expect(sentry).toContain('return false');
    }
  });

  it('keeps profile fields outside personalized clinical promises', () => {
    const profile = read('../../pages/Profile.jsx');

    expect(profile).toContain('Learning & Research Profile');
    expect(profile).toContain('Do not enter personal medical records');
    expect(profile).toContain('personal genomic data');
    expect(profile).toContain('protected health information');
    expect(profile).not.toContain('AI Personalization');
    expect(profile).not.toContain('personalized explanations');
    expect(profile).not.toContain('research opportunities');
  });

  it('keeps candidate-search scope and provenance truthful', () => {
    const searchForm = read('../../components/search/SearchForm.jsx');
    const geneResults = read('../../components/search/GeneResults.jsx');
    const searchService = read('../../components/search/PhenotypeSearchService.jsx');

    expect(searchForm).not.toContain('Premium Search');
    expect(searchForm).not.toContain('expanded research workspace');
    expect(searchForm).not.toContain('all premium features');
    expect(geneResults).not.toContain('Premium Search');
    expect(searchService).not.toContain('Use your knowledge of genetics and genomics databases');
    expect(searchService).not.toContain('Reference data from UniProt, HPA, or GTEx');
    expect(searchService).toContain('merged.chromosome = null');
    expect(searchService).toContain('merged.ensemblId = null');
    const geneCard = read('../../components/search/GeneCard.jsx');
    expect(geneCard).toContain('Authoritative coordinates and identifiers unavailable');
    expect(geneCard).not.toContain('AI estimate');
    const taskContracts = read('../../../../services/api/src/config/publicationTaskContracts.js');
    expect(taskContracts).toContain('Do not claim that OMIM, ClinVar');
    expect(taskContracts).toContain('Do not invent citations');

    const capIndex = searchService.indexOf('candidateGenes = candidateGenes.slice(0, maxCandidateLeads)');
    const enrichmentIndex = searchService.indexOf('this.safeEnrich(symbols, [])');
    expect(capIndex).toBeGreaterThan(-1);
    expect(enrichmentIndex).toBeGreaterThan(capIndex);
    expect(searchService).toContain('const usesDiseaseCandidateLimit = this.usesDiseaseCandidatePrompt');
    expect(searchService).toContain('query: queryReference');
    expect(searchService).not.toContain('query: { kind: this.queryKind');
  });
});
