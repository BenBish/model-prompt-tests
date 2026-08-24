export function createWebhookHandler(store: any, effect: any) {
  const pending = new Map<string, Promise<string>>();
  return async (e: any) => {
    if (await store.has(e.id)) return "duplicate";
    const old = pending.get(e.id);
    if (old) return old.then(() => "duplicate");
    const run = (async () => {
      await effect(e);
      await store.add(e.id);
      return "processed";
    })();
    pending.set(e.id, run);
    try {
      return await run;
    } finally {
      pending.delete(e.id);
    }
  };
}
