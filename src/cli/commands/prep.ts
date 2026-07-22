/**
 * `vitae prep` — interview checklist for one variant's claims.
 *
 * Built from the review notes of the claims that variant actually puts on the
 * page, so the checklist can never drift from what a recruiter is reading.
 */

import { ClaimsResolver } from '../../domain/index.js';
import { toDiagnostic } from '../../app/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';

/** Arguments specific to `prep`. */
export interface PrepArgs {
  readonly variantId: string | undefined;
}

/**
 * Prints the review checklist for a variant.
 *
 * @param context - presenter, output, and global options
 * @param args - which variant to prepare for
 */
export async function runPrep(context: CommandContext, args: PrepArgs): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const library = await wired.value.app.library();
  if (!library.ok) {
    context.output.err(context.presenter.diagnostics(library.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  const variantId =
    args.variantId ?? wired.value.defaultVariantId ?? library.value.listVariants()[0]?.id ?? '';

  const variant = library.value.getVariant(variantId);
  if (!variant.ok) {
    context.output.err(context.presenter.diagnostics([toDiagnostic(variant.error)]));
    return EXIT_CODES.failure;
  }

  const resolved = new ClaimsResolver().resolve(variant.value, library.value);
  if (!resolved.ok) {
    context.output.err(context.presenter.diagnostics(resolved.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  const checklist = resolved.value
    .filter(({ claim }) => (claim.reviewNotes ?? []).length > 0)
    .map(({ claim, projectIds }) => ({
      projects: projectIds,
      defensibility: claim.defensibility,
      notes: claim.reviewNotes ?? [],
    }));

  context.output.out(
    context.options.json
      ? JSON.stringify({ variantId, checklist }, null, 2)
      : formatChecklist(context, variant.value.label, checklist),
  );

  return EXIT_CODES.success;
}

/** Renders the checklist as tickable lines. */
function formatChecklist(
  context: CommandContext,
  label: string,
  checklist: readonly {
    projects: readonly string[];
    defensibility: string;
    notes: readonly string[];
  }[],
): string {
  if (checklist.length === 0) {
    return 'Nothing to review — every claim on this variant is confident.';
  }

  const lines = [context.color.heading(`Interview prep — ${label}`), ''];

  for (const entry of checklist) {
    lines.push(
      `${entry.projects.join(', ')}  ${context.color.warning(`[${entry.defensibility}]`)}`,
    );
    lines.push(...entry.notes.map((note) => `  [ ] ${note}`));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
