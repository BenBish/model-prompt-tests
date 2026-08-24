export function createAutosave(save: any, status: any) {
  let seq = 0,
    alive = true;
  const pending = new Set<Promise<void>>();
  return {
    edit(v: string) {
      const mine = ++seq;
      const p = save(v)
        .then(
          () => {
            if (alive && mine === seq) status("saved");
          },
          () => {
            if (alive && mine === seq) status("error");
          },
        )
        .finally(() => pending.delete(p));
      pending.add(p);
    },
    async flush() {
      await Promise.allSettled([...pending]);
    },
    destroy() {
      alive = false;
    },
  };
}
