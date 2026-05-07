/**
 * User and role types.
 */

export enum Role {
  Admin = 'admin',
  Member = 'member',
  Viewer = 'viewer',
  BillingAdmin = 'billing_admin',
  SecurityReviewer = 'security_reviewer',
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  roles: Role[];
  organizationId: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  roles: Role[];
  organizationId: string | null;
}
