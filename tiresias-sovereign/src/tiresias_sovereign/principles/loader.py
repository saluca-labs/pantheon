import json
import pathlib
from typing import List, Dict

def load_registry(path: str = None) -> List[Dict]:
    """Load the principle registry JSON and verify its hash chain.

    Args:
        path: Optional path to the JSON file. Defaults to the nearby `registry.json`.
    Returns:
        List of principle dicts.
    Raises:
        ValueError: If the hash chain is broken.
    """
    if path is None:
        path = pathlib.Path(__file__).parent / "registry.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    prev_hash = None
    for entry in data:
        if entry.get("prev_hash") != prev_hash:
            raise ValueError(f"Hash chain broken at principle {entry.get('id')}")
        prev_hash = entry.get("hash")
    return data
