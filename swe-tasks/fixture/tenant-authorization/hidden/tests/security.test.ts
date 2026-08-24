import { test, expect } from "bun:test";
import { Repository } from "../src/repository";
import { Documents } from "../src/service";
import { getDocument } from "../src/route";
test("tenant scoped repository and route", async () => {
  const r = new Repository([
    { id: "1", tenantId: "a", body: "a" },
    { id: "1", tenantId: "b", body: "b" },
  ]);
  expect((await r.find("b", "1"))?.body).toBe("b");
  expect(
    (
      await getDocument(
        { tenantId: "b", params: { id: "1" } },
        new Documents(r),
      )
    ).body.body,
  ).toBe("b");
});
