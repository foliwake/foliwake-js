// @foliwake/cli as a library: the remote caller and the server selection the `foliwake` command uses, for
// tools that call a Foliwake server the same way (same sign-ins, same FOLIWAKE_SERVER/FOLIWAKE_TOKEN rules).
export { createRemoteCaller, type RemoteCallerOptions } from './remote/remote-caller.js';
export { type CoreError, CoreFailure } from './remote/core-failure.js';
export { remoteCallerFor, tokenFor } from './remote/session.js';
export { type Target, resolveTarget, serverOrigin } from './remote/servers.js';
export { main } from './main.js';
