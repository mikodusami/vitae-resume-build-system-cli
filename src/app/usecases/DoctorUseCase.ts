/**
 * DoctorUseCase — what this environment can and cannot do.
 *
 * The first thing to ask when someone's clone misbehaves. Every capability is
 * optional, so this reports rather than judges: a machine with neither git nor
 * LibreOffice is a perfectly good machine for building resumes, and the report
 * should say exactly which features are unavailable rather than implying
 * something is broken.
 */

import type { ContentLibrary, Diagnostic, DomainError } from '../../domain/index.js';
import { toDiagnostic, type CapabilityReport, type DoctorReport } from '../reports/reports.js';
import type { Capabilities, CapabilityName, SourceDiffer } from '../ports/environment.js';

/** What each capability buys, and how to get it. */
const CAPABILITY_NOTES: Readonly<Record<CapabilityName, { present: string; absent: string }>> = {
  git: {
    present: 'archive stamping and `vitae diff` are available',
    absent: '`vitae diff` is unavailable and archives are stamped "nogit" — install git',
  },
  libreoffice: {
    present: '`--pdf` and the page-count gate are available',
    absent: '`--pdf` and the page-count gate are unavailable — install LibreOffice',
  },
};

/** Reports environment health. */
export class DoctorUseCase {
  public constructor(
    private readonly capabilities: Capabilities,
    private readonly differ: SourceDiffer,
  ) {}

  /**
   * @param workspaceRoot - the resolved workspace
   * @param library - loaded content, or the errors that stopped it loading
   */
  public async execute(
    workspaceRoot: string,
    library: ContentLibrary | readonly DomainError[],
  ): Promise<DoctorReport> {
    const names = Object.keys(CAPABILITY_NOTES) as CapabilityName[];

    const capabilities: CapabilityReport[] = names.map((name) => {
      const available = this.capabilities.has(name);
      const version = this.capabilities.versionOf(name);

      return {
        name,
        available,
        ...(version === undefined ? {} : { version }),
        note: available ? CAPABILITY_NOTES[name].present : CAPABILITY_NOTES[name].absent,
      };
    });

    const loaded = !Array.isArray(library);
    const diagnostics: Diagnostic[] = loaded
      ? []
      : (library as readonly DomainError[]).map(toDiagnostic);

    return {
      workspaceRoot,
      variantCount: loaded ? (library as ContentLibrary).listVariants().length : 0,
      isGitRepository: await this.differ.isRepository(workspaceRoot),
      capabilities,
      diagnostics,
    };
  }
}
