# User flows

Hands-on flows for verifying every layer that exists. Each flow states what to
run, what you should see, and what it proves. Run them from the repo root.

Layers not yet built have no flows here; this file grows one section per layer.

---

## Layer 5 — CLI, Composition Root & Scaffolding

The tool is now genuinely usable by someone who has never seen it. These flows
run in a scratch directory, not the repo.

**Setup:** `npm run link` (re-link after this layer — the binary moved to
`dist/cli/bin.js`).

### Flow 5.A — The milestone: day one, from nothing

```bash
mkdir -p /tmp/vt-demo && cd /tmp/vt-demo && vitae init && vitae build --all
```

Expect `init` to report 14 files created and print next steps, then four
variants built:

```
✓ backend            …/dist/resume_backend.docx (10626 bytes)
✓ data-engineer      …/dist/resume_data_engineer.docx (10602 bytes)
✓ software-engineer  …/dist/resume_software_engineer.docx (10651 bytes)
✓ systems            …/dist/resume_systems.docx (10635 bytes)
```

Then `file .vitae/dist/*.docx` — all four `Microsoft Word 2007+` — and open
one. This is the whole tool working: discovery, runtime TypeScript loading,
validation, composition, the claims gate, rendering, and atomic writes.

### Flow 5.B — The three exit codes

```bash
vitae check; echo "clean=$?"
```

Then flip a claim to `cannot-defend` in `.vitae/content/claims.ts`:

```bash
vitae check; echo "blocked=$?"
vitae build --all; echo "build blocked=$?"
```

Then break a content file (`echo 'export default { name: 42 };' > .vitae/content/header.ts`):

```bash
vitae check; echo "broken=$?"
```

Expect `0`, `2`, `2`, `1`. The `2` is the point: a CI step can treat "you have
a claim you cannot back up" differently from "your content does not load". With
both problems at once you get `1` — fix what is broken first.

### Flow 5.C — Machine-readable output

```bash
vitae list --json | jq '.variants[].variantId'
vitae build --all --json | jq '.variants[] | {variantId, status, byteLength}'
```

Expect clean JSON. The `workspace:` notice and every warning went to stderr, so
the pipe never sees them — that is the entire reason the JSON presenter exists.
`vitae list --json 2>/dev/null` shows the separation plainly.

### Flow 5.D — `init` protects your work

```bash
vitae init; echo "exit=$?"
```

Expect a refusal naming the existing workspace, exit 1, and — importantly —
your edits still intact. `vitae init --force` overwrites.

### Flow 5.E — No workspace is a message, not a stack trace

```bash
cd /tmp && vitae list; echo "exit=$?"
```

Expect one line naming every directory searched and suggesting `vitae init`,
and exit 1. No jiti internals, no zod internals — the promise made back in the
loading layer.

### Flow 5.F — Where did that build go?

```bash
vitae where --dir /tmp/vt-demo/.vitae
```

Expect the root, `matched by: --dir`, and all six derived paths. Run it
without `--dir` from inside a subdirectory and the rule becomes
`walked up from the current directory`.

### Flow 5.G — The onboarding test

```bash
npx vitest run tests/cli/
```

Expect 35 passed in well under a second. The first file is the important one:
it runs `init` then `build --all` in a temp directory and asserts four real
`.docx` files came out, each starting with the `PK` zip magic. It is the single
highest-value test here — if it breaks, nobody gets far enough to hit any other
bug.

---

## Layer 4 — Application Services

`vitae build` now exists: it resolves the workspace, loads content, composes,
validates, renders, and writes to `dist/`. Unlike the read-only commands it
requires a real `.vitae/` folder — there is nowhere sensible to write artifacts
for content compiled into the tool.

**Setup:** `npm run build`, then `cd tests/fixtures/workspace`.

### Flow 4.A — Build every variant

```bash
vitae build --all
```

Expect one line per variant, each with its path and byte count:

```
✓ data-engineer  …/.vitae/dist/resume_data_engineer.docx (9641 bytes)
    warning [CLAIM_NEEDS_REVIEW]: Claim "etl" (etl) needs review before this variant is sent.
✓ software-engineer  …/.vitae/dist/resume_software_engineer.docx (9595 bytes)
```

Then `file .vitae/dist/*.docx` — expect `Microsoft Word 2007+` for both, and
open one. Note that the `needs-review` warning **did not block the build**:
you must be able to build a resume for a project you have not reviewed yet, you
just need to be told.

### Flow 4.B — The honesty gate blocks a build, and nothing is written

Edit `.vitae/content/claims.ts` and change `etl`'s `defensibility` to
`'cannot-defend'`, then:

```bash
rm -rf .vitae/dist && vitae build data-engineer; echo "exit=$?"; ls .vitae/dist
```

Expect:

```
✗ data-engineer  blocked
    error [CLAIM_CANNOT_DEFEND]: Claim "etl" (etl) cannot be defended and must not ship on this variant.

1 variant(s) blocked by undefendable claims. Fix the claim, or rebuild with --force if you have decided otherwise.
exit=1
```

and `dist/` **not created at all** — nothing was written. `blocked` is
deliberately a different status from `failed`: the build worked perfectly,
policy refused to ship it.

### Flow 4.C — `--force` overrides the gate without hiding it

```bash
vitae build data-engineer --force; echo "exit=$?"
```

Expect `✓ … (9644 bytes)` and exit 0 — **with the error diagnostic still
printed**. Forcing silences the gate, not the warning. Revert the claim when
you are done.

### Flow 4.D — Formats and output directories

```bash
vitae build software-engineer --format txt
vitae build software-engineer --out /tmp/vitae-out
vitae build software-engineer --format pdf; echo "exit=$?"
```

Expect a `.txt` artifact, then one written to `/tmp/vitae-out`, then
`unknown format "pdf". Known formats: docx, txt.` with exit 2 — a typed error
rather than a throw, because a format name is user input.

### Flow 4.E — One broken variant does not hide the others

Break one variant only — point `.vitae/variants/software-engineer.ts` at a
project ID that does not exist — then:

```bash
vitae build --all; echo "exit=$?"
```

Expect the good variant to still report `✓ written` and the broken one
`! failed` with its diagnostic, and exit 1. A run that stopped at the first
error would make you fix and rerun once per variant to learn what one run could
have told you.

### Flow 4.F — The layer's own rules are enforced, not agreed

```bash
npx vitest run tests/app/
```

Expect 30 passed, all against in-memory fakes — no disk, no jiti, no docx
adapter. Then prove the purity rule:

```bash
printf "export function bad(): void { console.log('x'); process.exit(1); }\n" > src/app/probe.ts && npx eslint src/app/probe.ts; rm src/app/probe.ts
```

Expect errors for both `no-console` and `process.exit`. The application layer
returns reports; only the CLI prints and exits.

---

## Layer 3 — Theme & Rendering

The tool can now turn a composed document into a real `.docx` and into plain
text. Writing files is still a later layer's job, so the renderer returns a
buffer and the CLI prints — the one script that writes does so explicitly.

**Setup:** `npm run build` (the linked `vitae` runs `dist/`).

### Flow 3.A — Render your content as plain text

```bash
cd tests/fixtures/workspace && vitae text software-engineer
```

Expect a readable resume: `SUMMARY`, `EDUCATION`, `SKILLS`, `EXPERIENCE`,
`PROJECTS`, `LEADERSHIP & AWARDS`, with dates right-aligned at column 80 and
bullets as `- `. Try `--width 60` and watch the dates move.

This renderer takes **no theme at all**. That is the point of the flow: if the
document IR had quietly become docx-shaped, this output would be impossible to
produce.

### Flow 3.B — Produce a real .docx and open it

```bash
npx vite-node examples/renderDocx.ts data-engineer /tmp/vitae-demo.docx
```

Expect `theme: Calibri, name size 32 half-points` — the `32` comes from the
fixture workspace's `theme.ts`, proving your theme merged over the tool's
defaults (the default is 30). Then:

```bash
file /tmp/vitae-demo.docx && open /tmp/vitae-demo.docx
```

Expect `Microsoft Word 2007+`, and a document that opens in Word with the name
centered, ruled section headings, right-aligned dates, and real bullets.

### Flow 3.C — A theme change moves the output

Edit `tests/fixtures/workspace/.vitae/theme.ts` — try `font: 'Georgia'` and
`sectionRule: { enabled: false }` — then rerun Flow 3.B and reopen the file.

Expect the font to change and the rules under headings to disappear, with no
source change anywhere. Note the file only ever states what you want changed;
everything else comes from `DEFAULT_THEME`.

Then break it deliberately: set `sizes: { body: -5 }`, or misspell `font` as
`fonts`, and rerun. Expect a diagnostic that reads exactly like a content
error — `theme.ts: sizes.body — Too small: …` — because theme validation
routes through the same mapper.

### Flow 3.D — The structural guarantees

```bash
npx vitest run tests/render/
```

Expect 30 passed. These are not smoke tests; they unzip the rendered buffer and
assert on the actual OOXML:

- bullets exist as `<w:numPr>` and **no literal `•` appears anywhere** — a
  hard-coded bullet looks identical on screen but is not a list to Word, an
  ATS, or a screen reader
- split lines carry a right tab stop at the themed position, and moving
  `rightTab` in the theme moves it in the XML
- page size is written explicitly, so output is never silently A4
- no run contains a newline
- `docProps/core.xml` carries the title, creator, and derived keywords

### Flow 3.E — The golden file is your regression signal

```bash
cat tests/render/golden/resume.txt
```

That committed file is the expected plain-text rendering. After any deliberate
change to the document IR, regenerate it and read the diff — it is the fastest
way to see what a domain change did to real output:

```bash
UPDATE_GOLDEN=1 npx vitest run tests/render/PlainTextRenderer.test.ts && git diff tests/render/golden/resume.txt
```

### Flow 3.F — The boundary still holds

```bash
npm run lint
```

`domain/` still cannot import `docx`, and `render/` cannot import from `cli/`
or `app/`. The rendering layer knows about the domain; the domain has never
heard of a font.

---

## Layer 2 — Workspace & Content Loading

The tool now reads a real `.vitae/` folder from disk. These flows use the
committed fixture workspace at `tests/fixtures/workspace/`, which is a genuine,
valid workspace — the same one the tests load.

**Setup:** `npm run link` (or `npm run build` if you already linked once).
Remember the linked binary runs `dist/`, so rebuild after changing `src/`.

### Flow 2.A — Discovery finds the workspace by walking up

```bash
cd tests/fixtures/workspace && vitae where
```

Expect the resolved `.vitae/` path followed by its six derived paths (content,
variants, dist, archive, theme, config). Now prove it walks up like `git`:

```bash
mkdir -p tests/fixtures/workspace/a/b/c && cd tests/fixtures/workspace/a/b/c && vitae where
```

Expect the *same* root, found three levels up. Clean up with
`rm -rf tests/fixtures/workspace/a`.

### Flow 2.B — Real content reaches the domain

```bash
cd tests/fixtures/workspace && vitae list && vitae demo software-engineer
```

Expect `workspace: …/.vitae` on stderr, then **two** variants — `data-engineer`
and `software-engineer` — neither of which exists in the built-in sample. That
is disk → jiti → zod → `ContentLibrary` → composer, end to end.

`vitae demo` with no argument uses `defaultVariant` from `config.json`
(`data-engineer`).

### Flow 2.C — Convention over manifest: adding a variant is dropping in a file

```bash
cp tests/fixtures/workspace/.vitae/variants/software-engineer.ts \
   tests/fixtures/workspace/.vitae/variants/backend.ts
```

Edit the copy's `id` to `backend`, then run `vitae list` from inside the
workspace. Expect three variants — no registry was updated. Now edit the `id`
to `backendd` and rerun: expect
`VARIANT_ID_MISMATCH … declares id "backendd" but the filename says "backend"`,
because ambiguity about which name wins is an error rather than a guess.
Delete `backend.ts` when done.

### Flow 2.D — Every problem is reported at once, with provenance

Build a deliberately broken workspace:

```bash
rm -rf /tmp/vt-broken && mkdir -p /tmp/vt-broken/.vitae/content /tmp/vt-broken/.vitae/variants && cp tests/fixtures/workspace/.vitae/content/*.ts /tmp/vt-broken/.vitae/content/ && cp tests/fixtures/workspace/.vitae/variants/data-engineer.ts /tmp/vt-broken/.vitae/variants/
```

Then introduce three unrelated mistakes: set `label: 42` and rename `skills` to
`skils` in `/tmp/vt-broken/.vitae/variants/data-engineer.ts`, and add
`oops: true` to `/tmp/vt-broken/.vitae/content/header.ts`. Run:

```bash
cd /tmp/vt-broken && vitae list; echo "exit=$?"
```

Expect all of them in one run, each naming its file and dotted field path:

```
error [SCHEMA_VALIDATION_FAILED]: …/content/header.ts: oops — unknown field — check for a typo, or remove it
error [SCHEMA_VALIDATION_FAILED]: …/variants/data-engineer.ts: label — expected string, received number
error [SCHEMA_VALIDATION_FAILED]: …/variants/data-engineer.ts: skills — expected array, received undefined
…
N problem(s) found; nothing was built.
exit=1
```

The `skils` typo proves the strict-object rule: an unknown key is a loud
failure rather than a bullet that silently vanishes from your resume.

### Flow 2.E — A syntax error is a message, not a stack trace

Delete the final `];` from `/tmp/vt-broken/.vitae/content/claims.ts`, then run
`vitae check` there.

Expect one line — `error [MODULE_LOAD_FAILED]: …/claims.ts: ParseError:
Unexpected token` — and no jiti internals. This is the anti-corruption layer's
whole purpose: nothing from a third-party parser reaches the user raw.

### Flow 2.F — A broken workspace never silently uses sample content

Still inside `/tmp/vt-broken`, confirm `vitae list` exits 1 rather than
printing Ada's sample resume. Then compare with a directory that has no
workspace at all:

```bash
cd /tmp && vitae list
```

Expect `note: no .vitae/ folder found — using built-in sample content.` and
exit 0. Found-but-broken fails; absent falls back — and both say which.

### Flow 2.G — Overriding discovery

```bash
vitae where --dir tests/fixtures/workspace/.vitae
VITAE_DIR=$PWD/tests/fixtures/workspace/.vitae vitae list
vitae where --dir /nope; echo "exit=$?"
```

Expect the first two to resolve the fixture workspace from anywhere, and the
third to exit 1 rather than quietly falling through to discovery — building the
wrong resume is worse than an error.

---

## Layer 1 — Domain Core

There is no CLI yet, and that is correct for this layer: the domain composes a
resume into an in-memory document, and nothing yet knows how to turn that into
a file. These flows exercise it directly.

**Setup (once):**

```bash
npm install
```

### Flow 1.A — The gates all pass

```bash
npm run typecheck && npm run lint && npm test
```

Expect: no TypeScript output, no ESLint output, and `30 passed` across 4 test
files. Proves the layer's definition of done.

### Flow 1.B — Compose a resume by hand

```bash
npx vite-node examples/composeDemo.ts
```

Expect, in order:

1. **Document meta** — title `Ada Lovelace — Data Engineer`, and keywords
   `TypeScript, Python, SQL, Postgres, Airflow` derived from the variant's
   skill bodies (not hand-written anywhere).
2. **Sections** in canonical order: `(header)`, Summary, Education, Skills,
   Experience, Projects, Leadership & Awards — each listing its block kinds.
   Note `Projects: splitLine, bullet, splitLine, bullet`: one split line per
   project (name/tech pushed apart from the link) followed by its bullets.
3. **Claims report (default policy)** — one `warning` with code
   `CLAIM_NEEDS_REVIEW`, and `hasErrors: false`.
4. **Claims report (strict policy)** — the _same_ claim, now `error` with
   `hasErrors: true`, because the policy was constructed with a different
   severity mapping. No resolver or composer code changed.
5. **Unknown project ids** — two errors (`ghost`, `phantom`), not one.

Proves composition, keyword derivation, injectable policy, and error
accumulation end to end.

### Flow 1.C — The honesty gate blocks an undefendable claim

Edit [examples/composeDemo.ts](examples/composeDemo.ts) and change the `etl`
claim's `defensibility` from `'needs-review'` to `'cannot-defend'`, then rerun
Flow 1.B.

Expect: the default-policy report now shows `severity: 'error'`, code
`CLAIM_CANNOT_DEFEND`, and `hasErrors: true` — _and the document still
composes_. That separation is deliberate: the domain reports, the application
layer (a later layer) decides whether an error blocks writing the file, which
is what makes a `--force` flag and a check-only mode cheap to add.

Revert the edit when you're done.

### Flow 1.D — A typo in a project ID is caught, with the ID named

Edit the demo's variant `projectIds` to include a name that doesn't exist
(e.g. `'rankr'`), then rerun Flow 1.B.

Expect: `UNKNOWN_PROJECT: Unknown project "rankr".` The ID is quoted in the
message, so the fix is obvious without opening the content files.

### Flow 1.E — Duplicate IDs are rejected before anything is composed

Duplicate a project in the demo's `projects` array (same `id` twice) and rerun.

Expect: `library rejected: [ 'Duplicate projects id "etl".' ]` and exit code 1 —
the failure happens at `ContentLibrary.create`, not later at render time where
the symptom would be a silently dropped entry.

### Flow 1.F — The dependency rule is enforced by the build, not by discipline

```bash
printf "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n" > src/domain/probe.ts && npx eslint src/domain/probe.ts; rm src/domain/probe.ts
```

Expect: `error  'node:fs' import is restricted ... domain/ must stay free of
I/O: no Node built-ins`. The same config also blocks `domain/` importing from
`app/`, `infra/`, `cli/`, `docx`, or `zod`. This is the flow to rerun whenever
someone proposes "just one small import" into the domain.

### Flow 1.G — The IR carries no presentation

```bash
npx vitest run -t "produces no font, size, or margin information"
```

Expect: 1 passed. The composed document's JSON contains no font name, point
size, margin, or spacing — proof that a future PDF or HTML renderer can consume
the same IR without domain changes.

### Flow 1.H — Install the `vitae` command globally

```bash
npm run link
```

This builds `src/` to `dist/` and `npm link`s the `bin` entry. Verify:

```bash
which vitae && vitae --version
```

Expect a path in your npm global bin and `0.1.0`. To remove it later:

```bash
npm run unlink
```

### Flow 1.I — Drive the domain from the terminal

```bash
vitae --help
vitae list
vitae demo
vitae check
vitae prep
```

Expect:

- `--help` — four commands available now, four listed as planned, plus an
  explicit note that content is still built-in sample content.
- `list` — `data-engineer (Data Engineer)` with `! etl needs-review` and
  `✓ ranker confident`.
- `demo` — document metadata, then every section with each block's kind and
  its flattened text; `···` marks where a `splitLine` pushes left and right
  apart (`Analytical University, B.S. Computer Science ··· May 2026`).
- `check` — one `warning [CLAIM_NEEDS_REVIEW]`.
- `prep` — a `[ ]` checklist built from that claim's review notes.

Omitting the variant argument uses the first variant; `vitae demo <id>` picks
one explicitly.

### Flow 1.J — Exit codes are meaningful

```bash
vitae check; echo "check=$?"
vitae demo nope; echo "bad variant=$?"
vitae build; echo "planned=$?"
vitae bogus >/dev/null 2>&1; echo "unknown=$?"
```

Expect `0`, `1`, `2`, `2`. A `needs-review` claim warns but does not block; an
unknown variant fails and prints the known IDs; a planned-but-unbuilt command
exits 2 with the layer that will deliver it, rather than pretending to work.

To see the honesty gate actually block, flip `etl`'s `defensibility` to
`'cannot-defend'` in [src/cli/sampleContent.ts](src/cli/sampleContent.ts), run
`npm run build`, then `vitae check; echo $?` — expect an `error
[CLAIM_CANNOT_DEFEND]` and exit `1`, while `vitae demo` still composes the
document. Revert when done.
