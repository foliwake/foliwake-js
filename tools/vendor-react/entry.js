// The entry of the vendored React for site blocks (scripts/vendor/react.js of a
// project made with `create-foliwake --react`). Built by tools/build.mjs with
// Vite (vite.config.mjs next to this file) from this repository's exact-pinned
// `react` and `react-dom` into one minified ES module, production mode, no
// dependencies; shipped in create-foliwake's vendor/. Blocks import it relatively; code releases accept no bare
// specifiers, so this file is the whole React of a site without a build step.
export {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} from 'react';
export { createPortal, flushSync } from 'react-dom';
export { createRoot, hydrateRoot } from 'react-dom/client';
