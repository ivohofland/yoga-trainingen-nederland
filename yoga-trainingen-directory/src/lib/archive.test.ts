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
  const result = await value;

  assert.equal(result.changed, false);
  assert.equal(capture.calls.length, 0, "must not attempt a capture without a url");
  assert.equal(node.get("local_snapshot"), undefined);
  assert.match(
    logs.join("\n"),
    /gated-brochure: overgeslagen \(geen url/,
    "a source the archiver cannot handle must say so — silence makes it look captured",
  );
});

test("CAPTURE: a failed capture is REPORTED, not silently swallowed", async () => {
  const boom: Capture = async () => {
    throw new Error("net::ERR_NAME_NOT_RESOLVED");
  };
  const node = nodeFrom("id: unreachable\nurl: https://example.invalid/x\n");
  const result = await captureNode(node, "demo", deps({ capture: boom }));

  assert.equal(result.failedCapture, "unreachable", "the failing source id must come back");
  assert.equal(result.changed, false, "a failed capture changed nothing");
  assert.equal(
    node.get("local_snapshot"),
    undefined,
    "a record must never declare a snapshot the capture did not produce",
  );
});

/** A temp dir with a real file on disk, so "already archived" can be tested honestly:
 *  the check is that the FILE exists, not that the YAML declares a path. */
function withSnapshotOnDisk(rel: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archive-"));
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), "body");
  return root;
}

test("CAPTURE: an existing snapshot ON DISK is skipped without --force", async () => {
  const rel = "data/archives/demo/s-2026-08-01.pdf";
  const root = withSnapshotOnDisk(rel);
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const capture = fakeCapture();
    const node = nodeFrom(`id: s\nurl: https://example.com/x\nlocal_snapshot: ${rel}\n`);
    const r = await captureNode(node, "demo", deps({ capture }));
    assert.equal(capture.calls.length, 0, "the file exists — do not re-capture");
    assert.equal(r.changed, false);
  } finally {
    process.chdir(cwd);
  }
});

test("CAPTURE: --force re-captures even when the snapshot exists", async () => {
  const rel = "data/archives/demo/s-2026-08-01.pdf";
  const root = withSnapshotOnDisk(rel);
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const capture = fakeCapture();
    const node = nodeFrom(`id: s\nurl: https://example.com/x\nlocal_snapshot: ${rel}\n`);
    await captureNode(node, "demo", deps({ capture, force: true }));
    assert.equal(capture.calls.length, 1, "--force must actually escape the skip");
  } finally {
    process.chdir(cwd);
  }
});

test("CAPTURE: a Wayback-pointless URL never gets an archived_url written", async () => {
  const node = nodeFrom("id: ya\nurl: https://app.yogaalliance.org/schoolpublicprofile?id=1\n");
  const r = await captureNode(
    node,
    "demo",
    deps({
      skipWayback: false,
      submitWayback: async () => {
        throw new Error("must not submit a JS shell to Wayback");
      },
    }),
  );
  assert.equal(node.get("archived_url"), undefined);
  assert.equal(r.failedCapture, null);
});

test("CAPTURE: --skip-wayback suppresses submission", async () => {
  const node = nodeFrom("id: s\nurl: https://example.com/x\n");
  await captureNode(
    node,
    "demo",
    deps({
      skipWayback: true,
      submitWayback: async () => {
        throw new Error("must not submit when --skip-wayback is set");
      },
    }),
  );
  assert.equal(node.get("archived_url"), undefined);
});

test("CAPTURE: a provider source and a reference document take the identical path", async () => {
  // A provider's node is an item in sources[]; a reference's IS the document root.
  // Same decisions, same writes — only the directory differs. That equivalence is the
  // entire claim of the extraction, and nothing asserted it.
  const yaml = "id: doc\nurl: https://example.com/x\n";

  const provider = nodeFrom(yaml);
  const pCapture = fakeCapture();
  const p = await captureNode(provider, "tribes-academy", deps({ capture: pCapture }));

  const reference = nodeFrom(yaml);
  const rCapture = fakeCapture();
  const r = await captureNode(reference, "_references", deps({ capture: rCapture }));

  assert.deepEqual(
    { changed: p.changed, failed: p.failedCapture },
    { changed: r.changed, failed: r.failedCapture },
    "the two paths must reach the same outcome",
  );
  assert.equal(pCapture.calls[0], "tribes-academy/doc");
  assert.equal(rCapture.calls[0], "_references/doc");
  assert.equal(provider.get("local_snapshot"), "data/archives/tribes-academy/doc-2026-08-01.pdf");
  assert.equal(reference.get("local_snapshot"), "data/archives/_references/doc-2026-08-01.pdf");
});

test("CAPTURE: it is WIRED IN — both loops go through captureNode", () => {
  // Mirrors sync-archive.test.ts's wiring test. One shared routine is the whole point;
  // a second, parallel capture path would drift on the .sha256 sidecar, which is what
  // the evidentiary chain reads.
  const src = fs.readFileSync(
    path.join(process.cwd(), "scripts", "archive.ts"),
    "utf8",
  );
  assert.match(src, /captureNode\(item, providerId, deps\)/, "provider loop must use captureNode");
  assert.match(
    src,
    /captureNode\(\s*doc\.contents as import\("yaml"\)\.YAMLMap,\s*REFERENCE_DIR_NAME,\s*deps,?\s*\)/,
    "reference loop must use captureNode",
  );
});
