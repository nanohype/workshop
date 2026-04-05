import type { AgentProvider, ProviderMessage, ProviderOptions, StreamChunk } from '../../types/provider';
import { registerProvider } from './registry';

export class GeminiCliProvider implements AgentProvider {
  readonly id = 'gemini-cli';
  readonly name = 'Gemini CLI';
  readonly capabilities = ['code' as const, 'document' as const, 'general' as const];
  readonly color = '#4285F4';
  readonly icon = 'sparkles';

  async *stream(_messages: ProviderMessage[], _options: ProviderOptions): AsyncGenerator<StreamChunk> {
    throw new Error('Gemini CLI provider is not yet implemented. Install and configure Gemini CLI first.');
  }

  async validateCli(): Promise<boolean> {
    // Check if gemini CLI is available on PATH
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const proc = spawn('gemini', ['--version']);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }
}

// Self-register
registerProvider(new GeminiCliProvider());
