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
