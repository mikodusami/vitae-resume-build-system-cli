# Git workflow

You don't need to know git deeply to use this well. Three commands cover
almost everything, and this guide walks through exactly when to reach for
each one — from editing content to sending an application to recalling it
months later.

If you already know git, skip to [Applying to a job](#applying-to-a-job) —
that part is specific to this tool.

## The three commands you need

```bash
cd .vitae
git status     # what changed since your last commit
git add -A     # stage everything changed
git commit -m "message describing what changed"
```

That's the whole day-to-day loop: check what changed, stage it, save it with
a message. Everything else in this guide is *when* to run that loop and *why*
it's worth doing at all.

## Why bother, for a resume

A `.docx` file can't be diffed — two versions of the same resume just look
like two unrelated binary blobs. Content here is plain TypeScript, so git
treats it like any other codebase:

- **`git diff`** shows exactly which bullet changed between the version you
  sent in March and the one you sent in June.
- **`git log`** is a dated history of every change — including exactly when
  you flipped a claim from `needs-review` to `confident`, which is proof you
  actually reviewed it before an interview.
- **`git show <hash>`** reconstructs the *exact* content that produced a given
  build, because `vitae build --archive` stamps every archived copy with the
  commit hash that produced it.

None of that works without commits. An edited-but-uncommitted `claims.ts` is
invisible to all three.

## Setting up

Once, when you first fill in your content:

```bash
cd .vitae
git init
git add -A
git commit -m "initial resume content"
```

`vitae doctor` confirms git is available and the workspace is a repository.
Everything in this guide still works without git — see
[without git](#without-git) at the bottom — but you lose all three things
above.

## The day-to-day loop

Whenever you make a *logical* change — added a variant, updated a project,
flipped a claim tier — commit it. Not after every keystroke; after a change
you'd want `git show` to be able to reconstruct.

```bash
# 1. Edit files — new variant, new bullet, updated claim, whatever
# 2. See what changed
git status

# 3. Stage and save
git add -A
git commit -m "add data-engineer variant"

# 4. Build
vitae build data-engineer
```

Good commit messages describe *what changed in the resume*, not implementation
detail — `"add data-engineer variant"`, `"flip ledger claim to confident"`,
`"tighten backend bullets for senior roles"`.

## Applying to a job

This is the part that's specific to this tool. Once you've built a resume
you're happy with, use `--archive` and `--label` together:

```bash
vitae build data-engineer --archive --label "TechCorp"
```

This writes **two** files:

1. `.vitae/dist/resume_data_engineer.docx` — the normal build, overwritten
   every time you rebuild
2. `.vitae/archive/2026-07-22_data-engineer_techcorp_a1b2c3d.docx` — a dated,
   labeled, hash-stamped copy that is never overwritten

**Send the archive copy, not the `dist/` copy.** The archive is the one that
stays put even after you keep editing content for other applications.

```bash
open .vitae/archive/2026-07-22_data-engineer_techcorp_a1b2c3d.docx
# attach it, upload it, whatever the application needs

git add -A
git commit -m "send data-engineer to TechCorp"
```

Commit right after sending. That commit is what `git show` will reconstruct
later, and the message is a plain-English log of who got what and when —
`git log` becomes an application history.

### Why both a label and a hash

The hash (`a1b2c3d`) identifies the exact commit that produced the build —
that's what makes `git show a1b2c3d` work. But nobody remembers a hash two
weeks later. You remember **TechCorp**. The label exists so `ls archive/` is
readable by the thing you'll actually search for:

```
2026-07-22_data-engineer_techcorp_a1b2c3d.docx
2026-07-24_backend_northwind_9f3e21a.docx
2026-07-30_data-engineer_acme_data_team_5c8a012.docx
```

`--label` is free text — company name, "company-role" if you apply twice to
the same place for different roles, whatever you'd type into a search later.
It only applies with `--archive`, and only for a single variant (`--all`
builds every resume at once, so one label can't name all of them — combining
the two is a usage error).

## Recalling what you sent

Two weeks later, TechCorp replies asking about a project on your resume.

**Find it by company name:**

```bash
ls .vitae/archive/ | grep -i techcorp
```

**See exactly what was on it:**

```bash
git show a1b2c3d
```

That reconstructs the precise commit — every bullet, every claim tier, exactly
as it was the day you sent it. Not "close enough," not "probably this
version" — the actual content.

**See when you applied, in order:**

```bash
git log --oneline
```

If you committed with descriptive messages (`"send data-engineer to
TechCorp"`), this doubles as an application timeline with no extra
bookkeeping.

**See what's different from what you sent, if you've since made edits:**

```bash
vitae diff data-engineer a1b2c3d
```

See [the command reference](commands.md) for `vitae diff` — it diffs only the
files that variant actually reads, not the whole workspace.

## The full flow, start to finish

```bash
# Build and check it looks right
vitae build data-engineer
open .vitae/dist/resume_data_engineer.docx

# Happy with it — send it
vitae build data-engineer --archive --label "TechCorp"
open .vitae/archive/2026-07-22_data-engineer_techcorp_a1b2c3d.docx
# ... apply ...

git add -A
git commit -m "send data-engineer to TechCorp"

# --- two weeks pass ---

# "What did TechCorp see again?"
ls .vitae/archive/ | grep techcorp
git show a1b2c3d
```

## Without git

Everything in this tool still works without git — `vitae init`, `build`,
`check`, `list` don't need it at all. What you lose:

- `--archive` still writes the file, but the filename says `nogit` instead of
  a hash, with a warning. `git show` has nothing to reconstruct.
- `vitae diff` needs a repository; without one it tells you to run `git init`
  rather than failing with a raw git error.

`vitae doctor` always reports whether git is available, so you know which
mode you're in.
