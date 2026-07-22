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

Layer 4 (built) is `src/app/` — use cases and orchestration:

- `usecases/` — one class per thing a user can do, one public `execute`.
  Adding a command means adding a class, never editing a shared service.
- `reports/` — plain data returned instead of printing. `blocked` (policy
  refused) is deliberately distinct from `failed` (something broke).
- `ports/` — `ArtifactWriter`, `ProgressListener`, `WorkspacePaths`. The last
  one is declared here rather than importing infra's `Workspace`, which
  satisfies it structurally; `joinPath` is injected for the same reason.
- `Application.ts` — the facade. Memoizes the load *promise*, so `build --all`
  reads content once and racing callers cannot double-load.

**The hard rule here: `app/` never prints and never exits.** No `console`, no
`process.exit`, no `fs`, no `docx`. ESLint enforces all of it. If a report
lacks what the CLI needs to print a good message, enrich the report type —
never add a `console.log`. The enforcement decision (undefendable claim blocks
the write, `--force` overrides) lives in `BuildVariantUseCase`, one branch, by
design.

Layer 5 (built) is the rest of `src/cli/`:

- `main.ts` builds the Commander tree and exports `runCli(argv, output)`;
  `bin.ts` is the executable. **Only these know what argv is.** Keeping them
  separate is what lets tests drive the real CLI in-process.
- `bootstrap.ts` is the **only** place concrete adapters are constructed. A
  `new JitiModuleLoader(...)` anywhere else breaks the property that makes the
  app layer testable against fakes. (`RendererFactory` constructing
  `DocxRenderer` is the deliberate exception — that is format selection, which
  Layer 4 owns.)
- `presenters/` — `HumanPresenter` and `JsonPresenter` behind one interface.
  **Reports go to stdout, everything else to stderr**, or `--json | jq`
  breaks. All colour goes through `Colorizer`, which disables itself under
  `--no-color`, `--json`, a non-TTY, or `NO_COLOR`.
- `exitCodes.ts` — the only thing that decides an exit code: `0` success,
  `1` broken, `2` blocked by the claims policy. When a run is both, `1` wins.
- `commands/` — thin adapters: translate args, call a use case, present, return
  a code. If a handler starts branching on claim tiers or formats, that logic
  belongs in `app/`. Keep them under ~30 lines.
- `templates/files.ts` — `init` scaffolding as string constants, not files on
  disk, so packaging needs no copy step and survives `npm link`.
- `errorBoundary.ts` — one wrapper; stacks only under `--verbose`, `EPIPE`
  treated as success.

`no-console` is enforced across `src/cli/` too; `output.ts` is the single
sanctioned exception. There is no built-in sample content any more — a missing
workspace is a diagnostic suggesting `vitae init`.

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
