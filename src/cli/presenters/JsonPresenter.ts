/**
 * JsonPresenter — machine-readable output for CI and scripting.
 *
 * Writes nothing but JSON. Every progress line, warning, and workspace notice
 * goes to stderr instead, or piping `--json` into `jq` breaks — which is the
 * only thing this presenter exists for.
 */

import type { BuildReport, CheckReport, ListReport } from '../../app/index.js';
import type { Diagnostic } from '../../domain/index.js';
import type { ReportPresenter } from './ReportPresenter.js';

/** Indentation for emitted JSON; two spaces stays diff-friendly. */
const INDENT = 2;

/**
 * Serializes with stable key order.
 *
 * Key order follows insertion, and reports are built consistently, so output
 * is diffable across runs — useful when a script stores yesterday's result.
 */
function serialize(value: unknown): string {
  return JSON.stringify(value, null, INDENT);
}

/** Renders reports as JSON. */
export class JsonPresenter implements ReportPresenter {
  public build(report: BuildReport): string {
    return serialize(report);
  }

  public check(report: CheckReport): string {
    return serialize(report);
  }

  public list(report: ListReport): string {
    return serialize(report);
  }

  public diagnostics(diagnostics: readonly Diagnostic[]): string {
    return serialize({ diagnostics });
  }
}
