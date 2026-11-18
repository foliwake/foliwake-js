// The link of a project folder to a site: `.foliwake/connection.json` `{ server, site, org }`, written by
// `site create` and `site link`. `server` is a server name: "cloud" or an origin.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Connection {
  server: string;
  site: string;
  org: string;
}

export const connectionFile = (cwd: string): string => path.join(cwd, '.foliwake', 'connection.json');

/** The folder's link, or null when it has none or the file is not a complete link. */
export function readConnection(cwd: string): Connection | null {
  let raw: Partial<Connection>;
  try {
    raw = JSON.parse(readFileSync(connectionFile(cwd), 'utf8')) as Partial<Connection>;
  } catch {
    return null;
  }
  const { server, site, org } = raw ?? {};
  if (typeof server !== 'string' || typeof site !== 'string' || typeof org !== 'string') return null;
  return { server, site, org };
}
