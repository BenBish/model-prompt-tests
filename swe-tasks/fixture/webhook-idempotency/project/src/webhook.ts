export function createWebhookHandler(
  store: { has(id: string): Promise<boolean>; add(id: string): Promise<void> },
  effect: (x: any) => Promise<void>,
) {
  return async (e: { id: string }) => {
    if (await store.has(e.id)) return "duplicate";
    await effect(e);
    await store.add(e.id);
    return "processed";
  };
}
