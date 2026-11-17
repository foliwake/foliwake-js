// Browser harness for @foliwake/react (test/react-browser.test.js). The test drives it through
// window.harness and reads window.__log / __events / __status / __errors.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FoliwakePage, cssMounts } from '@foliwake/react';

const CDS = { a: `cd_${'a1'.repeat(16)}`, b: `cd_${'b2'.repeat(16)}`, slow: `cd_${'c3'.repeat(16)}`, major3: `cd_${'d4'.repeat(16)}` };
const page = (name, cd, extra = {}) => ({
  identity: `demo|live|/${name}|"e1"|${cd}|practice`, site: 'demo', channel: 'live', path: `/${name}`, mode: 'practice',
  html: `<h2>${name}</h2><div data-component="quiz"><p>Q ${name}</p></div>`, codeRelease: cd, htmlContract: '2', lang: 'en',
  blocks: ['quiz'], blocksUrl: `/foliwake-code/${cd}/scripts/blocks.js`, codeBase: `/foliwake-code/${cd}/`,
  contract: { major: 2, eventPrefix: 'demo' }, preload: [], ...extra,
});
const PAGES = {
  one: page('one', CDS.a), two: page('two', CDS.a), other: page('other', CDS.b), slow: page('slow', CDS.slow), major3: page('major3', CDS.major3),
  oneNewEtag: page('one', CDS.a, { identity: `demo|live|/one|"e2"|${CDS.a}|practice` }),
};
window.__events = []; window.__status = []; window.__errors = []; window.__log ??= [];
window.cssMounts = () => cssMounts(document);

function App({ initial }) {
  const [state, setState] = useState(initial);
  window.harness.set = (patch) => setState((s) => ({ ...s, ...patch }));
  return state.embeds.map((name, i) => (
    <FoliwakePage
      key={i}
      page={PAGES[name]}
      host={{ shell: 'harness', labels: { check: state.label }, saved: (key) => state.saved[key] ?? null }}
      events={['answer']}
      onEvent={(e) => window.__events.push([state.tag, e.type, e.detail.key, e.detail.saved ?? null])}
      onStatus={(s) => window.__status.push([name, s])}
      onError={(err) => window.__errors.push([name, err.code])}
      requireBlocks={state.requireBlocks}
      className="embed"
    />
  ));
}

window.harness = {
  /** Pages prepared by the test (e.g. with @foliwake/server preparePage), usable as embed names. */
  addPages(pages) { Object.assign(PAGES, pages); },
  start({ strict = false, ...initial }) {
    const app = <App initial={{ embeds: ['one'], label: 'Check', saved: {}, tag: 'v1', requireBlocks: false, ...initial }} />;
    createRoot(document.getElementById('root')).render(strict ? <StrictMode>{app}</StrictMode> : app);
  },
};
