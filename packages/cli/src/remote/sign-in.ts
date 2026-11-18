// The device-code sign-in of `foliwake login`, shared with `site create|link` when they need one: the code
// and the approval page on stderr, the browser opened in a terminal, the token kept in the credential store
// and the server made the default. It never prints the token.
import { COMMAND, openBrowser } from '../settings.js';
import { type CredentialStore, storeForSignIn } from './credentials.js';
import { SignInError, abortableSleep, revokeToken, startDeviceSignIn, waitForSignIn } from './device-login.js';
import { createRemoteCaller } from './remote-caller.js';
import { CLOUD_NOTE, type Grant, cloudOrigin } from './servers.js';
import { rehomeMovedSignIn, saveSignIn } from './session.js';

export interface SignInOptions {
  /** Open the approval page in the browser (only when `tty`). */
  browser: boolean;
  tty: boolean;
  insecureStorage: boolean;
  /** Where the code, the address and warnings go. */
  log: (text: string) => void;
  /** Aborting stops the wait (SignInCancelled). */
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

export interface SignedIn {
  origin: string;
  grant: Grant;
  email: string | null;
  store: CredentialStore['kind'];
}

/** A sign-in by the same name issued elsewhere (the cloud moved) is kept there, or revoked there. */
async function settleMovedSignIn(origin: string, log: (text: string) => void, env: NodeJS.ProcessEnv) {
  const moved = rehomeMovedSignIn(origin, env);
  if (moved && 'kept' in moved) {
    const logout = `\`${COMMAND} logout ${moved.kept}\``;
    log(`Your earlier sign-in, made at ${moved.kept}, is kept as a sign-in to ${moved.kept}; ${logout} revokes it.\n`);
  }
  if (!moved || !('orphan' in moved)) return;
  const { issuer, token } = moved.orphan;
  const revoked = issuer !== null && token !== null && (await revokeToken(issuer, token));
  const where = issuer ? `, made at ${issuer},` : '';
  log(
    revoked
      ? `Your earlier sign-in, made at ${issuer}, was revoked there and replaced.\n`
      : `Warning: your earlier sign-in${where} could not be revoked and is replaced here; ` +
          'it stays valid there until 90 days after its last use.\n',
  );
}

/** Signs this computer in to `origin`; throws SignInError (SignInCancelled too) or CredentialStoreError. */
export async function deviceSignIn(origin: string, options: SignInOptions): Promise<SignedIn> {
  const { browser, tty, insecureStorage, log, signal, env = process.env } = options;
  const store = storeForSignIn({ insecureStorage }, env);
  const start = await startDeviceSignIn(origin).catch((error: unknown) => {
    throw cloudHint(error, origin, env);
  });
  log(`Your one-time code: ${start.userCode}\nApprove it at ${start.verificationUriComplete}\n`);
  if (browser && tty) openBrowser(start.verificationUriComplete);
  log('Waiting for approval…\n');
  const { token, email } = await waitForSignIn(origin, start, signal ? { sleep: abortableSleep(signal) } : {});
  const grant = await createRemoteCaller({ origin, token }).whoami();
  await settleMovedSignIn(origin, log, env);
  const superseded = saveSignIn({ origin, token, grant, store, email }, env);
  // The earlier sign-in of this computer would stay valid on the server until it expired.
  if (superseded && !(await revokeToken(origin, superseded))) {
    log(`Warning: ${origin} could not revoke this computer's earlier token; it expires 90 days after its last use.\n`);
  }
  return { origin, grant, email, store: store.kind };
}

/** The cloud's API may not be live yet: say so instead of only "cannot be reached". */
export function cloudHint(error: unknown, origin: string, env: NodeJS.ProcessEnv = process.env): unknown {
  if (!(error instanceof SignInError) || origin !== cloudOrigin(env)) return error;
  if (error.code !== 'SERVER_UNREACHABLE' && error.code !== 'SERVER_FAILED') return error;
  return new SignInError(error.code, `${error.message} ${CLOUD_NOTE}`);
}
