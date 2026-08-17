export class FakeClock {
  private currentMs = 0;
  private nextId = 1;
  private callbacks = new Map<number, () => void>();

  now = () => this.currentMs;
  setInterval = (callback: () => void, _delay: number) => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  };
  clearInterval = (id: number) => {
    this.callbacks.delete(id);
  };
  elapse(ms: number) {
    this.currentMs += ms;
  }
  runIntervals() {
    for (const callback of [...this.callbacks.values()]) callback();
  }
  get intervalCount() {
    return this.callbacks.size;
  }
}
