import pytest
from src.tiresias_sovereign.principles.loader import load_registry

def test_registry_length():
    registry = load_registry()
    assert len(registry) == 12

def test_hash_chain_integrity():
    registry = load_registry()
    prev_hash = None
    for entry in registry:
        assert entry.get("prev_hash") == prev_hash
        prev_hash = entry.get("hash")
