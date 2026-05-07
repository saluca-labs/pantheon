# TIR-02: Embed principle registry and hash-chain loader

## Target paths
- src/tiresias_sovereign/principles/registry.json
- src/tiresias_sovereign/principles/loader.py
- tests/test_principle_registry.py

## Acceptance criteria
- APE/V: 12 entries, 4 categories; `TestPrincipleChainIntegrity` passes (every `prev_hash` = SHA-256 of prior canonical JSON); `/v1/policies` returns `bundle_sha256` + principles[12]

## Verification approach
- Unit tests `tests/test_principle_registry.py` confirm the registry contains exactly 12 principles and that the hash‑chain validation logic in `loader.py` succeeds.

## Risks
- Incorrect hash values would cause loader validation to fail, blocking deployment.
- Future changes to principle schema may require updating both JSON and loader logic.
