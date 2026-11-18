// A stand-in for the Foliwake engine's `foliwake`: it registers a fake local runtime, then runs this package's
// main. Every local call is written to stderr as `local: <procedure> <input JSON>`, so tests see where calls went.
import { existsSync } from 'node:fs';
import path from 'node:path';

import { registerLocalRuntime } from '@foliwake/cli/local-runtime';

import * as answers from './cli-answers.js';

const trace = (line) => process.stderr.write(`local: ${line}\n`);

class FakeLocalFailure extends Error {}

const RECOVERED = {
  interrupted: 0,
  live: null,
  pendingInvalidations: 0,
  blockWarnings: [],
  cacheRefresh: { state: 'none' },
};

const ANSWERS = {
  whoami: () => ({ principal: 'operator', installation: true, memberships: [] }),
  'sites.list': () => answers.sitesList,
  'sites.status': (input) => {
    if (input.site === 'broken') throw new FakeLocalFailure('the fake engine failed');
    return answers.siteStatus;
  },
  'operations.recover': () => ({ engine: RECOVERED, operations: [] }),
};

const caller = (prefix = []) =>
  new Proxy(() => {}, {
    get: (_target, key) => (typeof key === 'string' && key !== 'then' ? caller([...prefix, key]) : undefined),
    apply: async (_target, _this, [input]) => {
      const name = prefix.join('.');
      trace(`${name} ${JSON.stringify(input ?? null)}`);
      return ANSWERS[name](input ?? {});
    },
  });

registerLocalRuntime({
  folderConfig: (cwd) => existsSync(path.join(cwd, 'foliwake.config.json')),
  open: (options) => {
    trace(`open ${JSON.stringify(options)}`);
    return {
      core: caller(),
      sites: async () => [{ id: 'my-site' }],
      settleDelayMs: async () => 1000,
      breakLock: async (site) => `Removed the state lock of ${site} (fake).`,
      close: async () => trace('close'),
    };
  },
  failure: async (error) => {
    const known = error instanceof FakeLocalFailure;
    const code = known ? 'FAKE_LOCAL' : 'INTERNAL';
    return { coreError: { code, category: 'internal', retryable: false, message: error.message }, cause: error };
  },
  timed: (name, options, fn) => {
    if (options.requested) trace(`timed ${name}`);
    return fn();
  },
  traced: (name, fn) => {
    trace(`traced ${name}`);
    return fn();
  },
  created: async (folder) => {
    trace(`created ${path.basename(folder)}`);
    return null;
  },
  dev: async (options) => {
    trace(`dev ${JSON.stringify(options)}`);
    return options.port === 3997 ? 2 : 0;
  },
});

// Loaded after the registration: the commands read it when their modules load.
const { main } = await import('@foliwake/cli');
process.exitCode = await main(process.argv.slice(2));
