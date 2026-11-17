// A React view for block-kit's ctx.mount: `reactView(react, Component)`
// renders Component with the block's props into the element the kit gives it, with `react` being
// {createElement, createRoot}: the shell's (host.react) or the vendored scripts/vendor/react.js.
// A render error after the first commit (React 19 onUncaughtError) fails the view: the kit shows the
// authored HTML again and reports the block's `error` event.
export function reactView(react, Component) {
  const roots = new WeakMap();
  return {
    render(element, props, { fail }) {
      let root = roots.get(element);
      if (!root) {
        root = react.createRoot(element, { onUncaughtError: (error) => fail(error) });
        roots.set(element, root);
      }
      root.render(react.createElement(Component, props));
    },
    unmount(element) {
      roots.get(element)?.unmount();
      roots.delete(element);
    },
  };
}
