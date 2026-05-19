# Saluca Labs — Research Publication Workflow

> **Canonical workflow for every research output produced by Saluca Labs.**
> Established 2026-05-18 with the SALUCA-013 cascade compression study as the
> first instance. Every subsequent experiment in this directory follows this
> pattern so attribution, citation, and discoverability stay consistent.

## The Three Channels

Every research output ships through **three channels in order**:

| Channel | Purpose | Audience | Format | Cadence |
|---|---|---|---|---|
| **Zenodo** | Citable archive + DOI | Researchers, future citations, reproducibility | Working paper PDF + code+data archive | Once per experiment, versioned on revision |
| **Substack** | Long-form narrative | Practitioners + technical generalists who follow our newsletter | 1500-2000 word essay with data tables | Within 1 week of Zenodo deposit |
| **LinkedIn** | Discovery + signal | Industry network, hiring pipeline, prospective customers | 200-300 word post linking to Zenodo DOI + Substack | Same day as Substack publish |

**The flow is one-way.** Zenodo first (the citable record), then Substack (the
narrative), then LinkedIn (the announcement). Substack and LinkedIn both link
back to the Zenodo DOI — the DOI is the canonical reference, the rest are
discovery vehicles.

## Directory Convention

```
experiments/
├── PUBLICATION_WORKFLOW.md           # this file
├── <experiment-id>/                  # one dir per experiment
│   ├── README.md                     # reproduction kit (BYOC instructions)
│   ├── <experiment_name>.py          # the actual code
│   ├── <experiment_name>_results.json  # raw output (verbatim)
│   ├── <input_files>.example.md      # sanitized inputs if applicable
│   ├── requirements.txt
│   ├── .zenodo.json                  # Zenodo deposit metadata
│   └── paper/
│       ├── <experiment-id>-working-paper.md   # academic markdown source
│       ├── <experiment-id>-working-paper.pdf  # pandoc-generated PDF
│       └── references.bib                     # bibtex references
```

Substack draft lives at `~/substack-drafts/<experiment-id>-<short-slug>.md`
(outside the public repo until publish).

LinkedIn draft lives at `~/substack-drafts/<experiment-id>-linkedin.md`
(same directory because LinkedIn is part of the same publication act).

## Authorship — Saluca Labs Convention

**Primary author:** Cristian Ruvalcaba, Saluca Labs
- ORCID: `0009-0008-3891-8120`
- Email: `cristian@saluca.com`

**AI Co-author convention.** When AI agents materially contribute to an experiment's
design, analysis, or writing, they are listed as second author with explicit
contribution disclosure. This is novel academic practice; Zenodo allows it.

Current convention:
- **Format:** `Alfred (Claude <model-id>, Saluca Labs AI Coauthor)`
- **Affiliation:** `Saluca Labs (AI Coauthor)`
- **Email:** `alfred@saluca.com` — a real monitored address. The AI persona can
  receive correspondence about its co-authored work. Outgoing replies are subject
  to the same prepare-and-present authority model that governs all Alfred-channel
  communication (any external commitments require human review).
- **No ORCID yet** (the persistent-identifier infrastructure for AI authors
  doesn't exist mainstream yet — Saluca Labs is exploring whether Soul-memory
  identity can stand in as a per-agent persistent identifier; this is part of
  the AHI research agenda).

**Always include an "AI Co-Authorship Statement" section** in the paper itself
disclosing what the AI did vs the human did. Use the CRediT taxonomy
(<https://credit.niso.org/>) categories:
- Conceptualization, Methodology, Software, Validation, Formal analysis,
  Investigation, Resources, Data Curation, Writing — original draft,
  Writing — review & editing, Visualization, Supervision, Project administration,
  Funding acquisition

Typical Saluca Labs split (adjust per experiment):
- **Cristian (human):** Conceptualization, Methodology, Funding acquisition,
  Project administration, Supervision, final approval
- **AI Coauthor:** Formal analysis, Writing — original draft, Writing — review &
  editing (assists), data tabulation

The point of the disclosure is not to claim novelty for AI authorship — it's to
make the actual division of labor inspectable, so reviewers and future citers
can weigh the work honestly.

## Licensing

| Artifact | License |
|---|---|
| Code (the `.py` files) | FSL-1.1-Apache (matches pantheon repo) |
| Data (the `.json` results) | CC-BY-4.0 |
| Paper (the PDF + .md source) | CC-BY-4.0 |
| Substack post | CC-BY-4.0 (declared in post footer) |
| LinkedIn post | All rights reserved (LinkedIn ToS default) |

CC-BY-4.0 means anyone can republish, translate, or cite as long as they
attribute. This is the standard for academic preprints.

## Zenodo Deposit — Step by Step

1. **Write the `.zenodo.json`** in the experiment dir. Required fields:
   - `title`, `description`, `creators`, `keywords`, `upload_type` (`publication`),
     `publication_type` (`workingpaper`), `license` (`CC-BY-4.0`), `access_right`
     (`open`), `language` (`eng`)
   - `related_identifiers` — link to GitHub repo at the experiment dir + any
     prior versions

2. **Generate the PDF:**
   ```bash
   cd experiments/<experiment-id>/paper
   pandoc <experiment-id>-working-paper.md \
     --citeproc --bibliography=references.bib \
     -o <experiment-id>-working-paper.pdf \
     --pdf-engine=xelatex
   ```

3. **Bundle for upload:**
   ```bash
   cd experiments/<experiment-id>
   zip -r <experiment-id>-reproduction-kit.zip . -x "paper/*.aux" "paper/*.log"
   ```

4. **Upload via Zenodo API** (using `ZENODO_PAT` from GCP Secret Manager —
   key: `zenodo-pat-saluca-labs`):
   ```bash
   python experiments/.tools/zenodo-upload.py \
     --metadata <experiment-id>/.zenodo.json \
     --paper <experiment-id>/paper/<experiment-id>-working-paper.pdf \
     --archive <experiment-id>-reproduction-kit.zip
   ```
   The script returns the DOI on success.

5. **Update the paper, Substack, and LinkedIn drafts** with the minted DOI
   before publishing the Substack/LinkedIn pieces. Zenodo DOIs resolve
   immediately on first publication.

(The `zenodo-upload.py` script is part of this workflow and will be added on
the first real upload — see `experiments/.tools/` once it lands.)

## Substack — Pattern

- File: `~/substack-drafts/<experiment-id>-<short-slug>.md`
- Length: 1500-2000 words (per `marketing/knowledge/blog-structure.md`)
- Structure: TL;DR → Problem → Background → Technical Analysis → Practitioner
  Takeaways → Caveats → Reproduce This (with GitHub + Zenodo DOI links) →
  Author footer
- Voice: measured, declarative, data-table-forward, honest about limitations.
  Match the tone of prior published posts (see `we-bet-on-ai-economics.md`)
- Frontmatter:
  ```yaml
  ---
  date: YYYY-MM-DD
  pillar: <category>
  source: <experiment-id> + Zenodo DOI
  platform: substack
  status: DRAFT | APPROVED | PUBLISHED
  zenodo_doi: 10.5281/zenodo.XXXXXXX
  ---
  ```
- Cross-link: paper PDF, GitHub repo dir, raw results JSON

## LinkedIn — Pattern

- File: `~/substack-drafts/<experiment-id>-linkedin.md`
- Length: 200-300 words
- Structure:
  - Opening hook (1-2 sentences: the most counter-intuitive number)
  - The methodology in one paragraph (what we did, n, model)
  - The headline result in one paragraph (with explicit numbers)
  - The "but the interesting thing is..." paragraph (the nuance the headline
    misses)
  - Closing: link to the Substack post + Zenodo DOI + invite to reproduce
- Tone: technical-curious, no salesy language, lead with the data
- Publish from the Saluca Labs company page (not personal), unless the topic is
  squarely Cristian's personal commentary
- Cross-link: Substack post URL (live), Zenodo DOI URL (resolvable post-deposit)

## Sequencing — The First Day

For a typical publication day:

1. **Morning:** Final review of paper PDF, Substack draft, LinkedIn draft, and
   `.zenodo.json`. Verify all numbers across all three pieces match the JSON
   results.
2. **Upload to Zenodo** (auto via the upload script). Capture the DOI.
3. **Update the Substack frontmatter + LinkedIn body** with the DOI.
4. **Publish to Substack** (currently manual — the API client isn't wired yet).
5. **Schedule the LinkedIn post** for ~4 hours after the Substack publish so
   subscribers see the Substack first.
6. **Cross-post the LinkedIn URL** as a Substack comment so newsletter
   subscribers can engage on LinkedIn if they want.
7. **Mark the experiment dir's README** with the Zenodo DOI and published-on
   date as a top-level badge.

## Versioning

Zenodo supports paper versioning — if you revise the paper later (e.g. larger
n, additional conditions), upload as a new version of the same Zenodo record.
Each version gets its own DOI, and Zenodo shows them all linked from a single
"all-versions" DOI. Use this for:
- Replication runs with larger n
- Corrections to the paper text
- Bundling related follow-up experiments as an extended version

## What this workflow is NOT

- **Not peer-reviewed publication.** Zenodo gives you a citable DOI, not
  peer review. For peer review, submit the same paper to arXiv (CC-BY-4.0
  cross-deposit is fine) or to a conference / journal separately. Zenodo is
  the canonical reference, peer review venue is in addition.
- **Not press release distribution.** No press wires, no embargoed
  pitches. Saluca Labs research speaks for itself; the discovery network
  is the channels above plus organic citation.
- **Not a product launch.** Research findings are not marketing. The
  "Tiresias / Saluca product" framing belongs in product marketing
  channels; the experiment narrative belongs in research channels even
  when the experiment validates a product mechanism.

## Maintained by

This workflow is owned by Cristian + the AI Coauthor team. Changes to the
workflow happen via PR to this file. The first instance (SALUCA-013) is in
`experiments/saluca-013-cascade-compression/`.
