// `source disable` and `source enable`: the same flags and the same call, one direction each.
import { Flags } from '@oclif/core';

import { CoreCommand } from './core-command.js';

export const switchFlags = {
  ...CoreCommand.siteFlags,
  ...CoreCommand.inputFlag,
  source: Flags.string({ description: 'the content source (see `source list`)' }),
  expect: Flags.string({
    description: 'the site settings revision you saw; default: the one read just before the change',
  }),
};

export interface SwitchFlags {
  site?: string | undefined;
  source?: string | undefined;
  expect?: string | undefined;
}

/** The input of sources.disable / sources.enable from the flags. */
export function switchInput(flags: SwitchFlags, site: { site: string }) {
  return { ...site, source: flags.source as string, ...(flags.expect ? { expect: { revision: flags.expect } } : {}) };
}
