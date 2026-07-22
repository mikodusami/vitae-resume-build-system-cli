# vitae

A TypeScript CLI that builds resume variants as `.docx` files from typed
content — and refuses to build one containing a claim you can't defend.

The tool knows about _formats_. Your actual resume lives in a `.vitae/` folder
it discovers, the same way `git` is installed once and `.git/` is per-project.

```bash
npm i -g .        # or: npm run link
mkdir my-resume && cd my-resume
vitae init
vitae build --all
```

That produces four `.docx` files in `.vitae/dist/`, built from an example
resume you then replace with your own.

**Documentation:** [getting started](docs/getting-started.md) ·
[commands](docs/commands.md) · [content schema](docs/content-schema.md) ·
[claims registry](docs/claims.md) · [git workflow](docs/git-workflow.md) ·
[theming](docs/theming.md) · [architecture](docs/architecture.md) ·
[troubleshooting](docs/troubleshooting.md)

## Why this exists

Three problems with keeping resumes in Word:

- **You can't diff them.** Content here is TypeScript, so `git diff` shows
  exactly which bullet changed between the version you sent in March and the
  one you sent in June.
- **Variants drift.** A variant holds ordered project _ids_, never project
  text. Fix a bullet once and every resume showing it is fixed.
- **You can end up unable to defend what you sent.** That is what the claims
  registry is for — see below.

## Commands

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `vitae init [dir]`      | scaffold a `.vitae/` workspace with an example resume      |
| `vitae build <variant>` | render and write to `dist/`; `--all`, `--force`, `--format`, `--archive`, `--label`, `--pdf` |
| `vitae check [variant]` | validate claims and composition, writing nothing; `--pages` |
| `vitae list`            | variants, their projects, and defensibility status         |
| `vitae prep <variant>`  | interview checklist as markdown; `--out <file>`             |
| `vitae diff <variant> <ref>` | what changed in that variant's content since a git ref |
| `vitae text <variant>`  | print an ATS-safe plain-text version                       |
| `vitae where`           | which workspace resolved, and by which rule                |
| `vitae doctor`          | what this environment can and cannot do                    |

Global options: `--dir <path>`, `--json`, `--no-color`, `--verbose`.

**Exit codes** are meaningful, so CI can act on them: `0` success, `1` broken
(bad content, I/O failure, unknown variant), `2` blocked by the claims policy.

## The claims registry

This is the part with no equivalent in other resume tools, and the reason the
project exists.

Every project carries a tier in `content/claims.ts` saying how well you could
defend it in an interview **today**:

| Tier            | Effect                                                          |
| --------------- | --------------------------------------------------------------- |
| `confident`     | builds silently — you can explain every line of it               |
| `needs-review`  | builds with a warning, and `vitae prep` turns its notes into a checklist |
| `cannot-defend` | **`vitae build` refuses to write a resume containing it**       |

```ts
{
  id: 'tempo',
  defensibility: 'needs-review',
  reviewNotes: [
    'Reread the retry path; sketch what happens when a worker dies mid-job',
    'Know why at-least-once was the right trade, and what at-most-once would cost',
  ],
}
```

Because the checklist is generated from the claims of the variant you are
actually sending, it can never drift from what the recruiter is reading. When
you have genuinely reviewed something, flipping it to `confident` is a one-line
commit — and a dated record of when it became interview-safe.

Two framings of the same work (a general version and a governance-focused one)
are separate projects sharing a `claimId`, so the honesty layer treats them as
one thing you have to be able to defend.

### The loop

1. Flag a project `needs-review` with notes on what you'd need to reread.
2. `vitae prep software-engineer --out prep.md` — a checklist for exactly the
   resume you're about to send, with `- [ ]` boxes.
3. Work through it.
4. Flip the tier to `confident`. That commit is a dated record of when the
   project became interview-safe.

## Archiving what you sent

```bash
vitae build software-engineer --archive --label "TechCorp"
```

Writes `archive/2026-07-22_software-engineer_techcorp_a1b2c3d.docx` alongside
the normal `dist/` build. The hash is the commit of the **content that
produced it**, so when a recruiter replies about something you sent three
weeks ago, `git show a1b2c3d` reconstructs exactly what they're holding — but
nobody remembers a hash three weeks later. `--label` puts the thing you'll
actually search for, a company name, right in the filename.

That guarantee is enforced rather than assumed:

- Uncommitted changes produce `a1b2c3d-dirty` and a warning — the commit does
  not contain what was built, and the filename says so.
- No git repository produces `nogit` and a warning suggesting `git init`.
- Archives are **append-only**. A rebuild that would produce an existing name
  reports the skip and leaves the file alone; the archive is a historical
  record, not a cache.

Rule of thumb: `--archive --label <who>` whenever you actually send one, plain
builds while iterating. The full send-and-recall workflow — including for
someone new to git — is in [docs/git-workflow.md](docs/git-workflow.md).

## The one-page gate

```bash
vitae check --pages
```

Renders each variant, converts it, and counts pages — so your hard limit is a
test rather than something you eyeball. Over the limit is exit `1`; raise it
with `"pageLimit": 2` in `config.json`.

This needs **LibreOffice**, which is optional. Without it the check warns that
the gate was skipped and passes — never a silent pass, and never a failure just
because an optional program is missing. `vitae build --pdf` behaves the same
way. Install it with `brew install --cask libreoffice`, or from libreoffice.org.

`vitae doctor` tells you which capabilities this machine has and what each one
unlocks — the first thing to run when a clone isn't behaving.

## Workspace layout

```
.vitae/
├── config.json        owner, default variant, filename prefix
├── theme.ts           fonts, sizes, spacing — everything presentational
├── content/
│   ├── header.ts        name + contact line
│   ├── education.ts     institution, location, degree, date, GPA, coursework
│   ├── work.ts          job history, shared across variants
│   ├── projects.ts      every project, referenced by id
│   ├── leadership.ts    leadership entries + the awards line
│   └── claims.ts        the defensibility registry
├── variants/          one file per resume; the filename is its id
└── dist/              latest builds (gitignored)
```

Adding a resume means dropping a file in `variants/` — there is no registry to
update. Its `id` must match its filename; a mismatch is an error rather than a
silent guess.

Content is loaded at runtime through `jiti`, so there is no build step inside
`.vitae/`: edit a bullet, run the command. Every file is validated against a
schema on the way in, so a mistake reads like
`variants/backend.ts: skills[2].label — expected string, received number`
rather than a stack trace.

**Workspace discovery** searches up from the current directory (like `git`),
then falls back to `~/.vitae`. `--dir` or `VITAE_DIR` overrides it, and
`vitae where` tells you which rule matched.

## Development

```bash
npm install
npm run typecheck && npm run lint && npm test
npm run link          # build, then expose `vitae` globally
```

**Full documentation is in [docs/](docs/README.md)** — usage guides for every
command and content file, plus an architecture walkthrough and a traced build
pipeline. Verification flows for every layer are in
[userflows.md](userflows.md); the reasoning behind each design choice, with
dates, is in [decisions.md](decisions.md).

### Architecture

Clean/Hexagonal. Imports point inward only, and that rule is enforced by ESLint
rather than by discipline — `domain/` cannot import `fs` or `docx` without
failing `npm run lint`.

```
src/
├── domain/     content model, document IR, composition, claims policy, ports
├── infra/      the anti-corruption layer: workspace, loading, schemas, I/O
├── render/     everything presentational: theme, docx renderer, plain text
├── app/        use cases, reports, and what blocks a build
└── cli/        argv, composition root, presenters, exit codes, templates
```

Five ideas carry most of the weight:

- **The domain's product is a semantic IR**, not a document. It says a run of
  text is a `name` or a `link`, never 14pt Calibri. New output formats are new
  adapters, not domain changes.
- **Errors are values that accumulate.** Three bad project IDs give three
  errors in one run, not three build attempts.
- **Schemas are bound to domain types, not inferred from them.** Every zod
  schema is annotated `z.ZodType<DomainType>`, so adding a field to the domain
  and forgetting the schema breaks the build instead of confusing a user.
- **Two renderers ship on purpose.** `PlainTextRenderer` takes no theme at all;
  if the IR ever quietly becomes docx-shaped, it breaks immediately.
- **The app layer never prints and never exits.** Use cases return reports; the
  CLI turns them into output and exit codes.
- **External programs are optional ports.** git and LibreOffice sit behind
  interfaces with fakes for tests, so no test ever spawns them and no feature
  hard-fails when they're absent.

## Status

| Layer                    | State       |
| ------------------------ | ----------- |
| 1 — Domain core          | ✅ built    |
| 2 — Workspace & loading  | ✅ built    |
| 3 — Theme & rendering    | ✅ built    |
| 4 — Application services | ✅ built    |
| 5 — CLI & scaffolding    | ✅ built    |
| 6 — archive, PDF, prep, diff | ✅ built |

Everything in the v1 design is implemented. `--pdf` and `check --pages` need
LibreOffice; `--archive` stamping and `diff` need git. Everything else works
with neither installed.
