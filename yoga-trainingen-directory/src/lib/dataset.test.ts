import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset";

test("the committed dataset is valid — zero schema or integrity errors", () => {
  const { providers, errors } = loadDataset();
  assert.deepEqual(errors, [], `dataset invalid:\n${errors.join("\n")}`);
  assert.ok(providers.length > 0, "expected at least one provider");
});

test("every provider id matches its filename slug", () => {
  const { providers } = loadDataset();
  for (const p of providers) {
    assert.match(p.id, /^[a-z0-9][a-z0-9-]*$/, `provider id '${p.id}' is not a kebab-case slug`);
  }
});
