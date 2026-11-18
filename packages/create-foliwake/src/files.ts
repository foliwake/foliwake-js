// create-foliwake: the files of a new project, planned in memory from the starters (starters.ts). Nothing is
// downloaded: React comes vendored with this package, and the project has no npm dependencies unless it has
// Storybook. The Foliwake CLI its CI workflows run is pinned in package.json `foliwake.cli`, not a dependency.
import path from 'node:path';

import { localSiteId, packageName, type TemplateName } from './options.js';
import {
  type Layer,
  layerFiles,
  packageVersion,
  projectPath,
  siteCheckVersion,
  starterFile,
  vendoredReact,
} from './starters.js';

const TEMPLATE_LAYERS: Readonly<Record<TemplateName, readonly Layer[]>> = {
  minimal: ['shared', 'minimal'],
  examples: ['shared', 'minimal', 'examples'],
};

/** Storybook's packages: exact versions, at least two weeks old when chosen. */
export const STORYBOOK_PACKAGES = Object.freeze({
  '@storybook/html-vite': '10.6.3',
  storybook: '10.6.3',
  vite: '8.3.5',
});

/** The local configuration of the Foliwake CLI (`foliwake dev`); harmless without it. */
export const CONFIG_FILE_NAME = 'foliwake.config.json';

/** Starter files whose text has {{placeholders}}. */
const SUBSTITUTED: ReadonlySet<string> = new Set(['README.md', '_github/workflows/frontend-checks.yml']);

export interface ProjectFile {
  /** Project-relative, with "/" */
  path: string;
  bytes: Buffer;
}

export interface ProjectInput {
  template: TemplateName;
  /** Absolute target folder (its base name names the package). */
  target: string;
  siteId: string | null;
  /** add starters/storybook/ and its npm packages */
  storybook?: boolean;
  /** add starters/react/ (a React block) and the vendored React in scripts/vendor/ */
  react?: boolean;
}

const REACT_NOTE =
  '\n\nReact is vendored: `scripts/vendor/react.js` is React and ReactDOM (production build, its MIT license in ' +
  "the file's header comment, which code releases keep, and in `scripts/vendor/react.LICENSE.txt`), committed " +
  'with your code, so no npm install and no build step. The block `poll` renders with it through the block ' +
  "kit's `ctx.mount` and `scripts/react-view.js`. A shell that gives its own React (`host.has('react')`: a " +
  'React or Next app passing `react` in its host) is used instead.';

const STORYBOOK_NOTE =
  ' With the Foliwake CLI, Storybook shows them too: `npm install && npm run stories` (stories from ' +
  '`foliwake blocks render`, configuration in `.storybook/`).';

function placeholders(input: ProjectInput, version: string, checker: string): Record<string, string> {
  return {
    name: path.basename(input.target),
    template: input.template,
    createVersion: version,
    siteCheckVersion: checker,
    siteIdNote: input.siteId ? ` — this project was created for the site id \`${input.siteId}\`` : '',
    storybookNote: input.storybook ? STORYBOOK_NOTE : '',
    reactNote: input.react ? REACT_NOTE : '',
  };
}

function substitute(bytes: Buffer, values: Record<string, string>): Buffer {
  return Buffer.from(bytes.toString('utf8').replace(/\{\{(\w+)\}\}/g, (all, key: string) => values[key] ?? all));
}

function localConfig(id: string): string {
  // `foliwake dev` and `page check` read only the local folders; the storage is named because the configuration
  // format requires it (a local store, used only by `code prepare`).
  const site = {
    id,
    code: { root: '.', repository: null },
    sources: [{ id: 'content', plugin: 'local-markdown', owns: ['/'], settings: { root: './content' } }],
    storage: { endpoint: 'http://127.0.0.1:8333', bucket: `foliwake-${id}` },
    stateDir: './.foliwake',
    liveHosts: [`${id}.localhost`],
    previewBaseHost: `preview.${id}.localhost`,
  };
  return `${JSON.stringify({ version: 1, sites: [site] }, null, 2)}\n`;
}

/**
 * The Foliwake CLI the CI workflows run with npx: an exact version, the one of this package (the Foliwake packages
 * are released together). It is a field of its own, not a devDependency: `npm run` puts node_modules/.bin first on
 * PATH, and that `@foliwake/cli` (server commands only) would shadow the developer's `foliwake` in `npm run dev`.
 */
function foliwakeField(cliVersion: string): { cli: string } {
  return { cli: cliVersion };
}

function packageJson(name: string, storybook: boolean, cliVersion: string): string {
  const stories = { stories: 'node .storybook/run.mjs', 'build-stories': 'foliwake blocks render && storybook build' };
  const manifest = {
    name,
    private: true,
    type: 'module',
    description: 'The frontend of a Foliwake site: blocks, styles and local sample pages.',
    scripts: {
      check: 'npx @foliwake/site-check',
      test: 'node --test "tests/*.test.mjs"',
      dev: 'foliwake dev --watch',
      'check:pages': 'foliwake page check',
      ...(storybook ? stories : {}),
    },
    foliwake: foliwakeField(cliVersion),
    ...(storybook ? { devDependencies: STORYBOOK_PACKAGES } : {}),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Every file of the new project, sorted by path. */
export async function projectFiles(input: ProjectInput): Promise<ProjectFile[]> {
  const version = await packageVersion();
  const values = placeholders(input, version, await siteCheckVersion());
  const layers = [...TEMPLATE_LAYERS[input.template], ...(input.storybook ? ['storybook' as const] : [])];
  if (input.react) layers.push('react');
  const files = new Map<string, Buffer>();
  for (const layer of layers) {
    for (const file of await layerFiles(layer)) {
      const bytes = await starterFile(layer, file);
      files.set(projectPath(file), SUBSTITUTED.has(file) ? substitute(bytes, values) : bytes);
    }
  }
  if (input.react) for (const [file, bytes] of await vendoredReact()) files.set(file, bytes);
  files.set(CONFIG_FILE_NAME, Buffer.from(localConfig(localSiteId(input.siteId, input.target))));
  files.set('package.json', Buffer.from(packageJson(packageName(input.target), input.storybook ?? false, version)));
  const sorted = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted.map(([file, bytes]) => ({ path: file, bytes }));
}
