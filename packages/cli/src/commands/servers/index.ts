import { Command } from '@oclif/core';

import { type Profiles, type ServerProfile, nameOrigin, readProfiles, serverDisplay } from '../../remote/servers.js';
import { COMMAND } from '../../settings.js';

/** One signed-in server as `servers` shows it; never a token. */
export interface ServerRow {
  name: string;
  origin: string | null;
  default: boolean;
  email: string | null;
  principal: string;
  organisations: string[];
  installation: boolean;
  store: ServerProfile['store'];
  signedInAt: string;
}

function rowOf(name: string, profile: ServerProfile, profiles: Profiles): ServerRow {
  return {
    name,
    origin: profile.origin ?? nameOrigin(name),
    default: profiles.default === name,
    email: profile.email ?? null,
    principal: profile.principal,
    organisations: profile.memberships.map((m) => `${m.org} (${m.role})`),
    installation: profile.installation,
    store: profile.store,
    signedInAt: profile.signedInAt,
  };
}

function lineOf(row: ServerRow): string {
  const shown = row.origin ? serverDisplay(row.origin) : row.name;
  const who = row.email ?? row.principal;
  const orgs = row.organisations.join(', ') || (row.installation ? 'installation' : 'no organisation');
  return `${row.default ? '*' : ' '} ${shown}  ${who}  ${orgs}  (${row.store})`;
}

export default class Servers extends Command {
  static description = 'List the Foliwake servers this computer is signed in to; * marks the default';

  static examples = ['<%= config.bin %> servers', '<%= config.bin %> servers --json'];

  static enableJsonFlag = true;

  async run(): Promise<unknown> {
    const profiles = readProfiles();
    const rows = Object.entries(profiles.servers).map(([name, profile]) => rowOf(name, profile, profiles));
    if (rows.length === 0) this.log(`Not signed in to any server; \`${COMMAND} login <server>\` signs in.`);
    for (const row of rows) this.log(lineOf(row));
    return { default: profiles.default, servers: rows };
  }
}
