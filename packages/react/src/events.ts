// useFoliwakeEvents: block events under an element to typed handlers (@foliwake/client subscribeBlockEvents).
import { useEffect, useRef, type RefObject } from 'react';
import type { BlockEvents, BlockEventType, CoreEventDetails } from '@foliwake/blocks-contract';
import { subscribeBlockEvents, type FoliwakeEventHandlers } from '@foliwake/client';

/**
 * Block events under `target` to typed handlers; handlers are read at event time (latest wins, no re-subscribe).
 * `opts.types`: event types besides the core `ready` and `error`.
 */
export function useFoliwakeEvents<Events extends CoreEventDetails = BlockEvents, T extends BlockEventType<Events> = BlockEventType<Events>>(
  target: RefObject<Element | null>,
  handlers: FoliwakeEventHandlers<Events>,
  opts: { prefix: string; types?: readonly T[] },
): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  // A stable dependency for the effect: the same types in another array do not re-subscribe.
  const types = useTypes(opts.types);
  useEffect(() => {
    const element = target.current;
    if (!element) return undefined;
    return subscribeBlockEvents<Events, T>(element, () => latest.current, { prefix: opts.prefix, types });
  }, [target, opts.prefix, types]);
}

function useTypes<T extends string>(types: readonly T[] | undefined): readonly T[] | undefined {
  const kept = useRef(types);
  if ((kept.current ?? []).join(' ') !== (types ?? []).join(' ')) kept.current = types;
  return kept.current;
}
