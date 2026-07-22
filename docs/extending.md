# Extending vitae

Recipes for the changes you are most likely to want. Each names the files to
touch and, more usefully, the ones you should *not* need to.

Before starting: `npm run typecheck && npm run lint && npm test`. The lint step
enforces the layer boundaries, so it will catch an import pointing the wrong
way before you get far.

---

## Add a command

Say `vitae stats`, printing counts across the workspace.

1. **A use case** — `src/app/usecases/StatsUseCase.ts`. One class, one public
   `execute`, collaborators injected. Adding a command means adding a class,
   never editing a shared service.
2. **A report type** — in `src/app/reports/reports.ts`. Plain data.
3. **Presenter methods** — add `stats(report)` to the `ReportPresenter`
   interface, then to both `HumanPresenter` and `JsonPresenter`. TypeScript
   will not let you forget the second one.
4. **Wire the facade** — a method on `Application` that loads the library and
   delegates.
5. **A handler** — `src/cli/commands/stats.ts`: bootstrap, call, present,
   return a code. Keep it under ~30 lines.
6. **Register it** in `src/cli/main.ts`.
7. **Test it** — a use-case test against fakes, plus a CLI test through
   `runCliCaptured`.

**Do not** put logic in the handler. If it starts branching on claim tiers or
formats, that belongs in the use case.

---

## Add an output format

Say HTML.

1. `src/render/html/HtmlRenderer.ts` implementing `Renderer<string>`. Consume
   the IR; do not reach for anything the domain does not expose.
2. Add `'html'` to `OUTPUT_FORMATS` in `src/app/reports/reports.ts`.
3. Add the branch in `RendererFactory.create` and the extension in the
   `EXTENSIONS` maps in `ArtifactNaming.ts` and `ArchiveNaming.ts`.

That is all. `--format html` works everywhere, including archiving, because
format selection lives in exactly one place and naming is a policy object.

**You should not need to touch the domain.** If rendering HTML requires
information the IR cannot express, stop — that is a domain change (see below),
not something to work around in the renderer.

---

## Add a block kind

Say a two-column skills grid.

1. Extend the `Block` union in `src/domain/document/`.
2. Add a handler in `src/render/docx/blocks/` and register it in
   `registry.ts`.
3. Handle it in `PlainTextRenderer`.

Step 2 is not optional and you cannot forget it: the registry is a mapped type
over the union, so a missing kind is a **compile error**.

Then make the composer emit it. This is the right shape of change when the
resume needs to *say* something structurally new.

---

## Add a text role

Say `emphasisHeading`, styled between a section heading and body.

1. Add it to `TextRole` in the domain.
2. Add its size to `Theme['sizes']` and `DEFAULT_THEME`, plus the theme schema
   in `ThemeLoader.ts`.

`StyleResolver` picks it up automatically — it indexes `theme.sizes` by role.

This is the correct fix when you want one part of the resume styled differently
from another that currently shares a role. Special-casing a section inside a
block renderer is the wrong fix, because it puts presentation knowledge
somewhere that cannot be re-themed.

---

## Add a content field

Say `Project.role` ("Solo", "Team of 4").

1. Add it to the `Project` interface in `src/domain/model/content.ts`.
2. **The build now breaks** at `src/infra/schema/contentSchemas.ts`, because
   the schema is annotated `z.ZodType<Project>` rather than inferred. That is
   the mechanism working exactly as designed — add the field to the schema.
3. Emit it in `ResumeComposer`.
4. Add it to the `init` template in `src/cli/templates/files.ts`, and to
   `tests/fixtures/workspace/`.
5. Document it in [content-schema.md](content-schema.md).

Never use `z.infer`. The annotation is the entire reason drift is caught at
compile time instead of by a confused user at runtime.

---

## Add an external program

Say Pandoc.

1. **A port** in `src/app/ports/environment.ts` — the app layer must depend
   only on interfaces it owns.
2. **An adapter** in `src/infra/`, taking a `ProcessRunner` in its constructor.
   Never spawn directly: the runner handles timeouts, output capture, and error
   normalization, and it is what tests fake.
3. **A capability** — add it to `BINARIES` and `VERSION_ARGS` in
   `CapabilityRegistry.ts`, and a note in `DoctorUseCase`'s
   `CAPABILITY_NOTES`.
4. **Wire it conditionally** in `bootstrap.ts`, only when the probe found it.
5. **Degrade, never fail.** A missing program yields a warning naming the
   install step. Someone who cloned this to build a resume must never be
   blocked by an optional dependency.
6. Test against `FakeProcessRunner`. **No test may spawn the real binary.**

---

## Change what blocks a build

The whole enforcement decision is one branch in
`BuildVariantUseCase.execute`:

```ts
if (validation.hasErrors && input.force !== true) {
  return { variantId, status: 'blocked', diagnostics: validation.diagnostics };
}
```

To make `needs-review` blocking too, you do not touch that branch at all — pass
a different severity mapping:

```ts
new ClaimsPolicy({
  'cannot-defend': 'error',
  'needs-review': 'error',
  confident: 'none',
});
```

`Application` accepts a `claimsPolicy` in its dependency bundle, so this is
wiring in `bootstrap.ts`, not a code change. Making it configurable from
`config.json` would be a small, natural next step.

---

## Things that should stay true

If a change requires breaking one of these, the design has drifted and it is
worth stopping to reconsider:

- `src/domain/` imports no Node built-ins, no `zod`, no `docx`.
- `ResumeDocument` contains no fonts, sizes, or margins.
- `PlainTextRenderer` needs no theme. It is the canary for IR leakage.
- `src/app/` contains no `console`, no `process.exit`, no `fs`.
- Concrete adapters are constructed only in `bootstrap.ts`.
- Reports go to stdout; everything else goes to stderr.
- No test spawns a real `git` or `soffice`.

The first four and the sixth are enforced by ESLint and will fail
`npm run lint`.

---

## Where the seams already are

Left open deliberately, for features not yet built:

| Seam                                     | Intended for                                  |
| ---------------------------------------- | --------------------------------------------- |
| `NamingStrategy`                         | more filename conventions                     |
| `ProgressListener`                       | streaming progress during long builds         |
| `CheckReport.pageCounts`                 | already filled by the page gate               |
| `RendererFactory`                        | new output formats                            |
| `ClaimsPolicy` severity map              | stricter or looser defensibility rules        |
| `ProcessRunner`                          | any future external tool                      |

The documented next feature is `vitae tailor <variant> --posting job.txt`,
proposing (never auto-applying) keyword swaps against a real job description.
It slots in as a new use case behind a provider-agnostic AI runner port, with
`ProcessRunner` already in place to execute `claude -p`, Codex, or another CLI
as interchangeable adapters — no changes needed below the application layer.
