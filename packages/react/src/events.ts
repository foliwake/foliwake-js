// Block events (`<prefix>:<type>` CustomEvents bubbling from block roots) as FoliwakeEvent objects.
import { useEffect, useRef, type RefObject } from 'react';
import type { BlockEventType, FoliwakeEvent } from '@foliwake/blocks-contract';

export const BLOCK_EVENT_TYPES: readonly BlockEventType[] = Object.freeze(['ready', 'select', 'check', 'answer', 'reset', 'complete', 'error']);

export type FoliwakeEventHandlers = { [T in BlockEventType]?: (event: FoliwakeEvent<T>) => void };

/** Listens on `target` for every block event type; returns the function that removes the listeners. */
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

/** Block events under `target` to typed handlers; handlers are read at event time (latest wins, no re-subscribe). */
export function useFoliwakeEvents(target: RefObject<Element | null>, handlers: FoliwakeEventHandlers, opts: { prefix: string }): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const element = target.current;
    if (!element) return undefined;
    return listenBlockEvents(element, opts.prefix, (event) => {
      const handler = latest.current[event.type] as ((e: FoliwakeEvent) => void) | undefined;
      handler?.(event);
    });
  }, [target, opts.prefix]);
}
