#!/usr/bin/env node
// Writes the diagrams of the documentation site, docs/public/diagrams/<name>[-phone][-dark].svg:
// a wide and a phone layout of each diagram, each in a light and a dark version.
// The page shows the one that fits the screen and the theme (theme/Diagram.vue).
//
// Edit the layouts here, run `pnpm --filter docs diagrams`, and commit the written files with this script.
// The drawing kit (colours, icons, cards, arrows) is in diagram-kit.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  THEMES, TYPE, arrow, card, defs, footnote, group, heading, label, svg,
} from './diagram-kit.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'diagrams');

const mono = (t) => ({ t, mono: true });

// ---------- Who does what ----------

const WHO = {
  title: 'Who does what',
  desc: 'Authors write Markdown pages and block authors make Git commits. The Foliwake platform turns them into '
    + 'page HTML (path.plain.html with an X-Code-Release header) and code releases (components, scripts, styles). '
    + 'On your side, the app developer uses the SDK: on the server, @foliwake/server or /next reads pages, '
    + 'prepares them and proxies code; in the browser, @foliwake/client or /react mounts the blocks.',
};

const WHO_CARDS = {
  author: { icon: 'pen', tone: 'amber', title: 'Author', lines: ['Markdown pages'] },
  blockAuthor: { icon: 'commit', tone: 'amber', title: 'Block author', lines: ['Git commit'] },
  platform: {
    icon: 'cloud', tone: 'violet', accent: true, title: 'Foliwake platform',
    lines: ['renders pages,', 'captures code releases,', 'serves both', { t: 'not part of this SDK', muted: true }],
  },
  pageHtml: {
    icon: 'document', tone: 'violet', title: 'Page HTML',
    lines: [mono('<path>.plain.html'), mono('X-Code-Release: cd_…')],
  },
  codeRelease: {
    icon: 'package', tone: 'violet', title: ['Code release ', mono('cd_…')],
    lines: [mono('components/, scripts/,'), mono('styles/, …')],
  },
  developer: { icon: 'user', tone: 'teal', title: 'App developer', lines: ['your app'] },
  browser: {
    icon: 'browser', tone: 'teal', title: 'In the browser', lines: [mono('@foliwake/client, /react'), 'mount blocks'],
  },
  server: {
    icon: 'server', tone: 'teal', title: 'On your server',
    lines: [mono('@foliwake/server, /next'), 'read, prepare, proxy'],
  },
};

const SDK_GROUP = { label: 'Your side: the SDK (this repository)', iconName: 'code', tone: 'teal' };

function whoWide(t) {
  const type = TYPE.desktop;
  const c = WHO_CARDS;
  const size = { width: 760, height: 552 };
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 32, 48, WHO.title, ['The platform renders and serves; the SDK runs on your side.']),
    group(t, type, { x: 16, y: 352, w: 728, h: 176, ...SDK_GROUP }),
    arrow(t, [[208, 156], [256, 156]]),
    arrow(t, [[208, 260], [256, 260]]),
    arrow(t, [[464, 156], [504, 156]]),
    arrow(t, [[464, 260], [504, 260]]),
    arrow(t, [[608, 304], [608, 392]]),
    arrow(t, [[712, 156], [736, 156], [736, 448], [712, 448]]),
    arrow(t, [[168, 448], [224, 448]]),
    arrow(t, [[512, 448], [428, 448]]),
    card(t, type, { ...c.author, x: 32, y: 112, w: 176, h: 88 }),
    card(t, type, { ...c.blockAuthor, x: 32, y: 216, w: 176, h: 88 }),
    card(t, type, { ...c.platform, layout: 'stack', x: 256, y: 112, w: 208, h: 192 }),
    card(t, type, { ...c.pageHtml, x: 504, y: 112, w: 208, h: 88 }),
    card(t, type, { ...c.codeRelease, x: 504, y: 216, w: 208, h: 88 }),
    card(t, type, { ...c.developer, layout: 'stack', x: 40, y: 392, w: 128, h: 112 }),
    card(t, type, { ...c.browser, layout: 'stack', x: 224, y: 392, w: 204, h: 112 }),
    card(t, type, { ...c.server, layout: 'stack', x: 512, y: 392, w: 200, h: 112 }),
    label(t, type, 608, 332, 'proxy'),
    label(t, type, 736, 300, 'read'),
    label(t, type, 196, 448, 'uses'),
    label(t, type, 470, 448, 'page, code'),
  ];
  return svg({ ...size, ...WHO }, body.join('\n'));
}

function whoPhone(t) {
  const type = TYPE.phone;
  const c = WHO_CARDS;
  const size = { width: 360, height: 1088 };
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 20, 40, WHO.title, ['The platform renders and serves;', 'the SDK runs on your side.']),
    group(t, type, { x: 12, y: 616, w: 336, h: 452, labelAt: 'bottom', ...SDK_GROUP }),
    arrow(t, [[96, 216], [96, 248]]),
    arrow(t, [[264, 216], [264, 248]]),
    arrow(t, [[96, 376], [96, 408]]),
    arrow(t, [[264, 376], [264, 408]]),
    arrow(t, [[96, 560], [96, 640]]),
    arrow(t, [[264, 560], [264, 640]]),
    arrow(t, [[180, 736], [180, 792]]),
    arrow(t, [[180, 944], [180, 888]]),
    card(t, type, { ...c.author, layout: 'stack', x: 20, y: 112, w: 152, h: 104 }),
    card(t, type, { ...c.blockAuthor, layout: 'stack', x: 188, y: 112, w: 152, h: 104 }),
    card(t, type, { ...c.platform, x: 20, y: 248, w: 320, h: 128 }),
    card(t, type, {
      ...c.pageHtml, layout: 'stack', x: 20, y: 408, w: 152, h: 152,
      lines: [mono('<path>.plain.html'), mono('X-Code-Release:'), mono('cd_…')],
    }),
    card(t, type, {
      ...c.codeRelease, layout: 'stack', x: 188, y: 408, w: 152, h: 152, title: 'Code release',
      lines: [mono('cd_…'), mono('components/,'), mono('scripts/,'), mono('styles/, …')],
    }),
    card(t, type, { ...c.server, x: 28, y: 640, w: 304, h: 96 }),
    card(t, type, { ...c.browser, x: 28, y: 792, w: 304, h: 96 }),
    card(t, type, { ...c.developer, x: 28, y: 944, w: 304, h: 72 }),
    label(t, type, 96, 596, 'read'),
    label(t, type, 264, 596, 'proxy'),
    label(t, type, 180, 764, 'page, code'),
    label(t, type, 180, 916, 'uses'),
  ];
  return svg({ ...size, ...WHO }, body.join('\n'));
}

// ---------- From a commit to live code ----------

const FLOW = {
  title: 'From a commit to live code',
  desc: 'A commit pushed to a branch gives a branch preview with that branch\'s code and the preview content. '
    + 'A commit merged to main goes through site-check and becomes code release cd_N; the preview is rebuilt with it; '
    + 'the release, automatic or manual, then takes it live.',
};

const FLOW_CARDS = {
  commit: { icon: 'commit', tone: 'amber', title: 'Commit' },
  push: { icon: 'branch', title: 'Push a branch' },
  branchPreview: { icon: 'browser', title: 'Branch preview', lines: ['that branch\'s code, the preview content'] },
  merge: { icon: 'merge', title: 'Merge to main' },
  siteCheck: { icon: 'shieldCheck', title: 'site-check' },
  codeRelease: { icon: 'package', tone: 'violet', accent: true, title: 'Code release', lines: [mono('cd_N')] },
  rebuilt: { icon: 'refresh', title: 'Preview rebuilt', lines: [{ segs: ['with ', mono('cd_N')] }] },
  release: { icon: 'rocket', title: 'Release' },
  live: { icon: 'live', tone: 'amber', accent: true, title: 'Live' },
};

const FLOW_SUBTITLE = 'New code reaches live only through the preview, where every page is rebuilt with it first.';

function flowWide(t) {
  const type = TYPE.desktop;
  const c = FLOW_CARDS;
  const size = { width: 760, height: 536 };
  const stack = (spec, x, y, w) => card(t, type, { ...spec, layout: 'stack', x, y, w, h: 104 });
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 32, 48, FLOW.title, [FLOW_SUBTITLE]),
    arrow(t, [[168, 164], [208, 164]]),
    arrow(t, [[360, 164], [400, 164]]),
    arrow(t, [[100, 216], [100, 308], [208, 308]]),
    arrow(t, [[360, 308], [400, 308]]),
    arrow(t, [[544, 308], [576, 308]]),
    arrow(t, [[652, 360], [652, 400]]),
    arrow(t, [[576, 452], [360, 452]]),
    arrow(t, [[208, 452], [168, 452]]),
    stack(c.commit, 32, 112, 136),
    stack(c.push, 208, 112, 152),
    stack(c.branchPreview, 400, 112, 328),
    stack(c.merge, 208, 256, 152),
    stack(c.siteCheck, 400, 256, 144),
    stack(c.codeRelease, 576, 256, 152),
    stack(c.live, 32, 400, 136),
    stack(c.release, 208, 400, 152),
    stack(c.rebuilt, 576, 400, 152),
    label(t, type, 472, 452, 'auto or manual'),
  ];
  return svg({ ...size, ...FLOW }, body.join('\n'));
}

function flowPhone(t) {
  const type = TYPE.phone;
  const c = FLOW_CARDS;
  const size = { width: 360, height: 1008 };
  const stack = (spec, x, y, h) => card(t, type, { ...spec, layout: 'stack', x, y, w: 152, h });
  const row = (spec, y) => card(t, type, { ...spec, layout: 'row', x: 20, y, w: 320, h: 64 });
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 20, 40, FLOW.title, [
      'New code reaches live only through', 'the preview, where every page is', 'rebuilt with it first.',
    ]),
    arrow(t, [[96, 192], [96, 232]]),
    arrow(t, [[264, 192], [264, 232]]),
    arrow(t, [[96, 328], [96, 368]]),
    arrow(t, [[264, 328], [264, 368]]),
    arrow(t, [[264, 464], [264, 504]]),
    arrow(t, [[264, 608], [264, 648]]),
    arrow(t, [[264, 752], [264, 816]]),
    arrow(t, [[180, 880], [180, 920]]),
    row(c.commit, 128),
    stack(c.push, 20, 232, 96),
    stack(c.merge, 188, 232, 96),
    stack({ ...c.branchPreview, lines: ['that branch\'s', 'code, the preview', 'content'] }, 20, 368, 136),
    stack(c.siteCheck, 188, 368, 96),
    stack(c.codeRelease, 188, 504, 104),
    stack(c.rebuilt, 188, 648, 104),
    row(c.release, 816),
    row(c.live, 920),
    label(t, type, 264, 784, 'auto or manual'),
  ];
  return svg({ ...size, ...FLOW }, body.join('\n'));
}

// ---------- Embedding: envelope, prepare, mount ----------

const EMBED = {
  title: 'Embedding: envelope, prepare, mount',
  desc: 'The browser opens /pages/x in your app. Your app\'s server reads /x.plain.html from the Foliwake origin '
    + 'with the credential and caches what it answered as the envelope. On every request preparePage checks and '
    + 'rewrites the body and returns FoliwakePageData. The browser renders the body with FoliwakePage, imports the '
    + 'blocks module through your app\'s code proxy, which fetches the immutable code release from the origin, and '
    + 'calls mountBlocks; blocks send events to your app.',
};

const LANES = {
  browser: { label: 'Browser', iconName: 'browser', tone: 'slate' },
  server: { label: 'Your app\'s server', iconName: 'server', tone: 'teal' },
  origin: { label: 'Foliwake origin', iconName: 'cloud', tone: 'violet' },
};

const EMBED_CARDS = {
  open: { icon: 'browser', tone: 'slate', title: 'Open a page', lines: [mono('/pages/x')] },
  envelope: {
    icon: 'envelope', tone: 'teal', title: 'Envelope (cached)',
    lines: ['body,', mono('X-Code-Release,'), 'language, ETag'],
  },
  page: { icon: 'document', tone: 'violet', title: 'Page', lines: [mono('/x.plain.html')] },
  prepare: {
    icon: 'wand', tone: 'teal', title: 'preparePage', titleMono: true,
    lines: ['check, rewrite, transform,', 'check again, per request', mono('→ FoliwakePageData')],
  },
  render: {
    icon: 'layout', tone: 'slate', title: '<FoliwakePage page>', titleMono: true, lines: ['renders the body first'],
  },
  importModule: {
    icon: 'download', tone: 'slate', title: 'Import the blocks module',
    lines: [mono('/foliwake-code/cd_A/'), mono('scripts/blocks.js')],
  },
  proxy: { icon: 'proxy', tone: 'teal', title: 'Code proxy', lines: [mono('/foliwake-code')] },
  codeRelease: {
    icon: 'package', tone: 'violet', title: 'Code release', lines: [mono('cd_A'), { t: 'immutable', muted: true }],
  },
  mount: {
    icon: 'blocks', tone: 'slate', title: 'mountBlocks(container, host)', titleMono: true,
    lines: ['blocks send events to your app'],
  },
};

const EMBED_NOTE = 'The browser never talks to the origin: no credential reaches it, and your CSP stays ';

function embedWide(t) {
  const type = TYPE.desktop;
  const c = EMBED_CARDS;
  const size = { width: 760, height: 832 };
  const left = (spec, y, h) => card(t, type, { ...spec, layout: 'top', x: 36, y, w: 248, h });
  const middle = (spec, y, h, w = 208) => card(t, type, { ...spec, layout: 'top', x: 316, y, w, h });
  const right = (spec, y, h) => card(t, type, { ...spec, layout: 'stack', x: 576, y, w: 136, h });
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 32, 48, 'Envelope, prepare, mount',
      ['Cache what the origin answered; prepare it on every request; mount blocks in the browser.']),
    group(t, type, { x: 24, y: 104, w: 272, h: 660, ...LANES.browser }),
    group(t, type, { x: 304, y: 104, w: 232, h: 660, ...LANES.server }),
    group(t, type, { x: 552, y: 104, w: 184, h: 660, ...LANES.origin }),
    arrow(t, [[284, 220], [316, 220]]),
    arrow(t, [[484, 220], [576, 220]]),
    arrow(t, [[392, 284], [392, 324]]),
    arrow(t, [[316, 388], [284, 388]]),
    arrow(t, [[160, 452], [160, 492]]),
    arrow(t, [[284, 548], [316, 548]]),
    arrow(t, [[524, 548], [576, 548]]),
    arrow(t, [[160, 604], [160, 644]]),
    left(c.open, 156, 128),
    middle(c.envelope, 156, 128, 168),
    right(c.page, 156, 128),
    left(c.render, 324, 128),
    middle(c.prepare, 324, 128),
    left(c.importModule, 492, 112),
    middle(c.proxy, 492, 112),
    right(c.codeRelease, 492, 112),
    left(c.mount, 644, 96),
    label(t, type, 530, 220, ['with the', 'credential'], { tone: 'amber' }),
    label(t, type, 550, 548, 'proxy'),
    footnote(t, type, 380, 804, [[{ t: EMBED_NOTE }, mono('script-src \'self\''), { t: '.' }]]),
  ];
  return svg({ ...size, ...EMBED }, body.join('\n'));
}

/** The phone layout: one column in the order of the steps, each card tagged with where it runs. */
function embedPhone(t) {
  const type = TYPE.phone;
  const c = EMBED_CARDS;
  const size = { width: 360, height: 1528 };
  const step = (spec, lane, y, h) => card(t, type, {
    ...spec, layout: 'top', tag: lane.label, tone: lane.tone,
    x: lane === LANES.origin ? 112 : 40, y, w: lane === LANES.origin ? 232 : 304, h,
  });
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 20, 40, 'Envelope, prepare, mount', [
      'Cache what the origin answered; prepare', 'it on every request; mount blocks in', 'the browser.',
    ]),
    arrow(t, [[192, 224], [192, 264]]),
    arrow(t, [[228, 376], [228, 440]]),
    arrow(t, [[40, 320], [24, 320], [24, 624], [40, 624]]),
    arrow(t, [[192, 688], [192, 728]]),
    arrow(t, [[192, 824], [192, 864]]),
    arrow(t, [[192, 976], [192, 1016]]),
    arrow(t, [[228, 1112], [228, 1176]]),
    arrow(t, [[40, 920], [24, 920], [24, 1360], [40, 1360]]),
    step(c.open, LANES.browser, 128, 96),
    step({ ...c.envelope, lines: [{ segs: ['body, ', mono('X-Code-Release'), ','] }, 'language, ETag'] },
      LANES.server, 264, 112),
    step(c.page, LANES.origin, 440, 96),
    step(c.prepare, LANES.server, 560, 128),
    step(c.render, LANES.browser, 728, 96),
    step(c.importModule, LANES.browser, 864, 112),
    step(c.proxy, LANES.server, 1016, 96),
    step(c.codeRelease, LANES.origin, 1176, 112),
    step(c.mount, LANES.browser, 1312, 96),
    label(t, type, 228, 408, ['with the credential'], { tone: 'amber', iconName: 'key' }),
    label(t, type, 228, 1144, 'proxy'),
    footnote(t, type, 180, 1468, [
      'The browser never talks to the origin:', 'no credential reaches it, and your',
      [{ t: 'CSP stays ' }, mono('script-src \'self\''), { t: '.' }],
    ]),
  ];
  return svg({ ...size, ...EMBED }, body.join('\n'));
}

// ---------- What you build (Next.js) ----------

const NEXT = {
  title: 'What you build: a Next app between the browser and Foliwake',
  desc: 'The browser talks only to your Next app. On the server, with the credential, the app serves three routes: '
    + '/pages/path reads path.plain.html from Foliwake live or preview and caches it, /foliwake-code proxies the '
    + 'page\'s code release with its blocks, and /foliwake-media proxies pictures.',
};

const ROUTES = [
  { icon: 'document', title: '/pages/<path>', lines: [{ segs: ['reads ', mono('<path>.plain.html'), ' (cached)'] }] },
  { icon: 'code', title: '/foliwake-code/…', lines: ['proxies the page\'s code release (blocks)'] },
  { icon: 'image', title: '/foliwake-media/…', lines: ['proxies pictures'] },
];
const NEXT_BROWSER = { icon: 'browser', title: 'Browser', lines: ['your app\'s pages'] };
const NEXT_FOLIWAKE = { icon: 'cloud', tone: 'violet', accent: true, title: 'Foliwake', lines: ['live / preview'] };
const NEXT_GROUP = { label: 'Your Next app (server)', iconName: 'server', tone: 'teal' };
const NEXT_NOTE = 'The browser never talks to Foliwake, and no credential reaches it.';

function nextWide(t) {
  const type = TYPE.desktop;
  const size = { width: 760, height: 488 };
  const route = (spec, y) => card(t, type, { ...spec, tone: 'teal', titleMono: true, x: 216, y, w: 336, h: 72 });
  const hub = (spec, x, w) => card(t, type, { ...spec, layout: 'stack', iconSize: 40, x, y: 136, w, h: 256 });
  const rows = [188, 276, 364];
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 32, 48, 'What you build', ['Your Next app reads and proxies on its server, with the credential.']),
    group(t, type, { x: 200, y: 104, w: 368, h: 312, ...NEXT_GROUP }),
    ...rows.map((y) => arrow(t, [[160, y], [216, y]])),
    ...rows.map((y) => arrow(t, [[552, y], [608, y]])),
    hub(NEXT_BROWSER, 32, 128),
    ...ROUTES.map((spec, i) => route(spec, rows[i] - 36)),
    hub(NEXT_FOLIWAKE, 608, 120),
    footnote(t, type, 380, 456, [NEXT_NOTE]),
  ];
  return svg({ ...size, ...NEXT }, body.join('\n'));
}

function nextPhone(t) {
  const type = TYPE.phone;
  const size = { width: 360, height: 744 };
  const rows = [264, 360, 456];
  const route = (spec, y) => card(t, type, { ...spec, tone: 'teal', titleMono: true, x: 46, y, w: 268, h: 80 });
  const row = (spec, y) => card(t, type, { ...spec, layout: 'row', x: 20, y, w: 320, h: 64 });
  const routes = [ROUTES[0], { ...ROUTES[1], lines: ['proxies the page\'s code', 'release (blocks)'] }, ROUTES[2]];
  const body = [
    defs(t, size.width, size.height),
    heading(t, type, 20, 40, 'What you build', [
      'Your Next app reads and proxies on', 'its server, with the credential.',
    ]),
    group(t, type, { x: 12, y: 200, w: 336, h: 352, labelAt: 'bottom', ...NEXT_GROUP }),
    ...rows.map((y) => arrow(t, [[30, 176], [30, y], [46, y]])),
    ...rows.map((y) => arrow(t, [[314, y], [330, y], [330, 592]])),
    row(NEXT_BROWSER, 112),
    ...routes.map((spec, i) => route(spec, rows[i] - 40)),
    row(NEXT_FOLIWAKE, 592),
    footnote(t, type, 180, 696, ['The browser never talks to Foliwake,', 'and no credential reaches it.']),
  ];
  return svg({ ...size, ...NEXT }, body.join('\n'));
}

// ---------- writing the files ----------

const DIAGRAMS = {
  'who-does-what': { wide: whoWide, phone: whoPhone },
  'release-flow': { wide: flowWide, phone: flowPhone },
  embedding: { wide: embedWide, phone: embedPhone },
  'next-app': { wide: nextWide, phone: nextPhone },
};

/** The file name of one version: `embedding.svg`, `embedding-dark.svg`, `embedding-phone-dark.svg`. */
export function fileName(name, layout, theme) {
  const parts = [name, layout === 'phone' ? 'phone' : '', theme === 'dark' ? 'dark' : ''];
  return `${parts.filter(Boolean).join('-')}.svg`;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  for (const [name, layouts] of Object.entries(DIAGRAMS)) {
    for (const [layout, draw] of Object.entries(layouts)) {
      for (const theme of Object.values(THEMES)) {
        const file = fileName(name, layout, theme.name);
        console.log(file);
        writeFileSync(path.join(OUT, file), draw(theme));
      }
    }
  }
}

main();
