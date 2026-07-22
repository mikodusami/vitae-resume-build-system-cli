/**
 * Public surface of the rendering layer.
 *
 * Both renderers sit behind the domain's `Renderer<T>` port and neither knows
 * about format selection — choosing between them is the application layer's
 * job, not this layer's.
 */

export * from './theme/Theme.js';
export * from './theme/ThemeLoader.js';
export * from './docx/StyleResolver.js';
export * from './docx/DocxRenderer.js';
export * from './docx/blocks/registry.js';
export * from './docx/blocks/bullet.js';
export * from './text/PlainTextRenderer.js';
