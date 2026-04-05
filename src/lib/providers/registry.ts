// ── Provider Registry ──────────────────────────────────────────────
//
// Central registry for agent providers. Each provider module
// self-registers by calling registerProvider() at import time.
//

import type { AgentProvider, ProviderCapability } from '../../types/provider';

const providers = new Map<string, AgentProvider>();

export function registerProvider(provider: AgentProvider): void {
  if (providers.has(provider.id)) {
    throw new Error(`Provider "${provider.id}" is already registered`);
  }
  providers.set(provider.id, provider);
}

export function getProvider(id: string): AgentProvider {
  const provider = providers.get(id);
  if (!provider) {
    const available = Array.from(providers.keys()).join(', ') || '(none)';
    throw new Error(`Provider "${id}" not found. Available: ${available}`);
  }
  return provider;
}

export function listProviders(): AgentProvider[] {
  return Array.from(providers.values());
}

export function getProviderForCapability(capability: ProviderCapability): AgentProvider | undefined {
  for (const provider of providers.values()) {
    if (provider.capabilities.includes(capability)) {
      return provider;
    }
  }
  return undefined;
}
