import os
import sys
from pathlib import Path

# Make repo root importable as `supportMCP.*`.
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test/test")
