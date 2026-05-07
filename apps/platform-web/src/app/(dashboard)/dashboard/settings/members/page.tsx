'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RoleGate } from '@/components/rbac/role-gate';
import { useRBAC } from '@/lib/rbac/context';
import { Role, Permission, DEFAULT_ROLE_PERMISSIONS } from '@/lib/rbac/permissions';

/** Shape of a WorkOS organization membership from the API. */
interface OrgMember {
  id: string;
  user_id: string;
  organization_id: string;
  role_slug: string;
  user?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

/** Shape of the permission overrides response. */
interface PermissionOverrides {
  permissions: Record<string, string[]>;
}

/** Human-readable labels for permissions. */
const PERMISSION_LABELS: Record<string, string> = {
  [Permission.POLICIES_CREATE]: 'Create Policies',
  [Permission.POLICIES_DELETE]: 'Delete Policies',
  [Permission.POLICIES_EDIT]: 'Edit Policies',
  [Permission.KEYS_ROTATE]: 'Rotate Keys',
  [Permission.KEYS_REVOKE]: 'Revoke Keys',
  [Permission.MEMBERS_INVITE]: 'Invite Members',
  [Permission.MEMBERS_MANAGE]: 'Manage Members',
  [Permission.SETTINGS_MANAGE]: 'Manage Settings',
  [Permission.SESSIONS_VIEW]: 'View Sessions',
  [Permission.COST_VIEW]: 'View Cost',
};

export default function MembersPage() {
  const { role: currentUserRole } = useRBAC();
  const queryClient = useQueryClient();

  // Fetch org members
  const membersQuery = useQuery<{ data: OrgMember[] }>({
    queryKey: ['org-members'],
    queryFn: () => fetch('/api/tiresias/rbac/roles').then((r) => r.json()),
  });

  // Fetch permission overrides
  const permissionsQuery = useQuery<PermissionOverrides>({
    queryKey: ['permission-overrides'],
    queryFn: () => fetch('/api/tiresias/rbac/permissions').then((r) => r.json()),
  });

  // Role change mutation
  const roleChangeMutation = useMutation({
    mutationFn: async ({
      membershipId,
      role,
    }: {
      membershipId: string;
      role: string;
    }) => {
      const res = await fetch('/api/tiresias/rbac/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId, role }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
    },
  });

  // Permission save mutation
  const permissionSaveMutation = useMutation({
    mutationFn: async ({
      role,
      allowed_actions,
    }: {
      role: string;
      allowed_actions: string[];
    }) => {
      const res = await fetch('/api/tiresias/rbac/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, allowed_actions }),
      });
      if (!res.ok) throw new Error('Failed to save permissions');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-overrides'] });
    },
  });

  const members = membersQuery.data?.data ?? [];
  const effectivePermissions = permissionsQuery.data?.permissions ?? {};

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Section 1: Team Members */}
      <h1 className="text-2xl font-bold text-white mb-6">Team Members</h1>

      {membersQuery.isLoading && (
        <p className="text-[#94a3b8]">Loading members...</p>
      )}

      {membersQuery.isError && (
        <p className="text-[#E17055]">Failed to load members. Please try again.</p>
      )}

      {!membersQuery.isLoading && members.length === 0 && (
        <p className="text-[#94a3b8]">No members found.</p>
      )}

      {members.length > 0 && (
        <div className="rounded-lg border border-[#2a2d3e] overflow-hidden mb-8">
          <table className="w-full">
            <thead>
              <tr className="bg-[#1e2130] text-left text-sm text-[#94a3b8]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, idx) => (
                <tr
                  key={member.id}
                  className={idx % 2 === 0 ? 'bg-[#1a1d27]' : 'bg-[#1e2130]'}
                >
                  <td className="px-4 py-3 text-white text-sm">
                    {member.user
                      ? `${member.user.first_name ?? ''} ${member.user.last_name ?? ''}`.trim() ||
                        'Unknown'
                      : 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-[#94a3b8] text-sm">
                    {member.user?.email ?? 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <RoleGate
                      allowedRoles={[Role.ADMIN]}
                      fallback={
                        <span className="text-[#94a3b8] capitalize">
                          {member.role_slug}
                        </span>
                      }
                    >
                      <select
                        value={member.role_slug}
                        onChange={(e) =>
                          roleChangeMutation.mutate({
                            membershipId: member.id,
                            role: e.target.value,
                          })
                        }
                        className="bg-[#2a2d3e] text-white text-sm rounded px-2 py-1 border border-[#3a3d4e] focus:outline-none focus:border-[#4361EE]"
                        disabled={roleChangeMutation.isPending}
                      >
                        <option value={Role.ADMIN}>Admin</option>
                        <option value={Role.MEMBER}>Member</option>
                        <option value={Role.VIEWER}>Viewer</option>
                      </select>
                    </RoleGate>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <RoleGate allowedRoles={[Role.ADMIN]}>
                      {roleChangeMutation.isPending && (
                        <span className="text-[#FDCB6E] text-xs">Saving...</span>
                      )}
                    </RoleGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 2: Permission Configuration (RBAC-06) */}
      <RoleGate allowedRoles={[Role.ADMIN]}>
        <PermissionConfigSection
          effectivePermissions={effectivePermissions}
          onSave={(role, actions) =>
            permissionSaveMutation.mutate({
              role,
              allowed_actions: actions,
            })
          }
          isSaving={permissionSaveMutation.isPending}
          isLoading={permissionsQuery.isLoading}
        />
      </RoleGate>
    </div>
  );
}

/** Permission Configuration section -- only visible to admins. */
function PermissionConfigSection({
  effectivePermissions,
  onSave,
  isSaving,
  isLoading,
}: {
  effectivePermissions: Record<string, string[]>;
  onSave: (role: string, actions: string[]) => void;
  isSaving: boolean;
  isLoading: boolean;
}) {
  // Track local toggle state per role
  const [localOverrides, setLocalOverrides] = useState<Record<string, Set<string>>>({});
  const [dirtyRoles, setDirtyRoles] = useState<Set<string>>(new Set());

  const configurableRoles = [Role.MEMBER, Role.VIEWER]; // Admin always has all permissions
  const allPermissions = Object.values(Permission);

  const getEffectiveForRole = useCallback(
    (role: string): Set<string> => {
      if (localOverrides[role]) return localOverrides[role];
      const perms = effectivePermissions[role] ?? DEFAULT_ROLE_PERMISSIONS[role as Role] ?? [];
      return new Set(perms);
    },
    [localOverrides, effectivePermissions],
  );

  const togglePermission = (role: string, permission: string) => {
    const current = getEffectiveForRole(role);
    const updated = new Set(current);
    if (updated.has(permission)) {
      updated.delete(permission);
    } else {
      updated.add(permission);
    }
    setLocalOverrides((prev) => ({ ...prev, [role]: updated }));
    setDirtyRoles((prev) => new Set(prev).add(role));
  };

  const handleSave = (role: string) => {
    const perms = getEffectiveForRole(role);
    onSave(role, [...perms]);
    setDirtyRoles((prev) => {
      const next = new Set(prev);
      next.delete(role);
      return next;
    });
  };

  if (isLoading) {
    return <p className="text-[#94a3b8] mt-8">Loading permission configuration...</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mt-8">Permission Configuration</h2>
      <p className="text-[#94a3b8] text-sm mb-4">
        Configure which roles can perform which actions
      </p>

      {configurableRoles.map((role) => {
        const activePerms = getEffectiveForRole(role);
        const isDirty = dirtyRoles.has(role);

        return (
          <div key={role} className="mb-6">
            <h3 className="text-white font-medium capitalize mb-2">{role}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {allPermissions.map((perm) => (
                <label
                  key={perm}
                  className="flex items-center gap-2 text-sm text-[#94a3b8] cursor-pointer hover:text-white transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={activePerms.has(perm)}
                    onChange={() => togglePermission(role, perm)}
                    className="rounded border-[#3a3d4e] bg-[#2a2d3e] text-[#4361EE] focus:ring-[#4361EE] focus:ring-offset-0"
                  />
                  {PERMISSION_LABELS[perm] ?? perm}
                </label>
              ))}
            </div>
            {isDirty && (
              <button
                onClick={() => handleSave(role)}
                disabled={isSaving}
                className="mt-3 px-4 py-1.5 bg-[#4361EE] text-white text-sm rounded hover:bg-[#4361EE]/80 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
