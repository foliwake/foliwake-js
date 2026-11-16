// poll: a question to vote on, rendered with React through block-kit's ctx.mount
// and the React view of scripts/react-view.js. React is the vendored
// scripts/vendor/react.js (no npm, no build step), loaded only when the shell does
// not give its own (host.has('react'): a React or Next app that embeds the page
// does). The authored list stays for readers without JavaScript: `replace: true`
// hides it while React shows the poll. A vote emits "block:answer"
// ({key, block, selected, correct: null, graded}) and "block:complete"; the
// component is exported too, for an app that renders it itself.
import { defineBlock } from '@foliwake/block-kit';
import { reactView } from '../../scripts/react-view.js';

/** The poll as a React component, for a given createElement. */
export function createPoll(h) {
  return function Poll({ question, options, chosen, onVote, thanks }) {
    const picked = options.find((option) => option.id === chosen);
    return h(
      'div',
      { className: 'poll' },
      question ? h('h3', null, question) : null,
      h('div', { role: 'group', 'aria-label': question || 'Poll' }, options.map((option) => h('button', { key: option.id, type: 'button', 'data-option-id': option.id, 'aria-pressed': option.id === chosen, disabled: chosen !== null, onClick: () => onVote(option.id) }, option.text))),
      picked ? h('p', { role: 'status' }, `${thanks} “${picked.text}”.`) : null,
    );
  };
}

export default defineBlock('poll', async ({ question = '', options = [] }, ctx) => {
  const react = ctx.host?.has?.('react') ? ctx.host.react : await import('../../scripts/vendor/react.js');
  const props = { question, options, chosen: null, onVote, thanks: ctx.t('thanks') };
  const view = ctx.mount(reactView(react, createPoll(react.createElement)), props, { replace: true });
  function onVote(id) {
    view.update({ ...props, chosen: id });
    ctx.emit('answer', { selected: [id], correct: null, graded: 'local' });
    ctx.emit('complete', {});
  }
});
