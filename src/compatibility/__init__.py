"""
OpenClaw/NemoClaw/Nanoclaw Compatibility Layer.

Exports both the original environment adapters (for backwards compatibility)
and the new SoulAuth Universal Sidecar architecture.
"""

# Original adapters
from src.compatibility.adapter import (
    AgentExecutionContext,
    CompatibilityManager,
    EnvironmentAdapter,
    LegacySoulKeyAdapter,
    NanoclawAdapter,
    NemoClawAdapter,
    OpenClawAdapter,
)

# Sidecar architecture
from src.compatibility.adapter import (
    ActionReport,
    CapabilityResult,
    CLAWType,
    HealthStatus,
    InterceptMode,
    NanoClawSidecarAdapter,
    NemoClawSidecarAdapter,
    OpenClawSidecarAdapter,
    RegistrationResult,
    SidecarConfig,
    SidecarStatus,
    SoulAuthSidecar,
    UniversalCLAWInterface,
    ValidationResult,
    create_sidecar_adapter,
)

__all__ = [
    # Original adapters
    "AgentExecutionContext",
    "CompatibilityManager",
    "EnvironmentAdapter",
    "LegacySoulKeyAdapter",
    "NanoclawAdapter",
    "NemoClawAdapter",
    "OpenClawAdapter",
    # Sidecar architecture
    "ActionReport",
    "CapabilityResult",
    "CLAWType",
    "HealthStatus",
    "InterceptMode",
    "NanoClawSidecarAdapter",
    "NemoClawSidecarAdapter",
    "OpenClawSidecarAdapter",
    "RegistrationResult",
    "SidecarConfig",
    "SidecarStatus",
    "SoulAuthSidecar",
    "UniversalCLAWInterface",
    "ValidationResult",
    "create_sidecar_adapter",
]
