/**
 * Identity header construction for Tiresias backend requests.
 *
 * Per D-06: these exact header names are the contract with the backend.
 * The BFF proxy attaches these headers so the backend knows who is making
 * the request without the frontend ever exposing the API key.
 */

export function buildIdentityHeaders(identity: {
  userId: string;
  role: string;
  teamId: string;
}): Record<string, string> {
  return {
    'X-Tiresias-User-Id': identity.userId,
    'X-Tiresias-Role': identity.role,
    'X-Tiresias-Team-Id': identity.teamId,
    'Content-Type': 'application/json',
  };
}
