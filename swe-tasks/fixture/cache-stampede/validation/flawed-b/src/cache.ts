export class AsyncCache<T> {
  private p = new Map<string, Promise<T>>();
  constructor(
    private ttlMs: number,
    private now: () => number = Date.now,
  ) {}
  get(k: string, l: () => Promise<T>) {
    if (!this.p.has(k)) this.p.set(k, l());
    return this.p.get(k)!;
  }
}
