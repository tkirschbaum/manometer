/**
 * Server clock offset (§5.6): every state message carries serverNow. serverNow - receivedAt equals
 * offset minus one-way latency, so the largest recent sample is the best estimate.
 */
export class ServerClock {
  private samples: number[] = [];

  sample(serverNow: number): void {
    this.samples.push(serverNow - Date.now());
    if (this.samples.length > 8) this.samples.shift();
  }

  get offset(): number {
    return this.samples.length ? Math.max(...this.samples) : 0;
  }

  now(): number {
    return Date.now() + this.offset;
  }
}
