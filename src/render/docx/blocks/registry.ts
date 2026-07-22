/**
 * The block renderer registry.
 *
 * Handlers are keyed by block kind through a mapped type over the IR union,
 * which buys two properties at once: adding a block kind means adding a
 * handler (open for extension), and TypeScript refuses to compile a registry
 * that is missing one (proof nothing was forgotten). That combination is why
 * this is a registry rather than a `switch` that grows quietly stale.
 */

import type { Paragraph } from 'docx';

import type { Block } from '../../../domain/index.js';
import type { StyleResolver } from '../StyleResolver.js';
import { renderBullet } from './bullet.js';
import { renderParagraph } from './paragraph.js';
import { renderSplitLine } from './splitLine.js';

/** Turns one block of a known kind into a docx paragraph. */
export type BlockRenderer<TBlock extends Block> = (
  block: TBlock,
  resolver: StyleResolver,
) => Paragraph;

/** Exhaustive map from block kind to its renderer. */
export type BlockRendererMap = {
  [K in Block['kind']]: BlockRenderer<Extract<Block, { kind: K }>>;
};

/** The registry the docx renderer dispatches through. */
export const BLOCK_RENDERERS: BlockRendererMap = {
  paragraph: renderParagraph,
  bullet: renderBullet,
  splitLine: renderSplitLine,
};

/**
 * Dispatches a block to its renderer.
 *
 * The cast is confined to this one function: the map is proven exhaustive by
 * its type, but TypeScript cannot follow the correlation between the looked-up
 * key and the block's own narrowed type.
 *
 * @param block - any IR block
 * @param resolver - style resolver carrying the theme
 */
export function renderBlock(block: Block, resolver: StyleResolver): Paragraph {
  const renderer = BLOCK_RENDERERS[block.kind] as BlockRenderer<Block>;
  return renderer(block, resolver);
}
