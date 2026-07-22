/**
 * ReportPresenter — how a report becomes text.
 *
 * Two implementations exist from the start, and that is the point: if the
 * human presenter ever needs data the JSON one cannot supply, something is
 * being computed in the presentation layer that belongs in a use case.
 */

import type {
  BuildReport,
  CheckReport,
  DiffReport,
  DoctorReport,
  ListReport,
  PrepReport,
} from '../../app/index.js';
import type { Diagnostic } from '../../domain/index.js';

/** Renders application reports for one output medium. */
export interface ReportPresenter {
  build(report: BuildReport): string;
  check(report: CheckReport): string;
  list(report: ListReport): string;
  /** Markdown, intended to be saved and worked through — not decoration. */
  prep(report: PrepReport): string;
  diff(report: DiffReport): string;
  doctor(report: DoctorReport): string;
  /** Load-time or unexpected failures, which have no report of their own. */
  diagnostics(diagnostics: readonly Diagnostic[]): string;
}
