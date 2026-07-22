/**
 * Renders a real `.docx` you can open in Word.
 *
 * ```
 * npx vite-node examples/renderDocx.ts [variantId] [outPath]
 * ```
 *
 * Writing files is the application layer's job, not the renderer's — so the
 * `writeFileSync` lives here in an example script rather than anywhere in
 * `src/render/`. The renderer hands back a buffer and stops.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ResumeComposer } from '../src/domain/index.js';
import { FileContentRepository, JitiModuleLoader, Workspace } from '../src/infra/index.js';
import { DocxRenderer, PlainTextRenderer, ThemeLoader } from '../src/render/index.js';

const [variantId = 'data-engineer', outPath = join(process.cwd(), 'resume.docx')] =
  process.argv.slice(2);

const workspace = Workspace.resolve({
  cwd: join(process.cwd(), 'tests', 'fixtures', 'workspace'),
});
if (!workspace.ok) {
  console.error(workspace.error.message);
  process.exit(1);
}

const loader = new JitiModuleLoader(workspace.value.root);

const content = await new FileContentRepository(workspace.value, loader).load();
if (!content.ok) {
  for (const diagnostic of content.error) {
    console.error(`${diagnostic.code}: ${diagnostic.message}`);
  }
  process.exit(1);
}

const variant = content.value.getVariant(variantId);
if (!variant.ok) {
  console.error(variant.error.message);
  process.exit(1);
}

const composed = new ResumeComposer().compose(variant.value, content.value);
if (!composed.ok) {
  console.error(composed.error.map((e) => e.message).join('\n'));
  process.exit(1);
}

// A missing theme file means defaults, so this works with or without one.
const theme = await new ThemeLoader(loader).load(workspace.value.themeFile);
if (!theme.ok) {
  console.error(theme.error.map((e) => e.message).join('\n'));
  process.exit(1);
}

console.log(`theme: ${theme.value.font}, name size ${theme.value.sizes.name} half-points`);

const buffer = await new DocxRenderer(theme.value).render(composed.value);
writeFileSync(outPath, buffer);
console.log(`wrote ${outPath} (${buffer.length} bytes)`);

// The same document through a renderer that has never heard of a theme.
const text = await new PlainTextRenderer().render(composed.value);
console.log(`\n--- same IR, plain text ---\n${text}`);
