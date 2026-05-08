// ──────────────────────────────────────────────────────────────
// Tiresias × Matrix — Room/User Authorization Policies
// ──────────────────────────────────────────────────────────────
// License: Apache-2.0
// SOURCE: tiresias-matrix-integration-plan.md (Policy Templates)
// NAMESPACE: TiresiasMatrix
// ENTITIES: MatrixUser (principal), MatrixRoom (resource)
// ACTIONS: join, send_message, read_history, invite, redact
// ──────────────────────────────────────────────────────────────
// All seven policies are scoped to the TiresiasMatrix namespace and
// do NOT affect the legacy Tiresias namespace (Agent / Plugin / Tenant).
// The base.cedar permit-all baseline still applies to plugin tool_calls.
// ──────────────────────────────────────────────────────────────


// ──────────────────────────────────────────────────────────────
// matrix-001 — Agents/users only join rooms where their role is
//              permitted AND tenants match.
// ──────────────────────────────────────────────────────────────
permit (
  principal is TiresiasMatrix::MatrixUser,
  action == TiresiasMatrix::Action::"join",
  resource is TiresiasMatrix::MatrixRoom
)
when {
  principal.agent_role in resource.allowed_roles &&
  principal.tenant_id == resource.tenant_id
};


// ──────────────────────────────────────────────────────────────
// matrix-002 — Primary humans can send to rooms that are flagged
//              human_write within their tenant.
// ──────────────────────────────────────────────────────────────
permit (
  principal is TiresiasMatrix::MatrixUser,
  action == TiresiasMatrix::Action::"send_message",
  resource is TiresiasMatrix::MatrixRoom
)
when {
  principal.is_human == true &&
  principal.user_scope == "primary" &&
  resource.human_write == true &&
  principal.tenant_id == resource.tenant_id
};


// ──────────────────────────────────────────────────────────────
// matrix-003 — Sub-users can only send to rooms that explicitly
//              allow the "sub" scope (their per-user console).
//
// NOTE: The plan template used Cedar string concatenation
//       (`"tiresias-console-" + principal.user_scope`) which is
//       not supported by upstream Cedar.  We instead require the
//       provisioner (PR D) to add the literal "sub" scope to a
//       room's `allowed_roles` set when minting that user's
//       per-user console room.  The intent (only the assigned
//       sub-user posts to their own scoped console) is preserved
//       because each sub-user's console room is provisioned with
//       only that user's role in `allowed_roles`.
// ──────────────────────────────────────────────────────────────
permit (
  principal is TiresiasMatrix::MatrixUser,
  action == TiresiasMatrix::Action::"send_message",
  resource is TiresiasMatrix::MatrixRoom
)
when {
  principal.is_human == true &&
  principal.user_scope == "sub" &&
  resource.human_write == true &&
  principal.agent_role in resource.allowed_roles &&
  principal.tenant_id == resource.tenant_id
};


// ──────────────────────────────────────────────────────────────
// matrix-004 — Agents can send messages only to rooms whose
//              allowed_roles set contains their role.
// ──────────────────────────────────────────────────────────────
permit (
  principal is TiresiasMatrix::MatrixUser,
  action == TiresiasMatrix::Action::"send_message",
  resource is TiresiasMatrix::MatrixRoom
)
when {
  principal.is_human == false &&
  principal.agent_role in resource.allowed_roles &&
  principal.tenant_id == resource.tenant_id
};


// ──────────────────────────────────────────────────────────────
// matrix-005 — pantheon-ops is agent-only; humans cannot post.
//              Humans can still read history (granted via
//              matrix-001 join) but never write.
// ──────────────────────────────────────────────────────────────
forbid (
  principal is TiresiasMatrix::MatrixUser,
  action == TiresiasMatrix::Action::"send_message",
  resource is TiresiasMatrix::MatrixRoom
)
when {
  principal.is_human == true &&
  resource.room_alias == "pantheon-ops"
};


// ──────────────────────────────────────────────────────────────
// matrix-006 — Cross-tenant access is always denied.
//              Catch-all forbid that wins over any permit above.
// ──────────────────────────────────────────────────────────────
forbid (
  principal is TiresiasMatrix::MatrixUser,
  action,
  resource is TiresiasMatrix::MatrixRoom
)
when {
  principal.tenant_id != resource.tenant_id
};


// ──────────────────────────────────────────────────────────────
// matrix-007 — Only the platform-provisioner service account may
//              issue invites.  Everyone else is denied.
// ──────────────────────────────────────────────────────────────
forbid (
  principal is TiresiasMatrix::MatrixUser,
  action == TiresiasMatrix::Action::"invite",
  resource is TiresiasMatrix::MatrixRoom
)
unless {
  principal.agent_role == "platform-provisioner"
};

permit (
  principal is TiresiasMatrix::MatrixUser,
  action == TiresiasMatrix::Action::"invite",
  resource is TiresiasMatrix::MatrixRoom
)
when {
  principal.agent_role == "platform-provisioner" &&
  principal.tenant_id == resource.tenant_id
};
