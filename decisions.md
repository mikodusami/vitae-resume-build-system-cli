# Decisions

A dated record of architectural decisions. Newest last. Each entry states what
was decided and why, so a future change knows what it is overturning.

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
