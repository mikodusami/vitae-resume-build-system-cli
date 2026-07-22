# vitae

A TypeScript CLI that builds resume variants as `.docx` files from typed
content. The tool knows about _formats_; your actual resume content lives in a
local `.vitae/` folder it discovers and reads — the same split as `git` (one
installed tool, one repo per project).

Full design: [systemdesign.archiecture.md](systemdesign.archiecture.md).
Build order: [layers.md](layers.md).

## Status

**Layer 1 (Domain Core) — built.** The pure heart of the application: the
content model, the composition engine, the claims policy, and the
rendering-agnostic document IR. No filesystem, no docx, no CLI yet — those are
later layers, and the domain is deliberately unable to reach them.

**Layer 3 (Theme & Rendering) — built.** A composed document now renders to a
real `.docx` (themed, with proper bullet numbering and right-aligned dates) and
to plain text. Writing files to `dist/` is Layer 4's job — renderers return a
buffer and stop.

| Layer                    | State                                           |
| ------------------------ | ----------------------------------------------- |
| 1 — Domain core          | ✅ built                                        |
| 2 — Workspace & loading  | ✅ built                                        |
| 3 — Theme & rendering    | ✅ built                                        |
| CLI shell                | ✅ runnable (`where/list/demo/text/check/prep`) |
| 4 — App layer & `build`  | not started                                     |
| 5+ — init, archive, diff | not started                                     |

## Getting started

```bash
npm install
npm run typecheck && npm run lint && npm test
```

Then install the `vitae` command globally:

```bash
npm run link
```

That builds `src/` to `dist/` and links the `bin` entry, so `vitae` works from
any directory. `npm run unlink` removes it.

```bash
vitae --help          # what exists now, and what is still planned
vitae where           # which .vitae/ folder resolved, and its paths
vitae list            # variants, projects, defensibility status
vitae demo            # compose a variant and print its document outline
vitae text            # render a variant as plain text (ATS-safe); --width N
vitae check           # claims gate; exits 1 if a claim cannot be defended
vitae prep            # interview checklist from that variant's review notes
```

Content is read from the nearest `.vitae/` folder, searching up from the
current directory the way `git` finds `.git/`, then falling back to `~/.vitae`.
`--dir <path>` or `VITAE_DIR` overrides discovery. With no workspace anywhere,
commands fall back to built-in sample content and say so — but a workspace that
*exists and fails to load* is a hard error, never a silent fallback.

`tests/fixtures/workspace/` is a complete, valid workspace you can try it
against:

```bash
vitae list --dir tests/fixtures/workspace/.vitae
```

`init`, `build`, and `diff` exit 2 with a message naming the layer that will
deliver them rather than pretending to work. To produce an actual `.docx`
before `vitae build` exists:

```bash
npx vite-node examples/renderDocx.ts data-engineer /tmp/resume.docx
```

There is also a runnable script covering the same ground without installing:

```bash
npx vite-node examples/composeDemo.ts
```

Step-by-step verification flows live in [userflows.md](userflows.md).

## Architecture

Clean/Hexagonal layering; imports may only point inward.

```
src/
├── domain/     # content model, document IR, composition, claims policy, ports
│   ├── model/       ContentLibrary + content types
│   ├── document/    ResumeDocument — the semantic, presentation-free IR
│   ├── services/    ResumeComposer, ClaimsResolver, ClaimsPolicy
│   ├── ports/       ContentRepository, Renderer<T> (interfaces only)
│   ├── errors/      DomainError hierarchy with stable codes
│   └── primitives/  Result<T, E>
├── app/        # (later) orchestration: decides what blocks a build
├── infra/      # the anti-corruption layer: nothing untrusted reaches domain/
│   ├── workspace/   Workspace — every "where does X live" answer
│   ├── loader/      ModuleLoader port, jiti adapter, in-memory fake
│   ├── schema/      zod schemas bound to domain types + diagnostic mapper
│   ├── config/      config.json, with defaults and forward compatibility
│   └── content/     FileContentRepository — the ContentRepository port
├── render/     # everything presentational — fonts, sizes, spacing, margins
│   ├── theme/       Theme, DEFAULT_THEME, ThemeLoader (merges over defaults)
│   ├── docx/        StyleResolver, block registry, DocxRenderer
│   └── text/        PlainTextRenderer — takes no theme, by design
└── cli/        # command dispatch + built-in sample content
    ├── main.ts       argv dispatch, exit codes, usage
    └── commands/     where, demo, text, list, check, prep
```

Four load-bearing ideas, recorded in [decisions.md](decisions.md):

- **The domain's product is a semantic IR**, not a document. `ResumeDocument`
  says a run of text is a `name` or a `link`; it never says 14pt Calibri. New
  output formats are new adapters, not domain changes.
- **Errors are values.** Operations return `Result<T, E>` and _accumulate_ —
  three bad project IDs give three errors in one run.
- **Composition is independent of validation.** `compose` never refuses to
  build over an undefendable claim; a later layer decides whether that blocks
  writing a file.
- **The dependency rule is enforced by ESLint**, not by discipline — `domain/`
  cannot import `fs`, `docx`, or a sibling layer without failing `npm run lint`.
- **Schemas are bound to domain types, not inferred from them.** Every zod
  schema is annotated `z.ZodType<DomainType>`, so adding a field to the domain
  and forgetting the schema breaks the build instead of confusing a user at
  runtime. The domain leads; the boundary follows.
- **Two renderers ship, on purpose.** `PlainTextRenderer` takes no theme at
  all. If the IR ever quietly becomes docx-shaped, that renderer breaks
  immediately — while the design is still cheap to fix.

## Scripts

| Script              | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit` under strict settings        |
| `npm run lint`      | ESLint, including layer-boundary rules      |
| `npm test`          | Vitest, in-memory fixtures, zero filesystem |
| `npm run build`     | Emits `src/` to `dist/`                     |
| `npm run link`      | Builds, then `npm link`s the `vitae` binary |
| `npm run unlink`    | Removes the global `vitae` binary           |
