/**
 * IR run → docx paragraph child.
 *
 * Every block renderer needs this same translation, so it lives here once
 * rather than being copied into `paragraph.ts`, `bullet.ts`, and
 * `splitLine.ts`. A run carrying an `href` becomes a real `ExternalHyperlink`
 * field, not merely text styled to resemble one — a link a reader cannot
 * click is a broken feature, not a stylistic choice.
 */

import { ExternalHyperlink, TextRun as DocxTextRun } from 'docx';

import type { TextRun } from '../../../domain/index.js';
import type { StyleResolver } from '../StyleResolver.js';

/** Converts one IR run into the docx element it renders as. */
export function toParagraphChild(
  run: TextRun,
  resolver: StyleResolver,
): DocxTextRun | ExternalHyperlink {
  if (run.href === undefined) {
    return new DocxTextRun(resolver.runOptions(run));
  }

  return new ExternalHyperlink({
    link: run.href,
    children: [new DocxTextRun(resolver.hyperlinkRunOptions(run))],
  });
}
