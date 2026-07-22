# vitae — Layer 4: Application Services

**Goal:** wire the pieces into use cases. Resolve a workspace, load content, compose a document, evaluate claims, render, and write artifacts — returning structured reports about what happened.

**Depends on:** Layer 1 (composer, claims policy, ports), Layer 2 (workspace, repository), Layer 3 (renderers, theme loader).

**Out of scope:** terminal output, argument parsing, exit codes, colors, spinners, `init` scaffolding, archiving, PDF. Those are Layer 5 and 6.

---

## Architectural decisions being locked in

**1. The application layer never prints and never exits.** No `console.log`, no `process.exit`, no chalk. Every use case returns a structured report; Layer 5 decides how to display it and what exit code it implies. This is the rule that makes use cases testable without capturing stdout, and it's the one most likely to be violated under deadline pressure — enforce it with a lint rule alongside the boundary rules from Layer 1.

**2. One class per use case, one public method.** `BuildVariantUseCase.execute(input)`. Not a service object with eleven methods that grows into a god class. Each use case names a thing the user can do, owns its own orchestration, and can be understood in isolation. Adding a command later means adding a class, not editing a shared one.

**3. Enforcement policy lives here, not in the domain.** Layer 1 deliberately separated composing a document from judging its claims. This layer makes the call: by default a `cannot-defend` claim blocks writing an artifact, `--force` overrides it, and `check` evaluates without writing at all. Because the decision is one branch in one use case rather than a rule baked into the composer, changing it later is trivial.

**4. The composition root is deferred to Layer 5.** Use cases receive their collaborators through constructor injection and depend only on interfaces. Nothing here calls `new FileContentRepository(...)` or `new JitiModuleLoader(...)`. Concrete wiring happens once, at the outermost edge, in Layer 5 — which is what lets every test in this layer run against in-memory fakes with no disk and no jiti.

**5. Format selection belongs here.** Layer 3 built renderers behind a common port and deliberately contained no format-choosing logic. A small `RendererFactory` maps `"docx" | "txt"` to an instance. Adding a third output format touches the factory and nothing else.

**6. Naming is a policy object, not string concatenation.** Artifact filenames come from an `ArtifactNaming` class, not inline template literals. Layer 6's archive naming (`2026-07-22_llm-infrastructure_a1b2c3d.docx`) is the same policy with a different strategy, so extracting it now avoids duplicating the convention in two places later.

**7. Load once per `Application` instance.** `build --all` resolves the workspace and reads content a single time, then composes four documents from the same in-memory `ContentLibrary`. Repository access is memoized at the facade, not inside each use case.

---

## Deliverables

### 4.1 — Ports (`src/app/ports/`)

```ts
interface ArtifactWriter {
  write(
    absPath: string,
    bytes: Buffer | string,
  ): Promise<Result<WrittenArtifact, IoError>>;
  ensureDir(absPath: string): Promise<Result<void, IoError>>;
}

interface ProgressListener {
  // optional, injected as a no-op by default
  onVariantStart(variantId: string): void;
  onVariantDone(report: VariantBuildReport): void;
}
```

`ProgressListener` exists so a future `--all` build can stream feedback without the application layer knowing what a terminal is.

### 4.2 — `FileArtifactWriter` (`src/infra/io/FileArtifactWriter.ts`)

The concrete implementation: creates parent directories on demand, writes atomically (temp file then rename, so an interrupted build never leaves a truncated `.docx`), and maps `fs` errors to `IoError` with the offending path.

### 4.3 — Report model (`src/app/reports/`)

Plain data returned by use cases — no formatting, no ANSI:

```ts
interface VariantBuildReport {
  variantId: string;
  status: "written" | "blocked" | "failed";
  outputPath?: string;
  byteLength?: number;
  diagnostics: Diagnostic[]; // reuses the Layer 1 / Layer 2 shape
}

interface BuildReport {
  variants: VariantBuildReport[];
  workspaceRoot: string;
}
interface CheckReport {
  variants: VariantCheckReport[];
  pageCounts?: Record<string, number>;
}
interface ListReport {
  variants: VariantSummary[];
} // id, label, project count, claim tiers
```

`status: "blocked"` is distinct from `"failed"` on purpose: blocked means the build worked but policy refused to write it (an undefendable claim), failed means something was broken. The user experience of those two is completely different and the CLI needs to tell them apart.

### 4.4 — `ArtifactNaming` (`src/app/naming/`)

```ts
interface NamingStrategy {
  filenameFor(variant: Variant, format: OutputFormat): string;
}
class DefaultNaming implements NamingStrategy {} // "resume_llm_infrastructure.docx"
```

Prefix comes from config (Layer 2), extension from format. Layer 6 adds `ArchiveNaming` implementing the same interface.

### 4.5 — `RendererFactory` (`src/app/render/RendererFactory.ts`)

Maps an `OutputFormat` to a `Renderer<Buffer | string>`, constructing `DocxRenderer` with the loaded theme and `PlainTextRenderer` without one. Unknown format is a typed error, not a throw.

### 4.6 — `BuildVariantUseCase` (`src/app/usecases/BuildVariantUseCase.ts`)

Input: `{ variantId, format, force?, outputDir? }`.

Sequence: fetch the variant from the library (unknown → `failed`) → compose via `ResumeComposer` (resolution errors → `failed`, all of them) → evaluate `ClaimsPolicy` → if errors exist and `force` is false, return `blocked` with diagnostics and write nothing → otherwise render via the factory, ensure the output directory, write, and return `written` with path, byte length, and any warnings.

Warnings never block. A `needs-review` claim should appear in the report and still produce a file — you need to be able to build a resume for a project you haven't reviewed yet, you just need to be told.

### 4.7 — `BuildAllUseCase`

Iterates variants, delegating each to `BuildVariantUseCase`, emitting progress events, and **continuing past failures** so one broken variant doesn't hide the status of the other three. Aggregates into a single `BuildReport`.

### 4.8 — `CheckWorkspaceUseCase`

Composes and validates every variant, writing nothing. Returns diagnostics per variant. Leave a typed seam for the page-count gate (`pageCounts` is optional in `CheckReport`) — Layer 6 fills it once PDF conversion exists, without changing this use case's signature.

### 4.9 — `ListVariantsUseCase`

Summarizes each variant: id, label, ordered project names, and the count of claims at each defensibility tier. This is the command that answers "what's on which resume and can I defend it" at a glance, so the data it returns should make that renderable without further lookups.

### 4.10 — `Application` facade (`src/app/Application.ts`)

Holds the resolved workspace, memoized `ContentLibrary`, loaded theme, and constructed use cases. Exposes `build`, `buildAll`, `check`, `list`. Constructed from a dependency bundle — an interface listing the ports it needs — so Layer 5 supplies real adapters and tests supply fakes.

### 4.11 — Tests (`tests/app/`)

Fakes for `ContentRepository`, `Renderer`, and `ArtifactWriter`; zero disk access.

- Happy path writes to the expected path with the expected filename.
- A `cannot-defend` claim yields `blocked`, writes nothing, and names the claim; the same input with `force: true` yields `written`.
- A `needs-review` claim yields `written` **with** a warning diagnostic.
- Unknown variant and unresolvable project IDs yield `failed` with all diagnostics, not just the first.
- `buildAll` with one broken variant still reports on the other three.
- The repository's `load()` is called exactly once across a `buildAll` (proves memoization).
- Writer failure (simulated `IoError`) surfaces as `failed` with the path, not an unhandled rejection.

---

## Definition of done

Every use case runs end to end against in-memory fakes. No file in `src/app/` imports `fs`, `docx`, `chalk`, or `commander`, and none contains `console.` or `process.exit`. The full real pipeline still isn't runnable — nothing has wired concrete adapters together yet — and that's correct for this layer.

## Handoff note for Codex

The temptation here is to have a use case print a nice summary or exit non-zero when validation fails. Don't. Use cases return reports; Layer 5 turns reports into output and exit codes. If a report doesn't carry enough information for the CLI to print a good message, the fix is a richer report type, never a `console.log` in the application layer.

## What Layer 5 will need from this

The CLI builds the composition root: resolve `Workspace`, construct `JitiModuleLoader`, `FileContentRepository`, `ThemeLoader`, `FileArtifactWriter`, assemble the dependency bundle, and hand it to `Application`. It then maps each `Report` to formatted output and an exit code, and adds `init`, which is the one command that runs _without_ a workspace and therefore bypasses the facade entirely.

# vitae — Layer 3: Theme & Rendering

**Goal:** implement the `Renderer<T>` port from Layer 1. Own everything presentational — fonts, sizes, spacing, margins — load the user's theme, and turn a `ResumeDocument` into a `.docx` buffer.

**Depends on:** Layer 1 (domain types, `Renderer` port) and Layer 2 (`Workspace` for the theme file path, `ModuleLoader` to read it, diagnostic mapper for validation errors).

**Out of scope:** writing files to disk, page-count enforcement, PDF conversion, CLI. The renderer returns a buffer; deciding where bytes land is Layer 4's job.

---

## Architectural decisions being locked in

**1. Theme enters the system here and nowhere earlier.** Layer 2 deliberately left `themeFile` as a path. This layer defines the `Theme` type, its schema, its defaults, and its loader. Nothing below Layer 3 has ever heard of a font — that's the property that keeps the domain reusable.

**2. One seam translates meaning into appearance.** A single `StyleResolver` maps `(TextRole, Emphasis[])` → concrete docx run options using the theme. Every "what does a `meta` run look like" question resolves in that one class. Restyling the entire resume means editing the resolver or the theme, never the block renderers.

**3. Block renderers form a typed registry, not a growing switch.** Handlers are keyed by block kind:

```ts
type BlockRendererMap = {
  [K in Block["kind"]]: BlockRenderer<Extract<Block, { kind: K }>>;
};
```

A mapped type over the union gives you both properties at once: pluggability (adding a block kind means adding a handler) _and_ exhaustiveness (TypeScript refuses to compile a registry missing a kind). This is the pattern to reach for whenever "open for extension" and "prove nothing was forgotten" both matter.

**4. Renderers are pure functions of `(document, theme)`.** No filesystem, no clock, no globals. Same inputs, same bytes — which is what makes rendering testable and what makes the archive hashes in Layer 6 meaningful.

**5. Ship a second renderer to prove the seam is real.** A trivial `PlainTextRenderer` is a deliverable of this layer, not a future nice-to-have. If the IR has quietly become docx-shaped, writing a plaintext renderer will hurt immediately — while the design is cheap to fix — rather than in six months when you want an HTML portfolio version. It also earns its keep as an ATS-safe output and makes rendering tests readable.

**6. Themes merge over defaults.** A user's `theme.ts` may specify one field or forty. Load it as a deep-partial, validate, and merge onto `DEFAULT_THEME`. Someone who only wants a different font shouldn't have to restate every spacing constant, and defaults living in the tool means theme files stay small and diffable.

---

## Deliverables

### 3.1 — `Theme` model and defaults (`src/render/theme/`)

Type plus a `DEFAULT_THEME` carrying the proven values from the working generator:

```ts
interface Theme {
  font: string; // "Calibri"
  page: { width: number; height: number; margin: number }; // 12240 × 15840, 720 (DXA)
  sizes: Record<TextRole, number>; // name 30, sectionHeading 20, body 19, meta 18, link 18
  rightTab: number; // 10800
  bullet: { indent: number; hanging: number }; // 260 / 160
  spacing: {
    sectionBefore: number;
    sectionAfter: number; // 110 / 30
    bulletAfter: number;
    line: number; // 16 / 228
    entryBefore: number;
    entryAfter: number; // 50 / 14
  };
  sectionRule: { enabled: boolean; size: number; color: string }; // true, 4, "444444"
}
```

All units are DXA (1440 = 1 inch) — document that in a comment, because half-point font sizes and DXA lengths coexisting in one object is exactly the kind of thing that bites six months later.

### 3.2 — Theme loading (`src/render/theme/ThemeLoader.ts`)

Reads `workspace.themeFile` via the Layer 2 `ModuleLoader`, validates against a **deep-partial** zod schema, deep-merges onto `DEFAULT_THEME`, and returns `Result<Theme, LoadDiagnostic[]>`. A missing theme file is not an error — it means defaults. Reuse Layer 2's `ZodDiagnosticMapper` so theme errors read identically to content errors.

### 3.3 — `StyleResolver` (`src/render/docx/StyleResolver.ts`)

```ts
class StyleResolver {
  constructor(private readonly theme: Theme) {}
  runOptions(run: TextRun): IRunOptions; // font, size from role, bold/italics from emphasis
  paragraphSpacing(kind: Block["kind"]): ISpacingProperties;
  sectionHeadingBorder(): IBordersOptions | undefined;
  pageProperties(): ISectionPropertiesOptions["page"];
}
```

This is the only class in the codebase that reads `theme.sizes`.

### 3.4 — Block renderers (`src/render/docx/blocks/`)

One small module per block kind, each `(block, resolver) => Paragraph`:

- **`paragraph`** — runs joined, optional center alignment (used by the name and contact lines).
- **`bullet`** — a `Paragraph` with `numbering: { reference: "bullets", level: 0 }` and the theme's indent.
- **`splitLine`** — left runs, a tab character run, right runs, with a `TabStopType.RIGHT` stop at `theme.rightTab`. This renders every job header, education line, and project header.

Assemble them into the typed registry from decision 3.

### 3.5 — `DocxRenderer` (`src/render/docx/DocxRenderer.ts`)

`implements Renderer<Buffer>`. Constructor takes a `Theme` and builds its own `StyleResolver` and registry.

`render(doc)` composes: document-level properties from `doc.meta` (`title`, `creator`, `description`, `keywords` joined, `lastModifiedBy: "vitae"`), the bullet numbering config, page setup from the theme, then walks sections — emitting a heading paragraph (bordered per theme) followed by each block dispatched through the registry — and returns `Packer.toBuffer(...)`.

Encode these docx-js constraints explicitly, since each one is a silent-corruption bug rather than a crash: never emit `\n` inside a run (separate paragraphs only); never insert a literal `•` (use the numbering config); page size must be set explicitly or you get A4; a `PageBreak` must live inside a `Paragraph`.

### 3.6 — `PlainTextRenderer` (`src/render/text/PlainTextRenderer.ts`)

`implements Renderer<string>`. Sections as uppercase headings, bullets as `- `, split lines as left + padding + right at a configurable column width. Ignores theme entirely — which is the point: it demonstrates that a renderer can consume the IR without any presentational input, confirming the domain didn't leak.

### 3.7 — Tests (`tests/render/`)

- **Theme merge:** partial theme overrides only the specified keys; missing file yields exact defaults; an invalid value produces a mapped diagnostic.
- **`StyleResolver`:** each role maps to the expected size; emphasis combinations produce bold/italics correctly.
- **docx structural assertions:** render a fixture document, unzip the buffer, and assert on `word/document.xml` — the bullet numbering reference is present, a `splitLine` produced a right tab stop at the themed position, no literal bullet characters exist, section headings carry the border. Then assert `docProps/core.xml` contains the title and creator from `DocumentMeta`.
- **Plaintext golden file:** a committed expected-output file. This is your fastest regression signal on IR changes.
- **Determinism:** rendering the same document twice yields byte-identical buffers (guard the archive-hash guarantee now, not after it breaks).

---

## Definition of done

Given a `ResumeDocument` from the Layer 1 composer and a `Theme`, `new DocxRenderer(theme).render(doc)` returns a buffer that opens in Word with your existing formatting intact, and `new PlainTextRenderer().render(doc)` returns readable text from the same input with no theme involved. Nothing in `src/render/` writes to disk. `src/domain/` remains untouched.

## Handoff note for Codex

Two failure modes to watch. First, the renderer must not "improve" content — no inferring, reordering, or injecting text that isn't in the IR; if the output needs something the IR can't express, that's a Layer 1 change, not a special case here. Second, if writing `PlainTextRenderer` requires reaching for anything docx-specific from the document model, stop and report it rather than working around it — that's the IR leaking, and it's the one design flaw this layer exists to detect.

## What Layer 4 will need from this

The application layer composes everything: resolve workspace → load content → compose document → validate claims → render → write to `dist/`. It will construct renderers by output format, so keep `DocxRenderer` and `PlainTextRenderer` behind the `Renderer<T>` port with no format-selection logic living inside this layer.

# vitae — Layer 2: Workspace & Content Loading

**Goal:** implement the `ContentRepository` port from Layer 1. Find the `.vitae/` folder, load the user's TypeScript content and variant files at runtime, validate them at the boundary, and produce a `ContentLibrary` — or a readable list of diagnostics explaining why not.

**Depends on:** Layer 1 (`src/domain/`) only.

**Out of scope:** docx, theme, rendering, CLI commands, archiving, PDF. This layer's job ends the moment a valid `ContentLibrary` exists in memory.

---

## Architectural decisions being locked in

**1. This is the anti-corruption layer.** Everything crossing into the process from disk is untrusted — a user typo, a stale field name, a half-finished edit. Nothing reaches the domain until it has been shaped and verified here. The payoff is that Layer 1 code can assume its inputs are well-formed and never defensively re-check.

**2. Zod lives in infra, never in domain.** Domain types stay hand-written and canonical; zod schemas here are _adapters_ that produce them. Bind each schema to its domain type explicitly:

```ts
const projectSchema: z.ZodType<Project> = z.object({ ... });
```

Typing the schema as `z.ZodType<Project>` rather than inferring the type from the schema means that if someone adds a field to the domain `Project` and forgets the schema, **the build breaks** — the drift is caught by the compiler instead of at runtime by a confused user. This is the inverse of the usual `z.infer` habit and it's deliberate: the domain leads, the boundary follows.

**3. Convention over manifest.** Any `.ts` file in `variants/` is a variant; its filename is its ID unless the file says otherwise. Adding a variant is dropping in a file — no registry to update, no import list to maintain. Same principle as your content: composition is data.

**4. `Workspace` is a first-class object, not a path string.** Once resolved, a `Workspace` instance answers every "where does X live" question for the rest of the application — content dir, variants dir, dist, archive, theme file, config file. Later layers (rendering output, archiving, `init`) ask the workspace instead of re-deriving paths, so the folder convention exists in exactly one place and can be changed there.

**5. Module loading is a port; the filesystem isn't.** Executing user TypeScript at runtime is the genuinely awkward-to-test part, so it goes behind a `ModuleLoader` interface with a jiti-backed implementation and a fake for tests. Plain file reads are tested against real temp directories — abstracting `fs` too would be ceremony without payoff. Abstract what's hard to fake, not everything.

**6. Diagnostics aggregate and carry provenance.** A load failure returns _all_ problems, each naming the file and the path within it (`variants/data-engineer.ts: skills[2].label — expected string, received number`). Errors extend Layer 1's `DomainError` so the CLI has one uniform formatting path for domain and load failures alike.

**7. Load once, hold immutably.** Content is read a single time per process into an immutable `ContentLibrary`. No lazy per-command re-reads, no cache invalidation logic to get wrong.

---

## Deliverables

### 2.1 — `Workspace` (`src/infra/workspace/Workspace.ts`)

A class representing a resolved `.vitae/` directory.

```ts
class Workspace {
  static resolve(opts?: {
    explicitDir?: string;
    cwd?: string;
  }): Result<Workspace, WorkspaceNotFoundError>;
  readonly root: string; // path to .vitae/
  get contentDir(): string;
  get variantsDir(): string;
  get distDir(): string;
  get archiveDir(): string;
  get themeFile(): string; // path only — L3 reads it
  get configFile(): string;
  resolvePath(...segments: string[]): string;
}
```

Resolution order: explicit `--dir` / `VITAE_DIR` env → walk up from `cwd` looking for `.vitae/` (stop at filesystem root) → fall back to `~/.vitae` → otherwise `WorkspaceNotFoundError` with a message telling the user to run `vitae init`. Directory existence is verified; `dist/` and `archive/` are created on demand by later layers, not here.

### 2.2 — Config (`src/infra/config/`)

`config.json` schema and loader: `owner` (string), `defaultVariant` (optional string), `output` (optional `{ filenamePrefix?: string }`). Missing file is not an error — apply documented defaults, with `owner` falling back to the header's name from content. Validate with zod; unknown keys warn rather than fail, so a config written by a newer version of the tool doesn't hard-break an older one.

### 2.3 — `ModuleLoader` port + jiti adapter (`src/infra/loader/`)

```ts
interface ModuleLoader {
  load<T = unknown>(absPath: string): Promise<Result<T, ModuleLoadError>>;
}
```

`JitiModuleLoader` wraps jiti configured for ESM + TypeScript with caching disabled during development. It must: accept both `.ts` and `.js`, prefer a default export and fall back to a single named export, and convert thrown syntax/runtime errors from user code into a `ModuleLoadError` carrying the file path and the original message — never let a user's typo surface as a raw stack trace from inside jiti.

Also ship `FakeModuleLoader` (a `Map<path, value>`) for tests.

### 2.4 — Boundary schemas (`src/infra/schema/`)

Zod schemas for every domain type from Layer 1, each explicitly typed as `z.ZodType<DomainType>` per decision 2. Cover: `Header`, `Education`, `Job`, `Project`, `LeadershipEntry`, `AwardsLine`, `Claim`, `SkillGroup`, `Variant`, and the `ContentLibraryData` aggregate.

Add the semantic constraints the domain assumes but doesn't police: non-empty `id` strings, at least one bullet per job, `defensibility` as a strict enum, `projectIds` non-empty. Reject unknown object keys (`.strict()`) — a mistyped `bullet:` that silently vanishes is worse than a loud failure.

### 2.5 — `ZodDiagnosticMapper` (`src/infra/schema/mapper.ts`)

Converts a `ZodError` into `LoadDiagnostic[]` with file path, dotted field path, expected vs. received, and a stable error code. One mapper reused everywhere means every validation message in the tool reads the same way.

### 2.6 — `FileContentRepository` (`src/infra/content/FileContentRepository.ts`)

The `ContentRepository` implementation, constructor-injected with `Workspace` and `ModuleLoader`.

`load()` sequence: read each expected file in `content/` (`header`, `education`, `work`, `projects`, `leadership`, `claims`) → discover and read every `.ts` in `variants/` → validate each through its schema, collecting diagnostics rather than stopping → if any errors, return them all → otherwise construct `ContentLibrary` and return it.

Two rules worth stating explicitly: a missing _required_ content file is an error naming the expected path, and a variant file whose declared `id` disagrees with its filename is an error, not a silent preference — ambiguity about which name wins will cost you an hour someday.

Note that `ContentLibrary`'s own duplicate-ID checks from Layer 1 still run at construction; this layer should surface those as load diagnostics rather than letting them throw.

### 2.7 — Error types (`src/infra/errors.ts`)

`WorkspaceNotFoundError`, `ModuleLoadError`, `SchemaValidationError`, `MissingContentFileError`, `VariantIdMismatchError` — all extending `DomainError` with distinct codes.

### 2.8 — Tests (`tests/infra/`)

- **Workspace resolution:** finds `.vitae/` in cwd; finds it three levels up; honors explicit dir; falls back to home; fails with a clear error when absent. Use real temp directories.
- **Loading:** a complete valid fixture workspace produces a `ContentLibrary` whose contents match expectations.
- **Validation:** a variant with a numeric `label` reports a diagnostic naming the file and field; **two** bad files report **both** (proves aggregation).
- **Unknown keys** rejected; **missing required file** reported by path; **id/filename mismatch** reported.
- **`ModuleLoader`:** user code that throws produces a `ModuleLoadError` with the path, not an unhandled exception. Use `FakeModuleLoader` for this.
- Reuse the Layer 1 fixture builder so domain and infra tests describe the same content.

Build a small `tests/fixtures/workspace/` that is a genuine, valid `.vitae/` folder — it doubles as the seed for `vitae init` templates in Layer 5.

---

## Definition of done

Given a real `.vitae/` folder on disk, `new FileContentRepository(workspace, loader).load()` returns a populated `ContentLibrary`, and given a broken one it returns a diagnostic list a human can act on without opening the tool's source. `src/domain/` is untouched by this layer's work. `npm run lint` still passes, meaning the boundary rule held.

## Handoff note for Codex

The failure mode to avoid is letting zod infer the domain types (`z.infer<typeof projectSchema>`) — schemas must be declared as `z.ZodType<Project>` so the domain stays the source of truth and drift becomes a compile error. Second: no error path may surface a raw jiti or zod stack trace to the user; everything funnels through `LoadDiagnostic`.

## What Layer 3 will need from this

The rendering layer takes `Workspace` (for `themeFile` and `distDir`) and a `ResumeDocument` from the domain composer. It will define and load the theme itself — theme is presentational, so its type and schema deliberately do not exist yet.

# vitae — Layer 1: Domain Core

**Goal:** the pure heart of the application — the resume model, composition rules, and validation policy — with zero I/O and zero knowledge of docx, the filesystem, or the CLI. Everything in later layers depends on this; this depends on nothing.

**Out of scope for this layer:** docx generation, file reading, CLI commands, zod parsing of user files, PDF, git, archiving. If a task in this spec makes you reach for `fs` or `docx`, it belongs to a later layer.

---

## Architectural decisions being locked in

**1. Dependency rule (Clean/Hexagonal).** Source is split into `domain/`, `app/`, `infra/`, `cli/`. Imports may only point inward: `cli → app → domain`, `infra → domain`. `domain/` imports nothing from the other three, and no Node built-ins. This is enforced mechanically, not by discipline (see deliverable 1.6).

**2. Semantic IR, not presentational output.** The domain's product is a `ResumeDocument` — a rendering-agnostic intermediate representation describing _what_ the resume says and what each piece _means_ (a name, a bullet, a right-aligned date), never how big or what font. This is the decision that makes new output formats cheap later: a PDF renderer, an HTML portfolio page, or a plain-text ATS variant are all new adapters consuming the same IR, with no domain changes.

**3. Theme is not a domain concept.** Fonts, sizes, margins, and spacing are presentational and live entirely in the rendering layer. The domain never sees `theme.ts`. IR text runs carry semantic roles (`name`, `body`, `meta`, `link`) and emphasis (`bold`, `italic`); the renderer maps roles to type sizes. (This supersedes the earlier design note that implied theme flows through the core.)

**4. Ports and adapters.** The domain defines interfaces it needs (`ContentRepository`, `Renderer`) but implements none of them. Later layers supply implementations. This is what lets you unit-test the entire composition and validation engine with in-memory fixtures and no filesystem.

**5. Errors are values, not exceptions.** Domain operations return a `Result<T, DomainError>` rather than throwing. Resolution and validation failures are _expected_ outcomes (an unknown project ID, an undefendable claim), and the CLI needs to report several at once — not die on the first. Reserve `throw` for genuine programmer bugs.

**6. Composition by reference.** A `Variant` holds ordered project _IDs_, never project text. One project can appear on many variants; alternate framings of the same underlying work are separate projects sharing a `claimId`. Adding a variant is data, not code.

**7. Policy as a strategy object.** Defensibility rules live in an injectable `ClaimsPolicy` class rather than scattered `if` statements, so the rule "cannot-defend blocks the build" can be tightened, loosened, or overridden per-command without touching the resolver.

---

## Deliverables

### 1.1 — Repository scaffold

- `package.json` (ESM, `"type": "module"`), TypeScript 5.x, `vitest`, no runtime dependencies yet.
- `tsconfig.json` with `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`.
- Folder skeleton: `src/domain/`, `src/app/`, `src/infra/`, `src/cli/`, `tests/`. Later layers fill the empty ones.
- Scripts: `build`, `test`, `typecheck`, `lint`.

### 1.2 — Content model (`src/domain/model/`)

Types and value objects for the resume content library. Keep these as `interface`/`type` unless behavior justifies a class:

- `Header` — owner name, contact line segments.
- `Education` — institution/degree line, date, and a coursework string (variant-selectable).
- `Job` — title, org, location, date range, bullets.
- `Project` — `id`, `claimId`, name, tech, link, bullets.
- `LeadershipEntry` — same shape as `Job`; model it as such rather than duplicating.
- `AwardsLine` — label + entries.
- `Claim` — `id`, `defensibility` (`"confident" | "needs-review" | "cannot-defend"`), optional `reviewNotes: string[]`.
- `Variant` — `id`, `label`, `summary`, `coursework`, `skills: SkillGroup[]`, `projectIds: string[]`.
- `SkillGroup` — `{ label, body }` (a tuple works but a named object survives future fields better).

### 1.3 — `ContentLibrary` (class, `src/domain/model/ContentLibrary.ts`)

Wraps the raw collections and owns lookup. This is the one place that knows how to find things by ID, so no other code does map-scanning.

```ts
class ContentLibrary {
  constructor(private readonly data: ContentLibraryData) {}
  getProject(id: string): Result<Project, UnknownProjectError>;
  getClaim(id: string): Result<Claim, UnknownClaimError>;
  getVariant(id: string): Result<Variant, UnknownVariantError>;
  listVariants(): readonly Variant[];
  get header(): Header;
  get education(): Education;
  get jobs(): readonly Job[];
  get leadership(): readonly LeadershipEntry[];
  get awards(): AwardsLine;
}
```

Construction should reject duplicate IDs — two projects with the same `id` is a content bug worth catching immediately.

### 1.4 — Document IR (`src/domain/document/`)

The rendering-agnostic output model. Small, closed, and semantic:

```ts
type TextRole = "name" | "body" | "meta" | "link" | "sectionHeading";
type Emphasis = "bold" | "italic";

interface TextRun {
  text: string;
  role: TextRole;
  emphasis?: Emphasis[];
}

type Block =
  | { kind: "paragraph"; runs: TextRun[]; align?: "left" | "center" }
  | { kind: "bullet"; runs: TextRun[] }
  | { kind: "splitLine"; left: TextRun[]; right: TextRun[] }; // title ......... date

interface Section {
  heading?: string;
  blocks: Block[];
}

interface DocumentMeta {
  title: string;
  creator: string;
  description: string;
  keywords: string[];
}

interface ResumeDocument {
  meta: DocumentMeta;
  sections: Section[];
}
```

`splitLine` is the abstraction for every "left text, right-aligned date/link" row — job headers, education, project headers. The renderer decides that means a right tab stop at a particular position; the domain only says these two things sit on one line, pushed apart.

### 1.5 — Services (`src/domain/services/`)

**`ClaimsPolicy`** — evaluates a resolved variant's claims and returns a `ValidationReport` of `Diagnostic { severity: "error" | "warning"; code; message; claimId? }`. Default rule: `cannot-defend` → error, `needs-review` → warning, `confident` → nothing. Constructor takes the severity mapping so it's overridable.

**`ResumeComposer`** — the centerpiece. `compose(variant: Variant, library: ContentLibrary): Result<ResumeDocument, DomainError[]>`. It resolves project IDs, assembles sections in canonical order (header → summary → education → skills → work → projects → leadership & awards), builds `DocumentMeta` (title from owner + variant label, keywords derived from skill group bodies), and accumulates _all_ resolution errors rather than failing on the first.

**`ClaimsResolver`** (or a method on the composer, your call — keep it separate if it stays clearer) — maps a variant's projects to their claims for the policy to evaluate, and surfaces `reviewNotes` so a later `prep` command has data to render. Note that composition and validation are independent: `compose` should not silently refuse to build; the _application_ layer decides whether a validation error blocks writing a file. Keeping that separation now is what makes `--force` or a check-only mode trivial later.

### 1.6 — Cross-cutting primitives

- `Result<T, E>` with `ok`/`err` constructors and small helpers (`map`, `andThen`, `isOk`). Hand-rolled is fine; a library is fine too — pick one and be consistent.
- `DomainError` base class with a machine-readable `code` and a human `message`; concrete subclasses `UnknownProjectError`, `UnknownClaimError`, `UnknownVariantError`, `DuplicateIdError`. Codes matter because the CLI will format them and tests will assert on them.
- **Dependency-rule enforcement:** an ESLint `no-restricted-imports` (or `eslint-plugin-boundaries`) config that fails the build if `domain/` imports from `app/`, `infra/`, `cli/`, or Node built-ins. Wire it into the `lint` script. Without this the layering erodes in a week.

### 1.7 — Ports (`src/domain/ports/`)

Interfaces only, no implementations:

```ts
interface ContentRepository {
  load(): Promise<Result<ContentLibrary, DomainError[]>>;
}
interface Renderer<TOutput> {
  render(doc: ResumeDocument): Promise<TOutput>;
}
```

### 1.8 — Tests (`tests/domain/`)

Vitest, in-memory fixtures, no filesystem access anywhere. Cover:

- Composition happy path: a two-project variant produces the expected section order and block kinds.
- Unknown project ID yields an error naming the ID, and **multiple** unknown IDs yield multiple errors (proves accumulation).
- Duplicate IDs rejected at `ContentLibrary` construction.
- `ClaimsPolicy`: cannot-defend → error, needs-review → warning, confident → clean; and a custom severity mapping overrides the default.
- `DocumentMeta` keywords derive from skill groups.
- A fixture builder helper so later layers' tests can reuse realistic content.

---

## Definition of done

`npm run typecheck`, `npm run lint`, and `npm test` all pass. `src/domain/` contains no import of `fs`, `path`, `docx`, or anything from sibling layers. Given an in-memory `ContentLibrary` and a variant, calling `new ResumeComposer().compose(...)` returns a fully populated `ResumeDocument` — which nothing yet knows how to turn into a file, and that's correct for this layer.

## Handoff note for Codex

The one thing worth restating in your prompt: **the domain must not import `docx` or `fs`**, and `ResumeDocument` must stay presentation-free (no font names, no point sizes, no margins). If it starts producing docx objects directly, the layer has failed even if the tests pass.

## What Layer 2 will need from this

Layer 2 (content loading) implements `ContentRepository` by reading `.vitae/content/*.ts` at runtime, validating with zod, and constructing a `ContentLibrary`. It will need the model types and the error classes above to be exported cleanly from a single `src/domain/index.ts` barrel — worth setting up now.
