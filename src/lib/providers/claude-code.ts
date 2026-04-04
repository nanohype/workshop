import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

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

export class ClaudeCodeProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async *stream(messages: ProviderMessage[], options: ProviderOptions, _apiKey: string): AsyncGenerator<StreamChunk> {
    const prompt = this.buildPrompt(messages);
    const workspaceEnabled = options.workspace && options.workspace !== 'off' && options.workspacePath;

    const args = ['-p', '--output-format', 'json'];

    const maxTurns = options.maxTurns || 10;
    args.push('--max-turns', String(maxTurns));

    if (workspaceEnabled && options.workspace === 'full') {
      args.push('--dangerously-skip-permissions');
    }

    const spawnOptions: { env: NodeJS.ProcessEnv; cwd?: string } = {
      env: process.env,
    };

    if (workspaceEnabled) {
      spawnOptions.cwd = options.workspacePath;
    }

    const proc = spawn('claude', args, spawnOptions);

    // Pipe prompt via stdin to avoid ARG_MAX limits
    proc.stdin.write(prompt);
    proc.stdin.end();

    const cleanup = this.attachAbortHandler(proc, options.signal);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    const closePromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      proc.on('close', (code, signal) => resolve({ code, signal }));
    });

    proc.on('error', (err) => {
      cleanup();
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code');
      }
      throw err;
    });

    const result = await closePromise;
    cleanup();

    if (result.signal === 'SIGTERM' || options.signal?.aborted) {
      if (stdout.trim()) {
        yield { type: 'text', content: this.parseOutput(stdout) };
      }
      throw new Error('Claude Code was cancelled');
    }

    if (result.code !== 0) {
      if (stdout.trim()) {
        yield { type: 'text', content: this.parseOutput(stdout) };
      }
      throw new Error(stderr || `Claude Code exited with code ${result.code}`);
    }

    const parsed = this.parseOutput(stdout);
    yield { type: 'text', content: parsed };
    yield { type: 'done', content: '', tokens: { input: 0, output: 0 } };
  }

  async validateCli(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('claude', ['--version']);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  private buildPrompt(messages: ProviderMessage[]): string {
    const system = messages.find(m => m.role === 'system')?.content;
    const user = messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n');
    return system ? `${system}\n\n${user}` : user;
  }

  private parseOutput(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        if (typeof parsed.result === 'string') return parsed.result;
        if (typeof parsed.text === 'string') return parsed.text;
        if (typeof parsed.content === 'string') return parsed.content;
        if (Array.isArray(parsed.content)) {
          return parsed.content
            .filter((c: { type?: string; text?: string }) => c.type === 'text' && c.text)
            .map((c: { text: string }) => c.text)
            .join('');
        }
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  private attachAbortHandler(proc: ChildProcessWithoutNullStreams, signal?: AbortSignal): () => void {
    if (!signal) return () => {};

    if (signal.aborted) {
      proc.kill('SIGTERM');
      return () => {};
    }

    const onAbort = () => { proc.kill('SIGTERM'); };
    signal.addEventListener('abort', onAbort, { once: true });

    return () => {
      signal.removeEventListener('abort', onAbort);
    };
  }
}
