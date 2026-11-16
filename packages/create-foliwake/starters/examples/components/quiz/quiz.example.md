# Quiz

A question with answers to choose from; `[x]` marks the right ones, and `{#id}` at the end of an answer names it in the events (all answers or none; without ids the answers are `o1`, `o2`, … in their order). The page shows the answers as buttons (`quiz.js`, with block-kit): a click sends the event `block:answer`, the first right answer also `block:complete`.

<!-- example: One right answer -->

:::quiz

### Which file defines the fields of a block?

- [ ] `styles/styles.css` {#styles}
- [x] `components/<name>/<name>.json` {#definition}
- [ ] `content/index.md` {#page}

:::

<!-- example: With an explanation {#explained} -->

:::quiz

### Which of these are block files?

- [x] `components/quiz/quiz.css` {#css}
- [x] `components/quiz/quiz.js` {#js}
- [ ] `content/blocks.md` {#page}

The explanation is shown after an answer.

:::
