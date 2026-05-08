"""Backend protocol — every secret provider implements this surface."""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class SecretsBackend(Protocol):
    """Minimal contract for a secret provider.

    Implementations must be threadsafe (the facade caches one instance per
    scheme and invokes ``get`` from any thread). They MAY cache values
    internally, but should respect ``no_cache=True`` when supplied.
    """

    #: Lowercase scheme this backend handles, e.g. ``"vault"``, ``"awssm"``.
    scheme: str

    def get(self, path: str, *, no_cache: bool = False) -> Optional[str]:
        """Look up a secret by its (scheme-stripped) path.

        ``path`` is the portion of the reference *after* ``<scheme>://``.
        Implementations may further parse the path according to their own
        conventions (e.g. ``secret/data/foo#field`` for Vault).

        Returns ``None`` when the secret cannot be found; raises
        ``SecretBackendError`` when the backend itself is unreachable or
        misconfigured.
        """
        ...
