"""Shared fixtures for the matrix-bridge appservice tests.

License: Apache-2.0.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from matrix_bridge.config import AppserviceConfig
from matrix_bridge.main import create_app


@pytest.fixture
def hs_token() -> str:
    return "test-hs-token-not-a-real-secret-1234567890"


@pytest.fixture
def as_token() -> str:
    return "test-as-token-not-a-real-secret-1234567890"


@pytest.fixture
def config(hs_token: str, as_token: str) -> AppserviceConfig:
    return AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        synapse_url="http://synapse-test:8008",
        soulwatch_url=None,  # forwarder no-ops in tests by default
        platform_api_url=None,
    )


@pytest.fixture
def client(config: AppserviceConfig) -> TestClient:
    app = create_app(config=config)
    return TestClient(app)
