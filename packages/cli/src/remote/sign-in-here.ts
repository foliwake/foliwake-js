// A sign-in in the middle of another command (`create`, `connect`).
/**
 * `foliwake login <origin>` inline, for `create` and `connect`: Ctrl+C stops only the wait, a failure is printed;
 * false in both cases.
 */
export async function signInHere(origin: string): Promise<boolean> {
  const { deviceSignIn } = await import('./sign-in.js');
  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.on('SIGINT', onInterrupt);
  try {
    const signed = await deviceSignIn(origin, {
      browser: true,
      tty: process.stdout.isTTY === true,
      insecureStorage: false,
      log: (text) => void process.stderr.write(text),
      signal: controller.signal,
    });
    const { serverDisplay } = await import('./servers.js');
    process.stdout.write(`Signed in to ${serverDisplay(origin)} as ${signed.email ?? signed.grant.principal}.\n`);
    return true;
  } catch (error) {
    const { SignInCancelled } = await import('./device-login.js');
    const cancelled = error instanceof SignInCancelled;
    const why = cancelled ? 'was cancelled' : `failed: ${(error as Error).message}`;
    process.stderr.write(`The sign-in to ${origin} ${why}.\n`);
    return false;
  } finally {
    process.off('SIGINT', onInterrupt);
  }
}
