"""
Policy Decision Point (PDP).
Implements SPEC.md section 5 — JIT access evaluation.
The core authorization engine of SoulAuth.
"""

import uuid
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.soulkey import resolve_identity, check_key_expiry
from src.policy.loader import load_cached_policy, find_matching_rule, ResolvedPolicy, ModelPolicyViolation
from src.tokens.capability import issue_capability_token
from src.audit.logger import log_auth_event
from src.database.models import Soulkey, AuditLog
from src.auth.delegation import check_delegation_approval
from src.auth.user_context import UserContext, apply_user_context


class AuthDecision:
    """Result of a PDP evaluation."""

    def __init__(
        self,
        decision: str,  # "grant" or "deny"
        audit_id: uuid.UUID = None,
        capability_token: Optional[str] = None,
        expires_in: Optional[int] = None,
        granted_scopes: Optional[List[str]] = None,
        reason: Optional[str] = None,
        escalation_available: bool = False,
        escalation_approver_role: Optional[str] = None,
    ):
        self.decision = decision
        self.audit_id = audit_id
        self.capability_token = capability_token
        self.expires_in = expires_in
        self.granted_scopes = granted_scopes
        self.reason = reason
        self.escalation_available = escalation_available
        self.escalation_approver_role = escalation_approver_role



class ModelAccessDecision:
    """Result of a model access PDP evaluation."""

    def __init__(
        self,
        decision: str,  # "grant" | "deny" | "redirect"
        requested_model: str,
        resolved_model: str,
        task_type: str | None = None,
        reason: str = "",
        cost_remaining_usd: float | None = None,
        enforcement_mode: str = "strict",
        audit_id: uuid.UUID | None = None,
    ):
        self.decision = decision
        self.requested_model = requested_model
        self.resolved_model = resolved_model
        self.task_type = task_type
        self.reason = reason
        self.cost_remaining_usd = cost_remaining_usd
        self.enforcement_mode = enforcement_mode
        self.audit_id = audit_id


def _within_operating_window(window: str) -> bool:
    """
    Check if current time is within operating window.
    Supports formats: "24/7", "HH:MM-HH:MM", "HH:MM-HH:MM * * *"
    Validates BOTH start and end times.
    """
    if not window or window.strip() == "24/7":
        return True

    try:
        # Strip any cron-style day/month suffixes (e.g., "09:00-17:00 * * 1-5")
        time_part = window.split(" ")[0].strip()

        if "-" not in time_part:
            # Unrecognized format - deny for safety
            return False

        parts = time_part.split("-", 1)
        if len(parts) != 2:
            return False

        start_str = parts[0].strip()
        end_str = parts[1].strip()

        if ":" not in start_str or ":" not in end_str:
            return False

        start_hour, start_minute = map(int, start_str.split(":"))
        end_hour, end_minute = map(int, end_str.split(":"))

        # Validate hour/minute ranges
        if not (0 <= start_hour <= 23 and 0 <= start_minute <= 59):
            return False
        if not (0 <= end_hour <= 23 and 0 <= end_minute <= 59):
            return False

        now = datetime.now(timezone.utc)
        current_minutes = now.hour * 60 + now.minute
        start_minutes = start_hour * 60 + start_minute
        end_minutes = end_hour * 60 + end_minute

        if start_minutes <= end_minutes:
            # Normal window (e.g., 09:00-17:00)
            return start_minutes <= current_minutes <= end_minutes
        else:
            # Overnight window (e.g., 22:00-06:00)
            return current_minutes >= start_minutes or current_minutes <= end_minutes

    except (ValueError, IndexError):
        # On parsing error, deny for safety
        return False


async def _count_active_capabilities(
    db: AsyncSession, soulkey_id: uuid.UUID
) -> int:
    """Count active (non-expired) capability tokens for a soulkey."""
    # Count recent capability_issued events (within max TTL window)
    # This is an approximation — production would use a dedicated capabilities table
    result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.soulkey_id == soulkey_id,
            AuditLog.event_type == "capability_issued",
            AuditLog.timestamp >= datetime.now(timezone.utc) - timedelta(minutes=15),
        )
    )
    return result.scalar() or 0


async def evaluate(
    db: AsyncSession,
    raw_soulkey: str,
    resource: str,
    action: str,
    scope: str,
    context: dict,
    user_context: Optional[dict] = None,
) -> AuthDecision:
    """
    Full PDP evaluation as specified in SPEC.md section 5.2.

    Steps:
    1. Resolve identity from soulkey
    2. Check key status and expiry
    3. Load resolved policy
    4. JIT constraint checks (session, node, window, concurrency)
    5. Resource + action + scope matching
    6. Condition evaluation (approval, rate limits)
    7. Issue capability token on GRANT
    8. Audit log the decision
    """

    # 1. Resolve identity
    soulkey = await resolve_identity(db, raw_soulkey)
    if not soulkey:
        audit_id = await log_auth_event(
            db,
            tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
            event_type="auth_deny",
            resource=resource,
            action=action,
            scope=scope,
            decision="deny",
            reason="unknown soulkey",
            context=context,
        )
        return AuthDecision(decision="deny", reason="unknown soulkey", audit_id=audit_id)

    # 2. Check key status
    if soulkey.status != "active":
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="auth_deny",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource=resource,
            action=action,
            scope=scope,
            decision="deny",
            reason=f"soulkey status: {soulkey.status}",
            context=context,
        )
        return AuthDecision(
            decision="deny",
            reason=f"soulkey status: {soulkey.status}",
            audit_id=audit_id,
        )

    # Check expiry
    if not await check_key_expiry(db, soulkey):
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="auth_deny",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource=resource,
            action=action,
            scope=scope,
            decision="deny",
            reason="soulkey expired",
            context=context,
        )
        return AuthDecision(
            decision="deny", reason="soulkey expired", audit_id=audit_id
        )

    # 3. Load resolved policy
    policy = await load_cached_policy(db, soulkey.tenant_id, soulkey.persona_id)
    if not policy:
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="auth_deny",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource=resource,
            action=action,
            scope=scope,
            decision="deny",
            reason="no policy found for persona",
            context=context,
        )
        return AuthDecision(
            decision="deny",
            reason="no policy found for persona",
            audit_id=audit_id,
        )

    # 4. JIT constraint checks
    # Node check
    request_node = context.get("node", "")
    if (
        request_node
        and request_node not in policy.jit.allowed_nodes
        and "*" not in policy.jit.allowed_nodes
    ):
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="auth_deny",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource=resource,
            action=action,
            scope=scope,
            decision="deny",
            reason=f"node {request_node} not in allowed_nodes",
            context=context,
        )
        return AuthDecision(
            decision="deny",
            reason=f"node {request_node} not in allowed_nodes",
            audit_id=audit_id,
        )

    # Operating window check
    if not _within_operating_window(policy.jit.operating_window):
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="auth_deny",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource=resource,
            action=action,
            scope=scope,
            decision="deny",
            reason="outside operating window",
            context=context,
        )
        return AuthDecision(
            decision="deny",
            reason="outside operating window",
            audit_id=audit_id,
        )

    # Active session check
    if policy.jit.require_active_session:
        session_id = context.get("session_id")
        if not session_id or not await has_active_session(db, soulkey.persona_id, session_id):
            audit_id = await log_auth_event(
                db,
                tenant_id=soulkey.tenant_id,
                event_type="auth_deny",
                soulkey_id=soulkey.id,
                persona_id=soulkey.persona_id,
                resource=resource,
                action=action,
                scope=scope,
                decision="deny",
                reason="no active soul session",
                context=context,
            )
            return AuthDecision(
                decision="deny",
                reason="no active soul session",
                audit_id=audit_id,
            )

    # Max concurrent capabilities check
    active_count = await _count_active_capabilities(db, soulkey.id)
    if active_count >= policy.jit.max_concurrent_capabilities:
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="auth_deny",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource=resource,
            action=action,
            scope=scope,
            decision="deny",
            reason="max concurrent capabilities reached",
            context=context,
        )
        return AuthDecision(
            decision="deny",
            reason="max concurrent capabilities reached",
            audit_id=audit_id,
        )

    # 5. Resource + action + scope check
    resource_rules = policy.resources.get(resource, [])
    matching_rule = find_matching_rule(resource_rules, action, scope)

    if not matching_rule:
        # Before final DENY, check if an active delegation grants access
        from src.auth.delegation import check_delegation
        delegation = await check_delegation(
            db, soulkey.tenant_id, soulkey.persona_id, resource, action, scope
        )
        if delegation:
            # Delegation grants access - proceed to issue capability token
            # Use a synthetic rule for the granted scope
            from src.policy.loader import PolicyRule
            matching_rule = PolicyRule({
                "actions": [action],
                "scopes": [scope],
                "conditions": [],
            })
        else:
            # No delegation either - deny
            escalation_available = bool(policy.escalation.approval_required_for)
            audit_id = await log_auth_event(
                db,
                tenant_id=soulkey.tenant_id,
                event_type="auth_deny",
                soulkey_id=soulkey.id,
                persona_id=soulkey.persona_id,
                resource=resource,
                action=action,
                scope=scope,
                decision="deny",
                reason=f"no rule grants {action} on {resource}:{scope}",
                context=context,
            )
            return AuthDecision(
                decision="deny",
                reason=f"no rule grants {action} on {resource}:{scope}",
                escalation_available=escalation_available,
                escalation_approver_role="orchestrator" if escalation_available else None,
                audit_id=audit_id,
            )

    # 6. Condition evaluation
    for condition in matching_rule.conditions:
        if condition.get("require_approval", False):
            # Check for pre-approved delegation or pending approval
            approver_role = condition.get("approver_role", "orchestrator")
            has_approval = await check_delegation_approval(
                db, soulkey.id, resource, action, scope, approver_role
            )
            if not has_approval:
                audit_id = await log_auth_event(
                    db,
                    tenant_id=soulkey.tenant_id,
                    event_type="auth_deny",
                    soulkey_id=soulkey.id,
                    persona_id=soulkey.persona_id,
                    resource=resource,
                    action=action,
                    scope=scope,
                    decision="deny",
                    reason=f"requires {approver_role} approval",
                    context=context,
                )
                return AuthDecision(
                    decision="deny",
                    reason=f"requires {approver_role} approval",
                    escalation_available=True,
                    escalation_approver_role=approver_role,
                    audit_id=audit_id,
                )

        # Rate limit check
        if condition.get("rate_limit"):
            rate_limit = condition["rate_limit"]  # e.g., "100/hour"
            if await exceeds_rate_limit(db, soulkey.id, resource, action, scope, rate_limit):
                audit_id = await log_auth_event(
                    db,
                    tenant_id=soulkey.tenant_id,
                    event_type="auth_deny",
                    soulkey_id=soulkey.id,
                    persona_id=soulkey.persona_id,
                    resource=resource,
                    action=action,
                    scope=scope,
                    decision="deny",
                    reason="rate limit exceeded",
                    context=context,
                )
                return AuthDecision(
                    decision="deny",
                    reason="rate limit exceeded",
                    audit_id=audit_id,
                )

    # 6b. User-context scoping
    extra_claims: dict = {}
    if user_context:
        try:
            uc = UserContext.from_dict(user_context)
        except (ValueError, KeyError):
            uc = None

        if uc:
            # Extract user_context_rules from the raw policy data for this resource
            resource_user_rules = None
            raw_resource_rules = policy.resources.get(resource, [])
            for rule in raw_resource_rules:
                if hasattr(rule, "conditions"):
                    for cond in rule.conditions:
                        if "user_context_rules" in cond:
                            resource_user_rules = cond["user_context_rules"]
                            break

            final_actions, extra_claims = apply_user_context(
                uc,
                matching_rule.actions if "*" not in matching_rule.actions else [action],
                resource_user_rules=resource_user_rules,
                requested_action=action,
            )

            if action not in final_actions and "*" not in final_actions:
                audit_id = await log_auth_event(
                    db,
                    tenant_id=soulkey.tenant_id,
                    event_type="auth_deny",
                    soulkey_id=soulkey.id,
                    persona_id=soulkey.persona_id,
                    resource=resource,
                    action=action,
                    scope=scope,
                    decision="deny",
                    reason=f"user context restricts action '{action}' for clearance '{uc.user_clearance}'",
                    context={**context, "user_context": user_context},
                )
                return AuthDecision(
                    decision="deny",
                    reason=f"user context restricts action '{action}' for clearance '{uc.user_clearance}'",
                    audit_id=audit_id,
                )

    # 7. Issue capability token
    requested_ttl = context.get("requested_ttl", policy.jit.default_capability_ttl)
    ttl = min(requested_ttl, policy.jit.max_capability_ttl)
    granted_scope = f"{resource}:{action}:{scope}"

    token, jti, exp = issue_capability_token(
        soulkey_id=soulkey.id,
        tenant_id=soulkey.tenant_id,
        persona_id=soulkey.persona_id,
        granted_scopes=[granted_scope],
        ttl=ttl,
        session_binding=context.get("session_id"),
        extra_claims=extra_claims,
    )

    # 8. Audit log
    audit_context = {**context}
    if user_context:
        audit_context["user_context"] = user_context
    if extra_claims:
        audit_context["user_claims"] = extra_claims

    audit_id = await log_auth_event(
        db,
        tenant_id=soulkey.tenant_id,
        event_type="auth_grant",
        soulkey_id=soulkey.id,
        persona_id=soulkey.persona_id,
        resource=resource,
        action=action,
        scope=scope,
        decision="grant",
        capability_id=uuid.UUID(jti),
        context=audit_context,
    )

    # Also log capability issuance
    await log_auth_event(
        db,
        tenant_id=soulkey.tenant_id,
        event_type="capability_issued",
        soulkey_id=soulkey.id,
        persona_id=soulkey.persona_id,
        resource=resource,
        action=action,
        scope=scope,
        decision="grant",
        capability_id=uuid.UUID(jti),
        context={
            **audit_context,
            "ttl": ttl,
            "scopes": [granted_scope],
            "session_binding": context.get("session_id"),
        },
    )

    return AuthDecision(
        decision="grant",
        capability_token=token,
        expires_in=ttl,
        granted_scopes=[granted_scope],
        audit_id=audit_id,
    )


async def has_active_session(db: AsyncSession, persona_id: str, session_id: str) -> bool:
    """
    Check if a persona has an active session by verifying the session_id
    was issued by this system (exists as a session binding in a recent
    capability token audit entry).
    """
    if not session_id or not session_id.strip():
        return False

    # Validate session_id format: must be a non-empty string, reasonable length,
    # and contain only safe characters (alphanumeric, hyphens, underscores)
    session_id = session_id.strip()
    if len(session_id) < 8 or len(session_id) > 256:
        return False
    if not re.match(r'^[a-zA-Z0-9_\-]+$', session_id):
        return False

    # Verify this session_id was actually issued by SoulAuth by checking
    # the audit log for a capability_issued event with this session binding
    result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.persona_id == persona_id,
            AuditLog.event_type == "capability_issued",
            AuditLog.timestamp >= datetime.now(timezone.utc) - timedelta(hours=24),
            AuditLog.context["session_binding"].as_string() == session_id,
        )
    )
    count = result.scalar() or 0
    return count > 0


async def exceeds_rate_limit(
    db: AsyncSession, soulkey_id: uuid.UUID, resource: str, action: str, scope: str, rate_limit_str: str
) -> bool:
    """Check if the soulkey has exceeded the rate limit for this resource/action/scope."""
    # Parse rate limit string like "100/hour", "1000/day"
    try:
        if "/" not in rate_limit_str:
            return False

        count_str, period_str = rate_limit_str.split("/")
        count = int(count_str)

        # Convert period to seconds
        period_multipliers = {
            "second": 1,
            "seconds": 1,
            "minute": 60,
            "minutes": 60,
            "hour": 3600,
            "hours": 3600,
            "day": 86400,
            "days": 86400,
        }

        period_seconds = period_multipliers.get(period_str.lower(), 3600)  # Default to hour

        # Count recent requests for this resource/action/scope
        cutoff_time = datetime.now(timezone.utc).timestamp() - period_seconds

        result = await db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.soulkey_id == soulkey_id,
                AuditLog.resource == resource,
                AuditLog.action == action,
                AuditLog.scope == scope,
                AuditLog.timestamp >= datetime.fromtimestamp(cutoff_time, tz=timezone.utc),
                AuditLog.event_type.in_(["auth_grant", "capability_used"])
            )
        )
        current_count = result.scalar() or 0

        return current_count >= count
    except (ValueError, KeyError) as e:
        # Fail CLOSED: if we can't parse the rate limit, deny the request
        # to prevent bypass via malformed policy
        import logging
        logging.getLogger(__name__).error(
            "Rate limit parsing failed (denying request): %s for rate_limit=%s",
            str(e), rate_limit_str,
        )
        return True

async def evaluate_model_access(
    db: AsyncSession,
    raw_soulkey: str,
    requested_model: str,
    task_type: str | None = None,
    estimated_cost_usd: float | None = None,
    context: dict | None = None,
) -> ModelAccessDecision:
    """
    Evaluate whether a persona can use the requested model for the given task.

    Model access decision flow (8 steps):

    1. Resolve identity -- look up soulkey via resolve_identity(), reject if
       unknown or inactive or expired.
    2. Load resolved policy -- fetch the cached tenant+persona policy tree.
       Deny if no policy exists for this persona.
    3. Extract model_policies -- pull the ModelPolicy sub-object from the
       resolved policy. If absent, treat as open-access (any model allowed).
    4. Check forbidden models -- resolve_models_for_task() rejects models on
       the persona's forbidden list.
    5. Check task-specific routing -- if a task_type header was supplied,
       resolve_models_for_task() may redirect to a required model for that
       task (e.g. embeddings -> text-embedding-3-small).
    6. Check cost budget -- compare estimated_cost_usd against the persona's
       daily and per-request cost caps. Deny if either would be exceeded.
    7. Return decision -- grant, deny, or redirect with the resolved model
       name, remaining cost budget, and enforcement mode.
    8. Audit log -- persist the decision to the audit log for compliance
       and downstream dashboard visibility.
    """
    context = context or {}

    # 1. Resolve identity
    soulkey = await resolve_identity(db, raw_soulkey)
    if not soulkey:
        return ModelAccessDecision(
            decision="deny",
            requested_model=requested_model,
            resolved_model="",
            task_type=task_type,
            reason="unknown soulkey",
        )

    # Check key status
    if soulkey.status != "active":
        return ModelAccessDecision(
            decision="deny",
            requested_model=requested_model,
            resolved_model="",
            task_type=task_type,
            reason=f"soulkey status: {soulkey.status}",
        )

    if not await check_key_expiry(db, soulkey):
        return ModelAccessDecision(
            decision="deny",
            requested_model=requested_model,
            resolved_model="",
            task_type=task_type,
            reason="soulkey expired",
        )

    # 2. Load resolved policy
    policy = await load_cached_policy(db, soulkey.tenant_id, soulkey.persona_id)
    if not policy:
        return ModelAccessDecision(
            decision="deny",
            requested_model=requested_model,
            resolved_model="",
            task_type=task_type,
            reason="no policy found for persona",
        )

    # 3. Extract model_policies
    model_policy = policy.model_policies
    if not model_policy:
        # No model policy defined — allow any model (open policy)
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="model_access_grant",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource="model",
            action="use",
            scope=requested_model,
            decision="grant",
            reason="no model policy defined",
            context={**context, "task_type": task_type},
        )
        return ModelAccessDecision(
            decision="grant",
            requested_model=requested_model,
            resolved_model=requested_model,
            task_type=task_type,
            reason="no model policy defined — open access",
            enforcement_mode="none",
            audit_id=audit_id,
        )

    enforcement = model_policy.enforcement

    # 4 + 5. Resolve model for task (handles forbidden + required + allowed checks)
    try:
        resolved_model, decision_reason = model_policy.resolve_models_for_task(
            task_type or "", requested_model
        )
    except ModelPolicyViolation as e:
        audit_id = await log_auth_event(
            db,
            tenant_id=soulkey.tenant_id,
            event_type="model_access_deny",
            soulkey_id=soulkey.id,
            persona_id=soulkey.persona_id,
            resource="model",
            action="use",
            scope=requested_model,
            decision="deny",
            reason=str(e),
            context={**context, "task_type": task_type, "enforcement": enforcement},
        )
        return ModelAccessDecision(
            decision="deny",
            requested_model=requested_model,
            resolved_model="",
            task_type=task_type,
            reason=str(e),
            enforcement_mode=enforcement,
            audit_id=audit_id,
        )

    # 6. Cost budget checks
    cost_remaining = None
    if model_policy.cost_budget and estimated_cost_usd is not None:
        per_request_max = model_policy.cost_budget.get("per_request_max_usd")
        if per_request_max and estimated_cost_usd > per_request_max:
            reason = (
                f"Estimated cost ${estimated_cost_usd:.2f} exceeds "
                f"per-request max ${per_request_max:.2f}"
            )
            if enforcement == "strict":
                audit_id = await log_auth_event(
                    db,
                    tenant_id=soulkey.tenant_id,
                    event_type="model_access_deny",
                    soulkey_id=soulkey.id,
                    persona_id=soulkey.persona_id,
                    resource="model",
                    action="use",
                    scope=requested_model,
                    decision="deny",
                    reason=reason,
                    context={**context, "task_type": task_type, "estimated_cost": estimated_cost_usd},
                )
                return ModelAccessDecision(
                    decision="deny",
                    requested_model=requested_model,
                    resolved_model="",
                    task_type=task_type,
                    reason=reason,
                    enforcement_mode=enforcement,
                    audit_id=audit_id,
                )

        daily_limit = model_policy.cost_budget.get("daily_limit_usd")
        if daily_limit:
            # Query today's spend from audit log
            today_spend = await _get_daily_model_spend(db, soulkey.id)
            cost_remaining = daily_limit - today_spend
            if estimated_cost_usd and (today_spend + estimated_cost_usd) > daily_limit:
                reason = (
                    f"Daily budget exhausted: spent ${today_spend:.2f} of "
                    f"${daily_limit:.2f}, request needs ${estimated_cost_usd:.2f}"
                )
                if enforcement == "strict":
                    audit_id = await log_auth_event(
                        db,
                        tenant_id=soulkey.tenant_id,
                        event_type="model_access_deny",
                        soulkey_id=soulkey.id,
                        persona_id=soulkey.persona_id,
                        resource="model",
                        action="use",
                        scope=requested_model,
                        decision="deny",
                        reason=reason,
                        context={**context, "task_type": task_type, "daily_spend": today_spend},
                    )
                    return ModelAccessDecision(
                        decision="deny",
                        requested_model=requested_model,
                        resolved_model="",
                        task_type=task_type,
                        reason=reason,
                        cost_remaining_usd=cost_remaining,
                        enforcement_mode=enforcement,
                        audit_id=audit_id,
                    )

    # 7. Determine final decision
    if resolved_model != requested_model and requested_model:
        decision = "redirect"
        reason_str = f"Redirected from {requested_model} to {resolved_model}: {decision_reason}"
    else:
        decision = "grant"
        reason_str = decision_reason

    audit_id = await log_auth_event(
        db,
        tenant_id=soulkey.tenant_id,
        event_type=f"model_access_{decision}",
        soulkey_id=soulkey.id,
        persona_id=soulkey.persona_id,
        resource="model",
        action="use",
        scope=resolved_model,
        decision=decision,
        reason=reason_str,
        context={
            **context,
            "task_type": task_type,
            "requested_model": requested_model,
            "resolved_model": resolved_model,
        },
    )

    return ModelAccessDecision(
        decision=decision,
        requested_model=requested_model,
        resolved_model=resolved_model,
        task_type=task_type,
        reason=reason_str,
        cost_remaining_usd=cost_remaining,
        enforcement_mode=enforcement,
        audit_id=audit_id,
    )


async def _get_daily_model_spend(
    db: AsyncSession, soulkey_id: uuid.UUID
) -> float:
    """Sum estimated_cost from today's model_access_grant audit events."""
    from sqlalchemy import cast, Float
    from sqlalchemy.dialects.postgresql import JSONB

    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    result = await db.execute(
        select(AuditLog.context).where(
            AuditLog.soulkey_id == soulkey_id,
            AuditLog.event_type.in_(["model_access_grant", "model_access_redirect"]),
            AuditLog.timestamp >= today_start,
        )
    )
    total = 0.0
    for (ctx,) in result.all():
        if ctx and isinstance(ctx, dict):
            total += ctx.get("estimated_cost", 0.0)
    return total
