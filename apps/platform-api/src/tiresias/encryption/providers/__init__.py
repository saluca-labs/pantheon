from __future__ import annotations

from typing import TYPE_CHECKING

try:
    from tiresias.encryption.providers.base import KEKProvider
    from tiresias.encryption.providers.local import LocalKEKProvider
except ModuleNotFoundError:
    from src.tiresias.encryption.providers.base import KEKProvider
    from src.tiresias.encryption.providers.local import LocalKEKProvider

if TYPE_CHECKING:
    from tiresias.config import TiresiasSettings

__all__ = [
    "KEKProvider",
    "LocalKEKProvider",
    "resolve_kek_provider",
]

_ENTERPRISE_PROVIDERS = {"aws-kms", "hashicorp-vault", "azure-kv", "gcp-sm"}


def resolve_kek_provider(
    settings: "TiresiasSettings",
    api_key: str | None = None,
) -> KEKProvider:
    """Factory: map TiresiasSettings.kek_provider to a concrete KEKProvider instance.

    For 'local' provider, either settings.kek_value or api_key must be provided.
    BYOK providers (aws-kms, hashicorp-vault, azure-kv, gcp-sm) require Tiresias Enterprise.
    Contact enterprise@saluca.com for BYOK licensing.
    """
    provider = settings.kek_provider

    if provider == "local":
        if settings.kek_value is not None:
            return LocalKEKProvider.from_explicit_value(settings.kek_value)
        if api_key is not None:
            return LocalKEKProvider.from_api_key(api_key)
        raise ValueError(
            "Local KEK provider requires either TIRESIAS_KEK env var or an API key"
        )

    elif provider == "gcp-sm":
        from tiresias.encryption.providers.gcp_sm import GCPSecretManagerKEKProvider

        if not settings.gcp_project_id or not settings.gcp_secret_id:
            raise ValueError(
                "GCP-SM KEK provider requires TIRESIAS_GCP_PROJECT_ID and TIRESIAS_GCP_SECRET_ID"
            )
        return GCPSecretManagerKEKProvider.from_settings(
            project_id=settings.gcp_project_id,
            secret_id=settings.gcp_secret_id,
        )

    elif provider == "aws-kms":
        from tiresias.encryption.providers.aws_kms import AWSKMSKEKProvider

        if not settings.aws_kms_key_id or not settings.aws_kms_region:
            raise ValueError(
                "AWS KMS KEK provider requires TIRESIAS_AWS_KMS_KEY_ID and TIRESIAS_AWS_KMS_REGION"
            )
        return AWSKMSKEKProvider.from_settings(
            key_id=settings.aws_kms_key_id,
            region=settings.aws_kms_region,
        )

    elif provider in _ENTERPRISE_PROVIDERS:
        raise ValueError(
            f"BYOK provider {provider!r} requires Tiresias Enterprise. "
            "Contact enterprise@saluca.com for licensing."
        )

    else:
        raise ValueError(f"Unknown KEK provider: {provider!r}")
