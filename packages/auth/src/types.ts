/**
 * Internal auth types.
 */

import type { Pool, PoolClient } from 'pg';

export type DB = Pool | PoolClient;

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SessionWithUser {
  user: User;
  session: Session;
}
