/**
 * Append-only buffer with watermark protocol for streaming inter-node output.
 *
 * Producer nodes append chunks and advance the watermark to signal stable content.
 * Consumer nodes read stable content or subscribe for push notifications.
 * The async generator provides pull-based consumption that completes on close.
 *
 * Not serialized in checkpoints — streaming is an optimization, not a
 * correctness requirement. On resume, streaming edges restart from scratch.
 */
export class StreamBuffer {
  private buffer: string[] = [];
  private watermark = 0;
  private closed = false;
  private listeners = new Set<() => void>();

  append(content: string): void {
    if (this.closed) return;
    this.buffer.push(content);
    this.notify();
  }

  setWatermark(index?: number): void {
    this.watermark = index ?? this.buffer.length;
  }

  getStableContent(): string {
    return this.buffer.slice(0, this.watermark).join('');
  }

  getAllContent(): string {
    return this.buffer.join('');
  }

  isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.watermark = this.buffer.length;
    this.notify();
  }

  onUpdate(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async *chunks(opts?: { fromWatermark?: boolean }): AsyncGenerator<string> {
    let cursor = 0;

    while (true) {
      const limit = opts?.fromWatermark ? this.watermark : this.buffer.length;

      while (cursor < limit) {
        yield this.buffer[cursor];
        cursor++;
      }

      if (this.closed) {
        // Yield any remaining chunks past the cursor
        while (cursor < this.buffer.length) {
          yield this.buffer[cursor];
          cursor++;
        }
        return;
      }

      // Wait for new content or close
      await new Promise<void>(resolve => {
        const unsub = this.onUpdate(() => {
          unsub();
          resolve();
        });
      });
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
