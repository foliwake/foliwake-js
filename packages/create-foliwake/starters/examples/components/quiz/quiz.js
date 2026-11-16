// quiz: turns each answer into a button and says whether it was right.
// The loader (scripts/components.js) calls the block's init once for every
// <div data-component="quiz"> on the page; defineBlock('quiz', …) makes it from
// the setup below, which gets the fields by name (data-field, never by position,
// so editors can add an explanation freely) and `ctx`. ctx.list renders a button
// into each answer of the server list, ctx.state re-renders them when it changes,
// ctx.emit sends the bubbling events "block:answer" and "block:complete" with
// {key, block, ...detail}, and ctx.t reads the labels of quiz.json `ui`.
// An answer's id is its `{#id}`; without ids (they are optional) it is o1, o2, … by position.
import { defineBlock, html, nothing } from 'foliwake';

export default defineBlock('quiz', ({ options = [] }, ctx) => {
  const answered = ctx.state([]); // indexes of the answers clicked, in order
  const content = new Map(); // each answer's authored nodes, moved into its button
  let complete = false;

  function choose(index) {
    if (!answered.value.includes(index)) answered.value = [...answered.value, index];
    const { id, correct } = options[index];
    ctx.emit('answer', { selected: [id || `o${index + 1}`], correct, graded: 'local' });
    if (correct && !complete) {
      complete = true;
      ctx.emit('complete', {});
    }
  }

  ctx.list('options', (item, option, index) => {
    if (!content.has(item)) content.set(item, [...item.childNodes]);
    const result = answered.value.includes(index) ? (option.correct ? 'right' : 'wrong') : null;
    return html`<button type="button" data-answer=${index} data-result=${result ?? nothing}
      aria-label=${result ? `${option.text}: ${ctx.t(result)}` : nothing} @click=${() => choose(index)}>${content.get(item)}</button>`;
  });
  ctx.effect(() => {
    ctx.root.dataset.quiz = answered.value.length > 0 ? 'answered' : 'ready';
  });
});
