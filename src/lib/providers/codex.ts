import type { AgentProvider, ProviderMessage, ProviderOptions, StreamChunk } from '../../types/provider';
import { registerProvider } from './registry';

export class CodexProvider implements AgentProvider {
  readonly id = 'codex';
  readonly name = 'Codex';
  readonly capabilities = ['code' as const, 'general' as const];
  readonly color = '#10A37F';
  readonly icon = 'code';

  async *stream(_messages: ProviderMessage[], _options: ProviderOptions): AsyncGenerator<StreamChunk> {
    throw new Error('Codex provider is not yet implemented. Install and configure Codex CLI first.');
  }

  async validateCli(): Promise<boolean> {
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const proc = spawn('codex', ['--version']);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }
}

// Self-register
registerProvider(new CodexProvider());
