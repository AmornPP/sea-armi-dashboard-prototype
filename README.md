# SEA-ARMi dashboard prototype

This repository publishes version 1.1 of the SEA-ARMi research-explorer prototype. It is a static dashboard for exploring fungal metagenomic sample records, exact-match WHO group labels, sequence-alignment hits, FungAMR reference evidence, sampling locations, and nearby Thai public-health facilities.

The dashboard is an exploratory prototype. It does not calculate infection risk, resistance prevalence, clinical diagnosis, treatment recommendations, road distance, or hospital referral relationships. An accession link to a FungAMR record does not confirm that the corresponding sample has the listed mutation, phenotype, or antifungal susceptibility.

## Published content

GitHub Pages deploys the self-contained website in `dashboard/versions/version_1.1`. The raw source datasets, full preprocessing outputs, internal notes, and working scripts are intentionally excluded from this public repository.

## Data interpretation

- Taxon-to-WHO labels use exact, case-sensitive matches from the supplied mapping file.
- Sample and taxon source rows are retained; repeated sample, rank, and taxon keys must not be treated as independent detections or summed without an approved aggregation rule.
- FungAMR rows are reference evidence, not local isolate AFST results.
- Nearby facilities are shown by Haversine distance for geographic context only.
- Facility records may include public-health offices and are not all necessarily hospitals.

## Sources and attribution

The interface identifies the supplied project datasets and links to the WHO Fungal Priority Pathogens List and geoBoundaries metadata. The Thailand boundary is derived from geoBoundaries/OpenStreetMap data under ODbL attribution. Map tiles are provided by OpenStreetMap contributors. D3 and Leaflet are bundled locally.

No general reuse license is granted for the project data or dashboard content unless one is added explicitly by the project owner.

## Local preview

From the repository root:

```powershell
python -m http.server 8766 --bind 127.0.0.1 --directory dashboard/versions/version_1.1
```

Then open `http://127.0.0.1:8766/`.
