/**
 * ProgressListener port — feedback without knowing what a terminal is.
 *
 * A `build --all` across four variants should be able to stream progress. The
 * application layer emits events; whether they become spinners, log lines, or
 * nothing at all is entirely Layer 5's business.
 */

import type { VariantBuildReport } from '../reports/reports.js';

/** Receives build lifecycle events. */
export interface ProgressListener {
  onVariantStart(variantId: string): void;
  onVariantDone(report: VariantBuildReport): void;
}

/**
 * The default listener: does nothing.
 *
 * Injected by default so no use case ever has to null-check a listener.
 */
export const NULL_PROGRESS_LISTENER: ProgressListener = {
  onVariantStart: () => undefined,
  onVariantDone: () => undefined,
};
