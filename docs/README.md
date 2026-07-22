# vitae documentation

Two ways in, depending on what you want.

**To use the tool:**

| Guide                                     | What it covers                                              |
| ----------------------------------------- | ----------------------------------------------------------- |
| [Getting started](getting-started.md)     | install, `init`, your first build, replacing the example     |
| [Command reference](commands.md)          | every command, every flag, exit codes, JSON output           |
| [Content schema](content-schema.md)       | every field of every content file, and the rules on each     |
| [The claims registry](claims.md)          | defensibility tiers and the review loop — read this one      |
| [Git workflow](git-workflow.md)           | commit, archive, send, and recall what you actually applied with |
| [Theming](theming.md)                     | fonts, sizes, spacing, and the unit system that will bite you |
| [Troubleshooting](troubleshooting.md)     | every error code, what causes it, and how to fix it          |

**To understand or modify the code:**

| Guide                                | What it covers                                                |
| ------------------------------------ | ------------------------------------------------------------- |
| [Architecture](architecture.md)      | the layers, the dependency rule, and why the seams sit where they do |
| [How a build works](build-pipeline.md) | one command traced end to end, function by function          |
| [Extending vitae](extending.md)      | adding a command, an output format, a block kind, or a content type |

## The shortest possible summary

`vitae` builds `.docx` resumes from TypeScript content. Your content lives in a
`.vitae/` folder the tool discovers the way `git` finds `.git/`. Variants hold
project *ids*, not project text, so one project can appear on several resumes
and editing a bullet updates all of them.

The part that makes it unusual is the **claims registry**: every project
records how well you could defend it in an interview today, and a build refuses
to write a resume containing a claim you have marked `cannot-defend`. That
turns "don't oversell yourself" from a good intention into something the tool
enforces.

Internally it is a Clean/Hexagonal architecture in five layers, where the
dependency rule is enforced by ESLint rather than by discipline. The domain
produces a presentation-free document IR; renderers, the filesystem, git, and
LibreOffice are all adapters plugged in at the edges.
