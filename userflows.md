# User flows

Hands-on flows for verifying every layer that exists. Each flow states what to
run, what you should see, and what it proves. Run them from the repo root.

Layers not yet built have no flows here; this file grows one section per layer.

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
