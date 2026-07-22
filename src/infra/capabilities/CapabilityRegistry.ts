/**
 * CapabilityRegistry — what this machine can do, probed once.
 *
 * Constructed in the composition root and injected; deliberately not a
 * module-level singleton, so tests can describe a machine with git but no
 * LibreOffice without touching global state.
 *
 * The results are inspectable rather than hidden, because the first thing to
 * ask when someone's clone misbehaves is what their environment actually has.
 */

import type { CapabilityName, Capabilities } from '../../app/index.js';
import { SOFFICE_BINARY } from '../pdf/LibreOfficePdfConverter.js';
import type { ProcessRunner } from '../process/ProcessRunner.js';

/** Binary backing each capability. */
const BINARIES: Readonly<Record<CapabilityName, string>> = {
  git: 'git',
  libreoffice: SOFFICE_BINARY,
};

/** Arguments that make each binary print its version. */
const VERSION_ARGS: Readonly<Record<CapabilityName, readonly string[]>> = {
  git: ['--version'],
  libreoffice: ['--version'],
};

/** What was found for one capability. */
export interface CapabilityStatus {
  readonly name: CapabilityName;
  readonly available: boolean;
  readonly version: string | undefined;
}

/** Probes and caches external capabilities. */
export class CapabilityRegistry implements Capabilities {
  private readonly statuses = new Map<CapabilityName, CapabilityStatus>();

  private constructor(statuses: readonly CapabilityStatus[]) {
    for (const status of statuses) {
      this.statuses.set(status.name, status);
    }
  }

  /**
   * Probes every capability once.
   *
   * Version probes are only run for binaries that exist, so a machine without
   * LibreOffice pays nothing for the check beyond one `which`.
   *
   * @param runner - how binaries are located and run
   */
  public static async probe(runner: ProcessRunner): Promise<CapabilityRegistry> {
    const names = Object.keys(BINARIES) as CapabilityName[];

    const statuses = await Promise.all(
      names.map(async (name): Promise<CapabilityStatus> => {
        const binary = BINARIES[name];
        if (!(await runner.which(binary))) {
          return { name, available: false, version: undefined };
        }

        const version = await runner.run(binary, VERSION_ARGS[name], { timeoutMs: 10_000 });
        return {
          name,
          available: true,
          version: version.ok ? version.value.stdout.trim().split('\n')[0] : undefined,
        };
      }),
    );

    return new CapabilityRegistry(statuses);
  }

  /** Builds a registry without probing, for tests and for `--no-probe` paths. */
  public static of(statuses: readonly CapabilityStatus[]): CapabilityRegistry {
    return new CapabilityRegistry(statuses);
  }

  public has(capability: CapabilityName): boolean {
    return this.statuses.get(capability)?.available === true;
  }

  public versionOf(capability: CapabilityName): string | undefined {
    return this.statuses.get(capability)?.version;
  }

  /** Everything probed, for `doctor` to render. */
  public summary(): readonly CapabilityStatus[] {
    return [...this.statuses.values()];
  }
}
