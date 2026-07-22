# Architecture

`vitae` is a Clean/Hexagonal architecture in five layers. This document
explains what each layer owns, why the seams sit where they do, and which rules
are enforced mechanically rather than by good intentions.

## The dependency rule

Imports point **inward only**:

```
cli ──▶ app ──▶ domain
                  ▲
        infra ────┘
       render ────┘
```

- `domain/` imports nothing from its siblings, and **no Node built-ins**. No
  `fs`, no `path`, no `docx`, no `zod`.
- `app/` may know the domain and the renderers, but never concrete adapters or
  the terminal.
- `infra/` and `render/` implement interfaces the inner layers declare.
- `cli/` is the only layer that knows what argv is.

**This is enforced by ESLint, not discipline.** `eslint.config.js` contains
per-directory `no-restricted-imports` blocks; a violation fails `npm run lint`.
The app layer additionally has `no-console` and a ban on `process.exit`. Without
mechanical enforcement, layering erodes in about a week.

## The layers

### 1. `src/domain/` — the pure core

Zero I/O. Zero knowledge of docx, the filesystem, or the CLI. Everything else
depends on this; this depends on nothing.

| Directory     | Contents                                                          |
| ------------- | ----------------------------------------------------------------- |
| `model/`      | content types and `ContentLibrary`, the sole owner of ID lookup    |
| `document/`   | `ResumeDocument` — the semantic IR                                 |
| `services/`   | `ResumeComposer`, `ClaimsResolver`, `ClaimsPolicy`                 |
| `ports/`      | `ContentRepository`, `Renderer<T>` — declared, never implemented   |
| `primitives/` | `Result<T, E>`                                                     |
| `errors/`     | `DomainError` and subclasses with stable `code` values             |

**The key idea: the domain's product is a semantic IR, not a document.**

```ts
type TextRole = 'name' | 'body' | 'meta' | 'link' | 'sectionHeading';

type Block =
  | { kind: 'paragraph'; runs: TextRun[]; align?: 'left' | 'center' }
  | { kind: 'bullet'; runs: TextRun[] }
  | { kind: 'splitLine'; left: TextRun[]; right: TextRun[] };
```

A run of text knows it is a `name` or a `link`. It has no idea it is 15pt
Calibri. `splitLine` says "these two things sit on one line, pushed apart" —
the renderer decides that means a right tab stop at 7.5".

That single decision is what makes new output formats cheap: a PDF renderer, an
HTML portfolio, or an ATS-safe text variant are all new adapters over the same
IR, with no domain change.

**Errors are values, not exceptions.** Operations return
`Result<T, DomainError[]>`. Resolution failures are *expected* outcomes, and
the CLI needs to report several at once rather than dying on the first — three
bad project ids produce three errors in one run. `throw` is reserved for
programmer bugs.

### 2. `src/infra/` — the anti-corruption layer

Everything crossing in from disk is untrusted: a typo, a stale field name, a
half-finished edit. Nothing reaches the domain unverified, and *that* is what
lets Layer 1 assume well-formed inputs and never defensively re-check.

| Module                | Responsibility                                                |
| --------------------- | ------------------------------------------------------------- |
| `workspace/`          | resolves `.vitae/` and owns every derived path                 |
| `loader/`             | `ModuleLoader` port, jiti implementation, fake for tests       |
| `schema/`             | zod schemas and the single `ZodError` → diagnostic translation |
| `content/`            | `FileContentRepository` — the `ContentRepository` implementation |
| `config/`             | `config.json`                                                  |
| `process/`            | one `ProcessRunner` for all subprocess work                    |
| `git/`, `pdf/`, `capabilities/` | optional external programs                          |

Three decisions worth knowing:

**Schemas are bound to domain types, never inferred from them.**

```ts
const projectSchema: z.ZodType<Project> = z.strictObject({ … });
```

This is the inverse of the usual `z.infer` habit and it is deliberate: the
domain leads, the boundary follows. Add a field to the domain `Project` and
forget the schema, and **the build breaks** — drift becomes a compile error
instead of a runtime surprise.

**Abstract what is hard to fake, not everything.** Executing user TypeScript at
runtime is genuinely awkward to test, so it sits behind `ModuleLoader`. Plain
`fs` reads are *not* abstracted — those are tested against real temp
directories, because faking `fs` would be ceremony that mostly tests the mock.

**Diagnostics aggregate and carry provenance.** A load returns *every* problem,
each naming the file and the field path. All loading errors extend
`DomainError`, so the CLI has one formatting path for domain and load failures
alike, and no zod or jiti stack trace ever reaches a user.

### 3. `src/render/` — everything presentational

Theme enters the system here and nowhere earlier.

- `theme/` — `Theme`, `DEFAULT_THEME`, `ThemeLoader` (deep-partial, merged).
- `docx/StyleResolver.ts` — the **only** code that reads `theme.sizes`.
  Restyling happens here or in the theme, never in a block renderer.
- `docx/blocks/` — one handler per block kind, assembled into a typed registry.
- `docx/DocxRenderer.ts`, `text/PlainTextRenderer.ts` — both behind
  `Renderer<T>`.

The registry is worth a look, because it is a pattern that buys two properties
at once:

```ts
type BlockRendererMap = {
  [K in Block['kind']]: BlockRenderer<Extract<Block, { kind: K }>>;
};
```

A mapped type over the IR union gives **pluggability** (add a block kind → add
a handler) *and* **exhaustiveness** (TypeScript refuses to compile a registry
missing a kind). Reach for this whenever "open for extension" and "prove
nothing was forgotten" both matter.

Rules here: the renderer never "improves" content — nothing inferred,
reordered, or injected that the IR did not say. And `PlainTextRenderer` must
never need a theme; if it ever does, the IR has leaked and that is a design bug
to fix in the domain.

Nothing in `src/render/` writes to disk.

### 4. `src/app/` — use cases and orchestration

| Directory   | Contents                                                            |
| ----------- | ------------------------------------------------------------------- |
| `usecases/` | one class per thing a user can do, one public `execute`             |
| `reports/`  | plain data returned instead of printing                             |
| `ports/`    | `ArtifactWriter`, `ProgressListener`, `WorkspacePaths`, environment capabilities |
| `naming/`   | `DefaultNaming`, `ArchiveNaming`                                    |
| `policy/`   | `PageBudgetPolicy`                                                  |
| `render/`   | `RendererFactory` — where a format name becomes a renderer          |

**The hard rule: `app/` never prints and never exits.** No `console`, no
`process.exit`, no `fs`, no `docx`. ESLint enforces all of it. Use cases return
reports; Layer 5 decides how to display them and what exit code they imply. If
a report lacks what the CLI needs to print a good message, the fix is a richer
report type — never a `console.log` in a use case.

Two report details that matter:

- `status: 'blocked'` is deliberately distinct from `'failed'`. Blocked means
  everything worked and policy refused to write; failed means something broke.
  Completely different user experiences, and the CLI must tell them apart.
- Ports the app needs are **declared here**, not imported from infra —
  including `WorkspacePaths`, which infra's `Workspace` satisfies structurally.
  Even `joinPath` is injected, so this layer never imports `node:path`.

`Application.ts` is the facade. It memoizes the load **promise**, not its
result, so `build --all` reads content once and two concurrent callers cannot
both trigger a load.

### 5. `src/cli/` — argv, wiring, presentation

- `main.ts` builds the Commander tree and exports `runCli(argv, output)`;
  `bin.ts` is the executable. Keeping them separate is what lets tests drive
  the real CLI in-process.
- **`bootstrap.ts` is the only place concrete adapters are constructed.** A
  `new JitiModuleLoader(...)` anywhere else breaks the property that makes the
  app layer testable against fakes. (`RendererFactory` constructing
  `DocxRenderer` is the deliberate exception — that is format selection, which
  Layer 4 owns.)
- `presenters/` — `HumanPresenter` and `JsonPresenter` behind one interface.
  **Reports to stdout, everything else to stderr**, or `--json | jq` breaks.
- `exitCodes.ts` — the only thing that decides an exit code.
- `commands/` — thin adapters: translate args, call a use case, present, return
  a code. Under ~30 lines each.
- `templates/files.ts` — `init` scaffolding as string constants, so packaging
  needs no copy step and survives `npm link`.

## Optional external programs

git and LibreOffice are **capabilities the environment may or may not
provide**, not requirements. Both sit behind ports declared in
`app/ports/environment.ts` (`ContentStamper`, `SourceDiffer`, `PdfConverter`,
`PageCounter`) with adapters in infra.

`bootstrap.ts` probes once through `CapabilityRegistry` and wires the adapters
**only if present**. That is what makes every consumer degrade with a warning
instead of failing: no LibreOffice means `--pdf` warns and the page gate
reports it was skipped; no git means archives stamp `nogit` and warn.

All subprocess work goes through one `ProcessRunner` — spawning, timeouts,
output capture, error normalization written once. Arguments are always passed
as an array, never through a shell, so a variant name or git ref can never be
interpreted as a command. `FakeProcessRunner` serves every test, so **no test
in this project ever spawns a real `git` or `soffice`.**

## Testing strategy

| Layer     | Approach                                                            |
| --------- | ------------------------------------------------------------------- |
| domain    | in-memory fixtures, no filesystem at all                            |
| infra     | real temp directories + a committed fixture workspace                |
| render    | unzip the produced `.docx` and assert on `word/document.xml`         |
| app       | fakes for every port; zero disk access                              |
| cli       | drive `runCli` in-process with a capturing output channel            |

The highest-value test in the project is `tests/cli/onboarding.test.ts`: it
runs `init` then `build --all` in a temp directory and asserts four real
`.docx` files came out. It walks the exact path a stranger takes on day one, in
about 150ms. If it breaks, nothing else matters, because nobody gets far enough
to hit the other bugs.

## Known deviations, recorded honestly

Two places where reality did not match the original design:

**Whole-buffer docx determinism is not achievable.** docx 9.x stamps
`dcterms:created`/`modified` from its own `new Date()` with no override, and
the zip records entry timestamps. The rendered *content* is deterministic and
that is what the tests assert. Nothing downstream depends on docx bytes — the
archive stamps builds with the git hash of the **source content**, which is a
better identifier anyway.

**`CheckWorkspaceUseCase.execute` had to become async** when the page-count
gate was added. The `pageCounts` seam was correctly *placed* — the data shape
slotted in unchanged — but incorrectly *typed*: measuring pages means
converting to PDF, and a synchronous method cannot await. The lesson: anything
that might later need I/O should be async from the start.

`decisions.md` records these and every other design decision with its date and
reasoning.

## Where to go next

- [How a build works](build-pipeline.md) — one command traced end to end
- [Extending vitae](extending.md) — adding commands, formats, and block kinds
