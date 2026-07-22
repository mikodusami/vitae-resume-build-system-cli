# Theming

Everything presentational lives in `.vitae/theme.ts`. Nothing else in the tool
knows what a font is — the domain deals in *meaning* (this run is a name, this
one is a link) and the renderer maps meaning to appearance.

A theme is **deep-partial**: state only what you want changed, and the rest
merges over the defaults. A missing `theme.ts` is not an error, it means
defaults.

```ts
export default {
  font: 'Georgia',
};
```

That is a complete, valid theme.

## Read this before changing a number

**Three different units coexist in one object.** This is the thing that will
confuse you six months from now:

| What                      | Unit                        | Example                        |
| ------------------------- | --------------------------- | ------------------------------ |
| all lengths               | **DXA** — 1440 = 1 inch     | `margin: 720` is 0.5"          |
| `sizes.*`                 | **half-points**             | `19` is 9.5pt, `30` is 15pt    |
| `sectionRule.size`        | **eighths of a point**      | `4` is 0.5pt                   |

Half-points and eighths are docx's own conventions, kept rather than converted
so the values match what you would read in the raw OOXML.

## Full reference

Defaults shown; all fields optional.

```ts
export default {
  font: 'Calibri',

  page: {
    width: 12240,     // DXA — US Letter, 8.5"
    height: 15840,    // DXA — 11"
    margin: 720,      // DXA — 0.5", applied to all four edges
  },

  sizes: {            // half-points
    name: 30,           // 15pt   — your name
    sectionHeading: 20, // 10pt   — SUMMARY, EXPERIENCE, …
    body: 19,           // 9.5pt  — bullets and normal text
    meta: 18,           // 9pt    — dates, locations, contact line
    link: 18,           // 9pt    — project links
  },

  rightTab: 10800,    // DXA — where right-aligned dates land (7.5")

  bullet: {
    indent: 260,      // DXA — left indent of bullet text
    hanging: 160,     // DXA — how far the glyph hangs back
  },

  spacing: {          // DXA
    sectionBefore: 110,
    sectionAfter: 30,
    bulletAfter: 16,
    line: 228,        // line height; 240 is single-spaced
    entryBefore: 50,
    entryAfter: 14,
  },

  sectionRule: {      // the horizontal rule under section headings
    enabled: true,
    size: 4,          // eighths of a point
    color: '444444',  // hex RGB, no leading '#'
  },
};
```

### The five text roles

`sizes` is keyed by **semantic role**, not by section. The domain tags each run
of text with what it *is*; the theme decides what that looks like.

| Role             | Used for                                        |
| ---------------- | ----------------------------------------------- |
| `name`           | your name in the header                         |
| `sectionHeading` | section headings, rendered uppercase and bold    |
| `body`           | bullets, summary, skills, titles                |
| `meta`           | dates, locations, the contact line              |
| `link`           | project links                                   |

Changing `sizes.meta` therefore restyles every date, location, and the contact
line at once, because they are the same *kind* of thing. That is the payoff of
roles over per-section styling.

### `rightTab`

The position of the right-aligned half of every "left text …… right date" line:
job headers, education, project headers. The default `10800` is page width
minus both margins (`12240 - 720 - 720`). **If you change `page.margin` or
`page.width`, recompute this** or your dates will not sit flush with the right
margin.

## Recipes

**Different font, nothing else:**

```ts
export default { font: 'Garamond' };
```

**Fit more on one page** — tighten spacing before shrinking type; it reads
better:

```ts
export default {
  spacing: { line: 216, sectionBefore: 80, bulletAfter: 10 },
};
```

**Slightly smaller everything:**

```ts
export default {
  sizes: { name: 28, sectionHeading: 19, body: 18, meta: 17, link: 17 },
};
```

**A4 instead of US Letter** — note the `rightTab` recompute:

```ts
export default {
  page: { width: 11906, height: 16838, margin: 720 },
  rightTab: 10466, // 11906 - 720 - 720
};
```

**No rule under headings:**

```ts
export default { sectionRule: { enabled: false } };
```

## Validation

Themes are validated like content. Objects are strict, so a typo fails loudly:

```
theme.ts: fonts — unknown field — check for a typo, or remove it
```

Lengths and sizes must be positive numbers; `sectionRule.color` must be six hex
digits **without** a leading `#` (docx rejects the `#` form).

Writing `undefined` for a field falls back to the default rather than erasing
it, so a half-finished edit cannot silently produce a zero margin.

## What a theme cannot do

By design:

- **Reorder or select sections.** Section order is fixed in the domain.
- **Change wording, casing of content, or punctuation.** The renderer never
  "improves" content — nothing is inferred, reordered, or injected that the
  document model did not say. (Section *headings* are uppercased by the
  renderer, since that is presentation.)
- **Style one specific section differently from another with the same roles.**
  If you genuinely need that, the fix is a new text role in the domain, not a
  special case in the renderer — see [extending vitae](extending.md).

## Plain-text output has no theme at all

`vitae text` and `--format txt` take **no theme**, deliberately. That renderer
exists partly as a proof: if producing readable plain text ever required
reaching for something presentational, it would mean the document model had
quietly become docx-shaped. It is a canary, and it is why adding a new output
format is cheap.
