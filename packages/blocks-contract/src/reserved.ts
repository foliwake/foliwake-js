// Names of the blocks contract that more than one party writes or reads, as values: the attributes a loader sets
// on block roots and stylesheet links, the shells, and the key of the host in the DOM context protocol (reserved:
// no host provider answers `context-request` events yet). Browser-safe constants, nothing else.
/** Attributes of the HTML a loader manages (HTML contract 2). */
export const BLOCK_ATTRIBUTES = Object.freeze({
  /** A block root: `<div data-component="<name>">` (written by the engine). */
  component: 'data-component',
  /** A root's state while and after it mounts: MountStatus (written by the loader). */
  status: 'data-component-status',
  /** A root's key, `host.keyOf(root)` (written by the loader). */
  key: 'data-block-key',
  /** On a block stylesheet `<link>`: the block's name (written by the loader or the app's preload). */
  css: 'data-component-css',
  /** On a block stylesheet `<link>`: the code release it belongs to. */
  codeRelease: 'data-code-release',
} as const);

/**
 * The shells this contract names: the Next and React adapters, the engine's own pages, a native app's webview,
 * and `web-component` (reserved for a custom-element host adapter, `<foliwake-page>`; not implemented yet).
 */
export const KNOWN_SHELLS = Object.freeze(['next', 'react', 'foliwake', 'webview', 'web-component'] as const);

/** One of KNOWN_SHELLS. */
export type KnownShell = (typeof KNOWN_SHELLS)[number];

/**
 * The context key of the host (Context Community Protocol, `context-request` events): a string, not a Symbol,
 * so it works across copies of a library. Reserved: a later minor version lets a nested island get the host this
 * way; today the host is the parameter of `init`.
 */
export const HOST_CONTEXT_KEY = 'foliwake:host';
