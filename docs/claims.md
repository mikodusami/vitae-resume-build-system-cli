# The claims registry

This is the part of `vitae` with no equivalent in other resume tools, and the
reason the project exists.

## The problem

You built something eight months ago. It works, it is genuinely yours, and it
is the strongest thing on your resume. You have not opened it since. An
interviewer asks how the retry logic handles a worker dying mid-job and you
cannot answer, because you do not remember.

Nothing about that is dishonest. It is just *unprepared* — and the gap between
what a resume claims and what you can currently defend widens silently, because
nothing anywhere tracks it.

The claims registry tracks it, and enforces the worst case.

## The three tiers

Every project references a `claimId`, and `content/claims.ts` records how well
you could defend that work **in an interview today**:

| Tier            | What it means                                             | What the tool does                                                     |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `confident`     | you can explain every line of it under questioning         | builds silently                                                        |
| `needs-review`  | it is real, but you would need to reread it first          | builds, warns, and `vitae prep` generates a checklist from its notes    |
| `cannot-defend` | you could not currently stand behind this                  | **`vitae build` refuses to write the resume**, exit `2`                |

That last row is the point. It makes shipping a resume you cannot back up
*structurally impossible* rather than merely unwise.

```ts
export default [
  { id: 'ledger', defensibility: 'confident' },
  {
    id: 'tempo',
    defensibility: 'needs-review',
    reviewNotes: [
      'Reread the retry path end to end; sketch what happens when a worker dies mid-job',
      'Know why at-least-once was the right trade here, and what at-most-once would have cost',
      'Prepare one honest "what I would do differently" answer',
    ],
  },
  { id: 'atlas', defensibility: 'cannot-defend' },
];
```

## The loop

**1. Flag honestly.** When you add a project, or when you notice you have gone
cold on one, set `needs-review` and write notes on what you would actually need
to reread. Write them for yourself in three months, not for a reader.

**2. Generate the checklist** for the specific resume you are about to send:

```bash
vitae prep software-engineer --out prep.md
```

```markdown
# Interview prep — Software Engineer

Generated 2026-07-22 for variant `software-engineer`.

## Needs review before sending

### Tempo

- [ ] Reread the retry path end to end; sketch what happens when a worker dies mid-job
- [ ] Know why at-least-once was the right trade here, and what at-most-once would have cost
- [ ] Prepare one honest "what I would do differently" answer

## Confident — listed for completeness

### Ledger

_No review notes._
```

Because it is generated from the claims of *that variant's* projects, the
checklist can never drift from what the recruiter is reading. Sections are
ordered most urgent first.

**3. Work through it.**

**4. Flip the tier to `confident`.** One line, one commit — and because it is
in git, a dated record of exactly when each project became interview-safe:

```bash
git log -p content/claims.ts
```

That history is genuinely useful later. "When did I last actually review this?"
has an answer.

## What blocks what

```bash
vitae build software-engineer
```

- A `cannot-defend` claim anywhere in the variant → status `blocked`, **nothing
  is written**, exit `2`.
- A `needs-review` claim → warning, file still written, exit `0`.

Warnings never block. You need to be able to build a resume for a project you
have not reviewed yet — you just need to be told.

To override deliberately:

```bash
vitae build software-engineer --force
```

`--force` exists because the tool should not be able to overrule a decision you
have consciously made. But if you find yourself typing it routinely, the
registry has stopped describing reality and the fix is to update the tiers, not
to keep forcing.

To check without building anything:

```bash
vitae check --all      # exit 2 if any variant is blocked
vitae list             # tier counts per variant, always exit 0
```

`check` gates; `list` reports.

## Alternate framings share a claim

Two projects may share a `claimId` — the same underlying work described two
ways:

```ts
{ id: 'quantumbridge',     claimId: 'quantumbridge', name: 'QuantumBridge', … },
{ id: 'quantumbridge-gov', claimId: 'quantumbridge', name: 'QuantumBridge', … },
```

Mark that one claim `cannot-defend` and **both** framings stop shipping.
Deliberate: rewording a project does not make it more defensible, and a design
that let you escape the gate by rephrasing would defeat the entire mechanism.

## Using it in CI

The exit codes are designed for this:

```bash
vitae check --all
case $? in
  0) echo "all defensible" ;;
  2) echo "undefendable claim — do not send" ;;
  1) echo "content is broken" ;;
esac
```

`2` versus `1` matters: "you have a claim you cannot back up" and "your content
does not parse" call for completely different reactions.

## Where this lives in the code

Worth knowing if you want to change the rules.

- **`ClaimsResolver`** (domain) maps a variant's projects to their claims and
  surfaces `reviewNotes`. It only resolves — it makes no judgements.
- **`ClaimsPolicy`** (domain) turns claims into diagnostics. The severity
  mapping is a **constructor argument**, so a stricter policy is a value, not a
  code change:

  ```ts
  new ClaimsPolicy({
    'cannot-defend': 'error',
    'needs-review': 'error',   // treat needs-review as blocking too
    confident: 'none',
  });
  ```

- **`BuildVariantUseCase`** (application) decides that an error-severity
  diagnostic blocks the write and that `--force` overrides it. That is **one
  branch in one file**, deliberately not baked into the composer.

The separation is what makes `check` (validate, write nothing), `--force`
(validate, write anyway), and any future policy trivial. Composition and
judgement are independent: `compose` never refuses to build, and the
application layer decides what refusal means.
