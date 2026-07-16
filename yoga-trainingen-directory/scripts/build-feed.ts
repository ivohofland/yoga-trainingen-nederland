/**
 * Writes public/notities/feed.xml from the posts, in the build chain BEFORE
 * next build (which then copies public/ into out/). The same static-artifact
 * pattern as scripts/export-json.ts — and the reason the feed needs no route
 * handler, which next.config.ts documents this site does not ship.
 */
import fs from "node:fs";
import path from "node:path";
import { readAllNotes } from "../src/lib/notes";
import { renderFeed } from "../src/lib/feed";

const notes = readAllNotes();
const outDir = path.join(process.cwd(), "public", "notities");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "feed.xml"), renderFeed(notes), "utf8");
console.log(`✓ build-feed: wrote public/notities/feed.xml (${notes.length} note(s))`);
