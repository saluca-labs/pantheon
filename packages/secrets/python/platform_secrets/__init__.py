"""Production secret-management facade for the @platform stack.

This package provides a uniform interface for resolving secret references
across multiple backends: environment variables (default), file mounts
(Docker/Kubernetes), HashiCorp Vault, AWS Secrets Manager, and GCP
Secret Manager.

The facade intentionally has zero hard dependencies on cloud SDKs — each
provider is loaded lazily on first use. Apps that only need env-var
resolution incur no extra install footprint.

Quick start
-----------

>>> from platform_secrets import resolve, configure
>>> # Default: returns env-var value if it exists, otherwise the literal
>>> resolve("DATABASE_URL")
'postgres://...'
>>>
>>> # Reference syntax: backend prefix selects the provider
>>> resolve("vault://secret/data/platform/db#password")
'<vault-managed value>'
>>>
>>> # Resolve a whole settings dict, replacing secret refs in-place
>>> from platform_secrets import resolve_mapping
>>> resolve_mapping({"DATABASE_URL": "vault://secret/data/db#url"})
{'DATABASE_URL': '<resolved>'}

The ``configure(...)`` call lets ops bind credentials/region/namespace
once at process start; subsequent ``resolve(...)`` calls reuse them.
"""

from platform_secrets.errors import (
    SecretBackendError,
    SecretNotFoundError,
    SecretReferenceError,
)
from platform_secrets.facade import (
    SecretsFacade,
    configure,
    get_facade,
    is_secret_reference,
    resolve,
    resolve_mapping,
)
from platform_secrets.protocol import SecretsBackend

__all__ = [
    "SecretBackendError",
    "SecretNotFoundError",
    "SecretReferenceError",
    "SecretsBackend",
    "SecretsFacade",
    "configure",
    "get_facade",
    "is_secret_reference",
    "resolve",
    "resolve_mapping",
]
