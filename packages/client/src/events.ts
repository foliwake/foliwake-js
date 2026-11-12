// Block events (`<prefix>:<type>` CustomEvents bubbling from block roots) as FoliwakeEvent objects. The core
// types are `ready` and `error`; an app that expects more (an extension's, its own) names them.
import type { BlockEvents, BlockEventType, CoreEventDetails, FoliwakeEvent } from '@foliwake/blocks-contract';

/** The core block event types, in a fixed order; an event is `<prefix>:<type>` (for example `demo:ready`). */
export const BLOCK_EVENT_TYPES: readonly (keyof CoreEventDetails)[] = Object.freeze(['ready', 'error']);

/** The types an event map delivers when `T` are named besides the core ones. */
export type DeliveredType<Events extends CoreEventDetails, T extends BlockEventType<Events>> = T | keyof CoreEventDetails;

/** One optional handler per event type of `Events` (an event map with the core types), each receiving the typed event. */
export type FoliwakeEventHandlers<Events extends CoreEventDetails = BlockEvents> = {
  [T in BlockEventType<Events>]?: (event: FoliwakeEvent<Events, T>) => void;
};

/**
 * Listens on `target` for the core event types and `types`; returns the function that removes the listeners
 * (idempotent).
 *
 * @param prefix - The event prefix (`app.blocks.eventPrefix`), without the colon.
 * @param deliver - Called with each event; native events that are not `CustomEvent`s are ignored.
 * @param types - Event types of `Events` besides the core ones (an extension's, the site's own); `deliver` gets
 *   those and the core `ready` and `error`.
 */
export function listenBlockEvents<Events extends CoreEventDetails = BlockEvents, T extends BlockEventType<Events> = BlockEventType<Events>>(
  target: Element,
  prefix: string,
  deliver: (event: FoliwakeEvent<Events, DeliveredType<Events, T>>) => void,
  types: readonly T[] = [],
): () => void {
  const controller = new AbortController();
  for (const type of new Set([...BLOCK_EVENT_TYPES, ...types])) {
    target.addEventListener(
      `${prefix}:${type}`,
      (native) => {
        if (controller.signal.aborted || !(native instanceof CustomEvent)) return;
        const origin = native.target instanceof Element ? native.target : target;
        deliver({ type, detail: native.detail, target: origin, native } as FoliwakeEvent<Events, DeliveredType<Events, T>>);
      },
      { signal: controller.signal },
    );
  }
  return () => controller.abort();
}

/**
 * Block events under `target` to typed handlers by type. `handlers` may be a function returning the current
 * handlers: it is read at event time (latest wins, no re-subscribe). Returns the unsubscribe function.
 *
 * @param opts - `prefix`: the event prefix, without the colon; `types`: event types besides the core ones;
 *   `signal`: aborting it unsubscribes.
 */
export function subscribeBlockEvents<Events extends CoreEventDetails = BlockEvents, T extends BlockEventType<Events> = BlockEventType<Events>>(
  target: Element,
  handlers: FoliwakeEventHandlers<Events> | (() => FoliwakeEventHandlers<Events>),
  opts: { prefix: string; types?: readonly T[]; signal?: AbortSignal },
): () => void {
  const current = typeof handlers === 'function' ? handlers : () => handlers;
  const { signal } = opts;
  if (signal?.aborted) return () => {};
  const remove = listenBlockEvents<Events, T>(
    target,
    opts.prefix,
    (event) => {
      const handler = current()[event.type] as ((e: FoliwakeEvent<Events, DeliveredType<Events, T>>) => void) | undefined;
      handler?.(event);
    },
    opts.types,
  );
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
