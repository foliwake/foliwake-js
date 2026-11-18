// This package's name and version, as a server sees them: `X-Foliwake-Cli: @foliwake/cli/0.6.0`.
import { readFileSync } from 'node:fs';

interface PackageJson {
  name: string;
  version: string;
}

let own: PackageJson | null = null;

function packageJson(): PackageJson {
  own ??= JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageJson;
  return own;
}

export const cliVersion = (): string => packageJson().version;

/** `@foliwake/cli/<version>`: the client name sent to servers and shown on their approval page. */
export const clientName = (): string => `${packageJson().name}/${packageJson().version}`;
