import { defineConfig } from 'vitepress';

/** The package reference pages, written by scripts/reference.mjs, in the order a reader meets them. */
const referenceItems = [
  { text: 'create-foliwake', link: '/reference/packages/create-foliwake' },
  { text: '@foliwake/block-kit', link: '/reference/packages/block-kit' },
  { text: '@foliwake/site-check', link: '/reference/packages/site-check' },
  { text: '@foliwake/next', link: '/reference/packages/next' },
  { text: '@foliwake/react', link: '/reference/packages/react' },
  { text: '@foliwake/server', link: '/reference/packages/server' },
  { text: '@foliwake/client', link: '/reference/packages/client' },
  { text: '@foliwake/blocks-contract', link: '/reference/packages/blocks-contract' },
  { text: '@foliwake/cli', link: '/reference/packages/cli' },
  { text: '@foliwake/core-contract', link: '/reference/packages/core-contract' },
  { text: 'foliwake', link: '/reference/packages/foliwake' },
];

export default defineConfig({
  title: 'Foliwake SDK',
  description: 'Write blocks for a Foliwake site, and embed its pages in React, Next.js or any web app.',
  // Served at the root of sdk.foliwake.dev (public/CNAME). DOCS_BASE builds for a sub-path instead.
  base: process.env.DOCS_BASE || '/',
  cleanUrls: true,
  lastUpdated: false,
  // Internal links are checked during the build; a dead link fails it.
  themeConfig: {
    nav: [
      { text: 'Concepts', link: '/concepts' },
      { text: 'Write blocks', link: '/blocks/start' },
      { text: 'Embed pages', link: '/embed/next' },
      { text: 'Reference', link: '/reference/' },
      { text: 'npm', link: 'https://www.npmjs.com/org/foliwake' },
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Concepts', link: '/concepts' },
        ],
      },
      {
        text: 'Write blocks',
        items: [
          { text: 'Start a site\'s code', link: '/blocks/start' },
          { text: 'Tutorial', link: '/blocks/tutorial' },
          { text: 'Write a block', link: '/blocks/write-a-block' },
          { text: 'Check a site\'s code', link: '/blocks/site-check' },
        ],
      },
      {
        text: 'Embed pages',
        items: [
          { text: 'Next.js', link: '/embed/next' },
          { text: 'Another React app', link: '/embed/react' },
          { text: 'Any framework: one handler', link: '/embed/any-framework' },
          { text: 'Other frameworks, or none', link: '/embed/other-frameworks' },
          { text: 'Troubleshooting', link: '/embed/troubleshooting' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'All packages', link: '/reference/' }, ...referenceItems],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/foliwake/foliwake-js' }],
    editLink: {
      pattern: 'https://github.com/foliwake/foliwake-js/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    footer: { message: 'Apache-2.0' },
  },
});
