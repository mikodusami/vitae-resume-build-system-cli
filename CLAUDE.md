@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run lint        # ESLint, including the layer-boundary rules
npm test            # vitest run
npm run build       # emit src/ to dist/
npm run link        # build, then npm link the `vitae` binary (unlink to remove)
npx vite-node examples/composeDemo.ts   # exercise the domain by hand
```

The linked binary runs `dist/cli/main.js`, so **re-run `npm run build` after
changing `src/` or the global `vitae` keeps running the old code.**

Run a single test by name with `npx vitest run -t "<name>"`.

## Architecture

Clean/Hexagonal. Imports point inward only: `cli → app → domain`,
`infra → domain`. `domain/` imports nothing from siblings and no Node
built-ins — this is enforced by `no-restricted-imports` in `eslint.config.js`,
so a violation fails `npm run lint` rather than merely being frowned upon.

Layer 1 (built) is `src/domain/`:

- `model/` — content types and `ContentLibrary`, the sole owner of ID lookup.
  `ContentLibrary.create` rejects duplicate IDs; the constructor is private.
- `document/` — `ResumeDocument`, a semantic, presentation-free IR. Text runs
  carry roles (`name`, `body`, `meta`, `link`, `sectionHeading`), never fonts
  or sizes. `splitLine` is the "left text, right-aligned date" abstraction.
- `services/` — `ResumeComposer` (variant + library → IR), `ClaimsResolver`,
  `ClaimsPolicy` (injectable severity mapping).
- `ports/` — `ContentRepository`, `Renderer<T>`: interfaces the domain declares
  and never implements.
- `primitives/`, `errors/` — `Result<T, E>` and `DomainError` subclasses with
  stable `code` values the CLI formats and tests assert on.

`src/domain/index.ts` is the only entry point outer layers should import from.

`src/cli/` is a thin shell shipped ahead of its layer: `main.ts` dispatches
argv, and `commands/` holds `demo`, `list`, `check`, and `prep` — everything
the domain can answer without I/O. Two rules keep it honest:

- Content comes from `src/cli/sampleContent.ts` until Layer 2's loader exists,
  and `--help` says so. Do not add a command that reads the filesystem here;
  that belongs to `infra/` behind the `ContentRepository` port.
- Commands in `PLANNED_COMMANDS` (`init`, `build`, `where`, `diff`) exit 2 with
  the layer that will implement them. Move one out of that map only when it
  genuinely works.

Exit codes: 0 success, 1 failure (unknown ID, error-severity diagnostic),
2 usage (unknown or unimplemented command).

Two invariants worth restating before changing anything here: the domain must
not import `fs` or `docx`, and `ResumeDocument` must stay presentation-free. If
it starts producing docx objects directly, the layer has failed even if the
tests pass.

## Conventions

- ESM throughout; relative imports carry the `.js` extension (NodeNext).
- Single quotes, semicolons, trailing commas, ~100 char lines.
- Errors are returned as `Result`, not thrown; resolution errors accumulate so
  one run reports every bad ID. `throw` is for programmer bugs only.
- Tests use in-memory fixtures from `tests/domain/fixtures.ts` — no filesystem.

See `decisions.md` for the reasoning behind each of these, `userflows.md` for
how to verify a layer by hand, and `layers.md` for the build order.
