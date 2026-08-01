import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";
import { captureNode, type CaptureDeps, type Capture } from "../../scripts/archive";

/** A source-like node from YAML text. A provider's is an item in `sources[]`;
 *  a reference's IS the document root — both are a YAMLMap, which is the point. */
function nodeFrom(yaml: string): import("yaml").YAMLMap {
  return parseDocument(yaml).contents as import("yaml").YAMLMap;
}

/** Records every capture call and returns a path, without touching a browser. */
function fakeCapture(): Capture & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (dir: string, id: string) => {
    calls.push(`${dir}/${id}`);
    return `data/archives/${dir}/${id}-2026-08-01.pdf`;
  }) as unknown as Capture & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function deps(over: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    capture: fakeCapture(),
    submitWayback: async () => null,
    force: false,
    skipWayback: true,
    pauseMs: 0,
    ...over,
  };
}

/** Capture console.log so "it announced itself" is assertable. */
function withLog<T>(fn: () => T): { logs: string[]; value: T } {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    return { logs, value: fn() };
  } finally {
    console.log = orig;
  }
}

test("CAPTURE: a source with no url is skipped, and never silently", async () => {
  const capture = fakeCapture();
  const node = nodeFrom("id: gated-brochure\n");
  const { logs, value } = withLog(() => captureNode(node, "demo", deps({ capture })));
  const changed = await value;

  assert.equal(changed, false);
  assert.equal(capture.calls.length, 0, "must not attempt a capture without a url");
  assert.equal(node.get("local_snapshot"), undefined);
  assert.match(
    logs.join("\n"),
    /gated-brochure: overgeslagen \(geen url/,
    "a source the archiver cannot handle must say so — silence makes it look captured",
  );
});
