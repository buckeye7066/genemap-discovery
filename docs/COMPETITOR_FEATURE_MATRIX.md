# Competitive Feature Evidence

Researched 2026-08-25 from first-party product pages. “Closest comparator” here
means overlap with GeneMap Discovery's publishable purpose: reviewed genetics
learning, ontology-backed discovery, and provenance-aware early research. It is
not a market-share claim.

| Rank | Comparator | Verified strength | GeneMap decision |
|---:|---|---|---|
| 1 | [Open Targets Platform](https://platform.opentargets.org/) | Source-separated association evidence, decomposed scores, UI/API/download access | Adopt traceable evidence parts and exports; never present a rolled-up provider score without its components. |
| 2 | [Monarch Initiative](https://monarchinitiative.org/kg/about) | Standards-based knowledge graph, cross-species associations, provenance, APIs, downloads | Adopt explicit ontology IDs, species/taxon, source, release, retrieval date, and direct records. |
| 3 | [GeneCards](https://www.genecards.org/) | Integrated, searchable gene-centric cards across named sources | Adopt readable gene cards while keeping claims source-specific and independently inspectable. |
| 4 | [Genomics England PanelApp](https://www.genomicsengland.co.uk/panelapp) | Versioned panels, review history, explicit evidence categories | Adopt version and evidence-class context; do not import clinical diagnostic grades into this education/research product. |
| 5 | [GeneMANIA](https://genemania.org/plugin/) | Interactive functional networks, function prediction, user-supplied networks | Adopt the interactive network workflow through a bounded [STRING public-API](https://string-db.org/help/api/) adapter: selected and expanded nodes stay distinct, score channels remain inspectable, and every view links to the source. |

## Transferable feature status

- Source-level association rows, species separation, versions, retrieval dates,
  source links, score decomposition, comparison, and safe exports are present.
- Open Targets literature evidence is a datatype score component inside a
  computed association claim. Cards, filters, comparisons, copied text, and
  printable exports now expose that positive component without reclassifying
  its owning claim or presenting a source score as a calibrated probability.
- Gene comparison now includes an interactive human functional-association
  network backed by the authenticated, deterministic STRING adapter. Users can
  filter by source score and focus nodes; query genes, added neighbors, channel
  scores, retrieval time, and official source links remain explicit.
- Clinical interpretation, personal variant analysis, diagnostic grades, and
  treatment guidance remain outside the published product boundary.
