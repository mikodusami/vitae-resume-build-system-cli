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
| `vitae build <variant>` | render and write to `dist/`; `--all`, `--force`, `--format`|
| `vitae check [variant]` | validate claims and composition, writing nothing           |
| `vitae list`            | variants, their projects, and defensibility status         |
| `vitae prep <variant>`  | interview checklist from that variant's review notes       |
| `vitae text <variant>`  | print an ATS-safe plain-text version                       |
| `vitae where`           | which workspace resolved, and by which rule                |

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

## Workspace layout

```
.vitae/
├── config.json        owner, default variant, filename prefix
├── theme.ts           fonts, sizes, spacing — everything presentational
├── content/
│   ├── header.ts        name + contact line
│   ├── education.ts     degree, date, default coursework
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

Verification flows for every layer are in [userflows.md](userflows.md); the
reasoning behind each design choice is in [decisions.md](decisions.md).

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

## Status

| Layer                    | State       |
| ------------------------ | ----------- |
| 1 — Domain core          | ✅ built    |
| 2 — Workspace & loading  | ✅ built    |
| 3 — Theme & rendering    | ✅ built    |
| 4 — Application services | ✅ built    |
| 5 — CLI & scaffolding    | ✅ built    |
| 6 — archive, diff, PDF   | not started |

`diff` and `--archive`/`--pdf` are not implemented yet.
