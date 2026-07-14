# Archives — what is here, and what is not

Every source cited in this directory is snapshotted twice: in a **public web
archive** (Wayback Machine, or archive.today where a domain is excluded from
Wayback) and as a **dated local copy**. The two cover each other's weakness. A
public archive is independent, but a site owner can have their domain excluded —
and then the historical snapshots vanish too. A local copy cannot be withdrawn by
anyone, but it is less independent; git's history records when it was made.

## What this directory publishes

**`*.sha256` — the fingerprint of each local snapshot.** These are published, one
per snapshot, and they are the point: a hash proves that a specific file existed
on a specific date and has not been altered since, *without republishing the
file*. Git's history dates the hash. If a provider changes a page and disputes
what it previously said, the hash pins the copy — and the copy can be produced.

**`*.md` — our own reading notes, and NOT EVIDENCE.** A handful survive from
before the archive script existed: text extracted by hand from a web fetch, with
the claim-bearing quotes picked out. They were never a capture of anyone's page —
they are a file *we* composed — and for a while five records cited one as their
`local_snapshot`. The provenance check duly opened them, searched them for the
price the record claimed, found the price we ourselves had typed in, and passed:
seven claims about four named businesses "verified" against our own summary.

Every one of those pages is now properly archived, and a `.md` snapshot is a
**load error** (`integrityErrors`). A snapshot is a capture of a page a reader saw.
If we wrote it, it is a note, and notes evidence nothing. These files stay only as
the research record of how those entries were first made.

## What this directory does not publish, and why

**The snapshot bodies (`*.pdf`, `*.html`) are not in this repository.** They are
held locally and in a private, git-dated archive repository.

This is a deliberate line, not an oversight. This project quotes providers
verbatim, and a proportionate quote for the purpose of criticism and review sits
squarely inside Dutch citaatrecht (Art. 15a Auteurswet). Republishing a
provider's entire brochure or a complete mirror of their site is a different act:
it is redistribution, not quotation, and citaatrecht does not cover it. The
evidentiary value of a local copy comes from *holding* it, dated — not from the
world being able to download it. So we hold it, we publish the hash, and we
produce the copy when someone has cause to check it.

## Verifying a snapshot

Ask for the copy, then:

```bash
shasum -a 256 -c <source-id>-<date>.sha256
```

The hash in this repository is dated by git. If it matches, the copy you were
given is byte-for-byte the one that was captured on that date.

## Regenerating

`npm run archive -- --all` writes new snapshots. Bodies stay local (gitignored);
their `.sha256` files are committed here. Commit new bodies to the private
archive repository so that git continues to date them — that dating is what gives
them their weight.
