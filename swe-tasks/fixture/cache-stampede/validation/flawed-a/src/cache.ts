export class AsyncCache<T> {
  private v = new Map<string, { value: T; at: number }>();
  constructor(
    private ttlMs: number,
    private now: () => number = Date.now,
  ) {}
  async get(k: string, l: () => Promise<T>) {
    const x = this.v.get(k);
    if (x && this.now() - x.at < this.ttlMs) return x.value;
    const value = await l();
    this.v.set(k, { value, at: this.now() });
    return value;
  }
}
