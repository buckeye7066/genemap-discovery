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
    const searchForm = read('../../components/search/SearchForm.jsx');
    const phenotypeSearch = read('../../components/search/PhenotypeSearchService.jsx');

    expect(privacy).toContain('Publication-mode data boundary');
    expect(privacy).not.toContain('Health &amp; genetic data you upload');
    expect(privacy).not.toContain('Delete any uploaded record from the Medical Data page');
    expect(terms).toContain('The published service does not accept personal medical records');
    expect(premium).toContain('Saved gene sets & research projects');
    expect(premium).not.toContain('VCF analysis & clinical tools');
    expect(premium).not.toContain('All visualization tools');
    expect(searchForm).not.toContain('Premium Search');
    expect(searchForm).not.toContain('handleSubmit(e, true)');
    expect(phenotypeSearch).not.toContain('Use your knowledge of genetics and genomics databases');
    expect(phenotypeSearch).toContain('Treat OMIM, ClinVar, HPO, UniProt, HPA, GTEx, and PubMed as follow-up');

    const capIndex = phenotypeSearch.indexOf('candidateGenes = candidateGenes.slice(0, maxCandidateLeads)');
    const enrichIndex = phenotypeSearch.indexOf('await this.safeEnrich(symbols, [])');
    expect(capIndex).toBeGreaterThan(-1);
    expect(enrichIndex).toBeGreaterThan(capIndex);

    const playListing = read('../../../../docs/play-store/listing.md');
    expect(playListing).not.toContain('compare expression, interactions');
    expect(playListing).not.toContain('Data Visualization Hub');
  });
});
