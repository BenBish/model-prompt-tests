import { test, expect } from "bun:test";
import { createAutosave } from "../src/autosave";
test("latest wins and destroy silences", async () => {
  const waits: any[] = [];
  const out: string[] = [];
  const a = createAutosave(
    () => new Promise((r, j) => waits.push({ r, j })),
    (x) => out.push(x),
  );
  a.edit("old");
  a.edit("new");
  waits[1].r();
  await Promise.resolve();
  waits[0].j(Error("old"));
  await a.flush();
  expect(out.at(-1)).toBe("saved");
  a.edit("gone");
  a.destroy();
  waits[2].r();
  await Promise.resolve();
  expect(out.at(-1)).toBe("saved");
});
