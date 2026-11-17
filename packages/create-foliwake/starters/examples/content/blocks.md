---
id: blocks
path: /blocks
title: Blocks
description: Every block of the examples template.
---

# Blocks

A block starts with a line `:::name` and ends with a line `:::`. Inside, each field is ordinary Markdown: a heading, a paragraph, a list. The engine checks every block against its definition (`components/<name>/<name>.json`) and reports a clear error instead of guessing.

## Note

:::note

A note needs only text; the title is optional.

:::

## Steps

:::steps

### Publish a change

- Edit a page or a block.
- Check it locally with `npx @foliwake/site-check`.
- Push a branch: the branch preview shows it.
- Merge into main: the preview is rebuilt, and you release it in the admin.

:::

---

## Quiz

The quiz block has JavaScript (`components/quiz/quiz.js`). Mark the right answers with `[x]`; `{#id}` names each answer in the events the block sends.

:::quiz

### Which file defines the fields of a block?

- [ ] `styles/styles.css` {#styles}
- [x] `components/<name>/<name>.json` {#definition}
- [ ] `content/index.md` {#page}

The definition lists the fields in order, each with its type.

:::
