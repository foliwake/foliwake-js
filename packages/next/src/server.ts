// Server-side helpers (server-only): the config, the origin client and cache tags.
import 'server-only';
import type { ChannelName } from '@foliwake/blocks-contract/page';
import { createOriginClient, type OriginClient } from '@foliwake/server/origin';
import type { FoliwakeAppConfig } from '@foliwake/server/config';
import { loadConfigSync } from './settings.js';

let client: OriginClient | null = null;

/** The app's Foliwake config (validated at build time by withFoliwake). */
export function foliwakeConfig(): FoliwakeAppConfig {
  return loadConfigSync();
}

/** The origin client; credentials are read from process.env per request. */
export function originClient(): OriginClient {
  client ??= createOriginClient(foliwakeConfig(), process.env);
  return client;
}

/** Cache tags of a channel (and page): foliwake, foliwake:<site>, foliwake:<site>:<channel>, …:page:<path>. */
export function foliwakeTags(channel: ChannelName, path?: string): string[] {
  const site = foliwakeConfig().site;
  const tags = ['foliwake', `foliwake:${site}`, `foliwake:${site}:${channel}`];
  if (path !== undefined) tags.push(`foliwake:${site}:${channel}:page:${path}`);
  return tags;
}
