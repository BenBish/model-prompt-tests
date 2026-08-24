import { test, expect } from "bun:test";
import { createAutosave } from "../src/autosave";
test("saves", async () => {
  const s: string[] = [];
  const a = createAutosave(
    async () => {},
    (x) => s.push(x),
  );
  a.edit("x");
  await a.flush();
  expect(s.at(-1)).toBe("saved");
});
