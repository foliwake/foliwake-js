// <FoliwakePage>: renders a prepared page body (SSR-safe) and hands the element to @foliwake/client's
// mountFoliwakePage, which holds the lifecycle invariants (docs/plan/react-packages.md §6.2). React's part:
//  1. page.identity (with its digest of the final body) is the React key: a new body, code release, channel or
//     mode remounts; nothing else does.
//  2. Every render passes the latest props to the mount (`update()`): callbacks and host are read at call time.
//  3. The body is a memoised element React never re-renders; a second mount on it (StrictMode, Fast Refresh,
//     a hidden <Activity>) starts from the pristine body (the client's mount/dispose/mount contract).
import { memo, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { BlockEvents, CoreEventDetails, BlocksModule } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';
import { mountFoliwakePage, pageStylesheets, type FoliwakeMount, type FoliwakeMountCallbacks } from '@foliwake/client';

/** Props of `<FoliwakePage>`: the page, the mount callbacks of `@foliwake/client`, and how to render the body. */
export interface FoliwakePageProps<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents> extends FoliwakeMountCallbacks<Ext, Events> {
  /** The prepared page from the server; its `identity` is the component's key. */
  page: FoliwakePageData;
  /** Build-time mode (later): the blocks module from the app's bundle instead of the code release. */
  blocks?: () => Promise<BlocksModule>;
  /** Render <link rel="stylesheet"> for the body's blocks with the body (default true). */
  preloadCss?: boolean;
  /** The body element's tag (default `div`). */
  as?: 'div' | 'article' | 'main' | 'section';
  /** The body element's class. */
  className?: string;
  /** The document's CSP nonce (CSP strategy `nonce`): set on the import map the mount adds for the page's code release. */
  nonce?: string;
}

type Tag = 'div' | 'article' | 'main' | 'section';
const useIsoLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

const Body = memo(
  function Body(props: { html: string; tag: Tag; htmlContract: string; className: string | undefined; bodyRef: React.RefObject<HTMLElement | null> }) {
    const Tag = props.tag;
    return (
      <Tag
        ref={props.bodyRef as React.RefObject<HTMLDivElement>}
        data-foliwake-body=""
        data-html-contract={props.htmlContract}
        className={props.className}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
    );
  },
  (a, b) => a.html === b.html && a.className === b.className && a.tag === b.tag,
);

const callbacks = <Ext extends object, Events extends CoreEventDetails>(props: FoliwakePageProps<Ext, Events>): FoliwakeMountCallbacks<Ext, Events> => ({
  host: props.host,
  onEvent: props.onEvent,
  events: props.events,
  requireBlocks: props.requireBlocks,
  onStatus: props.onStatus,
  onError: props.onError,
  onMount: props.onMount,
  hooks: props.hooks,
});

function Mounted<Ext extends object, Events extends CoreEventDetails>(props: FoliwakePageProps<Ext, Events>): ReactNode {
  const { page, as = 'div', className, preloadCss = true } = props;
  const bodyRef = useRef<HTMLElement | null>(null);
  const latest = useRef(props);
  const mount = useRef<FoliwakeMount<Ext, Events> | null>(null);
  useIsoLayoutEffect(() => {
    latest.current = props;
    mount.current?.update(callbacks(props));
  });

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return undefined;
    const current = mountFoliwakePage(element, { ...callbacks(latest.current), page, shell: 'react', blocks: latest.current.blocks, nonce: latest.current.nonce });
    mount.current = current;
    return () => {
      current.dispose();
      if (mount.current === current) mount.current = null;
    };
    // page.identity is the key of this component; the effect runs once per mounted identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.identity]);

  const links = preloadCss
    ? pageStylesheets(page).map((sheet) => (
        <link key={sheet.name} rel="stylesheet" href={sheet.href} data-component-css={sheet.name} data-code-release={sheet.codeRelease} />
      ))
    : null;
  return (
    <>
      {links}
      <Body html={page.html} tag={as} htmlContract={page.htmlContract} className={className} bodyRef={bodyRef} />
    </>
  );
}

/** Shows a prepared Foliwake page and mounts its blocks. Remounts only when `page.identity` changes. */
export function FoliwakePage<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents>(props: FoliwakePageProps<Ext, Events>): ReactNode {
  return <Mounted key={props.page.identity} {...props} />;
}
