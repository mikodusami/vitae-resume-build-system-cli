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

| Layer                | State       |
| -------------------- | ----------- |
| 1 — Domain core      | ✅ built    |
| 2 — Content loading  | not started |
| 3+ — Rendering / CLI | not started |

## Getting started

```bash
npm install
npm run typecheck && npm run lint && npm test
```

Then exercise the domain by hand:

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
├── infra/      # (later) filesystem loading, docx rendering
└── cli/        # (later) command dispatch
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

## Scripts

| Script              | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit` under strict settings        |
| `npm run lint`      | ESLint, including layer-boundary rules      |
| `npm test`          | Vitest, in-memory fixtures, zero filesystem |
| `npm run build`     | Emits `src/` to `dist/`                     |
