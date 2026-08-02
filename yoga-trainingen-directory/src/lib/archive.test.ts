import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";
import { captureNode, finishCapture, type CaptureDeps, type Capture } from "../../scripts/archive";

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

/** Capture console.log so "it announced itself" is assertable. Async, and restores
 *  console.log only once fn's promise settles — a sync version restores it as soon as
 *  fn() returns, which for an async fn means "as soon as the first await suspends it",
 *  so any log emitted after that point leaks to the real console uncaptured. That failure
 *  is silent: `logs` just comes back empty, indistinguishable from "nothing was logged". */
async function withLog<T>(fn: () => Promise<T>): Promise<{ logs: string[]; value: T }> {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    const value = await fn();
    return { logs, value };
  } finally {
    console.log = orig;
  }
}

test("CAPTURE: a source with no url is skipped, and never silently", async () => {
  const capture = fakeCapture();
  const node = nodeFrom("id: gated-brochure\n");
  const { logs, value: result } = await withLog(() => captureNode(node, "demo", deps({ capture })));

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

// Every test in this file that process.chdir()s does so for its duration and restores it
// in a `finally`. That is safe only because node:test runs a file's top-level tests
// sequentially, not concurrently — do not add `{ concurrency: true }` to this file
// without giving each chdir'ing test its own isolated cwd first.
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

test("CAPTURE: an already-captured source STILL gets its public half", async () => {
  // Every archived_url assertion above this line asserts undefined, and deps()'s default
  // (skipWayback: true, submitWayback: async () => null) means none of them can tell "the
  // guard correctly did not fire" from "nothing would have written archived_url anyway". The
  // MOST COMMON node on an --all run is exactly this one — a local copy already on disk, so
  // section 1 is skipped and `changed` is still false when the no-half-record guard is
  // reached. A guard misread as `if (!changed) return { changed, failedCapture }` — plausible
  // under "nothing was captured, nothing to do" — would silently stop Wayback submissions for
  // every such source, with 307/307 staying green because nothing here asserted the OTHER
  // direction. This test drives a real, non-pointless url through a SUCCESSFUL submission on
  // an already-captured node and asserts the write happens.
  const rel = "data/archives/demo/s-2026-08-01.pdf";
  const root = withSnapshotOnDisk(rel);
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const capture = fakeCapture();
    const node = nodeFrom(`id: s\nurl: https://example.com/x\nlocal_snapshot: ${rel}\n`);
    let submitted = 0;
    const r = await captureNode(
      node,
      "demo",
      deps({
        capture,
        skipWayback: false,
        submitWayback: async () => {
          submitted++;
          return "https://web.archive.org/web/20260802000000/https://example.com/x";
        },
      }),
    );
    assert.equal(capture.calls.length, 0, "the file exists — local capture must still be skipped");
    assert.equal(submitted, 1, "the no-half-record guard must not fire on an already-captured source");
    assert.equal(
      node.get("archived_url"),
      "https://web.archive.org/web/20260802000000/https://example.com/x",
    );
    assert.equal(r.changed, true);
  } finally {
    process.chdir(cwd);
  }
});

test("CAPTURE: a FRESH successful capture also reaches Wayback and records archived_url", async () => {
  // The test above only exercises hasLocal === true: the local capture is skipped, `changed`
  // starts false, and the no-half-record guard must NOT fire. It says nothing about the more
  // common case — a brand-new source, where the local capture SUCCEEDS and sets `changed =
  // true` before the `if (failedCapture) return` guard is even reached. Two plausible-looking
  // mutations
  // both silently stop every fresh capture from ever reaching Wayback, and neither is caught
  // by the test above (there `changed` never becomes true):
  //   - misreading the guard as `if (failedCapture || changed) return { changed, failedCapture }`
  //     ("something changed, stop and let the caller decide") fires on every fresh capture;
  //   - `return { changed, failedCapture };` inserted right after the capture's
  //     `console.log("ok")` — "we captured, nothing left to do" — returns before the guard,
  //     the Wayback branch, or anything after it ever runs.
  // No process.chdir() needed: fakeCapture() never touches the filesystem, so there is
  // nothing on disk for hasLocal to find, which is exactly what makes this capture "fresh".
  const capture = fakeCapture();
  const node = nodeFrom("id: s\nurl: https://example.com/x\n");
  let submitted = 0;
  const r = await captureNode(
    node,
    "demo",
    deps({
      capture,
      skipWayback: false,
      submitWayback: async () => {
        submitted++;
        return "https://web.archive.org/web/20260802000000/https://example.com/x";
      },
    }),
  );
  assert.equal(capture.calls.length, 1, "no existing snapshot — the local capture must run");
  assert.equal(submitted, 1, "a fresh successful capture must still reach Wayback");
  assert.equal(
    node.get("archived_url"),
    "https://web.archive.org/web/20260802000000/https://example.com/x",
  );
  assert.equal(r.changed, true);
  assert.equal(r.failedCapture, null);
});

test("CAPTURE: `dir` is threaded through, not hardcoded — a provider source and a reference document write to their own directory", async () => {
  // A provider's node is an item in sources[]; a reference's IS the document root — both are
  // handed to captureNode as a plain YAMLMap, and `dir` is the only thing that tells it which
  // one it has. Every decision inside captureNode (hasLocal, WAYBACK_POINTLESS, excluded,
  // skipWayback, force) is independent of `dir`, so this cannot pin "the two paths behave the
  // same" — with identical input they behave the same by construction, for any `dir`. What it
  // CAN pin, and does: `dir` actually reaches `deps.capture()` and the written `local_snapshot`,
  // rather than one of the two being hardcoded. Whether the two real call sites — main()'s
  // provider loop and archiveReferences() — agree with each other end to end (write timing,
  // how archiveReferences reads doc.contents) is untested here; that is the wiring test below,
  // and only at the grep level.
  const yaml = "id: doc\nurl: https://example.com/x\n";

  const provider = nodeFrom(yaml);
  const pCapture = fakeCapture();
  await captureNode(provider, "tribes-academy", deps({ capture: pCapture }));

  const reference = nodeFrom(yaml);
  const rCapture = fakeCapture();
  await captureNode(reference, "_references", deps({ capture: rCapture }));

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
  // The entrypoint guard is the single point of failure for the two assertions above: it is
  // what makes main() — and therefore both loops — run at all when `npm run archive` executes.
  // Nothing else pins it. If the filename check stops matching this file (a rename, a typo),
  // `npm run archive` becomes a SILENT NO-OP that exits 0 while the suite stays green, because
  // every other test drives captureNode directly and never goes through the guard. In this repo
  // that means a researcher believing evidence was captured when none was.
  assert.match(
    src,
    /endsWith\(path\.sep \+ "archive\.ts"\)/,
    "the entrypoint guard must name this file, or npm run archive silently does nothing",
  );
});

/** A capture base inside a temp dir, with the given extensions present on disk. */
function captureWith(...exts: string[]): { base: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-"));
  const base = path.join(dir, "site-2026-08-02");
  for (const ext of exts) fs.writeFileSync(`${base}${ext}`, `body${ext}`);
  return { base, dir };
}

test("FINISH: with a .pdf present, the record names the .pdf — even when a .png also exists", () => {
  // BOTH present is the precedence case: an earlier --force re-capture can leave a stale
  // .png beside a fresh .pdf, and no test asserted which one wins on the RETURN (a sibling
  // test below checks the sidecar with all three present, but not this). A ternary swap
  // (.png checked first) would pass every other FINISH test unnoticed.
  const { base } = captureWith(".html", ".pdf", ".png");
  const rel = finishCapture(base, "body.html");
  assert.match(rel, /site-2026-08-02\.pdf$/);
  assert.ok(fs.existsSync(path.resolve(rel)), "the returned path must exist on disk");
  assert.ok(!path.isAbsolute(rel), "local_snapshot must be repo-relative, or it is wrong on every other clone");
});

test("FINISH: with only a .png, the record names the .png — not a .pdf we never wrote", () => {
  // THE BUG. page.pdf() fails on non-headless chromium and the fallback writes a .png,
  // but saveLocalCopy returned `${base}.pdf` unconditionally — so local_snapshot named a
  // file that does not exist, in a project whose whole basis is that cited evidence does.
  const { base } = captureWith(".html", ".png");
  const rel = finishCapture(base, "body.html");
  assert.match(rel, /site-2026-08-02\.png$/);
  assert.ok(fs.existsSync(path.resolve(rel)), "the returned path must exist on disk");
  assert.ok(!path.isAbsolute(rel), "local_snapshot must be repo-relative, or it is wrong on every other clone");
});

test("FINISH: with neither rendering, the record names the .html and it is hashed", () => {
  // An html-only capture is a DEGRADED SUCCESS, not a failure: page.content() is what we
  // actually fetched, and 7 providers' prices exist only in the HTML. It must be hashed —
  // an unhashed body is pushed unverified and later deadlocks the whole sync (issue #7).
  const { base } = captureWith(".html");
  const rel = finishCapture(base, "body.html");
  assert.match(rel, /site-2026-08-02\.html$/);
  assert.ok(fs.existsSync(path.resolve(rel)));

  const sidecar = fs.readFileSync(`${base}.sha256`, "utf8").trim().split("\n");
  assert.equal(sidecar.length, 1, "exactly one artifact was captured, so one line");
  assert.match(sidecar[0], /site-2026-08-02\.html$/);
});

test("FINISH: the sidecar lists every artifact present, and only those", () => {
  const { base } = captureWith(".html", ".pdf", ".png");
  finishCapture(base, "body.html");
  const listed = fs
    .readFileSync(`${base}.sha256`, "utf8")
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/)[1])
    .sort();
  assert.deepEqual(listed, [
    "site-2026-08-02.html",
    "site-2026-08-02.pdf",
    "site-2026-08-02.png",
  ]);
});

test("ORPHAN: the .png fallback failing must not abort before the sidecar", () => {
  // If page.pdf() fails AND page.screenshot() then throws, the error used to propagate
  // out of saveLocalCopy before finishCapture ran — leaving the .html on disk with no
  // .sha256. That orphan is one of issue #7's two deadlock triggers: sync pushes it
  // unverified (no sidecar => no hash to check), then the next successful capture writes
  // different bytes WITH a sidecar, tripping the append-only rule and refusing the entire
  // push for every provider.
  //
  // This test pins the SOURCE-level guarantee: the pdf+screenshot pair sits inside an outer
  // try/catch, so nothing between the .html write and finishCapture can throw past it — not a
  // REJECTION (the inner .catch covers that) and not a SYNCHRONOUS throw from page.pdf or
  // page.screenshot (a .catch alone never sees those; only the outer try does).
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "archive.ts"), "utf8");
  const block = src.slice(
    src.indexOf("const html = await page.content()"),
    src.indexOf("return finishCapture("),
  );
  assert.match(
    block,
    /try\s*\{[\s\S]*?await page\.pdf\([\s\S]*?\.catch\([\s\S]*?await page\.screenshot\([\s\S]*?\}\s*catch \(e\) \{/,
    "page.pdf/page.screenshot must sit inside an outer try, or a synchronous throw orphans the body",
  );
  assert.match(block, /alleen HTML/, "and it must say so — a silent degraded capture reads as a full one");
  assert.match(
    block,
    /String\(e\)/,
    "(e as Error).message throws on a nullish rejection — the very thing this catch exists to survive",
  );
});

test("HALF-RECORD: a failed capture must not let Wayback write alone", () => {
  // CLAUDE.md: "ALWAYS both" — a public archive AND a dated local copy. If the local
  // capture threw and the Wayback submission then succeeded, the node got an archived_url
  // with no local_snapshot: a record claiming a public archive it holds no local copy for,
  // which is the exact inverse of what methodologie.md publishes.
  //
  // submitWayback THROWS here, so "never submitted" is enforced rather than merely
  // observed after the fact.
  const boom: Capture = async () => {
    throw new Error("net::ERR_NAME_NOT_RESOLVED");
  };
  const node = nodeFrom("id: unreachable\nurl: https://example.invalid/x\n");
  return captureNode(
    node,
    "demo",
    deps({
      capture: boom,
      skipWayback: false,
      submitWayback: async () => {
        throw new Error("must not submit when the local capture failed");
      },
    }),
  ).then((r) => {
    assert.equal(r.failedCapture, "unreachable");
    assert.equal(node.get("archived_url"), undefined, "no public archive without a local copy");
    assert.equal(node.get("local_snapshot"), undefined);
    assert.equal(r.changed, false, "nothing was written, so nothing needs saving");
  });
});
