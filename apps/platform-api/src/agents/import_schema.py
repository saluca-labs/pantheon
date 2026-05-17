"""Pydantic models for the agent.yaml import payload (W-H.2.f).

Schema reference: :doc:`agent_yaml_schema.md` (sibling markdown file).

Strict validation:
  * ``model_config = ConfigDict(extra="forbid")`` on every top-level model
    so unknown keys are rejected with a clear path. Sub-objects that mirror
    looser legacy YAML structures (``resources``, ``model_policies``,
    ``jit``, ``escalation``) use ``extra="allow"`` because the
    :mod:`src.policy.loader` classes are intentionally permissive — we
    keep them as-is to avoid double-validating the existing PDP contract.

Per-field validation lives in pydantic validators; cross-field validation
(e.g. ``metadata.tenant`` vs caller's tenant slug, ``secret_ref`` scheme
support) happens in :mod:`src.agents.import_router` so the validator has
access to the request context.

Error reporting:
  :func:`format_validation_errors` flattens a ``pydantic.ValidationError``
  into the wire format documented in ``agent_yaml_schema.md`` —
  ``[{path: ..., message: ...}, ...]`` — keyed on the JSON path so the UI
  can map errors back to inputs.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


# Provider names accepted by ``spec.provider_overrides[*].provider``. Mirrors
# :const:`src.agents.provider_keys_store.SUPPORTED_PROVIDERS` but kept as a
# constant here to avoid a circular import at module load time.
_SUPPORTED_PROVIDERS = ("anthropic", "openai", "gemini", "groq", "ollama")
_VALID_PROVIDER_STATUSES = ("active", "disabled")
_VALID_PROMPT_STATUSES = ("draft", "active", "deprecated")
_VALID_AGENT_STATUSES = ("active", "draft", "archived")


# ---------------------------------------------------------------------------
# Sub-blocks
# ---------------------------------------------------------------------------


class AgentMetadata(BaseModel):
    """``metadata`` block of an agent.yaml import payload."""

    model_config = ConfigDict(extra="forbid")

    persona: str = Field(..., min_length=1, description="Natural key (per-tenant unique)")
    tenant: Optional[str] = Field(
        None,
        description=(
            "Optional tenant slug. If present, MUST match caller's tenant slug; "
            "if absent, the caller's tenant is used."
        ),
    )
    name: Optional[str] = Field(
        None, description="Display name (defaults to persona on import)"
    )
    description: Optional[str] = None
    role: Optional[str] = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("persona")
    @classmethod
    def _persona_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("required")
        return v.strip()


class AgentPromptSpec(BaseModel):
    """``spec.prompt`` block — DB-canonical prompt body."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1)
    body: str
    version: Optional[int] = Field(1, ge=1)
    status: Optional[str] = Field("active")

    @field_validator("body")
    @classmethod
    def _body_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("cannot be empty when spec.prompt is present")
        return v

    @field_validator("status")
    @classmethod
    def _status_in_set(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in _VALID_PROMPT_STATUSES:
            raise ValueError(
                f"must be one of {list(_VALID_PROMPT_STATUSES)}, got {v!r}"
            )
        return v


class AgentProviderOverride(BaseModel):
    """One entry in ``spec.provider_overrides[]`` — a BYOK row."""

    model_config = ConfigDict(extra="forbid")

    provider: str
    secret_ref: str
    base_url: Optional[str] = None
    status: Optional[str] = Field("active")

    @field_validator("provider")
    @classmethod
    def _provider_supported(cls, v: str) -> str:
        norm = (v or "").lower().strip()
        if norm not in _SUPPORTED_PROVIDERS:
            raise ValueError(
                f"must be one of {list(_SUPPORTED_PROVIDERS)}, got {v!r}"
            )
        return norm

    @field_validator("secret_ref")
    @classmethod
    def _secret_ref_shape(cls, v: str) -> str:
        # Shape-only check at this layer; scheme-support validation
        # (env:// allowed, vault:// rejected) happens in the router where
        # we can produce the canonical "scheme 'vault://' is reserved …"
        # message in one consistent place.
        if not v or "://" not in v:
            raise ValueError(
                "must be a secret URI like env://VAR_NAME"
            )
        return v

    @field_validator("status")
    @classmethod
    def _status_in_set(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in _VALID_PROVIDER_STATUSES:
            raise ValueError(
                f"must be one of {list(_VALID_PROVIDER_STATUSES)}, got {v!r}"
            )
        return v


class AgentModelPolicies(BaseModel):
    """``spec.model_policies`` block.

    Mirrors the shape consumed by :class:`src.policy.loader.ModelPolicy`
    (which is intentionally permissive — task_routing values are nested
    dicts whose keys vary per task). We accept the loose dict shape here
    and re-validate against ``ModelPolicy`` at write-time inside the
    import router (which is where we'd surface any PDP-side rejection
    anyway).
    """

    model_config = ConfigDict(extra="allow")

    default_models: list[str] = Field(default_factory=list)
    task_routing: dict[str, Any] = Field(default_factory=dict)
    forbidden_models: list[str] = Field(default_factory=list)
    cost_budget: Optional[dict[str, Any]] = None
    enforcement: Optional[str] = "strict"


class AgentSpec(BaseModel):
    """Top-level ``spec`` block — everything except metadata."""

    model_config = ConfigDict(extra="forbid")

    prompt: Optional[AgentPromptSpec] = None
    model_policies: Optional[AgentModelPolicies] = None
    # The following three mirror legacy persona-policy YAML shapes; we keep
    # them as free-form dicts so that ResolvedPolicy can absorb them
    # without us re-implementing JITConfig / EscalationConfig / PolicyRule
    # in pydantic. The PDP is the source of truth for that schema.
    resources: Optional[dict[str, Any]] = None
    jit: Optional[dict[str, Any]] = None
    escalation: Optional[dict[str, Any]] = None
    provider_overrides: Optional[list[AgentProviderOverride]] = None


# ---------------------------------------------------------------------------
# Top-level payloads
# ---------------------------------------------------------------------------


class AgentImportPayload(BaseModel):
    """One agent's worth of import data."""

    model_config = ConfigDict(extra="forbid")

    metadata: AgentMetadata
    spec: AgentSpec = Field(default_factory=AgentSpec)


class AgentImportRequest(BaseModel):
    """Inline JSON shape for ``POST /v1/agents/import``.

    Multi-document YAML uploads are converted into this shape by the router
    before validation kicks in.
    """

    model_config = ConfigDict(extra="forbid")

    agents: list[AgentImportPayload] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Per-result + response wrappers (also used by the import router)
# ---------------------------------------------------------------------------


class AgentImportItemResult(BaseModel):
    """Per-agent outcome inside a successful import response."""

    persona_id: str
    agent_id: str
    prompt_id: Optional[str] = None
    provider_keys_created: int = 0
    policy_synced: bool = False
    created: bool = True  # True on insert, False on update of existing row


class AgentImportError(BaseModel):
    """Single validation error in the response payload."""

    path: str
    message: str


class AgentImportResponse(BaseModel):
    """Wire shape for ``POST /v1/agents/import``."""

    imported: list[AgentImportItemResult] = Field(default_factory=list)
    errors: list[AgentImportError] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Error formatting
# ---------------------------------------------------------------------------


_REQUIRED_MESSAGES = {
    "field required",
    "Field required",
    "missing",
}


def _humanise_message(raw: str, type_: str) -> str:
    """Turn pydantic's default messages into something a user can act on."""
    # 'Field required' / 'missing' → 'required'
    if type_ in {"missing", "value_error.missing"}:
        return "required"
    if raw in _REQUIRED_MESSAGES:
        return "required"
    # Strip the leading 'Value error, ' prefix pydantic adds for ValueError-raising validators.
    if raw.startswith("Value error, "):
        return raw[len("Value error, "):]
    return raw


def _pydantic_loc_to_path(loc: tuple[Any, ...], prefix: str = "") -> str:
    """Convert pydantic's ``loc`` tuple into a JSONPath-ish dotted string.

    ``("agents", 0, "metadata", "persona")`` → ``"agents[0].metadata.persona"``
    """
    parts: list[str] = []
    for piece in loc:
        if isinstance(piece, int):
            if parts:
                parts[-1] = f"{parts[-1]}[{piece}]"
            else:
                parts.append(f"[{piece}]")
        else:
            parts.append(str(piece))
    out = ".".join(parts)
    if prefix:
        out = f"{prefix}.{out}" if out else prefix
    return out


def format_validation_errors(
    exc: ValidationError, path_prefix: str = ""
) -> list[AgentImportError]:
    """Flatten a pydantic ValidationError into the wire-error list."""
    out: list[AgentImportError] = []
    for err in exc.errors():
        loc = tuple(err.get("loc", ()))
        msg_raw = err.get("msg", "")
        type_ = err.get("type", "")
        out.append(AgentImportError(
            path=_pydantic_loc_to_path(loc, prefix=path_prefix),
            message=_humanise_message(msg_raw, type_),
        ))
    return out


__all__ = [
    "AgentMetadata",
    "AgentPromptSpec",
    "AgentProviderOverride",
    "AgentModelPolicies",
    "AgentSpec",
    "AgentImportPayload",
    "AgentImportRequest",
    "AgentImportItemResult",
    "AgentImportError",
    "AgentImportResponse",
    "format_validation_errors",
]
