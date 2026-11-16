// The types of @foliwake/client as an app uses them, compiled against the built declarations: an extension's
// members are optional on the created host (the app may give none), event maps include the core types, and only
// their own event types can be named. Each `@ts-expect-error` must be needed (an unused one is an error too).
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE = `
import { createHost, listenBlockEvents, mountFoliwakePage, subscribeBlockEvents } from '@foliwake/client';
import type { AssessmentEvents, AssessmentHostMembers } from '@foliwake/blocks-contract/assessment';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

declare const page: FoliwakePageData;
declare const element: HTMLElement;
const signal = new AbortController().signal;

const host = createHost<{ save(key: string): void }>({}, { signal, page });
// @ts-expect-error the extension's member is optional on the created host: the app may give none
host.save('k');
host.save?.('k');

listenBlockEvents<AssessmentEvents, 'answer'>(element, 'demo', (event) => {
  if (event.type === 'answer') {
    const count: number = event.detail.selected.length;
    void count;
  } else if (event.type === 'ready') {
    const contract: number = event.detail.contract;
    void contract;
  } else {
    // @ts-expect-error a type that was not named is not delivered (only answer, ready and error)
    void event.detail.selected;
  }
}, ['answer']);

// @ts-expect-error a name that is not an event type of the map
listenBlockEvents<AssessmentEvents>(element, 'demo', () => undefined, ['nope']);

// @ts-expect-error an event map must have the core types
listenBlockEvents<{ answer: { selected: string[] } }>(element, 'demo', () => undefined);

subscribeBlockEvents<AssessmentEvents>(element, { complete: (event) => void event.detail.key }, { prefix: 'demo', types: ['complete'] });

mountFoliwakePage<AssessmentHostMembers, AssessmentEvents>(element, {
  page,
  host: { mode: 'review' },
  events: ['answer', 'complete'],
  onEvent: (event) => void event.type,
});
mountFoliwakePage<AssessmentHostMembers, AssessmentEvents>(element, {
  page,
  // @ts-expect-error events of the map only
  events: ['answer', 'nope'],
});
`;

test('client types: optional extension members, event maps with the core types, named types of the map only', () => {
  const dir = path.join(ROOT, 'test', `.client-types-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    const file = path.join(dir, 'app.ts');
    writeFileSync(file, SOURCE);
    const program = ts.createProgram([file], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
    });
    const problems = ts.getPreEmitDiagnostics(program).map((d) => `${d.file ? d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1 : ''} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    assert.deepEqual(problems, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
