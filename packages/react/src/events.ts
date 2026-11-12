// useFoliwakeEvents: block events under an element to typed handlers (@foliwake/client subscribeBlockEvents).
import { useEffect, useRef, type RefObject } from 'react';
import type { BlockEvents } from '@foliwake/blocks-contract';
import { subscribeBlockEvents, type FoliwakeEventHandlers } from '@foliwake/client';

/**
 * Block events under `target` to typed handlers; handlers are read at event time (latest wins, no re-subscribe).
 * `opts.types`: event types besides the core `ready` and `error`.
 */
export function useFoliwakeEvents<Events extends object = BlockEvents>(
  target: RefObject<Element | null>,
  handlers: FoliwakeEventHandlers<Events>,
  opts: { prefix: string; types?: readonly string[] },
): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  // A stable dependency for the effect: the same types in another array do not re-subscribe.
  const types = useTypes(opts.types);
  useEffect(() => {
    const element = target.current;
    if (!element) return undefined;
    return subscribeBlockEvents<Events>(element, () => latest.current, { prefix: opts.prefix, types });
  }, [target, opts.prefix, types]);
}

function useTypes(types: readonly string[] | undefined): readonly string[] | undefined {
  const kept = useRef(types);
  if ((kept.current ?? []).join(' ') !== (types ?? []).join(' ')) kept.current = types;
  return kept.current;
}
