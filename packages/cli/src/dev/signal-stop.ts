// Stopping a server command on Ctrl+C or SIGTERM: its listeners are closed and the work that runs may
// finish, within a time limit; then the process exits.
import type { Server } from 'node:http';

export type StopListeners = () => Promise<void>;
/** How a server registers its stop. */
export type OnStop = (stop: StopListeners) => void;

/** How long a stop waits for the work that runs. */
export const STOP_TIMEOUT_MS = 30_000;

/** Closes `server`: settles when it has stopped listening and its open connections have ended. */
export function closed(server: Pick<Server, 'close'>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Runs `stop` within `timeoutMs`: resolves to the exit code (0, or 1 with a warning). */
async function stopWithin(stop: StopListeners, timeoutMs: number, warn: (line: string) => void): Promise<number> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const outcome = await Promise.race([stop().then(() => 'stopped' as const), timeout]);
    if (outcome === 'stopped') return 0;
    warn(`Warning: the work still running did not finish within ${timeoutMs / 1000} s; stopping without it.`);
    return 1;
  } catch (error) {
    warn(`Warning: stopping failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    clearTimeout(timer);
  }
}

export interface SignalStop {
  stop: StopListeners;
  exit: (code: number) => void;
  warn: (line: string) => void;
  signals?: Pick<NodeJS.EventEmitter, 'on'>;
  timeoutMs?: number;
}

/** Installs the SIGINT/SIGTERM handlers of a server command; resolves when it has stopped. */
export function stopOnSignals({ stop, exit, warn, signals = process, timeoutMs = STOP_TIMEOUT_MS }: SignalStop) {
  return new Promise<void>((resolve) => {
    let stopping = false;
    const onSignal = (): void => {
      if (stopping) return warn('Stopping already: waiting for the work that runs; this signal is ignored.');
      stopping = true;
      void stopWithin(stop, timeoutMs, warn).then((code) => {
        resolve();
        exit(code);
      });
    };
    signals.on('SIGINT', onSignal);
    signals.on('SIGTERM', onSignal);
  });
}
