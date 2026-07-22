# Getting started

## Install

```bash
git clone <this repo> && cd vitae
npm install
npm run link
```

`npm run link` builds `dist/` and exposes `vitae` globally. `npm i -g .` does
the same thing permanently. To remove it: `npm run unlink`.

**The one thing that will confuse you later:** the global `vitae` runs
`dist/cli/bin.js`, not your source. After changing anything in `src/`, re-run
`npm run build` (or `npm run link`) or you will keep running the old code.

Requirements: Node 20+. git and LibreOffice are optional — see
[capabilities](#optional-capabilities) below.

## Create a workspace

```bash
mkdir my-resume && cd my-resume
vitae init
```

That writes a `.vitae/` folder containing a complete example resume: four
variants, four projects, two jobs, a theme, and a claims registry. It is a
working resume rather than empty stubs, because the fastest way to learn the
schema is to read one that is filled in.

```
.vitae/
├── config.json        owner, default variant, filename prefix
├── theme.ts           fonts, sizes, spacing
├── README.md          a short version of these docs, in the folder
├── .gitignore         ignores dist/
├── content/           the shared library every variant draws from
│   ├── header.ts        name + contact line
│   ├── education.ts     degree, date, default coursework
│   ├── work.ts          job history
│   ├── projects.ts      every project, referenced by id
│   ├── leadership.ts    leadership entries + the awards line
│   └── claims.ts        the defensibility registry
└── variants/          one file per resume; the filename is its id
    ├── software-engineer.ts
    ├── data-engineer.ts
    ├── backend.ts
    └── systems.ts
```

`init` refuses to overwrite an existing `.vitae/` unless you pass `--force`, so
running it twice by accident cannot destroy your content.

## Build

```bash
vitae build --all
```

```
✓ backend            …/dist/resume_backend.docx (10626 bytes)
✓ data-engineer      …/dist/resume_data_engineer.docx (10602 bytes)
✓ software-engineer  …/dist/resume_software_engineer.docx (10651 bytes)
✓ systems            …/dist/resume_systems.docx (10635 bytes)
```

Open one. That is the tool working end to end.

Build a single variant by name, and note that `dist/` is gitignored — those
files are disposable and rebuilt any time:

```bash
vitae build software-engineer
```

## Look around before editing

```bash
vitae list
```

Shows each variant, the projects on it, and how many claims sit at each
defensibility tier. This is the command that answers "what's on which resume
and can I defend it".

```bash
vitae where     # which .vitae/ folder resolved, and by which rule
vitae doctor    # what this machine can and cannot do
```

## Make it yours

Work in this order — it follows the dependencies:

1. **`content/header.ts`** — your name and contact line.
2. **`content/education.ts`** — your degree.
3. **`content/work.ts`** — your jobs. Lead each bullet with what changed and
   carry a number wherever one honestly exists.
4. **`content/projects.ts`** — every project you might put on a resume, each
   with a unique `id`.
5. **`content/claims.ts`** — one claim per project `claimId`, with a
   defensibility tier. Read [the claims guide](claims.md) before filling this
   in; it is the part of the tool with no equivalent elsewhere.
6. **`variants/*.ts`** — rename and edit. The filename **is** the variant id
   and must match the `id` field inside. Delete the ones you don't want.
7. **`config.json`** — set `owner` and `defaultVariant`.

Then:

```bash
vitae check      # validates everything, writes nothing
vitae build --all
```

Mistakes are reported with the file and the field, e.g.
`variants/backend.ts: skills[2].label — expected string, received number` —
never a stack trace. Every problem in a run is reported at once, so you fix
them in one pass rather than one rebuild at a time.

## Put it under version control

```bash
cd .vitae && git init && git add -A && git commit -m "my resume content"
```

Strongly recommended, and not just as a backup:

- `git diff` shows exactly which bullet changed between the version you sent in
  March and the one you sent in June — the thing a binary `.docx` can never
  tell you.
- `vitae build --archive` stamps archived copies with the commit hash, so
  `git show <hash>` reconstructs precisely what a recruiter is holding.
- `vitae diff <variant> <ref>` shows what changed on one resume since any ref.

Without git the tool still works; archives are just stamped `nogit` and warn.

## Day-to-day

```bash
vitae build software-engineer                                    # iterating
vitae build software-engineer --archive --label "TechCorp"       # actually sending it
vitae prep software-engineer --out prep.md                       # before the interview
vitae check --all                                                # before you trust any of it
```

`--label` names who the archive is for, so `archive/` is browsable by company
name later — you'll remember "TechCorp" long before you remember a commit
hash.

## Optional capabilities

Neither of these is required, and nothing hard-fails without them.

| Program     | Unlocks                                    | Without it                                  |
| ----------- | ------------------------------------------ | ------------------------------------------- |
| git         | archive hash stamping, `vitae diff`        | archives stamped `nogit` + warning          |
| LibreOffice | `build --pdf`, `check --pages`             | those warn and skip; everything else works  |

`vitae doctor` reports which you have. Install LibreOffice with
`brew install --cask libreoffice`, or from libreoffice.org.

## Next

- [Command reference](commands.md) — every flag
- [Content schema](content-schema.md) — every field
- [The claims registry](claims.md) — the concept worth understanding
