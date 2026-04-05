// ──────────────────────────────────────────────────────────────
// Tiresias App Proxy — Base Cedar Policies
// ──────────────────────────────────────────────────────────────

// P1: Any agent may read from any plugin.
permit (
    principal,
    action == Tiresias::Action::"read",
    resource
);

// P2: Allow tool_call within rate limit and business hours.
permit (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    context.rate_count < 100 &&
    context.hour_of_day >= 6 &&
    context.hour_of_day <= 22
};

// P3: Allow writes during business hours within rate limit.
permit (
    principal,
    action == Tiresias::Action::"write",
    resource
) when {
    context.rate_count < 100 &&
    context.hour_of_day >= 6 &&
    context.hour_of_day <= 22
};

// F1: Forbid writes to destructive plugins without approval.
forbid (
    principal,
    action == Tiresias::Action::"write",
    resource
) when {
    resource.classification == "destructive" &&
    !context.has_approval
};

// F2: Forbid tool_call on destructive plugins without approval.
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    resource.classification == "destructive" &&
    !context.has_approval
};

// F3: Forbid tool_call when rate limit exceeded.
forbid (
    principal,
    action == Tiresias::Action::"tool_call",
    resource
) when {
    context.rate_count >= 100
};

// F4: Forbid writes outside business hours (before 06:00 or after 22:00 UTC).
forbid (
    principal,
    action == Tiresias::Action::"write",
    resource
) when {
    context.hour_of_day < 6 ||
    context.hour_of_day > 22
};
