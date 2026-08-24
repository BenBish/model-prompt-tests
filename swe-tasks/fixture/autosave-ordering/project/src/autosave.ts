export function createAutosave(
  save: (v: string) => Promise<void>,
  status: (s: string) => void,
) {
  let last = Promise.resolve();
  return {
    edit(v: string) {
      status("saving");
      last = save(v).then(
        () => status("saved"),
        () => status("error"),
      );
    },
    flush() {
      return last;
    },
    destroy() {},
  };
}
