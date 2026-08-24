import { test, expect } from "bun:test";
import { migrateAccounts } from "../src/migrate";
test("migrates", async () => {
  const rows = [{ id: "1", name: "A" }];
  const db: any = {
    list: async (a: string) => (a ? [] : rows),
    update: async (_: string, x: any) => Object.assign(rows[0], x),
  };
  await migrateAccounts(db, 10);
  expect(rows[0].displayName).toBe("A");
});
