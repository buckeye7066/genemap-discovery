/**
 * Export utilities for GeneMap Discovery
 * Provides PDF-like HTML export, JSON export, and shareable summaries.
 */

/**
 * Export data as a downloadable JSON file.
 */
export function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${filename}.json`);
}

/**
 * Export data as a CSV file.
 */
export function exportCSV(rows, headers, filename) {
  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
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
  if (basis === 'human_verified') return 'Human-verified provenance';
  if (basis === 'computational') return 'Computational evidence';
  if (basis === 'animal_model') return 'Animal-model evidence';
  if (basis === 'external_followup') return 'External follow-up source';
  return 'AI research lead';
}

function displayValue(value, fallback = 'Not recorded') {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  return String(value);
}

function safeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function associationClaimContent(claim, index) {
  const safeLink = safeExternalUrl(claim?.directLink);
  const recordId = displayValue(claim?.recordId);
  const releaseVersion = displayValue(claim?.releaseVersion);
  const evidenceClass = displayValue(claim?.evidenceClass);
  const evidenceType = displayValue(claim?.evidenceType);
  const evidenceStrength = displayValue(claim?.evidenceStrength);
  const species = displayValue(claim?.species || claim?.taxon);
  const taxon = displayValue(claim?.taxon);
  const retrievalDate = displayValue(claim?.retrievalDate);

  return `
    <div class="claim">
      <h3>Claim ${index + 1}: ${escapeHtml(displayValue(claim?.claim, 'Claim text not recorded'))}</h3>
      <table>
        <tr><th>Source</th><td>${escapeHtml(displayValue(claim?.source))}</td></tr>
        <tr><th>Record ID</th><td>${escapeHtml(recordId)}</td></tr>
        <tr><th>Release / Version</th><td>${escapeHtml(releaseVersion)}</td></tr>
        <tr><th>Evidence Class</th><td>${escapeHtml(evidenceClass)}</td></tr>
        <tr><th>Evidence Type</th><td>${escapeHtml(evidenceType)}</td></tr>
        <tr><th>Evidence Strength</th><td>${escapeHtml(evidenceStrength)}</td></tr>
        <tr><th>Species</th><td>${escapeHtml(species)}</td></tr>
        <tr><th>Taxon</th><td>${escapeHtml(taxon)}</td></tr>
        <tr><th>Retrieved</th><td>${escapeHtml(retrievalDate)}</td></tr>
        <tr><th>AI Lead</th><td>${claim?.isAiLead === true ? 'Yes' : 'No'}</td></tr>
        <tr><th>Source Record</th><td>${safeLink
          ? `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">Open source record</a>`
          : 'No validated HTTP(S) link recorded'}</td></tr>
      </table>
    </div>`;
}

/**
 * Build the printable gene-report sections as a pure function so provenance
 * completeness and escaping can be regression-tested without opening a window.
 */
export function buildGeneReportSections(gene = {}) {
  const sections = [];
  const claims = Array.isArray(gene.associationClaims) ? gene.associationClaims : [];
  const rankingLabel = rankingLabelFor(gene.rankingBasis);
  const location = [gene.chromosome, gene.location].filter(Boolean).join(' · ');

  sections.push({
    title: 'Gene Overview',
    content: `
      <table>
        <tr><th>Symbol</th><td>${escapeHtml(displayValue(gene.symbol))}</td></tr>
        <tr><th>Full Name</th><td>${escapeHtml(displayValue(gene.name || gene.fullName))}</td></tr>
        <tr><th>Location</th><td>${escapeHtml(displayValue(location))}</td></tr>
        <tr><th>Ranking Basis</th><td>${escapeHtml(rankingLabel)}</td></tr>
        ${gene.omimId ? `<tr><th>OMIM</th><td>${escapeHtml(gene.omimId)}</td></tr>` : ''}
      </table>
      ${gene.description ? `<p>${escapeHtml(gene.description)}</p>` : ''}
    `,
  });

  sections.push({
    title: 'Association Claims and Provenance',
    content: claims.length
      ? claims.map(associationClaimContent).join('')
      : '<p class="notice"><strong>No claim-level provenance was supplied.</strong> Treat every candidate label in this report as an unverified research lead.</p>',
  });

  if (gene.diseases?.length) {
    sections.push({
      title: 'Candidate Disease Labels',
      content: `
        <p class="notice"><strong>Candidate labels only.</strong> These labels are not verified associations unless a claim-level row above cites supporting evidence.</p>
        <ul>${gene.diseases.map(d => `<li>${escapeHtml(typeof d === 'string' ? d : d.name || d.disease || '')}</li>`).join('')}</ul>`,
    });
  }

  if (gene.phenotypes?.length) {
    sections.push({
      title: 'Candidate Phenotype Terms',
      content: `
        <p class="notice"><strong>Candidate terms only.</strong> An HPO identifier validates an ontology term, not a gene-phenotype association.</p>
        <ul>${gene.phenotypes.map(p => {
          if (typeof p === 'string') return `<li>${escapeHtml(p)}</li>`;
          const identifier = p.hpoId
            ? ` · ${p.hpoId}${p.hpoVerified ? ' (HPO-validated term)' : ' (unverified identifier)'}`
            : '';
          return `<li>${escapeHtml(`${p.name || ''}${identifier}`)}</li>`;
        }).join('')}</ul>`,
    });
  }

  if (gene.expressionData?.length) {
    sections.push({
      title: 'Expression Data',
      content: `<table><tr><th>Tissue</th><th>Level</th></tr>${gene.expressionData.slice(0, 15).map(e => {
        const level = typeof e.value === 'number' ? e.value.toFixed(2) : e.level || 'N/A';
        return `<tr><td>${escapeHtml(e.tissue || e.name || '')}</td><td>${escapeHtml(level)}</td></tr>`;
      }).join('')}</table>`,
    });
  }

  return sections;
}

/**
 * Generate a gene card report.
 */
export function exportGeneReport(gene) {
  exportReport({
    title: `Gene Report: ${gene?.symbol || 'Unknown gene'}`,
    subtitle: gene?.name || gene?.fullName,
    sections: buildGeneReportSections(gene),
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
            <td>${escapeHtml(v.gene || '')}</td>
            <td>${escapeHtml(v.variant || v.hgvs || `${v.chrom}:${v.pos}`)}</td>
            <td>${escapeHtml(v.classification || v.clinicalSignificance || '')}</td>
            <td>${typeof v.frequency === 'number' ? v.frequency.toFixed(4) : 'N/A'}</td>
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
  const lines = [
    `GeneMap Discovery - Gene: ${displayValue(data.symbol, 'Unknown gene')}`,
    `Name: ${displayValue(data.name || data.fullName)}`,
    `Location: ${displayValue([data.chromosome, data.location].filter(Boolean).join(' · '))}`,
    `Ranking: ${rankingLabelFor(data.rankingBasis)}`,
  ];
  const claims = Array.isArray(data.associationClaims) ? data.associationClaims : [];

  if (claims.length) {
    lines.push('Association claims and provenance:');
    claims.forEach((claim, index) => {
      const sourceLink = safeExternalUrl(claim?.directLink);
      lines.push([
        `${index + 1}. ${displayValue(claim?.claim, 'Claim text not recorded')}`,
        `source=${displayValue(claim?.source)}`,
        `record=${displayValue(claim?.recordId)}`,
        `version=${displayValue(claim?.releaseVersion)}`,
        `evidence=${displayValue(claim?.evidenceClass)}`,
        `species=${displayValue(claim?.species || claim?.taxon)}`,
        `taxon=${displayValue(claim?.taxon)}`,
        `retrieved=${displayValue(claim?.retrievalDate)}`,
        sourceLink ? `link=${sourceLink}` : 'link=not recorded',
      ].join(' | '));
    });
  } else {
    lines.push('Association claims: none supplied; candidate labels remain unverified research leads.');
  }

  if (data.diseases?.length) {
    lines.push(`Candidate disease labels, unverified unless supported above: ${data.diseases
      .slice(0, 5)
      .map(d => typeof d === 'string' ? d : d.name || d.disease || '')
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
    : `GeneMap Discovery Analysis\n${JSON.stringify(data, null, 2).substring(0, 500)}`;

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
