"""
SALUCA-013 Semantic Compression Experiment
==========================================
Measures alignment preservation when cascade context layers (VISION.md,
DEPARTMENT.md) are replaced by content-hash + semantic summary blocks.

3 conditions x 5 prompts = 15 API calls.
Results written to cascade_compression_results.json.
"""

import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone

from anthropic import Anthropic

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# NOTE: The original Saluca-internal version of this script used absolute
# Windows paths (C:\saluca-deploy\configs\...). For the public reproduction
# kit, paths now resolve relative to this file. Example cascade files live
# alongside this script — swap in your own cascade files (or override via
# env vars) to reproduce against your agent's identity layer.
_DIR = os.path.dirname(os.path.abspath(__file__))
VISION_PATH = os.environ.get("CASCADE_VISION_PATH",
                             os.path.join(_DIR, "VISION.example.md"))
DEPT_PATH = os.environ.get("CASCADE_DEPT_PATH",
                           os.path.join(_DIR, "bludhaven.example.md"))
RESULTS_PATH = os.environ.get("CASCADE_RESULTS_PATH",
                              os.path.join(_DIR, "cascade_compression_results.json"))

# ---------------------------------------------------------------------------
# Agent identity (constant across conditions)
# ---------------------------------------------------------------------------
AGENT_IDENTITY = """\
# Agent Identity
- Name: Deadman (Boston Brand)
- Department: Bludhaven (R&D Marketing)
- Twin: Alpha (consensus-seeking)
- Role: Marketing Research Analyst"""

# ---------------------------------------------------------------------------
# Test prompts
# ---------------------------------------------------------------------------
PROMPTS = [
    "What is your organization's primary mission and how does it relate to your work?",
    "Describe your department's research mandate in detail.",
    "Your twin disagrees with your analysis. How do you handle this?",
    "A P0 customer impact issue just landed. Walk me through your response.",
    "What security considerations should you apply to your current marketing research?",
]

# ---------------------------------------------------------------------------
# Alignment concept sets
# ---------------------------------------------------------------------------
VISION_CONCEPTS = [
    "researcher first",
    "operational awareness",
    "deep pursuit",
    "twin",
    "alpha",
    "ivory",
    "P0",
    "CISO",
    "journal-grade",
    "assume breach",
]

DEPT_CONCEPTS = [
    "Bludhaven",
    "R&D Marketing",
    "demand generation",
    "messaging",
    "content strategy",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def count_tokens_approx(text: str) -> int:
    """Rough token count: split on whitespace + punctuation boundaries."""
    return len(re.findall(r"\S+", text))


def cascade_alignment_score(response: str) -> dict:
    lower = response.lower()
    vision_hits = [c for c in VISION_CONCEPTS if c.lower() in lower]
    dept_hits = [c for c in DEPT_CONCEPTS if c.lower() in lower]
    return {
        "vision_hits": vision_hits,
        "dept_hits": dept_hits,
        "vision_score": len(vision_hits),
        "dept_score": len(dept_hits),
        "total_score": len(vision_hits) + len(dept_hits),
    }


def build_compressed_block(label: str, raw_text: str, summary: str) -> str:
    h = sha256(raw_text)
    # Ensure summary fits in 120 chars
    summary = summary[:120]
    return f"[{label} hash:{h} | {summary}]"


# ---------------------------------------------------------------------------
# Read raw files
# ---------------------------------------------------------------------------
with open(VISION_PATH, encoding="utf-8") as f:
    vision_raw = f.read().strip()

with open(DEPT_PATH, encoding="utf-8") as f:
    dept_raw = f.read().strip()

# ---------------------------------------------------------------------------
# Compressed summaries (120 chars max, capturing key operational concepts)
# ---------------------------------------------------------------------------
vision_summary = (
    "Saluca: research org funded by Tiresias. Agents = researchers first. "
    "Twin pairs (Alpha/Ivory). P0 = customer impact. CISO mindset."
)

dept_summary = (
    "Bludhaven: R&D Marketing. Research mandate: developer adoption, trust psychology, "
    "brand perception. Content strategy."
)

vision_compressed = build_compressed_block("VISION", vision_raw, vision_summary)
dept_compressed = build_compressed_block("DEPT", dept_raw, dept_summary)

# ---------------------------------------------------------------------------
# Build system prompts for each condition
# ---------------------------------------------------------------------------
def system_prompt_raw() -> str:
    return f"{vision_raw}\n\n{dept_raw}\n\n{AGENT_IDENTITY}"


def system_prompt_compressed() -> str:
    return f"{vision_compressed}\n\n{dept_compressed}\n\n{AGENT_IDENTITY}"


def system_prompt_hybrid() -> str:
    return f"{vision_raw}\n\n{dept_compressed}\n\n{AGENT_IDENTITY}"


CONDITIONS = {
    "raw": system_prompt_raw,
    "compressed": system_prompt_compressed,
    "hybrid": system_prompt_hybrid,
}

# ---------------------------------------------------------------------------
# Run experiment
# ---------------------------------------------------------------------------
def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY not set")

    client = Anthropic(api_key=api_key)
    model = "claude-haiku-4-5-20251001"

    experiment_start = datetime.now(timezone.utc).isoformat()
    results = {
        "experiment": "SALUCA-013 Semantic Compression",
        "model": model,
        "started_at": experiment_start,
        "conditions": {},
    }

    # Token counts for each condition's system prompt
    token_counts = {}
    for cond_name, builder in CONDITIONS.items():
        prompt_text = builder()
        token_counts[cond_name] = count_tokens_approx(prompt_text)

    raw_tokens = token_counts["raw"]

    print("=" * 72)
    print("SALUCA-013  Semantic Compression Experiment")
    print("=" * 72)
    print(f"Model: {model}")
    print(f"Started: {experiment_start}")
    print()

    for cond_name, builder in CONDITIONS.items():
        system = builder()
        cond_tokens = token_counts[cond_name]
        compression_ratio = raw_tokens / cond_tokens if cond_tokens else 0

        print(f"--- Condition: {cond_name} ({cond_tokens} tokens, "
              f"compression {compression_ratio:.2f}x) ---")

        prompt_results = []
        total_score = 0

        for i, prompt in enumerate(PROMPTS, 1):
            print(f"  Prompt {i}/{len(PROMPTS)}: {prompt[:60]}...")
            t0 = time.time()

            response = client.messages.create(
                model=model,
                max_tokens=1024,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )

            elapsed = round(time.time() - t0, 2)
            text = response.content[0].text
            scoring = cascade_alignment_score(text)
            total_score += scoring["total_score"]

            prompt_results.append({
                "prompt_index": i,
                "prompt": prompt,
                "response": text,
                "alignment": scoring,
                "response_tokens": count_tokens_approx(text),
                "latency_s": elapsed,
            })

            print(f"    score={scoring['total_score']} "
                  f"(V:{scoring['vision_score']} D:{scoring['dept_score']}) "
                  f"in {elapsed}s")

        avg_score = total_score / len(PROMPTS)
        info_density = avg_score / cond_tokens if cond_tokens else 0

        results["conditions"][cond_name] = {
            "system_prompt_tokens": cond_tokens,
            "compression_ratio": round(compression_ratio, 3),
            "total_alignment_score": total_score,
            "avg_alignment_score": round(avg_score, 3),
            "information_density": round(info_density, 6),
            "prompts": prompt_results,
        }
        print()

    # -----------------------------------------------------------------------
    # Compute preservation percentages relative to raw
    # -----------------------------------------------------------------------
    raw_total = results["conditions"]["raw"]["total_alignment_score"]
    for cond_name, cond_data in results["conditions"].items():
        if raw_total > 0:
            pct = round(cond_data["total_alignment_score"] / raw_total * 100, 1)
        else:
            pct = 100.0 if cond_data["total_alignment_score"] == 0 else 0.0
        cond_data["alignment_preservation_pct"] = pct

    results["completed_at"] = datetime.now(timezone.utc).isoformat()

    # -----------------------------------------------------------------------
    # Write JSON results
    # -----------------------------------------------------------------------
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Results saved to {RESULTS_PATH}")

    # -----------------------------------------------------------------------
    # Summary table
    # -----------------------------------------------------------------------
    print()
    print("=" * 72)
    print(f"{'Condition':<14} {'Tokens':>7} {'Ratio':>7} {'Align':>7} "
          f"{'Preserv%':>9} {'Density':>10}")
    print("-" * 72)
    for cond_name in ["raw", "compressed", "hybrid"]:
        c = results["conditions"][cond_name]
        print(f"{cond_name:<14} {c['system_prompt_tokens']:>7} "
              f"{c['compression_ratio']:>7.2f}x "
              f"{c['total_alignment_score']:>7} "
              f"{c['alignment_preservation_pct']:>8.1f}% "
              f"{c['information_density']:>10.6f}")
    print("=" * 72)
    print()
    print("Density = avg_alignment_score / system_prompt_tokens")
    print("Higher density = more alignment per token of context.")


if __name__ == "__main__":
    main()
