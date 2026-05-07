/**
 * Argon2id password hashing.
 */

import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * Hash a plaintext password using Argon2id.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * Returns false instead of throwing on mismatch.
 */
export async function verifyPassword(
  hash: string,
  plain: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
