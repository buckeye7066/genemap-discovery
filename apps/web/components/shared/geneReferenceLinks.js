// Authoritative database links for a set of gene symbols — the provenance
// affordance for the AI research tools (GeneticExplainer / PathwayPredictor /
// ResearchSuggester). Where education explanations get a curated STATIC list
// (services/api/src/services/educationSources.js), these tools operate on a
// USER-supplied gene set, so we build query/search links instead. A search URL
// returns HTTP 200 whether or not the gene exists, so every link is valid
// without predicting the input — and nothing is fabricated (we never assert a
// specific record exists, only "look this term up here").

const MAX_GENES = 8;

function encode(v) {
  return encodeURIComponent(String(v));
}

/** Normalize a gene list (strings or `{ symbol }` objects) to unique symbols. */
export function normalizeGeneSymbols(genes) {
  const seen = new Set();
  const out = [];
  for (const g of Array.isArray(genes) ? genes : []) {
    const sym = (typeof g === 'string' ? g : g && g.symbol ? g.symbol : '').trim();
    if (!sym) continue;
    const key = sym.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sym);
  }
  return out;
}

/**
 * Build an authoritative-reference list for a gene set. Per gene (capped): an
 * NCBI Gene lookup. Then general anchors: a PubMed search across the set, a
 * ClinVar lookup for the first gene, and the MedlinePlus Genetics handbook.
 * With no genes, returns the general database homepages so the block is still
 * useful. Deduped by URL; shaped for <SourceList>.
 */
export function geneReferenceLinks(genes) {
  const symbols = normalizeGeneSymbols(genes).slice(0, MAX_GENES);
  const links = [];

  for (const sym of symbols) {
    links.push({
      label: `${sym} — NCBI Gene`,
      url: `https://www.ncbi.nlm.nih.gov/gene/?term=${encode(sym)}`,
      publisher: 'NCBI',
    });
  }

  if (symbols.length > 0) {
    links.push({
      label: `${symbols[0]} — ClinVar variants`,
      url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encode(symbols[0])}%5Bgene%5D`,
      publisher: 'NCBI',
    });
    links.push({
      label: 'Search these genes in PubMed',
      url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encode(symbols.join(' OR '))}`,
      publisher: 'NCBI / PubMed',
    });
  } else {
    links.push({ label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/', publisher: 'NCBI' });
    links.push({ label: 'Ensembl genome browser', url: 'https://www.ensembl.org/', publisher: 'EMBL-EBI / Ensembl' });
  }

  links.push({
    label: 'MedlinePlus Genetics',
    url: 'https://medlineplus.gov/genetics/',
    publisher: 'U.S. National Library of Medicine (NIH)',
  });

  const seen = new Set();
  return links.filter((l) => (seen.has(l.url) ? false : seen.add(l.url)));
}
