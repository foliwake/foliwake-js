// create-foliwake: installing the project's npm packages, only when the project has some (Storybook) and the
// user asked for it. The only step of create that uses the network. The package manager is the one that ran
// `create` (npm_config_user_agent: `pnpm/10.33.0 npm/? node/v22 …`), else npm.
import { spawn } from 'node:child_process';

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** The package manager named by npm_config_user_agent; npm when none is. */
export function packageManagerOf(env: NodeJS.ProcessEnv): PackageManager {
  const name = (env.npm_config_user_agent ?? '').split('/')[0];
  return (PACKAGE_MANAGERS as readonly string[]).includes(name) ? (name as PackageManager) : 'npm';
}

export type InstallResult = { ok: true } | { ok: false; reason: string };

/** `<manager> install` in the project, its output shown as it runs. */
export function installPackages(dir: string, manager: PackageManager, env: NodeJS.ProcessEnv): Promise<InstallResult> {
  return new Promise((resolve) => {
    const child = spawn(manager, ['install'], { cwd: dir, env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', (error) => resolve({ ok: false, reason: error.message }));
    child.on('exit', (code) =>
      resolve(code === 0 ? { ok: true } : { ok: false, reason: `${manager} install exited with ${code}` }),
    );
  });
}
