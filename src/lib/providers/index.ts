// ── Provider Barrel ────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry.
//

import './claude-code';
import './gemini-cli';
import './codex';

export { getProvider, listProviders, getProviderForCapability, registerProvider } from './registry';
export type { AgentProvider, ProviderMessage, ProviderOptions, StreamChunk, ProviderCapability } from '../../types/provider';

// Pre-populated after all self-registrations above — safe for use in client components
import { listProviders } from './registry';
export const PROVIDERS = listProviders();
