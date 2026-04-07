// ── Provider Metadata ──────────────────────────────────────────────
//
// Lightweight provider info for client components. No Node.js imports —
// safe to use in browser bundles. The provider implementations live in
// their own files and self-register at import time (server-only).
//

import type { ProviderConfig } from '../../types/provider';

export const PROVIDER_LIST: ProviderConfig[] = [
  { id: 'claude-code', name: 'Claude Code', color: '#6366f1', icon: 'terminal' },
  { id: 'gemini-cli', name: 'Gemini CLI', color: '#4285F4', icon: 'sparkles' },
  { id: 'codex', name: 'Codex', color: '#10A37F', icon: 'code' },
];
