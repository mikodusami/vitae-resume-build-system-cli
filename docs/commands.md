# Command reference

## Global options

Available on every command.

| Option          | Effect                                                              |
| --------------- | ------------------------------------------------------------------- |
| `--dir <path>`  | use this workspace instead of discovering one                        |
| `--json`        | emit machine-readable JSON on stdout                                 |
| `--no-color`    | disable ANSI colour                                                  |
| `--verbose`     | print stack traces for unexpected failures                           |
| `-v, --version` | print the version                                                    |
| `-h, --help`    | print help; also works per command (`vitae build --help`)            |

### Workspace discovery

Every command except `init` needs a workspace. Resolution order:

1. `--dir <path>` — if it does not exist, the command fails rather than falling
   through to discovery. Silently building the wrong resume is worse than an
   error.
2. `VITAE_DIR` environment variable.
3. Walk up from the current directory looking for `.vitae/`, stopping at the
   filesystem root — the same model `git` uses, so you can run commands from
   anywhere inside your resume repo.
4. `~/.vitae` as a final fallback.

If none match, the command exits `1` and lists every path it tried.
`vitae where` shows which rule won.

### stdout vs stderr

**Reports go to stdout. Everything else goes to stderr.** The workspace notice,
warnings, and progress are all stderr, which is what makes this safe:

```bash
vitae list --json | jq '.variants[].variantId'
```

If you ever see non-JSON on stdout under `--json`, that is a bug.

### Exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | success                                                             |
| `1`  | something is broken: bad content, I/O failure, unknown variant, bad usage |
| `2`  | blocked by the claims policy — a `cannot-defend` claim              |

`2` is deliberately distinct from `1` so a CI step or shell script can treat
"you have a claim you cannot back up" differently from "your content does not
load". When a run is **both** broken and blocked, `1` wins: fix what is broken
first, because the claim gate cannot be trusted until content actually loads.

---

## `vitae init [dir]`

Scaffolds a `.vitae/` workspace containing a complete example resume.

| Option    | Effect                              |
| --------- | ----------------------------------- |
| `--force` | overwrite an existing workspace     |

Without `--force`, an existing `.vitae/` causes a refusal and exit `1`; your
edits are left untouched. `dir` defaults to the current directory.

This is the only command that does not need a workspace, and the only one that
does not go through the application facade — it creates the thing every other
command requires.

---

## `vitae build [variant]`

Renders variants and writes them to `dist/`.

| Option            | Effect                                                        |
| ----------------- | ------------------------------------------------------------- |
| `--all`           | build every variant, continuing past failures                 |
| `--format <fmt>`  | `docx` (default) or `txt`                                     |
| `--force`         | build even when a claim cannot be defended                    |
| `--out <dir>`     | write here instead of the workspace `dist/`                   |
| `--archive`       | also write a dated, hash-stamped copy to `archive/`           |
| `--label <text>`  | who the archived copy is for, e.g. a company (needs `--archive`, single variant) |
| `--pdf`           | also convert to PDF (requires LibreOffice)                    |

With no argument, builds `defaultVariant` from `config.json`.

Output filenames come from `config.json`'s `output.filenamePrefix` (default
`resume`) plus the variant id with hyphens turned to underscores:
`resume_software_engineer.docx`.

**What blocks a build.** A `cannot-defend` claim on any project in the variant
returns `blocked`, writes nothing, and exits `2`. `--force` overrides it.
A `needs-review` claim warns and still writes the file — you need to be able to
build a resume for a project you have not reviewed yet, you just need to be
told.

`--all` never stops at the first failure. One broken variant must not hide the
status of the other three.

### `--archive`

Writes `archive/2026-07-22_software-engineer_a1b2c3d.docx` in addition to the
normal `dist/` build. The hash is the short commit of the content that produced
the build, so `git show a1b2c3d` reconstructs exactly what was sent.

Three provenance states, all visible in the filename:

| Situation                    | Stamp             | Also                         |
| ---------------------------- | ----------------- | ---------------------------- |
| clean working tree           | `a1b2c3d`         | —                            |
| uncommitted changes          | `a1b2c3d-dirty`   | `ARCHIVE_DIRTY` warning      |
| not a git repository         | `nogit`           | `ARCHIVE_NO_GIT` warning     |

Archives are **append-only**. A rebuild that would produce an existing filename
reports `ARCHIVE_EXISTS` and leaves the file alone — the archive is a
historical record, not a cache.

Rule of thumb: `--archive` whenever you actually send one; plain builds while
iterating.

### `--label`

The hash identifies the build for `git show`, but it is not what you remember
two weeks later when a recruiter replies. `--label` puts something you'll
actually recall into the filename:

```bash
vitae build data-engineer --archive --label "TechCorp"
# archive/2026-07-22_data-engineer_techcorp_a1b2c3d.docx
```

The label is slugified the same way variant ids are — lowercased, spaces and
punctuation collapsed to underscores — so `"Acme Data Team"` becomes
`acme_data_team`. It is free text; use a company name, a role title, whatever
you'd actually search the folder for later.

Only valid alongside `--archive`, and only for a single variant — `--all`
builds every resume in the workspace, and one label cannot name all of them.
Combining the two is a usage error, exit `1`.

For the full send-and-recall workflow — what to send, when to commit, how to
find an old application by company name — see
[the git workflow guide](git-workflow.md#applying-to-a-job).

---

## `vitae check [variant]`

Validates claims and composition. Writes nothing.

| Option    | Effect                                                    |
| --------- | --------------------------------------------------------- |
| `--pages` | also render, convert, and enforce the page limit           |

With no argument, checks every variant. Exits `2` when the only problems are
undefendable claims, `1` when something is actually broken.

`--pages` needs LibreOffice. Without it, every variant gets a
`PAGE_BUDGET_SKIPPED` warning and the check still passes — never a silent pass,
and never a failure just because an optional program is missing. The limit
defaults to one page; raise it with `"pageLimit": 2` in `config.json`.

---

## `vitae list`

Every variant with its projects and claim-tier counts. Always exits `0` even
when claims are unhealthy — listing reports, `check` gates.

---

## `vitae prep [variant]`

Generates an interview checklist as markdown, grouped by defensibility tier,
most urgent first, with review notes as `- [ ]` checkboxes.

| Option          | Effect                                        |
| --------------- | --------------------------------------------- |
| `--out <file>`  | write the markdown here instead of stdout     |

With `--out`, stdout stays empty and the confirmation goes to stderr.

The checklist is built from the claims of the variant you are actually sending,
so it cannot drift from what a recruiter is reading. See
[the claims guide](claims.md).

---

## `vitae diff <variant> <ref>`

Shows what changed in one variant's content since a git ref — a tag, a branch,
`HEAD~3`, a hash.

The diff covers exactly the files that variant reads: its own file plus the six
shared content modules. Not the other variants. That narrowing is the reason
this is a command rather than a `git diff` alias.

Requires git. Without a repository you get an actionable `git init` message
rather than a raw `fatal:`.

---

## `vitae text [variant]`

Renders a variant as plain text to stdout — useful for pasting into
application forms, and the fastest way to see what the renderer does with your
content without opening Word.

| Option        | Effect                        |
| ------------- | ----------------------------- |
| `--width <n>` | line width (default 80)       |

To write a `.txt` **file**, use `vitae build --format txt`.

---

## `vitae where`

Prints the resolved workspace root, which resolution rule matched (`--dir`,
`VITAE_DIR`, walked up, or home fallback), and every derived path.

Small command, disproportionately useful the first time a build touches a
folder you did not expect.

---

## `vitae doctor`

Reports the workspace, variant count, whether it is a git repository, and each
optional capability with its version and what it unlocks.

Exits `0` even when capabilities are missing — a machine without LibreOffice is
not a broken machine. Only unloadable content is a failure.

The first thing to run when a clone is not behaving.

---

## JSON output

Every report-producing command accepts `--json`:

```bash
vitae build --all --json | jq '.variants[] | {variantId, status, byteLength}'
vitae check --json       | jq '.variants[] | select(.passed | not)'
vitae list --json        | jq '.variants[].claimTiers'
vitae doctor --json      | jq '.capabilities'
```

Load failures are JSON too, on stderr: `{"diagnostics": [...]}`.

Diagnostics share one shape everywhere:

```json
{ "severity": "warning", "code": "CLAIM_NEEDS_REVIEW", "message": "…" }
```

`severity` is `error` or `warning`. Warnings never block anything. Every code
is listed in [troubleshooting](troubleshooting.md).
