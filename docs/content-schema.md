# Content schema

Every file in `.vitae/content/` and `.vitae/variants/` is a TypeScript module
with a **default export**. There is no build step: files are loaded at runtime
through `jiti`, so you edit a bullet and run the command.

Everything is validated on the way in. Objects are **strict** — an unknown key
is an error, not something quietly ignored, because a mistyped `bullet:` that
silently vanishes from a resume is far worse than a loud failure.

Errors name the file and the field:

```
variants/backend.ts: skills[2].label — expected string, received number
```

Every problem in a run is reported at once.

---

## `content/header.ts`

```ts
export default {
  name: 'Jordan Rivera',
  contact: ['jordan@example.com', '(555) 010-4477', 'github.com/jrivera'],
};
```

| Field     | Type       | Rules                              |
| --------- | ---------- | ---------------------------------- |
| `name`    | `string`   | non-empty                          |
| `contact` | `string[]` | at least one, each non-empty       |

`name` is also the document `creator` property and half of its `title`.
Contact entries appear in order on one centered line, separated by ` | `.

**Each entry is checked individually and linked if it looks linkable** — an
email becomes a `mailto:` link, a bare domain (`github.com/jrivera`) becomes
`https://`, and an address that already declares its own scheme
(`tel:+15550100`) is left exactly as written. Anything else — a phone number
written as digits, a city — stays plain, unlinked text; nothing is guessed at
beyond those two patterns.

---

## `content/education.ts`

```ts
export default {
  institution: 'State University',
  location: 'Blacksburg, VA',
  degree: 'B.S. Computer Science',
  date: 'May 2026',
  gpa: { label: 'Major GPA', value: '3.32' },
  coursework: 'Data Structures, Algorithms, Databases',
};
```

| Field         | Type              | Rules                                        |
| ------------- | ----------------- | --------------------------------------------- |
| `institution` | `string`          | non-empty                                    |
| `location`    | `string`          | non-empty                                    |
| `degree`      | `string`          | non-empty                                    |
| `date`        | `string`          | non-empty; free text                         |
| `gpa`         | `GpaEntry?`       | optional; omit entirely to show no GPA line   |
| `gpa.label`   | `string`          | non-empty, e.g. `'Major GPA'` or `'GPA'`      |
| `gpa.value`   | `string`          | non-empty, e.g. `'3.32'`                     |
| `coursework`  | `string`          | may be empty                                 |

Renders as two right-aligned lines — institution paired with location, degree
paired with date — then, when `gpa` is present, a third line reading
`Major GPA: 3.32`. `gpa` is absent entirely rather than an empty string when a
resume shouldn't show one; there is no way to have the field present but
blank.

`coursework` here is the default. A variant may override it with a more
relevant list; the variant wins when its own `coursework` is non-empty.

Dates are free text on purpose — `May 2026`, `Expected 2027`, and
`2024 – Present` are all things people legitimately put on resumes, and parsing
them would only let the tool disagree with you about your own history.

---

## `content/work.ts`

An **array** of jobs, rendered in the order given.

```ts
export default [
  {
    title: 'Software Engineering Intern',
    org: 'Northwind Logistics',
    location: 'Chicago, IL',
    date: 'Jun 2025 - Aug 2025',
    bullets: [
      'Rewrote the shipment-status endpoint, cutting p95 latency from 800ms to 210ms.',
    ],
  },
];
```

| Field      | Type       | Rules                            |
| ---------- | ---------- | -------------------------------- |
| `title`    | `string`   | non-empty                        |
| `org`      | `string`   | non-empty                        |
| `location` | `string`   | non-empty                        |
| `date`     | `string`   | non-empty                        |
| `bullets`  | `string[]` | **at least one**, each non-empty |

Work history is shared across every variant — there is no per-variant job
selection. If you need one, that is a domain change, not a workaround.

---

## `content/projects.ts`

An array. This is the pool variants select from **by id**.

```ts
export default [
  {
    id: 'ledger',
    claimId: 'ledger',
    name: 'Ledger',
    tech: 'TypeScript, Postgres, Docker',
    link: 'github.com/jrivera/ledger',
    bullets: ['Double-entry accounting service with an append-only journal.'],
  },
];
```

| Field     | Type       | Rules                                     |
| --------- | ---------- | ----------------------------------------- |
| `id`      | `string`   | non-empty, **unique across all projects** |
| `claimId` | `string`   | non-empty; must exist in `claims.ts`      |
| `name`    | `string`   | non-empty                                 |
| `tech`    | `string`   | may be empty                              |
| `link`    | `string`   | may be empty                              |
| `bullets` | `string[]` | at least one, each non-empty              |

A duplicate `id` is rejected at load with `DUPLICATE_ID`.

**`link` renders as a real, clickable hyperlink**, not just styled text. Write
it however you'd naturally read it aloud — `github.com/jrivera/ledger` — and
the build adds `https://` for you if you didn't include a scheme. An address
that already has one (`http://`, `mailto:`) is left exactly as written. An
empty `link` produces no hyperlink at all, rather than a link to nowhere.

### Alternate framings

Two projects may share a `claimId`. That is how you describe the same
underlying work two ways — a general framing and a governance-focused one, say
— while the claims registry still treats them as **one thing you have to be
able to defend**:

```ts
{ id: 'quantumbridge',     claimId: 'quantumbridge', name: 'QuantumBridge', … },
{ id: 'quantumbridge-gov', claimId: 'quantumbridge', name: 'QuantumBridge', … },
```

Flip that one claim to `cannot-defend` and *both* framings stop shipping. That
is deliberate: rewording a project does not make it more defensible.

---

## `content/leadership.ts`

An object with two keys, not an array.

```ts
export default {
  entries: [
    {
      title: 'Teaching Assistant, Data Structures',
      org: 'State University',
      location: 'On campus',
      date: 'Aug 2024 - Present',
      bullets: ['Ran weekly lab sections for 60 students.'],
    },
  ],
  awards: {
    label: 'Awards',
    entries: ["Dean's List (4 semesters)", 'Hackathon — 1st place, 2025'],
  },
};
```

`entries` are **exactly the same shape as jobs** — modelled as the same type
rather than duplicated, since they render identically.

| Field            | Type       | Rules                     |
| ---------------- | ---------- | ------------------------- |
| `entries`        | `Job[]`    | may be empty              |
| `awards.label`   | `string`   | non-empty                 |
| `awards.entries` | `string[]` | may be empty; each non-empty |

The awards line renders as a bold label followed by the entries joined with
` | `.

---

## `content/claims.ts`

An array, one per `claimId` referenced by your projects. Full explanation in
[the claims guide](claims.md).

```ts
export default [
  { id: 'ledger', defensibility: 'confident' },
  {
    id: 'tempo',
    defensibility: 'needs-review',
    reviewNotes: [
      'Reread the retry path; sketch what happens when a worker dies mid-job',
    ],
  },
];
```

| Field           | Type            | Rules                                                  |
| --------------- | --------------- | ------------------------------------------------------ |
| `id`            | `string`        | non-empty, unique                                      |
| `defensibility` | enum            | `confident` \| `needs-review` \| `cannot-defend`       |
| `reviewNotes`   | `string[]?`     | optional; each non-empty                               |

Any other value for `defensibility` is a validation error — the enum is strict
so a typo like `needs_review` fails loudly rather than being treated as an
unknown-but-acceptable tier.

---

## `variants/<id>.ts`

One file per resume. **The filename is the variant id**, and it must match the
`id` field inside — a mismatch is `VARIANT_ID_MISMATCH`, not a silent
preference for one or the other.

Adding a resume means dropping in a file. There is no registry to update.

```ts
export default {
  id: 'software-engineer',
  label: 'Software Engineer',
  summary: 'Software engineer who ships production services and keeps them boring.',
  coursework: 'Data Structures, Algorithms, Operating Systems',
  skills: [
    { label: 'Languages', body: 'TypeScript, Python, Go, SQL' },
    { label: 'Infrastructure', body: 'Postgres, Redis, Docker' },
  ],
  projectIds: ['ledger', 'tempo', 'atlas'],
};
```

| Field        | Type           | Rules                                                |
| ------------ | -------------- | ---------------------------------------------------- |
| `id`         | `string`       | non-empty; must equal the filename                   |
| `label`      | `string`       | non-empty; appears in the docx `title` property       |
| `summary`    | `string`       | non-empty; becomes the Summary section and the docx `description` |
| `coursework` | `string`       | may be empty; overrides `education.ts` when non-empty |
| `skills`     | `SkillGroup[]` | may be empty; `{ label, body }`, both non-empty       |
| `projectIds` | `string[]`     | **at least one**; each must exist in `projects.ts`    |

An unknown project id is `UNKNOWN_PROJECT`, and **every** unknown id in a
variant is reported in one run rather than one per rebuild.

`projectIds` is ordered — projects appear on the resume in exactly the order
listed, so it doubles as your ranking of what matters for that role.

### Skills and ATS keywords

`skills[].body` is split on commas, trimmed, deduplicated across groups, and
written into the document's `keywords` property. Every file therefore carries
its own ATS-visible metadata derived from what is actually on the page, for
free.

---

## `config.json`

Unlike content files, this is **not** strict: unknown keys produce a warning
rather than an error, so a config written by a newer version of the tool does
not break an older one. A missing file is fine — everything has a default.

```json
{
  "owner": "Jordan Rivera",
  "defaultVariant": "software-engineer",
  "output": { "filenamePrefix": "resume" },
  "pageLimit": 1
}
```

| Key                     | Type     | Default            | Effect                                        |
| ----------------------- | -------- | ------------------ | --------------------------------------------- |
| `owner`                 | `string` | header `name`      | reserved for document metadata                |
| `defaultVariant`        | `string` | none               | used by `build`/`prep`/`text` with no argument |
| `output.filenamePrefix` | `string` | `resume`           | filename stem for builds                       |
| `pageLimit`             | `number` | `1`                | maximum pages for `check --pages`              |

---

## Rendered section order

Composition always produces sections in this order. It is fixed — the renderer
never reorders anything, and neither does a variant:

1. **Header** (no heading) — name, then the contact line, both centered
2. **Summary** — the variant's `summary`
3. **Education** — institution (location right-aligned), degree (date
   right-aligned), then GPA if present, then coursework
4. **Skills** — one line per group: bold label, then body
5. **Experience** — every job from `work.ts`
6. **Projects** — the variant's `projectIds`, in order
7. **Leadership & Awards** — leadership entries, then the awards line

If your output needs something this order cannot express, that is a domain
change — see [extending vitae](extending.md).
