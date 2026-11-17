// Types of the vendored lit-html (lit-html.js, unchanged from lit-html 3.3.3, frozen JS): only what the kit imports.
// lit-html.js ships as written; these declarations type the kit's import of it, ship next to it in dist/, and the
// re-exported ones (`TemplateResult`, `html`, `nothing`) are inlined into the standalone foliwake.d.ts by the build
// (tools/block-kit-declaration.mjs).

/** What `html` returns (lit-html's template result). */
export interface TemplateResult {
  readonly strings: TemplateStringsArray;
  readonly values: readonly unknown[];
}
/** lit-html's `html` tag: a template rendered by `ctx.render`, without eval. */
export declare function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;
/** Renders nothing (lit-html's `nothing`). */
export declare const nothing: unique symbol;
/** Renders `value` (a template result, `nothing`, text) into `container`, updating what it rendered there before. */
export declare function render(value: unknown, container: HTMLElement | DocumentFragment): unknown;
