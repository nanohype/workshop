// ── Agent Provider Abstraction ─────────────────────────────────────
//
// All agent providers implement the AgentProvider interface. The
// registry pattern allows new providers to be added by calling
// registerProvider() at module scope.
//

export type ProviderCapability = 'code' | 'document' | 'analysis' | 'general';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderOptions {
  model?: string;
  workspacePath?: string;
  workspace?: 'off' | 'safe' | 'full';
  maxTurns?: number;
  signal?: AbortSignal;
}

export interface StreamChunk {
  type: 'text' | 'done';
  content: string;
  tokens?: { input: number; output: number };
}

export interface AgentProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapability[];
  readonly color: string;
  readonly icon: string;

  stream(messages: ProviderMessage[], options: ProviderOptions): AsyncGenerator<StreamChunk>;
  validateCli(): Promise<boolean>;
}

export interface ProviderConfig {
  id: string;
  name: string;
  color: string;
  icon: string;
}
