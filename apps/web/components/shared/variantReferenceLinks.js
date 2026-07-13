// Per-variant authoritative-record links for the VCF annotation view. The
// backend annotates each variant from public databases (services/api/src/
// services/vcf.js) but only via API endpoints; this turns the available
// identifiers into the human-browsable records a user can click to verify:
// dbSNP (the rsID), the exact ClinVar variation page (when the search resolved
// one), and the gnomAD population-frequency page.
//
// Deep-links are only emitted from identifiers we actually have. dbSNP/ClinVar
// deep pages resolve because the id came from the annotation itself; the gnomAD
// variant page returns 200 even for an absent variant (its SPA renders a "not
// found" state), so a coordinate link is always safe. Nothing is invented — a
// link is only "look this identifier up here", never a claim a record exists.

function bareChrom(chromosome) {
  if (chromosome == null) return null;
  const c = String(chromosome).trim().replace(/^chr/i, '');
  return c || null;
}

function resolveRsid(variant, annotations) {
  const fromAnno = annotations?.myVariant?.data?.dbsnp?.rsid;
  const fromVariant = variant?.rsid;
  const fromId = typeof variant?.id === 'string' && variant.id.startsWith('rs') ? variant.id : null;
  const rsid = fromAnno || fromVariant || fromId;
  return typeof rsid === 'string' && /^rs\d+$/i.test(rsid.trim()) ? rsid.trim() : null;
}

/**
 * Build the list of source-record links for one enriched variant. Shaped for
 * <SourceList> ({ label, url, publisher }). Returns only the links backed by
 * real identifiers, so a sparsely-annotated variant simply yields fewer.
 */
export function variantReferenceLinks(variant = {}, annotations = {}) {
  const links = [];

  const rsid = resolveRsid(variant, annotations);
  if (rsid) {
    links.push({
      label: `${rsid} — dbSNP`,
      url: `https://www.ncbi.nlm.nih.gov/snp/${encodeURIComponent(rsid)}`,
      publisher: 'NCBI dbSNP',
    });
  }

  const clinVarId = annotations?.clinVar?.search?.esearchresult?.idlist?.[0];
  if (clinVarId) {
    links.push({
      label: 'ClinVar variation record',
      url: `https://www.ncbi.nlm.nih.gov/clinvar/variation/${encodeURIComponent(clinVarId)}/`,
      publisher: 'NCBI ClinVar',
    });
  } else if (rsid) {
    links.push({
      label: 'Search ClinVar',
      url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(rsid)}`,
      publisher: 'NCBI ClinVar',
    });
  }

  const chrom = bareChrom(variant.chromosome);
  const pos = variant.position ?? variant.pos;
  const ref = variant.ref ?? variant.referenceAllele;
  const alt = variant.alt ?? variant.alternateAllele;
  if (chrom && pos != null && ref && alt) {
    const id = `${chrom}-${pos}-${ref}-${alt}`;
    links.push({
      label: 'gnomAD population frequencies',
      url: `https://gnomad.broadinstitute.org/variant/${encodeURIComponent(id)}?dataset=gnomad_r4`,
      publisher: 'Broad Institute gnomAD',
    });
  }

  const seen = new Set();
  return links.filter((l) => (seen.has(l.url) ? false : seen.add(l.url)));
}
