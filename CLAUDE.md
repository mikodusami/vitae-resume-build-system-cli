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

Layer 2 (built) is `src/infra/` — the anti-corruption layer. Everything
crossing in from disk is untrusted, and nothing reaches the domain unverified,
which is what lets Layer 1 assume well-formed inputs:

- `workspace/Workspace.ts` — resolves `.vitae/` (explicit dir → `VITAE_DIR` →
  walking up from cwd → `~/.vitae`) and owns every derived path. Ask it rather
  than re-deriving paths anywhere else.
- `loader/` — `ModuleLoader` port, `JitiModuleLoader` (runtime TS, caching off),
  `FakeModuleLoader` for tests. Module execution is abstracted; plain `fs`
  reads deliberately are not.
- `schema/contentSchemas.ts` — zod schemas annotated `z.ZodType<DomainType>`.
  **Never use `z.infer`** — the annotation is what turns domain/schema drift
  into a compile error. Content objects are `strictObject`; `config.json` is
  not, so newer configs don't break older tools.
- `schema/mapper.ts` — the single `ZodError` → diagnostic translation. No zod
  or jiti stack trace may reach a user; everything funnels through here.
- `content/FileContentRepository.ts` — the `ContentRepository` implementation.
  Aggregates: never stop at the first bad file.

Layer 3 (built) is `src/render/` — everything presentational. Theme enters the
system here and nowhere earlier:

- `theme/` — `Theme`, `DEFAULT_THEME`, and `ThemeLoader`. **Units differ within
  one object**: DXA (1440 = 1 inch) for lengths, half-points for `sizes`,
  eighths of a point for border size. Themes are deep-partial and merge over
  the defaults; a missing theme file means defaults, not an error.
- `docx/StyleResolver.ts` — the only code that reads `theme.sizes`. Restyling
  happens here or in the theme, never in a block renderer.
- `docx/blocks/registry.ts` — handlers keyed by block kind via a mapped type
  over the IR union, so a missing kind is a compile error. Add a block kind →
  add a handler.
- `docx/DocxRenderer.ts` / `text/PlainTextRenderer.ts` — both behind
  `Renderer<T>`. No format-selection logic lives in this layer.

Rules here: the renderer never "improves" content (nothing inferred,
reordered, or injected that the IR did not say — if output needs something the
IR cannot express, change the domain). `PlainTextRenderer` must never need a
theme; if it does, the IR has leaked. Nothing in `src/render/` writes to disk.
Determinism is asserted on `word/document.xml`, not whole buffers — see
`decisions.md` for why byte-identity is unreachable with docx 9.x.

`src/cli/` dispatches argv (`main.ts`) with commands in `commands/`.
Rules that keep it honest:

- `contentSource.ts` decides provenance. No workspace anywhere → built-in
  sample content with a stderr note. Workspace found but broken → print
  diagnostics and exit 1, **never** fall back. Silently building the sample
  resume because the user's content has a typo is the worst failure mode
  available.
- Commands in `PLANNED_COMMANDS` (`init`, `build`, `diff`) exit 2 with the
  layer that will implement them. Move one out of that map only when it
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
- Domain tests use in-memory fixtures from `tests/domain/fixtures.ts` — no
  filesystem. Infra tests use real temp directories (`tests/infra/fixtures.ts`)
  plus `tests/fixtures/workspace/`, a genuine valid `.vitae/` folder that will
  double as the `vitae init` template seed.

See `decisions.md` for the reasoning behind each of these, `userflows.md` for
how to verify a layer by hand, and `layers.md` for the build order.
