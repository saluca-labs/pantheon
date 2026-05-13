/**
 * Provider registry — built-ins are registered at module load; additional
 * providers can be added at runtime via `registerLlmProvider`. This is the
 * extensibility seam called out in the user override (vLLM, Together, Groq,
 * etc. can be wired without modifying this package).
 */
import type { LlmProvider } from './types.js';
import { llmProviderSchema } from './types.js';

const registry = new Map<string, LlmProvider>();

export function registerLlmProvider(input: { name: string; adapter: LlmProvider }): void {
  llmProviderSchema.parse(input);
  registry.set(input.name, input.adapter);
}

export function getLlmProvider(name: string): LlmProvider | undefined {
  return registry.get(name);
}

export function listLlmProviders(): string[] {
  return Array.from(registry.keys()).sort();
}

/** Test-only — clears the registry so each test can install its own providers. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
