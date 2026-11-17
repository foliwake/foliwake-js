// `npm run stories`: render the block examples once, then keep them current
// (`foliwake blocks render --watch`) while Storybook runs. Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
const first = spawnSync('foliwake', ['blocks', 'render'], { stdio: 'inherit', shell: windows });
if (first.error?.code === 'ENOENT') {
  // A shell alias is invisible here: the command must be on PATH.
  console.error('The `foliwake` command was not found on PATH. `npm run stories` renders the block examples with\nthe Foliwake CLI, which is not public yet. If you have it as a shell alias, put it on PATH instead (`npm link`).');
  process.exit(1);
}
// Status 1: an example has errors (shown above, left out); anything else stops here.
if (first.error || (first.status !== 0 && first.status !== 1)) {
  if (first.error) console.error(`foliwake blocks render could not run: ${first.error.message}`);
  process.exit(first.status ?? 1);
}

const children = [
  spawn('foliwake', ['blocks', 'render', '--watch'], { stdio: 'inherit', shell: windows }),
  spawn('storybook', ['dev', '--port', '6006', ...process.argv.slice(2)], { stdio: 'inherit', shell: windows }),
];
const stop = () => children.forEach((child) => child.kill());
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of children) child.once('exit', (code) => { stop(); process.exitCode = code ?? 0; });
