/**
 * @module TeamSettingsTab
 *
 * Team management panel for the Settings page. Displays:
 *  - User list with portal role + team role badges
 *  - Account admin / secondary admin badges
 *  - Invite user modal (email, portal role, team role, team select)
 *  - Per-user actions: change role, remove, designate secondary admin
 *  - Team list with collapsible member sections
 *  - Create team button (account admins only)
 *
 * Read-only for non-admins. Hidden for community tier (gated by parent).
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";

// -- Types ------------------------------------------------------------------

interface TeamUser {
  id: string;
  email: string;
  display_name?: string;
  admin_role: "owner" | "admin" | "operator" | "viewer";
  is_account_admin: boolean;
  is_secondary_admin: boolean;
  status: string;
  team_memberships?: { team_id: string; team_name: string; team_role: string }[];
}

interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_default: boolean;
  member_count?: number;
  members?: TeamMember[];
}

interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  display_name?: string;
  team_role: string;
}

interface Invite {
  id: string;
  email: string;
  invited_role: string;
  invited_team_role: string;
  team_id?: string;
  team_name?: string;
  status: string;
  expires_at: string;
  created_at: string;
}

// -- Badge helpers ----------------------------------------------------------

const PORTAL_ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  admin: "bg-red-500/15 text-red-400 border-red-500/25",
  operator: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  viewer: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};

const TEAM_ROLE_COLORS: Record<string, string> = {
  team_admin: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  analyst: "bg-green-500/15 text-green-400 border-green-500/25",
  member: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};

function RoleBadge({ role, colors }: { role: string; colors: Record<string, string> }) {
  const cls = colors[role] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>
      {role.replace("_", " ")}
    </span>
  );
}

function AdminBadge({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-500/15 text-amber-400 border-amber-500/25">
      {label}
    </span>
  );
}

// -- Subcomponents ----------------------------------------------------------

function UserRow({
  user,
  isAdmin,
  onChangeRole,
  onToggleSecondaryAdmin,
  onRemove,
}: {
  user: TeamUser;
  isAdmin: boolean;
  onChangeRole: (userId: string, newRole: string) => void;
  onToggleSecondaryAdmin: (userId: string, value: boolean) => void;
  onRemove: (userId: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const initial = (user.display_name || user.email || "?")[0].toUpperCase();

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-of-surface-container border border-of-outline-variant/10 hover:border-of-outline-variant/25 transition-colors">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-of-primary/15 border border-of-primary/20 flex items-center justify-center text-xs font-bold text-of-primary shrink-0">
        {initial}
      </div>

      {/* Name + Email */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-of-on-surface truncate">
            {user.display_name || user.email}
          </span>
          {user.is_account_admin && <AdminBadge label="Account Admin" />}
          {user.is_secondary_admin && <AdminBadge label="Secondary Admin" />}
        </div>
        {user.display_name && (
          <p className="text-[11px] text-of-on-surface-variant truncate">{user.email}</p>
        )}
      </div>

      {/* Role badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        <RoleBadge role={user.admin_role} colors={PORTAL_ROLE_COLORS} />
        {user.team_memberships?.[0]?.team_role && (
          <RoleBadge role={user.team_memberships[0].team_role} colors={TEAM_ROLE_COLORS} />
        )}
      </div>

      {/* Status */}
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${
        user.status === "active"
          ? "bg-green-500/15 text-green-400 border-green-500/25"
          : "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"
      }`}>
        {user.status}
      </span>

      {/* Actions (admin only) */}
      {isAdmin && !user.is_account_admin && (
        <div className="relative shrink-0">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-of-on-surface-variant transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </button>

          {showActions && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setShowActions(false); setShowRoleSelect(false); }} />
              <div className="absolute right-0 top-8 z-50 w-48 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 shadow-xl py-1">
                <button
                  onClick={() => { setShowRoleSelect(!showRoleSelect); }}
                  className="w-full px-3 py-2 text-left text-xs text-of-on-surface hover:bg-white/5 transition-colors"
                >
                  Change Portal Role
                </button>
                {showRoleSelect && (
                  <div className="px-3 py-1 space-y-1">
                    {(["owner", "admin", "operator", "viewer"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => { onChangeRole(user.id, r); setShowActions(false); setShowRoleSelect(false); }}
                        className={`w-full px-2 py-1 text-left text-[11px] rounded transition-colors ${
                          user.admin_role === r
                            ? "bg-of-primary/15 text-of-primary"
                            : "text-of-on-surface-variant hover:bg-white/5"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => {
                    onToggleSecondaryAdmin(user.id, !user.is_secondary_admin);
                    setShowActions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-of-on-surface hover:bg-white/5 transition-colors"
                >
                  {user.is_secondary_admin ? "Remove Secondary Admin" : "Make Secondary Admin"}
                </button>
                <hr className="my-1 border-of-outline-variant/10" />
                <button
                  onClick={() => { onRemove(user.id); setShowActions(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Deactivate User
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InviteModal({
  teams,
  onClose,
  onInvite,
  sending,
}: {
  teams: Team[];
  onClose: () => void;
  onInvite: (data: { email: string; invited_role: string; invited_team_role: string; team_id?: string; expires_hours: number }) => void;
  sending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [portalRole, setPortalRole] = useState("viewer");
  const [teamRole, setTeamRole] = useState("member");
  const [teamId, setTeamId] = useState(teams.find((t) => t.is_default)?.id || teams[0]?.id || "");
  const [expiresHours, setExpiresHours] = useState(72);

  const inputCls = "w-full px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-sm text-foreground focus:border-blue-500/50 focus:outline-none";
  const labelCls = "text-[11px] text-foreground-subtle uppercase tracking-wider font-medium";

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-of-surface-container-high border border-of-outline-variant/20 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-of-on-surface">Invite Team Member</h3>
            <p className="text-[11px] text-of-on-surface-variant mt-0.5">
              Send an email invitation to join your tenant.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Portal Role</label>
                <select value={portalRole} onChange={(e) => setPortalRole(e.target.value)} className={inputCls}>
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Team Role</label>
                <select value={teamRole} onChange={(e) => setTeamRole(e.target.value)} className={inputCls}>
                  <option value="member">Member</option>
                  <option value="analyst">Analyst</option>
                  <option value="team_admin">Team Admin</option>
                </select>
              </div>
            </div>

            {teams.length > 0 && (
              <div className="space-y-1">
                <label className={labelCls}>Team</label>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputCls}>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className={labelCls}>Expires</label>
              <select value={expiresHours} onChange={(e) => setExpiresHours(Number(e.target.value))} className={inputCls}>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours</option>
                <option value={168}>7 days</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/10 text-sm text-foreground-muted hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onInvite({ email, invited_role: portalRole, invited_team_role: teamRole, team_id: teamId || undefined, expires_hours: expiresHours })}
              disabled={!email.includes("@") || sending}
              className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {sending ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function CreateTeamModal({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (data: { name: string; slug: string; description: string }) => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const inputCls = "w-full px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-sm text-foreground focus:border-blue-500/50 focus:outline-none";
  const labelCls = "text-[11px] text-foreground-subtle uppercase tracking-wider font-medium";

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(val));
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-of-surface-container-high border border-of-outline-variant/20 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-of-on-surface">Create Team</h3>
            <p className="text-[11px] text-of-on-surface-variant mt-0.5">
              Teams let you group users for scoped access control.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className={labelCls}>Team Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Security Operations"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="security-operations"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="SOC team for incident response"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/10 text-sm text-foreground-muted hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onCreate({ name, slug, description })}
              disabled={!name.trim() || !slug.trim() || creating}
              className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {creating ? "Creating..." : "Create Team"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

function TeamCard({
  team,
  expanded,
  onToggle,
}: {
  team: Team;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg bg-of-surface-container border border-of-outline-variant/10">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <svg
          className={`w-4 h-4 text-of-on-surface-variant transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-of-on-surface">{team.name}</span>
          {team.is_default && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium bg-of-primary/10 text-of-primary border border-of-primary/20">
              default
            </span>
          )}
        </div>
        <span className="text-[11px] text-of-on-surface-variant">
          {team.member_count ?? team.members?.length ?? 0} members
        </span>
      </button>

      {expanded && team.members && team.members.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {team.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-of-surface-container-high/50 text-xs">
              <span className="text-of-on-surface flex-1 truncate">{m.display_name || m.email}</span>
              <RoleBadge role={m.team_role} colors={TEAM_ROLE_COLORS} />
            </div>
          ))}
        </div>
      )}

      {expanded && (!team.members || team.members.length === 0) && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-of-on-surface-variant italic">No members in this team.</p>
        </div>
      )}

      {team.description && expanded && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-of-on-surface-variant">{team.description}</p>
        </div>
      )}
    </div>
  );
}

// -- Main Component ---------------------------------------------------------

export function TeamSettingsTab() {
  const { session } = useAuth();

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [teamCreating, setTeamCreating] = useState(false);

  // Team expand state
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // Determine if the current user has admin privileges
  // In a real deployment this would come from the session; for now we
  // check the OIDC data or default to checking admin_role from the user list.
  const currentUserEmail = session?.user_email || "";
  const currentUser = users.find((u) => u.email === currentUserEmail);
  const isAdmin = currentUser?.is_account_admin || currentUser?.is_secondary_admin || currentUser?.admin_role === "owner" || currentUser?.admin_role === "admin";

  // -- Data fetching --------------------------------------------------------

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, teamsRes, invitesRes] = await Promise.allSettled([
        fetch("/api/users").then((r) => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch("/api/teams").then((r) => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch("/api/invites").then((r) => r.ok ? r.json() : Promise.reject(r.statusText)),
      ]);

      if (usersRes.status === "fulfilled") {
        const raw = usersRes.value;
        setUsers(Array.isArray(raw) ? raw : (raw.users ?? []));
      }
      if (teamsRes.status === "fulfilled") {
        const raw = teamsRes.value;
        setTeams(Array.isArray(raw) ? raw : (raw.teams ?? []));
      }
      if (invitesRes.status === "fulfilled") {
        const raw = invitesRes.value;
        setInvites(Array.isArray(raw) ? raw : (raw.invites ?? []));
      }

      // If all three failed, show a general error
      if (
        usersRes.status === "rejected" &&
        teamsRes.status === "rejected" &&
        invitesRes.status === "rejected"
      ) {
        setError("Failed to load team data. The backend may not be reachable.");
      }
    } catch {
      setError("Failed to load team data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -- Actions --------------------------------------------------------------

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, admin_role: newRole as TeamUser["admin_role"] } : u));
      }
    } catch { /* silent */ }
  };

  const handleToggleSecondaryAdmin = async (userId: string, value: boolean) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_secondary_admin: value }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_secondary_admin: value } : u));
      }
    } catch { /* silent */ }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: "deactivated" } : u));
      }
    } catch { /* silent */ }
  };

  const handleInvite = async (data: { email: string; invited_role: string; invited_team_role: string; team_id?: string; expires_hours: number }) => {
    setInviteSending(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const inv = await res.json();
        setInvites((prev) => [inv, ...prev]);
        setShowInviteModal(false);
      }
    } catch { /* silent */ } finally {
      setInviteSending(false);
    }
  };

  const handleCreateTeam = async (data: { name: string; slug: string; description: string }) => {
    setTeamCreating(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const team = await res.json();
        setTeams((prev) => [...prev, team]);
        setShowCreateTeam(false);
      }
    } catch { /* silent */ } finally {
      setTeamCreating(false);
    }
  };

  // -- Render ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-of-surface-container-high rounded w-1/3" />
          <div className="h-4 bg-of-surface-container-high rounded w-2/3" />
          <div className="h-16 bg-of-surface-container-high rounded" />
          <div className="h-16 bg-of-surface-container-high rounded" />
        </div>
      </div>
    );
  }

  if (error && users.length === 0 && teams.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-bold text-of-on-surface mb-1">Team Management</h2>
          <p className="text-xs text-of-on-surface-variant">
            Manage users, teams, and invitations for your tenant.
          </p>
        </div>
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-of-on-surface mb-1">Team Management</h2>
          <p className="text-xs text-of-on-surface-variant">
            Manage users, teams, and invitations for your tenant.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Invite User
          </button>
        )}
      </div>

      {/* Users Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
          Users ({users.length})
        </h3>
        {users.length === 0 ? (
          <p className="text-xs text-of-on-surface-variant italic px-4 py-3 rounded-lg bg-of-surface-container border border-of-outline-variant/10">
            No users found.
          </p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isAdmin={!!isAdmin}
                onChangeRole={handleChangeRole}
                onToggleSecondaryAdmin={handleToggleSecondaryAdmin}
                onRemove={handleRemoveUser}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites Section */}
      {pendingInvites.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
            Pending Invitations ({pendingInvites.length})
          </h3>
          <div className="space-y-2">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-of-surface-container border border-of-outline-variant/10"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs text-amber-400 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-of-on-surface">{inv.email}</span>
                  <p className="text-[10px] text-of-on-surface-variant">
                    Role: {inv.invited_role} / {inv.invited_team_role}
                    {inv.team_name ? ` in ${inv.team_name}` : ""}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-amber-500/15 text-amber-400 border-amber-500/25 shrink-0">
                  pending
                </span>
                <span className="text-[10px] text-of-on-surface-variant shrink-0">
                  Expires {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teams Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
            Teams ({teams.length})
          </h3>
          {isAdmin && (
            <button
              onClick={() => setShowCreateTeam(true)}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-of-on-surface-variant hover:text-of-on-surface hover:bg-white/5 transition-colors"
            >
              Create Team
            </button>
          )}
        </div>
        {teams.length === 0 ? (
          <p className="text-xs text-of-on-surface-variant italic px-4 py-3 rounded-lg bg-of-surface-container border border-of-outline-variant/10">
            No teams configured. Create a team to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {teams.map((t) => (
              <TeamCard
                key={t.id}
                team={t}
                expanded={expandedTeamId === t.id}
                onToggle={() => setExpandedTeamId(expandedTeamId === t.id ? null : t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showInviteModal && (
        <InviteModal
          teams={teams}
          onClose={() => setShowInviteModal(false)}
          onInvite={handleInvite}
          sending={inviteSending}
        />
      )}
      {showCreateTeam && (
        <CreateTeamModal
          onClose={() => setShowCreateTeam(false)}
          onCreate={handleCreateTeam}
          creating={teamCreating}
        />
      )}
    </div>
  );
}
