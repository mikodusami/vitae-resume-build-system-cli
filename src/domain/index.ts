/**
 * Public surface of the domain layer.
 *
 * Outer layers import from here only — Layer 2's content loader builds a
 * `ContentLibrary` from these types, and renderers consume `ResumeDocument`.
 * Deep imports into `domain/` subfolders are a smell that this barrel is
 * missing an export.
 */

export * from './primitives/result.js';
export * from './errors/domainError.js';
export * from './model/content.js';
export * from './model/ContentLibrary.js';
export * from './document/resumeDocument.js';
export * from './services/ClaimsResolver.js';
export * from './services/ClaimsPolicy.js';
export * from './services/ResumeComposer.js';
export * from './ports/contentRepository.js';
export * from './ports/renderer.js';
