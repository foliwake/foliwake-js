---
layout: home
title: Foliwake SDK

hero:
  name: Foliwake SDK
  text: Blocks for your site. Pages in your app.
  tagline: >-
    Foliwake publishes a site's pages as plain, checked HTML. This SDK is how you write the blocks that make
    those pages interactive, and how you show the pages inside your own app.
  actions:
    - theme: brand
      text: Concepts
      link: /concepts
    - theme: alt
      text: Reference
      link: /reference/
    - theme: alt
      text: GitHub
      link: https://github.com/foliwake/foliwake-js
  image:
    light: /hero.webp
    dark: /hero-dark.webp
    alt: Pages fly out of an open book and turn into interactive blocks

features:
  - title: I write blocks
    details: >-
      Create a site code repository with create-foliwake, write blocks with @foliwake/block-kit, and run the
      platform's own checks locally with @foliwake/site-check.
    link: /blocks/start
    linkText: Start a site's code
  - title: I embed pages in React or Next.js
    details: >-
      Read pages on your server with @foliwake/next or @foliwake/server, and mount their blocks with
      @foliwake/react. The browser never talks to Foliwake.
    link: /embed/next
    linkText: Embed in Next.js
  - title: I use another framework
    details: >-
      @foliwake/client mounts a prepared page in any DOM element: mount, update, dispose. Wrap it in a Vue,
      Svelte or custom element in a few lines.
    link: /embed/other-frameworks
    linkText: Other frameworks
---

## What Foliwake is

Foliwake publishes a site's pages as plain, checked HTML.
A site's blocks (small CSS and JavaScript modules that make parts of a page interactive) live in a Git repository.
The platform turns a commit of that repository into an immutable code release, and every page names its release.
An app can show those pages inside its own UI and mount their blocks from that same release.

The platform (the engine that renders, publishes and serves pages) is not part of this SDK.
The SDK packages talk to it over HTTP only. [Concepts](/concepts) explains the parts in one page.

## What works without a Foliwake server

- `npm create foliwake@latest`, `npx @foliwake/site-check` and the types of `@foliwake/block-kit` work offline.
- Pages and block examples are rendered by the platform only.
  The local preview needs the Foliwake CLI, which is not public yet.
- The app packages (`next`, `react`, `server`, `client`) need a Foliwake site to read pages from.

## Quick start

Block authors:

```sh
npm create foliwake@latest my-site
cd my-site
npx @foliwake/site-check
```

Then follow [Start a site's code](/blocks/start) and [Write a block](/blocks/write-a-block).

Next.js App Router apps:

```sh
npm install @foliwake/next
```

Then follow [Embed pages in a Next.js app](/embed/next).
