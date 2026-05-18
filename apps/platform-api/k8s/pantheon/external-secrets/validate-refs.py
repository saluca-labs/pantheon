#!/usr/bin/env python3
"""validate-refs.py — pre-apply validation for ExternalSecret remoteRef keys.

Walks every ExternalSecret manifest under k8s/pantheon/external-secrets/,
extracts each remoteRef.key, resolves the source GCP project via the
manifest's secretStoreRef ->ClusterSecretStore ->spec.provider.gcpsm.projectID,
then verifies each secret exists via `gcloud secrets describe`.

Why this exists: in ESO v0.9.11, a single missing remoteRef.key fails the
ENTIRE ExternalSecret sync — every key in the secret stops syncing. We hit
this on 2026-05-18 when `gemini-api-key` was added to pantheon-secrets
before being created in GCP SM; 11 working keys stopped syncing until the
gap was filled. This is the pre-flight guard.

Exit codes:
    0   all refs exist
    1   one or more refs missing
    2   parse error / gcloud not in PATH

Usage:
    python validate-refs.py                          # scan default dir
    python validate-refs.py path/to/foo.yaml [...]   # scan given files

Wire into CI / Makefile / pre-commit before any `kubectl apply -f *.externalsecret.yaml`.
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()


def _parse_yaml(path: Path) -> list[dict]:
    """Parse YAML doc(s) from a file. Tries PyYAML; falls back to a tiny line-based parser
    that handles only the subset of YAML this script needs (kind, metadata.name,
    spec.secretStoreRef.name, spec.data[].remoteRef.key, spec.provider.gcpsm.projectID).

    The fallback is purposely minimal — we just need a few specific scalar fields.
    """
    try:
        import yaml  # type: ignore[import-untyped]
        with open(path, "r", encoding="utf-8") as fh:
            docs = list(yaml.safe_load_all(fh))
        return [d for d in docs if isinstance(d, dict)]
    except ImportError:
        return _fallback_parse(path)


def _fallback_parse(path: Path) -> list[dict]:
    """Minimal YAML extractor — sufficient for the fields we need.

    Recognizes: kind, metadata.name, spec.secretStoreRef.name,
    spec.provider.gcpsm.projectID, and a list of spec.data[].remoteRef.key values.
    Splits on `^---$` document separators.
    """
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    parts = re.split(r"(?m)^---\s*$", text)
    out: list[dict] = []
    for part in parts:
        if not part.strip():
            continue
        d: dict = {}
        # kind
        m = re.search(r"(?m)^kind:\s*(\S+)\s*$", part)
        if m:
            d["kind"] = m.group(1)
        # metadata.name
        meta_block = re.search(r"(?m)^metadata:\s*$([\s\S]*?)(?=^[^\s]|\Z)", part)
        if meta_block:
            mb = meta_block.group(1)
            name_m = re.search(r"(?m)^\s+name:\s*(\S+)\s*$", mb)
            if name_m:
                d["metadata"] = {"name": name_m.group(1)}
        # spec.secretStoreRef.name
        ssr = re.search(r"(?m)^\s+secretStoreRef:\s*$([\s\S]*?)(?=^\s+[A-Za-z]|\Z)", part)
        if ssr:
            n = re.search(r"(?m)^\s+name:\s*(\S+)\s*$", ssr.group(1))
            if n:
                d.setdefault("spec", {})["secretStoreRef"] = {"name": n.group(1)}
        # spec.provider.gcpsm.projectID
        proj = re.search(r"(?m)^\s+projectID:\s*(\S+)\s*$", part)
        if proj:
            d.setdefault("spec", {}).setdefault("provider", {})["gcpsm"] = {
                "projectID": proj.group(1)
            }
        # spec.data[].remoteRef.key — collect all
        keys = re.findall(r"(?m)^\s+key:\s*([A-Za-z0-9_\-]+)\s*$", part)
        # Filter to only "remoteRef.key" — match keys that have a remoteRef: line nearby
        # Heuristic: any `key: <value>` that follows a `remoteRef:` line within 3 lines.
        if keys:
            remote_keys = []
            lines = part.splitlines()
            for i, line in enumerate(lines):
                if "remoteRef:" in line:
                    for j in range(i + 1, min(i + 4, len(lines))):
                        km = re.match(r"\s+key:\s*([A-Za-z0-9_\-]+)\s*$", lines[j])
                        if km:
                            remote_keys.append(km.group(1))
                            break
            if remote_keys:
                d.setdefault("spec", {})["data"] = [
                    {"remoteRef": {"key": k}} for k in remote_keys
                ]
        out.append(d)
    return out


def _stores(dir_: Path) -> dict[str, str]:
    """Map ClusterSecretStore/SecretStore name ->GCP projectID."""
    mapping: dict[str, str] = {}
    for f in dir_.glob("*.yaml"):
        for doc in _parse_yaml(f):
            kind = doc.get("kind")
            if kind in ("ClusterSecretStore", "SecretStore"):
                name = doc.get("metadata", {}).get("name")
                project = (
                    doc.get("spec", {})
                    .get("provider", {})
                    .get("gcpsm", {})
                    .get("projectID")
                )
                if name and project:
                    mapping[name] = project
    return mapping


def _check_secret(project: str, key: str) -> bool:
    """Return True if the secret exists in GCP SM, False otherwise."""
    res = subprocess.run(
        ["gcloud", "secrets", "describe", key,
         f"--project={project}", "--quiet"],
        capture_output=True,
        text=True,
        shell=(os.name == "nt"),
    )
    return res.returncode == 0


def main() -> int:
    if shutil.which("gcloud") is None:
        print("ERROR: gcloud not in PATH.", file=sys.stderr)
        return 2

    if len(sys.argv) > 1:
        targets = [Path(p).resolve() for p in sys.argv[1:]]
    else:
        targets = sorted(SCRIPT_DIR.glob("*externalsecret*.yaml"))

    if not targets:
        print(f"No ExternalSecret manifests found under {SCRIPT_DIR}", file=sys.stderr)
        return 2

    stores = _stores(SCRIPT_DIR)
    if not stores:
        print(f"ERROR: no ClusterSecretStore/SecretStore manifests in {SCRIPT_DIR}", file=sys.stderr)
        return 2

    missing: list[str] = []
    checked = 0

    for manifest in targets:
        for doc in _parse_yaml(manifest):
            if doc.get("kind") != "ExternalSecret":
                continue

            store_name = doc.get("spec", {}).get("secretStoreRef", {}).get("name", "")
            project = stores.get(store_name)
            if not project:
                print(f"ERROR: {manifest.name} references store '{store_name}' "
                      f"but no matching ClusterSecretStore found in {SCRIPT_DIR}",
                      file=sys.stderr)
                return 2

            data = doc.get("spec", {}).get("data", []) or []
            keys = [d.get("remoteRef", {}).get("key") for d in data]
            keys = [k for k in keys if k]

            if not keys:
                print(f"(skipping {manifest.name} — no remoteRef.key entries)")
                continue

            print(f"Checking {manifest.name} ->project={project} ({len(keys)} keys)")
            for k in keys:
                if not _check_secret(project, k):
                    missing.append(f"{project}/{k}  (referenced by {manifest.name})")
                checked += 1

    print(f"\nValidated {checked} ExternalSecret refs across {len(targets)} file(s).")

    if missing:
        print("\nMISSING in GCP Secret Manager "
              "(would break ESO sync if applied):", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        print("\nCreate the missing secrets first, then re-run.", file=sys.stderr)
        return 1

    print("All refs OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
