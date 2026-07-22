/**
 * WorkspacePaths port — the slice of a workspace this layer actually needs.
 *
 * Deliberately not an import of `infra`'s `Workspace`: the application layer
 * needs two paths, not a filesystem-aware class, and declaring the narrow
 * interface here keeps the dependency pointing inward. `Workspace` satisfies
 * this structurally, so the composition root passes one straight in.
 */
export interface WorkspacePaths {
  /** Absolute path to the `.vitae/` directory. */
  readonly root: string;
  /** Where latest builds land. */
  readonly distDir: string;
  /** Where dated, hash-stamped sent versions accumulate. */
  readonly archiveDir: string;
}
