import { test, expect } from "bun:test";
import { Repository } from "../src/repository";
test("finds a document", async () =>
  expect(
    (await new Repository([{ id: "1", tenantId: "a", body: "ok" }]).find("1"))
      ?.body,
  ).toBe("ok"));
