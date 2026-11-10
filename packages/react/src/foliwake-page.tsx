// <FoliwakePage>: shows a prepared page body and mounts its blocks from the page's own code release.
//
// Invariants (docs/plan/react-packages.md §6.2):
//  1. page.identity is the React key: a new body, code release, channel or mode remounts; nothing else does.
//  2. Callbacks and host members are read through refs at call time (latest wins).
//  3. Every async step checks the mount's AbortSignal first; nothing runs after dispose.
//  4. Dispose runs once per mount: abort, remove listeners, handle.dispose(), release CSS.
//  5. A second mount on the same element (StrictMode, Fast Refresh) starts from the pristine body.
//  6. Block CSS is counted per code release (css-registry.ts).
import { memo, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { BlockReport, BlocksModule, FoliwakeEvent, MountHandle } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';
import { acquireCss } from './css-registry.js';
import { listenBlockEvents } from './events.js';
import { createHost, type HostInit } from './host.js';
import { importBlocksModule } from './load.js';

export type FoliwakePageStatus = 'mounting' | 'ready' | 'partial' | 'static' | 'error';
export interface FoliwakePageError {
  code: string;
  message: string;
}

export interface FoliwakePageProps {
  page: FoliwakePageData;
  host?: HostInit;
  onEvent?: (event: FoliwakeEvent) => void;
  /** Without blocks the page is `error` instead of `static`. */
  requireBlocks?: boolean;
  onStatus?: (status: FoliwakePageStatus, reports?: BlockReport[]) => void;
  onError?: (error: FoliwakePageError) => void;
  /** Imperative app logic on the mounted container (slides, focus). */
  onMount?: (container: HTMLElement, handle: MountHandle) => void;
  /** Build-time mode (later): the blocks module from the app's bundle instead of the code release. */
  blocks?: () => Promise<BlocksModule>;
  /** Render <link rel="stylesheet"> for the body's blocks with the body (default true). */
  preloadCss?: boolean;
  as?: 'div' | 'article' | 'main' | 'section';
  className?: string;
}

type Tag = NonNullable<FoliwakePageProps['as']>;
const useIsoLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const mountedOnce = new WeakSet<Element>();

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

function isDevelopment(): boolean {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV === 'development';
}

function Mounted(props: FoliwakePageProps): ReactNode {
  const { page, as = 'div', className, preloadCss = true } = props;
  const bodyRef = useRef<HTMLElement | null>(null);
  const latest = useRef(props);
  useIsoLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    let handle: MountHandle | null = null;
    let stopEvents: (() => void) | null = null;
    let releaseCss: (() => void) | null = null;
    let disposed = false;

    const status = (s: FoliwakePageStatus, reports?: BlockReport[]) => {
      if (!signal.aborted) latest.current.onStatus?.(s, reports);
    };
    const fail = (code: string, message: string) => {
      if (signal.aborted) return;
      latest.current.onError?.({ code, message });
      status(latest.current.requireBlocks ? 'error' : 'static');
    };

    if (mountedOnce.has(container)) container.innerHTML = page.html; // pristine body for a second mount
    mountedOnce.add(container);

    const load = latest.current.blocks ?? (page.blocksUrl ? () => importBlocksModule(page.blocksUrl!) : null);
    if (!load) {
      if (page.codeRelease === null) fail('NO_CODE_RELEASE', 'The origin named no code release for this body (plain/1); it is shown without blocks.');
      else fail('NO_BLOCKS_ENTRY', 'No blocks module is configured (app.blocks.entry); the body is shown without blocks.');
      return () => controller.abort();
    }
    status('mounting');
    load().then(
      (mod) => {
        if (signal.aborted) return;
        const declared = mod?.BLOCKS_CONTRACT;
        if (typeof mod?.mountBlocks !== 'function' || !declared || declared.major !== page.contract.major) {
          fail('BLOCKS_CONTRACT_UNSUPPORTED', `The blocks module speaks foliwake-blocks/${declared?.major ?? '?'}; this app expects foliwake-blocks/${page.contract.major}.`);
          return;
        }
        const prefix = declared.eventPrefix ?? page.contract.eventPrefix;
        if (prefix !== page.contract.eventPrefix) {
          if (isDevelopment()) console.warn(`[foliwake] the blocks emit "${prefix}:" events; the config expects "${page.contract.eventPrefix}:".`);
          latest.current.onError?.({ code: 'EVENT_PREFIX_MISMATCH', message: `Blocks emit "${prefix}:" events, the config says "${page.contract.eventPrefix}".` });
        }
        stopEvents = listenBlockEvents(container, prefix, (event) => {
          if (!signal.aborted) latest.current.onEvent?.(event);
        });
        if (page.codeRelease) releaseCss = acquireCss(container.ownerDocument, page.codeRelease);
        const host = createHost(() => latest.current.host ?? {}, { signal, page });
        try {
          handle = mod.mountBlocks(container, host);
        } catch (error) {
          fail('BLOCKS_MOUNT_FAILED', error instanceof Error ? error.message : String(error));
          return;
        }
        latest.current.onMount?.(container, handle);
        handle.ready.then(
          (reports) => {
            if (signal.aborted) return;
            const failed = reports.filter((r) => r.status === 'error').length;
            status(failed === 0 ? 'ready' : failed === reports.length && reports.length > 0 && latest.current.requireBlocks ? 'error' : 'partial', reports);
          },
          (error) => fail('BLOCKS_READY_FAILED', error instanceof Error ? error.message : String(error)),
        );
      },
      (error) => fail('BLOCKS_MODULE_FAILED', `The blocks module could not be loaded: ${error instanceof Error ? error.message : String(error)}`),
    );

    return () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      stopEvents?.();
      try {
        handle?.dispose();
      } catch (error) {
        console.error('[foliwake] dispose failed', error);
      }
      releaseCss?.();
    };
    // page.identity is the key of this component; the effect runs once per mounted identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.identity]);

  const links = preloadCss && page.codeBase && page.codeRelease
    ? page.blocks.map((name) => (
        <link key={name} rel="stylesheet" href={`${page.codeBase}components/${name}/${name}.css`} data-component-css={name} data-code-release={page.codeRelease!} />
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
export function FoliwakePage(props: FoliwakePageProps): ReactNode {
  return <Mounted key={props.page.identity} {...props} />;
}
