// Storybook for the blocks of this site (added by `create-foliwake --storybook`).
//
// The stories are not written by hand: `foliwake blocks render` writes them into
// .foliwake/stories from the block examples, components/<name>/<name>.example.md —
// the engine's HTML of each example, the block's stylesheet and its init(root).
// `npm run stories` renders them, keeps them current and starts Storybook.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STORIES = '.foliwake/stories';
const manifestUrl = new URL(`../${STORIES}/manifest.json`, import.meta.url);
if (!existsSync(manifestUrl)) throw new Error(`${STORIES}/manifest.json is missing: run \`foliwake blocks render\` first (\`npm run stories\` does).`);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
if (manifest.schema !== 'foliwake-block-stories/1') throw new Error(`${STORIES}/manifest.json is not from \`foliwake blocks render\` (schema ${manifest.schema}).`);
const missing = manifest.blocks.filter((block) => block.stories === null).map((block) => block.name);
if (missing.length > 0) console.warn(`Blocks without examples (no stories): ${missing.join(', ')}. Add components/<name>/<name>.example.md.`);

export default {
  framework: { name: '@storybook/html-vite', options: {} },
  // A folder, not a list from the manifest: a block that gets its first example appears without a restart.
  stories: [{ directory: `../${STORIES}`, files: '*.stories.js' }],
  // Images of the examples are /components/… URLs: in a static build they are copied from the block folders.
  // Not in `storybook dev`: there Vite serves the project folder itself, and a static /components
  // would shadow the block modules and stylesheets that the stories import.
  staticDirs: (dirs = [], { configType } = {}) => (configType === 'PRODUCTION' ? [...dirs, { from: '../components', to: '/components' }] : dirs),
  core: { disableTelemetry: true },
  // Blocks import block-kit as `@foliwake/block-kit` (pages map it to their code release's kit);
  // `foliwake blocks render` puts a copy of the kit into the stories folder.
  viteFinal: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: [
        ...aliases(config.resolve?.alias),
        { find: /^@foliwake\/block-kit$/, replacement: kitCopy() },
      ],
    },
  }),
};

/** The copy of the kit that `foliwake blocks render` puts into the stories folder. */
function kitCopy() {
  return fileURLToPath(new URL(`../${STORIES}/_foliwake/block-kit.js`, import.meta.url));
}

function aliases(alias) {
  if (!alias) return [];
  return Array.isArray(alias) ? alias : Object.entries(alias).map(([find, replacement]) => ({ find, replacement }));
}
