# Decisions

A dated record of architectural decisions. Newest last. Each entry states what
was decided and why, so a future change knows what it is overturning.

---

## 2026-07-22 — Split lines: tables, not tab stops

### 2026-07-22 · Right-aligned dates are a layout table, because tab stops are not portable

**Reported:** dates and links looked "squeezed" against the title rather than
right-aligned. Clicking before the date and pressing Tab snapped it into
position.

**Investigated:** the emitted OOXML was correct — `<w:tabs><w:tab
w:val="right" w:pos="10800"/></w:tabs>` in every split line's paragraph
properties, a `<w:r><w:tab/></w:r>` between the halves, schema-valid element
ordering, and a text width of exactly 10800 DXA. It rendered correctly in Word.

The failure was in the *importers*, and the user's own workaround identified
it: the tab stop survived (typing a Tab jumped to the right position) while the
tab character did not. Apple's document stack — Quick Look, Preview, TextEdit,
Pages — discards custom tab stops entirely, confirmed by `textutil` dropping
them even from a minimal hand-built docx. Google Docs kept the stop and lost
the character.

**Decided:** render split lines as borderless two-cell tables with the right
cell right-aligned. This needs neither a tab stop nor a tab character, so it
does not depend on importer behaviour at all.

Notable: **the document IR did not change.** `splitLine` still means "these two
things sit on one line, pushed apart"; only the docx translation of that
meaning changed, and `PlainTextRenderer` never noticed. A rendering bug stayed
a rendering fix, which is exactly what the semantic-IR decision was for.

Cost accepted: these lines are now tables, which some older ATS parsers handle
less predictably than paragraphs. Mitigated by it being a single row of two
cells rather than a page-level multi-column layout, and by `--format txt`
existing for ATS submission.

### 2026-07-22 · `theme.rightTab` removed; column widths derive from the page

`rightTab` was a configured value that silently had to equal
`page.width - 2 × page.margin`. Changing a margin and forgetting to update it
misaligned every date with no error — a footgun documented in the theming guide
rather than designed out.

It is now computed from the page geometry in `StyleResolver.contentWidth`.
Widening a margin just works, and there is one fewer number that can be wrong.
The field is gone rather than deprecated: the strict theme schema reports it as
an unknown field, which is an actionable message rather than a setting that
quietly does nothing.

Explicit DXA column widths and `TableLayoutType.FIXED` are emitted alongside
the cell widths, because some renderers lay a table out from `tblGrid` rather
than from cell widths, and a grid disagreeing with the cells is how
"right-aligned" quietly stops being right-aligned.

---

## 2026-07-22 — Layer 6: Archive, PDF Gate, Prep & Diff

### 2026-07-22 · The architectural acceptance test, and what it found

The layer was built as a test of whether Layers 1–4 left the right seams open.
Result:

- **`src/domain/` — zero modifications.** Archiving, PDF conversion, prep, and
  diff all landed without touching the domain. `prep` consumes `reviewNotes`
  exactly as Layer 1 exposed them.
- **`src/app/` — additive except for two changes**, recorded below rather than
  glossed over, since this is the most useful design feedback the project
  produces.

**Exception 1: `CheckWorkspaceUseCase.execute` became async.** Layer 4 said the
`pageCounts` seam should be fillable "without changing this use case's
signature". The data shape was right — `pageCounts` slotted in as planned — but
measuring a page count means converting to PDF, which is I/O, and a synchronous
method cannot await. The seam was correctly *placed* and incorrectly *typed*:
anything that might later need I/O should have been async from the start. The
facade's `check` was already async, so nothing above noticed.

**Exception 2: `ArtifactWriter` gained `exists`.** Append-only archiving needs
to ask whether a file is already there. Adding a method to a port is a breaking
change for implementors — here, one real adapter and one fake.

Everything else was genuinely additive: a new naming strategy, optional input
fields, optional report fields, new use cases, new ports.

### 2026-07-22 · External programs are optional ports, and the tool works without them

git and LibreOffice sit behind `ContentStamper`/`SourceDiffer` and
`PdfConverter`/`PageCounter`. Neither is required: without git, archives stamp
`nogit` and warn; without LibreOffice, `--pdf` and the page gate warn and skip.
Someone who cloned this to build a resume is never blocked by a missing
optional program, and every unavailable feature names its install step.

Deviation from the literal spec, forced by Layer 4's own rule: the spec put
these interfaces in `infra/`, but `app/` may not import `infra/`. The ports
live in `src/app/ports/environment.ts` and the infra adapters implement them —
the same shape as `ArtifactWriter`.

### 2026-07-22 · The archive hash identifies inputs, and never lies about it

The stamp is the short git hash of the content that produced the build, so
`git show <hash>` reconstructs what a recruiter is holding. Three states:
clean → `a1b2c3d`, dirty → `a1b2c3d-dirty` plus a warning, no repository →
`nogit` plus a warning. When the dirty check itself fails, the build is assumed
dirty: an over-cautious suffix costs nothing, a false clean stamp destroys the
only guarantee the archive provides.

**Bug caught during verification:** provenance was initially read from
`archive/`, which is created on demand *after* stamping. git reported "not a
repository" for a path that did not exist yet, so every first archive was
stamped `nogit` inside a perfectly good repository — exactly the silent
wrong-stamp failure the layer spec warned about. Now read from the workspace
root, with a regression test.

### 2026-07-22 · Archives are append-only

An existing archive filename means that content was already archived today. It
is reported and skipped, never overwritten: the archive is a historical record,
not a cache.

### 2026-07-22 · Page counting stays in-process

LibreOffice converts; `pdf-lib` counts pages from the buffer. Shelling out to
`pdfinfo` would add a second external dependency to a feature that already
needs one, and would make the count untestable without installing poppler.
Conversion happens in a temp directory that is removed on every path including
failure — LibreOffice writes beside its input by default, and nothing may land
next to a user's files.

### 2026-07-22 · Page-budget failures never fail a check

Over the limit is an error. The check being *unable to run* is a warning —
never a failure, because LibreOffice is optional, and never a silent pass,
because the user must know the gate did not run.

### 2026-07-22 · Prep is a document, diff is scoped by application knowledge

`prep` emits markdown through the presenter and can be saved with `--out`, so
what you read is what you keep. `diff` restricts git to the files that variant
actually reads — its own file plus the shared content modules — which is the
application knowledge that makes it a use case rather than a shell alias.

---

## 2026-07-22 — Layer 5: CLI, Composition Root & Scaffolding

### 2026-07-22 · Milestone: first end-to-end run

`vitae init && vitae build --all` in an empty directory produces four `.docx`
files that open in Word. Every layer below is now exercised by one command.

### 2026-07-22 · One composition root, one place adapters are constructed

`bootstrap.ts` builds `JitiModuleLoader`, `FileContentRepository`,
`ThemeLoader`, and `FileArtifactWriter`. Nothing else does. The one remaining
`new` on a renderer lives in `RendererFactory`, which is where Layer 4
deliberately put format selection — a pure, theme-injected renderer is not an
I/O adapter, and moving it to bootstrap would spread format knowledge across
two layers.

### 2026-07-22 · Presentation is a strategy, and it forced the reports to be complete

`ReportPresenter` has a human and a JSON implementation from the start. The
JSON one costs almost nothing and buys machine-readable output for CI and
scripting; more usefully, it is a check on the report types — if the human
presenter ever needs data the JSON one cannot supply, something is being
computed in the presentation layer that belongs in a use case.

Reports go to stdout, everything else to stderr, so `vitae build --json | jq`
works no matter what else the run wants to say. Colour routes through one
`Colorizer` that disables itself under `--no-color`, `--json`, a non-TTY
stdout, or `NO_COLOR`.

### 2026-07-22 · Exit codes come from one policy table

`0` success, `1` broken, `2` blocked by the claims policy. A CI step needs to
react to "you have an undefendable claim" differently from "your content does
not load". When a run is both broken *and* blocked it reports `1`: fix what is
broken first, since the claim gate cannot be trusted until content loads.

### 2026-07-22 · `init` bypasses the facade

Every other command needs a workspace; `init` creates one. Forcing it through
`Application` would mean making the facade tolerate a nonexistent workspace,
weakening the guarantees every other command relies on.

Templates are string constants in a TypeScript module rather than files on
disk, so packaging stays trivial — no build step that copies a directory, no
runtime path resolution that breaks under `npm link`. The scaffolded content is
a plausible complete resume with four variants, because the fastest way to
learn the schema is to read one filled in.

### 2026-07-22 · The built-in sample content is gone

Earlier layers fell back to sample content when no workspace resolved, because
there was no way to create one. Now there is: a missing workspace is a
diagnostic naming every path searched and suggesting `vitae init`. Keeping the
fallback would mean a typo in `--dir` silently builds someone else's resume.

### 2026-07-22 · One error boundary, and `bin` is separate from the command tree

`withErrorBoundary` turns anything unexpected into one line plus an error code,
with stacks only under `--verbose`, and treats `EPIPE` as success so piping
into `head` is quiet. `main.ts` exports `runCli` and `bin.ts` is the
executable, which is what lets the onboarding test drive the real CLI
in-process — the whole day-one path runs in ~150ms instead of spawning
subprocesses.

Commander is configured with `exitOverride`, or it would call `process.exit`
itself and take the decision away from the exit-code policy.

---

## 2026-07-22 — Layer 4: Application Services

### 2026-07-22 · The application layer never prints and never exits

No `console`, no `process.exit`, no colors. Every use case returns a structured
report and Layer 5 decides how to display it and what exit code it implies.
This is the rule most likely to be violated under deadline pressure, so it is
enforced by ESLint (`no-console`, `no-restricted-properties` on `process.exit`
and `process.stdout`) rather than merely agreed — verified by probing it.

If a report does not carry enough information for the CLI to print a good
message, the fix is a richer report type, never a `console.log` in a use case.

### 2026-07-22 · Enforcement policy lives in the use case, not the domain

Layer 1 separated composing a document from judging its claims; this is where
the call is made. A `cannot-defend` claim blocks writing, `--force` overrides
it, and `check` evaluates without writing at all. Because that is one branch in
one use case rather than a rule baked into the composer, changing it is
trivial. Warnings never block: you must be able to build a resume for a project
you have not reviewed yet — you just need to be told.

### 2026-07-22 · `blocked` is a distinct status from `failed`

Blocked means everything worked and policy refused to write. Failed means
something is broken. Those are completely different experiences for the person
reading the output, so the report type distinguishes them and the CLI prints
them differently — blocked even suggests `--force`.

### 2026-07-22 · One class per use case, one public method

`BuildVariantUseCase.execute(...)`, not a service object with eleven methods
that grows into a god class. Each use case names something the user can do and
can be understood alone; adding a command means adding a class.

### 2026-07-22 · The app layer declares the workspace slice it needs

`WorkspacePaths` (root + distDir) is declared in `app/ports/` rather than
importing infra's `Workspace`. `Workspace` satisfies it structurally, so the
composition root passes one straight in — and the `app/` → `infra/` import
stays forbidden. Same reasoning for injecting `joinPath`: the application layer
never imports `node:path`.

### 2026-07-22 · Load once per Application instance, memoizing the promise

`build --all` reads content a single time and composes every variant from the
same in-memory library. The *promise* is cached rather than its result, so two
concurrent calls cannot both trigger a load — proven by a test that races
`list`, `check`, and `buildAll` and asserts one load.

### 2026-07-22 · Writes are atomic

`FileArtifactWriter` writes to a temp file in the destination directory and
renames it into place. `rename` within one filesystem is atomic, so a build
interrupted mid-write leaves either the previous file or the new one — never a
truncated `.docx` that Word refuses to open.

### 2026-07-22 · Filenames come from a naming policy, and are sanitised

`DefaultNaming` owns the `resume_llm_infrastructure.docx` convention so the
archive layer can implement the same interface with a different strategy rather
than duplicating it. Variant IDs are slugified rather than trusted: an ID
becomes a path, and a path built from unsanitised input is how a stray `/`
turns into a write somewhere surprising.

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

### 2026-07-22 · Archive filenames carry an optional human label

`--archive` stamps filenames with a git commit hash so `git show <hash>`
reconstructs exactly what was built. In practice nobody recalls a hash two
weeks after applying — they recall the company name. `--label <text>` inserts
a slugified segment between the variant id and the hash
(`2026-07-22_data-engineer_techcorp_a1b2c3d.docx`), reusing the same slugify
helper `DefaultNaming` already used for variant ids rather than duplicating
sanitization logic.

The label is rejected alongside `--all` at the CLI layer: one label cannot
name every variant a workspace builds, and a silent per-variant reinterpretation
would be worse than an error. `ArchiveNaming`'s constructor takes the label as
an optional third parameter and the `archiveNaming` factory type gained a
second argument; both changes are additive, so `DefaultNaming` and every
existing call site needed no change.

### 2026-07-22 · Project links become real hyperlink fields, not styled text

Reported symptom: links in a built resume were sized and coloured correctly
but not clickable in any viewer. The `link` text role only ever produced a
plain, styled `TextRun` — the visual appearance of a hyperlink with no field
behind it, which is not a link to anyone but a human reading it on screen.

`TextRun` in the document IR gained an optional `href`. This is deliberately
content, not presentation: a URL cannot be invented from the `link` role
alone, and the render layer must not guess at it, so it travels with the run
from composition. `ResumeComposer` normalizes `Project.link` into an href via
`toHref`, adding `https://` to a scheme-less address (content authors write
`github.com/user/repo`, not a full URL) and leaving an address with an
existing scheme untouched. An empty link produces no `href` and therefore no
hyperlink, rather than a link to nowhere.

The renderer side needed a shared `toParagraphChild` helper (new
`src/render/docx/blocks/textRuns.ts`) used by all three block renderers,
because a run with an `href` must become a real docx `ExternalHyperlink`
rather than a `TextRun`, and that translation was duplicated across
`paragraph.ts`, `bullet.ts`, and `splitLine.ts`. `StyleResolver` gained
`hyperlinkRunOptions`, since docx does not apply blue-and-underlined styling
to a hyperlink field automatically — that appearance is explicit run
formatting, set once rather than left to an undefined "Hyperlink" character
style.

One cost surfaced immediately: docx assigns each hyperlink a random
relationship id (`nanoid()`, internal, unseedable) on every render, which
broke the `word/document.xml` determinism test. The id is plumbing, not
content — the same category as the zip entry timestamps already excluded from
the determinism claim — so the test now normalizes relationship ids before
comparing rather than treating them as a genuine difference.

`PlainTextRenderer` needed no change: it already reads only `run.text`, which
is exactly the kind of thing the presentation-free IR is supposed to
guarantee.

### 2026-07-22 · Header contact entries link individually, narrowly

Follow-on from the project-link hyperlink fix: the header's email and social
links weren't clickable either, and for a structural reason the project-link
fix didn't touch — `header.contact` was joined into one string and rendered
as a single `TextRun`. A run carries at most one `href` for its whole span, so
nothing in that string could ever be individually linked.

`composeHeaderBlocks` now emits one run per contact entry, with plain
separator runs (no href) in between, so each fragment can be classified on
its own. The classification is deliberately narrower than the project-link
`toHref`: a contact list mixes things that should link (an email, a GitHub
URL) with things that must never link (a phone number, a city), and the
fragment's text is the only signal available. `classifyContactHref` only acts
on two unambiguous patterns — a bare email becomes `mailto:`, a bare domain
becomes `https://` — and leaves an already-schemed address (`tel:`, `mailto:`
written explicitly) untouched. Everything else is left as plain text rather
than guessed at, which is the deciding difference from `toHref` on
`Project.link`: that field is schema-defined to *be* a link in its entirety,
so any non-empty value can safely get a scheme; a contact array has no such
guarantee per entry.

The scheme-detection regex is now shared between `toHref` and
`classifyContactHref` rather than duplicated.

### 2026-07-22 · Education gains location and an optional GPA line

Requested layout: institution on its own line with location right-aligned,
degree/major on the next line with graduation date right-aligned, then an
optional `Major GPA: 3.32` line, then coursework — replacing the previous
single `institution, degree` line shared with the date.

`Education` gains a required `location: string` (mirroring `Job.location`,
already required there) and an optional `gpa?: GpaEntry` — `{ label, value }`
rather than a preformatted string, so the renderer still owns the `label:
value` punctuation rather than the content author having to match it by hand.
`gpa` is **absent**, not an empty string, when a resume shouldn't show one —
consistent with `Claim.reviewNotes`, the existing optional-field precedent.

`composeEducationBlocks` now emits two `splitLine` blocks (institution/location,
degree/date) instead of one combined line, then the GPA paragraph only when
`gpa !== undefined`, then coursework unchanged.

**This is a breaking content-schema change**: any existing `content/education.ts`
missing `location` now fails `SCHEMA_VALIDATION_FAILED` with a clear
`location — expected string, received undefined`, rather than silently
building an incomplete resume. Every fixture, the golden plain-text file, the
`init` template, and `examples/composeDemo.ts` were updated to match.

### 2026-07-22 · Correction: GPA folds onto the degree line, not its own line

Follow-up to the entry above — the GPA placement there was wrong. The correct
layout puts it on the **same line** as the degree, comma-separated:
`B.S. Computer Science, Major GPA: 3.32`, not on a line of its own underneath.

`composeEducationBlocks` now appends `, ${gpa.label}: ${gpa.value}` as an
additional run on the degree line's left side, inside the same `splitLine` as
before, rather than pushing a separate paragraph block. `Education.gpa` and
its schema are unchanged — only where the composer places the text moved.

### 2026-07-22 · Variant summary becomes optional

Reported as a bug: renaming a variant file (`data-engineering.ts`, not one of
the four scaffolded names) hit `SCHEMA_VALIDATION_FAILED: summary — expected
string, received undefined`, because `summary` was required from Layer 1
onward. Making it optional was the actual fix — some variants legitimately
have no summary worth writing, and the field author who deletes an unwanted
line should not be punished with a schema error for doing so.

`Variant.summary` is now `string | undefined`, absent entirely rather than an
empty string, matching the `Claim.reviewNotes` / `Education.gpa` precedent.
`ResumeComposer.compose` builds the Summary section conditionally — a section
array spread in ahead of the fixed ones — rather than emitting a heading with
an empty paragraph under it; `composeMeta`'s docx `description` falls back to
`''` when there is no summary to use.
