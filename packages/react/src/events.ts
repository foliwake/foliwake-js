// useFoliwakeEvents: block events under an element to typed handlers (@foliwake/client subscribeBlockEvents).
import { useEffect, useRef, type RefObject } from 'react';
import { subscribeBlockEvents, type FoliwakeEventHandlers } from '@foliwake/client';

/** Block events under `target` to typed handlers; handlers are read at event time (latest wins, no re-subscribe). */
export function useFoliwakeEvents(target: RefObject<Element | null>, handlers: FoliwakeEventHandlers, opts: { prefix: string }): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const element = target.current;
    if (!element) return undefined;
    return subscribeBlockEvents(element, () => latest.current, { prefix: opts.prefix });
  }, [target, opts.prefix]);
}
