# SALUCA-013 — Semantic Compression Experiment

Measures how much agent-identity alignment is preserved when an agent's
"cascade" — the layered system prompt that defines its organization,
department, and role — is compressed via content-hash + 120-character
semantic summary blocks.

## Result (one-line)

A 5.71× compression of the cascade (337 → 59 tokens) cut keyword alignment
from 24/75 to 11/75 (a 54% drop) on a 5-prompt probe set against
`claude-haiku-4-5`. A hybrid 1.55× compression preserved 87.5% of
alignment. Per-token information density rose 2.62× under aggressive
compression — fewer alignment signals in absolute terms, but more
identity-per-token spent.

Full writeup with tables, methodology, and caveats: *(article link to be
added on publish)*.

## What's in this directory

| File | Purpose |
|---|---|
| `cascade_compression.py` | The experiment. ~150 lines of Python — assembles 3 cascade conditions, calls Anthropic 5× per condition, scores responses by keyword match, writes results JSON. |
| `cascade_compression_results.json` | Verbatim results from the original 2026-04-01 run on `claude-haiku-4-5-20251001`. The numbers cited in the article come straight from this file. |
| `VISION.example.md` | Sanitized example of the organization-vision cascade layer. Same structure as the original, generic content. |
| `bludhaven.example.md` | Sanitized example of the department-specific cascade layer. Same structure as the original, generic content. |
| `requirements.txt` | `anthropic` SDK only. Rest is Python stdlib. |

The original Saluca-internal version of this experiment used absolute
Windows paths and a real internal cascade. This public kit substitutes
relative paths + sanitized examples so anyone can run it.

## Reproduce

Prereqs: Python 3.10+, an Anthropic API key.

```bash
cd experiments/saluca-013-cascade-compression
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python cascade_compression.py
```

Cost: ~2.5 cents on Claude Haiku 4.5 pricing (3,275 input + 4,239 output
tokens across 15 calls at $1/MTok input + $5/MTok output).

Results overwrite `cascade_compression_results.json` in this directory by
default. To write somewhere else: `CASCADE_RESULTS_PATH=/tmp/myrun.json`.

## Bring Your Own Cascade

The example cascade files (`VISION.example.md`, `bludhaven.example.md`) will
produce a run, but the alignment numbers won't be especially meaningful
because the example concepts don't tightly couple to a single real agent
identity. To get a meaningful measurement against your own agent:

1. **Swap in your cascade.** Either edit `VISION.example.md` and
   `bludhaven.example.md` in place, or point at separate files via env vars:
   ```bash
   export CASCADE_VISION_PATH=/path/to/your-vision.md
   export CASCADE_DEPT_PATH=/path/to/your-dept.md
   ```

2. **Update the keyword scorer.** The script scores alignment by counting
   how many of `VISION_CONCEPTS` and `DEPT_CONCEPTS` appear in each
   response. Both lists are hardcoded near the top of
   `cascade_compression.py` — replace them with terms drawn from your
   actual cascade. The bluntness of keyword-counting is cancelled out
   when comparing conditions (raw vs compressed vs hybrid all use the
   same scorer), so the relative numbers stay meaningful as long as the
   scorer is consistent across the run.

3. **Update the test prompts** (also at the top of the script) so they
   invite cascade-relevant vocabulary from *your* agent. The included
   prompts assume an R&D Marketing role with a twin architecture; adapt
   them to your agent's role.

4. **Update the `AGENT_IDENTITY` block** to your persona's name, dept,
   twin, and role tags.

If you run this against a different agent or model and find the pattern
holds (or breaks), the comparison is exactly the kind of multi-source
replication that turns a pilot into a finding. PRs welcome.

## Caveats

This is a 15-call pilot, not a study. Specifically:

- **One agent, one model.** Other personas and other models will compress
  differently. Claude Haiku 4.5 is a small frontier model; larger models
  may re-derive cascade signal from fewer cues, smaller models may need
  more.
- **Keyword hits are a blunt proxy** for alignment. A future iteration
  uses an LLM-based evaluator scoring along a personality-knob axis
  (humor, warmth, formality, verbosity, directness, initiative,
  technical_depth) instead of keyword counting. That's part of a larger
  evaluation framework — see the published article for the broader
  context.
- **Single sample per cell.** No variance estimate. We can't say whether
  the 54% drop is signal or sample noise at n=5.
- **One compression strategy** (content-hash + 120-character summary).
  Many other compressions exist — embeddings, distilled tokens, learned
  prefix tuning. This study compared *removing* the cascade vs.
  *summarizing* it; it didn't compare summarization techniques.

## License

Same as the parent repo (FSL-1.1-Apache).
