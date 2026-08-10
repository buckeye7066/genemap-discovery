import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createAssociationClaim,
  partitionClaimsBySpecies,
} from '../../../../packages/shared/src/associationClaim.ts';
import { leftAlignAlleles, normalizeVcfAlleleRows } from '../services/variantNormalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/benchmarks');

function loadFixtures() {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')));
}

describe('scientific benchmarks (deterministic fixtures)', () => {
  const fixtures = loadFixtures();

  it('loads ClinGen/ClinVar, HPO/Monarch, and GIAB fixtures', () => {
    const ids = fixtures.map((f) => f.id).sort();
    expect(ids).toEqual([
      'clingen-brca1-pathogenic-demo',
      'giab-hg002-snv-demo',
      'hpo-monarch-seizure-demo',
    ]);
  });

  it('exposes exact provenance fields on every fixture claim source', () => {
    for (const fixture of fixtures) {
      expect(fixture.limitations?.length).toBeGreaterThan(0);
      expect(fixture.species).toBeTruthy();
      expect(fixture.taxon).toBeTruthy();
      expect(fixture.evidenceClass).toBeTruthy();
      for (const source of fixture.sources || []) {
        expect(source.source).toBeTruthy();
        expect(source.recordId).toBeTruthy();
        expect(source.releaseVersion).toBeTruthy();
        expect(source.directLink).toMatch(/^https?:\/\//);
      }
    }
  });

  it('keeps ontology metadata separate from animal association evidence for the HPO/Monarch fixture', () => {
    const fixture = fixtures.find((f) => f.id === 'hpo-monarch-seizure-demo');
    const claims = [
      createAssociationClaim({
        source: fixture.sources[0].source,
        recordId: fixture.sources[0].recordId,
        claim: `${fixture.phenotype.name} human ontology term`,
        taxon: fixture.taxon,
        evidenceClass: fixture.evidenceClass,
        evidenceType: 'phenotype_ontology',
        evidenceStrength: 'supporting',
        releaseVersion: fixture.sources[0].releaseVersion,
        directLink: fixture.sources[0].directLink,
        retrievalDate: '2026-08-08',
      }),
      createAssociationClaim({
        source: 'MGI',
        recordId: fixture.animalOrthologExample.recordId,
        claim: fixture.animalOrthologExample.note,
        taxon: fixture.animalOrthologExample.taxon,
        evidenceClass: fixture.animalOrthologExample.evidenceClass,
        evidenceType: 'ortholog',
        evidenceStrength: 'supporting',
        releaseVersion: 'fixture',
        directLink: null,
        retrievalDate: '2026-08-08',
      }),
    ];
    const parts = partitionClaimsBySpecies(claims);
    expect(parts.human).toHaveLength(0);
    expect(parts.metadata).toHaveLength(1);
    expect(parts.metadata[0]).toMatchObject({
      evidenceType: 'phenotype_ontology',
      taxon: '9606',
    });
    expect(parts.animal).toHaveLength(1);
    expect(parts.animal[0].taxon).toBe('10090');
  });

  it('reproduces GIAB-shaped normalization without silent allele mixing', () => {
    const fixture = fixtures.find((f) => f.id === 'giab-hg002-snv-demo');
    const { chromosome, position, ref, alt } = fixture.vcfRow;
    const rows = normalizeVcfAlleleRows({
      chromosome,
      position,
      ref,
      altText: alt,
      referenceBuild: fixture.referenceBuild,
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.referenceBuild === 'GRCh38')).toBe(true);
    expect(rows.every((row) => row.provenance.referenceBuild === 'GRCh38')).toBe(true);

    const first = leftAlignAlleles(position, ref, alt.split(',')[0]);
    expect(first.position).toBe(fixture.vcfRow.expectedNormalized[0].position);
    expect(first.referenceAllele).toBe(fixture.vcfRow.expectedNormalized[0].referenceAllele);
    expect(first.alternateAllele).toBe(fixture.vcfRow.expectedNormalized[0].alternateAllele);
  });

  it('locks ClinVar demo claim fields for BRCA1 fixture', () => {
    const fixture = fixtures.find((f) => f.id === 'clingen-brca1-pathogenic-demo');
    expect(fixture.variant.gene).toBe('BRCA1');
    expect(fixture.variant.expectedClassification).toBe('Pathogenic');
    expect(fixture.variant.referenceBuild || fixture.referenceBuild).toBe('GRCh38');
    expect(fixture.evidenceClass).toBe('human_verified');
  });
});
