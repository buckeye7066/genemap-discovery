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
  });

  it('gates every GeneCard clinical execution surface behind the hard flag', () => {
    const card = read('../../components/search/GeneCard.jsx');
    expect(card).toContain('if (HIGH_RISK_CLINICAL_AI_ENABLED)');
    expect(card).toContain('HIGH_RISK_CLINICAL_AI_ENABLED && showClinicalAnalysis');
    expect(card).toContain('HIGH_RISK_CLINICAL_AI_ENABLED && isPremium');
    expect(card).toContain('Personalized clinical, medical-record, variant-interpretation');
  });

  it('keeps public policy and subscription claims inside the same boundary', () => {
    const privacy = read('../../pages/PrivacyPolicy.jsx');
    const terms = read('../../pages/TermsOfService.jsx');
    const premium = read('../../pages/Premium.jsx');

    expect(privacy).toContain('Publication-mode data boundary');
    expect(privacy).not.toContain('Health &amp; genetic data you upload');
    expect(privacy).not.toContain('Delete any uploaded record from the Medical Data page');
    expect(terms).toContain('The published service does not accept personal medical records');
    expect(premium).toContain('Saved gene sets & research projects');
    expect(premium).not.toContain('VCF analysis & clinical tools');
    expect(premium).not.toContain('All visualization tools');

    const playListing = read('../../../../docs/play-store/listing.md');
    expect(playListing).not.toContain('compare expression, interactions');
    expect(playListing).not.toContain('Data Visualization Hub');
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

  it('keeps surviving UI state aligned with bounded publication contracts', () => {
    const hypothesis = read('../../components/research/HypothesisGenerator.jsx');
    expect(hypothesis).toContain("setFocusConceptId(parsed.focus?.conceptId || '')");
    expect(hypothesis).toContain('<option value="" disabled>Choose a reviewed concept</option>');

    const searchService = read('../../components/search/PhenotypeSearchService.jsx');
    const search = read('../../pages/Search.jsx');
    const dashboard = read('../../pages/Dashboard.jsx');
    expect(searchService).toContain('publicationReference: queryReference');
    expect(search).toContain('publicationReference: enriched.publicationReference || null');
    expect(dashboard).toContain('.map(publicationReferenceFromSearchHistoryEntry)');

    const geneCard = read('../../components/search/GeneCard.jsx');
    expect(geneCard).not.toContain('You are Robert, an AI genetic variant interpretation specialist');
    expect(geneCard).toContain('Personal variant interpretation is not available');
  });

});
