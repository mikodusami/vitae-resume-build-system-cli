# Troubleshooting

Every diagnostic carries a stable `code`. Find it here.

Start with:

```bash
vitae doctor
```

It reports the resolved workspace, variant count, git status, which optional
programs you have, and any content problems — the fastest way to tell "my
environment is wrong" from "my content is wrong".

---

## Workspace and loading

### `WORKSPACE_NOT_FOUND`

No `.vitae/` folder resolved. The message lists every path tried.

- Run `vitae init` to create one.
- Or `--dir /path/to/.vitae`, or set `VITAE_DIR`.
- Note that `--dir` pointing at a nonexistent path fails immediately rather
  than falling back to discovery — silently building the wrong resume would be
  worse than an error.

### `MISSING_CONTENT_FILE`

A required file under `content/` is absent. The message names the expected
path. All six are required: `header`, `education`, `work`, `projects`,
`leadership`, `claims`. The same code covers a missing `variants/` directory.

An empty file will not do — each must have a default export of the right shape.

### `MODULE_LOAD_FAILED`

Your TypeScript did not execute — usually a syntax error, sometimes a throw.
The message names the file and the first line of the underlying error.

Also produced when the tool cannot tell what to use: no exports at all, or
several named exports with no default. Add `export default`.

### `SCHEMA_VALIDATION_FAILED`

A file loaded but did not match its schema.

```
variants/backend.ts: skills[2].label — expected string, received number
content/header.ts: bullet — unknown field — check for a typo, or remove it
```

The field path is written the way you would write it. Content objects are
**strict**: an unknown key is an error rather than being ignored, because a
mistyped `bullet:` that silently vanishes from a resume is worse than a loud
failure.

See [content-schema.md](content-schema.md) for every field and its rules.

### `VARIANT_ID_MISMATCH`

A variant's `id` disagrees with its filename. Rename the file or change the
`id` so they agree. This is reported rather than guessed at, because ambiguity
about which name wins costs an hour the day it finally matters.

### `DUPLICATE_ID`

Two projects, claims, or variants share an id. Ids must be unique within their
collection.

### `CONFIG_INVALID`

`config.json` exists but is not valid JSON, or a value has the wrong type.
Unknown *keys* only warn — that is forward compatibility, so a config written
by a newer version does not break an older tool.

---

## Composition

### `UNKNOWN_PROJECT`

A variant lists a `projectId` that no project defines. Check for a typo, and
remember ids are the `id` field in `projects.ts`, not project names.

Every unknown id in a run is reported at once, so fix them all in one pass.

### `UNKNOWN_JOB`

A variant's `jobIds` names an id that no entry in `work.ts` defines. Same fix
as `UNKNOWN_PROJECT`: check for a typo against `id`, not `title`. If you don't
need per-variant job selection at all, delete `jobIds` from the variant —
every job in `work.ts` shows by default.

### `UNKNOWN_CLAIM`

A project's `claimId` has no matching entry in `claims.ts`. Every project needs
a claim — that is the mechanism working, not an inconvenience.

### `UNKNOWN_VARIANT`

The variant you named does not exist. `vitae list` shows the valid ids, which
are the filenames in `variants/`.

---

## Claims

### `CLAIM_CANNOT_DEFEND` — error, exit `2`

A project on this resume is marked `cannot-defend`, so **nothing was written**.
Working as intended.

Your options, in order of preference:

1. Review the work and flip the tier to `confident` or `needs-review`.
2. Remove that project from the variant's `projectIds`.
3. `--force`, if you have consciously decided otherwise.

If you find yourself forcing routinely, the registry has stopped describing
reality — update the tiers rather than continuing to override.
See [claims.md](claims.md).

### `CLAIM_NEEDS_REVIEW` — warning

The file was still written. Run `vitae prep <variant>` for a checklist built
from that claim's `reviewNotes` before the interview.

---

## Archiving

All of these are **warnings**. The `.docx` is still written — losing the build
because provenance could not be recorded would be the wrong trade.

### `ARCHIVE_NO_GIT`

`.vitae/` is not a git repository, so the archive is stamped `nogit` and
`git show` cannot reconstruct it. Fix:

```bash
cd .vitae && git init && git add -A && git commit -m "resume content"
```

### `ARCHIVE_DIRTY`

You have uncommitted changes, so the archive is stamped `a1b2c3d-dirty` — that
commit does **not** contain what was built. Commit first if you want the
archive to be reconstructible. The suffix exists because a false clean stamp
would be worse than no stamp at all.

### `ARCHIVE_EXISTS`

An archive with that exact name already exists, meaning this content was
already archived today. It was left untouched — archives are append-only, a
historical record rather than a cache.

### `ARCHIVE_STAMP_FAILED` / `ARCHIVE_FAILED` / `ARCHIVE_UNAVAILABLE`

Provenance could not be read, the write failed, or no git adapter was wired in
(git is not installed). `vitae doctor` will say which.

---

## PDF and the page gate

### `CAPABILITY_UNAVAILABLE`

A feature needs a program you do not have. The message names the install step.

- LibreOffice: `brew install --cask libreoffice`, or from libreoffice.org.
- git: your package manager.

### `PAGE_BUDGET_EXCEEDED` — error

A variant renders to more pages than allowed. Cut a bullet, tighten
`spacing` in your theme (see [theming.md](theming.md)), or raise the limit:

```json
{ "pageLimit": 2 }
```

### `PAGE_BUDGET_SKIPPED` — warning

The page check could not run, almost always because LibreOffice is absent. The
check still passes — never a failure over an optional program, and never a
silent pass, because you need to know the gate did not run.

### `PDF_FAILED` / `PDF_CONVERSION_FAILED` / `PDF_UNAVAILABLE`

Conversion failed or was unavailable. The `.docx` was still written. A timeout
message suggests running `soffice --headless` once by hand — it is sometimes
very slow on first run.

### `PDF_SKIPPED`

You combined `--pdf` with `--format txt`. PDF conversion applies to docx
output.

### `PDF_READ_FAILED`

A produced PDF could not be parsed for page counting. Usually a corrupt or
truncated conversion; try again.

---

## Subprocesses and git

### `PROCESS_NOT_FOUND`

A binary was not on `PATH`. `vitae doctor` shows what was found.

### `PROCESS_TIMEOUT`

An external program overran its limit — 10s for git, 120s for LibreOffice.

### `PROCESS_FAILED`

A program exited non-zero. The message carries its stderr.

### `GIT_FAILED`

A git command failed — for example asking for `HEAD` in a repository with no
commits yet. Make an initial commit.

### `NOT_A_REPOSITORY`

`vitae diff` needs history. Run `git init` in `.vitae/` and commit.

---

## I/O and internal

### `IO_FAILED`

A write or directory creation failed; the message names the path. Check
permissions and disk space. Writes are atomic, so a failure never leaves a
truncated `.docx`.

### `UNKNOWN_FORMAT`

Only `docx` and `txt` are supported.

### `UNEXPECTED`

Something threw that should not have. Re-run with `--verbose` for the stack
trace — and please report it, since users are never supposed to see this.

---

## Symptoms without a code

### My changes to `src/` have no effect

The global `vitae` runs `dist/cli/bin.js`. Rebuild:

```bash
npm run build     # or: npm run link
```

This catches everyone at least once.

### It built the wrong resume

You are in a different workspace than you think — discovery walks *up*
directories, so a parent folder's `.vitae/` can win.

```bash
vitae where
```

It prints the root and which rule matched.

### `--json` output will not parse

Reports go to stdout and everything else to stderr, so this should not happen.
Check you are not capturing stderr (`2>&1`). If stdout genuinely contains
non-JSON, that is a bug worth reporting.

### The bullets are not real bullets in Word

They should be — the renderer emits list numbering rather than literal `•`
characters, and there is a test asserting no `•` appears in the output. If you
see otherwise, report it.

### The output is A4 / the wrong size

Page size is set explicitly from the theme. Check `page.width`/`page.height`.

### Dates are not flush right

Split lines are borderless two-cell tables sized from your page geometry, so
this should hold regardless of margins.

If you are on a version before that change, the symptom was specific: the date
sat right next to the title looking "squeezed", and clicking before it and
pressing Tab snapped it into place. That was a right tab stop being dropped on
import — Apple's stack (Quick Look, Preview, Pages) discards custom tab stops
outright, and Google Docs lost the tab character. Rebuild with a current
version.

### My theme.ts says `rightTab` is an unknown field

That setting no longer exists — remove the line. The right-hand column is now
derived from `page.width - 2 × page.margin`.

### Project links aren't clickable

Rebuild with a current version. Project links used to render as styled text
only — the right size and colour, but no actual link behind it in any viewer.
They're now real `<w:hyperlink>` fields with a proper relationship target, so
a current build fixes this with no content changes on your end. See
[content-schema.md](content-schema.md) for how the `link` field becomes an
href (a scheme is added automatically if you didn't write one).
