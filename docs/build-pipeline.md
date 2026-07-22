# How a build works

One command traced end to end. This is the document to read before changing
anything in the middle of the pipeline.

```bash
vitae build software-engineer --archive
```

## The whole path at a glance

```
argv
 └─ main.ts               parse, build the command tree
     └─ commands/build.ts translate args
         └─ bootstrap.ts  ── resolve workspace
                          ── load config, theme
                          ── probe capabilities
                          ── construct every adapter
             └─ Application.build()
                 └─ repository.load()          disk → validated ContentLibrary
                 └─ BuildVariantUseCase.execute()
                     ├─ ResumeComposer.compose()   library → ResumeDocument (IR)
                     ├─ ClaimsResolver + ClaimsPolicy → diagnostics
                     ├─ [gate] blocked? → return, write nothing
                     ├─ RendererFactory.create('docx') → DocxRenderer
                     ├─ renderer.render(doc)       IR → Buffer
                     ├─ writer.write(...)          atomic write to dist/
                     └─ archiveCopy()              stamp + append-only write
                 └─ VariantBuildReport
         └─ presenter.build(report) → text
     └─ exitCodeForBuild(report) → 0 | 1 | 2
```

Notice what each arrow carries: argv becomes typed input, disk becomes a
validated library, the library becomes a presentation-free IR, the IR becomes
bytes, and the outcome becomes a report. No stage reaches past the next one.

---

## 1. Parsing (`src/cli/main.ts`)

Commander parses argv. This file and Commander are the **only** things in the
codebase that know argv exists.

`program.exitOverride()` is set, or Commander would call `process.exit` itself
and take the decision away from the exit-code policy — and make the whole thing
untestable in-process. `--help` and `--version` throw with recognisable codes,
which are caught and treated as success.

Unsupported `--format` values are rejected here, before any workspace work.

## 2. The command handler (`src/cli/commands/build.ts`)

Four steps, deliberately: translate arguments, call the use case, present the
report, return an exit code. Under 30 lines.

If a handler ever starts branching on claim tiers or formats, that logic
belongs in Layer 4. Keeping this rigid is what would let a future HTTP or MCP
frontend reuse the entire application untouched.

## 3. Bootstrap — the composition root (`src/cli/bootstrap.ts`)

The only module that constructs concrete classes.

1. **Resolve the workspace** — `--dir` → `VITAE_DIR` → walk up → `~/.vitae`.
   Failure returns a diagnostic naming every path tried.
2. **Load `config.json`** — missing is fine; unknown keys warn rather than
   fail.
3. **Construct `JitiModuleLoader`** rooted at the workspace.
4. **Load the theme** — missing `theme.ts` means `DEFAULT_THEME`; a partial one
   is validated and merged over the defaults.
5. **Probe capabilities once** via `CapabilityRegistry` — `which git`,
   `which soffice`, plus a version call for whatever exists.
6. **Assemble the dependency bundle.** git and LibreOffice adapters are wired
   in **only if present**; their absence is what makes downstream features
   degrade with warnings rather than fail.
7. Return a configured `Application`.

Content itself is *not* loaded here — the facade does that lazily, so `vitae
where` does not pay to read every content file.

## 4. Loading content (`FileContentRepository`)

Triggered by the first call needing content, and memoized at the facade so
`--all` reads once.

For each of the six required files in `content/`:

1. Find `<name>.ts` (or `.js`).  Missing → `MISSING_CONTENT_FILE` naming the
   expected path.
2. Execute it through the `ModuleLoader`. jiti runs TypeScript at runtime with
   caching off — a stale cached bullet would be a maddening bug. A default
   export wins; a single named export is accepted; anything else is reported. A
   throw from user code becomes `MODULE_LOAD_FAILED` with the file path, never
   a jiti stack trace.
3. Validate against its zod schema, bound as `z.ZodType<DomainType>`. Failures
   go through the single `ZodDiagnosticMapper`, producing
   `variants/backend.ts: skills[2].label — expected string, received number`.

Then variants: every `.ts` in `variants/`, sorted for determinism. The filename
is the id, and a declared `id` that disagrees is `VARIANT_ID_MISMATCH` — not a
silent preference for one.

**Nothing stops at the first error.** Diagnostics accumulate across every file,
so one run tells you everything wrong with your content. Finally
`ContentLibrary.create` runs its own duplicate-id checks, surfaced as more load
diagnostics rather than thrown.

The output is an immutable `ContentLibrary` — the sole owner of ID lookup, so
no other code scans collections.

## 5. Composition (`ResumeComposer`)

`compose(variant, library) → Result<ResumeDocument, DomainError[]>`.

Resolves `projectIds` to projects — **accumulating every unknown id**, not
failing on the first — then assembles sections in canonical order: header →
summary → education → skills → experience → projects → leadership & awards.

It also builds `DocumentMeta`:

| Property      | Derived from                                        |
| ------------- | --------------------------------------------------- |
| `title`       | `header.name` + ` — ` + `variant.label`              |
| `creator`     | `header.name`                                        |
| `description` | `variant.summary`                                    |
| `keywords`    | skill bodies, split on commas, trimmed, deduplicated |

That keyword derivation is why every file carries its own ATS-visible metadata
for free.

The output is presentation-free. Composition **never refuses to build** — it
does not consult the claims policy at all. Judgement is a separate concern, and
that separation is what makes `check` and `--force` trivial.

## 6. The claims gate (`BuildVariantUseCase`)

`ClaimsResolver` maps the variant's projects to their claims. `ClaimsPolicy`
turns those into diagnostics using an injectable severity mapping — by default
`cannot-defend` → error, `needs-review` → warning, `confident` → nothing.

Then the one branch that matters:

```ts
if (validation.hasErrors && input.force !== true) {
  return { variantId, status: 'blocked', diagnostics: validation.diagnostics };
}
```

**Nothing is written.** This is the entire enforcement mechanism — one branch,
in one use case, deliberately not baked into the composer so it can be
tightened, loosened, or overridden without touching composition.

Warnings fall through and still produce a file.

## 7. Rendering (`DocxRenderer`)

`RendererFactory` maps `'docx'` to a `DocxRenderer` carrying the loaded theme —
the one place a format name becomes a renderer.

The renderer walks sections, emits a heading paragraph (uppercased, bordered
per theme), and dispatches each block through the typed registry. Every styling
question resolves in `StyleResolver`, the only class that reads `theme.sizes`.

Four docx constraints are encoded explicitly, because each is a
silent-corruption bug rather than a crash:

- **Never `\n` inside a run.** Line breaks come from separate paragraphs.
- **Never a literal `•`.** Bullets come from the numbering config, or they are
  not lists to Word, to an ATS parser, or to a screen reader.
- **Page size must be set explicitly**, or output silently becomes A4.
- A `PageBreak` must live inside a `Paragraph`.

`Packer.toBuffer` produces the bytes. The renderer touches no filesystem.

## 8. Writing (`FileArtifactWriter`)

`ensureDir`, then an **atomic** write: bytes go to a temp file in the
destination directory and are renamed into place. `rename` within one
filesystem is atomic, so a build interrupted mid-write leaves either the
previous file or the new one — never a truncated `.docx` that Word refuses to
open.

The filename comes from `DefaultNaming`: prefix from config, variant id with
hyphens turned to underscores, extension from format.

## 9. Archiving (`--archive` only)

1. **Stamp** via `ContentStamper` (git). Read from the **workspace root**, not
   `archive/` — that directory is created on demand *after* this point, and
   asking git about a path that does not exist yet reports "not a repository",
   which would silently stamp every first archive `nogit`. That was a real bug;
   there is a regression test.
2. **Warn on anything that weakens the guarantee** — `-dirty` when the tree has
   uncommitted changes, `nogit` outside a repository. If the dirty check itself
   fails, assume dirty: an over-cautious suffix costs nothing, a false clean
   stamp destroys the only property the archive provides.
3. **Name** via `ArchiveNaming` — `2026-07-22_software-engineer_a1b2c3d.docx`.
4. **Check existence.** Already there → report `ARCHIVE_EXISTS` and stop.
   Archives are append-only; a historical record is never clobbered to save a
   rebuild.
5. Write the same bytes.

Every failure here is a **warning**, never a build failure — the `.docx` is
what the user asked for, and losing it because provenance could not be read
would be the wrong trade.

## 10. Reporting and exit

The use case returns a `VariantBuildReport`: status, paths, byte length, and
diagnostics. Plain data, no formatting, no ANSI.

The presenter turns it into text — `HumanPresenter` for aligned coloured
output, `JsonPresenter` for `JSON.stringify`. Colour routes through one
`Colorizer` that disables itself under `--no-color`, `--json`, a non-TTY
stdout, or `NO_COLOR`.

`exitCodeForBuild` maps status to code: written → `0`, blocked → `2`, failed →
`1`, worst-wins across variants with `1` beating `2`.

Finally `withErrorBoundary` catches anything unexpected, printing one line plus
an error code, with stacks only under `--verbose`, and treating `EPIPE` as
success so piping into `head` is quiet.

---

## How other commands differ

| Command  | Diverges at                                                          |
| -------- | -------------------------------------------------------------------- |
| `check`  | stops after step 6; renders only under `--pages`, then counts pages   |
| `list`   | stops after step 4; summarizes the library                            |
| `prep`   | stops after step 4; resolves claims and emits markdown                |
| `text`   | composes and renders, but prints instead of writing                   |
| `diff`   | needs only the workspace and git — no composition                     |
| `doctor` | reports capabilities; tolerates content that does not load            |
| `init`   | **bypasses all of it** — creates the workspace every other step needs |
