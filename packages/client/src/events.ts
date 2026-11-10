// Block events (`<prefix>:<type>` CustomEvents bubbling from block roots) as FoliwakeEvent objects.
import type { BlockEventType, FoliwakeEvent } from '@foliwake/blocks-contract';

export const BLOCK_EVENT_TYPES: readonly BlockEventType[] = Object.freeze(['ready', 'select', 'check', 'answer', 'reset', 'complete', 'error']);

export type FoliwakeEventHandlers = { [T in BlockEventType]?: (event: FoliwakeEvent<T>) => void };

/** Listens on `target` for every block event type; returns the function that removes the listeners (idempotent). */
export function listenBlockEvents(target: Element, prefix: string, deliver: (event: FoliwakeEvent) => void): () => void {
  const controller = new AbortController();
  for (const type of BLOCK_EVENT_TYPES) {
    target.addEventListener(
      `${prefix}:${type}`,
      (native) => {
        if (controller.signal.aborted || !(native instanceof CustomEvent)) return;
        const origin = native.target instanceof Element ? native.target : target;
        deliver({ type, detail: native.detail, target: origin, native } as FoliwakeEvent);
      },
      { signal: controller.signal },
    );
  }
  return () => controller.abort();
}

/**
 * Block events under `target` to typed handlers by type. `handlers` may be a function returning the current
 * handlers: it is read at event time (latest wins, no re-subscribe). Returns the unsubscribe function.
 */
export function subscribeBlockEvents(target: Element, handlers: FoliwakeEventHandlers | (() => FoliwakeEventHandlers), opts: { prefix: string; signal?: AbortSignal }): () => void {
  const current = typeof handlers === 'function' ? handlers : () => handlers;
  const { signal } = opts;
  if (signal?.aborted) return () => {};
  const remove = listenBlockEvents(target, opts.prefix, (event) => {
    const handler = current()[event.type] as ((e: FoliwakeEvent) => void) | undefined;
    handler?.(event);
  });
  let stopped = false;
  // Idempotent; also removes its listener on the external signal, so subscribe/unsubscribe cycles against a
  // long-lived signal leave nothing behind.
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', stop);
    remove();
  };
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}
