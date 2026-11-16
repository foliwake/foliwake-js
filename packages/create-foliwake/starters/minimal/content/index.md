---
id: home
path: /
title: Home
description: A Foliwake site created with create-foliwake.
---

![Foliwake](./images/foliwake-logo.png)

# Your Foliwake site is running

Foliwake turns Markdown pages like this one into fast, plain HTML, and the blocks in `components/` give them their look and behaviour.

## Try this now

1. **Edit this page.** Open `content/index.md`, change a sentence and save: the browser reloads.
2. **See your blocks.** Open [the block catalog](/_dev/blocks): every block with its examples.
3. **Make your own block.** With the Foliwake CLI, run `foliwake blocks new callout --js --example`, then look for it in the catalog.

:::note

### This is a block

The box around this text is the block `note`. Its fields are defined in `components/note/note.json` and its look in `components/note/note.css`.

:::

---

## When you're ready

Check the code with `npx @foliwake/site-check`, push the repository to GitHub and connect it to your site in the Foliwake admin: every branch gets a preview. `README.md` has the rest, and the [Quickstart](https://docs.foliwake.dev/guide/quickstart) walks you through it.
