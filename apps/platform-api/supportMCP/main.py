"""Entrypoint — HTTP by default, stdio with `--stdio`."""
from __future__ import annotations

import asyncio
import sys

from supportMCP.src.core.config import get_settings
from supportMCP.src.core.server import app, run_stdio


def main() -> None:
    if "--stdio" in sys.argv:
        asyncio.run(run_stdio())
        return
    import uvicorn

    s = get_settings()
    uvicorn.run(app, host=s.host, port=s.port, log_level=s.log_level.lower())


if __name__ == "__main__":
    main()
