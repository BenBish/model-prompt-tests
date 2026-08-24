export function createWebhookHandler(store: any, effect: any) {
  return async (e: any) => {
    if (await store.has(e.id)) return "duplicate";
    await store.add(e.id);
    await effect(e);
    return "processed";
  };
}
