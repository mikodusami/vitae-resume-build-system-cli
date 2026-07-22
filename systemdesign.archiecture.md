# vitae — System Design

A one-word TypeScript CLI that builds resume variants as .docx files from typed content. The tool is generic and installable by anyone; your actual resume content lives in a local `.vitae/` folder that the tool discovers and reads.

## The core split

Two things that were tangled in the first design are now cleanly separated:

**The tool** (`vitae`) — a published/cloneable npm package containing the renderer, CLI, validation, and archive logic. It knows about _formats_, not about you. Installed globally once, used across any number of resume folders.

**Your data** (`.vitae/`) — a folder of TypeScript content files, a theme, and build output. It's yours, it's a git repo, and it never gets committed to the tool's repo.

This is the git model: `git` is installed once, `.git/` is per-project. Someone else clones `vitae`, runs `vitae init`, and gets a scaffolded `.vitae/` with example content they replace with their own — they never touch your bullets, and you never have to strip personal data to share the tool.

## Folder resolution

Running `vitae build` looks for `.vitae/` in the current directory, then walks up parent directories (same as git), then falls back to `~/.vitae`. So you can keep one canonical resume repo at `~/resume/.vitae/` and still run commands from anywhere inside it, or keep a `~/.vitae` global default if you'd rather not think about location. `vitae where` prints which folder resolved, so there's never ambiguity about what you just built.

## `.vitae/` layout

```
.vitae/
├── config.json          # name of the owner, default variant, output prefs
├── theme.ts             # fonts, margins, sizes, spacing
├── content/
│   ├── header.ts        # name + contact line
│   ├── education.ts     # degree line + per-variant coursework strings
│   ├── work.ts          # RA, TDI-USA, ipNX blocks (shared across variants)
│   ├── projects.ts      # all project defs, incl. alternate framings
│   ├── leadership.ts    # TA block + awards line
│   └── claims.ts        # defensibility registry
├── variants/
│   ├── data-engineer.ts
│   ├── llm-infrastructure.ts
│   ├── software-engineer.ts
│   └── responsible-ai.ts
├── dist/                # latest builds (gitignored)
└── archive/             # dated + hash-stamped sent versions (committed)
```

The whole folder is a git repo you own. Content is TypeScript, so `git diff` shows exactly which bullet changed between versions — the thing binary .docx files can never give you.

## Tool layout

```
vitae/
├── src/
│   ├── cli.ts               # command dispatch
│   ├── resolve.ts           # find .vitae/, walking up then ~
│   ├── load.ts              # runtime TS loading + schema validation
│   ├── schema.ts            # zod schemas for all content types
│   ├── render/
│   │   ├── blocks.ts        # sectionHeader(), bullet(), titleDateLine()
│   │   └── document.ts      # buildDoc(variant, content, theme) → Document
│   ├── commands/
│   │   ├── init.ts  build.ts  check.ts  list.ts  prep.ts  diff.ts  where.ts
│   └── templates/           # scaffold files copied by `vitae init`
└── package.json             # bin: { "vitae": "./dist/cli.js" }
```

`load.ts` imports the user's `.ts` files at runtime via `jiti` (or `tsx`), so there's no build step inside `.vitae/` — you edit a bullet, you run the command, done. Because that content now crosses a trust boundary from the tool's perspective, every loaded file is validated against a zod schema on the way in, producing an error like `projects.ts: project "mls-etl" missing required field "link"` rather than a stack trace from deep inside docx-js.

## Data model

```ts
export type Defensibility = "confident" | "needs-review" | "cannot-defend";

export interface Claim {
  id: string;
  defensibility: Defensibility;
  reviewNotes?: string[];
}

export interface ProjectDef {
  id: string; // "quantumbridge" | "quantumbridge-gov"
  claimId: string; // both framings share one claim
  name: string;
  tech: string;
  link: string;
  bullets: string[];
}

export interface JobDef {
  title: string;
  org: string;
  location: string;
  date: string;
  bullets: string[];
}

export interface Variant {
  id: string;
  label: string; // filename + docx Title property
  summary: string;
  coursework: string;
  skills: [label: string, body: string][];
  projectIds: string[]; // ordered refs into projects.ts
}
```

Variants hold no project text — only ordered IDs. Alternate framings (QuantumBridge standard vs. governance) are separate `ProjectDef`s sharing a `claimId`, so the honesty layer treats them as one underlying piece of work.

## The claims registry

Every claim carries a defensibility tier, and the build enforces it. A variant including a `cannot-defend` claim **fails the build**, naming the claim — structurally impossible to ship a resume you can't back up. `needs-review` builds fine but warns, and `vitae prep <variant>` generates an interview checklist from the `reviewNotes` of exactly that variant's claims, so the checklist is always in sync with what's actually on the page.

```ts
{
  id: "mls-etl",
  defensibility: "needs-review",
  reviewNotes: [
    "Read the ETL entrypoint end to end; sketch sources → parsers → validation → outputs",
    "Know one concrete data-quality check and one failure it catches",
    "Run it once locally; prepare an honest 'what I'd improve' answer",
  ],
}
```

After you actually review a project, flipping the tier to `confident` is a one-line commit — a dated record of when each project became interview-safe.

## Rendering and document properties

One renderer, driven entirely by the user's `theme.ts`, so format changes never touch content:

```ts
export const theme = {
  font: "Calibri",
  page: { width: 12240, height: 15840, margin: 720 }, // US Letter, 0.5"
  sizes: { name: 30, sectionHeader: 20, body: 19, meta: 18 },
  rightTab: 10800,
  bulletIndent: { left: 260, hanging: 160 },
  spacing: { sectionBefore: 110, bulletAfter: 16, line: 228 },
};
```

Theme living in `.vitae/` rather than in the tool is what makes the tool genuinely reusable — someone with different taste changes their fonts without forking anything.

Document properties are set per build from `config.json` + the variant, which is the metadata-retention requirement:

```ts
new Document({
  title: `${config.owner} — ${variant.label}`,
  creator: config.owner,
  description: variant.summary,
  keywords: variant.skills.map(([, body]) => body).join(", "),
  lastModifiedBy: "vitae",
  // sections, numbering, ...
});
```

Keywords derived from each variant's skills section means every file carries its own ATS-visible metadata for free.

## Versioning

`vitae build llm-infrastructure` writes `.vitae/dist/resume_llm_infrastructure.docx` — always latest, always overwritten, gitignored. Adding `--archive` also writes `.vitae/archive/2026-07-22_llm-infrastructure_a1b2c3d.docx`, stamped with date and the short git hash of the content that produced it. When a recruiter replies about something you sent three weeks ago, `git show <hash>` reconstructs exactly what they're holding. Rule of thumb: `--archive` whenever you actually send one; plain builds while iterating.

## CLI surface

```
vitae init                              # scaffold .vitae/ here from templates
vitae build <variant|--all> [--archive] [--pdf]
vitae check <variant|--all>             # page-count + claims validation, no output
vitae list                              # variants, their projects, defensibility status
vitae prep <variant>                    # interview checklist for that variant
vitae diff <variant> <git-ref>          # content changes since <ref>
vitae where                             # which .vitae/ folder resolved
```

`--pdf` shells out to LibreOffice when available; the same conversion powers `check`'s page-count gate, which fails if any variant exceeds one page — your hard limit becomes a test rather than something you eyeball. `diff` wraps `git diff <ref> -- content variants/<variant>.ts` inside the resolved folder.

## Build pipeline

Resolve `.vitae/` → load and schema-validate content, theme, config → resolve the variant's project IDs (unknown ID = error) → validate claims (cannot-defend = error, needs-review = warning) → construct `Document` with theme + doc props → `Packer.toBuffer` → write to `dist/` → optionally convert to PDF and assert page count → optionally archive with date + git hash. Deterministic: same content, same bytes.

## Dependencies

`docx` for generation, `commander` for the CLI, `jiti` for runtime TS loading of user content, `zod` for schema validation. LibreOffice is an optional system dependency used only for `--pdf` and the page-count gate. No database, no server. `npm link` (or `npm i -g`) makes `vitae` global, same as Problem Picker.

## Sharing story

Someone else clones the repo, runs `npm i -g .`, then `vitae init` in a fresh folder. They get a `.vitae/` scaffolded with a complete example resume — one variant, two jobs, one project, a theme — that builds successfully on first run. They replace the example content with theirs. Nothing about your history ships with the tool, and the README documents the content schema so they aren't reverse-engineering types.

## Migration path

`gen_resumes.js` already contains the renderer and all four variants' content, so most of v1 is mechanical: the render helpers become `render/`, the constants become `.vitae/content/`, the `VARIANTS` object splits into `.vitae/variants/*.ts`, and the theme constants lift into `.vitae/theme.ts`. Genuinely new: folder resolution, runtime loading + validation, the claims registry, `init` templates, and the archive convention. Scope: an evening for `init`/`build`/`list`/`check`, a second session for `prep`/`diff`/`archive`.

## Out of scope for v1

Per-posting tailoring (`vitae tailor <variant> --posting job.txt` proposing keyword swaps via a provider-agnostic AI runner — `claude -p`, Codex, or ChatGPT CLI behind one interface, matching the pattern from your other tools). Cover-letter generation from the same content blocks. Application tracking that joins archived builds to where they were sent.
