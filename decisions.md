# Decisions

A dated record of architectural decisions. Newest last. Each entry states what
was decided and why, so a future change knows what it is overturning.

---

## 2026-07-22 — Layer 3: Theme & Rendering

### 2026-07-22 · Theme enters the system at Layer 3 and nowhere earlier

Layer 2 deliberately left `themeFile` as a path. The `Theme` type, its schema,
its defaults, and its loader all live in `src/render/`. Nothing below this layer
has ever heard of a font, which is the property that keeps the domain reusable.
Themes merge over `DEFAULT_THEME`, so a user who wants a different font says
only that — defaults living in the tool are what keep theme files small and
diffable.

### 2026-07-22 · One seam translates meaning into appearance

`StyleResolver` is the only class that reads `theme.sizes`. Every "what does a
`meta` run look like" question resolves there, so restyling the resume means
editing the resolver or the theme, never the block renderers.

### 2026-07-22 · Block renderers are a typed registry, not a switch

Handlers are keyed by block kind through a mapped type over the IR union. That
buys pluggability and exhaustiveness at once: adding a block kind means adding
a handler, and TypeScript refuses to compile a registry missing one. Reach for
this pattern whenever "open for extension" and "prove nothing was forgotten"
both matter.

### 2026-07-22 · A second renderer ships now, not later

`PlainTextRenderer` is a deliverable, not a nice-to-have. It takes no theme at
all, so if the IR had quietly become docx-shaped, writing it would have hurt
immediately — while the design was still cheap to fix — rather than in six
months. It writes correctly with no presentational input, which is the
evidence that the domain did not leak. It also earns its keep as ATS-safe
output and as the golden-file regression signal.

### 2026-07-22 · Determinism is asserted on content, not on bytes

**This deviates from the layer spec, deliberately.** The spec asked for
byte-identical buffers across renders. That is not achievable with docx 9.x:
the library writes `dcterms:created`/`modified` from its own internal
`new Date()` with no override in `IPropertiesOptions`, and the zip container
stamps entry timestamps too.

Rather than reimplementing the packer or post-processing the archive, the test
asserts that `word/document.xml` is identical across renders — the content is
what must be stable. Nothing downstream depends on docx bytes being
reproducible: per the system design, archived builds are stamped with the git
hash of the *content* that produced them, not a hash of the output file. If a
future requirement genuinely needs reproducible bytes, this is the decision to
revisit.

### 2026-07-22 · docx constraints are encoded, not rediscovered

Four docx-js behaviours are silent-corruption bugs rather than crashes, so each
is stated in `DocxRenderer` and asserted in the tests: never emit `\n` inside a
run; never insert a literal `•` (bullets come from the numbering config, or
they are not lists to Word, an ATS, or a screen reader); set page size
explicitly or output silently becomes A4; a `PageBreak` must live inside a
paragraph.

### 2026-07-22 · The renderer never improves content

Nothing is inferred, reordered, or injected that the IR did not say. If output
needs something the IR cannot express, that is a domain change, not a special
case in a block renderer.

---

## 2026-07-22 — Layer 2: Workspace & Content Loading

### 2026-07-22 · Schemas are bound to domain types, never inferred from them

Every boundary schema is annotated `z.ZodType<DomainType>` rather than having
its type produced by `z.infer`. The inversion is the point: the domain leads
and the boundary follows, so adding a field to a domain type and forgetting the
schema breaks the build instead of confusing a user at runtime.

This forced two small domain changes, both recorded as deliberate: `DomainError.code`
widened from the domain-only code union to `string` so loading errors can join
the same hierarchy, and `Claim.reviewNotes` gained an explicit `| undefined`
because an optional zod field yields `T | undefined` under
`exactOptionalPropertyTypes`. The alternative — casting at the boundary — would
have hidden exactly the drift this decision exists to catch.

### 2026-07-22 · Objects are strict; unknown keys fail

A mistyped `bullet:` that silently vanishes from a resume is far worse than a
loud failure, so content schemas are `strictObject`. The one exception is
`config.json`, where unknown keys warn instead: a config written by a newer
version of the tool should not hard-break an older one.

### 2026-07-22 · Abstract what is hard to fake, not everything

Executing user TypeScript at runtime sits behind a `ModuleLoader` port with a
jiti adapter and a `FakeModuleLoader`. Plain file reads do **not** — they are
tested against real temp directories, because faking `fs` would be ceremony
that ends up testing the mock. `FakeModuleLoader` ships in `src/` rather than
`tests/` so later layers reuse it instead of growing their own copy.

### 2026-07-22 · Convention over manifest for variants

Any module in `variants/` is a variant and its filename is its ID. Adding one
is dropping in a file — no registry to update. A declared `id` that disagrees
with the filename is an error, not a silent preference: ambiguity about which
name wins costs an hour the day it finally matters.

### 2026-07-22 · Diagnostics aggregate and carry provenance

A load reports every problem at once, each naming the file and the dotted path
within it (`variants/data-engineer.ts: skills[2].label — expected string,
received number`). One `ZodDiagnosticMapper` produces all of them, so every
validation message in the tool reads the same way, and no zod or jiti stack
trace can reach a user.

### 2026-07-22 · A broken workspace never falls back to sample content

If no `.vitae/` resolves anywhere, commands use built-in sample content and say
so on stderr. But if a workspace is found and fails to load, the command prints
the diagnostics and exits 1. Silently building someone else's example resume
because your own content has a typo is the worst available failure mode.

### 2026-07-22 · `Workspace` is an object, not a path string

Once resolved, a `Workspace` answers every "where does X live" question —
content, variants, dist, archive, theme, config. Later layers ask it instead of
re-deriving paths, so the folder convention lives in exactly one place. An
explicit `--dir` that does not exist fails immediately rather than falling
through to discovery, for the same reason as above.

---

## 2026-07-22 — Layer 1: Domain Core

### 2026-07-22 · Clean/Hexagonal layering with mechanical enforcement

Source is split into `domain/`, `app/`, `infra/`, `cli/`, and imports may only
point inward (`cli → app → domain`, `infra → domain`). `domain/` imports
nothing from siblings and no Node built-ins. Enforced by `no-restricted-imports`
blocks in [eslint.config.js](eslint.config.js), wired into `npm run lint`, and
verified by deliberately probing the rule with a temporary `node:fs` import.
Without enforcement the layering erodes within a week.

### 2026-07-22 · Semantic IR instead of presentational output

The domain's product is `ResumeDocument` — a rendering-agnostic model of *what*
the resume says and what each piece *means*, never fonts, sizes, or margins.
This is what makes new output formats cheap: docx, PDF, HTML, and plain-text
ATS variants become adapters over one IR with no domain change. A test asserts
the composed document's JSON contains no font/size/margin strings.

### 2026-07-22 · Theme is not a domain concept

Fonts, sizes, margins, and spacing live entirely in the rendering layer and in
the user's `.vitae/theme.ts`. Text runs carry semantic roles (`name`, `body`,
`meta`, `link`, `sectionHeading`) and emphasis (`bold`, `italic`); the renderer
maps roles to type treatment. This supersedes the earlier system-design note
implying the theme flows through the core.

### 2026-07-22 · Ports and adapters

The domain declares `ContentRepository` and `Renderer<TOutput>` and implements
neither. Outer layers supply implementations, which is what lets the entire
composition and validation engine be unit-tested against in-memory fixtures
with zero filesystem access.

### 2026-07-22 · Errors are values, not exceptions

Domain operations return `Result<T, E>`. Unknown IDs and undefendable claims
are *expected* outcomes the CLI must report several of at once, not crashes.
`throw` is reserved for genuine programmer bugs (and for invalid test
fixtures). Errors accumulate: three unknown project IDs produce three errors in
one run.

### 2026-07-22 · Composition by reference

A `Variant` holds ordered project *IDs*, never project text. One project can
appear on many variants, and alternate framings of the same underlying work are
separate projects sharing a `claimId`. Adding a variant is data, not code.

### 2026-07-22 · Policy as an injectable strategy object

Defensibility rules live in a `ClaimsPolicy` constructed with a severity
mapping rather than as scattered conditionals. The default is `cannot-defend →
error`, `needs-review → warning`, `confident → clean`; a command can tighten or
relax it, which is what will make `--force` and a check-only mode trivial.

### 2026-07-22 · Composition is independent of validation

`compose` reports only *resolution* failures; it never refuses to build over an
undefendable claim. Whether a validation error blocks writing a file is the
application layer's decision. Keeping that separation now is what keeps
`--force` and check-only modes cheap later.

### 2026-07-22 · ContentLibrary owns all ID lookup

`ContentLibrary` is the single place that finds content by ID, so "unknown ID"
has exactly one implementation and one error shape. Its constructor is private
and `create` rejects duplicate project, claim, or variant IDs — a duplicate is
a content bug, and catching it at construction beats a silently dropped entry
at render time.

### 2026-07-22 · A thin CLI shell ships ahead of its layer

`vitae` is installable now via `npm run link` (which builds, then `npm link`s
the `bin` entry `dist/cli/main.js`), rather than waiting for the CLI layer.

Two constraints keep this from becoming a lie:

- The shell only exposes commands the **domain alone** can answer — `demo`,
  `list`, `check`, `prep`. Commands needing the filesystem (`init`, `build`,
  `where`, `diff`) are listed in `--help` under "planned" and exit 2 with the
  layer that will implement them, rather than silently doing nothing.
- Content comes from `src/cli/sampleContent.ts`, stated plainly in `--help`.
  When Layer 2 lands the loader, that constant becomes the seed for
  `vitae init` templates instead of being deleted.

Dependency direction is unchanged: `cli → domain` is inward, and no argument
parser was added, so the runtime dependency count is still zero.

### 2026-07-22 · `vitae check` is where the gate decision finally lives

Layer 1 deliberately kept `compose` from refusing to build over an
undefendable claim. `runCheck` is the first consumer to make that call: it
exits 1 on any error-severity diagnostic and 0 on warnings. The policy stays
injectable, so a future `--force` changes the severity mapping passed in rather
than editing this command's logic.

### 2026-07-22 · Single public barrel at `src/domain/index.ts`

Outer layers import from the barrel only. Layer 2's loader needs the model
types and error classes exported from one place, so the barrel exists from the
start rather than being retrofitted.
