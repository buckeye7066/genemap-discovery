import {
  claimProvenanceRole,
  deriveRankingBasisFromClaims,
  safeExternalHttpUrl,
} from '../../../packages/shared/src/associationClaim.js';
import { isCanonicalPublicationArtifact } from '@genemap/shared/publicationStatus';

/**
 * Export utilities for GeneMap Discovery
 * Provides PDF-like HTML export, JSON export, and shareable summaries.
 */

const EXPORTABLE_PUBLICATION_STATUSES = new Set(['available', 'partial']);
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

/** Export paths enforce the publication boundary independently of the UI. */
export function isPublicationExportable(artifact) {
  return Boolean(
    isCanonicalPublicationArtifact(artifact)
    && EXPORTABLE_PUBLICATION_STATUSES.has(artifact.status)
  );
}

function sanitizePublicationArtifact(artifact, ancestors) {
  const canonical = isCanonicalPublicationArtifact(artifact);
  const exportable = isPublicationExportable(artifact);
  return {
    contractVersion: 1,
    status: canonical ? artifact.status : 'unavailable',
    content: exportable ? sanitizePublicationContent(artifact.content, ancestors) : null,
    reasonCode: !canonical
      ? 'invalid_publication_envelope'
      : artifact.reasonCode,
    correlationId: typeof artifact?.correlationId === 'string' && CORRELATION_ID.test(artifact.correlationId)
      ? artifact.correlationId
      : 'client-invalid-publication',
    limitations: canonical ? [...artifact.limitations] : [],
  };
}

function looksLikePublicationArtifact(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, 'status')
    && Object.prototype.hasOwnProperty.call(value, 'content')
    && (
      Object.prototype.hasOwnProperty.call(value, 'contractVersion')
      || Object.prototype.hasOwnProperty.call(value, 'correlationId')
      || Object.prototype.hasOwnProperty.call(value, 'reasonCode')
      || Object.prototype.hasOwnProperty.call(value, 'limitations')
    ),
  );
}

function isGeneRecord(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && ('symbol' in value || 'associationClaims' in value)
  );
}

function isExplicitGeneCollectionRecord(value) {
  return Boolean(
    isGeneRecord(value)
    || (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (
        Object.prototype.hasOwnProperty.call(value, 'candidatePublication')
        || Object.prototype.hasOwnProperty.call(value, 'profilePublication')
      )
    )
  );
}

function sanitizeGeneCollection(genes, ancestors) {
  return sanitizeExportValue(genes, ancestors, true, true);
}

function sanitizePublicationContent(content, ancestors) {
  if (content && typeof content === 'object' && ancestors.has(content)) {
    return '[Circular reference omitted]';
  }
  if (isExplicitGeneCollectionRecord(content)) {
    return sanitizePublicationSafeGene(content, ancestors);
  }
  return Array.isArray(content)
    ? sanitizeGeneCollection(content, ancestors)
    : sanitizeExportValue(content, ancestors, true);
}

function sanitizePublicationReference(publication, ancestors) {
  if (!publication || typeof publication !== 'object') {
    return sanitizePublicationArtifact(publication, ancestors);
  }
  if (ancestors.has(publication)) return '[Circular reference omitted]';
  ancestors.add(publication);
  try {
    return sanitizePublicationArtifact(publication, ancestors);
  } finally {
    ancestors.delete(publication);
  }
}

function sanitizeExportValue(
  value,
  ancestors = new WeakSet(),
  applyGeneCollectionPolicy = false,
  recognizeGeneRecords = false,
) {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular reference omitted]';
  if (recognizeGeneRecords && isExplicitGeneCollectionRecord(value)) {
    return sanitizePublicationSafeGene(value, ancestors);
  }
  ancestors.add(value);
  try {
    if (looksLikePublicationArtifact(value)) {
      return sanitizePublicationArtifact(value, ancestors);
    }
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeExportValue(
        item,
        ancestors,
        applyGeneCollectionPolicy,
        recognizeGeneRecords,
      ));
    }
    const sanitized = Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === 'publication'
        ? sanitizePublicationReference(item, ancestors)
        : applyGeneCollectionPolicy && key === 'genes'
          ? sanitizeGeneCollection(item, ancestors)
          : sanitizeExportValue(
            item,
            ancestors,
            applyGeneCollectionPolicy,
            recognizeGeneRecords,
          ),
    ]));
    if (Object.prototype.hasOwnProperty.call(value, 'publication')) {
      for (const legacyAlias of [
        'result',
        'response',
        'explanation',
        'questions',
        'imageUrl',
        'revisedPrompt',
        'analysis',
      ]) {
        delete sanitized[legacyAlias];
      }
    }
    return sanitized;
  } finally {
    ancestors.delete(value);
  }
}

function sanitizePublicationSafeGene(gene, ancestors) {
  const source = /** @type {Record<string, unknown>} */ (
    gene && typeof gene === 'object' ? gene : {}
  );
  const candidateReusable = isPublicationExportable(source.candidatePublication);
  const profileReusable = isPublicationExportable(source.profilePublication)
    && source.profileStatus === 'available';
  const safe = sanitizeExportValue(source, ancestors, true);

  for (const publicationKey of ['candidatePublication', 'profilePublication']) {
    if (Object.prototype.hasOwnProperty.call(source, publicationKey)) {
      const publication = source[publicationKey];
      safe[publicationKey] = sanitizePublicationReference(publication, ancestors);
    }
  }

  if (!candidateReusable) {
    delete safe.explanation;
    delete safe.description;
    delete safe.associationType;
    delete safe.association_type;
    delete safe.diseases;
    if (safe.coordinatesVerified !== true) {
      delete safe.name;
      delete safe.fullName;
    }
  }
  if (!profileReusable) {
    delete safe.aiSummary;
    delete safe.keyTakeaways;
    safe.phenotypes = [];
    safe.expressionData = [];
  }
  if (safe.coordinatesVerified !== true) {
    delete safe.chromosome;
    delete safe.location;
    delete safe.mapLocation;
    delete safe.start;
    delete safe.end;
    delete safe.ensemblId;
    delete safe.entrezId;
    delete safe.genomeBuild;
    delete safe.omimId;
    delete safe.verifiedSource;
    delete safe.authoritativeRetrievedAt;
  }
  return safe;
}

export function publicationSafeGene(gene = {}) {
  return sanitizePublicationSafeGene(gene, new WeakSet());
}

export function publicationSafeExportData(data) {
  return isGeneRecord(data)
    ? publicationSafeGene(data)
    : Array.isArray(data)
      ? sanitizeGeneCollection(data, new WeakSet())
      : sanitizeExportValue(data, new WeakSet(), true);
}

/**
 * Export data as a downloadable JSON file.
 */
export function exportJSON(data, filename) {
  const safeData = publicationSafeExportData(data);
  const blob = new Blob([JSON.stringify(safeData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${filename}.json`);
}

/**
 * Export data as a CSV file.
 */
export function exportCSV(rows, headers, filename) {
  const safeRows = rows.map((row) => (
    isGeneRecord(row)
      ? publicationSafeGene(row)
      : publicationSafeExportData(row)
  ));
  const csvRows = [
    headers.join(','),
    ...safeRows.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        const escaped = String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Export an analysis report as a printable HTML page (opens print dialog for PDF).
 */
export function exportReport({ title, subtitle, sections, generatedAt = new Date().toISOString() }) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} - GeneMap Discovery Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 24px; color: #1e293b; }
    .header p { font-size: 14px; color: #64748b; margin-top: 4px; }
    .meta { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 18px; color: #4f46e5; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .section h3 { font-size: 15px; color: #334155; margin-bottom: 8px; }
    .section p, .section li { font-size: 13px; line-height: 1.6; color: #475569; }
    .section ul { padding-left: 20px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-weight: 600; border: 1px solid #e2e8f0; }
    td { padding: 8px 12px; border: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fef2f2; color: #991b1b; }
    .claim { page-break-inside: avoid; margin-bottom: 18px; }
    .notice { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
    <p class="meta">Generated: ${escapeHtml(generatedAt || new Date().toLocaleString())} | GeneMap Discovery</p>
  </div>
  ${sections.map(section => `
  <div class="section">
    <h2>${escapeHtml(section.title)}</h2>
    ${section.content}
  </div>`).join('')}
  <div class="footer">
    <p>Education and exploratory research only. Do not use this report for diagnosis, personal-risk prediction, treatment, dosing, screening, or other clinical decisions. Verify every material claim in the cited source record.</p>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}

function rankingLabelFor(basis = 'ai_lead') {
  if (basis === 'human_verified') return 'Human-verified association evidence';
  if (basis === 'computational') return 'Computational association evidence';
  if (basis === 'animal_model') return 'Animal-model association evidence';
  if (basis === 'literature') return 'Literature-derived association evidence';
  return 'AI research lead';
}

function rankingBasisForGene(gene, claims) {
  return gene?.rankingBasis || deriveRankingBasisFromClaims(claims);
}

function displayValue(value, fallback = 'Not recorded') {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  return String(value);
}

function aiLeadValue(claim) {
  if (claim?.isAiLead === true) return 'true';
  if (claim?.isAiLead === false) return 'false';
  return 'not_recorded';
}

function provenanceRoleLabel(claim) {
  const role = claimProvenanceRole(claim);
  if (role === 'association_evidence') return 'Association evidence';
  if (role === 'ai_candidate_lead') return 'AI candidate lead';
  return 'Identity / ontology / follow-up metadata';
}

function sourceScoreComponents(claim) {
  return Array.isArray(claim?.scoreComponents)
    ? claim.scoreComponents.filter((component) => (
      component
      && typeof component === 'object'
      && Number.isFinite(component.score)
    ))
    : [];
}

function formatSourceScore(value) {
  if (!Number.isFinite(value)) return 'Not recorded';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toFixed(2);
}

function associationClaimContent(claim, index) {
  const safeLink = safeExternalHttpUrl(claim?.directLink);
  const recordId = displayValue(claim?.recordId);
  const releaseVersion = displayValue(claim?.releaseVersion);
  const referenceAssembly = displayValue(claim?.referenceAssembly);
  const evidenceClass = displayValue(claim?.evidenceClass);
  const evidenceType = displayValue(claim?.evidenceType);
  const evidenceStrength = displayValue(claim?.evidenceStrength);
  const species = displayValue(claim?.species);
  const taxon = displayValue(claim?.taxon);
  const retrievalDate = displayValue(claim?.retrievalDate);
  const scoreComponents = sourceScoreComponents(claim);

  return `
    <div class="claim">
      <h3>Provenance row ${index + 1}: ${escapeHtml(displayValue(claim?.claim, 'Claim text not recorded'))}</h3>
      <table>
        <tr><th>Role</th><td>${escapeHtml(provenanceRoleLabel(claim))}</td></tr>
        <tr><th>Source</th><td>${escapeHtml(displayValue(claim?.source))}</td></tr>
        <tr><th>Record ID</th><td>${escapeHtml(recordId)}</td></tr>
        <tr><th>Source Release / Version</th><td>${escapeHtml(releaseVersion)}</td></tr>
        <tr><th>Reference Assembly</th><td>${escapeHtml(referenceAssembly)}</td></tr>
        <tr><th>Evidence Class</th><td>${escapeHtml(evidenceClass)}</td></tr>
        <tr><th>Evidence Type</th><td>${escapeHtml(evidenceType)}</td></tr>
        <tr><th>Evidence Strength</th><td>${escapeHtml(evidenceStrength)}</td></tr>
        <tr><th>Species</th><td>${escapeHtml(species)}</td></tr>
        <tr><th>Taxon</th><td>${escapeHtml(taxon)}</td></tr>
        <tr><th>Retrieved</th><td>${escapeHtml(retrievalDate)}</td></tr>
        <tr><th>AI Lead</th><td>${escapeHtml(aiLeadValue(claim))}</td></tr>
        ${scoreComponents.length > 0 ? `
        <tr><th>Source Score Components</th><td>
          <ul>${scoreComponents.map((component) => `<li>${escapeHtml(displayValue(component.label || component.id, 'Unlabeled component'))}: ${escapeHtml(formatSourceScore(component.score))} · class ${escapeHtml(displayValue(component.evidenceClass))} · scale ${escapeHtml(displayValue(component.scale))}</li>`).join('')}</ul>
          <p>Source-published parts of this computed claim, not calibrated probabilities.</p>
        </td></tr>` : ''}
        <tr><th>Source Record</th><td>${safeLink
          ? `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">Open source record</a>`
          : 'No validated HTTP(S) link recorded'}</td></tr>
      </table>
    </div>`;
}

function publicationBoundaryContent(gene) {
  const entries = [
    ['Candidate lead', gene?.candidatePublication],
    ['Generated profile', gene?.profilePublication],
  ].filter(([, artifact]) => artifact && typeof artifact === 'object');
  if (entries.length === 0) return null;

  return entries.map(([label, artifact]) => {
    const limitations = Array.isArray(artifact.limitations)
      ? artifact.limitations.filter((item) => typeof item === 'string' && item.trim())
      : [];
    return `
      <div class="notice">
        <p><strong>${escapeHtml(label)} publication:</strong> ${escapeHtml(displayValue(artifact.status, 'unavailable'))}</p>
        ${artifact.correlationId ? `<p>Correlation: ${escapeHtml(artifact.correlationId)}</p>` : ''}
        ${artifact.reasonCode ? `<p>Reason: ${escapeHtml(artifact.reasonCode)}</p>` : ''}
        ${limitations.length
          ? `<p>Limitations:</p><ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : ''}
      </div>`;
  }).join('');
}

/**
 * Build the printable gene-report sections as a pure function so provenance
 * completeness and escaping can be regression-tested without opening a window.
 */
export function buildGeneReportSections(gene = {}) {
  gene = publicationSafeGene(gene);
  const sections = [];
  const claims = Array.isArray(gene.associationClaims) ? gene.associationClaims : [];
  const rankingLabel = rankingLabelFor(rankingBasisForGene(gene, claims));
  const location = [gene.chromosome, gene.location].filter(Boolean).join(' · ');

  sections.push({
    title: 'Gene Overview',
    content: `
      <table>
        <tr><th>Symbol</th><td>${escapeHtml(displayValue(gene.symbol))}</td></tr>
        <tr><th>Full Name</th><td>${escapeHtml(displayValue(gene.name || gene.fullName))}</td></tr>
        <tr><th>Location</th><td>${escapeHtml(displayValue(location))}</td></tr>
        <tr><th>Association-Ranking Basis</th><td>${escapeHtml(rankingLabel)}</td></tr>
        ${gene.omimId ? `<tr><th>OMIM</th><td>${escapeHtml(gene.omimId)}</td></tr>` : ''}
      </table>
      ${gene.description ? `<p>${escapeHtml(gene.description)}</p>` : ''}
    `,
  });

  const publicationBoundary = publicationBoundaryContent(gene);
  if (publicationBoundary) {
    sections.push({
      title: 'Publication Status',
      content: publicationBoundary,
    });
  }

  sections.push({
    title: 'Evidence and Source Provenance',
    content: claims.length
      ? claims.map(associationClaimContent).join('')
      : '<p class="notice"><strong>No claim-level provenance was supplied.</strong> Treat every candidate label in this report as an unverified research lead.</p>',
  });

  if (gene.diseases?.length) {
    sections.push({
      title: 'Candidate Disease Labels',
      content: `
        <p class="notice"><strong>Candidate labels only.</strong> These labels are not verified associations unless a provenance row above is explicitly labeled association evidence.</p>
        <ul>${gene.diseases.map(d => `<li>${escapeHtml(typeof d === 'string' ? d : d?.name || d?.disease || '')}</li>`).join('')}</ul>`,
    });
  }

  if (gene.phenotypes?.length) {
    sections.push({
      title: 'Candidate Phenotype Terms',
      content: `
        <p class="notice"><strong>Candidate terms only.</strong> An HPO identifier validates an ontology term, not a gene-phenotype association.</p>
        <ul>${gene.phenotypes.map(p => {
          if (typeof p === 'string') return `<li>${escapeHtml(p)}</li>`;
          const phenotype = p ?? {};
          const identifier = phenotype.hpoId
            ? ` · ${phenotype.hpoId}${phenotype.hpoVerified ? ' (HPO-validated term)' : ' (unverified identifier)'}`
            : '';
          return `<li>${escapeHtml(`${phenotype.name || ''}${identifier}`)}</li>`;
        }).join('')}</ul>`,
    });
  }

  if (gene.expressionData?.length) {
    sections.push({
      title: 'Expression Data',
      content: `<table><tr><th>Tissue</th><th>Level</th></tr>${gene.expressionData.slice(0, 15).map(e => {
        const level = Number.isFinite(e?.value) ? e.value.toFixed(2) : e?.level || 'N/A';
        return `<tr><td>${escapeHtml(e?.tissue || e?.name || '')}</td><td>${escapeHtml(level)}</td></tr>`;
      }).join('')}</table>`,
    });
  }

  return sections;
}

/**
 * Generate a gene card report.
 */
export function exportGeneReport(gene) {
  const safeGene = publicationSafeGene(gene);
  exportReport({
    title: `Gene Report: ${safeGene.symbol || 'Unknown gene'}`,
    subtitle: safeGene.name || safeGene.fullName,
    sections: buildGeneReportSections(safeGene),
  });
}

/**
 * Export a VCF analysis report.
 * This helper is retained for non-published internal compatibility; the
 * publication route graph does not expose VCF analysis.
 */
export function exportVCFReport(variants, summary) {
  const sections = [
    {
      title: 'Analysis Summary',
      content: `
        <table>
          <tr><th>Total Variants</th><td>${variants.length}</td></tr>
          ${summary?.pathogenicCount != null ? `<tr><th>Pathogenic</th><td><span class="badge badge-red">${summary.pathogenicCount}</span></td></tr>` : ''}
          ${summary?.benignCount != null ? `<tr><th>Benign</th><td><span class="badge badge-green">${summary.benignCount}</span></td></tr>` : ''}
          ${summary?.vusCount != null ? `<tr><th>VUS</th><td><span class="badge badge-blue">${summary.vusCount}</span></td></tr>` : ''}
        </table>
      `,
    },
    {
      title: 'Variant Details',
      content: `<table>
        <tr><th>Gene</th><th>Variant</th><th>Classification</th><th>Frequency</th></tr>
        ${variants.slice(0, 50).map(v => `
          <tr>
            <td>${escapeHtml(v?.gene || '')}</td>
            <td>${escapeHtml(v?.variant || v?.hgvs || `${v?.chrom}:${v?.pos}`)}</td>
            <td>${escapeHtml(v?.classification || v?.clinicalSignificance || '')}</td>
            <td>${Number.isFinite(v?.frequency) ? v.frequency.toFixed(4) : 'N/A'}</td>
          </tr>`
        ).join('')}
      </table>`,
    },
  ];

  exportReport({
    title: 'VCF Analysis Report',
    subtitle: `${variants.length} variants analyzed`,
    sections,
  });
}

/**
 * Build a provenance-preserving plain-text gene summary.
 */
export function buildGeneShareText(data = {}) {
  data = publicationSafeGene(data);
  const claims = Array.isArray(data.associationClaims) ? data.associationClaims : [];
  const lines = [
    `GeneMap Discovery - Gene: ${displayValue(data.symbol, 'Unknown gene')}`,
    `Name: ${displayValue(data.name || data.fullName)}`,
    `Location: ${displayValue([data.chromosome, data.location].filter(Boolean).join(' · '))}`,
    `Ranking: ${rankingLabelFor(rankingBasisForGene(data, claims))}`,
  ];

  for (const [label, artifact] of [
    ['Candidate lead publication', data.candidatePublication],
    ['Generated profile publication', data.profilePublication],
  ]) {
    if (!artifact || typeof artifact !== 'object') continue;
    lines.push(`${label}: ${displayValue(artifact.status, 'unavailable')}`);
    if (artifact.correlationId) lines.push(`${label} correlation: ${artifact.correlationId}`);
    if (artifact.reasonCode) lines.push(`${label} reason: ${artifact.reasonCode}`);
    for (const limitation of artifact.limitations || []) {
      lines.push(`${label} limitation: ${limitation}`);
    }
  }

  if (claims.length) {
    lines.push('Evidence and source provenance:');
    claims.forEach((claim, index) => {
      const sourceLink = safeExternalHttpUrl(claim?.directLink);
      lines.push([
        `${index + 1}. ${displayValue(claim?.claim, 'Claim text not recorded')}`,
        `role=${claimProvenanceRole(claim)}`,
        `source=${displayValue(claim?.source)}`,
        `record=${displayValue(claim?.recordId)}`,
        `version=${displayValue(claim?.releaseVersion)}`,
        `assembly=${displayValue(claim?.referenceAssembly)}`,
        `evidence=${displayValue(claim?.evidenceClass)}`,
        `evidence_type=${displayValue(claim?.evidenceType)}`,
        `evidence_strength=${displayValue(claim?.evidenceStrength)}`,
        `species=${displayValue(claim?.species)}`,
        `taxon=${displayValue(claim?.taxon)}`,
        `retrieved=${displayValue(claim?.retrievalDate)}`,
        `ai_lead=${aiLeadValue(claim)}`,
        sourceLink ? `link=${sourceLink}` : 'link=not recorded',
      ].join(' | '));
      for (const component of sourceScoreComponents(claim)) {
        lines.push([
          `   source_score_component=${displayValue(component.label || component.id, 'Unlabeled component')}`,
          `component_id=${displayValue(component.id)}`,
          `score=${formatSourceScore(component.score)}`,
          `component_evidence=${displayValue(component.evidenceClass)}`,
          `scale=${displayValue(component.scale)}`,
        ].join(' | '));
      }
    });
  } else {
    lines.push('Evidence and source provenance: none supplied; candidate labels remain unverified research leads.');
  }

  if (data.diseases?.length) {
    lines.push(`Candidate disease labels, unverified unless supported above: ${data.diseases
      .slice(0, 5)
      .map(d => typeof d === 'string' ? d : d?.name || d?.disease || '')
      .join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Copy a shareable text summary to clipboard.
 */
export async function copyShareableLink(data, type = 'gene') {
  const text = type === 'gene'
    ? buildGeneShareText(data)
    : `GeneMap Discovery Analysis\n${JSON.stringify(publicationSafeExportData(data), null, 2).substring(0, 500)}`;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
