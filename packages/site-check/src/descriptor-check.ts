// The component descriptor of site code: the hand-written `components/components.json`, else the one generated
// from the block folders. One check for a working folder and for the captured files of a code release.
import { DESCRIPTOR_PATH, validateDescriptor } from './formats/descriptor.js';
import type { Diagnostic } from './formats/diagnostics.js';
import { type CodeTree, type SiteCode, directoryTree, siteCodeOf } from './site-code.js';

/**
 * The block names the engine's built-in catalogue renders; a hand-written descriptor must declare each of them.
 * A generated descriptor lists only the site's own block folders, so it is not held to this list.
 */
export const CATALOGUE_COMPONENTS: readonly string[] = Object.freeze(['accordion', 'hero', 'lesson']);

export interface DescriptorCheckOptions {
  htmlContract: number;
  /** the names a hand-written descriptor must declare (default CATALOGUE_COMPONENTS) */
  schemaNames?: readonly string[];
}

/** The descriptor text of site code: the hand-written file, else the generated one; null when there is neither. */
export async function descriptorText(tree: CodeTree, site: SiteCode): Promise<string | null> {
  if (!site.generated) return tree.readText(DESCRIPTOR_PATH);
  return site.descriptor ? JSON.stringify(site.descriptor) : null;
}

/** The descriptor problems of site code already read with siteCodeOf(). */
export async function checkDescriptorOf(
  tree: CodeTree,
  site: SiteCode,
  { htmlContract, schemaNames = CATALOGUE_COMPONENTS }: DescriptorCheckOptions,
): Promise<Diagnostic[]> {
  const text = await descriptorText(tree, site);
  return validateDescriptor({
    readText: async () => {
      if (text === null) throw Object.assign(new Error('no descriptor'), { code: 'ENOENT' });
      return text;
    },
    hasFile: (relative) => tree.isFile(relative),
    htmlContract,
    schemaNames: site.generated ? [] : schemaNames,
  });
}

/** The descriptor problems of a working folder. */
export async function checkDescriptor({
  cwd,
  ...options
}: DescriptorCheckOptions & { cwd: string }): Promise<Diagnostic[]> {
  const tree = directoryTree(cwd);
  return checkDescriptorOf(tree, await siteCodeOf(tree, options.htmlContract), options);
}
