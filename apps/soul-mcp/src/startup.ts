/**
 * startup.ts — Boot-time hooks for soul-mcp.
 *
 * One hook today: if SOUL_AUTO_INIT_SESSION is truthy, the adapter calls
 * soul_session_init against itself once the HTTP surface is listening.
 * This is how the "Soul session init at service startup" pattern is
 * implemented — the service is its own first caller, so the init is
 * recorded in the local store AND warms soul-service's hot tier for the
 * session.
 *
 * The session ID, node ID, harness, and persona come from env vars so
 * the same image can be configured per-environment without code changes.
 */

import type { AllTools } from './mcp.js';

export interface StartupOptions {
  tools: AllTools;
  logger: { info: (o: object | string, msg?: string) => void; error: (o: object | string, msg?: string) => void };
}

export async function runStartupHooks(opts: StartupOptions): Promise<void> {
  const { tools, logger } = opts;

  if (process.env.SOUL_AUTO_INIT_SESSION === 'true' || process.env.SOUL_AUTO_INIT_SESSION === '1') {
    const sessionId = process.env.SOUL_AUTO_INIT_SESSION_ID || 'soul-mcp-boot';
    const nodeId = process.env.SOUL_AUTO_INIT_NODE_ID || process.env.HOSTNAME || 'soul-mcp';
    const harnessEnv = process.env.SOUL_AUTO_INIT_HARNESS;
    const personaEnv = process.env.SOUL_AUTO_INIT_PERSONA;
    const validHarnesses = ['claude-code', 'opencode', 'nanoclaw', 'picoclaw'] as const;
    type ValidHarness = (typeof validHarnesses)[number];
    const harness: ValidHarness | undefined =
      harnessEnv && validHarnesses.includes(harnessEnv as ValidHarness)
        ? (harnessEnv as ValidHarness)
        : undefined;
    try {
      const out = await tools.soul.soul_session_init({
        session_id: sessionId,
        node_id: nodeId,
        harness,
        persona: personaEnv,
      });
      logger.info({ session_id: sessionId, node_id: nodeId, result: out }, 'startup soul_session_init complete');
    } catch (err) {
      // Boot-time init failures are advisory, not fatal — soul-service may
      // not yet be up. The adapter still serves requests; the operator
      // can replay /api/session/init by hand.
      logger.error(
        { err: err instanceof Error ? err.message : String(err), session_id: sessionId },
        'startup soul_session_init failed (advisory, not fatal)',
      );
    }
  }
}
