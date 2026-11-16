# Poll

A question to vote on. Each option is a task-list item with an id at its end, `{#id}`: the id the `answer` event reports. The page renders the poll with React (`poll.js` and the vendored `scripts/vendor/react.js`); without JavaScript the options stay a list.

<!-- example: Three options -->

:::poll

### Which block do you build next?

- [ ] A callout {#callout}
- [ ] A gallery {#gallery}
- [ ] A rating {#rating}

:::

<!-- example: Two options {#yes-no} -->

:::poll

### Was this page useful?

- [ ] Yes {#yes}
- [ ] No {#no}

:::
